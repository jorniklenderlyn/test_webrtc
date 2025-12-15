const snowContainer = document.getElementById('snow-container');
const snowflakeCount = 150; // Number of snowflakes
let dynamicStyles = [];

// Create snowflakes
for (let i = 0; i < snowflakeCount; i++) {
    createSnowflake();
}

function createSnowflake() {
    const snowflake = document.createElement('div');
    snowflake.classList.add('snowflake');
    
    // Random size between 2px and 8px
    const size = Math.random() * 8 + 4;
    snowflake.style.width = `${size}px`;
    snowflake.style.height = `${size}px`;
    
    // Random starting position
    const startX = Math.random() * 100;
    snowflake.style.left = `${startX}%`;

    snowflake.style.top = '-12px';
    
    // Random animation duration between 15s and 30s
    const duration = Math.random() * 15 + 15;
    snowflake.style.animationDuration = `${duration}s`;
    
    // Random delay to stagger start times
    const delay = Math.random() * 16;
    snowflake.style.animationDelay = `${delay}s`;
    
    // Random horizontal movement
    const horizontalMove = (Math.random() - 0.5) * 40; // -20px to +20px
    snowflake.style.animationName = `snowfall-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create unique keyframes for each snowflake to add horizontal drift
    const keyframes = `
        @keyframes ${snowflake.style.animationName} {
            0% {
                transform: translateY(-20px) translateX(${horizontalMove * 0.1}px);
                opacity: 0;
            }
            10% {
                opacity: 0.8;
            }
            50% {
                transform: translateY(50vh) translateX(${horizontalMove * 0.5}px);
            }
            90% {
                opacity: 0.8;
            }
            100% {
                transform: translateY(100vh) translateX(${horizontalMove}px);
                opacity: 0;
            }
        }
    `;
    
    // Add the keyframes to the document
    const styleSheet = document.createElement('style');
    styleSheet.textContent = keyframes;
    document.head.appendChild(styleSheet);
    dynamicStyles.push(styleSheet);
    
    snowContainer.appendChild(snowflake);
}

function cleanupSnow() {
    const snowContainer = document.getElementById('snow-container');
    snowContainer.innerHTML = '';
    dynamicStyles.forEach(style => {
        if (style.parentNode) style.parentNode.removeChild(style);
    });
    dynamicStyles = [];
}