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
class SignalManager {
    constructor() {
        this.ws = null;
        this.peerConnection = null;
        this.localVideo = document.getElementById('video1');
        this.remoteVideo = document.getElementById('video2');
        this.userId = null;
        this.currentCallTarget = null;
        this.callerModal = null;
        this.calleeModal = null;
        this.calleeList = null;
    }

    async connect(url) {
        this.ws = new WebSocket(url);
        
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
                this.onUsersList(message.users);
                break;
                
            case 'incoming_call':
                this.onIncomingCall(message);
                break;
                
            case 'cancel_call':
                this.onCancelCall(message);
                break

            case 'offer':
                this.onOffer(message);
                break;
                
            case 'answer':
                this.onAnswer(message);
                break;
                
            case 'ice_candidate':
                this.onIceCandidate(message);
                break;
                
            case 'call_rejected':
                this.onReject(message);
                break;
            
            case 'user_joined':
                this.onUserJoined(message);
                break;
            
            case 'user_left':
                this.onUserLeft(message);
                break;
                
            case 'call_ended':
                // alert('Call ended by ' + message.sender);
                switchToScene('start-screen');
                this.cleanup();
                break;
            case 'error':
                console.warn(message)
                switchToScene('start-screen');
                this.cleanup();
        }
    }

    async setupPeerConnection(targetId) {
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

        this.peerConnection.onconnectionstatechange = event => {
            if (this.peerConnection.connectionState === "connected") {
                if (this.callerModal) {
                    this.callerModal.close();
                    this.callerModal = null;
                }
                if (this.calleeModal) {
                    this.calleeModal.close();
                    this.calleeModal = null;
                }
                switchToScene('call-screen');
            }
        }

        // Handle remote stream
        this.peerConnection.ontrack = event => {
            this.remoteVideo.srcObject = event.streams[0];
        };
    }

    async callUser(targetId) {
        console.log('initiate call')
        this.currentCallTarget = targetId;
        await this.setupPeerConnection(targetId);

        this.sendSignaling({
            type: "incoming_call",
            target: targetId
        })
    }

    async onIncomingCall(message) {
        this.currentCallTarget = message.user.id;
        this.calleeModal = new IncomingCallModal(
            `Звонит пользователь: ${message.user.name}`,
            async () => {
                await this._acceptCall(this.currentCallTarget);
            }, 
            () => {
                this.sendSignaling({
                    type: "call_rejected",
                    target: this.currentCallTarget
                })
                console.log(`call rejected for caller: ${this.currentCallTarget}`)
            }
        )
    }

    async _acceptCall(callerId) {
        await this.setupPeerConnection(callerId);
            
        const offer = await this.peerConnection.createOffer();

        await this.peerConnection.setLocalDescription(offer);

        this.sendSignaling({
            type: 'offer',
            sdp: offer.sdp,
            target: callerId
        })

        console.log('send offer');
    }

    async onCancelCall(message) {
        this.calleeModal.close();
    }

    async onOffer(message) {
        const sdp = message.sdp;
        const senderId = message.sender;

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

    async onAnswer(message) {
        const sdp = message.sdp;
        console.log('recived answer')
        const answer = new RTCSessionDescription({type: "answer", sdp: sdp});
        await this.peerConnection.setRemoteDescription(answer);
    }

    onIceCandidate(message) {
        const candidate = new RTCIceCandidate(message.candidate);
        this.peerConnection.addIceCandidate(candidate);
    }

    onUserJoined(message) {
        this.calleeList.addUser(message.user);
    }

    onUserLeft(message) {
        console.log(message.user_id, this.currentCallTarget)
        if (message.user_id === this.currentCallTarget) {
            this.cleanup();
        }
        this.calleeList.removeUser(message.user_id);
    }

    onReject(message) {
        this.cleanup();
        if (this.callerModal) {
            this.callerModal.close();
        }
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
        if (this.callerModal) {
            this.callerModal.close();
            this.callerModal = null;
        }
        if (this.calleeModal) {
            this.calleeModal.close();
            this.calleeModal = null;
        }
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.localVideo && this.localVideo.srcObject) {
            this.localVideo.srcObject.getTracks().forEach(track => track.stop());
            this.localVideo.srcObject = null;
        }
        
        if (this.remoteVideo && this.remoteVideo.srcObject) {
            this.remoteVideo.srcObject.getTracks().forEach(track => track.stop());
            this.remoteVideo.srcObject = null;
        }
        
        this.currentCallTarget = null;
    }

    onUsersList(users) {
        this.calleeList.render(users.filter((user) => user.id !== this.userId));
        console.log(users);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { signalManager };
}

// Initialize when DOM is loaded
// document.addEventListener('DOMContentLoaded', () => {
//     const signaling = new signalManager();
//     signaling.connect();
    
//     document.getElementById('endCallBtn').onclick = () => signaling.endCall();
// });