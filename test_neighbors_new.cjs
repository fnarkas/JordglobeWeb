#!/usr/bin/env node
// CLI test script for country-level neighbor detection
// Run with: node test_neighbors_new.js

const fs = require('fs');

// Helper function to check if two points are the same
function pointsMatch(p1, p2, epsilon = 0.0001) {
    const latDiff = Math.abs(p1.lat - p2.lat);
    const lonDiff = Math.abs(p1.lon - p2.lon);
    return latDiff < epsilon && lonDiff < epsilon;
}

// Check if two polygons share a border point
function sharesBorderPoint(points1, points2) {
    for (const p1 of points1) {
        for (const p2 of points2) {
            if (pointsMatch(p1, p2)) {
                return true;
            }
        }
    }
    return false;
}

// Main test function
async function testNeighbors() {
    console.log('Loading countries.json...\n');

    const countriesJson = JSON.parse(fs.readFileSync('public/countries.json', 'utf8'));
    const polygonsData = [];
    const countriesData = [];

    console.log(`Found ${countriesJson.length} countries in file\n`);

    // Process countries with the new structure
    for (const country of countriesJson) {
        if (!country.paths || country.paths === '[]') continue;

        try {
            const paths = JSON.parse(country.paths);
            const polygonIndices = [];

            for (const polygon of paths) {
                if (polygon.length === 0) continue;

                // Check for antimeridian crossing
                let hasLargeJump = false;
                for (let i = 1; i < polygon.length; i++) {
                    const lonDiff = Math.abs(polygon[i][1] - polygon[i - 1][1]);
                    if (lonDiff > 180) {
                        hasLargeJump = true;
                        break;
                    }
                }

                if (hasLargeJump) continue;

                // Convert to lat/lon points
                const borderPoints = [];
                for (const point of polygon) {
                    borderPoints.push({
                        lat: point[0],
                        lon: point[1]
                    });
                }

                if (borderPoints.length < 3) continue;

                // Add polygon
                const polygonIndex = polygonsData.length;
                polygonsData.push({
                    borderPoints: borderPoints,
                    countryIndex: countriesData.length
                });
                polygonIndices.push(polygonIndex);
            }

            if (polygonIndices.length > 0) {
                countriesData.push({
                    name: country.name_en,
                    polygonIndices: polygonIndices,
                    neighbourCountries: []
                });
            }
        } catch (e) {
            // Skip invalid countries
        }
    }

    console.log(`Processed ${countriesData.length} countries with ${polygonsData.length} total polygons\n`);

    // Detect neighbors at country level
    console.log('Detecting neighbors at country level...');
    const startTime = Date.now();

    for (let countryIdx1 = 0; countryIdx1 < countriesData.length; countryIdx1++) {
        const country1 = countriesData[countryIdx1];

        for (let countryIdx2 = countryIdx1 + 1; countryIdx2 < countriesData.length; countryIdx2++) {
            const country2 = countriesData[countryIdx2];

            // Check all polygon combinations
            for (const polyIdx1 of country1.polygonIndices) {
                const polygon1 = polygonsData[polyIdx1];

                for (const polyIdx2 of country2.polygonIndices) {
                    const polygon2 = polygonsData[polyIdx2];

                    if (sharesBorderPoint(polygon1.borderPoints, polygon2.borderPoints)) {
                        const neighbor1 = {
                            countryIndex: countryIdx2,
                            polygonIndex: polyIdx1,
                            neighbourPolygonIndex: polyIdx2
                        };

                        const neighbor2 = {
                            countryIndex: countryIdx1,
                            polygonIndex: polyIdx2,
                            neighbourPolygonIndex: polyIdx1
                        };

                        // Check if we already recorded this country as a neighbor
                        if (!country1.neighbourCountries.some(n => n.countryIndex === countryIdx2)) {
                            country1.neighbourCountries.push(neighbor1);
                        }

                        if (!country2.neighbourCountries.some(n => n.countryIndex === countryIdx1)) {
                            country2.neighbourCountries.push(neighbor2);
                        }
                    }
                }
            }
        }

        // Progress indicator
        if (countryIdx1 % 20 === 0) {
            process.stdout.write(`\rProgress: ${countryIdx1}/${countriesData.length}`);
        }
    }

    const endTime = Date.now();
    console.log(`\nNeighbor detection completed in ${(endTime - startTime)}ms\n`);

    // Display results
    console.log('=== Country-Level Neighbor Detection Results ===\n');

    // Show first 20 countries
    console.log('First 20 countries with neighbors:');
    console.log('-----------------------------------');
    for (let i = 0; i < Math.min(20, countriesData.length); i++) {
        const country = countriesData[i];
        const neighborNames = country.neighbourCountries.map(n => countriesData[n.countryIndex].name);
        console.log(`${i}: "${country.name}" (${country.polygonIndices.length} polygons)`);
        console.log(`   ${country.neighbourCountries.length} neighbors: ${neighborNames.slice(0, 5).join(', ')}${neighborNames.length > 5 ? '...' : ''}`);
    }

    // Countries with most neighbors
    console.log('\n=== Countries with Most Neighbors ===');
    const sortedByNeighbors = countriesData
        .map((country, index) => ({ index, name: country.name, neighborCount: country.neighbourCountries.length }))
        .sort((a, b) => b.neighborCount - a.neighborCount)
        .slice(0, 15);

    sortedByNeighbors.forEach((item, rank) => {
        const country = countriesData[item.index];
        const neighborNames = country.neighbourCountries.map(n => countriesData[n.countryIndex].name);
        console.log(`${rank + 1}. "${item.name}" - ${item.neighborCount} neighbors`);
        console.log(`   Neighbors: ${neighborNames.join(', ')}`);
    });

    // Island countries
    console.log('\n=== Island Countries (No Neighbors) ===');
    const islands = countriesData
        .map((country, index) => ({ index, name: country.name, neighborCount: country.neighbourCountries.length }))
        .filter(item => item.neighborCount === 0);

    console.log(`Found ${islands.length} island countries/territories:`);
    islands.slice(0, 20).forEach(item => {
        console.log(`  "${item.name}"`);
    });

    // Verify bidirectional relationships
    console.log('\n=== Verifying Bidirectional Relationships ===');
    let errors = 0;
    for (let i = 0; i < countriesData.length; i++) {
        const country = countriesData[i];
        for (const neighbor of country.neighbourCountries) {
            const neighborCountry = countriesData[neighbor.countryIndex];
            if (!neighborCountry.neighbourCountries.some(n => n.countryIndex === i)) {
                console.error(`ERROR: "${country.name}" lists "${neighborCountry.name}" as neighbor, but not vice versa!`);
                errors++;
            }
        }
    }

    if (errors === 0) {
        console.log('✓ All neighbor relationships are bidirectional!');
    } else {
        console.error(`✗ Found ${errors} relationship errors!`);
    }

    // Summary statistics
    console.log('\n=== Summary Statistics ===');
    const totalNeighborRelationships = countriesData.reduce((sum, country) => sum + country.neighbourCountries.length, 0) / 2;
    const avgNeighbors = (totalNeighborRelationships * 2 / countriesData.length).toFixed(2);
    console.log(`Total countries: ${countriesData.length}`);
    console.log(`Total polygons: ${polygonsData.length}`);
    console.log(`Total unique neighbor relationships: ${totalNeighborRelationships}`);
    console.log(`Average neighbors per country: ${avgNeighbors}`);

    // Sample verification
    console.log('\n=== Sample Neighbor Verification ===');
    const sampleCountries = ['France', 'Germany', 'China', 'Brazil', 'United States'];
    for (const name of sampleCountries) {
        const country = countriesData.find(c => c.name === name);
        if (country) {
            const idx = countriesData.indexOf(country);
            const neighborNames = country.neighbourCountries.map(n => countriesData[n.countryIndex].name);
            console.log(`\n"${name}" (${country.polygonIndices.length} polygons):`);
            console.log(`  ${country.neighbourCountries.length} neighbors: ${neighborNames.join(', ')}`);
        }
    }
}

// Run the test
testNeighbors().catch(console.error);
