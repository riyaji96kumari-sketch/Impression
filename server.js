// server.js (Corrected)

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- State Management ---
// This object now represents the state for ANY running task.
let activeTask = {
  isRunning: false,
  mode: null, // 'server' or 'browser'
  url: '',
  minDelay: 0,
  maxDelay: 0,
  requestCount: 0,
  timeout: null,
};

const getTimestamp = () => new Date().toLocaleTimeString();
const getRandomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

// --- Core Task Logic ---

// This function now stops ANY active task
const stopActiveTask = () => {
  if (activeTask.timeout) {
    clearTimeout(activeTask.timeout);
  }
  if (activeTask.isRunning) {
    const infoMsg = `[${getTimestamp()}] SYSTEM - ${activeTask.mode} mode task stopped.`;
    console.log(infoMsg);
    io.emit('log', infoMsg);
    
    // Reset state and notify all clients
    activeTask.isRunning = false;
    activeTask.mode = null;
    io.emit('statusUpdate', { isRunning: false });
    
    // Also explicitly tell clients to stop their iframe loops
    io.emit('stop-iframe-task');
  }
  return { success: true, message: "Active task stopped." };
};

const startServerTask = ({ url, minDelay, maxDelay }) => {
  stopActiveTask(); // Ensure no other task is running

  if (!url || minDelay < 0 || maxDelay < minDelay) {
    const errorMsg = `[${getTimestamp()}] SERVER ERROR - Invalid parameters.`;
    io.emit('log', errorMsg);
    return { success: false, message: "Invalid parameters." };
  }

  activeTask = { ...activeTask, isRunning: true, mode: 'server', url, minDelay, maxDelay, requestCount: 0 };
  
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

  sendRequest();
  return { success: true, message: "Background task started." };
};

// --- API Endpoints (Updated to use new functions) ---
app.post('/api/start', (req, res) => {
  const { url, minDelay, maxDelay } = req.body;
  const result = startServerTask({ url, minDelay, maxDelay });
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

// --- WebSocket Connection Handling ---
io.on('connection', (socket) => {
  console.log('A user connected');
  socket.emit('statusUpdate', { isRunning: activeTask.isRunning });

  socket.on('start-traffic', (data) => {
    console.log('Received start-traffic signal with data:', data);

    if (data.mode === 'server') {
      startServerTask(data);
    } else if (data.mode === 'browser') {
      stopActiveTask(); // Stop any previous task first
      
      // THE FIX: Server sets the state and THEN tells clients what to do.
      activeTask.isRunning = true;
      activeTask.mode = 'browser';
      
      io.emit('log', `[${getTimestamp()}] BROWSER - Instructing client to start iframe simulation.`);
      io.emit('statusUpdate', { isRunning: true }); // Broadcast the new "running" state
      io.emit('start-iframe-task', data);      // Broadcast the command to start iframe loops
    }
  });

  socket.on('stop-traffic', () => {
    console.log('Received stop-traffic signal');
    stopActiveTask();
  });
  
  socket.on('client-log', (message) => {
    io.emit('log', `[${getTimestamp()}] CLIENT - ${message}`);
  });

  socket.on('disconnect', () => console.log('User disconnected'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
