class CookieManager {
    static setCookie(name, value, days = 365) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        const expires = "expires=" + date.toUTCString();
        document.cookie = `${name}=${encodeURIComponent(value)};${expires};path=/;SameSite=Lax`;
    }

    static getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for(let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') {
                c = c.substring(1);
            }
            if (c.indexOf(nameEQ) === 0) {
                return decodeURIComponent(c.substring(nameEQ.length));
            }
        }
        return null;
    }

    static deleteCookie(name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    }

    static hasCookie(name) {
        return this.getCookie(name) !== null;
    }
}

// Switch between scenes
function switchToScene(sceneId) {
    // Hide all scenes
    document.querySelectorAll('.scene').forEach(scene => {
        cleanupSnow();
        scene.classList.remove('active');
    });
    
    // Show target scene
    const targetScene = document.getElementById(sceneId);
    if (targetScene) {
        targetScene.classList.add('active');
    }
    
    // If switching to start screen, update call list
    if (sceneId === 'start-screen') {
        createSnow();
        // renderCallList();
    }
}