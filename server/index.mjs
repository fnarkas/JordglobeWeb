/**
 * JordGlobe Party Server
 *
 * Simple WebSocket server for coordinating players.
 * Kept separate to avoid merge conflicts - can be integrated with host later.
 *
 * Run with: npm run server
 */

import { WebSocketServer } from 'ws';

const PORT = 3003;
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

// Game state
const players = [];
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

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log('Received:', message);

            switch (message.type) {
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
        if (playerName) {
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
