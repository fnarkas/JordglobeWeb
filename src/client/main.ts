// Client Entry Point
// Mobile player app - globe with pin placement

import { EarthGlobe } from '../earthGlobe';

// Initialize the application when page loads
window.addEventListener('DOMContentLoaded', () => {
    const app = new EarthGlobe('renderCanvas');

    // Make the app accessible globally for debugging
    (window as unknown as { earthGlobe: EarthGlobe }).earthGlobe = app;

    console.log('Client app initialized');
});
