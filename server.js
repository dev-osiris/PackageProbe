const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'views')));

// WebSocket connection
wss.on('connection', (ws) => {
    console.log('Client connected');
    
    // Simulate data processing with progress updates
    let progress = 0;
    const interval = setInterval(() => {
        progress += 10;
        console.log(`Processing: ${progress}%`);
        ws.send(JSON.stringify({ progress: `Processing: ${progress}%` }));

        if (progress >= 100) {
            clearInterval(interval);
            ws.send(JSON.stringify({ progress: 'Processing complete' }));
            ws.close();
        }
    }, 1000);

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

server.listen(3000, () => {
    console.log('Server is running at http://localhost:3000');
});
