/**
 * JordGlobe Production Server
 *
 * Combined Express + WebSocket server for Cloud Run deployment.
 * Serves static files (frontend + assets) and handles WebSocket multiplayer game.
 *
 * Run with: npm start
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getRandomCity, calculateDistance } from './cities.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const PORT = process.env.PORT || 8080;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Express app
const app = express();
const server = createServer(app);

// Logging
function log(message, data = null) {
    const timestamp = new Date().toISOString();
    const logLine = data
        ? `[${timestamp}] ${message} ${JSON.stringify(data)}`
        : `[${timestamp}] ${message}`;
    console.log(logLine);
}

// URL routing middleware - rewrite clean URLs to .html files
app.get('/party', (req, res, next) => {
    req.url = '/party.html';
    next();
});

app.get('/host', (req, res, next) => {
    req.url = '/host.html';
    next();
});

// Serve static files
// Vite build output (frontend)
app.use(express.static(join(__dirname, '../dist')));

// Public assets (textures, JSON files, etc.)
app.use(express.static(join(__dirname, '../public')));

// Health check endpoint for Cloud Run
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', players: players.length });
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../dist/index.html'));
});

// WebSocket Server
const wss = new WebSocketServer({ server });

// Game state (same as development server)
const players = [];
const hosts = new Set();
let gameStarted = false;
let currentCity = null;
const answers = new Map();
const scores = new Map();
let maxRounds = 2;
let currentRound = 0;

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
    currentRound++;
    currentCity = getRandomCity();
    log(`Round ${currentRound}/${maxRounds}: ${currentCity.name}, ${currentCity.country}`);

    broadcast({
        type: 'question',
        city: currentCity.name,
        country: currentCity.country,
        round: currentRound,
        maxRounds: maxRounds
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

    // Assign points
    const numPlayers = results.length;
    results.forEach((r, i) => {
        r.points = numPlayers - 1 - i;
        const currentScore = scores.get(r.name) || 0;
        scores.set(r.name, currentScore + r.points);
        r.totalScore = scores.get(r.name);
    });

    log('All answered! Results:', results);

    broadcast({
        type: 'reveal',
        correct: {
            name: currentCity.name,
            country: currentCity.country,
            lat: currentCity.lat,
            lon: currentCity.lon
        },
        results: results,
        players: getPlayerList(),
        round: currentRound,
        maxRounds: maxRounds
    });

    // Check if game is over
    if (currentRound >= maxRounds) {
        setTimeout(() => {
            log('Game finished! Sending final results...');
            broadcast({
                type: 'final-results',
                players: getPlayerList()
            });
        }, 5000);
    }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
    log('Client connected');
    let playerName = null;
    let isHost = false;

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            log('Received:', message);

            switch (message.type) {
                case 'host-connect': {
                    isHost = true;
                    hosts.add(ws);
                    log('Host connected');

                    // Send join URL for QR code generation
                    // In production, this will be the Cloud Run URL
                    // In local testing, this will be localhost:8080
                    const protocol = IS_PRODUCTION ? 'https' : 'http';
                    const host = message.host || 'localhost'; // Client can optionally send their hostname
                    const joinUrl = `${protocol}://${host}${IS_PRODUCTION ? '' : `:${PORT}`}/party`;

                    ws.send(JSON.stringify({
                        type: 'host-info',
                        joinUrl: joinUrl,
                        players: getPlayerList()
                    }));
                    log('Sent join URL:', joinUrl);
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

                    log(`Player joined: ${playerName} (isFirst: ${isFirst})`);

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
                        currentRound = 0;
                        scores.clear();

                        if (message.maxRounds && message.maxRounds > 0) {
                            maxRounds = message.maxRounds;
                        }

                        log(`Game started! Max rounds: ${maxRounds}`);
                        broadcast({ type: 'game-start', maxRounds });

                        setTimeout(() => startNewRound(), 2000);
                    }
                    break;
                }

                case 'submit-answer': {
                    if (!gameStarted || !currentCity) return;
                    if (answers.has(playerName)) return;

                    answers.set(playerName, { lat: message.lat, lon: message.lon });
                    log(`${playerName} answered: lat=${message.lat}, lon=${message.lon}`);

                    broadcast({
                        type: 'player-answered',
                        playerName: playerName
                    });

                    checkAllAnswered();
                    break;
                }

                case 'next-round': {
                    const player = players.find(p => p.name === playerName);
                    log(`next-round request from ${playerName} (isFirst: ${player?.isFirst})`);

                    if (player && player.isFirst && gameStarted) {
                        if (currentRound >= maxRounds) {
                            log('Game already finished');
                        } else {
                            log('Starting next round...');
                            startNewRound();
                        }
                    }
                    break;
                }

                case 'reset-game': {
                    log('Resetting game state...');

                    players.length = 0;
                    hosts.clear();
                    gameStarted = false;
                    currentCity = null;
                    answers.clear();
                    scores.clear();
                    currentRound = 0;
                    maxRounds = 2;

                    broadcast({ type: 'game-reset' });
                    log('Game reset complete');
                    break;
                }
            }
        } catch (err) {
            log('Error parsing message:', err);
        }
    });

    ws.on('close', () => {
        if (isHost) {
            hosts.delete(ws);
            log('Host disconnected');
        } else if (playerName) {
            const index = players.findIndex(p => p.name === playerName);
            if (index !== -1) {
                players.splice(index, 1);
                log(`Player left: ${playerName}`);

                if (players.length > 0 && !players.some(p => p.isFirst)) {
                    players[0].isFirst = true;
                    log(`New host: ${players[0].name}`);
                }

                broadcast({
                    type: 'player-list',
                    players: getPlayerList()
                });
            }
        }
        log('Client disconnected');
    });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    log(`JordGlobe Production Server running on port ${PORT}`);
    log(`Environment: ${IS_PRODUCTION ? 'production' : 'development'}`);
    log('Serving static files from dist/ and public/');
    log('WebSocket server ready');
});
