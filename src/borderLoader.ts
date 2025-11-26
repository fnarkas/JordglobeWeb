/**
 * Binary border data loader
 *
 * Loads pre-baked border tube paths from borders.bin
 */

import { Vector3 } from '@babylonjs/core/Maths/math';

const MAGIC_NUMBER = 0x54424F52; // "TBOR"

export interface BorderPath {
    points: Vector3[];
}

export interface CountryBorders {
    countryIndex: number;
    borders: BorderPath[];
}

export interface BorderData {
    countries: CountryBorders[];
    totalBorders: number;
}

/**
 * Load binary border data from file
 */
export async function loadBorderData(url: string = 'borders.bin'): Promise<BorderData> {
    console.log(`Loading border data from ${url}...`);
    const startTime = performance.now();

    // Fetch the binary file
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const dataView = new DataView(arrayBuffer);
    let offset = 0;

    // Read header
    const magicNumber = dataView.getUint32(offset, true); offset += 4;
    if (magicNumber !== MAGIC_NUMBER) {
        throw new Error(`Invalid border data file: magic number mismatch (expected 0x${MAGIC_NUMBER.toString(16)}, got 0x${magicNumber.toString(16)})`);
    }

    const numCountries = dataView.getUint32(offset, true); offset += 4;
    const totalBorders = dataView.getUint32(offset, true); offset += 4;

    console.log(`  Countries: ${numCountries}, Total borders: ${totalBorders}`);

    // Read country and border data
    const countries: CountryBorders[] = [];

    for (let i = 0; i < numCountries; i++) {
        // Read country header
        const countryIndex = dataView.getUint32(offset, true); offset += 4;
        const numBorders = dataView.getUint32(offset, true); offset += 4;

        const borders: BorderPath[] = [];

        // Read borders for this country
        for (let j = 0; j < numBorders; j++) {
            // Read number of points
            const numPoints = dataView.getUint32(offset, true); offset += 4;

            // Read points
            const points: Vector3[] = [];
            for (let k = 0; k < numPoints; k++) {
                const x = dataView.getFloat32(offset, true); offset += 4;
                const y = dataView.getFloat32(offset, true); offset += 4;
                const z = dataView.getFloat32(offset, true); offset += 4;
                points.push(new Vector3(x, y, z));
            }

            borders.push({ points });
        }

        countries.push({
            countryIndex,
            borders
        });
    }

    const endTime = performance.now();
    console.log(`✓ Loaded border data in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`  File size: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`);

    return {
        countries,
        totalBorders
    };
}
