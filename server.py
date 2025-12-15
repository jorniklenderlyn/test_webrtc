from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from typing import Dict, Optional
import uuid
import json
import os
from dataclasses import dataclass 
from typing import Dict
import uuid 


app = FastAPI()


@dataclass
class User:
    id: str
    name: str
    websocket: WebSocket

    def to_dict(self) -> dict:
        """Conver user to dictionary for JSON serialization"""
        return {
            "id": self.id,
            "name": self.name,
        }


class ConnectionManager:
    def __init__(self):
        # Store active connections: {user_id: websocket}
        self.active_connections: Dict[str, User] = {}
        # Store call pairs: {caller_id: callee_id, callee_id: caller_id}
        self.call_pairs: Dict[str, str] = {}

    async def connect(self, websocket: WebSocket, username: str) -> str:
        await websocket.accept()
        user_id = str(uuid.uuid4())
        user = User(id=user_id, name=username, websocket=websocket)
        self.active_connections[user_id] = user
        print(f"User connected: {user_id} ({username})")

        join_message = {
            "type": "user_joined",
            "user": user.to_dict()
        }

        for uid in self.active_connections:
            if uid != user_id:  # Don't send to self
                await self.send_message(uid, join_message)

        return user_id

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        if user_id in self.call_pairs:
            partner_id = self.call_pairs[user_id]
            del self.call_pairs[user_id]
            if partner_id in self.call_pairs:
                del self.call_pairs[partner_id]
            if partner_id in self.active_connections:
                message = {
                    "type": "call_ended",
                    "sender": user_id
                }
                self.send_message(partner_id, message)
        
        print(f"User disconnected: {user_id}")

        leave_message = {
            "type": "user_left",
            "user_id": user_id
        }

        return leave_message
        
    async def send_message(self, user_id: str, message: dict):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].websocket.send_json(message)
            except WebSocketDisconnect:
                self.disconnect(user_id)

    async def broadcast_users_list(self):
        users_list = {
            "type": "users_list",
            "users": [self.active_connections[user_id].to_dict() for user_id in self.active_connections]
        }
        for user_id in self.active_connections:
            await self.send_message(user_id, users_list)

    async def handle_signaling(self, sender_id: str, message: dict):
        # print(message["type"], [k for k in message])
        msg_type = message.get("type")

        if msg_type == "incoming_call":
            target_id = message.get("target")
            if target_id in self.active_connections:
                await self.send_message(target_id, {
                    "type": "incoming_call",
                    "user": self.active_connections[sender_id].to_dict()
                })
            else:
                await self.send_message(target_id, {
                    "type": "error",
                    "message": "target not active"
                })
        
        if msg_type == "cancel_call":
            target_id = message.get("target")
            if target_id in self.active_connections:
                await self.send_message(target_id, {
                    "type": "cancel_call",
                    "callee": sender_id
                })
        
        if msg_type == "offer":
            # Store the offer and notify the receiver
            target_id = message.get("target")
            sdp = message.get("sdp")
            if target_id in self.active_connections and sdp:
                await self.send_message(target_id, {
                    "type": "offer",
                    "sdp": sdp,
                    "sender": sender_id
                })
                self.call_pairs[sender_id] = target_id
                self.call_pairs[target_id] = sender_id
            else:
                await self.send_message(sender_id, {
                    "type": "error",
                    "details": f"target_id: {target_id}, sdp: {sdp}"
                })
        
        elif msg_type == "answer":
            # Send answer to the original caller
            target_id = message.get('target')
            if target_id in self.active_connections:
                await self.send_message(target_id, {
                    "type": "answer",
                    "sdp": message.get("sdp"),
                    "callee": sender_id
                })
            # Create call pair
            # self.call_pairs[caller_id] = sender_id
            # self.call_pairs[sender_id] = caller_id
        
        elif msg_type == "ice_candidate":
            # Forward ICE candidate to the partner
            if sender_id in self.call_pairs:
                partner_id = self.call_pairs[sender_id]
                await self.send_message(partner_id, {
                    "type": "ice_candidate",
                    "candidate": message.get("candidate"),
                    "sender": sender_id
                })
        
        elif msg_type == "call_rejected":
            # Handle call rejection
            target_id = message.get("target")
            if target_id in self.active_connections:
                await self.send_message(target_id, {
                    "type": "call_rejected",
                    "callee": sender_id
                })
        
        elif msg_type == "call_ended":
            # Handle call end
            if sender_id in self.call_pairs:
                partner_id = self.call_pairs[sender_id]
                await self.send_message(partner_id, {
                    "type": "call_ended",
                    "sender": sender_id
                })
                del self.call_pairs[sender_id]
                if partner_id in self.call_pairs:
                    del self.call_pairs[partner_id]
        
        elif  msg_type == "change-name":
            print(message)
            if sender_id in self.active_connections:
                if 'name' not in message:
                    raise ValueError('добавьте поле "name"')
                self.active_connections[sender_id].name = message['name']
                await self.broadcast_users_list()

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    user_id = None
    try:
        if 'username' not in websocket.query_params:
            raise ValueError('необходимо указать имя пользователя ("name" query param required)')
        
        username = websocket.query_params['username'].strip('"\'')

        user_id = await manager.connect(websocket, username)
        
        # Send initial users list to the new user
        await manager.send_message(user_id, {
            "type": "self_id",
            "user_id": user_id
        })
        # await manager.broadcast_users_list()
        users_list = {
            "type": "users_list",
            "users": [manager.active_connections[user_id].to_dict() for user_id in manager.active_connections]
        }
        await manager.send_message(user_id, users_list)
        
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                await manager.handle_signaling(user_id, message)
            except json.JSONDecodeError:
                print(f"Invalid JSON received from user {user_id}")
            except Exception as e:
                print(f"Error processing message: {e}")
    
    except WebSocketDisconnect:
        if user_id:
            leave_msg = manager.disconnect(user_id)  # Now returns leave message
            if leave_msg:
                # Broadcast "user_left" to all remaining users
                for uid in manager.active_connections:
                    await manager.send_message(uid, leave_msg)
                # Also update the full list for consistency
                # await manager.broadcast_users_list()
    except Exception as e:
        print(f"WebSocket error: {e}")
        if user_id:
            leave_msg = manager.disconnect(user_id)  # Now returns leave message
            if leave_msg:
                # Broadcast "user_left" to all remaining users
                for uid in manager.active_connections:
                    await manager.send_message(uid, leave_msg)
                # Also update the full list for consistency
                # await manager.broadcast_users_list()

@app.get("/")
async def get():
    return {
        "message": "WebRTC Signaling Server",
        "websocket_endpoint": "/ws",
        "instructions": "Connect to WebSocket endpoint to start signaling"
    }

app.mount("/static", StaticFiles(directory="static"))

# @app.get("/app")
# async def index():
#     return FileResponse(path='static/index.html')

@app.get("/app")
async def index():
    return FileResponse(path='static/scene.html')

if __name__ == "__main__":
    import uvicorn

    cert_dir = os.path.join(os.getcwd(), 'certs')
    cert_path = os.path.join(cert_dir, 'cert.pem')
    key_path = os.path.join(cert_dir, 'key.pem')
    uvicorn.run(app, host="0.0.0.0", port=8001, ssl_certfile=cert_path, ssl_keyfile=key_path)