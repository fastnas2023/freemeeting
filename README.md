# FreeMeeting Screen Share

Simple, browser-based screen sharing application for meetings.

## Tech Stack
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Node.js + Express + Socket.io
- **Protocol:** WebRTC (Peer-to-Peer) for media, WebSocket for signaling.

## Project Structure
- `client/`: React frontend application.
- `server/`: Node.js signaling server.

## Getting Started

### Prerequisites
- Node.js (v16+)
- npm

### Installation

1.  **Server:**
    ```bash
    cd server
    npm install
    ```

2.  **Client:**
    ```bash
    cd client
    npm install
    ```

### Running the Application

1.  **Start the Signaling Server:**
    ```bash
    cd server
    node index.js
    ```
    Server runs on `http://localhost:5001`.

2.  **Start the Client:**
    Open a new terminal:
    ```bash
    cd client
    npm run dev
    ```
    Client runs on `http://localhost:5173`.

## Usage
1.  Open the client URL in your browser.
2.  Enter a Room ID (e.g., "room-1") and click "Join Room".
3.  Open the same URL in another tab (or another browser/device).
4.  Join the same Room ID ("room-1").
5.  Click "Start Screen Share" in one tab.
6.  The other tab should see the shared screen.

## Features
- Create/Join Rooms.
- Real-time Screen Sharing via WebRTC.
- Multi-user support (Mesh topology - everyone sees everyone's share).

## Future Improvements
- Audio/Voice Chat.
- Text Chat.
- Better error handling (e.g., user leaves).
- Turn Server support for better connectivity over NATs.
