const serversConfig = {
    iceServers: [
        // STUN (may fail, but try anyway)
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun.voipbuster.com:3478" },
        { urls: "stun:stun.freeswitch.org:3478" },
        { urls: "stun:stun.miwifi.com:3478" },
        // TURN over TCP on port 443 (fallback that always works)
        {
        urls: [
            "turn:155.212.168.250:3478?transport=tcp",
            "turn:155.212.168.250:3478?transport=udp",
            // "turn:195.133.198.89:3478?transport=udp",
            // "turn:127.0.0.1:443?transport=tcp"
        ],
        username: "test",
        credential: "secret"
        }
    ],
    // iceTransportPolicy: "relay", // ← CRITICAL: ONLY use relay (TURN)
    // sdpSemantics: 'unified-plan'
}

// Simple frontend to demonstrate usage
class WebRTCSignaling {
    constructor() {
        this.ws = null;
        this.peerConnection = null;
        this.localVideo = document.getElementById('localVideo');
        this.remoteVideo = document.getElementById('remoteVideo');
        this.userId = null;
        this.currentCallTarget = null;
    }

    async connect() {
        this.ws = new WebSocket('wss://localhost:80/ws');
        
        this.ws.onopen = () => {
            console.log('Connected to signaling server');
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleSignalingMessage(message);
        };

        this.ws.onclose = () => {
            console.log('Disconnected from signaling server');
            this.cleanup();
        };
    }

    handleSignalingMessage(message) {
        console.log('Received message:', message);
        
        switch(message.type) {
            case 'self_id':
                this.userId = message.user_id;
                console.log('My ID:', this.userId);
                break;
                
            case 'users_list':
                this.updateUsersList(message.users);
                break;
                
            case 'incoming_call':
                this.handleIncomingCall(message.caller);
                break;
                
            case 'offer':
                this.handleOffer(message.sdp, message.sender);
                break;
                
            case 'answer':
                this.handleAnswer(message.sdp);
                break;
                
            case 'ice_candidate':
                this.handleIceCandidate(message.candidate);
                break;
                
            case 'call_rejected':
                alert('Call rejected by ' + message.callee);
                this.cleanup();
                break;
                
            case 'call_ended':
                alert('Call ended by ' + message.sender);
                this.cleanup();
                break;
            case 'error':
                console.warn(message)
        }
    }

    async setupPeerConnection(targetId) {
        // this.peerConnection = new RTCPeerConnection({
            // iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        // });
        this.peerConnection = new RTCPeerConnection(serversConfig)

        // Add local stream
        const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        this.localVideo.srcObject = localStream;
        
        localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, localStream);
        });

        // Handle ICE candidates
        this.peerConnection.onicecandidate = event => {
            if (event.candidate) {
                console.log('seeck ice')
                this.sendSignaling({
                    type: 'ice_candidate',
                    candidate: event.candidate,
                    target: targetId
                });
            }
        };

        // Handle remote stream
        this.peerConnection.ontrack = event => {
            this.remoteVideo.srcObject = event.streams[0];
        };
    }

    async callUser(targetId) {
        console.log('initiate call')
        this.currentCallTarget = targetId;
        await this.setupPeerConnection(targetId);
        
        // const offer = await this.peerConnection.createOffer();
        // await this.peerConnection.setLocalDescription(offer);

        this.sendSignaling({
            type: "incoming_call",
            target: targetId
        })
        
        // this.sendSignaling({
        //     type: 'offer',
        //     offer: offer,
        //     target: targetId
        // });
    }

    async handleIncomingCall(callerId) {
        this.currentCallTarget = callerId;
        const accept = confirm(`Incoming call from ${callerId}. Accept?`);
        
        if (accept) {
            await this.setupPeerConnection(callerId);
            
            // Wait for the offer to be set by the caller
            // this.peerConnection.onnegotiationneeded = async () => {
            //     const offer = await this.peerConnection.createOffer();
            //     await this.peerConnection.setLocalDescription(offer);
            // };
            const offer = await this.peerConnection.createOffer();

            this.sendSignaling({
                type: 'offer',
                sdp: offer.sdp,
                target: callerId
            })

            await this.peerConnection.setLocalDescription(offer);

            console.log('send offer')
        } else {
            this.sendSignaling({
                type: 'call_rejected',
                target: callerId
            });
        }
    }

    async handleOffer(sdp, senderId) {
        // if (!this.peerConnection) {
        //     this.setupPeerConnection(senderId);
        // }
        const offer = new RTCSessionDescription({type: "offer", sdp: sdp});
        console.log(offer)
        await this.peerConnection.setRemoteDescription(offer);
        
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        
        this.sendSignaling({
            type: 'answer',
            sdp: answer.sdp,
            target: senderId
        });
        console.log('send answer')
    }

    async handleAnswer(sdp) {
        console.log('recived answer')
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription({type: "answer", sdp: sdp}));
    }

    handleIceCandidate(candidate) {
        this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }

    endCall() {
        if (this.currentCallTarget) {
            this.sendSignaling({
                type: 'call_ended',
                target: this.currentCallTarget
            });
        }
        this.cleanup();
    }

    sendSignaling(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    cleanup() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.localVideo.srcObject) {
            this.localVideo.srcObject.getTracks().forEach(track => track.stop());
            this.localVideo.srcObject = null;
        }
        
        if (this.remoteVideo.srcObject) {
            this.remoteVideo.srcObject.getTracks().forEach(track => track.stop());
            this.remoteVideo.srcObject = null;
        }
        
        this.currentCallTarget = null;
    }

    updateUsersList(users) {
        const usersList = document.getElementById('usersList');
        usersList.innerHTML = '';
        
        users.forEach(userId => {
            if (userId !== this.userId) {
                const userBtn = document.createElement('button');
                userBtn.textContent = `Call ${userId.substring(0, 8)}...`;
                userBtn.onclick = () => this.callUser(userId);
                usersList.appendChild(userBtn);
            }
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const signaling = new WebRTCSignaling();
    signaling.connect();
    
    document.getElementById('endCallBtn').onclick = () => signaling.endCall();
});