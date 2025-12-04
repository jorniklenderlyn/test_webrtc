from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from typing import Dict, Optional
import uuid
import json
import os

app = FastAPI()

class ConnectionManager:
    def __init__(self):
        # Store active connections: {user_id: websocket}
        self.active_connections: Dict[str, WebSocket] = {}
        # Store call pairs: {caller_id: callee_id, callee_id: caller_id}
        self.call_pairs: Dict[str, str] = {}
        # Store pending offers: {user_id: offer_data}
        self.pending_offers: Dict[str, dict] = {}

    async def connect(self, websocket: WebSocket) -> str:
        await websocket.accept()
        user_id = str(uuid.uuid4())
        self.active_connections[user_id] = websocket
        print(f"User connected: {user_id}")
        return user_id

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        if user_id in self.call_pairs:
            partner_id = self.call_pairs[user_id]
            del self.call_pairs[user_id]
            if partner_id in self.call_pairs:
                del self.call_pairs[partner_id]
        if user_id in self.pending_offers:
            del self.pending_offers[user_id]
        print(f"User disconnected: {user_id}")

    async def send_message(self, user_id: str, message: dict):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
            except WebSocketDisconnect:
                self.disconnect(user_id)

    async def broadcast_users_list(self):
        users_list = {
            "type": "users_list",
            "users": list(self.active_connections.keys())
        }
        for user_id in self.active_connections:
            await self.send_message(user_id, users_list)

    async def handle_signaling(self, sender_id: str, message: dict):
        msg_type = message.get("type")

        if msg_type == "incoming_call":
            target_id = message.get("target")
            print(target_id, self.active_connections)
            if target_id in self.active_connections:
                await self.send_message(target_id, {
                    "type": "incoming_call",
                    "caller": sender_id
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
            if sender_id in self.pending_offers:
                offer_data = self.pending_offers[sender_id]
                caller_id = offer_data["sender"]
                await self.send_message(caller_id, {
                    "type": "call_rejected",
                    "callee": sender_id
                })
                del self.pending_offers[sender_id]
        
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

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    user_id = None
    try:
        user_id = await manager.connect(websocket)
        
        # Send initial users list to the new user
        await manager.send_message(user_id, {
            "type": "self_id",
            "user_id": user_id
        })
        await manager.broadcast_users_list()
        
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
            manager.disconnect(user_id)
            await manager.broadcast_users_list()
    except Exception as e:
        print(f"WebSocket error: {e}")
        if user_id:
            manager.disconnect(user_id)
            await manager.broadcast_users_list()

@app.get("/")
async def get():
    return {
        "message": "WebRTC Signaling Server",
        "websocket_endpoint": "/ws",
        "instructions": "Connect to WebSocket endpoint to start signaling"
    }

app.mount("/static", StaticFiles(directory="static"))

@app.get("/app")
async def index():
    return FileResponse(path='static/index.html')

if __name__ == "__main__":
    import uvicorn

    cert_dir = os.path.join(os.getcwd(), 'certs')
    cert_path = os.path.join(cert_dir, 'cert.pem')
    key_path = os.path.join(cert_dir, 'key.pem')
    uvicorn.run(app, host="0.0.0.0", port=8001, ssl_certfile=cert_path, ssl_keyfile=key_path)