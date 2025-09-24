document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // DOM Elements (update iframeContainer selector)
    const form = document.getElementById('controlForm');
    const urlInput = document.getElementById('url');
    const minDelayInput = document.getElementById('minDelay');
    const maxDelayInput = document.getElementById('maxDelay');
    const iframeCountInput = document.getElementById('iframeCount');
    const closeDelayInput = document.getElementById('closeDelay');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const logContainer = document.getElementById('logContainer');
    // ** UPDATE: Target the new visible grid container **
    const iframeGridContainer = document.getElementById('iframeGridContainer'); 
    
    let iframeCounter = 0;

    // --- Event Listeners ---
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        logContainer.textContent = ''; // Clear logs
        iframeGridContainer.innerHTML = ''; // Clear any old iframes
        socket.emit('start-traffic', {
            url: urlInput.value,
            minDelay: minDelayInput.value,
            maxDelay: maxDelayInput.value,
            iframeCount: iframeCountInput.value,
            closeDelay: closeDelayInput.value
        });
    });

    stopBtn.addEventListener('click', () => {
        socket.emit('stop-traffic');
    });

    // --- Socket Event Handlers ---
    socket.on('log', (message) => {
        logContainer.textContent += message + '\n';
        logContainer.parentElement.scrollTop = logContainer.parentElement.scrollHeight;
    });

    socket.on('statusUpdate', ({ isRunning }) => {
        // ... (this logic remains the same)
        const inputs = [urlInput, minDelayInput, maxDelayInput, iframeCountInput, closeDelayInput];
        if (isRunning) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            inputs.forEach(input => input.disabled = true);
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            inputs.forEach(input => input.disabled = false);
        }
    });
    
    socket.on('create-iframes', ({ url, count, closeDelay }) => {
        for (let i = 0; i < count; i++) {
            iframeCounter++;
            const frameId = `traffic-frame-${iframeCounter}`;
            
            socket.emit('client-log', `Creating visible iframe #${iframeCounter}...`);
            
            const iframe = document.createElement('iframe');
            iframe.id = frameId;
            iframe.src = url;
            
            // ** NEW: Add attributes to improve impression counting **

            // 1. Referrer Policy: Sends the origin URL as the referrer. Makes traffic look more natural.
            iframe.referrerpolicy = "origin";

            // 2. Permissive Sandbox: Allows scripts, forms, popups, etc., which are often
            // needed for analytics to function correctly. WARNING: This reduces security.
            // Only use this tool with URLs you trust.
            iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups allow-presentation";
            
            iframeGridContainer.appendChild(iframe);

            setTimeout(() => {
                const frameToRemove = document.getElementById(frameId);
                if (frameToRemove) {
                    frameToRemove.remove();
                    socket.emit('client-log', `Closed iframe #${(frameId.split('-')[2])}.`);
                }
            }, closeDelay);
        }
    });
});
