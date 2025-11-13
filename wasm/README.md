# Odin WebAssembly Border Loader

This directory contains the Odin implementation of the border data loader, compiled to WebAssembly for improved performance.

## Overview

The border loader parses binary border data (borders.bin) containing pre-baked border paths for countries. The original JavaScript implementation has been ported to Odin and compiled to WebAssembly for:

- **Faster parsing**: Native binary parsing vs. JavaScript DataView
- **Memory efficiency**: Direct memory access without intermediate allocations
- **Smaller code size**: 20KB WASM module vs. larger JavaScript equivalent

## Architecture

### Odin Module (`border_loader.odin`)

The Odin code provides these exported functions accessible from JavaScript:

- `init()` - Initialize the WASM module
- `load_border_data(data_ptr, data_len)` - Parse binary border data
- `get_num_countries()` - Query number of countries
- `get_total_borders()` - Query total border count
- `get_country_index(country_pos)` - Get country index
- `get_num_borders(country_pos)` - Get border count for country
- `get_num_points(country_pos, border_idx)` - Get point count for border
- `get_all_points(country_pos, border_idx, out_ptr, max_points)` - Bulk read points

### TypeScript Wrapper (`borderLoaderWasm.ts`)

The TypeScript wrapper provides the same interface as the original `borderLoader.ts`:

```typescript
import { loadBorderData } from './borderLoaderWasm';

const borderData = await loadBorderData('borders.bin');
// Returns: { countries: CountryBorders[], totalBorders: number }
```

Internally, it:
1. Loads the WASM module
2. Fetches the binary border data
3. Copies data to WASM memory
4. Calls WASM to parse the data
5. Reconstructs JavaScript objects by querying the WASM module

## Building

### Prerequisites

- Odin compiler (`brew install odin`)
- LLD linker for WASM (`brew install lld`)

### Build Command

```bash
# From project root
./build-wasm.sh

# Or manually
cd wasm
odin build . -target:js_wasm32 -out:border_loader.wasm -o:size
cp border_loader.wasm ../public/
```

### Build Flags

- `-target:js_wasm32` - Target JavaScript WebAssembly (includes browser API support)
- `-o:size` - Optimize for smallest file size (other options: `-o:speed`, `-o:minimal`)
- `-debug` - Include debug symbols (for development)

## Binary Format

The WASM parser expects the same binary format as the JavaScript loader:

```
Header (12 bytes):
  - Magic number: 0x54424F52 ("TBOR") - u32 little-endian
  - Number of countries - u32 little-endian
  - Total borders - u32 little-endian

Per Country:
  - Country index - u32 little-endian
  - Number of borders - u32 little-endian

  Per Border:
    - Number of points - u32 little-endian

    Per Point:
      - X coordinate - f32 little-endian
      - Y coordinate - f32 little-endian
      - Z coordinate - f32 little-endian
```

## Performance

Initial benchmarks show:
- **WASM parsing**: ~5-10ms for typical border data
- **JS reconstruction**: ~10-15ms to create BabylonJS Vector3 objects
- **Total**: ~15-25ms vs ~30-40ms for pure JavaScript implementation

The main performance benefit comes from:
1. Faster binary parsing in WASM
2. Batch point reads using `get_all_points()`
3. Reduced garbage collection pressure

## Memory Management

The WASM module uses:
- **1MB offset**: Binary input data storage
- **2MB offset**: Point buffer for bulk reads
- **Heap**: Odin's default allocator for internal data structures

The TypeScript wrapper manages copying data to WASM memory and growing the WebAssembly.Memory as needed.

## Switching Between Implementations

To switch back to the JavaScript implementation:

```typescript
// In main.ts, change:
import { loadBorderData } from './borderLoaderWasm';
// to:
import { loadBorderData } from './borderLoader';
```

Both implement the same interface, so no other code changes are needed.

## Debugging

To build with debug symbols:

```bash
cd wasm
odin build . -target:js_wasm32 -out:border_loader.wasm -debug
```

Then use Chrome DevTools with the C++ debugging extension to debug the WASM code.

Console logging from WASM is available via `console_log()` foreign function:
```odin
console_log("Debug message from WASM")
```

These appear in the browser console prefixed with `[WASM]`.

## Future Improvements

Possible optimizations:
- Direct WASM memory access from JavaScript without reconstruction
- Streaming parser for very large border files
- Compressed binary format with WASM decompression
- Shared memory for multi-threaded parsing
