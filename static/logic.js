const signaling = new SignalManager();

const video1 = document.getElementById('video1')
const video2 = document.getElementById('video2')
const userNameInput = document.getElementById('user-name');
const saveNameBtn = document.getElementById('save-name');
const userNameValidation = document.getElementById('username-validation');

let userName = '';

function loadUserName() {
    const savedName = CookieManager.getCookie('userName');
    if (savedName) {
        userNameInput.value = savedName;
        userName = savedName;
    } else {
        // Set default if no cookie exists
        userName = "Guest User";
        userNameInput.value = userName;
        // Save the default name
        CookieManager.setCookie('userName', userName);
    }
}

function saveUserName(name) {
    if (userName === name) {
        return
    }

    if (!name || name.trim() === '') {
        throw new Error('необходимо указать имя')
    }

    if (name.length < 4 || name.length > 16) {
        throw new Error('имя должно быть от 4 до 16 символов')
    }
    
    userName = name;
    CookieManager.setCookie('userName', name, 360);
    
    // Update display in call screen if in call
    // if (appState.isInCall) {
    //     currentParticipantName.textContent = `${appState.currentUser} - ${appState.currentCall.name}`;
    // }
    
    // Show save indicator
    // showSaveIndicator();

    userNameValidation.style.display = 'none';

    signaling.sendSignaling({
        type: "change-name",
        name: userName
    });
    
    // Show toast notification
    // Toast.show("Name saved!");
}

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            // video: {width: 1280, height: 720}, 
            video: true,
            audio: true}
        );
        video1.srcObject = stream;
        video2.srcObject = stream;
    } catch (err) {
        console.log(err);
    }
}

// function switchToScene(sceneId) {
//     document.querySelectorAll
// }

document.addEventListener('DOMContentLoaded', function() {
    const endCallButton = document.getElementById('end-btn');
    const fullscreenButtons = document.querySelectorAll('.fullscreen-btn');
    
    fullscreenButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            const containerClass = this.getAttribute('data-container');
            const container = document.querySelector(`.${containerClass}`);
            const isExpanded = container.classList.contains('expanded');

            // Collapse all videos
            document.querySelectorAll('.video-area').forEach(el => {
                el.classList.remove('expanded');
                el.querySelector('.fullscreen-btn').classList.remove('fullscreen');
            });

            // Expand clicked video if not already expanded
            if (!isExpanded) {
                container.classList.add('expanded');
                this.classList.add('fullscreen');
            }
        });
    });

    saveNameBtn.onclick = () => {
        try{
            saveUserName(userNameInput.value.trim());
        } catch (err) {
            userNameValidation.innerHTML = `${err.message}`;
            userNameValidation.style.display = 'block';
        }
    }

    endCallButton.addEventListener('click', (e) => {
        signaling.sendSignaling({
            type: "call_ended",
            target: signaling.currentCallTarget
        })
        switchToScene('start-screen')
    })


});

// call to user
const calleeList = new UsersListComponent('callee-list-area');
signaling.calleeList = calleeList;
document.getElementById('callee-list-area').addEventListener('userCallRequested', (event) => {
    const calleeId = event.detail.userId;
    signaling.callUser(calleeId);

    const modal = new CallModal(() => {
        signaling.sendSignaling({
            type: 'cancel_call',
            target: calleeId
        });
        console.log('call canceled')
    })
    signaling.callerModal = modal;
    modal.open();
});

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    // startCamera();
} else {
    console.log('error');
}

function initApp() {
    createSnowflake()
    loadUserName();
    const websocket_url = `wss://${window.location.host}/ws?username="${userName}"`;
    signaling.connect(websocket_url);
}

initApp();


/*
start -> load name -> connect to signaling server -> call to user
*/