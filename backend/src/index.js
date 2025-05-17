const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store active sessions
const activeSessions = new Map();

// Ensure temp directory exists
const tempDir = path.join(__dirname, '../temp');
const ensureTempDir = async () => {
  try {
    await fs.mkdir(tempDir, { recursive: true });
    console.log('Temp directory created or already exists');
  } catch (err) {
    console.error('Error creating temp directory:', err);
  }
};

// Initialize temp directory
ensureTempDir();

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('Client connected');
  const sessionId = uuidv4();
  
  // Create session directory
  const sessionDir = path.join(tempDir, sessionId);
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'run':
          await handleCodeExecution(ws, data, sessionId, sessionDir);
          break;
        case 'input':
          handleUserInput(ws, data, sessionId);
          break;
        case 'stop':
          console.log(`Received stop request for session ${sessionId}`);
          stopExecution(sessionId, ws);
          break;
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (err) {
      console.error('Error processing message:', err);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Error processing your request'
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
    stopExecution(sessionId);
    // Clean up session directory
    cleanupSession(sessionId);
  });
  
  // Send session ID to client
  ws.send(JSON.stringify({
    type: 'connected',
    sessionId
  }));
});

// Maximum execution time in milliseconds (30 seconds)
const MAX_EXECUTION_TIME = 30000;

// Handle code execution
async function handleCodeExecution(ws, data, sessionId, sessionDir) {
  try {
    // Create session directory if it doesn't exist
    await fs.mkdir(sessionDir, { recursive: true });
    
    // Write code to file
    const filename = getFilename(data.language);
    const filePath = path.join(sessionDir, filename);
    await fs.writeFile(filePath, data.code);
    
    // Stop any existing container for this session
    stopExecution(sessionId);
    
    // Create and run Docker container
    const containerName = `zad-compiler-${sessionId}`;
    const dockerImage = getDockerImage(data.language);
    
    // Command to run the code
    const runCommand = getRunCommand(data.language, filename);
    
    // Run Docker container with TTY
    const dockerArgs = [
      'run',
      '--name', containerName,
      '-i',
      '--rm',
      '-v', `${sessionDir}:/code`,
      '-w', '/code',
      '--memory', '512m',
      '--cpus', '0.5',
      '--network', 'none',
      dockerImage,
      ...runCommand
    ];
    
    console.log('Running Docker command:', 'docker', dockerArgs.join(' '));
    
    const dockerProcess = spawn('docker', dockerArgs);
    
    // Set up execution timeout
    const timeoutId = setTimeout(() => {
      console.log(`Execution timeout reached (${MAX_EXECUTION_TIME}ms) for session ${sessionId}`);
      
      // Notify the client
      ws.send(JSON.stringify({
        type: 'error',
        data: `Execution timed out after ${MAX_EXECUTION_TIME/1000} seconds. The process has been terminated.`
      }));
      
      // Terminate the process
      stopExecution(sessionId);
      
      // Send terminated event
      ws.send(JSON.stringify({
        type: 'terminated',
        exitCode: 124 // Standard timeout exit code
      }));
    }, MAX_EXECUTION_TIME);
    
    // Store process reference and timeout ID
    activeSessions.set(sessionId, {
      process: dockerProcess,
      containerId: containerName,
      timeoutId: timeoutId
    });
    
    // Send output to client
    dockerProcess.stdout.on('data', (data) => {
      console.log('Docker stdout:', data.toString());
      ws.send(JSON.stringify({
        type: 'output',
        data: data.toString()
      }));
    });
    
    dockerProcess.stderr.on('data', (data) => {
      console.log('Docker stderr:', data.toString());
      ws.send(JSON.stringify({
        type: 'error',
        data: data.toString()
      }));
    });
    
    dockerProcess.on('close', (code) => {
      console.log('Docker process closed with code:', code);
      
      // Clear the timeout since the process has ended naturally
      const session = activeSessions.get(sessionId);
      if (session && session.timeoutId) {
        clearTimeout(session.timeoutId);
      }
      
      ws.send(JSON.stringify({
        type: 'terminated',
        exitCode: code
      }));
      
      // Remove from active sessions
      activeSessions.delete(sessionId);
    });
    
    dockerProcess.on('error', (err) => {
      console.error('Docker process error:', err);
      
      // Clear the timeout since the process has errored
      const session = activeSessions.get(sessionId);
      if (session && session.timeoutId) {
        clearTimeout(session.timeoutId);
      }
      
      ws.send(JSON.stringify({
        type: 'error',
        data: `Error executing Docker: ${err.message}`
      }));
    });
    
    // Notify client that execution has started
    ws.send(JSON.stringify({
      type: 'started',
      sessionId
    }));
  } catch (err) {
    console.error('Error executing code:', err);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Error executing code: ' + err.message
    }));
  }
}



// Handle user input
function handleUserInput(ws, data, sessionId) {
  const session = activeSessions.get(sessionId);
  if (session && session.process) {
    console.log('Sending input to process:', data.input);
    // Send the input followed by a newline
    // The input from frontend no longer includes the newline
    session.process.stdin.write(data.input + '\n');
    
    // Send confirmation back to client
    ws.send(JSON.stringify({
      type: 'inputProcessed',
      success: true
    }));
  } else {
    console.log('No active session for input:', sessionId);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'No active execution session'
    }));
  }
}

// Stop execution
function stopExecution(sessionId, ws = null) {
  const session = activeSessions.get(sessionId);
  if (session) {
    console.log(`Stopping execution for session ${sessionId}`);
    
    // Clear timeout if it exists
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
    }
    
    // Kill the process if it exists
    if (session.process) {
      try {
        session.process.kill('SIGKILL');
      } catch (err) {
        console.error('Error killing process:', err);
      }
    }
    
    // Force stop the container if it exists
    if (session.containerId) {
      try {
        // Use force flag to ensure container is stopped immediately
        spawn('docker', ['stop', '--time=0', session.containerId]);
        console.log(`Container ${session.containerId} stopped`);
        
        // Make sure to remove the container if it still exists
        setTimeout(() => {
          try {
            spawn('docker', ['rm', '-f', session.containerId]);
            console.log(`Container ${session.containerId} removed`);
          } catch (rmErr) {
            console.error('Error removing container:', rmErr);
          }
        }, 500);
      } catch (err) {
        console.error('Error stopping container:', err);
      }
    }
    
    // Send stopped message to client if WebSocket is provided
    // This helps the frontend know that the process was stopped manually
    if (ws) {
      try {
        ws.send(JSON.stringify({
          type: 'stopped',
          message: 'Execution stopped by user'
        }));
      } catch (wsErr) {
        console.error('Error sending stopped message:', wsErr);
      }
    }
    
    // Remove from active sessions
    activeSessions.delete(sessionId);
    console.log(`Session ${sessionId} removed from active sessions`);
  }
}

// Clean up session
async function cleanupSession(sessionId) {
  const sessionDir = path.join(tempDir, sessionId);
  try {
    await fs.rm(sessionDir, { recursive: true, force: true });
    console.log(`Cleaned up session directory: ${sessionId}`);
  } catch (err) {
    console.error(`Error cleaning up session directory ${sessionId}:`, err);
  }
}

// Helper functions
function getFilename(language) {
  switch (language.toLowerCase()) {
    case 'python':
      return 'main.py';
    case 'javascript':
      return 'main.js';
    case 'java':
      return 'Main.java';
    case 'c':
      return 'main.c';
    case 'cpp':
      return 'main.cpp';
    default:
      return 'main.py';
  }
}

function getDockerImage(language) {
  switch (language.toLowerCase()) {
    case 'python':
      return 'python:3.9-slim';
    case 'javascript':
      return 'node:16-alpine';
    case 'java':
      return 'openjdk:11-slim';
    case 'c':
    case 'cpp':
      return 'gcc:11.2';
    default:
      return 'python:3.9-slim';
  }
}

function getRunCommand(language, filename) {
  switch (language.toLowerCase()) {
    case 'python':
      return ['python', filename];
    case 'javascript':
      return ['node', filename];
    case 'java':
      return ['bash', '-c', `javac ${filename} && java Main`];
    case 'c':
      return ['bash', '-c', `gcc ${filename} -o main && ./main`];
    case 'cpp':
      return ['bash', '-c', `g++ ${filename} -o main && ./main`];
    default:
      return ['python', filename];
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
