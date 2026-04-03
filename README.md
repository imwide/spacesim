# SpaceSim

A lightweight browser multiplayer prototype with:

- simple account registration and login
- shared 3D space using realtime sockets
- zero-g EVA movement with preserved momentum
- a personal ship you can board, walk inside, and pilot
- a procedural starfield and asteroid backdrop

## Stack

- React + TypeScript + Vite
- Three.js via React Three Fiber
- Node.js + Express + Socket.IO
- JSON-backed auth storage with hashed passwords

## Run locally

1. Install dependencies:
   - `npm install`
2. Start client and server together:
   - `npm run dev`
3. Open the client at `http://localhost:5173`

## Build

- `npm run build`

## Notes

- Accounts are stored in [server/data/users.json](server/data/users.json).
- The current multiplayer model is prototype-grade and client-authoritative.
- Click the viewport to capture the mouse.
- In space, use `WASD` to thrust. Momentum persists until you counter-thrust.
- Near your ship, press `E` to enter.
- Inside the ship, use `WASD` to walk and `F` near the seat to pilot.
- Press `X` to leave the ship interior or stand up from the pilot seat.
# spacesim
