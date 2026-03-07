import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


app = FastAPI(title="WebRTC Signaling Server")

allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@dataclass
class User:
    id: str
    name: str
    websocket: WebSocket

    def to_dict(self) -> Dict[str, str]:
        return {
            "id": self.id,
            "name": self.name,
        }


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[str, User] = {}
        self.call_pairs: Dict[str, str] = {}

    async def connect(self, websocket: WebSocket, user_id: Optional[str], username: str) -> str:
        await websocket.accept()

        safe_user_id = (user_id or "").strip().strip('"\'')
        if not safe_user_id:
            safe_user_id = str(uuid.uuid4())

        final_user_id = safe_user_id
        if final_user_id in self.active_connections:
            suffix = str(uuid.uuid4())[:8]
            final_user_id = f"{safe_user_id}-{suffix}"

        user = User(id=final_user_id, name=username, websocket=websocket)
        self.active_connections[final_user_id] = user

        await self._broadcast(
            {
                "type": "user_joined",
                "user": user.to_dict(),
            },
            skip_user_id=final_user_id,
        )

        return final_user_id

    async def disconnect(self, user_id: str) -> None:
        if user_id not in self.active_connections:
            return

        del self.active_connections[user_id]

        if user_id in self.call_pairs:
            partner_id = self.call_pairs.pop(user_id)
            if self.call_pairs.get(partner_id) == user_id:
                del self.call_pairs[partner_id]
            await self.send_message(
                partner_id,
                {
                    "type": "call_ended",
                    "sender": user_id,
                },
            )

        await self._broadcast(
            {
                "type": "user_left",
                "user_id": user_id,
            }
        )

    async def send_message(self, user_id: str, message: Dict[str, Any]) -> None:
        if user_id not in self.active_connections:
            return
        try:
            await self.active_connections[user_id].websocket.send_json(message)
        except WebSocketDisconnect:
            await self.disconnect(user_id)

    async def _broadcast(self, message: Dict[str, Any], skip_user_id: Optional[str] = None) -> None:
        recipients = [uid for uid in self.active_connections if uid != skip_user_id]
        for uid in recipients:
            await self.send_message(uid, message)

    async def broadcast_users_list(self) -> None:
        users = [u.to_dict() for u in self.active_connections.values()]
        await self._broadcast(
            {
                "type": "users_list",
                "users": users,
            }
        )

    async def handle_signaling(self, sender_id: str, message: Dict[str, Any]) -> None:
        msg_type = message.get("type")

        if msg_type == "ping":
            await self.send_message(sender_id, {"type": "pong", "ts": int(time.time())})
            return

        if msg_type == "change-name":
            new_name = (message.get("name") or "").strip()
            if not new_name:
                await self.send_message(sender_id, {"type": "error", "message": "name is required"})
                return
            self.active_connections[sender_id].name = new_name
            await self.broadcast_users_list()
            return

        if msg_type == "chat_message":
            target_id = message.get("target")
            payload = {
                "type": "chat_message",
                "sender": sender_id,
                "message": message.get("message", ""),
                "meta": message.get("meta", {}),
                "ts": int(time.time() * 1000),
            }
            if target_id:
                await self.send_message(target_id, payload)
            else:
                await self._broadcast(payload, skip_user_id=sender_id)
            return

        if msg_type == "signal":
            target_id = message.get("target") or message.get("to")
            data = message.get("data")
            if not target_id or data is None:
                await self.send_message(sender_id, {"type": "error", "message": "signal.target and signal.data are required"})
                return
            await self.send_message(
                target_id,
                {
                    "type": "signal",
                    "sender": sender_id,
                    "data": data,
                },
            )
            return

        if msg_type == "incoming_call":
            target_id = message.get("target")
            if target_id in self.active_connections:
                await self.send_message(
                    target_id,
                    {
                        "type": "incoming_call",
                        "user": self.active_connections[sender_id].to_dict(),
                    },
                )
            else:
                await self.send_message(sender_id, {"type": "error", "message": "target not active"})
            return

        if msg_type == "cancel_call":
            target_id = message.get("target")
            if target_id in self.active_connections:
                await self.send_message(target_id, {"type": "cancel_call", "callee": sender_id})
            return

        if msg_type == "offer":
            target_id = message.get("target")
            sdp = message.get("sdp")
            if target_id in self.active_connections and sdp:
                await self.send_message(
                    target_id,
                    {
                        "type": "offer",
                        "sdp": sdp,
                        "sender": sender_id,
                    },
                )
                self.call_pairs[sender_id] = target_id
                self.call_pairs[target_id] = sender_id
            else:
                await self.send_message(sender_id, {"type": "error", "message": "invalid offer payload"})
            return

        if msg_type == "answer":
            target_id = message.get("target")
            if target_id in self.active_connections:
                await self.send_message(
                    target_id,
                    {
                        "type": "answer",
                        "sdp": message.get("sdp"),
                        "callee": sender_id,
                    },
                )
            return

        if msg_type == "ice_candidate":
            target_id = message.get("target") or self.call_pairs.get(sender_id)
            if target_id:
                await self.send_message(
                    target_id,
                    {
                        "type": "ice_candidate",
                        "candidate": message.get("candidate"),
                        "sender": sender_id,
                    },
                )
            return

        if msg_type == "call_rejected":
            target_id = message.get("target")
            if target_id in self.active_connections:
                await self.send_message(target_id, {"type": "call_rejected", "callee": sender_id})
            return

        if msg_type == "call_ended":
            target_id = self.call_pairs.get(sender_id) or message.get("target")
            if target_id:
                await self.send_message(target_id, {"type": "call_ended", "sender": sender_id})

            if sender_id in self.call_pairs:
                partner = self.call_pairs.pop(sender_id)
                if self.call_pairs.get(partner) == sender_id:
                    del self.call_pairs[partner]
            return

        await self.send_message(sender_id, {"type": "error", "message": f"unknown message type: {msg_type}"})


manager = ConnectionManager()


def _build_turn_ice_servers() -> List[Dict[str, Any]]:
    stun_urls = [u.strip() for u in os.getenv("STUN_URLS", "stun:stun.l.google.com:19302").split(",") if u.strip()]

    turn_urls = [u.strip() for u in os.getenv("TURN_URLS", "").split(",") if u.strip()]
    turn_username = os.getenv("TURN_USERNAME", "")
    turn_credential = os.getenv("TURN_CREDENTIAL", "")

    use_rest_auth = os.getenv("TURN_USE_REST_AUTH", "false").lower() == "true"
    turn_secret = os.getenv("TURN_SECRET", "")
    turn_realm = os.getenv("TURN_REALM", "example.com")
    turn_ttl = int(os.getenv("TURN_TTL_SECONDS", "86400"))

    servers: List[Dict[str, Any]] = [{"urls": url} for url in stun_urls]

    if not turn_urls:
        return servers

    if use_rest_auth and turn_secret:
        expires = int(time.time()) + turn_ttl
        username = f"{expires}:webrtc"
        digest = hmac.new(turn_secret.encode("utf-8"), username.encode("utf-8"), hashlib.sha1).digest()
        credential = base64.b64encode(digest).decode("utf-8")
        servers.append(
            {
                "urls": turn_urls,
                "username": username,
                "credential": credential,
                "realm": turn_realm,
            }
        )
    elif turn_username and turn_credential:
        servers.append(
            {
                "urls": turn_urls,
                "username": turn_username,
                "credential": turn_credential,
            }
        )

    return servers


@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    username: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
) -> None:
    session_user_id: Optional[str] = None

    try:
        name = (username or "").strip().strip('"\'') or f"guest-{uuid.uuid4().hex[:6]}"
        session_user_id = await manager.connect(websocket, user_id=user_id, username=name)

        await manager.send_message(
            session_user_id,
            {
                "type": "self_id",
                "user_id": session_user_id,
            },
        )

        await manager.send_message(
            session_user_id,
            {
                "type": "users_list",
                "users": [u.to_dict() for u in manager.active_connections.values()],
            },
        )

        while True:
            raw_data = await websocket.receive_text()
            try:
                message = json.loads(raw_data)
            except json.JSONDecodeError:
                await manager.send_message(session_user_id, {"type": "error", "message": "Invalid JSON"})
                continue

            await manager.handle_signaling(session_user_id, message)

    except WebSocketDisconnect:
        if session_user_id:
            await manager.disconnect(session_user_id)
    except Exception as exc:
        print(f"WebSocket error for user {session_user_id}: {exc}")
        if session_user_id:
            await manager.disconnect(session_user_id)


@app.get("/")
async def health() -> Dict[str, Any]:
    return {
        "message": "WebRTC signaling server is running",
        "websocket_endpoint": "/ws?username=<name>&user_id=<optional-id>",
        "ice_config_endpoint": "/ice-config",
    }


@app.get("/ice-config")
async def get_ice_config() -> Dict[str, Any]:
    return {
        "iceServers": _build_turn_ice_servers(),
        "iceTransportPolicy": os.getenv("ICE_TRANSPORT_POLICY", "all"),
    }


app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/app")
async def index() -> FileResponse:
    return FileResponse(path="static/scene.html")
