// Babylon.js Earth Globe Application
// Main entry point - initializes EarthGlobe

// Inspector - only include in development builds
if (import.meta.env.DEV) {
    import('@babylonjs/inspector');
}

import { EarthGlobe } from './earthGlobe';

// Initialize the application when page loads
window.addEventListener('DOMContentLoaded', () => {
    const app = new EarthGlobe('renderCanvas');
    // Make the app accessible globally for debugging and external use
    (window as unknown as { earthGlobe: EarthGlobe }).earthGlobe = app;
});

// Export for external use
export { EarthGlobe };
export type { CountryPolygon, LatLon } from './countryPicker';
