/**
 * Test page for ArcDrawer
 * Draws geodesic arcs from various locations to a target (Paris)
 */

import { EarthGlobe } from './earthGlobe';
import { ArcDrawer } from './arcDrawer';
import { PLAYER_COLORS } from '../shared/playerColors';

// Initialize EarthGlobe
const globe = new EarthGlobe('renderCanvas');
(window as any).earthGlobe = globe;

// Wait for globe to initialize, then set up arc drawer
setTimeout(() => {
    const scene = globe.getScene();
    const arcDrawer = new ArcDrawer(scene, globe);
    (window as any).arcDrawer = arcDrawer;

    // Test locations
    const paris = { lat: 48.8584, lon: 2.2945 }; // Target (correct answer)
    const testLocations = [
        { name: 'New York', lat: 40.7128, lon: -74.0060 },
        { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
        { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
        { name: 'Cape Town', lat: -33.9249, lon: 18.4241 },
        { name: 'London', lat: 51.5074, lon: -0.1278 },
        { name: 'Moscow', lat: 55.7558, lon: 37.6173 },
    ];

    const statusEl = document.getElementById('status');
    const updateStatus = (text: string) => {
        if (statusEl) statusEl.textContent = text;
        console.log(text);
    };

    // Button handlers
    document.getElementById('addArcs')?.addEventListener('click', () => {
        arcDrawer.clearArcs();

        testLocations.forEach((loc, i) => {
            const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
            const arcId = arcDrawer.addArc(
                loc.lat, loc.lon,
                paris.lat, paris.lon,
                color
            );
            console.log(`Added arc from ${loc.name} to Paris: ${arcId}`);
        });

        // Set all arcs to 100% immediately (no animation)
        arcDrawer.getArcIds().forEach(id => {
            arcDrawer.setArcProgress(id, 1);
        });

        updateStatus(`Added ${testLocations.length} arcs to Paris`);
    });

    document.getElementById('animate')?.addEventListener('click', async () => {
        arcDrawer.clearArcs();

        // Add arcs with 0% progress
        testLocations.forEach((loc, i) => {
            const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
            arcDrawer.addArc(
                loc.lat, loc.lon,
                paris.lat, paris.lon,
                color
            );
        });

        updateStatus('Animating arcs...');
        await arcDrawer.animateArcs(1200);
        updateStatus('Animation complete!');
    });

    document.getElementById('clear')?.addEventListener('click', () => {
        arcDrawer.clearArcs();
        updateStatus('Cleared all arcs');
    });

    updateStatus('Ready - click "Add Test Arcs" to begin');

}, 1000);
