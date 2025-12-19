/**
 * Host Lobby - Shows QR code and player list, then game with globe + leaderboard
 */

import QRCode from 'qrcode';
import { EarthGlobe } from '../earthGlobe';
import { RevealVisualizer } from './revealVisualizer';
import { Confetti } from '../confetti';
import { config } from '../config';

interface Player {
    name: string;
    isFirst: boolean;
    score?: number;
    hasAnswered?: boolean;
}

class HostLobby {
    private ws: WebSocket | null = null;
    private players: Player[] = [];
    private globe: EarthGlobe | null = null;
    private revealVisualizer: RevealVisualizer | null = null;
    private questionOverlay: HTMLElement | null = null;
    private resultsOverlay: HTMLElement | null = null;
    private finalResultsOverlay: HTMLElement | null = null;
    private confetti: Confetti | null = null;

    constructor() {
        this.connectToServer();
    }

    private async generateQRCode(joinUrl: string): Promise<void> {
        const urlElement = document.getElementById('joinUrl');
        if (urlElement) {
            urlElement.textContent = joinUrl;
        }

        const qrContainer = document.getElementById('qrCode');
        if (qrContainer) {
            qrContainer.innerHTML = '';
            try {
                const canvas = await QRCode.toCanvas(joinUrl, {
                    width: 250,
                    margin: 0,
                    color: { dark: '#1a1a2e', light: '#ffffff' }
                });
                qrContainer.appendChild(canvas);
                console.log('QR code generated for:', joinUrl);
            } catch (err) {
                console.error('Failed to generate QR code:', err);
            }
        }
    }

    private connectToServer(): void {
        const serverUrl = config.websocketUrl;

        console.log('Connecting to server:', serverUrl);
        this.ws = new WebSocket(serverUrl);

        this.ws.onopen = () => {
            console.log('Connected to server');
            // Send hostname so server can generate correct join URL
            const hostname = window.location.hostname;
            this.ws?.send(JSON.stringify({
                type: 'host-connect',
                host: hostname
            }));
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('Received:', message);

                switch (message.type) {
                    case 'host-info':
                        // Handle both old format (dev server) and new format (production server)
                        let joinUrl: string;
                        if (message.joinUrl) {
                            // New format (production server)
                            joinUrl = message.joinUrl;
                        } else if (message.localIP && message.webPort) {
                            // Old format (dev server) - for backward compatibility
                            joinUrl = `http://${message.localIP}:${message.webPort}/party`;
                        } else {
                            console.error('Invalid host-info message - missing joinUrl or localIP/webPort');
                            break;
                        }

                        this.generateQRCode(joinUrl);
                        this.players = message.players;
                        this.updateLobbyPlayerList();
                        this.updateWaitingMessage();
                        break;

                    case 'player-list':
                        this.players = message.players;
                        this.updateLobbyPlayerList();
                        this.updateWaitingMessage();
                        this.updateLeaderboard();
                        break;

                    case 'game-start':
                        console.log('Game starting!');
                        this.startGame();
                        break;

                    case 'question':
                        this.showQuestion(message.city);
                        break;

                    case 'player-answered':
                        this.markPlayerAnswered(message.playerName);
                        break;

                    case 'reveal':
                        this.showResults(message.correct, message.results, message.players);
                        break;

                    case 'final-results':
                        this.showFinalResults(message.players);
                        break;
                }
            } catch (err) {
                console.error('Error parsing message:', err);
            }
        };

        this.ws.onerror = (err) => console.error('WebSocket error:', err);
        this.ws.onclose = () => {
            console.log('Disconnected from server');
            setTimeout(() => this.connectToServer(), 2000);
        };
    }

    private async startGame(): Promise<void> {
        const lobbyScreen = document.getElementById('lobbyScreen');
        const gameScreen = document.getElementById('gameScreen');

        if (lobbyScreen) lobbyScreen.style.display = 'none';
        if (gameScreen) gameScreen.style.display = 'block';

        this.globe = new EarthGlobe('renderCanvas', { showPinUI: false });
        (window as unknown as { earthGlobe: EarthGlobe }).earthGlobe = this.globe;

        // Initialize reveal visualizer
        this.revealVisualizer = new RevealVisualizer(
            this.globe,
            this.globe.getScene(),
            this.globe.getCamera()
        );
        await this.revealVisualizer.init();

        this.createQuestionOverlay();
        this.createResultsOverlay();
        this.createFinalResultsOverlay();
        this.players = this.players.map(p => ({ ...p, score: 0 }));
        this.updateLeaderboard();
    }

    private createResultsOverlay(): void {
        this.resultsOverlay = document.createElement('div');
        this.resultsOverlay.id = 'resultsOverlay';
        this.resultsOverlay.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(26, 26, 46, 0.98);
            padding: 30px 50px;
            border-radius: 20px;
            text-align: center;
            z-index: 200;
            border: 2px solid #e94560;
            display: none;
            min-width: 450px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        document.querySelector('.globe-container')?.appendChild(this.resultsOverlay);
    }

    private async showResults(correct: { name: string; country: string; lat: number; lon: number }, results: { name: string; distance: number; points: number; lat: number; lon: number }[], players?: Player[]): Promise<void> {
        if (!this.resultsOverlay) return;

        // Hide question overlay
        if (this.questionOverlay) {
            this.questionOverlay.style.display = 'none';
        }

        // Update players and leaderboard if provided
        if (players) {
            this.players = players;
            this.updateLeaderboard();
        }

        // Show visual reveal (pins + arcs) and wait for animation + delay
        if (this.revealVisualizer) {
            await this.revealVisualizer.showReveal({
                correct,
                results
            });
        }

        // Now show the results overlay after the delay
        this.resultsOverlay.innerHTML = `
            <div style="color: rgba(255,255,255,0.7); font-size: 1rem; margin-bottom: 5px;">The answer was</div>
            <div style="color: #e94560; font-size: 2rem; font-weight: bold; margin-bottom: 25px;">
                ${correct.name}, ${correct.country}
            </div>
            <div style="text-align: left;">
                ${results.map((r, i) => `
                    <div style="
                        display: flex;
                        align-items: center;
                        padding: 12px 20px;
                        margin: 8px 0;
                        background: ${i === 0 ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255,255,255,0.05)'};
                        border-radius: 10px;
                        ${i === 0 ? 'border: 1px solid rgba(255, 215, 0, 0.5);' : ''}
                    ">
                        <span style="
                            width: 30px;
                            height: 30px;
                            background: ${i === 0 ? 'rgba(255, 215, 0, 0.3)' : i === 1 ? 'rgba(192, 192, 192, 0.3)' : i === 2 ? 'rgba(205, 127, 50, 0.3)' : 'rgba(255,255,255,0.1)'};
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin-right: 15px;
                            font-weight: bold;
                            color: white;
                        ">${i + 1}</span>
                        <span style="flex: 1; color: white; font-size: 1.1rem;">${r.name}</span>
                        <span style="color: rgba(255,255,255,0.5); margin-right: 15px;">${r.distance.toLocaleString()} km</span>
                        <span style="color: ${r.points > 0 ? '#4CAF50' : 'rgba(255,255,255,0.5)'}; font-weight: bold;">+${r.points}p</span>
                    </div>
                `).join('')}
            </div>
        `;

        this.resultsOverlay.style.display = 'block';
    }

    private createQuestionOverlay(): void {
        this.questionOverlay = document.createElement('div');
        this.questionOverlay.id = 'questionOverlay';
        this.questionOverlay.style.cssText = `
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(26, 26, 46, 0.95);
            padding: 20px 40px;
            border-radius: 16px;
            text-align: center;
            z-index: 100;
            border: 2px solid #e94560;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        this.questionOverlay.innerHTML = `
            <div style="color: rgba(255,255,255,0.7); font-size: 1rem; margin-bottom: 10px;">Where is...</div>
            <div id="cityName" style="color: #e94560; font-size: 2.5rem; font-weight: bold;"></div>
            <div id="answerStatus" style="margin-top: 20px; display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;"></div>
        `;

        // Add CSS animation for dots
        const style = document.createElement('style');
        style.textContent = `
            @keyframes dotPulse {
                0%, 20% { opacity: 0; }
                40% { opacity: 1; }
                100% { opacity: 0; }
            }
            .waiting-dots span {
                animation: dotPulse 1.4s infinite;
            }
            .waiting-dots span:nth-child(2) { animation-delay: 0.2s; }
            .waiting-dots span:nth-child(3) { animation-delay: 0.4s; }
        `;
        document.head.appendChild(style);
        document.querySelector('.globe-container')?.appendChild(this.questionOverlay);
    }

    private showQuestion(city: string): void {
        if (!this.questionOverlay) return;

        // Hide results overlay if visible
        if (this.resultsOverlay) {
            this.resultsOverlay.style.display = 'none';
        }

        // Hide previous reveal visualization
        if (this.revealVisualizer) {
            this.revealVisualizer.hideReveal();
        }

        const cityEl = this.questionOverlay.querySelector('#cityName');
        if (cityEl) cityEl.textContent = city;

        // Reset all players' answer status
        this.players = this.players.map(p => ({ ...p, hasAnswered: false }));
        this.updateAnswerStatus();

        this.questionOverlay.style.display = 'block';
    }

    private updateAnswerStatus(): void {
        const statusEl = this.questionOverlay?.querySelector('#answerStatus');
        if (!statusEl) return;

        statusEl.innerHTML = this.players.map(p => `
            <div style="
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 15px;
                background: ${p.hasAnswered ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255,255,255,0.1)'};
                border-radius: 20px;
                border: 1px solid ${p.hasAnswered ? '#4CAF50' : 'transparent'};
            ">
                <span style="color: white;">${p.name}</span>
                ${p.hasAnswered
                    ? '<span style="color: #4CAF50; font-size: 1.2rem;">✓</span>'
                    : '<span class="waiting-dots" style="color: rgba(255,255,255,0.5);"><span>.</span><span>.</span><span>.</span></span>'
                }
            </div>
        `).join('');
    }

    private markPlayerAnswered(playerName: string): void {
        const player = this.players.find(p => p.name === playerName);
        if (player) {
            player.hasAnswered = true;
            this.updateAnswerStatus();
        }
    }

    private updateLobbyPlayerList(): void {
        const listElement = document.getElementById('lobbyPlayerList');
        if (!listElement) return;

        if (this.players.length === 0) {
            listElement.innerHTML = '<li class="no-players">Waiting for players to join...</li>';
            return;
        }

        listElement.innerHTML = this.players.map((player, index) => `
            <li class="${player.isFirst ? 'host' : ''}">
                <span class="player-number">${index + 1}</span>
                <span>${player.name}</span>
                ${player.isFirst ? '<span class="host-badge">Host</span>' : ''}
            </li>
        `).join('');
    }

    private updateWaitingMessage(): void {
        const messageElement = document.getElementById('waitingMessage');
        if (!messageElement) return;

        if (this.players.length === 0) {
            messageElement.textContent = '';
            return;
        }

        const hostPlayer = this.players.find(p => p.isFirst);
        if (hostPlayer) {
            messageElement.textContent = `Waiting for ${hostPlayer.name} to start the party...`;
        }
    }

    private updateLeaderboard(): void {
        const listElement = document.getElementById('leaderboard');
        if (!listElement) return;

        const sortedPlayers = [...this.players].sort((a, b) => (b.score || 0) - (a.score || 0));

        listElement.innerHTML = sortedPlayers.map((player, index) => `
            <li>
                <span class="leaderboard-rank">${index + 1}</span>
                <span class="leaderboard-name">${player.name}</span>
                <span class="leaderboard-score">${player.score || 0}</span>
            </li>
        `).join('');
    }

    private createFinalResultsOverlay(): void {
        this.finalResultsOverlay = document.createElement('div');
        this.finalResultsOverlay.id = 'finalResultsOverlay';
        this.finalResultsOverlay.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(26, 26, 46, 0.98);
            padding: 50px 60px;
            border-radius: 20px;
            text-align: center;
            z-index: 300;
            border: 2px solid #e94560;
            display: none;
            min-width: 500px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        document.querySelector('.globe-container')?.appendChild(this.finalResultsOverlay);
    }

    private showFinalResults(players: Player[]): void {
        if (!this.finalResultsOverlay) return;

        // Hide other overlays
        if (this.questionOverlay) this.questionOverlay.style.display = 'none';
        if (this.resultsOverlay) this.resultsOverlay.style.display = 'none';

        // Update players
        this.players = players;
        this.updateLeaderboard();

        // Sort players by score
        const sortedPlayers = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
        const winner = sortedPlayers[0];

        // Start confetti celebration!
        this.confetti = new Confetti();
        this.confetti.start(4000); // 4 seconds of confetti

        this.finalResultsOverlay.innerHTML = `
            <div style="color: rgba(255,255,255,0.7); font-size: 1.2rem; margin-bottom: 10px;">Game Over!</div>
            <div style="color: #e94560; font-size: 3rem; font-weight: bold; margin-bottom: 10px;">
                <span style="font-size: 3.5rem;">👑</span>
            </div>
            <div style="color: #FFD700; font-size: 2.5rem; font-weight: bold; margin-bottom: 30px;">
                ${winner.name} Wins!
            </div>
            <div style="color: rgba(255,255,255,0.6); font-size: 1.1rem; margin-bottom: 30px;">
                Final Score: ${winner.score} points
            </div>
            <div style="text-align: left; margin-top: 30px;">
                <div style="color: rgba(255,255,255,0.7); font-size: 1.3rem; margin-bottom: 15px; text-align: center;">Final Standings</div>
                ${sortedPlayers.map((p, i) => `
                    <div style="
                        display: flex;
                        align-items: center;
                        padding: 12px 20px;
                        margin: 8px 0;
                        background: ${i === 0 ? 'rgba(255, 215, 0, 0.2)' : i === 1 ? 'rgba(192, 192, 192, 0.2)' : i === 2 ? 'rgba(205, 127, 50, 0.2)' : 'rgba(255,255,255,0.05)'};
                        border-radius: 10px;
                        ${i === 0 ? 'border: 1px solid rgba(255, 215, 0, 0.5);' : ''}
                    ">
                        <span style="
                            width: 35px;
                            height: 35px;
                            background: ${i === 0 ? 'rgba(255, 215, 0, 0.3)' : i === 1 ? 'rgba(192, 192, 192, 0.3)' : i === 2 ? 'rgba(205, 127, 50, 0.3)' : 'rgba(255,255,255,0.1)'};
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin-right: 15px;
                            font-weight: bold;
                            color: white;
                        ">${i + 1}</span>
                        <span style="flex: 1; color: white; font-size: 1.2rem;">${i === 0 ? '👑 ' : ''}${p.name}</span>
                        <span style="color: #e94560; font-weight: bold; font-size: 1.2rem;">${p.score}p</span>
                    </div>
                `).join('')}
            </div>
        `;

        this.finalResultsOverlay.style.display = 'block';
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new HostLobby();
    console.log('Host lobby initialized');
});
