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
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('WebSocket message received:', message);
        
        switch (message.type) {
          case 'connected':
            console.log('Connected with session ID:', message.sessionId);
            setSessionId(message.sessionId);
            break;
          case 'output':
            console.log('Output received:', message.data);
            if (terminalInstanceRef.current) {
              terminalInstanceRef.current.write(message.data);
            } else {
              console.error('Terminal instance not available for output');
            }
            break;
          case 'error':
            console.log('Error received:', message.data);
            if (terminalInstanceRef.current) {
              terminalInstanceRef.current.write('\x1b[31m' + message.data + '\x1b[0m');
            } else {
              console.error('Terminal instance not available for error');
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
          default:
            console.log('Unknown message type:', message.type);
        }
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
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
    setLanguage(newLanguage);
    setCode(SAMPLE_CODE[newLanguage] || '');
  };
  
  // Handle code execution
  const handleRunCode = () => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify({
        type: 'run',
        code,
        language,
        sessionId,
      }));
    } else {
      alert('WebSocket connection not established. Please try again.');
    }
  };
  
  // Handle stopping code execution
  const handleStopCode = () => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify({
        type: 'stop',
        sessionId,
      }));
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
            className="language-select"
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
              className="control-button run-button"
            >
              Run
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
