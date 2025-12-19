/**
 * JoinScreen - Name input screen for players joining the game
 */

export class JoinScreen {
    private nameInput: HTMLInputElement;
    private joinButton: HTMLButtonElement;
    private onJoinCallback: ((name: string) => void) | null = null;

    constructor() {
        this.nameInput = document.getElementById('nameInput') as HTMLInputElement;
        this.joinButton = document.getElementById('joinButton') as HTMLButtonElement;

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Handle join button click
        this.joinButton.addEventListener('click', () => this.handleJoin());

        // Handle Enter key in input
        this.nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleJoin();
            }
        });

        // Enable/disable button based on input
        this.nameInput.addEventListener('input', () => {
            this.joinButton.disabled = this.nameInput.value.trim().length === 0;
        });

        // Initial state
        this.joinButton.disabled = true;
    }

    private handleJoin(): void {
        const name = this.nameInput.value.trim();
        if (name.length > 0 && this.onJoinCallback) {
            this.onJoinCallback(name);
        }
    }

    /**
     * Register a callback for when the player joins
     */
    onJoin(callback: (name: string) => void): void {
        this.onJoinCallback = callback;
    }

    /**
     * Disable the join form (e.g., while connecting)
     */
    disable(): void {
        this.nameInput.disabled = true;
        this.joinButton.disabled = true;
        this.joinButton.textContent = 'JOINING...';
    }

    /**
     * Re-enable the join form (e.g., if connection fails)
     */
    enable(): void {
        this.nameInput.disabled = false;
        this.joinButton.disabled = this.nameInput.value.trim().length === 0;
        this.joinButton.textContent = 'JOIN';
    }
}
