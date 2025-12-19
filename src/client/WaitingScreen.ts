/**
 * WaitingScreen - Shown after joining, first player can start the game
 */

export interface Player {
    name: string;
    isFirst: boolean;
}

export class WaitingScreen {
    private container: HTMLElement;
    private onStartCallback: (() => void) | null = null;
    private playerName: string = '';

    constructor() {
        this.container = this.createContainer();
        document.body.appendChild(this.container);
        this.hide(); // Hidden by default
    }

    private createContainer(): HTMLElement {
        const container = document.createElement('div');
        container.id = 'waitingScreen';
        container.innerHTML = `
            <div class="waiting-content">
                <h2 id="waitingTitle">Waiting for players...</h2>
                <ul id="playerList"></ul>
                <p id="waitingMessage"></p>
                <button id="startButton">START PARTY</button>
            </div>
        `;
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 100;
        `;

        const content = container.querySelector('.waiting-content') as HTMLElement;
        content.style.cssText = `
            text-align: center;
            padding: 40px;
            max-width: 400px;
            width: 90%;
        `;

        const title = container.querySelector('#waitingTitle') as HTMLElement;
        title.style.cssText = `
            color: white;
            font-size: 1.5rem;
            margin-bottom: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        const playerList = container.querySelector('#playerList') as HTMLElement;
        playerList.style.cssText = `
            list-style: none;
            padding: 0;
            margin: 0 0 20px 0;
        `;

        const message = container.querySelector('#waitingMessage') as HTMLElement;
        message.style.cssText = `
            color: rgba(255, 255, 255, 0.7);
            font-size: 1rem;
            margin-bottom: 30px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        const button = container.querySelector('#startButton') as HTMLButtonElement;
        button.style.cssText = `
            padding: 20px 50px;
            font-size: 1.5rem;
            font-weight: bold;
            color: white;
            background: #e94560;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 2px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            transition: all 0.3s ease;
        `;

        button.addEventListener('mouseover', () => {
            button.style.background = '#ff6b6b';
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 10px 30px rgba(233, 69, 96, 0.4)';
        });

        button.addEventListener('mouseout', () => {
            button.style.background = '#e94560';
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = 'none';
        });

        button.addEventListener('click', () => {
            if (this.onStartCallback) {
                this.onStartCallback();
            }
        });

        return container;
    }

    show(playerName: string, isFirstPlayer: boolean, players: Player[]): void {
        this.container.style.display = 'flex';
        this.playerName = playerName;

        const button = this.container.querySelector('#startButton') as HTMLButtonElement;
        const message = this.container.querySelector('#waitingMessage') as HTMLElement;
        const playerList = this.container.querySelector('#playerList') as HTMLElement;

        // Update player list
        this.updatePlayerList(players);

        if (isFirstPlayer) {
            message.textContent = "You're the party host!";
            button.style.display = 'block';
        } else {
            const firstPlayer = players.find(p => p.isFirst);
            const hostName = firstPlayer ? firstPlayer.name : 'host';
            message.textContent = `Waiting for ${hostName} to start the game`;
            button.style.display = 'none';
        }
    }

    updatePlayerList(players: Player[]): void {
        const playerList = this.container.querySelector('#playerList') as HTMLElement;
        playerList.innerHTML = '';

        players.forEach(player => {
            const li = document.createElement('li');
            li.style.cssText = `
                color: white;
                font-size: 1.2rem;
                padding: 10px 20px;
                margin: 8px 0;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;

            // Highlight current player
            if (player.name === this.playerName) {
                li.style.background = 'rgba(233, 69, 96, 0.3)';
                li.style.border = '1px solid #e94560';
            }

            // Show host indicator
            const hostBadge = player.isFirst ? ' ⭐' : '';
            li.textContent = player.name + hostBadge;

            playerList.appendChild(li);
        });
    }

    hide(): void {
        this.container.style.display = 'none';
    }

    onStart(callback: () => void): void {
        this.onStartCallback = callback;
    }
}
