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
    const iframeGridContainer = document.getElementById('iframeGridContainer');
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    const browserSpecificInputs = document.getElementById('browserSpecificInputs');
    const modeDescription = document.getElementById('modeDescription');
    
    let iframeCounter = 0;
    let iframeTaskInterval = null;

    // --- UI Logic ---
    const updateModeUI = () => {
        const selectedMode = document.querySelector('input[name="mode"]:checked').value;
        if (selectedMode === 'browser') {
            browserSpecificInputs.style.display = 'flex';
            modeDescription.textContent = 'Runs in your browser using visible iframes. Stops when you close this tab.';
        } else {
            browserSpecificInputs.style.display = 'none';
            modeDescription.textContent = 'Runs on the server using GET requests. Persists even if you close this tab.';
        }
    };

    modeRadios.forEach(radio => radio.addEventListener('change', updateModeUI));
    updateModeUI(); // Initial call

    // --- Event Listeners ---
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        logContainer.textContent = '';
        iframeGridContainer.innerHTML = '';
        
        const selectedMode = document.querySelector('input[name="mode"]:checked').value;

        socket.emit('start-traffic', {
            mode: selectedMode,
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
        const inputs = [urlInput, minDelayInput, maxDelayInput, iframeCountInput, closeDelayInput, ...modeRadios];
        startBtn.disabled = isRunning;
        stopBtn.disabled = !isRunning;
        inputs.forEach(input => input.disabled = isRunning);
    });
    
    // --- Browser (iFrame) Task Management ---
    const createIframes = ({ url, count, closeDelay }) => {
        for (let i = 0; i < count; i++) {
            iframeCounter++;
            const frameId = `traffic-frame-${iframeCounter}`;
            socket.emit('client-log', `Creating iframe #${iframeCounter}...`);
            const iframe = document.createElement('iframe');
            iframe.id = frameId;
            iframe.src = url;
            iframe.referrerpolicy = "origin";
            iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups allow-presentation";
            iframeGridContainer.appendChild(iframe);
            setTimeout(() => {
                const frameToRemove = document.getElementById(frameId);
                if (frameToRemove) frameToRemove.remove();
            }, closeDelay);
        }
    };
    
    socket.on('start-iframe-task', (data) => {
        // Since the server doesn't keep state for this, the client must run the loop
        iframeGridContainer.innerHTML = ''; // Clear previous
        const run = () => {
            createIframes(data);
            const delay = Math.floor(Math.random() * (data.maxDelay - data.minDelay + 1) + data.minDelay);
            iframeTaskInterval = setTimeout(run, delay);
        };
        run();
        // Also update UI to reflect a running state
        socket.emit('statusUpdate', { isRunning: true });
    });

    socket.on('stop-iframe-task', () => {
        if (iframeTaskInterval) {
            clearTimeout(iframeTaskInterval);
            iframeTaskInterval = null;
        }
        // This event might be broadcast, so we only update UI if we were running an iframe task
        if (document.querySelector('input[name="mode"]:checked').value === 'browser') {
            socket.emit('statusUpdate', { isRunning: false });
        }
    });
});
