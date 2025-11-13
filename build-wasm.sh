#!/bin/bash
# Build script for Odin WebAssembly border loader

set -e  # Exit on error

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Building Odin WebAssembly border loader..."

# Compile Odin to WASM
cd "$SCRIPT_DIR/wasm"
odin build . -target:js_wasm32 -out:border_loader.wasm -o:size
echo "✓ Compiled border_loader.wasm ($(ls -lh border_loader.wasm | awk '{print $5}'))"

# Copy to public directory
cp border_loader.wasm "$SCRIPT_DIR/public/"
echo "✓ Copied to public/"

echo "Done! WASM module is ready."
