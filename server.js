// =================================================================
// ||                HYBRID TRAFFIC SIMULATOR                     ||
// =================================================================
// This server provides two modes for traffic simulation:
// 1. Server Mode: A persistent background task using 'axios' to send GET requests.
//    - Controllable via the UI or a REST API.
//    - Continues running even if all browser tabs are closed.
// 2. Browser Mode: An orchestrator for a client-side iframe-based simulation.
//    - The server tells clients when to start/stop, but the clients run the simulation.
//    - Requires at least one browser tab to be open.
//    - Better for simulations requiring viewable impressions.
// =================================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Middleware ---
app.use(express.json()); // To parse JSON bodies from API requests
app.use(express.static(path.join(__dirname, 'public'))); // Serve the frontend

// --- Centralized State Management ---
// The single source of truth for any active simulation.
let activeTask = {
  isRunning: false,
  mode: null, // 'server' or 'browser'
  url: '',
  minDelay: 0,
  maxDelay: 0,
  requestCount: 0,
  timeout: null,
};

// --- Helper Functions ---
const getTimestamp = () => new Date().toLocaleTimeString();
const getRandomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

// =================================================================
// ||                     CORE TASK FUNCTIONS                     ||
// =================================================================

/**
 * Stops any currently active task, regardless of mode.
 * Resets the state and notifies all clients.
 */
const stopActiveTask = () => {
  if (activeTask.timeout) {
    clearTimeout(activeTask.timeout);
  }
  if (activeTask.isRunning) {
    const infoMsg = `[${getTimestamp()}] SYSTEM - ${activeTask.mode} mode task stopped.`;
    console.log(infoMsg);
    io.emit('log', infoMsg);
    
    // Reset state object
    activeTask = { isRunning: false, mode: null, url: '', minDelay: 0, maxDelay: 0, requestCount: 0, timeout: null };

    // Notify all clients of the change
    io.emit('statusUpdate', { isRunning: false });
    io.emit('stop-iframe-task'); // Explicitly tell clients to stop any iframe loops
  }
  return { success: true, message: "Active task stopped." };
};

/**
 * Starts the persistent, server-side background task using axios.
 */
const startServerTask = ({ url, minDelay, maxDelay }) => {
  stopActiveTask(); // Ensure no other task is running

  if (!url || minDelay < 0 || maxDelay < minDelay) {
    const errorMsg = `[${getTimestamp()}] SERVER ERROR - Invalid parameters provided.`;
    io.emit('log', errorMsg);
    return { success: false, message: "Invalid parameters." };
  }

  // Set the global state for a server task
  activeTask = { ...activeTask, isRunning: true, mode: 'server', url, minDelay, maxDelay };
  
  const successMsg = `[${getTimestamp()}] SERVER - Background task started for ${url}`;
  io.emit('log', successMsg);
  io.emit('statusUpdate', { isRunning: true });

  const sendRequest = async () => {
    try {
      const response = await axios.get(url, { timeout: 5000 });
      activeTask.requestCount++;
      io.emit('log', `[${getTimestamp()}] [BG #${activeTask.requestCount}] SUCCESS ${response.status} - ${url}`);
    } catch (error) {
      activeTask.requestCount++;
      let status = error.response ? error.response.status : 'N/A';
      io.emit('log', `[${getTimestamp()}] [BG #${activeTask.requestCount}] ERROR ${status} - ${error.message}`);
    }

    if (activeTask.isRunning) {
      const delay = getRandomDelay(activeTask.minDelay, activeTask.maxDelay);
      activeTask.timeout = setTimeout(sendRequest, delay);
    }
  };

  sendRequest(); // Start the loop
  return { success: true, message: "Background task started successfully." };
};


// =================================================================
// ||                         API ENDPOINTS                       ||
// =================================================================

app.post('/api/start', (req, res) => {
  const { url, minDelay, maxDelay } = req.body;
  const result = startServerTask({ 
    url, 
    minDelay: parseInt(minDelay, 10) || 1000, 
    maxDelay: parseInt(maxDelay, 10) || 5000 
  });
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/stop', (req, res) => {
  res.status(200).json(stopActiveTask());
});

app.get('/api/status', (req, res) => {
  res.status(200).json({
    isRunning: activeTask.isRunning,
    mode: activeTask.mode,
    url: activeTask.url,
    requestsSent: activeTask.requestCount,
  });
});

// =================================================================
// ||               WEBSOCKET CONNECTION HANDLING                 ||
// =================================================================

io.on('connection', (socket) => {
  console.log('A user connected');
  // Immediately send the current status to the newly connected client
  socket.emit('statusUpdate', { isRunning: activeTask.isRunning });

  socket.on('start-traffic', (data) => {
    console.log('Received start-traffic signal with data:', data);

    if (data.mode === 'server') {
      startServerTask({
        url: data.url,
        minDelay: parseInt(data.minDelay, 10) || 1000,
        maxDelay: parseInt(data.maxDelay, 10) || 5000,
      });
    } else if (data.mode === 'browser') {
      stopActiveTask(); // Stop any previous task first
      
      // Set the server's state to reflect the new browser task
      activeTask.isRunning = true;
      activeTask.mode = 'browser';
      
      // Notify all clients that a task is running
      io.emit('log', `[${getTimestamp()}] BROWSER - Instructing client to start iframe simulation.`);
      io.emit('statusUpdate', { isRunning: true });
      
      // *** CRITICAL FIX ***
      // Parse all data into numbers before broadcasting to prevent client-side errors.
      const taskData = {
          url: data.url,
          minDelay: parseInt(data.minDelay, 10) || 1000,
          maxDelay: parseInt(data.maxDelay, 10) || 5000,
          iframeCount: parseInt(data.iframeCount, 10) || 1,
          closeDelay: parseInt(data.closeDelay, 10) || 4000
      };
      
      // Broadcast the validated, numeric data to all clients
      io.emit('start-iframe-task', taskData);
    }
  });

  socket.on('stop-traffic', () => {
    console.log('Received stop-traffic signal');
    stopActiveTask();
  });
  
  socket.on('client-log', (message) => {
    // Relay logs from one client to all clients
    io.emit('log', `[${getTimestamp()}] CLIENT - ${message}`);
  });

  socket.on('disconnect', () => console.log('User disconnected'));
});


// =================================================================
// ||                     SERVER INITIALIZATION                   ||
// =================================================================

// Use the PORT environment variable for services like Render, default to 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
