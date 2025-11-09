// Babylon.js Earth Globe Application
import * as BABYLON from '@babylonjs/core';
import earcut from 'earcut';

const EARTH_RADIUS = 2.0;
const MAX_COUNTRIES = 5000;

interface LatLonPoint {
    lat: number;
    lon: number;
}

interface PolygonData {
    mesh: BABYLON.Mesh;
    borderLine: BABYLON.Mesh | null;
    extrudedBorder: BABYLON.Mesh | null;
    borderPoints: LatLonPoint[];
    countryIndex: number;  // Back-reference to parent country
}

interface NeighborInfo {
    countryIndex: number;           // Which country is the neighbor
    polygonIndex: number;            // Which of OUR polygons touches them
    neighbourPolygonIndex: number;   // Which of THEIR polygons we touch
}

interface CountryData {
    name: string;
    polygonIndices: number[];    // Indices into polygonsData array
    neighbourCountries: NeighborInfo[];
}

interface RGBColor {
    r: number;
    g: number;
    b: number;
}

interface CountryJSON {
    name_en: string;
    paths: string;
}

class EarthGlobe {
    private canvas: HTMLCanvasElement;
    private engine: BABYLON.Engine;
    private scene: BABYLON.Scene;
    private camera: BABYLON.ArcRotateCamera;
    private earthSphere: BABYLON.Mesh;
    private polygonsData: PolygonData[];  // Flat array of all polygons
    private countriesData: CountryData[];  // Country-level metadata
    private showCountries: boolean;
    private frameCount: number;

    constructor() {
        this.canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
        this.engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
        this.scene = new BABYLON.Scene(this.engine);
        this.camera = new BABYLON.ArcRotateCamera(
            "camera",
            Math.PI / 2,
            Math.PI / 2,
            10,
            BABYLON.Vector3.Zero(),
            this.scene
        );
        this.earthSphere = BABYLON.MeshBuilder.CreateSphere("temp", {}, this.scene);
        this.polygonsData = [];
        this.countriesData = [];
        this.showCountries = false;
        this.frameCount = 0;

        this.init();
    }

    private init(): void {
        // Create scene
        this.scene.clearColor = new BABYLON.Color4(0.95, 0.95, 0.95, 1);

        // Create camera
        this.camera.attachControl(this.canvas, true);
        this.camera.lowerRadiusLimit = 3;
        this.camera.upperRadiusLimit = 20;
        this.camera.wheelPrecision = 50;
        this.camera.minZ = 0.01;

        // Reduce rotation sensitivity for smoother control
        this.camera.angularSensibilityX = 4000;
        this.camera.angularSensibilityY = 4000;
        this.camera.panningSensibility = 4000;

        // Create light
        const light = new BABYLON.HemisphericLight(
            "light",
            new BABYLON.Vector3(0, 1, 0),
            this.scene
        );
        light.intensity = 1.2;

        // Create Earth sphere
        this.createEarthSphere();

        // Setup render loop
        this.engine.runRenderLoop(() => {
            this.update();
            this.scene.render();
        });

        // Handle resize
        window.addEventListener('resize', () => {
            this.engine.resize();
        });

        // Setup border toggle controls
        this.setupBorderToggles();

        // Load countries
        this.loadCountries();
    }

    private createEarthSphere(): void {
        // Create sphere for Earth
        this.earthSphere = BABYLON.MeshBuilder.CreateSphere(
            "earth",
            { diameter: EARTH_RADIUS * 2, segments: 32 },
            this.scene
        );

        // Create material and load texture
        const material = new BABYLON.StandardMaterial("earthMaterial", this.scene);
        material.diffuseTexture = new BABYLON.Texture("4K_WorldTexture.png", this.scene);
        material.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        this.earthSphere.material = material;
    }

    private setupBorderToggles(): void {
        // Tube borders toggle
        const tubeBordersToggle = document.getElementById('tubeBordersToggle') as HTMLInputElement;
        tubeBordersToggle.addEventListener('change', (e) => {
            const isVisible = (e.target as HTMLInputElement).checked;
            for (const polygon of this.polygonsData) {
                if (polygon.borderLine) {
                    polygon.borderLine.setEnabled(isVisible);
                }
            }
        });

        // Extruded borders toggle
        const extrudedBordersToggle = document.getElementById('extrudedBordersToggle') as HTMLInputElement;
        extrudedBordersToggle.addEventListener('change', (e) => {
            const isVisible = (e.target as HTMLInputElement).checked;
            for (const polygon of this.polygonsData) {
                if (polygon.extrudedBorder) {
                    polygon.extrudedBorder.setEnabled(isVisible);
                }
            }
        });
    }

    private latLonToSphere(lat: number, lon: number, altitude: number = 0): BABYLON.Vector3 {
        // Convert degrees to radians
        const latRad = (lat * Math.PI) / 180.0;
        const lonRad = (lon * Math.PI) / 180.0;

        const radius = EARTH_RADIUS + altitude;

        // Convert to Cartesian coordinates (sphere)
        const x = radius * Math.cos(latRad) * Math.cos(lonRad);
        const y = radius * Math.sin(latRad);
        const z = radius * Math.cos(latRad) * Math.sin(lonRad);

        return new BABYLON.Vector3(x, y, z);
    }

    private triangulatePolygon(points: { x: number; y: number }[]): number[] {
        // Use earcut library for triangulation
        // Flatten the 2D coordinates for earcut
        const flatCoords: number[] = [];
        for (const point of points) {
            flatCoords.push(point.x, point.y);
        }

        // Triangulate using earcut
        const indices = earcut(flatCoords);

        return indices;
    }

    private createCountryMesh(latLonPoints: LatLonPoint[], altitude: number = 0.08): BABYLON.Mesh | null {
        if (latLonPoints.length < 3) {
            console.error("Not enough points to create mesh");
            return null;
        }

        try {
            // Convert lat/lon points to 2D for triangulation (use as-is)
            const points2D = latLonPoints.map(p => ({ x: p.lat, y: p.lon }));

            // Triangulate
            const indices = this.triangulatePolygon(points2D);

            if (!indices || indices.length === 0) {
                console.error("Triangulation failed");
                return null;
            }

            // Reverse winding order for outward-facing triangles
            const reversedIndices: number[] = [];
            for (let i = 0; i < indices.length; i += 3) {
                reversedIndices.push(indices[i + 2], indices[i + 1], indices[i]);
            }

            // Convert lat/lon points to 3D sphere coordinates
            const positions: number[] = [];
            const normals: number[] = [];

            for (const point of latLonPoints) {
                const vertex = this.latLonToSphere(point.lat, point.lon, altitude);
                positions.push(vertex.x, vertex.y, vertex.z);

                // Normal points outward from sphere center
                const normal = vertex.normalize();
                normals.push(normal.x, normal.y, normal.z);
            }

            // Create custom mesh
            const customMesh = new BABYLON.Mesh("country", this.scene);

            const vertexData = new BABYLON.VertexData();
            vertexData.positions = positions;
            vertexData.indices = reversedIndices;
            vertexData.normals = normals;

            vertexData.applyToMesh(customMesh);

            // Create material with varying colors
            const material = new BABYLON.StandardMaterial("countryMat", this.scene);
            const hue = (this.polygonsData.length % 360) / 360;
            const color = this.hsvToRgb(hue, 0.7, 0.9);
            material.diffuseColor = new BABYLON.Color3(color.r, color.g, color.b);
            material.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

            customMesh.material = material;

            return customMesh;
        } catch (error) {
            console.error("Error creating country mesh:", error);
            return null;
        }
    }

    private hsvToRgb(h: number, s: number, v: number): RGBColor {
        let r: number, g: number, b: number;

        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);

        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
            default: r = 0; g = 0; b = 0; break;
        }

        return { r, g, b };
    }

    private createCountryBorderLines(latLonPoints: LatLonPoint[], altitude: number = 0.09): BABYLON.Mesh | null {
        try {
            // Convert lat/lon points to 3D sphere coordinates
            const points3D: BABYLON.Vector3[] = [];

            for (const point of latLonPoints) {
                const vertex = this.latLonToSphere(point.lat, point.lon, altitude);
                points3D.push(vertex);
            }

            // Close the loop by adding the first point at the end
            if (points3D.length > 0) {
                points3D.push(points3D[0]);
            }

            // Create tube along the path for visible thickness
            const tube = BABYLON.MeshBuilder.CreateTube(
                "borderLine",
                {
                    path: points3D,
                    radius: 0.002,
                    tessellation: 8,
                    cap: BABYLON.Mesh.CAP_ALL
                },
                this.scene
            );

            // Create unlit white material for the border (not affected by light)
            const material = new BABYLON.StandardMaterial("borderMat", this.scene);
            material.emissiveColor = new BABYLON.Color3(1, 1, 1);
            material.disableLighting = true;
            tube.material = material;

            return tube;
        } catch (error) {
            console.error("Error creating border lines:", error);
            return null;
        }
    }

    private createExtrudedBorder(latLonPoints: LatLonPoint[], altitude: number = 0.08): BABYLON.Mesh | null {
        try {
            // Convert lat/lon points to 3D sphere coordinates (top edge of border)
            const topPoints: BABYLON.Vector3[] = [];
            for (const point of latLonPoints) {
                const vertex = this.latLonToSphere(point.lat, point.lon, altitude);
                topPoints.push(vertex);
            }

            if (topPoints.length < 2) {
                return null;
            }

            // Calculate extrude ratio - scale points toward sphere center
            // Bottom edge is closer to sphere center
            const extrudeDepth = 0.05;
            const bottomRadius = EARTH_RADIUS + altitude - extrudeDepth;
            const topRadius = EARTH_RADIUS + altitude;
            const extrudeRatio = bottomRadius / topRadius;

            // Create bottom points by scaling top points toward center
            const bottomPoints: BABYLON.Vector3[] = [];
            for (const topPoint of topPoints) {
                const bottomPoint = topPoint.scale(extrudeRatio);
                bottomPoints.push(bottomPoint);
            }

            // Build extruded border mesh (quad strip)
            const positions: number[] = [];
            const indices: number[] = [];
            const normals: number[] = [];
            const uvs: number[] = [];

            let cumulativeDistance = 0;
            const totalPoints = topPoints.length;

            // Create quads for each edge
            for (let i = 0; i < totalPoints; i++) {
                const nextI = (i + 1) % totalPoints;

                // Current quad vertices
                const top = topPoints[i];
                const bottom = bottomPoints[i];
                const nextTop = topPoints[nextI];
                const nextBottom = bottomPoints[nextI];

                // Calculate distance for UV mapping
                const edgeDistance = BABYLON.Vector3.Distance(top, nextTop);
                const startU = cumulativeDistance;
                cumulativeDistance += edgeDistance;
                const endU = cumulativeDistance;

                // Add vertices (4 per quad)
                const baseIndex = positions.length / 3;

                // Bottom left
                positions.push(bottom.x, bottom.y, bottom.z);
                // Top left
                positions.push(top.x, top.y, top.z);
                // Bottom right
                positions.push(nextBottom.x, nextBottom.y, nextBottom.z);
                // Top right
                positions.push(nextTop.x, nextTop.y, nextTop.z);

                // Calculate normal (perpendicular to the quad face, pointing outward)
                const edge1 = nextTop.subtract(top);
                const edge2 = bottom.subtract(top);
                const normal = BABYLON.Vector3.Cross(edge1, edge2).normalize();

                // Add normals (same for all 4 vertices of the quad)
                for (let j = 0; j < 4; j++) {
                    normals.push(normal.x, normal.y, normal.z);
                }

                // Add UVs
                uvs.push(startU, 0);
                uvs.push(startU, 1);
                uvs.push(endU, 0);
                uvs.push(endU, 1);

                // Add triangles (2 per quad) - winding order for outward facing
                indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
                indices.push(baseIndex + 1, baseIndex + 3, baseIndex + 2);
            }

            // Create custom mesh
            const borderMesh = new BABYLON.Mesh("extrudedBorder", this.scene);

            const vertexData = new BABYLON.VertexData();
            vertexData.positions = positions;
            vertexData.indices = indices;
            vertexData.normals = normals;
            vertexData.uvs = uvs;

            vertexData.applyToMesh(borderMesh);

            // Create unlit material for the extruded border
            const material = new BABYLON.StandardMaterial("extrudedBorderMat", this.scene);
            material.emissiveColor = new BABYLON.Color3(0.9, 0.9, 0.9);
            material.disableLighting = true;
            borderMesh.material = material;

            return borderMesh;
        } catch (error) {
            console.error("Error creating extruded border:", error);
            return null;
        }
    }

    private addPolygon(coordinates: number[], countryIndex: number): number | null {
        if (this.polygonsData.length >= MAX_COUNTRIES) {
            console.error("Max polygons reached");
            return null;
        }

        // Convert flat array to lat/lon points
        const latLonPoints: LatLonPoint[] = [];
        for (let i = 0; i < coordinates.length; i += 2) {
            latLonPoints.push({
                lat: coordinates[i],
                lon: coordinates[i + 1]
            });
        }

        const mesh = this.createCountryMesh(latLonPoints, 0.08);

        if (mesh) {
            this.showCountries = true;

            // Create border lines (tubes) for this polygon
            const borderLine = this.createCountryBorderLines(latLonPoints, 0.09);

            // Create extruded border walls for this polygon
            const extrudedBorder = this.createExtrudedBorder(latLonPoints, 0.08);

            // Store polygon data
            const polygonData: PolygonData = {
                mesh: mesh,
                borderLine: borderLine,
                extrudedBorder: extrudedBorder,
                borderPoints: latLonPoints,
                countryIndex: countryIndex
            };

            const polygonIndex = this.polygonsData.length;
            this.polygonsData.push(polygonData);

            return polygonIndex;
        }

        return null;
    }

    private async loadCountries(): Promise<void> {
        try {
            const response = await fetch('countries.json');
            const countries = await response.json() as CountryJSON[];

            console.log('Loaded', countries.length, 'countries');

            let addedCount = 0;

            for (const country of countries) {
                if (!country.paths || country.paths === '[]') continue;

                try {
                    const paths = JSON.parse(country.paths) as number[][][];
                    const polygonIndices: number[] = [];

                    // Process all polygons (including islands) for this country
                    for (const polygon of paths) {
                        if (polygon.length === 0) continue;

                        // Check for antimeridian crossing
                        let hasLargeJump = false;
                        for (let i = 1; i < polygon.length; i++) {
                            const lonDiff = Math.abs(polygon[i][1] - polygon[i - 1][1]);
                            if (lonDiff > 180) {
                                hasLargeJump = true;
                                break;
                            }
                        }

                        // Skip polygons that cross the antimeridian
                        if (hasLargeJump) continue;

                        // Flatten coordinates
                        const flatCoords: number[] = [];
                        for (const point of polygon) {
                            flatCoords.push(point[0]); // lat
                            flatCoords.push(point[1]); // lon
                        }

                        if (flatCoords.length < 6) continue; // Need at least 3 points

                        // Add this polygon with reference to the country
                        const polygonIndex = this.addPolygon(flatCoords, this.countriesData.length);
                        if (polygonIndex !== null) {
                            polygonIndices.push(polygonIndex);
                        }
                    }

                    if (polygonIndices.length > 0) {
                        // Create country metadata
                        const countryData: CountryData = {
                            name: country.name_en,
                            polygonIndices: polygonIndices,
                            neighbourCountries: []
                        };
                        this.countriesData.push(countryData);

                        console.log('Added country:', country.name_en, 'with', polygonIndices.length, 'polygon(s)');
                        addedCount++;
                    }
                } catch (e) {
                    console.error('Failed to add country', country.name_en, ':', e);
                }
            }

            console.log('Added', addedCount, 'countries with', this.polygonsData.length, 'total polygons');

            // Detect neighbors after all countries are loaded
            this.detectNeighbors();

            const statusElement = document.getElementById('status');
            if (statusElement) {
                statusElement.style.display = 'block';
            }
        } catch (error) {
            console.error('Failed to load countries.json:', error);
        }
    }

    private detectNeighbors(): void {
        console.log('Detecting neighbors at country level...');
        const startTime = performance.now();

        // For each pair of countries, check all their polygons for shared border points
        for (let countryIdx1 = 0; countryIdx1 < this.countriesData.length; countryIdx1++) {
            const country1 = this.countriesData[countryIdx1];

            for (let countryIdx2 = countryIdx1 + 1; countryIdx2 < this.countriesData.length; countryIdx2++) {
                const country2 = this.countriesData[countryIdx2];

                // Check all polygon combinations between these two countries
                for (const polyIdx1 of country1.polygonIndices) {
                    const polygon1 = this.polygonsData[polyIdx1];

                    for (const polyIdx2 of country2.polygonIndices) {
                        const polygon2 = this.polygonsData[polyIdx2];

                        // Check if these two polygons share any border points
                        if (this.sharesBorderPoint(polygon1.borderPoints, polygon2.borderPoints)) {
                            // Found a match! Record this neighbor relationship
                            const neighbor1: NeighborInfo = {
                                countryIndex: countryIdx2,
                                polygonIndex: polyIdx1,
                                neighbourPolygonIndex: polyIdx2
                            };

                            const neighbor2: NeighborInfo = {
                                countryIndex: countryIdx1,
                                polygonIndex: polyIdx2,
                                neighbourPolygonIndex: polyIdx1
                            };

                            // Check if we already recorded this country as a neighbor (from another polygon pair)
                            if (!country1.neighbourCountries.some(n => n.countryIndex === countryIdx2)) {
                                country1.neighbourCountries.push(neighbor1);
                            }

                            if (!country2.neighbourCountries.some(n => n.countryIndex === countryIdx1)) {
                                country2.neighbourCountries.push(neighbor2);
                            }

                            // Once we find any touching polygons, these countries are neighbors
                            // We could break here, but continuing allows us to record all polygon pairs
                        }
                    }
                }
            }
        }

        const endTime = performance.now();
        console.log(`Neighbor detection completed in ${(endTime - startTime).toFixed(2)}ms`);

        // Log statistics
        let totalNeighbors = 0;
        let maxNeighbors = 0;
        for (const country of this.countriesData) {
            totalNeighbors += country.neighbourCountries.length;
            maxNeighbors = Math.max(maxNeighbors, country.neighbourCountries.length);
        }
        console.log(`Total neighbor relationships: ${totalNeighbors / 2}`);
        console.log(`Max neighbors for a single country: ${maxNeighbors}`);
        console.log(`Countries: ${this.countriesData.length}, Polygons: ${this.polygonsData.length}`);

        // Make data available globally for testing
        (window as any).earthGlobe = this;
    }

    private sharesBorderPoint(points1: LatLonPoint[], points2: LatLonPoint[]): boolean {
        // Check if two countries share any border point
        // Using a small epsilon for floating point comparison
        const epsilon = 0.0001;

        for (const p1 of points1) {
            for (const p2 of points2) {
                const latDiff = Math.abs(p1.lat - p2.lat);
                const lonDiff = Math.abs(p1.lon - p2.lon);

                if (latDiff < epsilon && lonDiff < epsilon) {
                    return true;
                }
            }
        }

        return false;
    }

    private update(): void {
        this.frameCount++;

        // Update FPS counter
        const fps = Math.round(this.engine.getFps());
        const fpsElement = document.getElementById('fps');
        if (fpsElement) {
            fpsElement.textContent = `FPS: ${fps}`;
        }
    }
}

// Initialize the application when page loads
window.addEventListener('DOMContentLoaded', () => {
    const app = new EarthGlobe();
});
