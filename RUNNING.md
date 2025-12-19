# Running JordGlobe

## Development - 3 Servers Required

Run these in **separate terminal tabs/windows**:

### Terminal 1 - Frontend Dev Server (Port 3000)
```bash
npm run frontend
```
Serves web pages with hot reload.

### Terminal 2 - Game Server (Port 3003)
```bash
npm run game-server
```
Handles multiplayer game logic via WebSockets.

### Terminal 3 - Log Server (Port 9999)
```bash
npm run log-server
```
Captures browser console logs to `browser-console.log`.

## Quick Start (All in one)
```bash
npm run dev
```
Starts all 3 servers in one terminal (harder to see individual logs).

## Accessing the Game

- **Host Display**: http://localhost:3000/host.html
- **Mobile Players**: http://localhost:3000/party
- **Bot Panel** (testing): http://localhost:3000/bot-panel.html

## Logs

- **Game Server**: `game-server.log`
- **Browser Console**: `browser-console.log`
- **Frontend**: Terminal output
