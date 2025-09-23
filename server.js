// server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- State Management ---
let requestTimeout = null;
let isRunning = false;
let requestCount = 0;

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Helper Functions ---
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

const getTimestamp = () => new Date().toLocaleTimeString();

// --- Core Traffic Simulation Logic ---
const startTraffic = (socket, { url, minDelay, maxDelay }) => {
  if (isRunning) {
    stopTraffic(); // Stop any existing simulation before starting a new one
  }

  // Validate inputs
  if (!url || minDelay < 0 || maxDelay < minDelay) {
    io.emit('log', `[${getTimestamp()}] ERROR - Invalid parameters provided.`);
    return;
  }
  
  isRunning = true;
  requestCount = 0;
  io.emit('statusUpdate', { isRunning: true });
  io.emit('log', `[${getTimestamp()}] INFO - Traffic simulation started for ${url}`);

  const sendRequest = async () => {
    try {
      const response = await axios.get(url, { timeout: 5000 }); // 5 second timeout
      requestCount++;
      io.emit('log', `[${getTimestamp()}] [${requestCount}] SUCCESS ${response.status} - ${url}`);
    } catch (error) {
      requestCount++;
      let status = error.response ? error.response.status : 'N/A';
      let message = error.code || error.message;
      io.emit('log', `[${getTimestamp()}] [${requestCount}] ERROR ${status} - ${message}`);
    }

    // If still running, schedule the next request
    if (isRunning) {
      const delay = getRandomDelay(minDelay, maxDelay);
      requestTimeout = setTimeout(sendRequest, delay);
    }
  };

  sendRequest(); // Start the first request immediately
};

const stopTraffic = () => {
  if (requestTimeout) {
    clearTimeout(requestTimeout);
    requestTimeout = null;
  }
  if (isRunning) {
    isRunning = false;
    io.emit('statusUpdate', { isRunning: false });
    io.emit('log', `[${getTimestamp()}] INFO - Traffic simulation stopped.`);
  }
};


// --- WebSocket Connection Handling ---
io.on('connection', (socket) => {
  console.log('A user connected');
  
  // Send current status to the newly connected client
  socket.emit('statusUpdate', { isRunning });

  socket.on('start-traffic', (data) => {
    console.log('Received start-traffic signal with data:', data);
    startTraffic(socket, {
      url: data.url,
      minDelay: parseInt(data.minDelay, 10),
      maxDelay: parseInt(data.maxDelay, 10),
    });
  });

  socket.on('stop-traffic', () => {
    console.log('Received stop-traffic signal');
    stopTraffic();
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
    // Optional: you could decide to stop the traffic if all users disconnect
    // if (io.engine.clientsCount === 0) {
    //   stopTraffic();
    // }
  });
});


// --- Server Initialization ---
// IMPORTANT for deployment on services like Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
