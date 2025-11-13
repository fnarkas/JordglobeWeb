#!/usr/bin/env node

/**
 * CLI tool to generate binary border data from countries.json
 *
 * Usage: node scripts/generate_borders.mjs
 *
 * Reads: public/countries.json
 * Writes: public/borders.bin
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants (must match main.ts)
const EARTH_RADIUS = 2.0;
const BORDER_LINE_ALTITUDE = 0.09;
const MAGIC_NUMBER = 0x54424F52; // "TBOR"

/**
 * Convert lat/lon to 3D sphere coordinates
 */
function latLonToSphere(lat, lon, altitude = 0) {
    const latRad = (lat * Math.PI) / 180.0;
    const lonRad = (lon * Math.PI) / 180.0;
    const radius = EARTH_RADIUS + altitude;

    const x = radius * Math.cos(latRad) * Math.cos(lonRad);
    const y = radius * Math.sin(latRad);
    const z = radius * Math.cos(latRad) * Math.sin(lonRad);

    return { x, y, z };
}

/**
 * Generate border tube path for a polygon
 */
function generateBorderPath(latLonPoints) {
    const points3D = [];

    for (const point of latLonPoints) {
        const vertex = latLonToSphere(point.lat, point.lon, BORDER_LINE_ALTITUDE);
        points3D.push(vertex);
    }

    // Close the loop by adding the first point at the end
    if (points3D.length > 0) {
        points3D.push(points3D[0]);
    }

    return points3D;
}

/**
 * Main generation function
 */
async function generateBorderData() {
    console.log('Reading countries.json...');

    const countriesPath = path.join(__dirname, '../public/countries.json');
    const outputPath = path.join(__dirname, '../public/borders.bin');

    const countriesData = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
    console.log(`Loaded ${countriesData.length} countries`);

    // Process countries and collect border data
    const countries = [];
    let totalBorders = 0;
    let countryIndex = 0;

    for (const country of countriesData) {
        if (!country.paths || country.paths === '[]') continue;

        try {
            const paths = JSON.parse(country.paths);
            const borders = [];

            // Process all polygons (including islands) for this country
            for (const polygon of paths) {
                if (polygon.length === 0) continue;

                // Check for antimeridian crossing (skip these)
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
                const latLonPoints = polygon.map(p => ({ lat: p[0], lon: p[1] }));

                if (latLonPoints.length < 3) continue;

                // Generate 3D border path
                const path3D = generateBorderPath(latLonPoints);

                if (path3D.length > 0) {
                    borders.push(path3D);
                }
            }

            if (borders.length > 0) {
                countries.push({
                    index: countryIndex,
                    name: country.name_en,
                    borders: borders
                });
                totalBorders += borders.length;
                console.log(`  ${country.name_en}: ${borders.length} border(s)`);
                countryIndex++;
            }
        } catch (e) {
            console.error(`Failed to process ${country.name_en}:`, e.message);
        }
    }

    console.log(`\nProcessed ${countries.length} countries with ${totalBorders} total borders`);

    // Calculate total file size
    let totalSize = 12; // Header
    for (const country of countries) {
        totalSize += 8; // Country header (index + border count)
        for (const border of country.borders) {
            totalSize += 4; // Number of points
            totalSize += border.length * 12; // Points (3 floats each)
        }
    }
    console.log(`Output file size: ${(totalSize / 1024).toFixed(2)} KB`);

    // Write binary file
    console.log('\nWriting binary file...');
    const buffer = Buffer.alloc(totalSize);
    let offset = 0;

    // Write header
    buffer.writeUInt32LE(MAGIC_NUMBER, offset); offset += 4;
    buffer.writeUInt32LE(countries.length, offset); offset += 4;
    buffer.writeUInt32LE(totalBorders, offset); offset += 4;

    // Write country and border data
    for (const country of countries) {
        // Country header
        buffer.writeUInt32LE(country.index, offset); offset += 4;
        buffer.writeUInt32LE(country.borders.length, offset); offset += 4;

        // Write borders for this country
        for (const border of country.borders) {
            // Number of points
            buffer.writeUInt32LE(border.length, offset); offset += 4;

            // Write each point
            for (const point of border) {
                buffer.writeFloatLE(point.x, offset); offset += 4;
                buffer.writeFloatLE(point.y, offset); offset += 4;
                buffer.writeFloatLE(point.z, offset); offset += 4;
            }
        }
    }

    // Write to file
    fs.writeFileSync(outputPath, buffer);
    console.log(`✓ Written ${outputPath}`);
    console.log(`✓ File size: ${(buffer.length / 1024).toFixed(2)} KB`);
}

// Run the generator
generateBorderData().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
