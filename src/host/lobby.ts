/**
 * Host Lobby - Shows QR code and player list
 */

import QRCode from 'qrcode';

interface Player {
    name: string;
    isFirst: boolean;
}

class HostLobby {
    private ws: WebSocket | null = null;
    private players: Player[] = [];

    constructor() {
        this.connectToServer();
    }

    private async generateQRCode(localIP: string, webPort: number): Promise<void> {
        const partyUrl = `http://${localIP}:${webPort}/party`;

        // Display the URL
        const urlElement = document.getElementById('joinUrl');
        if (urlElement) {
            urlElement.textContent = partyUrl;
        }

        // Generate QR code
        const qrContainer = document.getElementById('qrCode');
        if (qrContainer) {
            // Clear any existing content
            qrContainer.innerHTML = '';

            try {
                const canvas = await QRCode.toCanvas(partyUrl, {
                    width: 250,
                    margin: 0,
                    color: {
                        dark: '#1a1a2e',
                        light: '#ffffff'
                    }
                });
                qrContainer.appendChild(canvas);
                console.log('QR code generated for:', partyUrl);
            } catch (err) {
                console.error('Failed to generate QR code:', err);
                qrContainer.textContent = 'Failed to generate QR code';
            }
        }
    }

    private connectToServer(): void {
        const host = window.location.hostname || 'localhost';
        const serverUrl = `ws://${host}:3003`;

        console.log('Connecting to server:', serverUrl);
        this.ws = new WebSocket(serverUrl);

        this.ws.onopen = () => {
            console.log('Connected to server');
            // Register as host (observer mode)
            this.ws?.send(JSON.stringify({ type: 'host-connect' }));
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('Received:', message);

                switch (message.type) {
                    case 'host-info':
                        // Generate QR code with the server's local IP
                        this.generateQRCode(message.localIP, message.webPort);
                        this.players = message.players;
                        this.updatePlayerList();
                        this.updateWaitingMessage();
                        break;
                    case 'player-list':
                        this.players = message.players;
                        this.updatePlayerList();
                        this.updateWaitingMessage();
                        break;
                    case 'game-start':
                        console.log('Game starting!');
                        // TODO: Transition to game view
                        break;
                }
            } catch (err) {
                console.error('Error parsing message:', err);
            }
        };

        this.ws.onerror = (err) => {
            console.error('WebSocket error:', err);
        };

        this.ws.onclose = () => {
            console.log('Disconnected from server');
            // Try to reconnect after 2 seconds
            setTimeout(() => this.connectToServer(), 2000);
        };
    }

    private updatePlayerList(): void {
        const listElement = document.getElementById('playerList');
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
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
    new HostLobby();
    console.log('Host lobby initialized');
});
