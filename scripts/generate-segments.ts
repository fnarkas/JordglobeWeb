#!/usr/bin/env node
/**
 * CLI tool to generate segments.json from countries.json
 *
 * Usage: npm run generate-segments
 */

import * as fs from 'fs';
import * as path from 'path';

const EPSILON = 0.002; // Tolerance for comparing lat/lon coordinates (roughly ~200 meters, needed for data inconsistencies)
const MIN_SEGMENT_LENGTH = 2; // Minimum points for a valid segment (2 = line between two shared vertices)

interface Point2D {
    lat: number;
    lon: number;
}

interface Country2D {
    iso2: string;
    name: string;
    paths: Point2D[][];
}

interface Segment2D {
    points: Point2D[];
    countries: string[];
    type: 'standalone' | 'shared' | 'multipoint';
}

interface MatchedSubsequence2D {
    points: Point2D[];
    countryA: string;
    countryB: string;
    startA: number;
    startB: number;
    pathIndexA: number;
    pathIndexB: number;
    reversed: boolean;
}

function pointsEqual(a: Point2D, b: Point2D): boolean {
    return Math.abs(a.lat - b.lat) < EPSILON &&
           Math.abs(a.lon - b.lon) < EPSILON;
}

// Helper to get point at index with wrap-around support
function getPointWrapped(path: Point2D[], index: number): Point2D {
    // Handle negative indices properly (JavaScript's % doesn't handle negatives as we want)
    const wrappedIndex = ((index % path.length) + path.length) % path.length;
    return path[wrappedIndex];
}

function loadCountries2D(filePath: string): Country2D[] {
    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const countries: Country2D[] = [];

    for (const country of rawData) {
        const pathsData = JSON.parse(country.paths);
        const paths: Point2D[][] = [];

        for (const rawPath of pathsData) {
            const points: Point2D[] = rawPath.map((coords: number[]) => ({
                lat: coords[0],
                lon: coords[1]
            }));
            paths.push(points);
        }

        countries.push({
            iso2: country.iso2,
            name: country.name_en || country.name,
            paths
        });
    }

    return countries;
}

function findMatchingSubsequences2D(
    pathA: Point2D[],
    pathB: Point2D[],
    countryA: string,
    countryB: string,
    pathIndexA: number,
    pathIndexB: number
): MatchedSubsequence2D[] {
    const matches: MatchedSubsequence2D[] = [];
    const usedRanges = new Set<string>();

    for (let startA = 0; startA < pathA.length; startA++) {
        let bestMatch: MatchedSubsequence2D | null = null;
        let bestLength = 0;

        // Try forward direction with wrap-around support
        for (let startB = 0; startB < pathB.length; startB++) {
            let length = 0;
            // Allow matching up to full path length (with wrap-around)
            const maxLength = Math.min(pathA.length, pathB.length);
            while (
                length < maxLength &&
                pointsEqual(
                    getPointWrapped(pathA, startA + length),
                    getPointWrapped(pathB, startB + length)
                )
            ) {
                length++;
            }

            if (length >= MIN_SEGMENT_LENGTH && length > bestLength) {
                bestLength = length;
                // Extract points with wrap-around
                const points: Point2D[] = [];
                for (let i = 0; i < length; i++) {
                    points.push(getPointWrapped(pathA, startA + i));
                }
                bestMatch = {
                    points,
                    countryA,
                    countryB,
                    startA,
                    startB,
                    pathIndexA,
                    pathIndexB,
                    reversed: false
                };
            }
        }

        // Try reverse direction with wrap-around support
        for (let startB = 0; startB < pathB.length; startB++) {
            let length = 0;
            const maxLength = Math.min(pathA.length, pathB.length);
            while (
                length < maxLength &&
                pointsEqual(
                    getPointWrapped(pathA, startA + length),
                    getPointWrapped(pathB, startB - length)
                )
            ) {
                length++;
            }

            if (length >= MIN_SEGMENT_LENGTH && length > bestLength) {
                bestLength = length;
                // Extract points with wrap-around
                const points: Point2D[] = [];
                for (let i = 0; i < length; i++) {
                    points.push(getPointWrapped(pathA, startA + i));
                }
                bestMatch = {
                    points,
                    countryA,
                    countryB,
                    startA,
                    startB,
                    pathIndexA,
                    pathIndexB,
                    reversed: true
                };
            }
        }

        if (bestMatch) {
            // Track which indices in the original path were used (handle wrap-around for range key)
            const indices = [];
            for (let i = 0; i < bestLength; i++) {
                indices.push((startA + i) % pathA.length);
            }
            const rangeKey = indices.sort((a, b) => a - b).join(',');

            if (!usedRanges.has(rangeKey)) {
                matches.push(bestMatch);
                usedRanges.add(rangeKey);
                startA += bestLength - 1;
            }
        }
    }

    return matches;
}

function getSegmentHash(points: Point2D[]): string {
    if (points.length === 0) return '';
    const mid = Math.floor(points.length / 2);
    const p0 = points[0];
    const pm = points[mid];
    const pn = points[points.length - 1];
    return `${p0.lat.toFixed(4)},${p0.lon.toFixed(4)}-${pm.lat.toFixed(4)},${pm.lon.toFixed(4)}-${pn.lat.toFixed(4)},${pn.lon.toFixed(4)}`;
}

function segmentPointsEqual(a: Point2D[], b: Point2D[]): boolean {
    if (a.length !== b.length) return false;

    // Check same order
    let same = true;
    for (let i = 0; i < a.length; i++) {
        if (!pointsEqual(a[i], b[i])) {
            same = false;
            break;
        }
    }
    if (same) return true;

    // Check reverse order
    for (let i = 0; i < a.length; i++) {
        if (!pointsEqual(a[i], b[b.length - 1 - i])) {
            return false;
        }
    }
    return true;
}

function findSharedSegments2D(countries: Country2D[]): Segment2D[] {
    console.log(`\n=== Finding Shared Border Segments ===\n`);
    console.log(`Analyzing ${countries.length} countries...`);

    const allMatches: MatchedSubsequence2D[] = [];
    let pairsChecked = 0;
    const totalPairs = (countries.length * (countries.length - 1)) / 2;

    for (let i = 0; i < countries.length; i++) {
        const countryA = countries[i];

        for (let j = i + 1; j < countries.length; j++) {
            const countryB = countries[j];
            pairsChecked++;

            for (let pathIdxA = 0; pathIdxA < countryA.paths.length; pathIdxA++) {
                for (let pathIdxB = 0; pathIdxB < countryB.paths.length; pathIdxB++) {
                    const matches = findMatchingSubsequences2D(
                        countryA.paths[pathIdxA],
                        countryB.paths[pathIdxB],
                        countryA.iso2,
                        countryB.iso2,
                        pathIdxA,
                        pathIdxB
                    );

                    allMatches.push(...matches);

                    if (matches.length > 0) {
                        console.log(`  ${countryA.name} (${countryA.iso2}) ↔ ${countryB.name} (${countryB.iso2}): ${matches.length} segment(s)`);
                    }
                }
            }

            if (pairsChecked % 1000 === 0) {
                console.log(`  Progress: ${pairsChecked}/${totalPairs} pairs checked...`);
            }
        }
    }

    console.log(`\nFound ${allMatches.length} total matching subsequences`);

    // Deduplicate
    const segmentMap = new Map<string, { points: Point2D[], countries: Set<string> }>();

    for (const match of allMatches) {
        const hash = getSegmentHash(match.points);

        if (segmentMap.has(hash)) {
            const existing = segmentMap.get(hash)!;
            if (segmentPointsEqual(existing.points, match.points)) {
                existing.countries.add(match.countryA);
                existing.countries.add(match.countryB);
            } else {
                const newHash = hash + `-${segmentMap.size}`;
                segmentMap.set(newHash, {
                    points: match.points,
                    countries: new Set([match.countryA, match.countryB])
                });
            }
        } else {
            segmentMap.set(hash, {
                points: match.points,
                countries: new Set([match.countryA, match.countryB])
            });
        }
    }

    console.log(`Deduplicated to ${segmentMap.size} unique shared segments\n`);

    // Create segment objects
    const segments: Segment2D[] = [];
    let sharedCount = 0;
    let multiPointCount = 0;

    for (const { points, countries: countrySet } of segmentMap.values()) {
        const countries = Array.from(countrySet).sort();
        const type = countries.length === 2 ? 'shared' : 'multipoint';

        segments.push({
            points,
            countries,
            type
        });

        if (type === 'shared') {
            sharedCount++;
        } else {
            multiPointCount++;
        }
    }

    console.log(`=== Results ===`);
    console.log(`Total segments: ${segments.length}`);
    console.log(`  Shared (2 countries): ${sharedCount}`);
    console.log(`  Multi-point (3+ countries): ${multiPointCount}`);

    return segments;
}

// Main
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const inputFile = path.join(__dirname, '../public/countries-enriched.json');
const outputFile = path.join(__dirname, '../public/segments.json');

console.log('Border Segment Generator');
console.log('========================\n');
console.log(`Input:  ${inputFile}`);
console.log(`Output: ${outputFile}`);

// Load countries (using enriched data which has duplicate points removed)
console.log('\nLoading countries-enriched.json...');
const countries = loadCountries2D(inputFile);
console.log(`Loaded ${countries.length} countries`);

// Find segments
const segments = findSharedSegments2D(countries);

// Write output
console.log(`\nWriting segments.json...`);
fs.writeFileSync(outputFile, JSON.stringify(segments, null, 2));

const stats = fs.statSync(outputFile);
console.log(`✓ Written ${(stats.size / 1024).toFixed(1)} KB`);
console.log(`✓ Success!\n`);
