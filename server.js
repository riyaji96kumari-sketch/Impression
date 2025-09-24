// server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- State Management ---
let simulationTimeout = null;
let isRunning = false;

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Helper Functions ---
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

const getTimestamp = () => new Date().toLocaleTimeString();

// --- Core Simulation Logic (Orchestrator) ---
const startTraffic = ({ url, minDelay, maxDelay, iframeCount, closeDelay }) => {
  if (isRunning) {
    stopTraffic();
  }

  // Validate inputs
  if (!url || minDelay < 0 || maxDelay < minDelay || iframeCount <= 0 || closeDelay <= 0) {
    io.emit('log', `[${getTimestamp()}] ERROR - Invalid parameters provided.`);
    return;
  }
  
  isRunning = true;
  io.emit('statusUpdate', { isRunning: true });
  io.emit('log', `[${getTimestamp()}] INFO - Simulation started. Instructing client to open ${iframeCount} window(s) for ${url}`);

  const scheduleNextBatch = () => {
    // Tell all connected clients to create the iframes
    io.emit('create-iframes', { url, count: iframeCount, closeDelay });
    io.emit('log', `[${getTimestamp()}] INFO - Sent command to create ${iframeCount} iframe(s).`);

    // If still running, schedule the next batch
    if (isRunning) {
      const delay = getRandomDelay(minDelay, maxDelay);
      simulationTimeout = setTimeout(scheduleNextBatch, delay);
    }
  };

  scheduleNextBatch(); // Start the first batch
};

const stopTraffic = () => {
  if (simulationTimeout) {
    clearTimeout(simulationTimeout);
    simulationTimeout = null;
  }
  if (isRunning) {
    isRunning = false;
    io.emit('statusUpdate', { isRunning: false });
    io.emit('log', `[${getTimestamp()}] INFO - Simulation stopped.`);
  }
};


// --- WebSocket Connection Handling ---
io.on('connection', (socket) => {
  console.log('A user connected');
  
  socket.emit('statusUpdate', { isRunning });

  socket.on('start-traffic', (data) => {
    console.log('Received start-traffic signal with data:', data);
    startTraffic({
      url: data.url,
      minDelay: parseInt(data.minDelay, 10),
      maxDelay: parseInt(data.maxDelay, 10),
      iframeCount: parseInt(data.iframeCount, 10),
      closeDelay: parseInt(data.closeDelay, 10),
    });
  });

  socket.on('stop-traffic', () => {
    console.log('Received stop-traffic signal');
    stopTraffic();
  });
  
  // Listen for logs from the client
  socket.on('client-log', (message) => {
    // Broadcast the client's log to all clients
    io.emit('log', `[${getTimestamp()}] CLIENT - ${message}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});


// --- Server Initialization ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
