document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // DOM Elements
    const form = document.getElementById('controlForm');
    const urlInput = document.getElementById('url');
    const minDelayInput = document.getElementById('minDelay');
    const maxDelayInput = document.getElementById('maxDelay');
    const iframeCountInput = document.getElementById('iframeCount');
    const closeDelayInput = document.getElementById('closeDelay');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const logContainer = document.getElementById('logContainer');
    const iframeContainer = document.getElementById('iframeContainer');
    
    let iframeCounter = 0;

    // --- Event Listeners ---
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        logContainer.textContent = ''; // Clear logs on new start
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
            
            // Log to the server that we are creating an iframe
            socket.emit('client-log', `Creating iframe #${iframeCounter}...`);
            
            const iframe = document.createElement('iframe');
            iframe.id = frameId;
            iframe.src = url;
            // Sandbox attribute for better security, though it may restrict some sites
            iframe.sandbox = "allow-scripts allow-same-origin";
            
            iframeContainer.appendChild(iframe);

            // Set a timer to remove the iframe
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
