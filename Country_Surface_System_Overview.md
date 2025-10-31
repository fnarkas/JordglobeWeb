# Country Surface Generation System - Technical Overview

## Purpose

This system generates 3D mesh representations of geographic regions (countries, provinces, etc.) on a sphere, with proper UV mapping for textures and extruded "soil" borders. It converts 2D latitude/longitude polygon data into 3D spherical meshes.

## High-Level Architecture

### Core Components

1. **Region Surface Generator** - Main orchestrator that creates country/region meshes
2. **Triangulator** - Converts polygons to triangles using Delaunay triangulation
3. **Sphere Projection** - Converts lat/lon coordinates to 3D sphere points
4. **Mesh Builder** - Constructs final 3D mesh with vertices, triangles, and UVs
5. **Soil/Border Extruder** - Creates 3D extruded borders around regions

## Data Flow

```
Input: Polygon (lat/lon points) + Holes + Parameters
    ↓
Triangulation (with Steiner points for better quality)
    ↓
Convert triangles from 2D lat/lon to 3D sphere coordinates
    ↓
Build mesh (vertices, triangles, UVs)
    ↓
Generate extruded borders ("soil")
    ↓
Output: Complete 3D region mesh with borders
```

## Key Algorithms

### 1. Region Surface Generation

**Input:**
- Polygon outline (array of lat/lon points)
- Optional holes (enclaves, lakes, etc.)
- Material/texture settings
- Altitude (height above sphere surface)
- Triangulation quality parameters (stepX, stepY)

**Process:**
1. Triangulate the 2D polygon with holes
2. Convert each triangle vertex from lat/lon to 3D sphere coordinates
3. Create mesh with proper UV mapping
4. Generate extruded borders around the outline
5. Handle holes by generating inverted borders

**Output:**
- GameObject/mesh with the region surface
- Child objects for borders/soil

### 2. Triangulation with Quality Control

**Purpose:** Convert polygon to triangles while maintaining shape accuracy

**Algorithm:**
```
1. Create polygon from lat/lon points
2. Add holes if present
3. Generate Steiner points in a grid pattern:
   - Only add points that fall inside the polygon
   - Grid spacing defined by stepX and stepY

4. Perform Delaunay triangulation
5. Quality check:
   - Calculate area of original polygon
   - Calculate area of all triangles
   - If difference > tolerance:
     * Recursively retry with finer grid (stepX/2, stepY/2)
     * Maximum recursion depth (ttl parameter)

6. Return triangulated polygon
```

**Key Parameters:**
- `stepX`, `stepY`: Grid spacing for Steiner points (smaller = more detail)
- `tolerance`: Acceptable area difference threshold
- `ttl`: Maximum retry attempts (time-to-live)

### 3. Coordinate Conversion: Lat/Lon to Sphere

**Purpose:** Project 2D geographic coordinates onto a 3D sphere

**Formula:**
```
Given:
- latitude (lat)
- longitude (lon)
- altitude in meters (optional)
- Earth radius constant

Convert to 3D sphere point:
1. radius = EARTH_RADIUS + altitude_in_meters
2. Convert lat/lon to radians
3. Calculate sphere coordinates:
   x = radius * cos(lat) * cos(lon)
   y = radius * sin(lat)
   z = radius * cos(lat) * sin(lon)
```

**Special Handling:**
- Triangle winding order may need flipping based on hemisphere
- Normals should point outward from sphere center

### 4. Mesh Construction

**Input:** Array of 3D vertices (from triangulated polygon)

**Process:**
1. **Vertex Deduplication:**
   - Use dictionary/hash map to find duplicate vertices
   - Build new vertex list with only unique points
   - Create index remapping for triangles

2. **UV Mapping:**
   - Convert each 3D sphere point back to UV coordinates
   - Apply texture scale, offset, and rotation
   - Options:
     - Global UV: Use absolute lat/lon coordinates
     - Local UV: Normalize to bounding box (0-1 range)

3. **Normal Calculation:**
   - For sphere surfaces: normals = normalized vertex positions
   - Points away from sphere center

4. **Triangle Assembly:**
   - Use remapped indices from deduplication step

**UV Coordinate Calculation:**
```
For each vertex:
1. Convert 3D sphere point to lat/lon (inverse of projection)
2. Map to UV space:
   u = (longitude + 180) / 360
   v = (latitude + 90) / 180
3. Apply transformations:
   - Scale: uv / textureScale
   - Rotate: apply 2D rotation matrix
   - Offset: uv + textureOffset
```

### 5. Border/Soil Extrusion

**Purpose:** Create 3D extruded walls around region boundaries

**Input:**
- Outline points (array of 3D sphere points)
- Extrusion ratio (how much to shrink toward sphere center)
- Material for borders
- Flip flag (for holes vs. outer boundaries)

**Algorithm:**
```
For each edge in the outline:
1. Create quad (4 vertices):
   - Top vertices: original points on sphere surface
   - Bottom vertices: points scaled toward sphere center

2. Scale calculation:
   bottom_vertex = top_vertex * extrudeRatio
   where extrudeRatio = (altitude + EARTH_RADIUS) / EARTH_RADIUS

3. Build triangles for the quad:
   - Triangle 1: [bottom, top, next_bottom]
   - Triangle 2: [top, next_top, next_bottom]

4. UV mapping:
   - U coordinate: cumulative distance along edge
   - V coordinate: 0 at bottom, 1 at top

5. If flip flag set:
   - Reverse triangle winding order (for inner holes)
```

**Special Cases:**
- Close the loop: last edge connects back to first vertex
- Holes: Generate borders with reversed winding (flipped normals)

### 6. Handling Holes (Enclaves)

**Process:**
1. Include holes in initial triangulation
2. After main surface is created, iterate through each hole
3. For each hole:
   - Convert hole points to 3D sphere coordinates
   - Generate extruded border with `flip=true`
   - Creates inward-facing walls

## Implementation Checklist

### Required Math Functions
- [ ] Lat/lon to sphere coordinate conversion
- [ ] Sphere coordinate to UV mapping
- [ ] 2D point rotation (for texture rotation)
- [ ] Vector distance calculation
- [ ] Triangle area calculation (Heron's formula)
- [ ] Polygon area calculation (shoelace formula)

### Required Data Structures
- [ ] Polygon representation (points, holes)
- [ ] Triangle structure
- [ ] Mesh structure (vertices, triangles, UVs, normals)
- [ ] Hash map for vertex deduplication

### External Dependencies
- [ ] Delaunay triangulation library (e.g., Poly2Tri, Triangle, earcut)
- [ ] 3D math library (vectors, matrices)
- [ ] Graphics framework (mesh rendering)

### Core Functions to Implement

1. **GenerateRegionSurface**
   - Input: Polygon, holes, materials, parameters
   - Output: Complete mesh object
   - Orchestrates entire process

2. **Triangulate**
   - Input: Polygon, quality parameters
   - Output: Triangulated polygon
   - Uses Delaunay + Steiner points

3. **LatLonToSphere**
   - Input: lat, lon, altitude
   - Output: 3D point on sphere

4. **CreateSurface**
   - Input: 3D vertices, material, UV settings
   - Output: Mesh object
   - Handles deduplication and UV mapping

5. **CreateSoil**
   - Input: Outline points, extrusion ratio, material
   - Output: Border mesh
   - Generates extruded walls

## Optimization Considerations

### Performance
- **Vertex deduplication** is critical for large meshes
- **Steiner point generation** should use spatial partitioning for polygon containment tests
- **Recursive triangulation** should have reasonable depth limits

### Memory
- Reuse temporary buffers (point lists, hash maps) between operations
- Clear collections rather than recreating them

### Quality vs. Performance Trade-offs
- Steiner point grid density (stepX/stepY):
  - Finer grid = better quality, more triangles
  - Coarser grid = faster, fewer triangles
- Tolerance for area matching:
  - Tighter tolerance = more accurate, potentially more recursion
  - Looser tolerance = faster, may have gaps

## Visual Quality Tips

1. **Smooth borders:** Use higher resolution Steiner grids near coastlines
2. **Texture alignment:** Ensure UV rotation matches geographic orientation
3. **Z-fighting prevention:**
   - Offset altitude slightly between overlapping surfaces
   - Render borders at slightly different depths
4. **Anti-aliasing:** Enable MSAA for smoother edges on wireframes/borders

## Testing Approach

1. **Simple shapes first:** Rectangle, triangle on sphere
2. **Complex coastlines:** Test with real country data
3. **Holes:** Islands, enclaves, lakes
4. **Edge cases:**
   - Polygons crossing date line (±180° longitude)
   - Polar regions (high latitudes)
   - Very small regions
   - Regions with many holes

## Common Pitfalls

1. **Winding order:** Triangles may face inward if lat/lon conversion isn't handled correctly
2. **UV wrapping:** Textures may appear distorted near poles or date line
3. **Precision issues:** Floating-point errors can cause gaps in vertex deduplication
4. **Memory leaks:** Ensure temporary meshes are properly disposed
5. **Performance:** Large countries with fine detail can generate millions of triangles

## Example Parameter Values

```
Typical settings for good quality:
- stepX: 0.5° (longitude spacing)
- stepY: 0.5° (latitude spacing)
- tolerance: 0.5 (area difference threshold)
- ttl: 4 (max recursion depth)
- altitude: 0.01 (10 meters above surface)
- extrudeRatio: 0.998 (border depth)

For faster preview:
- stepX: 2.0°
- stepY: 2.0°
- ttl: 2
```

## Extension Points

The system can be extended with:
- **Level of Detail (LOD):** Generate multiple mesh resolutions
- **Dynamic loading:** Stream country data based on camera position
- **Texture blending:** Smooth transitions between regions
- **Height mapping:** Add terrain elevation data
