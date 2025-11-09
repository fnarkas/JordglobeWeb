#!/usr/bin/env node
// CLI test script for neighbor detection functionality
// Run with: node test_neighbors_cli.js

const fs = require('fs');

// Helper function to check if two points are the same
function pointsMatch(p1, p2, epsilon = 0.0001) {
    const latDiff = Math.abs(p1.lat - p2.lat);
    const lonDiff = Math.abs(p1.lon - p2.lon);
    return latDiff < epsilon && lonDiff < epsilon;
}

// Check if two countries share a border point
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

    const countriesJson = JSON.parse(fs.readFileSync('countries.json', 'utf8'));
    const countriesData = [];

    console.log(`Found ${countriesJson.length} countries in file\n`);

    // Process countries similar to how main.js does it
    for (const country of countriesJson) {
        if (!country.paths || country.paths === '[]') continue;

        try {
            const paths = JSON.parse(country.paths);

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

                countriesData.push({
                    name: country.name_en,
                    borderPoints: borderPoints,
                    neighbour_indices: []
                });
            }
        } catch (e) {
            // Skip invalid countries
        }
    }

    console.log(`Processed ${countriesData.length} valid country polygons\n`);

    // Detect neighbors
    console.log('Detecting neighbors...');
    const startTime = Date.now();

    for (let i = 0; i < countriesData.length; i++) {
        const country1 = countriesData[i];

        for (let j = i + 1; j < countriesData.length; j++) {
            const country2 = countriesData[j];

            if (sharesBorderPoint(country1.borderPoints, country2.borderPoints)) {
                country1.neighbour_indices.push(j);
                country2.neighbour_indices.push(i);
            }
        }

        // Progress indicator
        if (i % 100 === 0) {
            process.stdout.write(`\rProgress: ${i}/${countriesData.length}`);
        }
    }

    const endTime = Date.now();
    console.log(`\nNeighbor detection completed in ${(endTime - startTime)}ms\n`);

    // Display results
    console.log('=== Neighbor Detection Results ===\n');

    // Show first 20 countries
    console.log('First 20 countries with neighbors:');
    console.log('-----------------------------------');
    for (let i = 0; i < Math.min(20, countriesData.length); i++) {
        const country = countriesData[i];
        console.log(`${i}: "${country.name}" - ${country.neighbour_indices.length} neighbors -> [${country.neighbour_indices.slice(0, 10).join(', ')}${country.neighbour_indices.length > 10 ? '...' : ''}]`);
    }

    // Countries with most neighbors
    console.log('\n=== Countries with Most Neighbors ===');
    const sortedByNeighbors = countriesData
        .map((country, index) => ({ index, name: country.name, neighborCount: country.neighbour_indices.length }))
        .sort((a, b) => b.neighborCount - a.neighborCount)
        .slice(0, 15);

    sortedByNeighbors.forEach((item, rank) => {
        const country = countriesData[item.index];
        console.log(`${rank + 1}. ${item.index}: "${item.name}" - ${item.neighborCount} neighbors`);
        console.log(`   Neighbors: [${country.neighbour_indices.slice(0, 10).join(', ')}${country.neighbour_indices.length > 10 ? '...' : ''}]`);
    });

    // Island countries
    console.log('\n=== Island Countries (No Neighbors) ===');
    const islands = countriesData
        .map((country, index) => ({ index, name: country.name, neighborCount: country.neighbour_indices.length }))
        .filter(item => item.neighborCount === 0);

    console.log(`Found ${islands.length} island countries/territories:`);
    islands.slice(0, 20).forEach(item => {
        console.log(`  ${item.index}: "${item.name}"`);
    });

    // Verify bidirectional relationships
    console.log('\n=== Verifying Bidirectional Relationships ===');
    let errors = 0;
    for (let i = 0; i < countriesData.length; i++) {
        const country = countriesData[i];
        for (const neighborIndex of country.neighbour_indices) {
            const neighbor = countriesData[neighborIndex];
            if (!neighbor.neighbour_indices.includes(i)) {
                console.error(`ERROR: Country ${i} "${country.name}" lists ${neighborIndex} "${neighbor.name}" as neighbor, but not vice versa!`);
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
    const totalNeighborRelationships = countriesData.reduce((sum, country) => sum + country.neighbour_indices.length, 0) / 2;
    const avgNeighbors = (totalNeighborRelationships * 2 / countriesData.length).toFixed(2);
    console.log(`Total unique neighbor relationships: ${totalNeighborRelationships}`);
    console.log(`Average neighbors per country: ${avgNeighbors}`);

    // Sample verification - pick a few neighbors and show their shared points
    console.log('\n=== Sample Neighbor Verification ===');
    for (let i = 0; i < Math.min(5, countriesData.length); i++) {
        const country = countriesData[i];
        if (country.neighbour_indices.length > 0) {
            const neighborIndex = country.neighbour_indices[0];
            const neighbor = countriesData[neighborIndex];
            console.log(`\n${i}: "${country.name}" shares border with ${neighborIndex}: "${neighbor.name}"`);

            // Find and show first shared point
            let foundShared = false;
            for (const p1 of country.borderPoints) {
                for (const p2 of neighbor.borderPoints) {
                    if (pointsMatch(p1, p2)) {
                        console.log(`  Shared point: lat=${p1.lat.toFixed(4)}, lon=${p1.lon.toFixed(4)}`);
                        foundShared = true;
                        break;
                    }
                }
                if (foundShared) break;
            }
        }
    }
}

// Run the test
testNeighbors().catch(console.error);
