document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // DOM Elements
    const form = document.getElementById('controlForm');
    const urlInput = document.getElementById('url');
    const minDelayInput = document.getElementById('minDelay');
    const maxDelayInput = document.getElementById('maxDelay');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const logContainer = document.getElementById('logContainer');

    // --- Event Listeners ---
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const url = urlInput.value;
        const minDelay = minDelayInput.value;
        const maxDelay = maxDelayInput.value;

        if (parseInt(minDelay, 10) > parseInt(maxDelay, 10)) {
            alert('Minimum delay cannot be greater than maximum delay.');
            return;
        }

        // Send start command to server
        socket.emit('start-traffic', { url, minDelay, maxDelay });
    });

    stopBtn.addEventListener('click', () => {
        // Send stop command to server
        socket.emit('stop-traffic');
    });

    // --- Socket Event Handlers ---
    socket.on('connect', () => {
        logContainer.textContent = 'Successfully connected to server. Awaiting instructions.\n';
    });

    socket.on('log', (message) => {
        logContainer.textContent += message + '\n';
        logContainer.parentElement.scrollTop = logContainer.parentElement.scrollHeight;
    });

    socket.on('statusUpdate', ({ isRunning, config }) => {
        const inputs = [urlInput, minDelayInput, maxDelayInput];
        if (isRunning) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            inputs.forEach(input => input.disabled = true);
            // Update form fields to reflect the currently running config
            urlInput.value = config.url || '';
            minDelayInput.value = config.minDelay || '';
            maxDelayInput.value = config.maxDelay || '';
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            inputs.forEach(input => input.disabled = false);
        }
    });
});
