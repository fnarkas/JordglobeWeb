#!/usr/bin/env node
/**
 * Enrich Countries Script
 *
 * Analyzes countries.json to:
 * 1. Detect enclaves (countries completely contained within others)
 * 2. Detect lakes (polygons within a country that are inside other polygons)
 *
 * Outputs: public/countries-enriched.json
 */

import * as fs from 'fs';
import * as path from 'path';

interface Point {
    lat: number;
    lon: number;
}

interface BoundingBox {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}

interface CountryJSON {
    name_en: string;
    iso2: string;
    paths: string;
    continent: string;
    is_sovereign?: boolean;
}

interface EnrichedCountry extends CountryJSON {
    holes?: Record<number, string[]>;  // Map from polygon index to hole ISO2 codes (enclaves)
    lakes?: Record<number, number[]>;  // Map from polygon index to lake polygon indices
    skipHole?: boolean;  // If true, don't create a hole for this enclave (too small to render well)
}

interface Polygon {
    points: Point[];
}

/**
 * Ray-casting algorithm for point-in-polygon test (2D)
 */
function pointInPolygon(point: Point, polygon: Point[]): boolean {
    const x = point.lat;
    const y = point.lon;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lat;
        const yi = polygon[i].lon;
        const xj = polygon[j].lat;
        const yj = polygon[j].lon;

        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

        if (intersect) inside = !inside;
    }

    return inside;
}

/**
 * Check if all points of polygonB are inside polygonA
 */
function polygonContainsPolygon(polygonA: Point[], polygonB: Point[]): boolean {
    // Empty polygons can't contain or be contained
    if (polygonA.length < 3 || polygonB.length < 3) {
        return false;
    }

    for (const point of polygonB) {
        if (!pointInPolygon(point, polygonA)) {
            return false;
        }
    }
    return true;
}

/**
 * Parse polygon data from JSON string
 */
function parsePolygons(pathsString: string): Polygon[] {
    const paths = JSON.parse(pathsString) as number[][][];
    return paths.map(path => ({
        points: path.map(([lat, lon]) => ({ lat, lon }))
    }));
}

/**
 * Parse single polygon coordinates to Point array
 */
function parsePolygon(coords: number[][]): Point[] {
    return coords.map(([lat, lon]) => ({ lat, lon }));
}

/**
 * Calculate bounding box for quick rejection
 */
function getBoundingBox(polygon: Point[]): BoundingBox {
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;

    for (const point of polygon) {
        minLat = Math.min(minLat, point.lat);
        maxLat = Math.max(maxLat, point.lat);
        minLon = Math.min(minLon, point.lon);
        maxLon = Math.max(maxLon, point.lon);
    }

    return { minLat, maxLat, minLon, maxLon };
}

/**
 * Quick bounding box overlap check
 */
function boundingBoxesOverlap(bb1: BoundingBox, bb2: BoundingBox): boolean {
    return !(bb1.maxLat < bb2.minLat || bb1.minLat > bb2.maxLat ||
             bb1.maxLon < bb2.minLon || bb1.minLon > bb2.maxLon);
}

/**
 * Quick bounding box containment check (B inside A)
 */
function boundingBoxContains(bbA: BoundingBox, bbB: BoundingBox): boolean {
    return bbB.minLat >= bbA.minLat && bbB.maxLat <= bbA.maxLat &&
           bbB.minLon >= bbA.minLon && bbB.maxLon <= bbA.maxLon;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Countries that should not create holes when they are enclaves.
 * These are typically very small countries where the hole geometry
 * causes rendering artifacts or looks worse than no hole.
 */
const SKIP_HOLE_COUNTRIES = new Set([
    'VA',  // Vatican City - too small, causes triangulation issues
    'SM',  // San Marino - too small, looks better without hole
]);

// ============================================================================
// ENCLAVE DETECTION
// ============================================================================

/**
 * Detect enclaves (countries completely inside other countries)
 */
function detectEnclaves(countries: CountryJSON[]): Map<number, Record<number, string[]>> {
    console.log(`\n=== Detecting Enclaves ===`);
    console.log(`Analyzing ${countries.length} countries for enclaves...`);
    const startTime = performance.now();

    // Pre-process: parse all polygons and compute bounding boxes
    const countryData = countries.map(country => {
        const polygons = parsePolygons(country.paths);
        const boundingBoxes = polygons.map(p => getBoundingBox(p.points));
        return {
            country,
            polygons,
            boundingBoxes
        };
    });

    // Map from country index to sparse holes record
    const enclaveMap = new Map<number, Record<number, string[]>>();
    let enclaveCount = 0;

    for (let i = 0; i < countryData.length; i++) {
        const containerData = countryData[i];
        const holesRecord: Record<number, string[]> = {};

        // Check each other country to see if it's contained
        for (let j = 0; j < countryData.length; j++) {
            if (i === j) continue; // Skip self

            const candidateData = countryData[j];

            // Check each polygon of the container against each polygon of the candidate
            for (let polyIdx = 0; polyIdx < containerData.polygons.length; polyIdx++) {
                const containerPolygon = containerData.polygons[polyIdx];
                const containerBBox = containerData.boundingBoxes[polyIdx];

                // Check if candidate is fully contained in this polygon
                let allCandidatePolygonsContained = true;

                for (let candPolyIdx = 0; candPolyIdx < candidateData.polygons.length; candPolyIdx++) {
                    const candidatePolygon = candidateData.polygons[candPolyIdx];
                    const candidateBBox = candidateData.boundingBoxes[candPolyIdx];

                    // Quick rejection: bounding boxes must overlap
                    if (!boundingBoxesOverlap(containerBBox, candidateBBox)) {
                        allCandidatePolygonsContained = false;
                        break;
                    }

                    // Detailed check: all points must be inside
                    if (!polygonContainsPolygon(containerPolygon.points, candidatePolygon.points)) {
                        allCandidatePolygonsContained = false;
                        break;
                    }
                }

                // If all candidate polygons are inside this container polygon, it's a hole
                if (allCandidatePolygonsContained) {
                    if (!holesRecord[polyIdx]) {
                        holesRecord[polyIdx] = [];
                    }
                    holesRecord[polyIdx].push(candidateData.country.iso2);
                    enclaveCount++;
                    console.log(`  ✓ Found enclave: ${candidateData.country.name_en} (${candidateData.country.iso2}) inside ${containerData.country.name_en} (${containerData.country.iso2})`);
                }
            }
        }

        // Store if any holes found
        if (Object.keys(holesRecord).length > 0) {
            enclaveMap.set(i, holesRecord);
        }
    }

    const endTime = performance.now();
    console.log(`Enclave detection complete in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`Found ${enclaveCount} enclaves`);

    return enclaveMap;
}

// ============================================================================
// LAKE DETECTION
// ============================================================================

/**
 * Detect lakes (polygons inside other polygons) within a country
 * Returns a sparse Record mapping polygon index to array of lake polygon indices
 */
function detectLakesInCountry(polygons: number[][][]): Record<number, number[]> | null {
    if (polygons.length <= 1) {
        return null; // No lakes possible with 0 or 1 polygon
    }

    const parsedPolygons = polygons.map(parsePolygon);
    const boundingBoxes = parsedPolygons.map(getBoundingBox);

    // Sparse record: only store polygons that have lakes
    const lakesRecord: Record<number, number[]> = {};

    for (let i = 0; i < polygons.length; i++) {
        for (let j = 0; j < polygons.length; j++) {
            if (i === j) continue;

            // Quick rejection: bounding box of j must be inside bounding box of i
            if (!boundingBoxContains(boundingBoxes[i], boundingBoxes[j])) {
                continue;
            }

            // Detailed check: all points of j must be inside polygon i
            if (polygonContainsPolygon(parsedPolygons[i], parsedPolygons[j])) {
                if (!lakesRecord[i]) {
                    lakesRecord[i] = [];
                }
                lakesRecord[i].push(j);
            }
        }
    }

    // Return null if no lakes found
    return Object.keys(lakesRecord).length > 0 ? lakesRecord : null;
}

/**
 * Detect lakes for all countries
 */
function detectLakes(countries: CountryJSON[]): Map<number, Record<number, number[]>> {
    console.log(`\n=== Detecting Lakes ===`);
    console.log(`Analyzing ${countries.length} countries for internal lakes...`);
    const startTime = performance.now();

    const lakeMap = new Map<number, Record<number, number[]>>();
    let totalLakes = 0;
    let countriesWithLakes = 0;

    for (let i = 0; i < countries.length; i++) {
        const country = countries[i];
        const polygons = JSON.parse(country.paths) as number[][][];
        const lakes = detectLakesInCountry(polygons);

        if (lakes) {
            countriesWithLakes++;
            const lakeCount = Object.values(lakes).reduce((sum, l) => sum + l.length, 0);
            totalLakes += lakeCount;
            console.log(`  ✓ ${country.name_en} (${country.iso2}): ${lakeCount} lake polygon(s)`);

            // Log details
            for (const [polyIdx, lakeIndices] of Object.entries(lakes)) {
                console.log(`    Polygon ${polyIdx} contains lake polygons: ${lakeIndices.join(', ')}`);
            }

            lakeMap.set(i, lakes);
        }
    }

    const endTime = performance.now();
    console.log(`Lake detection complete in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`Found ${totalLakes} lake polygons in ${countriesWithLakes} countries`);

    return lakeMap;
}

// ============================================================================
// DUPLICATE POINT REMOVAL
// ============================================================================

/**
 * Remove consecutive duplicate points from a path
 * Returns the cleaned path and count of removed duplicates
 */
function removeConsecutiveDuplicates(path: number[][]): { cleaned: number[][], removed: number } {
    if (path.length < 2) return { cleaned: path, removed: 0 };

    const cleaned: number[][] = [path[0]];
    let removed = 0;

    for (let i = 1; i < path.length; i++) {
        const prev = cleaned[cleaned.length - 1];
        const curr = path[i];
        if (curr[0] !== prev[0] || curr[1] !== prev[1]) {
            cleaned.push(curr);
        } else {
            removed++;
        }
    }

    // Also check if last point equals first point (shouldn't be closed)
    if (cleaned.length > 1) {
        const first = cleaned[0];
        const last = cleaned[cleaned.length - 1];
        if (first[0] === last[0] && first[1] === last[1]) {
            cleaned.pop();
            removed++;
        }
    }

    return { cleaned, removed };
}

/**
 * Clean all paths in a country, removing consecutive duplicate points
 */
function cleanCountryPaths(country: CountryJSON): { paths: string, totalRemoved: number } {
    const paths = JSON.parse(country.paths) as number[][][];
    let totalRemoved = 0;

    const cleanedPaths = paths.map(path => {
        const { cleaned, removed } = removeConsecutiveDuplicates(path);
        totalRemoved += removed;
        return cleaned;
    });

    return {
        paths: JSON.stringify(cleanedPaths),
        totalRemoved
    };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    try {
        const totalStartTime = performance.now();
        const inputPath = path.join(process.cwd(), 'public', 'countries.json');
        const outputPath = path.join(process.cwd(), 'public', 'countries-enriched.json');

        // Load data
        const loadStartTime = performance.now();
        console.log('Loading countries.json...');
        const countries = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as CountryJSON[];
        const loadEndTime = performance.now();
        console.log(`Loaded ${countries.length} countries in ${(loadEndTime - loadStartTime).toFixed(2)}ms`);

        // Clean duplicate points from paths
        console.log(`\n=== Cleaning Duplicate Points ===`);
        let totalDuplicatesRemoved = 0;
        for (const country of countries) {
            const { paths, totalRemoved } = cleanCountryPaths(country);
            if (totalRemoved > 0) {
                console.log(`  ${country.name_en} (${country.iso2}): removed ${totalRemoved} duplicate point(s)`);
                country.paths = paths;
                totalDuplicatesRemoved += totalRemoved;
            }
        }
        console.log(`Total duplicate points removed: ${totalDuplicatesRemoved}`);

        // Detect enclaves
        const enclaveMap = detectEnclaves(countries);

        // Detect lakes
        const lakeMap = detectLakes(countries);

        // Build enriched output
        const buildStartTime = performance.now();
        const enrichedCountries: EnrichedCountry[] = countries.map((country, i) => {
            const result: EnrichedCountry = { ...country };

            if (enclaveMap.has(i)) {
                result.holes = enclaveMap.get(i);
            }

            if (lakeMap.has(i)) {
                result.lakes = lakeMap.get(i);
            }

            // Mark countries that should not create holes when they are enclaves
            if (SKIP_HOLE_COUNTRIES.has(country.iso2)) {
                result.skipHole = true;
            }

            return result;
        });
        const buildEndTime = performance.now();

        // Write output
        const writeStartTime = performance.now();
        console.log(`\nWriting to ${path.relative(process.cwd(), outputPath)}...`);
        fs.writeFileSync(outputPath, JSON.stringify(enrichedCountries, null, 2));
        const writeEndTime = performance.now();
        console.log(`Write complete in ${(writeEndTime - writeStartTime).toFixed(2)}ms`);

        const totalEndTime = performance.now();

        // Summary
        const countriesWithHoles = enrichedCountries.filter(c => c.holes).length;
        const countriesWithLakes = enrichedCountries.filter(c => c.lakes).length;

        console.log(`\n=== Summary ===`);
        console.log(`Total countries: ${enrichedCountries.length}`);
        console.log(`Duplicate points removed: ${totalDuplicatesRemoved}`);
        console.log(`Countries with enclave holes: ${countriesWithHoles}`);
        console.log(`Countries with lake holes: ${countriesWithLakes}`);
        console.log(`Output: ${outputPath}`);
        console.log(`\n=== Timing ===`);
        console.log(`Load: ${(loadEndTime - loadStartTime).toFixed(2)}ms`);
        console.log(`Build enriched data: ${(buildEndTime - buildStartTime).toFixed(2)}ms`);
        console.log(`Write: ${(writeEndTime - writeStartTime).toFixed(2)}ms`);
        console.log(`Total: ${(totalEndTime - totalStartTime).toFixed(2)}ms`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();
