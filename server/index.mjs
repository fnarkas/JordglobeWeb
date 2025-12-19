/**
 * JordGlobe Party Server
 *
 * Simple WebSocket server for coordinating players.
 * Kept separate to avoid merge conflicts - can be integrated with host later.
 *
 * Run with: npm run server
 */

import { WebSocketServer } from 'ws';
import os from 'os';

const PORT = 3003;
const WEB_PORT = 3000; // Vite server port

// Get local network IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal (loopback) and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

// Game state
const players = [];
const hosts = new Set(); // Host connections (observers)
let gameStarted = false;

function broadcast(message) {
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(data);
        }
    });
}

function getPlayerList() {
    return players.map(p => ({
        name: p.name,
        isFirst: p.isFirst
    }));
}

wss.on('connection', (ws) => {
    console.log('Client connected');
    let playerName = null;
    let isHost = false;

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log('Received:', message);

            switch (message.type) {
                case 'host-connect': {
                    isHost = true;
                    hosts.add(ws);
                    const localIP = getLocalIP();
                    console.log('Host connected, local IP:', localIP);
                    // Send host info including local IP for QR code
                    ws.send(JSON.stringify({
                        type: 'host-info',
                        localIP,
                        webPort: WEB_PORT,
                        players: getPlayerList()
                    }));
                    break;
                }

                case 'join': {
                    // Check if name already taken
                    if (players.some(p => p.name === message.name)) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Name already taken'
                        }));
                        return;
                    }

                    // Add player
                    const isFirst = players.length === 0;
                    playerName = message.name;
                    players.push({
                        name: playerName,
                        isFirst,
                        ws
                    });

                    console.log(`Player joined: ${playerName} (isFirst: ${isFirst})`);

                    // Send confirmation to joining player
                    ws.send(JSON.stringify({
                        type: 'joined',
                        name: playerName,
                        isFirst,
                        players: getPlayerList()
                    }));

                    // Broadcast updated player list to all
                    broadcast({
                        type: 'player-list',
                        players: getPlayerList()
                    });
                    break;
                }

                case 'start-game': {
                    // Only first player can start
                    const player = players.find(p => p.name === playerName);
                    if (player && player.isFirst) {
                        gameStarted = true;
                        console.log('Game started!');
                        broadcast({ type: 'game-start' });
                    }
                    break;
                }
            }
        } catch (err) {
            console.error('Error parsing message:', err);
        }
    });

    ws.on('close', () => {
        if (isHost) {
            hosts.delete(ws);
            console.log('Host disconnected');
        } else if (playerName) {
            const index = players.findIndex(p => p.name === playerName);
            if (index !== -1) {
                players.splice(index, 1);
                console.log(`Player left: ${playerName}`);

                // If first player left, assign new first player
                if (players.length > 0 && !players.some(p => p.isFirst)) {
                    players[0].isFirst = true;
                    console.log(`New host: ${players[0].name}`);
                }

                // Broadcast updated player list
                broadcast({
                    type: 'player-list',
                    players: getPlayerList()
                });
            }
        }
        console.log('Client disconnected');
    });
});

console.log(`JordGlobe Party Server running on ws://localhost:${PORT}`);
console.log('Waiting for players to join...');
