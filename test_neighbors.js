// Test script for neighbor detection functionality
// Run this in the browser console after the globe has loaded

function testNeighbors() {
    if (!window.earthGlobe) {
        console.error('earthGlobe not found. Make sure the page has fully loaded.');
        return;
    }

    const globe = window.earthGlobe;
    const countriesData = globe.countriesData;

    console.log('=== Neighbor Detection Test Results ===\n');
    console.log(`Total countries loaded: ${countriesData.length}\n`);

    // Show neighbor data for first 20 countries
    console.log('Neighbors for first 20 countries:');
    console.log('-----------------------------------');
    for (let i = 0; i < Math.min(20, countriesData.length); i++) {
        const country = countriesData[i];
        console.log(`Country ${i}: ${country.neighbour_indices.length} neighbors -> [${country.neighbour_indices.join(', ')}]`);
    }

    // Find countries with most neighbors
    console.log('\n=== Countries with Most Neighbors ===');
    const sortedByNeighbors = countriesData
        .map((country, index) => ({ index, neighborCount: country.neighbour_indices.length }))
        .sort((a, b) => b.neighborCount - a.neighborCount)
        .slice(0, 10);

    sortedByNeighbors.forEach((item, rank) => {
        const country = countriesData[item.index];
        console.log(`${rank + 1}. Country ${item.index}: ${item.neighborCount} neighbors -> [${country.neighbour_indices.join(', ')}]`);
    });

    // Find countries with no neighbors (islands)
    console.log('\n=== Island Countries (No Neighbors) ===');
    const islands = countriesData
        .map((country, index) => ({ index, neighborCount: country.neighbour_indices.length }))
        .filter(item => item.neighborCount === 0);

    console.log(`Found ${islands.length} island countries/territories:`);
    islands.slice(0, 20).forEach(item => {
        console.log(`  Country ${item.index}`);
    });

    // Verify bidirectional relationships
    console.log('\n=== Verifying Bidirectional Relationships ===');
    let errors = 0;
    for (let i = 0; i < countriesData.length; i++) {
        const country = countriesData[i];
        for (const neighborIndex of country.neighbour_indices) {
            const neighbor = countriesData[neighborIndex];
            if (!neighbor.neighbour_indices.includes(i)) {
                console.error(`ERROR: Country ${i} lists ${neighborIndex} as neighbor, but not vice versa!`);
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
}

// Auto-run if earthGlobe is already available
if (window.earthGlobe) {
    testNeighbors();
} else {
    console.log('Waiting for earthGlobe to load...');
    console.log('Run testNeighbors() manually once the page is loaded.');
}
