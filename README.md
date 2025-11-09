# Babylon.js Earth Globe

An interactive 3D globe built with Babylon.js and TypeScript, featuring country borders and neighbor detection.

## Features

- 3D Earth sphere with high-resolution texture
- Interactive camera controls (drag to rotate, scroll to zoom)
- Country border visualization (tube and extruded borders)
- Neighbor detection algorithm
- TypeScript with full type safety
- Vite for fast development and hot module reload
- Real-time FPS counter
- Toggle controls for different border types

## Tech Stack

- **Babylon.js** - 3D rendering engine
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool with HMR
- **Earcut** - Polygon triangulation

## Getting Started

### Install Dependencies

```bash
npm install
```

### Development

Start the development server with hot reload:

```bash
npm run dev
```

The app will open automatically at **http://localhost:3000**

### Build for Production

```bash
npm run build
```

Output will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

### Run Neighbor Detection Test

Test the neighbor detection algorithm from CLI:

```bash
npm test
```

## Project Structure

```
BabylonTest/
├── src/
│   ├── main.ts              # Main application code
│   └── types/
│       └── earcut.d.ts      # Type definitions for earcut
├── public/
│   ├── 4K_WorldTexture.png  # Earth texture
│   └── countries.json       # Country boundary data
├── index.html               # Entry point
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript configuration
└── package.json             # Dependencies and scripts
```

## Controls

- **Mouse Drag**: Rotate camera around the Earth
- **Mouse Wheel**: Zoom in/out
- **Touch**: Full touch support on mobile devices
- **UI Toggles**: Enable/disable tube borders and extruded borders

## How It Works

1. The application loads the Earth texture and creates a sphere mesh
2. Country data is loaded from `countries.json` containing lat/lon coordinates
3. For each country:
   - Coordinates are converted from lat/lon to 3D sphere surface points
   - Polygons are triangulated using the Earcut algorithm
   - Custom meshes are created and positioned on the sphere
   - Each country is assigned a unique color for visibility
   - Border lines (tubes) and extruded borders (3D walls) are created
4. After all countries are loaded, neighbor detection runs:
   - Countries sharing border points are identified
   - Neighbor indices are stored in each country's data
5. The camera allows orbital rotation and zoom controls

## Neighbor Detection

Countries are analyzed to detect neighbors based on shared border points. Access neighbor data in the browser console:

```javascript
// After page loads, access the globe instance
earthGlobe.countriesData[0].neighbour_indices  // Array of neighbor indices
```

### Programmatic Border Control

Disable specific country borders:

```javascript
// Disable extruded border for country at index 5
earthGlobe.countriesData[5].extrudedBorder?.setEnabled(false);

// Disable all borders for a country and its neighbors
const countryIndex = 184; // China
earthGlobe.countriesData[countryIndex].extrudedBorder?.setEnabled(false);
earthGlobe.countriesData[countryIndex].neighbour_indices.forEach(i => {
    earthGlobe.countriesData[i].extrudedBorder?.setEnabled(false);
});
```

## Data Format

The `countries.json` file contains country data in the following format:
```json
[
  {
    "iso2": "US",
    "name": "United States",
    "name_en": "United States",
    "continent": "North America",
    "is_sovereign": true,
    "paths": "[[[lat1,lon1],[lat2,lon2],...]]"
  }
]
```

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Troubleshooting

### Texture not loading
Make sure `4K_WorldTexture.png` is in the same directory as `index.html`.

### Countries not appearing
Check the browser console for errors. Make sure `countries.json` is accessible and properly formatted.

### Blank page
1. Open browser console (F12) to check for errors
2. Make sure you're using a local web server (not opening file directly)
3. Clear browser cache and reload

### Performance issues
If the application runs slowly:
- Try using a smaller texture file
- Reduce the number of countries loaded
- Close other browser tabs

## License

This is a demonstration project. Feel free to use and modify as needed.
