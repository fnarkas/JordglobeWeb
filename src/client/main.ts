// Client Entry Point
// Mobile player app - join screen and globe with pin placement

import { JoinScreen } from './JoinScreen';
import { WaitingScreen } from './WaitingScreen';
import { GameSocket } from './socket';

// Initialize the application when page loads
window.addEventListener('DOMContentLoaded', async () => {
    const joinScreen = new JoinScreen();
    const waitingScreen = new WaitingScreen();
    const socket = new GameSocket();

    // Track current player state
    let myName = '';
    let isFirstPlayer = false;

    // Set up socket handlers
    socket.on('joined', (data) => {
        myName = data.name;
        isFirstPlayer = data.isFirst;

        // Hide join screen, show waiting screen
        const joinContainer = document.querySelector('.join-container') as HTMLElement;
        if (joinContainer) {
            joinContainer.style.display = 'none';
        }

        waitingScreen.show(myName, isFirstPlayer, data.players);
        console.log(`Joined as ${myName} (isFirst: ${isFirstPlayer})`);
    });

    socket.on('player-list', (data) => {
        // Check if we're still first (in case host left)
        const me = data.players.find(p => p.name === myName);
        if (me) {
            isFirstPlayer = me.isFirst;
        }
        waitingScreen.show(myName, isFirstPlayer, data.players);
    });

    socket.on('game-start', () => {
        console.log('Game starting!');
        waitingScreen.hide();
        // TODO: Show the globe for gameplay
    });

    socket.on('error', (data) => {
        alert(data.message);
        joinScreen.enable();
    });

    // Handle join
    joinScreen.onJoin(async (name) => {
        joinScreen.disable();

        try {
            await socket.connect();
            socket.join(name);
        } catch (err) {
            console.error('Failed to connect:', err);
            alert('Could not connect to server. Is it running?');
            joinScreen.enable();
        }
    });

    // Handle start game
    waitingScreen.onStart(() => {
        console.log('Starting game...');
        socket.startGame();
    });

    console.log('Client app initialized - JoinScreen ready');
});
