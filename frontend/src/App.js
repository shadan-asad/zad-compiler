import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import './App.css';

const BACKEND_URL = 'ws://localhost:3001';

// Sample code for Python
const SAMPLE_CODE = {
  python: `# Python Sample Code
print("Hello, World!")
name = input("What is your name? ")
print(f"Nice to meet you, {name}!")
`,
  javascript: `// JavaScript Sample Code
console.log("Hello, World!");
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('What is your name? ', name => {
  console.log(\`Nice to meet you, \${name}!\`);
  readline.close();
});
`,
};

function App() {
  const [code, setCode] = useState(SAMPLE_CODE.python);
  const [language, setLanguage] = useState('python');
  const [isRunning, setIsRunning] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [environmentReady, setEnvironmentReady] = useState(true); // Default to true for initial Python environment
  
  // We don't need terminalRef as we're using terminalInstanceRef instead
  const terminalContainerRef = useRef(null);
  const websocketRef = useRef(null);
  const terminalInstanceRef = useRef(null);
  
  // Initialize terminal
  useEffect(() => {
    console.log('Terminal initialization effect running');
    console.log('Terminal container exists:', !!terminalContainerRef.current);
    console.log('Terminal instance exists:', !!terminalInstanceRef.current);
    
    // Clear any existing terminal instance
    if (terminalInstanceRef.current) {
      console.log('Disposing existing terminal instance');
      terminalInstanceRef.current.dispose();
      terminalInstanceRef.current = null;
      // Reset terminal ready state
      setTerminalReady(false);
    }
    
    // Use a delay to ensure DOM is fully rendered before initializing terminal
    const initializeTerminal = () => {
      if (!terminalContainerRef.current) {
        console.error('Terminal container ref not available');
        return;
      }
      
      console.log('Creating new terminal instance');
      // Clear the container first
      terminalContainerRef.current.innerHTML = '';
      
      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: 'monospace',
        fontSize: 14,
        theme: {
          background: '#1e1e1e',
          foreground: '#ffffff',
        },
        convertEol: true,
        rendererType: 'canvas',
      });
      
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      
      try {
        // Open terminal in the container
        terminal.open(terminalContainerRef.current);
        
        // Write initial content to confirm terminal is working
        terminal.write('Terminal initialized. Ready to run code.\r\n');
        
        // Mark terminal as ready
        setTerminalReady(true);
        
        // Store the terminal instance first
        terminalInstanceRef.current = terminal;
        
        // Use a longer delay for the initial fit to ensure DOM is fully ready
        setTimeout(() => {
          try {
            if (fitAddon && terminalContainerRef.current && document.contains(terminalContainerRef.current)) {
              console.log('Fitting terminal to container');
              fitAddon.fit();
            }
          } catch (err) {
            console.error('Error fitting terminal:', err);
          }
        }, 500);
        
        // Buffer for input until Enter is pressed
        const inputBuffer = { text: '', active: false };
        
        // Handle user input in terminal
        terminal.onData((data) => {
          console.log('Terminal input received:', data, data.charCodeAt(0));
          
          // Check if websocket is available
          if (!websocketRef.current || websocketRef.current.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not available for input');
            return;
          }
          
          // Handle special characters
          if (data.charCodeAt(0) === 13) { // Enter key
            // Send the buffered input to the backend
            console.log('Enter pressed, sending input:', inputBuffer.text);
            websocketRef.current.send(JSON.stringify({
              type: 'input',
              input: inputBuffer.text,
              sessionId,
            }));
            
            // Reset the buffer
            inputBuffer.text = '';
            terminal.write('\r\n'); // Move to next line in terminal
          } else if (data.charCodeAt(0) === 127 || data.charCodeAt(0) === 8) { // Backspace
            if (inputBuffer.text.length > 0) {
              inputBuffer.text = inputBuffer.text.slice(0, -1);
              terminal.write('\b \b'); // Erase character in terminal
            }
          } else if (data.charCodeAt(0) >= 32) { // Printable characters
            inputBuffer.text += data;
            terminal.write(data); // Echo character to terminal
          }
        });
        
        // Resize handler with error handling
        const handleResize = () => {
          try {
            if (fitAddon && terminalContainerRef.current && document.contains(terminalContainerRef.current)) {
              console.log('Resizing terminal');
              fitAddon.fit();
            }
          } catch (err) {
            console.error('Error fitting terminal on resize:', err);
          }
        };
        
        window.addEventListener('resize', handleResize);
        
        return () => {
          console.log('Cleaning up terminal');
          window.removeEventListener('resize', handleResize);
          if (terminalInstanceRef.current === terminal) {
            terminalInstanceRef.current = null;
          }
          terminal.dispose();
        };
      } catch (err) {
        console.error('Error initializing terminal:', err);
      }
    };
    
    // Delay terminal initialization to ensure DOM is ready
    const initTimeout = setTimeout(initializeTerminal, 300);
    
    return () => {
      clearTimeout(initTimeout);
    };
  }, []);
  
  // Connect to WebSocket
  useEffect(() => {
    const connectWebSocket = () => {
      const ws = new WebSocket(BACKEND_URL);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('WebSocket message received:', message);
        
        // Store session ID when received from server
        if (message.type === 'connected' && message.sessionId) {
          setSessionId(message.sessionId);
          console.log('Session ID set:', message.sessionId);
        }
        
        switch (message.type) {
          case 'connected':
            console.log('Connected with session ID:', message.sessionId);
            // Session ID is already set above to ensure it happens immediately
            // Also mark environment as ready for Python (default language)
            if (language === 'python') {
              setEnvironmentReady(true);
            }
            break;
          case 'output':
            console.log('Output received:', message.data);
            if (terminalInstanceRef.current) {
              terminalInstanceRef.current.write(message.data);
              
              // Check for Docker image messages to update environment readiness
              if (message.data.includes('Docker image') && message.data.includes('not found locally')) {
                // Docker image is being pulled, environment not ready
                setEnvironmentReady(false);
              } else if (message.data.includes('Pulling complete') || message.data.includes('up to date')) {
                // Docker image pull completed, environment is ready
                setEnvironmentReady(true);
                
                // Clear any pending timeout
                if (window.lastReadyTimeout) {
                  clearTimeout(window.lastReadyTimeout);
                  window.lastReadyTimeout = null;
                }
                
                // Notify user that environment is ready
                terminalInstanceRef.current.write('\r\n\x1b[32mEnvironment is ready. You can now run your code.\x1b[0m\r\n');
              }
            } else {
              console.error('Terminal instance not available for output');
            }
            break;
          case 'error':
            console.error('Error from server:', message.message || message.data);
            if (terminalInstanceRef.current) {
              terminalInstanceRef.current.write(`\r\n\x1b[31mError: ${message.message || message.data}\x1b[0m\r\n`);
              // Reset running state on error
              setIsRunning(false);
            } else {
              console.error('Terminal instance not available for error message');
            }
            break;
          case 'started':
            console.log('Execution started');
            setIsRunning(true);
            if (terminalInstanceRef.current) {
              terminalInstanceRef.current.clear();
              terminalInstanceRef.current.write('Running your code...\r\n');
            } else {
              console.error('Terminal instance not available for started message');
            }
            break;
          case 'terminated':
            console.log('Execution terminated with code:', message.exitCode);
            setIsRunning(false);
            if (terminalInstanceRef.current) {
              terminalInstanceRef.current.write('\r\n\x1b[33mProgram exited with code ' + message.exitCode + '\x1b[0m\r\n');
            } else {
              console.error('Terminal instance not available for terminated message');
            }
            break;
          case 'stopped':
            console.log('Execution stopped by user');
            setIsRunning(false);
            if (terminalInstanceRef.current) {
              terminalInstanceRef.current.write('\r\n\x1b[33mExecution stopped by user\x1b[0m\r\n');
            } else {
              console.error('Terminal instance not available for stopped message');
            }
            break;
          default:
            console.log('Unknown message type:', message.type);
        }
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsConnected(false);
        
        // Update terminal with disconnection status
        if (terminalInstanceRef.current) {
          terminalInstanceRef.current.write('\r\n\x1b[31mDisconnected from server. Attempting to reconnect...\x1b[0m\r\n');
        }
        
        // Try to reconnect after a delay
        setTimeout(connectWebSocket, 3000);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
      websocketRef.current = ws;
    };
    
    connectWebSocket();
    
    return () => {
      if (websocketRef.current) {
        websocketRef.current.close();
      }
    };
  }, []);
  
  // Handle language change
  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    const previousLanguage = language;
    
    // Set new language and code
    setLanguage(newLanguage);
    setCode(SAMPLE_CODE[newLanguage] || '');
    
    // Mark environment as not ready when switching to a different language
    if (newLanguage !== previousLanguage && newLanguage === 'javascript') {
      setEnvironmentReady(false);
      
      // Reset after 5 seconds to handle case where no environment message is received
      const readyTimeout = setTimeout(() => {
        setEnvironmentReady(true);
      }, 5000);
      
      // Store timeout ID for cleanup
      window.lastReadyTimeout = readyTimeout;
    }
    
    // Inform user about language change
    if (terminalInstanceRef.current) {
      if (newLanguage === 'javascript') {
        terminalInstanceRef.current.write(`\r\n\x1b[36mSwitched to ${newLanguage} mode. Preparing environment (this may take a moment)...\x1b[0m\r\n`);
        terminalInstanceRef.current.write(`\r\n\x1b[33mPlease wait until the Run button is enabled before executing code.\x1b[0m\r\n`);
      } else {
        terminalInstanceRef.current.write(`\r\n\x1b[36mSwitched to ${newLanguage} mode.\x1b[0m\r\n`);
      }
    }
  };
  
  // Handle code execution
  const handleRunCode = () => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      // Clear terminal before running new code
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.clear();
        terminalInstanceRef.current.write('Running code...\r\n');
      }
      
      // Set running state
      setIsRunning(true);
      
      websocketRef.current.send(JSON.stringify({
        type: 'run',
        code,
        language,
        sessionId,
      }));
    } else {
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.write('\r\n\x1b[31mWebSocket connection not established. Please wait a moment and try again.\x1b[0m\r\n');
      } else {
        alert('WebSocket connection not established. Please try again.');
      }
    }
  };
  
  // Handle stopping code execution
  const handleStopCode = () => {
    console.log('Stop button clicked, sending stop request for session:', sessionId);
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify({
        type: 'stop',
        sessionId,
      }));
      
      // Provide immediate feedback to the user
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.write('\r\n\x1b[33mStopping execution...\x1b[0m\r\n');
      }
    } else {
      console.error('WebSocket not available for stop request');
    }
  };
  
  return (
    <div className="app">
      <header className="header">
        <h1>Zad Compiler</h1>
        <div className="controls">
          <select 
            value={language} 
            onChange={handleLanguageChange}
            className={`language-select ${isRunning ? 'disabled' : ''}`}
            disabled={isRunning}
            title={isRunning ? 'Cannot change language while code is running' : 'Select programming language'}
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
          </select>
          
          {isRunning ? (
            <button 
              onClick={handleStopCode} 
              className="control-button stop-button"
            >
              Stop
            </button>
          ) : (
            <button 
              onClick={handleRunCode} 
              disabled={!wsConnected || !terminalReady || !environmentReady || isRunning}
              className={`control-button run-button ${(!wsConnected || !terminalReady || !environmentReady) ? 'disabled' : ''}`}
              title={!terminalReady ? 'Terminal initializing...' : 
                    !wsConnected ? 'Waiting for connection...' : 
                    !environmentReady ? 'Preparing environment...' : 
                    'Run code'}
            >
              {!terminalReady ? 'Initializing...' : 
               !wsConnected ? 'Connecting...' : 
               !environmentReady ? 'Preparing...' : 
               'Run'}
            </button>
          )}
        </div>
      </header>
      
      <main className="main">
        <div className="editor-container">
          <Editor
            height="100%"
            defaultLanguage={language}
            language={language}
            value={code}
            onChange={setCode}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>
        
        <div className="terminal-container" ref={terminalContainerRef}></div>
      </main>
      
      <footer className="footer">
        <p>Zad Compiler - Interactive Code Execution Environment</p>
      </footer>
    </div>
  );
}

export default App;
