/**
 * WebSocket client for JordGlobe Party
 *
 * Handles communication with the game server.
 */

import { Player } from './WaitingScreen';

type MessageHandler = {
    'joined': (data: { name: string; isFirst: boolean; players: Player[] }) => void;
    'player-list': (data: { players: Player[] }) => void;
    'game-start': () => void;
    'error': (data: { message: string }) => void;
};

export class GameSocket {
    private ws: WebSocket | null = null;
    private handlers: Partial<MessageHandler> = {};
    private serverUrl: string;

    constructor(serverUrl?: string) {
        // Use same host as the page, but port 3003
        const host = window.location.hostname || 'localhost';
        this.serverUrl = serverUrl || `ws://${host}:3003`;
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.serverUrl);

            this.ws.onopen = () => {
                console.log('Connected to server');
                resolve();
            };

            this.ws.onerror = (err) => {
                console.error('WebSocket error:', err);
                reject(err);
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    console.log('Received:', message);

                    const handler = this.handlers[message.type as keyof MessageHandler];
                    if (handler) {
                        (handler as Function)(message);
                    }
                } catch (err) {
                    console.error('Error parsing message:', err);
                }
            };

            this.ws.onclose = () => {
                console.log('Disconnected from server');
            };
        });
    }

    join(name: string): void {
        this.send({ type: 'join', name });
    }

    startGame(): void {
        this.send({ type: 'start-game' });
    }

    on<K extends keyof MessageHandler>(event: K, handler: MessageHandler[K]): void {
        this.handlers[event] = handler;
    }

    private send(message: object): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
}
