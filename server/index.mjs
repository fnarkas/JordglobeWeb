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
import { getRandomCity, calculateDistance } from './cities.mjs';

const PORT = 3003;
const WEB_PORT = 3000; // Vite server port

// Get local network IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
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
const hosts = new Set();
let gameStarted = false;
let currentCity = null;
const answers = new Map(); // playerName -> { lat, lon }
const scores = new Map();  // playerName -> total score

function broadcast(message) {
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(data);
        }
    });
}

function getPlayerList() {
    return players.map(p => ({
        name: p.name,
        isFirst: p.isFirst,
        score: scores.get(p.name) || 0
    }));
}

function startNewRound() {
    answers.clear();
    currentCity = getRandomCity();
    console.log(`New round: ${currentCity.name}, ${currentCity.country}`);

    broadcast({
        type: 'question',
        city: currentCity.name,
        country: currentCity.country
    });
}

function checkAllAnswered() {
    if (players.length === 0) return;

    const allAnswered = players.every(p => answers.has(p.name));
    if (!allAnswered) return;

    // Calculate results
    const results = players.map(p => {
        const answer = answers.get(p.name);
        const distance = calculateDistance(
            currentCity.lat, currentCity.lon,
            answer.lat, answer.lon
        );
        return {
            name: p.name,
            distance: distance,
            lat: answer.lat,
            lon: answer.lon
        };
    });

    // Sort by distance (closest first)
    results.sort((a, b) => a.distance - b.distance);

    // Assign points: last place = 0, 2nd last = 1, etc.
    const numPlayers = results.length;
    results.forEach((r, i) => {
        r.points = numPlayers - 1 - i;
        const currentScore = scores.get(r.name) || 0;
        scores.set(r.name, currentScore + r.points);
        r.totalScore = scores.get(r.name);
    });

    console.log('All answered! Results:', results);

    broadcast({
        type: 'reveal',
        correct: {
            name: currentCity.name,
            country: currentCity.country,
            lat: currentCity.lat,
            lon: currentCity.lon
        },
        results: results,
        players: getPlayerList()
    });
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
                    ws.send(JSON.stringify({
                        type: 'host-info',
                        localIP,
                        webPort: WEB_PORT,
                        players: getPlayerList()
                    }));
                    break;
                }

                case 'join': {
                    if (players.some(p => p.name === message.name)) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Name already taken'
                        }));
                        return;
                    }

                    const isFirst = players.length === 0;
                    playerName = message.name;
                    players.push({ name: playerName, isFirst, ws });

                    console.log(`Player joined: ${playerName} (isFirst: ${isFirst})`);

                    ws.send(JSON.stringify({
                        type: 'joined',
                        name: playerName,
                        isFirst,
                        players: getPlayerList()
                    }));

                    broadcast({
                        type: 'player-list',
                        players: getPlayerList()
                    });
                    break;
                }

                case 'start-game': {
                    const player = players.find(p => p.name === playerName);
                    if (player && player.isFirst) {
                        gameStarted = true;
                        console.log('Game started!');
                        broadcast({ type: 'game-start' });

                        // Start first round after short delay
                        setTimeout(() => startNewRound(), 2000);
                    }
                    break;
                }

                case 'submit-answer': {
                    if (!gameStarted || !currentCity) return;
                    if (answers.has(playerName)) return; // Already answered

                    answers.set(playerName, { lat: message.lat, lon: message.lon });
                    console.log(`${playerName} answered: lat=${message.lat}, lon=${message.lon}`);

                    // Broadcast that this player answered
                    broadcast({
                        type: 'player-answered',
                        playerName: playerName
                    });

                    // Check if all players have answered
                    checkAllAnswered();
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

                if (players.length > 0 && !players.some(p => p.isFirst)) {
                    players[0].isFirst = true;
                    console.log(`New host: ${players[0].name}`);
                }

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
