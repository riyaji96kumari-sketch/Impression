// server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware to parse JSON bodies for API requests
app.use(express.json());

// --- Global State Management ---
let simulationTimeout = null;
let isRunning = false;
let currentConfig = {};
let requestCount = 0;

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Helper Functions ---
const getRandomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const getTimestamp = () => new Date().toLocaleTimeString();

// --- Core Simulation Logic (Server-Side) ---
const startTraffic = (config) => {
  if (isRunning) {
    stopTraffic(); // Stop any existing simulation before starting a new one
  }

  const { url, minDelay, maxDelay } = config;

  // Validate inputs
  if (!url || !minDelay || !maxDelay || minDelay < 0 || maxDelay < minDelay) {
    const errorMsg = `[${getTimestamp()}] ERROR - Invalid parameters provided.`;
    console.error(errorMsg);
    io.emit('log', errorMsg); // Also log to web UI if anyone is watching
    return false;
  }

  isRunning = true;
  currentConfig = config;
  requestCount = 0;

  // Notify all connected web clients of the new status
  io.emit('statusUpdate', { isRunning: true, config: currentConfig });
  io.emit('log', `[${getTimestamp()}] INFO - Traffic simulation started for ${url}`);
  console.log(`Traffic simulation started for ${url}`);

  const sendRequest = async () => {
    try {
      const response = await axios.get(url, { timeout: 8000 });
      requestCount++;
      const logMsg = `[${getTimestamp()}] [${requestCount}] SUCCESS ${response.status} - ${url}`;
      io.emit('log', logMsg);
    } catch (error) {
      requestCount++;
      const status = error.response ? error.response.status : 'N/A';
      const message = error.code || error.message;
      const logMsg = `[${getTimestamp()}] [${requestCount}] ERROR ${status} - ${message}`;
      io.emit('log', logMsg);
    }

    if (isRunning) {
      const delay = getRandomDelay(minDelay, maxDelay);
      simulationTimeout = setTimeout(sendRequest, delay);
    }
  };

  sendRequest(); // Start the first request immediately
  return true;
};

const stopTraffic = () => {
  if (simulationTimeout) {
    clearTimeout(simulationTimeout);
    simulationTimeout = null;
  }
  if (isRunning) {
    isRunning = false;
    const logMsg = `[${getTimestamp()}] INFO - Traffic simulation stopped.`;
    io.emit('log', logMsg);
    io.emit('statusUpdate', { isRunning: false, config: {} });
    console.log(logMsg);
    currentConfig = {};
  }
};


// --- REST API Endpoints ---
app.post('/api/start', (req, res) => {
  console.log('API /start endpoint hit with body:', req.body);
  const { url, minDelay, maxDelay } = req.body;
  
  const success = startTraffic({
    url,
    minDelay: parseInt(minDelay, 10),
    maxDelay: parseInt(maxDelay, 10),
  });

  if (success) {
    res.status(200).json({ success: true, message: 'Traffic simulation started successfully.' });
  } else {
    res.status(400).json({ success: false, message: 'Invalid parameters provided.' });
  }
});

app.post('/api/stop', (req, res) => {
  console.log('API /stop endpoint hit');
  stopTraffic();
  res.status(200).json({ success: true, message: 'Traffic simulation stopped.' });
});

app.get('/api/status', (req, res) => {
  res.status(200).json({
    isRunning,
    requestsSent: requestCount,
    currentConfig: isRunning ? currentConfig : null,
  });
});


// --- WebSocket Connection Handling for Web UI ---
io.on('connection', (socket) => {
  console.log('A user connected to the Web UI');
  
  // Send current status to the newly connected client
  socket.emit('statusUpdate', { isRunning, config: currentConfig });

  socket.on('start-traffic', (data) => {
    console.log('Web UI sent start-traffic with data:', data);
    startTraffic({
      url: data.url,
      minDelay: parseInt(data.minDelay, 10),
      maxDelay: parseInt(data.maxDelay, 10),
    });
  });

  socket.on('stop-traffic', () => {
    console.log('Web UI sent stop-traffic');
    stopTraffic();
  });

  socket.on('disconnect', () => {
    console.log('Web UI user disconnected');
  });
});


// --- Server Initialization ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
