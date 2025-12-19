/**
 * Country Picker - Efficient point-in-polygon detection for countries
 *
 * Uses a grid-based spatial index for fast country lookup from lat/lon coordinates.
 * This avoids checking every country polygon for each query.
 */

export interface LatLon {
    lat: number;
    lon: number;
}

export interface CountryPolygon {
    iso2: string;
    name: string;
    countryIndex: number;
    polygonIndex: number;  // Index within the country's polygons
    points: LatLon[];
    bbox: BoundingBox;
}

interface BoundingBox {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}

interface GridCell {
    polygons: CountryPolygon[];
}

/**
 * Spatial index for fast country polygon lookup
 */
export class CountryPicker {
    private grid: Map<string, GridCell>;
    private cellSize: number;
    private polygons: CountryPolygon[];

    /**
     * Create a new CountryPicker
     * @param cellSize Grid cell size in degrees (default 10°)
     */
    constructor(cellSize: number = 10) {
        this.grid = new Map();
        this.cellSize = cellSize;
        this.polygons = [];
    }

    /**
     * Add a country polygon to the spatial index
     */
    addPolygon(polygon: CountryPolygon): void {
        this.polygons.push(polygon);

        // Calculate which grid cells this polygon overlaps
        const minCellX = Math.floor(polygon.bbox.minLon / this.cellSize);
        const maxCellX = Math.floor(polygon.bbox.maxLon / this.cellSize);
        const minCellY = Math.floor(polygon.bbox.minLat / this.cellSize);
        const maxCellY = Math.floor(polygon.bbox.maxLat / this.cellSize);

        // Add polygon to all overlapping cells
        for (let cx = minCellX; cx <= maxCellX; cx++) {
            for (let cy = minCellY; cy <= maxCellY; cy++) {
                const key = `${cx},${cy}`;
                let cell = this.grid.get(key);
                if (!cell) {
                    cell = { polygons: [] };
                    this.grid.set(key, cell);
                }
                cell.polygons.push(polygon);
            }
        }
    }

    /**
     * Get which country contains the given point
     * @returns The country polygon containing the point, or null if over ocean/no country
     */
    getCountryAt(point: LatLon): CountryPolygon | null {
        // Find which grid cell this point is in
        const cellX = Math.floor(point.lon / this.cellSize);
        const cellY = Math.floor(point.lat / this.cellSize);
        const key = `${cellX},${cellY}`;

        const cell = this.grid.get(key);
        if (!cell) {
            return null; // No countries in this cell
        }

        // Check each polygon in this cell
        for (const polygon of cell.polygons) {
            // Quick bounding box check
            if (!this.pointInBoundingBox(point, polygon.bbox)) {
                continue;
            }

            // Detailed point-in-polygon check
            if (this.pointInPolygon(point, polygon.points)) {
                return polygon;
            }
        }

        return null;
    }

    /**
     * Get statistics about the spatial index
     */
    getStats(): { polygonCount: number; cellCount: number; avgPolygonsPerCell: number } {
        let totalPolygons = 0;
        for (const cell of this.grid.values()) {
            totalPolygons += cell.polygons.length;
        }
        return {
            polygonCount: this.polygons.length,
            cellCount: this.grid.size,
            avgPolygonsPerCell: this.grid.size > 0 ? totalPolygons / this.grid.size : 0
        };
    }

    /**
     * Check if a point is inside a bounding box
     */
    private pointInBoundingBox(point: LatLon, bbox: BoundingBox): boolean {
        return point.lat >= bbox.minLat && point.lat <= bbox.maxLat &&
               point.lon >= bbox.minLon && point.lon <= bbox.maxLon;
    }

    /**
     * Ray-casting algorithm for point-in-polygon test
     */
    private pointInPolygon(point: LatLon, polygon: LatLon[]): boolean {
        const x = point.lon;
        const y = point.lat;
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].lon;
            const yi = polygon[i].lat;
            const xj = polygon[j].lon;
            const yj = polygon[j].lat;

            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }
}

/**
 * Calculate bounding box for a polygon
 */
export function calculateBoundingBox(points: LatLon[]): BoundingBox {
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;

    for (const p of points) {
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLon = Math.min(minLon, p.lon);
        maxLon = Math.max(maxLon, p.lon);
    }

    return { minLat, maxLat, minLon, maxLon };
}

/**
 * Convert 3D Cartesian coordinates on a sphere to lat/lon
 * Assumes sphere is centered at origin
 * @param x X coordinate
 * @param y Y coordinate (up)
 * @param z Z coordinate
 * @returns Latitude and longitude in degrees
 */
export function cartesianToLatLon(x: number, y: number, z: number): LatLon {
    const radius = Math.sqrt(x * x + y * y + z * z);

    // Latitude: angle from XZ plane
    const lat = Math.asin(y / radius) * (180 / Math.PI);

    // Longitude: angle in XZ plane from X axis
    const lon = Math.atan2(z, x) * (180 / Math.PI);

    return { lat, lon };
}
