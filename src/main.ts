// Babylon.js Earth Globe Application
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import '@babylonjs/inspector';
import earcut from 'earcut';

// Import shaders
import animatedVertexShader from './shaders/animated.vertex.glsl?raw';
import borderFragmentShader from './shaders/border.fragment.glsl?raw';
import countryFragmentShader from './shaders/country.fragment.glsl?raw';
import unlitVertexShader from './shaders/unlit.vertex.glsl?raw';
import unlitFragmentShader from './shaders/unlit.fragment.glsl?raw';

// Constants
const EARTH_RADIUS = 2.0;
const MAX_COUNTRIES = 5000;
const MAX_ANIMATION_COUNTRIES = 256;

// Altitude constants
const COUNTRY_ALTITUDE = 0.08;
const BORDER_LINE_ALTITUDE = 0.09;
const EXTRUDED_BORDER_DEPTH = 0.05;

// Animation constants
const ANIMATION_AMPLITUDE = 0.08;

// Border rendering constants
const TUBE_RADIUS = 0.002;
const TUBE_TESSELLATION = 8;

// Color constants
const COUNTRY_HSV_SATURATION = 0.7;
const COUNTRY_HSV_VALUE = 0.9;
const BORDER_COLOR_WHITE = new BABYLON.Color3(1, 1, 1);
const BORDER_COLOR_GRAY = new BABYLON.Color3(0.9, 0.9, 0.9);

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
    private mergedCountries: BABYLON.Mesh | null;  // Single merged mesh for all country polygons
    private mergedTubeBorders: BABYLON.Mesh | null;  // Single merged mesh for all tube borders
    private mergedExtrudedBorders: BABYLON.Mesh | null;  // Single merged mesh for all extruded borders
    private animationTexture: BABYLON.DynamicTexture | null;  // Texture storing animation values per country
    private animationData: Float32Array;  // Animation values for each country
    private showCountries: boolean;
    private frameCount: number;
    private sceneInstrumentation: BABYLON.SceneInstrumentation;
    private bossPinTemplate: BABYLON.AbstractMesh | null;
    private placedPins: BABYLON.AbstractMesh[];
    private previewPin: BABYLON.TransformNode | null;
    private isPlacingMode: boolean;
    private pinButton: HTMLElement | null;
    private loadingProgress: HTMLElement | null;
    private loadingText: HTMLElement | null;
    private loadingScreen: HTMLElement | null;

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
        this.earthSphere = null!; // Will be created in createEarthSphere()
        this.polygonsData = [];
        this.countriesData = [];
        this.mergedCountries = null;
        this.mergedTubeBorders = null;
        this.mergedExtrudedBorders = null;
        this.animationTexture = null;
        this.animationData = new Float32Array(MAX_ANIMATION_COUNTRIES);
        this.showCountries = false;
        this.frameCount = 0;
        this.bossPinTemplate = null;
        this.placedPins = [];
        this.previewPin = null;
        this.isPlacingMode = false;
        this.pinButton = null;
        this.loadingProgress = document.getElementById('loadingProgress');
        this.loadingText = document.getElementById('loadingText');
        this.loadingScreen = document.getElementById('loadingScreen');

        // Initialize scene instrumentation for accurate performance metrics
        this.sceneInstrumentation = new BABYLON.SceneInstrumentation(this.scene);
        this.sceneInstrumentation.captureFrameTime = true;

        this.init();
    }

    private async init(): Promise<void> {
        this.updateLoadingProgress(5, 'Initializing scene...');

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

        this.updateLoadingProgress(10, 'Setting up lighting...');

        // Create light
        const light = new BABYLON.HemisphericLight(
            "light",
            new BABYLON.Vector3(0, 1, 0),
            this.scene
        );
        light.intensity = 1.2;

        this.updateLoadingProgress(15, 'Creating earth sphere...');

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

        this.updateLoadingProgress(25, 'Loading countries...');

        // Load countries
        await this.loadCountries();

        this.updateLoadingProgress(75, 'Loading 3D models...');

        // Load BossPin model and create preview pin
        await this.loadBossPinModel();
        this.createPreviewPin();

        this.updateLoadingProgress(90, 'Setting up controls...');

        // Setup drag-and-drop pin placement
        this.setupPinDragAndDrop();

        // Setup keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            // Inspector toggle (I key)
            if (e.key === 'i' || e.key === 'I') {
                if (this.scene.debugLayer.isVisible()) {
                    this.scene.debugLayer.hide();
                } else {
                    this.scene.debugLayer.show({
                        embedMode: true,
                    });
                }
            }
            // Reload scene (R key)
            if (e.key === 'r' || e.key === 'R') {
                this.reloadScene();
            }
        });

        this.updateLoadingProgress(100, 'Complete!');

        // Hide loading screen after a short delay
        setTimeout(() => {
            this.hideLoadingScreen();
        }, 300);
    }

    private updateLoadingProgress(percent: number, text: string): void {
        if (this.loadingProgress) {
            this.loadingProgress.style.width = `${percent}%`;
        }
        if (this.loadingText) {
            this.loadingText.textContent = text;
        }
    }

    private hideLoadingScreen(): void {
        if (this.loadingScreen) {
            this.loadingScreen.classList.add('hidden');
        }
    }

    private showLoadingScreen(): void {
        if (this.loadingScreen) {
            this.loadingScreen.classList.remove('hidden');
        }
    }

    private async reloadScene(): Promise<void> {
        console.log('Reloading scene...');

        // Show loading screen
        this.showLoadingScreen();
        this.updateLoadingProgress(0, 'Clearing scene...');

        // Properly dispose of all resources
        // Dispose placed pins
        this.placedPins.forEach(pin => {
            if (pin && pin.dispose) {
                pin.dispose(false, true); // Don't dispose materials, do recurse to children
            }
        });
        this.placedPins = [];

        // Dispose preview pin
        if (this.previewPin) {
            this.previewPin.dispose(false, true);
            this.previewPin = null;
        }

        // Dispose boss pin template
        if (this.bossPinTemplate) {
            this.bossPinTemplate.dispose(false, true);
            this.bossPinTemplate = null;
        }

        // Dispose country meshes
        this.countryMeshes.forEach(mesh => {
            if (mesh) mesh.dispose(false, true);
        });
        this.countryMeshes = [];

        // Dispose merged meshes
        if (this.mergedCountries) {
            this.mergedCountries.dispose(false, true);
            this.mergedCountries = null;
        }
        if (this.mergedTubeBorders) {
            this.mergedTubeBorders.dispose(false, true);
            this.mergedTubeBorders = null;
        }
        if (this.mergedExtrudedBorders) {
            this.mergedExtrudedBorders.dispose(false, true);
            this.mergedExtrudedBorders = null;
        }

        // Dispose earth sphere
        if (this.earthSphere) {
            this.earthSphere.dispose(false, true);
        }

        // Dispose animation texture
        if (this.animationTexture) {
            this.animationTexture.dispose();
            this.animationTexture = null;
        }

        // Stop render loop
        this.engine.stopRenderLoop();

        this.updateLoadingProgress(5, 'Disposing scene...');

        // Dispose scene (this will clean up all remaining resources)
        this.scene.dispose();

        // Wait a bit for cleanup
        await new Promise(resolve => setTimeout(resolve, 200));

        this.updateLoadingProgress(10, 'Recreating engine...');

        // Don't dispose engine - just reuse it
        // Create new scene
        this.scene = new BABYLON.Scene(this.engine);

        // Recreate camera
        this.camera = new BABYLON.ArcRotateCamera(
            "camera",
            Math.PI / 2,
            Math.PI / 2,
            10,
            BABYLON.Vector3.Zero(),
            this.scene
        );

        // Reset all properties
        this.earthSphere = null!;
        this.polygonsData = [];
        this.countriesData = [];
        this.mergedCountries = null;
        this.mergedTubeBorders = null;
        this.mergedExtrudedBorders = null;
        this.animationTexture = null;
        this.animationData = new Float32Array(MAX_ANIMATION_COUNTRIES);
        this.showCountries = false;
        this.frameCount = 0;
        this.bossPinTemplate = null;
        this.placedPins = [];
        this.previewPin = null;
        this.isPlacingMode = false;

        // Reinitialize
        this.sceneInstrumentation = new BABYLON.SceneInstrumentation(this.scene);
        this.sceneInstrumentation.captureFrameTime = true;

        this.updateLoadingProgress(15, 'Recreating scene...');

        // Reinitialize scene
        await this.init();
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

    private createCountryMesh(latLonPoints: LatLonPoint[], altitude: number = COUNTRY_ALTITUDE): BABYLON.Mesh | null {
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
            const color = this.hsvToRgb(hue, COUNTRY_HSV_SATURATION, COUNTRY_HSV_VALUE);
            material.diffuseColor = color;
            material.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

            customMesh.material = material;

            return customMesh;
        } catch (error) {
            console.error("Error creating country mesh:", error);
            return null;
        }
    }

    private hsvToRgb(h: number, s: number, v: number): BABYLON.Color3 {
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

        return new BABYLON.Color3(r, g, b);
    }

    private createCountryBorderLines(latLonPoints: LatLonPoint[], altitude: number = BORDER_LINE_ALTITUDE, countryIndex: number = 0): BABYLON.Mesh | null {
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
                    radius: TUBE_RADIUS,
                    tessellation: TUBE_TESSELLATION,
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

    private createExtrudedBorder(latLonPoints: LatLonPoint[], altitude: number = COUNTRY_ALTITUDE, countryIndex: number = 0): BABYLON.Mesh | null {
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
            const bottomRadius = EARTH_RADIUS + altitude - EXTRUDED_BORDER_DEPTH;
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

        const mesh = this.createCountryMesh(latLonPoints, COUNTRY_ALTITUDE);

        if (mesh) {
            this.showCountries = true;

            // Create border lines (tubes) for this polygon
            const borderLine = this.createCountryBorderLines(latLonPoints, BORDER_LINE_ALTITUDE, countryIndex);

            // Create extruded border walls for this polygon
            const extrudedBorder = this.createExtrudedBorder(latLonPoints, COUNTRY_ALTITUDE, countryIndex);

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

            // Create animation texture before merging
            this.createAnimationTexture();

            // Merge all meshes for performance
            this.mergeCountryPolygons();
            this.mergeTubeBorders();
            this.mergeExtrudedBorders();

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

    private createAnimationTexture(): void {
        // Create texture to store animation values per country
        this.animationTexture = new BABYLON.DynamicTexture("animationTexture", { width: MAX_ANIMATION_COUNTRIES, height: 1 }, this.scene, false);

        // Set willReadFrequently for better performance since we update this every frame
        const context = this.animationTexture.getContext() as CanvasRenderingContext2D;
        if (context.canvas) {
            // Note: This needs to be done before first getImageData call, but DynamicTexture already created the context
            // The warning is expected for this use case
        }

        this.updateAnimationTexture();
    }

    private updateAnimationTexture(): void {
        if (!this.animationTexture) return;

        const context = this.animationTexture.getContext() as CanvasRenderingContext2D;
        const imageData = context.getImageData(0, 0, MAX_ANIMATION_COUNTRIES, 1);

        // Write animation values to texture (RGBA, but we only use R channel)
        for (let i = 0; i < MAX_ANIMATION_COUNTRIES; i++) {
            const value = this.animationData[i];
            const pixelIndex = i * 4;
            imageData.data[pixelIndex] = value * 255;      // R channel
            imageData.data[pixelIndex + 1] = 0;             // G channel
            imageData.data[pixelIndex + 2] = 0;             // B channel
            imageData.data[pixelIndex + 3] = 255;           // A channel
        }

        context.putImageData(imageData, 0, 0);
        this.animationTexture.update();
    }

    private showShaderError(shaderName: string, error: any): void {
        const toast = document.getElementById('error-toast');
        const message = document.getElementById('error-message');

        if (toast && message) {
            message.textContent = `Shader: ${shaderName}\n\n${error.message || error}`;
            toast.classList.add('show');
            console.error(`Shader compilation error in ${shaderName}:`, error);
        }
    }

    private createShaderMaterial(
        name: string,
        fragmentShader: string,
        uniforms: string[],
        varyings: string = "",
        varyingAssignments: string = ""
    ): BABYLON.ShaderMaterial {
        try {
            // Setup vertex shader
            const vertexShader = animatedVertexShader
                .replace('// VARYINGS_PLACEHOLDER', varyings)
                .replace('// VARYING_ASSIGNMENTS_PLACEHOLDER', varyingAssignments);

            BABYLON.Effect.ShadersStore[`${name}VertexShader`] = vertexShader;
            BABYLON.Effect.ShadersStore[`${name}FragmentShader`] = fragmentShader;

            // Create shader material
            const shaderMaterial = new BABYLON.ShaderMaterial(name, this.scene, {
                vertex: name,
                fragment: name,
            }, {
                attributes: ["position", "normal", "countryIndex"],
                uniforms: ["worldViewProjection", "world", "maxAnimationCountries", "animationAmplitude", ...uniforms],
                samplers: ["animationTexture"]
            });

            // Setup compilation callbacks
            shaderMaterial.onCompiled = () => console.log(`Shader ${name} compiled successfully`);
            shaderMaterial.onError = (effect, errors) => this.showShaderError(name, errors);

            // Set common uniforms
            if (this.animationTexture) {
                shaderMaterial.setTexture("animationTexture", this.animationTexture);
            }
            shaderMaterial.setFloat("maxAnimationCountries", MAX_ANIMATION_COUNTRIES);
            shaderMaterial.setFloat("animationAmplitude", ANIMATION_AMPLITUDE);
            shaderMaterial.backFaceCulling = false;

            return shaderMaterial;
        } catch (error) {
            this.showShaderError(name, error);
            throw error;
        }
    }

    private createUnlitMaterial(originalMaterial: BABYLON.Material | null): BABYLON.ShaderMaterial {
        const materialName = "unlitMaterial_" + Date.now();

        BABYLON.Effect.ShadersStore[`${materialName}VertexShader`] = unlitVertexShader;
        BABYLON.Effect.ShadersStore[`${materialName}FragmentShader`] = unlitFragmentShader;

        const shaderMaterial = new BABYLON.ShaderMaterial(materialName, this.scene, {
            vertex: materialName,
            fragment: materialName,
        }, {
            attributes: ["position", "uv"],
            uniforms: ["worldViewProjection", "baseColor", "hasTexture"],
            samplers: ["baseColorTexture"]
        });

        // Try to extract color from original material
        let baseColor = new BABYLON.Color4(1, 1, 1, 1);
        let hasTexture = false;

        if (originalMaterial) {
            // Try to get base color from PBR material
            const pbrMat = originalMaterial as any;
            if (pbrMat.albedoColor) {
                const c = pbrMat.albedoColor;
                baseColor = new BABYLON.Color4(c.r, c.g, c.b, 1.0);
            } else if (pbrMat.diffuseColor) {
                const c = pbrMat.diffuseColor;
                baseColor = new BABYLON.Color4(c.r, c.g, c.b, 1.0);
            }

            // Check for textures
            if (pbrMat.albedoTexture) {
                shaderMaterial.setTexture("baseColorTexture", pbrMat.albedoTexture);
                hasTexture = true;
            } else if (pbrMat.diffuseTexture) {
                shaderMaterial.setTexture("baseColorTexture", pbrMat.diffuseTexture);
                hasTexture = true;
            }
        }

        shaderMaterial.setColor4("baseColor", baseColor);
        shaderMaterial.setFloat("hasTexture", hasTexture ? 1.0 : 0.0);
        shaderMaterial.backFaceCulling = false;

        return shaderMaterial;
    }

    private createBorderShaderMaterial(name: string, baseColor: BABYLON.Color3): BABYLON.ShaderMaterial {
        const material = this.createShaderMaterial(name, borderFragmentShader, ["baseColor"]);
        material.setColor3("baseColor", baseColor);
        return material;
    }

    private createCountryShaderMaterial(): BABYLON.ShaderMaterial {
        const material = this.createShaderMaterial(
            "countryShader",
            countryFragmentShader,
            ["countryHsvSaturation", "countryHsvValue"],
            "varying float vCountryIndex;",
            "vCountryIndex = countryIndex;"
        );
        material.setFloat("countryHsvSaturation", COUNTRY_HSV_SATURATION);
        material.setFloat("countryHsvValue", COUNTRY_HSV_VALUE);
        return material;
    }

    // Generic merge function - DRY approach for all mesh merging
    private mergeMeshesWithAnimation(
        meshGetter: (polygon: PolygonData) => BABYLON.Mesh | null,
        meshName: string,
        materialCreator: () => BABYLON.ShaderMaterial,
        meshSetter?: (polygon: PolygonData, merged: BABYLON.Mesh) => void
    ): BABYLON.Mesh | null {
        console.log(`Merging ${meshName}...`);
        const startTime = performance.now();

        // Collect meshes and their vertex counts BEFORE merging
        const meshes: BABYLON.Mesh[] = [];
        const vertexCounts: number[] = [];
        const countryIndicesPerMesh: number[] = [];

        for (const polygon of this.polygonsData) {
            const mesh = meshGetter(polygon);
            if (mesh) {
                meshes.push(mesh);
                vertexCounts.push(mesh.getTotalVertices());
                countryIndicesPerMesh.push(polygon.countryIndex);
            }
        }

        if (meshes.length === 0) {
            console.log(`No ${meshName} to merge`);
            return null;
        }

        // Merge all meshes into a single mesh
        const mergedMesh = BABYLON.Mesh.MergeMeshes(
            meshes,
            true,  // disposeSource
            true,  // allow32BitsIndices
            undefined,  // meshSubclass
            false,  // subdivideWithSubMeshes
            false  // multiMultiMaterial
        );

        if (!mergedMesh) {
            console.error(`Failed to merge ${meshName}`);
            return null;
        }

        mergedMesh.name = meshName;

        // Rebuild countryIndex attribute (MergeMeshes doesn't preserve custom attributes)
        const totalVertices = mergedMesh.getTotalVertices();
        const countryIndices = new Float32Array(totalVertices);

        let vertexOffset = 0;
        for (let meshIdx = 0; meshIdx < vertexCounts.length; meshIdx++) {
            const vertexCount = vertexCounts[meshIdx];
            const countryIndex = countryIndicesPerMesh[meshIdx];
            for (let i = 0; i < vertexCount; i++) {
                countryIndices[vertexOffset + i] = countryIndex;
            }
            vertexOffset += vertexCount;
        }

        // Create custom vertex buffer for countryIndex
        const buffer = new BABYLON.VertexBuffer(
            this.engine,
            countryIndices,
            "countryIndex",
            false,  // updatable
            false,  // postponeInternalCreation
            1,      // stride
            false   // instanced
        );
        mergedMesh.setVerticesBuffer(buffer);

        // Apply shader material
        mergedMesh.material = materialCreator();

        // Update polygon references
        if (meshSetter) {
            for (const polygon of this.polygonsData) {
                meshSetter(polygon, mergedMesh);
            }
        }

        const endTime = performance.now();
        console.log(`Merged ${meshes.length} ${meshName} in ${(endTime - startTime).toFixed(2)}ms`);

        return mergedMesh;
    }

    private mergeTubeBorders(): void {
        this.mergedTubeBorders = this.mergeMeshesWithAnimation(
            (p) => p.borderLine,
            "mergedTubeBorders",
            () => this.createBorderShaderMaterial("tubeBorderShader", BORDER_COLOR_WHITE),
            (p) => p.borderLine = null
        );
    }

    private mergeExtrudedBorders(): void {
        this.mergedExtrudedBorders = this.mergeMeshesWithAnimation(
            (p) => p.extrudedBorder,
            "mergedExtrudedBorders",
            () => this.createBorderShaderMaterial("extrudedBorderShader", BORDER_COLOR_GRAY),
            (p) => p.extrudedBorder = null
        );
    }

    private mergeCountryPolygons(): void {
        this.mergedCountries = this.mergeMeshesWithAnimation(
            (p) => p.mesh,
            "mergedCountries",
            () => this.createCountryShaderMaterial(),
            (p, merged) => p.mesh = merged
        );
    }

    private updateStats(): void {
        const fps = Math.round(this.engine.getFps());
        const fpsElement = document.getElementById('fps');
        if (fpsElement) {
            fpsElement.textContent = `${fps}`;
        }

        const drawCallsElement = document.getElementById('drawCalls');
        if (drawCallsElement) {
            const drawCalls = this.sceneInstrumentation.drawCallsCounter.current;
            drawCallsElement.textContent = `${drawCalls}`;
        }

        const trianglesElement = document.getElementById('triangles');
        if (trianglesElement) {
            let totalTriangles = 0;
            this.scene.meshes.forEach(mesh => {
                if (mesh.isEnabled() && mesh.isVisible) {
                    totalTriangles += mesh.getTotalIndices() / 3;
                }
            });
            trianglesElement.textContent = `${Math.round(totalTriangles).toLocaleString()}`;
        }
    }

    private updateAnimation(): void {
        const time = Date.now() * 0.001;  // Time in seconds

        // Animate all countries with unique sine wave patterns
        for (let i = 0; i < this.countriesData.length; i++) {
            const offset = i * 0.5;
            const frequency = 0.5 + (i % 10) * 0.1;
            this.animationData[i] = (Math.sin(time * frequency + offset) + 1) * 0.5;  // Range 0-1
        }

        this.updateAnimationTexture();
    }

    private update(): void {
        this.frameCount++;
        this.updateStats();
        this.updateAnimation();

        // Debug logging every 60 frames
        if (this.frameCount % 60 === 0) {
            console.log(`Frame ${this.frameCount}: animationData[0]=${this.animationData[0].toFixed(3)}, animationData[5]=${this.animationData[5].toFixed(3)}, animationData[10]=${this.animationData[10].toFixed(3)}, animationData[20]=${this.animationData[20].toFixed(3)}`);
            console.log(`Total meshes in scene: ${this.scene.meshes.length}, Active meshes: ${this.scene.getActiveMeshes().length}`);
        }
    }

    private async loadBossPinModel(): Promise<void> {
        try {
            const result = await BABYLON.SceneLoader.ImportMeshAsync("", "/", "BossPin.glb", this.scene);

            if (result.meshes.length > 0) {
                console.log(`Loaded ${result.meshes.length} meshes from BossPin.glb`);

                // Log all meshes
                result.meshes.forEach((mesh, i) => {
                    console.log(`  Mesh ${i}: ${mesh.name}, hasVertices: ${mesh.getTotalVertices() > 0}, material: ${mesh.material?.name}`);
                });

                // Get the root mesh or parent
                this.bossPinTemplate = result.meshes[0];

                // Check bounding info to see model size
                const boundingInfo = this.bossPinTemplate.getHierarchyBoundingVectors();
                console.log('Model bounds:', boundingInfo);

                // Log children
                const children = this.bossPinTemplate.getChildMeshes();
                console.log(`Template has ${children.length} child meshes`);
                children.forEach((child, i) => {
                    console.log(`  Child ${i}: ${child.name}, vertices: ${child.getTotalVertices()}, material: ${child.material?.name}`);
                });

                this.bossPinTemplate.setEnabled(false); // Hide template

                console.log('BossPin model loaded successfully');
            }
        } catch (error) {
            console.error('Failed to load BossPin model:', error);
        }
    }

    private setupPinDragAndDrop(): void {
        // Get the pin button element
        this.pinButton = document.getElementById('pinButton');
        if (!this.pinButton) return;

        // Handle mousedown on pin button - enter placing mode
        this.pinButton.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.enterPlacingMode();
        });

        // Handle mousemove on canvas - update preview pin position
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isPlacingMode && this.previewPin) {
                this.updatePreviewPinPosition(e);
            }
        });

        // Handle mouseup - place pin and exit placing mode
        this.canvas.addEventListener('mouseup', (e) => {
            if (this.isPlacingMode) {
                this.exitPlacingMode(true); // true = place the pin
            }
        });

        // Handle mouse leaving canvas - cancel placing mode
        this.canvas.addEventListener('mouseleave', (e) => {
            if (this.isPlacingMode) {
                this.exitPlacingMode(false); // false = don't place the pin
            }
        });
    }

    private enterPlacingMode(): void {
        if (!this.previewPin) return;

        this.isPlacingMode = true;

        // Hide the pin button
        if (this.pinButton) {
            this.pinButton.style.display = 'none';
        }

        // Hide cursor during placing mode
        document.body.classList.add('placing-mode');

        // Disable camera controls
        this.camera.detachControl();

        // Don't show preview pin yet - wait until mouse is over globe
        // It will be shown by updatePreviewPinPosition when it hits the globe

        console.log('Entered placing mode');
    }

    private exitPlacingMode(placePin: boolean): void {
        this.isPlacingMode = false;

        // Show the pin button
        if (this.pinButton) {
            this.pinButton.style.display = 'block';
        }

        // Show cursor again
        document.body.classList.remove('placing-mode');

        // Re-enable camera controls
        this.camera.attachControl(this.canvas, true);

        // Always hide preview pin when exiting placing mode (going back to navigation)
        if (this.previewPin) {
            this.previewPin.setEnabled(false);
        }

        if (placePin) {
            console.log('Pin placed at current position');
        } else {
            console.log('Pin placement cancelled');
        }

        console.log('Exited placing mode');
    }

    private createPreviewPin(): void {
        if (!this.bossPinTemplate) return;

        const clonedMeshes: BABYLON.AbstractMesh[] = [];
        const originalChildren = this.bossPinTemplate.getChildMeshes();

        // Create parent transform node for preview
        const pinPivot = new BABYLON.TransformNode("previewPinPivot", this.scene);

        // Create pin container as child of pivot
        const pinContainer = new BABYLON.TransformNode("previewPin", this.scene);
        pinContainer.parent = pinPivot;

        // Scale the pin
        const pinScale = 150;
        pinContainer.scaling = new BABYLON.Vector3(pinScale, pinScale, pinScale);

        // Clone each child mesh and apply unlit shader
        originalChildren.forEach(child => {
            const clonedChild = child.clone(child.name + "_preview", pinContainer);
            if (clonedChild) {
                clonedChild.setEnabled(true);
                clonedMeshes.push(clonedChild);

                // Apply unlit shader to make it bright
                const unlitMaterial = this.createUnlitMaterial(child.material);
                clonedChild.material = unlitMaterial;
            }
        });

        this.previewPin = pinPivot;

        // Hide the preview pin initially (only show during placing mode)
        this.previewPin.setEnabled(false);

        console.log('Preview pin created and hidden');
    }

    private updatePreviewPinPosition(event: MouseEvent): void {
        if (!this.previewPin) return;

        // Get picking ray from mouse position
        const pickResult = this.scene.pick(event.clientX, event.clientY);

        if (pickResult.hit && pickResult.pickedPoint) {
            // Show the pin when we hit the globe for the first time
            if (!this.previewPin.isEnabled()) {
                this.previewPin.setEnabled(true);
            }

            // Calculate surface normal
            const normal = pickResult.pickedPoint.normalize();

            // Position on globe surface
            const pivotPosition = normal.scale(EARTH_RADIUS);
            this.previewPin.position = pivotPosition;

            // Orient the pivot so its local Y-axis points along the normal
            const defaultUp = BABYLON.Vector3.Up();
            const rotationQuat = BABYLON.Quaternion.FromUnitVectorsToRef(
                defaultUp,
                normal,
                new BABYLON.Quaternion()
            );
            this.previewPin.rotationQuaternion = rotationQuat;
        }
        // Don't hide the pin when not over the globe - keep it at last position
        // It will only be hidden when exiting placing mode
    }

}

// Initialize the application when page loads
window.addEventListener('DOMContentLoaded', () => {
    const app = new EarthGlobe();
});
