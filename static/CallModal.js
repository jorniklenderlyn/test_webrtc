class CallModal {
    constructor(onCancel = null) {
        this.onCancel = onCancel;
        this.createModal();
    }

    createModal() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';

        // Create modal content
        const content = document.createElement('div');
        content.className = 'modal-content';

        const header = document.createElement('div');
        header.className = 'modal-header';
        header.textContent = "Звоним";
        content.appendChild(header);

        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'single-button-container';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'call-button cancel-call-btn';
        cancelBtn.innerHTML = '<i class="fas fa-phone-slash"></i>';
        cancelBtn.onclick = () => {
            if (this.onCancel) this.onCancel();
            this.close();
        };

        buttonsContainer.appendChild(cancelBtn);
        content.appendChild(buttonsContainer);
        this.overlay.appendChild(content);

        // Close on overlay click
        // this.overlay.addEventListener('click', (e) => {
        //     if (e.target === this.overlay) {
        //         this.close();
        //     }
        // });

        document.body.appendChild(this.overlay);
    }

    open() {
        // Already in DOM; just ensure it's visible
        // (No hidden class used—element is either present or gone)
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