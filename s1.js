// server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Middleware for API ---
app.use(express.json()); // To parse JSON bodies from API requests

// --- State Management for Background Task ---
let backgroundTask = {
  isRunning: false,
  url: '',
  minDelay: 0,
  maxDelay: 0,
  requestCount: 0,
  timeout: null,
};

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Helper Functions ---
const getRandomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const getTimestamp = () => new Date().toLocaleTimeString();

// --- Core Background Task Logic (Server-Side) ---
const startBackgroundTask = ({ url, minDelay, maxDelay }) => {
  if (backgroundTask.isRunning) {
    stopBackgroundTask(); // Stop previous task
  }
  
  if (!url || minDelay < 0 || maxDelay < minDelay) {
    const errorMsg = `[${getTimestamp()}] SERVER ERROR - Invalid parameters for background task.`;
    console.error(errorMsg);
    io.emit('log', errorMsg);
    return { success: false, message: "Invalid parameters." };
  }

  backgroundTask = { ...backgroundTask, isRunning: true, url, minDelay, maxDelay, requestCount: 0 };
  
  const successMsg = `[${getTimestamp()}] SERVER - Background task started for ${url}`;
  console.log(successMsg);
  io.emit('log', successMsg);
  io.emit('statusUpdate', { isRunning: true });

  const sendRequest = async () => {
    try {
      const response = await axios.get(url, { timeout: 5000 });
      backgroundTask.requestCount++;
      io.emit('log', `[${getTimestamp()}] [BG #${backgroundTask.requestCount}] SUCCESS ${response.status} - ${url}`);
    } catch (error) {
      backgroundTask.requestCount++;
      let status = error.response ? error.response.status : 'N/A';
      io.emit('log', `[${getTimestamp()}] [BG #${backgroundTask.requestCount}] ERROR ${status} - ${error.message}`);
    }

    if (backgroundTask.isRunning) {
      const delay = getRandomDelay(backgroundTask.minDelay, backgroundTask.maxDelay);
      backgroundTask.timeout = setTimeout(sendRequest, delay);
    }
  };

  sendRequest();
  return { success: true, message: "Background task started successfully." };
};

const stopBackgroundTask = () => {
  if (backgroundTask.timeout) {
    clearTimeout(backgroundTask.timeout);
  }
  if (backgroundTask.isRunning) {
    backgroundTask.isRunning = false;
    const infoMsg = `[${getTimestamp()}] SERVER - Background task stopped.`;
    console.log(infoMsg);
    io.emit('log', infoMsg);
    io.emit('statusUpdate', { isRunning: false });
  }
  return { success: true, message: "Background task stopped." };
};

// --- API Endpoints ---
app.post('/api/start', (req, res) => {
  const { url, minDelay, maxDelay } = req.body;
  const result = startBackgroundTask({ url, minDelay, maxDelay });
  if (result.success) {
    res.status(200).json(result);
  } else {
    res.status(400).json(result);
  }
});

app.post('/api/stop', (req, res) => {
  const result = stopBackgroundTask();
  res.status(200).json(result);
});

app.get('/api/status', (req, res) => {
  res.status(200).json({
    isRunning: backgroundTask.isRunning,
    url: backgroundTask.url,
    minDelay: backgroundTask.minDelay,
    maxDelay: backgroundTask.maxDelay,
    requestsSent: backgroundTask.requestCount,
  });
});


// --- WebSocket Connection Handling ---
io.on('connection', (socket) => {
  console.log('A user connected');
  
  // Immediately send the status of the background task to the new client
  socket.emit('statusUpdate', { isRunning: backgroundTask.isRunning });

  socket.on('start-traffic', (data) => {
    console.log('Received start-traffic signal with data:', data);

    if (data.mode === 'server') {
      // Start the persistent background task
      startBackgroundTask({
        url: data.url,
        minDelay: parseInt(data.minDelay, 10),
        maxDelay: parseInt(data.maxDelay, 10),
      });
    } else if (data.mode === 'browser') {
      // Orchestrate the temporary iframe task
      // Note: This does not use the persistent backgroundTask state
      io.emit('log', `[${getTimestamp()}] BROWSER - Instructing client to start iframe simulation.`);
      io.emit('start-iframe-task', data);
    }
  });

  socket.on('stop-traffic', () => {
    console.log('Received stop-traffic signal');
    // This button should stop BOTH kinds of tasks for simplicity
    stopBackgroundTask();
    io.emit('stop-iframe-task');
  });
  
  socket.on('client-log', (message) => {
    io.emit('log', `[${getTimestamp()}] CLIENT - ${message}`);
  });

  socket.on('disconnect', () => console.log('User disconnected'));
});


// --- Server Initialization ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
