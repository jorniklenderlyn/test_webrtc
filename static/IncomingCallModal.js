class IncomingCallModal {
    constructor(text, onAccept = null, onReject = null) {
        this.text = text;
        this.onAccept = onAccept;
        this.onReject = onReject;
        
        this.createModal();
    }

    createModal() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';

        // Create modal content
        const content = document.createElement('div');
        content.className = 'modal-content';

        // Create header if provided
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.textContent = "Входящий вызов";
        content.appendChild(header);

        const modalText = document.createElement('div');
        modalText.className = 'modal-text';
        modalText.textContent = this.text;
        content.appendChild(modalText);

        // Create buttons container
        const buttonsContainer = document.createElement('div');
        
        buttonsContainer.className = 'call-buttons';
        
        // Accept button
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'call-button accept-btn';
        acceptBtn.innerHTML = '<i class="fas fa-phone"></i>';
        acceptBtn.onclick = () => {
            if (this.onAccept) this.onAccept();
            // this.close();
        };
        
        // Decline button
        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'call-button decline-btn';
        rejectBtn.innerHTML = '<i class="fas fa-phone-slash"></i>';
        rejectBtn.onclick = () => {
            if (this.onReject) this.onReject();
            this.close();
        };
        
        buttonsContainer.appendChild(acceptBtn);
        buttonsContainer.appendChild(rejectBtn);


        content.appendChild(buttonsContainer);
        this.overlay.appendChild(content);

        // Add to body
        document.body.appendChild(this.overlay);

        // Close on overlay click
        // this.overlay.addEventListener('click', (e) => {
        //     if (e.target === this.overlay) {
        //         this.close();
        //     }
        // });
    }

    open() {
        // this.overlay.classList.remove('hidden');
    }

    close() {
        // Remove from DOM entirely
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        // Optional: cleanup reference
        this.overlay = null;
    }
}