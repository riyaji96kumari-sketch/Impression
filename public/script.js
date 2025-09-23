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

        logContainer.textContent = ''; // Clear logs on new start
        socket.emit('start-traffic', { url, minDelay, maxDelay });
    });

    stopBtn.addEventListener('click', () => {
        socket.emit('stop-traffic');
    });


    // --- Socket Event Handlers ---
    socket.on('log', (message) => {
        logContainer.textContent += message + '\n';
        // Auto-scroll to the bottom
        logContainer.parentElement.scrollTop = logContainer.parentElement.scrollHeight;
    });

    socket.on('statusUpdate', ({ isRunning }) => {
        if (isRunning) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            urlInput.disabled = true;
            minDelayInput.disabled = true;
            maxDelayInput.disabled = true;
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            urlInput.disabled = false;
            minDelayInput.disabled = false;
            maxDelayInput.disabled = false;
        }
    });

});
