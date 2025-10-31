# Babylon.js Earth Globe

A 3D interactive Earth globe with country borders rendered using Babylon.js.

## Features

- 3D Earth sphere with high-resolution texture
- Interactive camera controls (drag to rotate, scroll to zoom)
- Country borders rendered as 3D meshes on the sphere surface
- Color-coded countries for easy distinction
- Real-time FPS counter
- Loads country data from GeoJSON format

## Prerequisites

- A modern web browser with WebGL support
- Python 3 (for local development server)

## Running the Project

1. Navigate to the project directory:
```bash
cd /path/to/BabylonTest
```

2. Start a local web server:
```bash
python3 -m http.server 8000
```

3. Open your browser and navigate to:
```
http://localhost:8000
```

4. You should see a 3D Earth globe with country borders. Drag with your mouse to rotate the camera, scroll to zoom in/out.

## Project Structure

```
BabylonTest/
├── index.html              # Main HTML file
├── main.js                 # Babylon.js application code
├── countries.json          # Country boundary data (lat/lon coordinates)
└── 4K_WorldTexture.png    # Earth texture (4K resolution)
```

## Technical Details

- **Framework**: Babylon.js (latest CDN version)
- **Triangulation**: Earcut library for polygon triangulation
- **Texture Resolution**: 4K (4096x4096)
- **Sphere Resolution**: 32 segments
- **Camera**: Arc Rotate Camera with orbital controls

## Controls

- **Mouse Drag**: Rotate camera around the Earth
- **Mouse Wheel**: Zoom in/out
- **Touch**: Full touch support on mobile devices

## How It Works

1. The application loads the Earth texture and creates a sphere mesh
2. Country data is loaded from `countries.json` containing lat/lon coordinates
3. For each country:
   - Coordinates are converted from lat/lon to 3D sphere surface points
   - Polygons are triangulated using the Earcut algorithm
   - Custom meshes are created and positioned on the sphere
   - Each country is assigned a unique color for visibility
4. The camera allows orbital rotation and zoom controls

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
