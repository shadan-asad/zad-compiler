# Zad Compiler

An interactive web-based code compiler that supports real-time user interaction using Node.js, Docker, and WebSockets.

Live URL: https://zad-compiler-fe.vercel.app/

## Features

- Write code in a Monaco Editor
- Execute code in an isolated Docker environment
- Interact with running programs via a terminal-like interface (xterm.js)
- Real-time bidirectional communication using WebSockets
- Support for multiple programming languages (starting with Python)

## Project Structure

```
zad-compiler/
├── frontend/         # React.js frontend
│   ├── public/       # Static assets
│   └── src/          # React components and logic
├── backend/          # Node.js + Express backend
│   ├── src/          # Server code
│   └── Dockerfile    # Backend Docker configuration
└── README.md         # Project documentation
```

## Prerequisites

- Node.js (v14+)
- Docker
- npm or yarn

## Getting Started

### Backend Setup

```bash
cd backend
npm install
npm start
```

### Frontend Setup

```bash
cd frontend
npm install
npm start
```

## Technologies Used

- **Frontend**: React.js, Monaco Editor, xterm.js
- **Backend**: Node.js, Express.js, WebSocket (ws)
- **Execution Environment**: Docker

## License

MIT
