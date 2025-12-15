class UsersListComponent {
    constructor(containerId, userId) {
        this.containerId = containerId;
        this.currentUserId = userId;
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container with id '${containerId}' not found`);
        }
        
        // Create the list element
        this.listElement = document.createElement('div');
        this.listElement.id = 'callee-list';
        this.container.appendChild(this.listElement);
        
        // Store current users array
        this.users = [];
        
        // Bind event handlers
        this.handleCallClick = this.handleCallClick.bind(this);
    }

    render(users) {
        this.users = users; // Store the users array
        this.listElement.innerHTML = '';

        users.forEach(user => {
            if (user.id !== this.currentUserId) {
                const calleeListItem = this.createUserItem(user);
                this.listElement.appendChild(calleeListItem);
            }
        });
        
        // Add event listeners after elements are created
        this.addEventListeners();
        console.log(users);
    }

    // Add a single user to the list
    addUser(user) {
        // Check if user already exists
        const userExists = this.users.some(u => u.id === user.id);
        if (userExists || user.id === this.currentUserId) {
            return false; // User already exists or is the current user
        }
        
        // Add user to internal array
        this.users.push(user);
        
        // Only render the new user if they're not the current user
        if (user.id !== this.currentUserId) {
            const calleeListItem = this.createUserItem(user);
            this.listElement.appendChild(calleeListItem);
            
            // Re-add event listeners to ensure the new button has the handler
            this.addEventListeners();
        }
        
        return true;
    }

    // Remove a single user from the list
    removeUser(userId) {
        // Find the index of the user to remove
        const userIndex = this.users.findIndex(u => u.id === userId);
        if (userIndex === -1) {
            return false; // User not found
        }
        
        // Remove user from internal array
        this.users.splice(userIndex, 1);
        
        // Remove the corresponding DOM element
        const userElement = this.listElement.querySelector(`[data-user-id="${userId}"]`);
        if (userElement) {
            userElement.remove();
        }
        
        return true;
    }

    createUserItem(user) {
        const calleeListItem = document.createElement('div');
        calleeListItem.className = 'callee-list-item';
        calleeListItem.dataset.userId = user.id;

        calleeListItem.innerHTML = `
            <div class="callee-info">
                <div class="callee-username">${this.escapeHtml(user.name)}</div>
            </div>
            <button type="button" class="call-btn" data-callee-id="${user.id}">
                <i class="fas fa-phone-alt"></i>
            </button>
        `;
        
        return calleeListItem;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    addEventListeners() {
        const callButtons = this.listElement.querySelectorAll('.call-btn');
        callButtons.forEach(button => {
            button.removeEventListener('click', this.handleCallClick);
            button.addEventListener('click', this.handleCallClick);
        });
    }

    handleCallClick(event) {
        const button = event.currentTarget;
        const userId = button.getAttribute('data-callee-id');
        
        // Dispatch custom event for parent component to handle
        const callEvent = new CustomEvent('userCallRequested', {
            detail: { userId: userId },
            bubbles: true
        });
        
        this.container.dispatchEvent(callEvent);
    }

    // Method to update user ID if needed
    setUserId(userId) {
        this.currentUserId = userId;
    }
}