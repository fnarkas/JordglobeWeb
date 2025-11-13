# Odin WebAssembly Integration - Troubleshooting Guide

This document details the challenges encountered when integrating Odin-compiled WebAssembly with JavaScript, and the solutions that worked.

## Problem 1: "Import #2 'odin_env': module is not an object or function"

### Error
```
TypeError: WebAssembly.instantiate(): Import #2 "odin_env": module is not an object or function
```

### Root Cause
The `js_wasm32` target in Odin expects certain runtime imports from JavaScript that weren't provided. Unlike standalone WASM targets, `js_wasm32` requires the host environment to provide basic runtime functions.

### Solution
Provide a complete `odin_env` import object with stub implementations:

```typescript
const importObject = {
    env: {
        console_log: (ptr) => { /* read string from WASM memory */ },
        console_error: (ptr) => { /* read string from WASM memory */ }
    },
    odin_env: {
        // I/O functions
        write: (fd: number, ptr: number, len: number) => len,

        // Error handling
        trap: () => { throw new Error('WASM trap'); },
        alert: (ptr: number, len: number) => { console.warn('WASM alert'); },
        abort: () => { throw new Error('WASM abort'); },
        evaluate: (str_ptr: number, str_len: number) => { console.warn('WASM evaluate'); },

        // Time functions
        time_now: () => performance.now(),
        tick_now: () => performance.now(),
        time_sleep: (duration_ms: number) => {},

        // Math functions (required by Odin runtime)
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
```

**Key Insight**: You don't need the full `odin.js` runtime if you provide these stubs. This is lighter weight and gives you more control.

---

## Problem 2: Memory Allocation Failures

### Error
```
'context' has not been defined within this scope, but is required for this procedure call
```

Or runtime errors about failed allocations when calling `make()`.

### Root Cause
The `js_wasm32` target doesn't automatically initialize the default allocator. When you call `make()` in exported functions, it tries to use an uninitialized allocator, causing failures or requiring manual context setup.

### Failed Attempt
Initially tried using `context = runtime.default_context()` everywhere and relying on the default allocator:

```odin
@(export)
load_border_data :: proc "c" (data_ptr: rawptr, data_len: i32) -> i32 {
    context = runtime.default_context()  // ❌ Not sufficient

    countries := make([]CountryBorders, num_countries)  // May fail
    // ...
}
```

### Correct Solution
Use a **static memory buffer with an arena allocator**:

```odin
// Global static buffer (lives in WASM linear memory)
MAX_MEMORY :: 100 * 1024 * 1024  // 100MB
g_memory_buffer: [MAX_MEMORY]byte
g_arena: mem.Arena
g_arena_allocator: mem.Allocator

@(export)
init :: proc "c" () {
    context = runtime.default_context()

    // Initialize arena with static buffer
    mem.arena_init(&g_arena, g_memory_buffer[:])
    g_arena_allocator = mem.arena_allocator(&g_arena)

    g_initialized = true
}

@(export)
load_border_data :: proc "c" (data_ptr: rawptr, data_len: i32) -> i32 {
    context = runtime.default_context()
    context.allocator = g_arena_allocator  // Use our arena

    mem.arena_free_all(&g_arena)  // Reset arena for fresh allocation

    // Now make() works reliably
    countries := make([]CountryBorders, num_countries)
    // ...
}
```

**Key Insights**:
- Static buffers in WASM are allocated in linear memory at compile time
- Arena allocators are simple, fast, and perfect for bulk allocations
- This approach is recommended in the Odin WASM game template (see karl-zylinski's hot-reload template)
- Avoids complex dynamic memory management in WASM

---

## Problem 3: Context-less Procedures

### Error
```
'context' has not been defined within this scope, but is required for this procedure call
```

### Root Cause
Procedures marked with `@(export)` and `proc "c"` use the C calling convention, which doesn't include Odin's context parameter. You must manually set up the context.

### Solution
Add `context = runtime.default_context()` at the start of any exported procedure that:
- Calls `make()` or other allocation functions
- Uses context-dependent operations
- Calls other procedures that need context

```odin
@(export)
init :: proc "c" () {
    context = runtime.default_context()  // Required!

    mem.arena_init(&g_arena, g_memory_buffer[:])
    g_arena_allocator = mem.arena_allocator(&g_arena)
}
```

For helper procedures that don't need context, use `proc "contextless"`:

```odin
@(private)
read_u32 :: #force_inline proc "contextless" (data: []byte, offset: ^int) -> u32 {
    value := u32(data[offset^]) |
             u32(data[offset^ + 1]) << 8 |
             u32(data[offset^ + 2]) << 16 |
             u32(data[offset^ + 3]) << 24
    offset^ += 4
    return value
}
```

**Key Insight**: `contextless` procedures are more efficient when you don't need allocations or other context-dependent features.

---

## Problem 4: Detached Buffer After Memory Growth

### Error
```
TypeError: Cannot read properties of undefined (reading 'slice')
```

Or data appears as zeros/corrupted.

### Root Cause
When you grow WASM memory with `memory.grow()`, the old `ArrayBuffer` reference becomes **detached** (invalid). Any views created from the old buffer become unusable.

### Failed Code
```typescript
function copyToWasmMemory(data: ArrayBuffer): number {
    const view = new Uint8Array(wasmMemory.buffer);  // ❌ Get view BEFORE growing

    // Grow memory
    const requiredPages = Math.ceil(size / 65536);
    wasmMemory.grow(requiredPages - currentPages);

    // view is now detached and unusable!
    view.set(dataView, memoryOffset);  // ❌ Will fail or corrupt data
    return memoryOffset;
}
```

### Correct Solution
Always get a **fresh buffer view AFTER growing memory**:

```typescript
function copyToWasmMemory(data: ArrayBuffer): number {
    const dataView = new Uint8Array(data);

    // Calculate and grow memory FIRST
    const minRequiredBytes = 3 * 1024 * 1024;  // 3MB
    const requiredPages = Math.ceil(minRequiredBytes / 65536);
    const currentPages = wasmMemory.buffer.byteLength / 65536;

    if (requiredPages > currentPages) {
        console.log(`Growing WASM memory from ${currentPages} to ${requiredPages} pages`);
        wasmMemory.grow(requiredPages - currentPages);
    }

    // ✅ Get fresh view AFTER growth
    const view = new Uint8Array(wasmMemory.buffer);

    view.set(dataView, memoryOffset);
    return memoryOffset;
}
```

Apply the same principle when reading data:

```typescript
// ✅ Always get fresh buffer reference
const pointsView = new Float32Array(
    wasmMemory!.buffer,  // Get current buffer each time
    pointBufferPtr,
    actualPoints * 3
);
```

**Key Insight**: Treat `memory.buffer` as volatile. Always re-acquire it before creating views.

---

## Problem 5: Empty Data Causing Application Crashes

### Error
```
TypeError: Cannot read properties of undefined (reading 'slice')
    at CreateTube (babylon.js)
```

### Root Cause
Some borders in the binary data had 0 points. When passed to BabylonJS's `CreateTube()`, it crashes because it expects at least 2 points to create a path.

### Solution
Add validation at multiple levels:

**In WASM TypeScript wrapper:**
```typescript
for (let j = 0; j < numBorders; j++) {
    const numPoints = wasm.get_num_points(i, j);

    // Skip empty borders
    if (numPoints === 0) {
        console.warn(`Country ${i} border ${j} has 0 points, skipping`);
        continue;
    }

    const actualPoints = wasm.get_all_points(i, j, pointBufferPtr, maxPointsPerBorder);

    if (actualPoints === 0) {
        console.warn(`Failed to read points for country ${i} border ${j}`);
        continue;
    }

    // Only add border if we have valid data
    borders.push({ points });
}
```

**In application code:**
```typescript
// Validate before creating tube
if (borderPath && borderPath.length >= 2) {
    borderLine = this.createBorderTubeFromPath(borderPath, countryIndex);
} else {
    // Fallback to computed borders
    if (borderPath && borderPath.length < 2) {
        console.warn(`Pre-baked border has insufficient points (${borderPath.length}), falling back`);
    }
    borderLine = this.createCountryBorderLines(latLonPoints, BORDER_LINE_ALTITUDE, countryIndex);
}
```

**Key Insight**: Always validate data at boundaries between systems (WASM → JS → BabylonJS).

---

## Working Build Configuration

### Odin Compilation
```bash
odin build . -target:js_wasm32 -out:border_loader.wasm -o:size
```

**Flags explained:**
- `-target:js_wasm32` - Targets JavaScript WebAssembly (includes browser APIs)
- `-out:border_loader.wasm` - Output filename
- `-o:size` - Optimize for smallest file size

**Alternative flags:**
- `-o:speed` - Optimize for performance
- `-o:minimal` - Basic optimizations (default)
- `-debug` - Include debug symbols

### Memory Requirements
For a 195KB input file:
- **Input data**: 1MB offset (room for 1MB of data)
- **Output buffer**: 2MB offset (for reading points)
- **Static arena**: 100MB (g_memory_buffer)

Minimum WASM memory pages: 3MB = 47 pages (64KB per page)

---

## Performance Results

### Measured (195KB file, 250 countries, 787 borders)

**JavaScript Implementation:**
- Parsing time: 2.40ms
- Total time: 175.10ms

**WASM Implementation:**
- WASM parsing: 0.40ms
- JS reconstruction: 0.20ms
- Total processing: 0.60ms
- Total time: 172.40ms

**Speedup:** 4x faster parsing (2.40ms → 0.60ms)

---

## Debugging Tips

### 1. Check WASM Module Exports
```javascript
console.log(Object.keys(wasmExports));
// Should include: init, load_border_data, get_num_countries, etc.
```

### 2. Verify Memory Growth
```javascript
console.log(`WASM memory: ${wasmExports.memory.buffer.byteLength} bytes`);
console.log(`Pages: ${wasmExports.memory.buffer.byteLength / 65536}`);
```

### 3. Test Data Reading
```javascript
// Read a few bytes to verify data was copied correctly
const testView = new Uint8Array(wasmMemory.buffer, dataPtr, 16);
console.log('First 16 bytes:', Array.from(testView));
```

### 4. Browser Console Errors
- **Chrome**: Best WASM debugging support
- **Firefox**: Decent, but Chrome is better for WASM
- Enable source maps with `-debug` flag for better stack traces

### 5. Common Pitfalls
- ❌ Forgetting `context = runtime.default_context()` in exported functions
- ❌ Using buffer references after memory growth
- ❌ Not providing all `odin_env` imports
- ❌ Assuming default allocator works without initialization
- ❌ Passing empty/invalid data to external libraries

---

## References

- [Odin WebAssembly Documentation](https://odin-lang.org/docs/overview/#webassembly-support)
- [karl-zylinski's Hot-Reload Template](https://github.com/karl-zylinski/odin-raylib-hot-reload-game-template) - Production guide with WASM best practices
- [Odin Discord](https://discord.gg/sVBPHEv) - Active community for WASM questions
- [WebAssembly Memory](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory)

---

## Quick Checklist

When integrating Odin WASM, make sure you:

- [ ] Provide complete `odin_env` import object
- [ ] Use static buffer + arena allocator (not default allocator)
- [ ] Add `context = runtime.default_context()` in exported functions
- [ ] Get fresh buffer views after memory growth
- [ ] Validate data before passing to external libraries
- [ ] Test with actual data, not just synthetic examples
- [ ] Handle edge cases (empty arrays, invalid data)
- [ ] Measure performance with real-world data

---

## Summary

The key to successful Odin WASM integration is understanding that **WASM is not a native environment**. You must:

1. Provide runtime stubs (odin_env)
2. Manage memory explicitly (arena allocator)
3. Handle context manually (C calling convention)
4. Treat WASM memory as volatile (refresh buffer views)
5. Validate boundaries (WASM ↔ JS ↔ External libs)

With these patterns, Odin WASM provides excellent performance (4x faster in our case) with a small, efficient binary (22KB).
