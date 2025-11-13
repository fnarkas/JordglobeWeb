/**
 * WASM-accelerated binary border data loader
 *
 * Loads pre-baked border tube paths from borders.bin using Odin WebAssembly
 */

import * as BABYLON from '@babylonjs/core';

export interface BorderPath {
    points: BABYLON.Vector3[];
}

export interface CountryBorders {
    countryIndex: number;
    borders: BorderPath[];
}

export interface BorderData {
    countries: CountryBorders[];
    totalBorders: number;
}

// WASM module interface
interface WasmExports {
    memory: WebAssembly.Memory;
    init: () => void;
    load_border_data: (dataPtr: number, dataLen: number) => number;
    get_num_countries: () => number;
    get_total_borders: () => number;
    get_country_index: (countryPos: number) => number;
    get_num_borders: (countryPos: number) => number;
    get_num_points: (countryPos: number, borderIdx: number) => number;
    get_all_points: (countryPos: number, borderIdx: number, outPtr: number, maxPoints: number) => number;
}

let wasmExports: WasmExports | null = null;
let wasmMemory: WebAssembly.Memory | null = null;

/**
 * Initialize the WASM module
 */
async function initWasm(): Promise<WasmExports> {
    if (wasmExports) {
        return wasmExports;
    }

    console.log('Loading Odin WASM border loader...');

    // Import objects for WASM
    const importObject = {
        env: {
            console_log: (ptr: number) => {
                const msg = readCString(ptr);
                console.log(`[WASM] ${msg}`);
            },
            console_error: (ptr: number) => {
                const msg = readCString(ptr);
                console.error(`[WASM] ${msg}`);
            }
        },
        odin_env: {
            write: (fd: number, ptr: number, len: number) => {
                // Stub for console output
                return len;
            },
            trap: () => {
                throw new Error('WASM trap');
            },
            alert: (ptr: number, len: number) => {
                // Stub for alerts
                console.warn('WASM alert called');
            },
            abort: () => {
                throw new Error('WASM abort');
            },
            evaluate: (str_ptr: number, str_len: number) => {
                // Stub for eval
                console.warn('WASM evaluate called');
            },
            time_now: () => {
                return performance.now();
            },
            tick_now: () => {
                return performance.now();
            },
            time_sleep: (duration_ms: number) => {
                // Can't actually sleep in WebAssembly
            },
            sqrt: Math.sqrt,
            sin: Math.sin,
            cos: Math.cos,
            pow: Math.pow,
            fmuladd: (a: number, b: number, c: number) => a * b + c,
            ln: Math.log,
            exp: Math.exp,
            ldexp: (x: number, exp: number) => x * Math.pow(2, exp),
        }
    };

    // Load and instantiate WASM module
    const response = await fetch('border_loader.wasm');
    const buffer = await response.arrayBuffer();
    const result = await WebAssembly.instantiate(buffer, importObject);

    wasmExports = result.instance.exports as any as WasmExports;
    wasmMemory = wasmExports.memory;

    // Initialize the WASM module
    wasmExports.init();

    console.log('✓ WASM border loader initialized');
    return wasmExports;
}

/**
 * Read a C-style null-terminated string from WASM memory
 */
function readCString(ptr: number): string {
    if (!wasmMemory) return '';

    const buffer = new Uint8Array(wasmMemory.buffer);
    let end = ptr;
    while (buffer[end] !== 0) end++;

    const decoder = new TextDecoder();
    return decoder.decode(buffer.subarray(ptr, end));
}

/**
 * Allocate memory in WASM and copy data to it
 */
function copyToWasmMemory(data: ArrayBuffer): number {
    if (!wasmMemory) throw new Error('WASM not initialized');

    // For simplicity, we'll write to a fixed location in memory
    // In production, you'd want proper memory management
    const memoryOffset = 1024 * 1024; // Start at 1MB offset
    const dataView = new Uint8Array(data);

    // Ensure we have enough memory for both input data and output buffer
    // We need space for: input at 1MB + output buffer at 2MB + some extra
    const minRequiredBytes = 3 * 1024 * 1024; // 3MB minimum
    const requiredPages = Math.ceil(minRequiredBytes / 65536);
    const currentPages = wasmMemory.buffer.byteLength / 65536;
    if (requiredPages > currentPages) {
        console.log(`Growing WASM memory from ${currentPages} to ${requiredPages} pages`);
        wasmMemory.grow(requiredPages - currentPages);
    }

    // IMPORTANT: After growing, get a fresh view of the buffer
    const view = new Uint8Array(wasmMemory.buffer);

    // Copy data to WASM memory
    view.set(dataView, memoryOffset);
    return memoryOffset;
}

/**
 * Load binary border data from file using WASM parser
 */
export async function loadBorderData(url: string = 'borders.bin'): Promise<BorderData> {
    console.log(`Loading border data from ${url}...`);
    const startTime = performance.now();

    // Initialize WASM module
    const wasm = await initWasm();

    // Fetch the binary file
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`  File size: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`);

    // Copy data to WASM memory
    const dataPtr = copyToWasmMemory(arrayBuffer);

    // Parse in WASM
    const parseStart = performance.now();
    const success = wasm.load_border_data(dataPtr, arrayBuffer.byteLength);
    const parseTime = performance.now() - parseStart;

    if (!success) {
        throw new Error('Failed to parse border data in WASM');
    }

    console.log(`  WASM parsing time: ${parseTime.toFixed(2)}ms`);

    // Query parsed data from WASM
    const numCountries = wasm.get_num_countries();
    const totalBorders = wasm.get_total_borders();

    console.log(`  Countries: ${numCountries}, Total borders: ${totalBorders}`);

    // Reconstruct the data structure by querying WASM
    const reconstructStart = performance.now();
    const countries: CountryBorders[] = [];

    // Allocate a reusable buffer for reading points
    const maxPointsPerBorder = 10000; // Adjust based on your data
    const pointBufferSize = maxPointsPerBorder * 3 * 4; // 3 floats per point, 4 bytes per float
    const pointBufferPtr = 2 * 1024 * 1024; // Use 2MB offset for point buffer

    for (let i = 0; i < numCountries; i++) {
        const countryIndex = wasm.get_country_index(i);
        const numBorders = wasm.get_num_borders(i);

        const borders: BorderPath[] = [];

        for (let j = 0; j < numBorders; j++) {
            const numPoints = wasm.get_num_points(i, j);

            // Skip empty borders
            if (numPoints === 0) {
                console.warn(`Country ${i} border ${j} has 0 points, skipping`);
                continue;
            }

            // Read all points at once from WASM
            const actualPoints = wasm.get_all_points(i, j, pointBufferPtr, maxPointsPerBorder);

            if (actualPoints === 0) {
                console.warn(`Failed to read points for country ${i} border ${j}`);
                continue;
            }

            // IMPORTANT: Always get a fresh view of the buffer (it may have grown)
            const pointsView = new Float32Array(
                wasmMemory!.buffer,
                pointBufferPtr,
                actualPoints * 3
            );

            const points: BABYLON.Vector3[] = [];
            for (let k = 0; k < actualPoints; k++) {
                const x = pointsView[k * 3 + 0];
                const y = pointsView[k * 3 + 1];
                const z = pointsView[k * 3 + 2];
                points.push(new BABYLON.Vector3(x, y, z));
            }

            borders.push({ points });
        }

        countries.push({
            countryIndex,
            borders
        });
    }

    const reconstructTime = performance.now() - reconstructStart;
    const totalTime = performance.now() - startTime;

    console.log(`  Data reconstruction time: ${reconstructTime.toFixed(2)}ms`);
    console.log(`✓ Loaded border data in ${totalTime.toFixed(2)}ms (WASM: ${parseTime.toFixed(2)}ms, JS: ${reconstructTime.toFixed(2)}ms)`);

    return {
        countries,
        totalBorders
    };
}
