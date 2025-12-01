// Babylon.js Earth Globe Application
// Tree-shaken imports for smaller bundle size
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3, Color3, Color4, Quaternion } from '@babylonjs/core/Maths/math';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import { Material } from '@babylonjs/core/Materials/material';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import type { Nullable } from '@babylonjs/core/types';
import type { Observer } from '@babylonjs/core/Misc/observable';

// Side effect imports (required for some features)
import '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Loading/loadingScreen';
import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Materials/PBR/pbrMaterial';  // Required for glTF material support

// Inspector - only include in development builds
if (import.meta.env.DEV) {
    import('@babylonjs/inspector');
}

// GUI imports
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { Control } from '@babylonjs/gui/2D/controls/control';
import { Image } from '@babylonjs/gui/2D/controls/image';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import { cdt2d, filterTriangles } from './cdt2d';
import { loadSegments, getSharedSegments, type SegmentData, type Segment3D } from './segmentLoader';
import { createWaterMaterial } from './waterShader';
import { CountryPicker, calculateBoundingBox, cartesianToLatLon, type CountryPolygon, type LatLon } from './countryPicker';
import { CountrySelectionBehavior } from './countrySelectionBehavior';

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
const EXTRUDED_BORDER_DEPTH = 0.05;

// Animation constants
const ANIMATION_AMPLITUDE = 0.2;

// Border rendering constants
const TUBE_RADIUS = 0.002;
const TUBE_TESSELLATION = 8;

// Color constants
const COUNTRY_HSV_SATURATION = 0.7;
const COUNTRY_HSV_VALUE = 0.9;
const BORDER_COLOR_WHITE = new Color3(1, 1, 1);
const BORDER_COLOR_GRAY = new Color3(0.9, 0.9, 0.9);


interface LatLonPoint {
    lat: number;
    lon: number;
}

interface PolygonData {
    mesh: Mesh;
    extrudedBorder: Mesh | null;
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
    iso2: string;
    index: number;
    polygonIndices: number[];    // Indices into polygonsData array
    neighbourCountries: NeighborInfo[];
}

interface CountryJSON {
    name_en: string;
    iso2: string;
    paths: string;
    holes?: string[][];  // Array of hole ISO2 codes per polygon (enclaves)
    lakes?: number[][];  // For each polygon, list of polygon indices that are lakes inside it
    skipHole?: boolean;  // If true, don't create a hole for this enclave (too small)
}

class EarthGlobe {
    private canvas: HTMLCanvasElement;
    private engine: Engine;
    private scene: Scene;
    private camera: ArcRotateCamera;
    private earthSphere: Mesh;
    private polygonsData: PolygonData[];  // Flat array of all polygons
    private countriesData: CountryData[];  // Country-level metadata
    private totalTriangleCount: number;  // Track total triangles for comparison
    private mergedCountries: Mesh | null;  // Single merged mesh for all country polygons
    private mergedExtrudedBorders: Mesh | null;  // Single merged mesh for all extruded borders
    private animationTexture: DynamicTexture | null;  // Texture storing animation values per country
    private animationData: Float32Array;  // Animation values for each country
    private showCountries: boolean;
    private animationEnabled: boolean;  // Toggle for country animation (A key)
    private frameCount: number;
    private sceneInstrumentation: SceneInstrumentation;
    private bossPinTemplate: AbstractMesh | null;
    private placedPins: AbstractMesh[];
    private previewPin: TransformNode | null;
    private previewPinContainer: TransformNode | null;
    private isPlacingMode: boolean;
    private advancedTexture: AdvancedDynamicTexture | null;
    private pinButtonImage: Image | null;
    private bottomPanel: Rectangle | null;
    private loadingProgress: HTMLElement | null;
    private loadingText: HTMLElement | null;
    private loadingScreen: HTMLElement | null;
    private segmentData: SegmentData | null;
    private mergedSegmentBorders: Mesh | null;  // Merged mesh for segment borders
    private segmentAnimationIndices: Map<number, number[]>;  // Map from segment index to array of country indices
    private textureBuffer: Uint8ClampedArray | null;  // Pre-allocated buffer for texture updates
    private tempQuaternion: Quaternion;  // Reusable quaternion to avoid allocations
    private waterMaterial: ShaderMaterial | null;  // Water shader material for parameter adjustments
    private countryPicker: CountryPicker;  // Spatial index for fast country lookup from lat/lon
    private hoveredCountry: CountryPolygon | null;  // Currently hovered country (during pin placement)
    private onCountrySelected: ((country: CountryPolygon | null, latLon: LatLon) => void) | null;  // Callback for country selection (pin placed)
    private onCountryHovered: ((country: CountryPolygon | null, latLon: LatLon) => void) | null;  // Callback for country hover (during pin placement)
    private selectionBehavior: CountrySelectionBehavior | null;  // Handles visual feedback for country selection

    constructor() {
        this.canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
        this.engine = new Engine(this.canvas, true, { preserveDrawingBuffer: false, stencil: true });
        this.scene = new Scene(this.engine);
        this.camera = new ArcRotateCamera(
            "camera",
            Math.PI / 2,
            Math.PI / 2,
            10,
            Vector3.Zero(),
            this.scene
        );
        this.earthSphere = null!; // Will be created in createEarthSphere()
        this.polygonsData = [];
        this.countriesData = [];
        this.totalTriangleCount = 0;
        this.mergedCountries = null;
        this.mergedExtrudedBorders = null;
        this.animationTexture = null;
        this.animationData = new Float32Array(1024);  // Countries + segments (1024 max)
        this.showCountries = false;
        this.animationEnabled = false;
        this.frameCount = 0;
        this.bossPinTemplate = null;
        this.placedPins = [];
        this.previewPin = null;
        this.previewPinContainer = null;
        this.isPlacingMode = false;
        this.advancedTexture = null;
        this.pinButtonImage = null;
        this.bottomPanel = null;
        this.loadingProgress = document.getElementById('loadingProgress');
        this.loadingText = document.getElementById('loadingText');
        this.loadingScreen = document.getElementById('loadingScreen');
        this.segmentData = null;
        this.mergedSegmentBorders = null;
        this.segmentAnimationIndices = new Map();
        this.textureBuffer = null;
        this.tempQuaternion = new Quaternion();
        this.waterMaterial = null;
        this.countryPicker = new CountryPicker(10);  // 10° grid cells
        this.hoveredCountry = null;
        this.onCountrySelected = null;
        this.onCountryHovered = null;
        this.selectionBehavior = null;  // Will be created after GUI

        // Initialize scene instrumentation for accurate performance metrics
        this.sceneInstrumentation = new SceneInstrumentation(this.scene);
        this.sceneInstrumentation.captureFrameTime = true;

        this.init();
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Set a callback to be called when a country is selected (pin placed on it)
     * @param callback Function called with the country info and lat/lon, or null if over ocean
     */
    public setCountrySelectedCallback(callback: ((country: CountryPolygon | null, latLon: LatLon) => void) | null): void {
        this.onCountrySelected = callback;
    }

    /**
     * Set a callback to be called when hovering over a country (during pin placement mode)
     * @param callback Function called with the country info and lat/lon, or null if over ocean
     */
    public setCountryHoveredCallback(callback: ((country: CountryPolygon | null, latLon: LatLon) => void) | null): void {
        this.onCountryHovered = callback;
    }

    /**
     * Get the country at the given lat/lon coordinates
     * @param lat Latitude in degrees
     * @param lon Longitude in degrees
     * @returns The country at that location, or null if over ocean
     */
    public getCountryAtLatLon(lat: number, lon: number): CountryPolygon | null {
        return this.countryPicker.pickCountry({ lat, lon });
    }

    /**
     * Get the currently hovered country (during pin placement mode)
     * @returns The currently hovered country, or null
     */
    public getHoveredCountry(): CountryPolygon | null {
        return this.hoveredCountry;
    }

    /**
     * Get country data by ISO2 code
     * @param iso2 The two-letter country code (e.g., "US", "DE")
     * @returns The country data, or undefined if not found
     */
    public getCountryByISO2(iso2: string): CountryData | undefined {
        return this.countriesData.find(c => c.iso2 === iso2);
    }

    /**
     * Set the altitude (extrusion) value for a country
     * @param countryIndex The index of the country in countriesData
     * @param altitude Value between 0 and 1 (0 = no extrusion, 1 = max extrusion)
     */
    public setCountryAltitude(countryIndex: number, altitude: number): void {
        if (countryIndex >= 0 && countryIndex < this.animationData.length) {
            this.animationData[countryIndex] = Math.max(0, Math.min(1, altitude));
            this.updateAnimationTexture();
        }
    }

    /**
     * Get the current altitude value for a country
     * @param countryIndex The index of the country
     * @returns The altitude value (0-1)
     */
    public getCountryAltitude(countryIndex: number): number {
        if (countryIndex >= 0 && countryIndex < this.animationData.length) {
            return this.animationData[countryIndex];
        }
        return 0;
    }

    // =========================================================================
    // Private Methods
    // =========================================================================

    private async init(): Promise<void> {
        this.updateLoadingProgress(5, 'Initializing scene...');

        // Create scene
        this.scene.clearColor = new Color4(0.95, 0.95, 0.95, 1);

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
        const light = new HemisphericLight(
            "light",
            new Vector3(0, 1, 0),
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
            // Recreate GUI on resize for responsive layout (important for mobile orientation changes)
            this.recreateGUI();
        });

        this.updateLoadingProgress(25, 'Loading countries...');

        // Load countries
        await this.loadCountries();

        this.updateLoadingProgress(75, 'Loading 3D models...');

        // Load BossPin model and create preview pin
        await this.loadBossPinModel();
        this.createPreviewPin();

        this.updateLoadingProgress(90, 'Setting up controls...');

        // Create GUI
        this.createGUI();

        // Create country selection behavior (uses advancedTexture from createGUI)
        if (this.advancedTexture) {
            this.selectionBehavior = new CountrySelectionBehavior(
                this.scene,
                this.advancedTexture,
                (countryIndex, altitude) => this.setCountryAltitude(countryIndex, altitude),
                (countryIndex) => this.getCountryAltitude(countryIndex)
            );
            // Wire up hover callback for visual feedback during pin placement
            this.setCountryHoveredCallback((country, latLon) => {
                this.selectionBehavior?.onCountrySelected(country, latLon);
            });
        }

        // Setup drag-and-drop pin placement
        this.setupPinDragAndDrop();

        // Setup keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            // Inspector toggle (I key) - dynamically loaded
            if (e.key === 'i' || e.key === 'I') {
                this.toggleInspector();
            }
            // Reload scene (R key)
            if (e.key === 'r' || e.key === 'R') {
                this.reloadScene();
            }
            // Toggle water shader controls (W key)
            if (e.key === 'w' || e.key === 'W') {
                this.toggleWaterShaderControls();
            }
            // Toggle country animation (A key)
            if (e.key === 'a' || e.key === 'A') {
                this.animationEnabled = !this.animationEnabled;
                console.log(`Animation ${this.animationEnabled ? 'enabled' : 'disabled'}`);
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

        // Dispose GUI
        if (this.advancedTexture) {
            this.advancedTexture.dispose();
            this.advancedTexture = null;
        }
        this.pinButtonImage = null;
        this.bottomPanel = null;

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
        this.scene = new Scene(this.engine);

        // Recreate camera
        this.camera = new ArcRotateCamera(
            "camera",
            Math.PI / 2,
            Math.PI / 2,
            10,
            Vector3.Zero(),
            this.scene
        );

        // Reset all properties
        this.earthSphere = null!;
        this.polygonsData = [];
        this.countriesData = [];
        this.totalTriangleCount = 0;
        this.mergedCountries = null;
        this.mergedExtrudedBorders = null;
        this.animationTexture = null;
        this.animationData = new Float32Array(1024);  // Countries + segments (1024 max)
        this.showCountries = false;
        this.animationEnabled = false;
        this.frameCount = 0;
        this.bossPinTemplate = null;
        this.placedPins = [];
        this.previewPin = null;
        this.previewPinContainer = null;
        this.isPlacingMode = false;
        this.tempQuaternion = new Quaternion();
        this.countryPicker = new CountryPicker(10);
        this.hoveredCountry = null;
        // Note: Keep onCountrySelected callback across reloads

        // Reinitialize
        this.sceneInstrumentation = new SceneInstrumentation(this.scene);
        this.sceneInstrumentation.captureFrameTime = true;

        this.updateLoadingProgress(15, 'Recreating scene...');

        // Reinitialize scene
        await this.init();
    }

    private createEarthSphere(): void {
        // Create sphere for Earth
        this.earthSphere = MeshBuilder.CreateSphere(
            "earth",
            { diameter: EARTH_RADIUS * 2, segments: 64 },  // Increased segments for smoother water shader
            this.scene
        );

        // Apply water shader material
        this.waterMaterial = createWaterMaterial(this.scene, "OceanDepthMap.png", "earthWaterMaterial");
        this.earthSphere.material = this.waterMaterial;
    }

    private latLonToSphere(lat: number, lon: number, altitude: number = 0): Vector3 {
        // Convert degrees to radians
        const latRad = (lat * Math.PI) / 180.0;
        const lonRad = (lon * Math.PI) / 180.0;

        const radius = EARTH_RADIUS + altitude;

        // Convert to Cartesian coordinates (sphere)
        const x = radius * Math.cos(latRad) * Math.cos(lonRad);
        const y = radius * Math.sin(latRad);
        const z = radius * Math.cos(latRad) * Math.sin(lonRad);

        return new Vector3(x, y, z);
    }

    /**
     * Point-in-polygon test using ray casting algorithm
     */
    private pointInPolygon2D(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;

            if (((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Generate interior grid points for a polygon to improve triangulation on curved surfaces.
     * Returns points in lat/lon coordinates.
     */
    private generateInteriorPoints(
        latLonPoints: LatLonPoint[],
        holes: LatLonPoint[][] | undefined,
        gridSpacing: number = 5 // degrees
    ): LatLonPoint[] {
        // Calculate bounding box
        let minLat = Infinity, maxLat = -Infinity;
        let minLon = Infinity, maxLon = -Infinity;
        for (const p of latLonPoints) {
            minLat = Math.min(minLat, p.lat);
            maxLat = Math.max(maxLat, p.lat);
            minLon = Math.min(minLon, p.lon);
            maxLon = Math.max(maxLon, p.lon);
        }

        // Convert polygon and holes to simple 2D format for point-in-polygon test
        const poly2D = latLonPoints.map(p => ({ x: p.lon, y: p.lat }));
        const holes2D = holes ? holes.map(h => h.map(p => ({ x: p.lon, y: p.lat }))) : [];

        const interiorPoints: LatLonPoint[] = [];

        // Generate grid points
        for (let lat = minLat + gridSpacing; lat < maxLat; lat += gridSpacing) {
            for (let lon = minLon + gridSpacing; lon < maxLon; lon += gridSpacing) {
                const testPoint = { x: lon, y: lat };

                // Check if point is inside the outer polygon
                if (!this.pointInPolygon2D(testPoint, poly2D)) continue;

                // Check if point is inside any hole
                let inHole = false;
                for (const hole of holes2D) {
                    if (this.pointInPolygon2D(testPoint, hole)) {
                        inHole = true;
                        break;
                    }
                }
                if (inHole) continue;

                interiorPoints.push({ lat, lon });
            }
        }

        return interiorPoints;
    }

    /**
     * Triangulate polygon using cdt2d (Constrained Delaunay Triangulation)
     * Supports Steiner points for better triangulation of large polygons
     */
    private triangulateWithCDT(
        points: { x: number; y: number }[],
        holes?: { x: number; y: number }[][],
        steinerPoints?: { x: number; y: number }[]
    ): { vertices: { x: number; y: number }[]; indices: number[] } | null {
        try {
            // Build vertex array: boundary + holes + Steiner points
            const vertices: [number, number][] = [];
            const edges: [number, number][] = [];

            // Add boundary vertices and edges
            const boundaryStart = vertices.length;
            for (const p of points) {
                vertices.push([p.x, p.y]);
            }
            // Create boundary edges (closed loop)
            for (let i = 0; i < points.length; i++) {
                edges.push([boundaryStart + i, boundaryStart + ((i + 1) % points.length)]);
            }

            // Store hole polygons for later filtering
            const holePolygons: [number, number][][] = [];

            // Add hole vertices and edges
            if (holes && holes.length > 0) {
                for (const hole of holes) {
                    if (hole.length >= 3) {
                        const holeStart = vertices.length;
                        const holeVertices: [number, number][] = [];
                        for (const p of hole) {
                            vertices.push([p.x, p.y]);
                            holeVertices.push([p.x, p.y]);
                        }
                        holePolygons.push(holeVertices);
                        // Create hole edges (closed loop)
                        for (let i = 0; i < hole.length; i++) {
                            edges.push([holeStart + i, holeStart + ((i + 1) % hole.length)]);
                        }
                    }
                }
            }

            // Add Steiner points (no edges for these - they're interior points)
            if (steinerPoints && steinerPoints.length > 0) {
                for (const sp of steinerPoints) {
                    vertices.push([sp.x, sp.y]);
                }
            }

            // Run constrained Delaunay triangulation (returns ALL triangles including exterior)
            let triangles = cdt2d(vertices, edges);

            // Get boundary as array of [x,y] tuples for filtering
            const boundaryForFilter: [number, number][] = points.map(p => [p.x, p.y]);

            // Filter to keep only triangles inside boundary and outside holes
            triangles = filterTriangles(
                vertices,
                triangles,
                boundaryForFilter,
                holePolygons.length > 0 ? holePolygons : undefined
            );

            // Convert to flat indices
            const indices: number[] = [];
            for (const tri of triangles) {
                indices.push(tri[0], tri[1], tri[2]);
            }

            // Convert vertices back to {x, y} format
            const verticesXY = vertices.map(v => ({ x: v[0], y: v[1] }));

            return { vertices: verticesXY, indices };
        } catch (error) {
            console.error('cdt2d triangulation failed:', error);
            return null;
        }
    }

    private createCountryMesh(latLonPoints: LatLonPoint[], altitude: number = COUNTRY_ALTITUDE, holes?: LatLonPoint[][]): Mesh | null {
        if (latLonPoints.length < 3) {
            console.error("Not enough points to create mesh");
            return null;
        }

        try {
            // Use simple lat/lon as 2D coordinates for triangulation
            const points2D = latLonPoints.map(p => ({ x: p.lon, y: p.lat }));

            // Convert holes to 2D
            const holes2D = holes ? holes.map(hole => hole.map(p => ({ x: p.lon, y: p.lat }))) : [];

            // Use cdt2d with Steiner points for better triangulation
            const steinerPoints2D = this.generateInteriorPoints(latLonPoints, holes, 5)
                .map(p => ({ x: p.lon, y: p.lat }));

            const cdtResult = this.triangulateWithCDT(points2D, holes2D, steinerPoints2D);

            if (!cdtResult || cdtResult.indices.length === 0) {
                console.error("CDT triangulation failed for polygon with", latLonPoints.length, "points and", holes?.length || 0, "holes");
                return null;
            }

            // Convert cdt2d vertices back to lat/lon
            const finalVertices = cdtResult.vertices.map(v => ({ lat: v.y, lon: v.x }));

            // Reverse winding order for outward-facing triangles
            const finalIndices: number[] = [];
            for (let i = 0; i < cdtResult.indices.length; i += 3) {
                finalIndices.push(
                    cdtResult.indices[i + 2],
                    cdtResult.indices[i + 1],
                    cdtResult.indices[i]
                );
            }

            // Convert lat/lon points to 3D sphere coordinates
            const positions: number[] = [];
            const normals: number[] = [];
            const uvs: number[] = [];

            for (const point of finalVertices) {
                const vertex = this.latLonToSphere(point.lat, point.lon, altitude);
                positions.push(vertex.x, vertex.y, vertex.z);

                // Normal points outward from sphere center
                const normal = vertex.normalize();
                normals.push(normal.x, normal.y, normal.z);

                // UV with v=1 so country surfaces animate fully (top of extrusion)
                uvs.push(0, 1);
            }

            // Create custom mesh
            const customMesh = new Mesh("country", this.scene);

            const vertexData = new VertexData();
            vertexData.positions = positions;
            vertexData.indices = finalIndices;
            vertexData.normals = normals;
            vertexData.uvs = uvs;

            vertexData.applyToMesh(customMesh);

            // Track triangle count
            this.totalTriangleCount += finalIndices.length / 3;

            // Create material with varying colors
            const material = new StandardMaterial("countryMat", this.scene);
            const hue = (this.polygonsData.length % 360) / 360;
            const color = this.hsvToRgb(hue, COUNTRY_HSV_SATURATION, COUNTRY_HSV_VALUE);
            material.diffuseColor = color;
            material.specularColor = new Color3(0.1, 0.1, 0.1);

            customMesh.material = material;

            return customMesh;
        } catch (error) {
            console.error("Error creating country mesh:", error);
            return null;
        }
    }

    private hsvToRgb(h: number, s: number, v: number): Color3 {
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

        return new Color3(r, g, b);
    }

    private createExtrudedBorder(latLonPoints: LatLonPoint[], altitude: number = COUNTRY_ALTITUDE, countryIndex: number = 0, isHole: boolean = false): Mesh | null {
        try {
            // Convert lat/lon points to 3D sphere coordinates (top edge of border)
            const topPoints: Vector3[] = [];
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
            const bottomPoints: Vector3[] = [];
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
                const edgeDistance = Vector3.Distance(top, nextTop);
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
                // For holes, reverse the normal direction (inward-facing)
                const normal = isHole
                    ? Vector3.Cross(edge2, edge1).normalize()  // Reversed cross product
                    : Vector3.Cross(edge1, edge2).normalize();

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
            const borderMesh = new Mesh("extrudedBorder", this.scene);

            const vertexData = new VertexData();
            vertexData.positions = positions;
            vertexData.indices = indices;
            vertexData.normals = normals;
            vertexData.uvs = uvs;

            vertexData.applyToMesh(borderMesh);

            // Create unlit material for the extruded border
            const material = new StandardMaterial("extrudedBorderMat", this.scene);
            material.emissiveColor = new Color3(0.9, 0.9, 0.9);
            material.disableLighting = true;
            borderMesh.material = material;

            return borderMesh;
        } catch (error) {
            console.error("Error creating extruded border:", error);
            return null;
        }
    }

    private addPolygon(coordinates: number[], countryIndex: number, holePolygons?: number[][][], countryIso2?: string): number | null {
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

        // Convert hole polygons to LatLonPoint arrays
        const holeLatLonPoints: LatLonPoint[][] = [];
        if (holePolygons) {
            for (const holePoly of holePolygons) {
                const holePoints: LatLonPoint[] = [];
                for (const point of holePoly) {
                    holePoints.push({
                        lat: point[0],
                        lon: point[1]
                    });
                }
                holeLatLonPoints.push(holePoints);
            }
        }

        const mesh = this.createCountryMesh(latLonPoints, COUNTRY_ALTITUDE, holeLatLonPoints);

        if (mesh) {
            this.showCountries = true;

            // Create extruded border walls for this polygon (outer border)
            const extrudedBorder = this.createExtrudedBorder(latLonPoints, COUNTRY_ALTITUDE, countryIndex, false);

            // Create extruded borders for holes
            const holeExtrudedBorders: Mesh[] = [];
            if (holeLatLonPoints && holeLatLonPoints.length > 0) {
                for (const holePoints of holeLatLonPoints) {
                    const holeExtruded = this.createExtrudedBorder(holePoints, COUNTRY_ALTITUDE, countryIndex, true);
                    if (holeExtruded) {
                        holeExtrudedBorders.push(holeExtruded);
                    }
                }
            }

            // Merge main extruded border with hole borders
            let finalExtrudedBorder = extrudedBorder;
            if (extrudedBorder && holeExtrudedBorders.length > 0) {
                const allExtrudedBorders = [extrudedBorder, ...holeExtrudedBorders];
                const merged = Mesh.MergeMeshes(
                    allExtrudedBorders,
                    true,  // disposeSource
                    true,  // allow32BitsIndices
                    undefined,  // meshSubclass
                    false,  // subdivideWithSubMeshes
                    false  // multiMultiMaterial
                );
                finalExtrudedBorder = merged;
            } else if (holeExtrudedBorders.length > 0) {
                // No main border but have hole borders
                const merged = Mesh.MergeMeshes(
                    holeExtrudedBorders,
                    true,
                    true,
                    undefined,
                    false,
                    false
                );
                finalExtrudedBorder = merged;
            }

            // Store polygon data
            const polygonData: PolygonData = {
                mesh: mesh,
                extrudedBorder: finalExtrudedBorder,
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
            const totalStartTime = performance.now();

            // Load segments data
            const segmentsStartTime = performance.now();
            this.segmentData = await loadSegments('segments.json');
            console.log(`Loaded segments in ${(performance.now() - segmentsStartTime).toFixed(2)}ms`);

            const fetchStartTime = performance.now();
            const response = await fetch('countries-enriched.json');
            const countries = await response.json() as CountryJSON[];
            console.log(`Fetched ${countries.length} countries in ${(performance.now() - fetchStartTime).toFixed(2)}ms`);

            // Build set of enclave countries to skip rendering separately
            const enclaveISO2Set = new Set<string>();
            for (const country of countries) {
                if (country.holes) {
                    for (const holesInPolygon of Object.values(country.holes)) {
                        for (const enclaveISO2 of holesInPolygon) {
                            enclaveISO2Set.add(enclaveISO2);
                        }
                    }
                }
            }
            console.log('Found', enclaveISO2Set.size, 'enclave countries:', Array.from(enclaveISO2Set).join(', '));

            let addedCount = 0;
            let borderIndex = 0; // Track which border we're using from the binary data

            const meshGenStartTime = performance.now();
            for (const country of countries) {
                if (!country.paths || country.paths === '[]') continue;

                try {
                    const paths = JSON.parse(country.paths) as number[][][];
                    const polygonIndices: number[] = [];

                    // Build set of lake polygon indices (these will be rendered as holes, not standalone)
                    const lakePolygonIndices = new Set<number>();
                    if (country.lakes) {
                        for (const lakeIndices of Object.values(country.lakes)) {
                            for (const lakeIdx of lakeIndices) {
                                lakePolygonIndices.add(lakeIdx);
                            }
                        }
                    }

                    // Process all polygons (including islands) for this country
                    for (let polyIdx = 0; polyIdx < paths.length; polyIdx++) {
                        // Skip polygons that are lakes (they'll be added as holes to their parent)
                        if (lakePolygonIndices.has(polyIdx)) continue;

                        const polygon = paths[polyIdx];
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
                        if (hasLargeJump) {
                            continue;
                        }

                        // Flatten coordinates and build lat/lon points for picker
                        const flatCoords: number[] = [];
                        const latLonPoints: LatLon[] = [];
                        for (const point of polygon) {
                            flatCoords.push(point[0]); // lat
                            flatCoords.push(point[1]); // lon
                            latLonPoints.push({ lat: point[0], lon: point[1] });
                        }

                        if (flatCoords.length < 6) continue; // Need at least 3 points

                        // Get holes for this polygon (if any)
                        const holePolygons: number[][][] = [];

                        // Add enclave holes (other countries inside this one)
                        const holesForPolygon = country.holes?.[polyIdx];
                        if (holesForPolygon && holesForPolygon.length > 0) {
                            // Find hole countries and get their polygons
                            for (const holeISO2 of holesForPolygon) {
                                const holeCountry = countries.find(c => c.iso2 === holeISO2);
                                // Skip countries marked with skipHole (too small to render well)
                                if (holeCountry && holeCountry.paths && !holeCountry.skipHole) {
                                    const holePaths = JSON.parse(holeCountry.paths) as number[][][];
                                    // Add all polygons of the hole country
                                    for (const holePoly of holePaths) {
                                        holePolygons.push(holePoly);
                                    }
                                }
                            }
                        }

                        // Add lake holes (polygons within this polygon in the same country)
                        const lakesForPolygon = country.lakes?.[polyIdx];
                        if (lakesForPolygon && lakesForPolygon.length > 0) {
                            for (const lakeIdx of lakesForPolygon) {
                                const lakePoly = paths[lakeIdx];
                                if (lakePoly && lakePoly.length >= 3) {
                                    holePolygons.push(lakePoly);
                                }
                            }
                        }

                        // Add this polygon with reference to the country and holes
                        const polygonIndex = this.addPolygon(flatCoords, this.countriesData.length, holePolygons, country.iso2);
                        if (polygonIndex !== null) {
                            polygonIndices.push(polygonIndex);

                            // Add to spatial index for picking
                            this.countryPicker.addPolygon({
                                iso2: country.iso2,
                                name: country.name_en,
                                countryIndex: this.countriesData.length,
                                polygonIndex: polyIdx,
                                points: latLonPoints,
                                bbox: calculateBoundingBox(latLonPoints)
                            });
                        }
                    }

                    if (polygonIndices.length > 0) {
                        // Create country metadata
                        const countryData: CountryData = {
                            name: country.name_en,
                            iso2: country.iso2,
                            index: this.countriesData.length,
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

            console.log(`Generated ${addedCount} countries with ${this.polygonsData.length} polygons, ${this.totalTriangleCount} triangles in ${(performance.now() - meshGenStartTime).toFixed(2)}ms`);

            // Log country picker stats
            const pickerStats = this.countryPicker.getStats();
            console.log(`Country picker: ${pickerStats.polygonCount} polygons in ${pickerStats.cellCount} grid cells (avg ${pickerStats.avgPolygonsPerCell.toFixed(1)} per cell)`);

            // Create animation texture before merging
            const animTexStartTime = performance.now();
            this.createAnimationTexture();
            console.log(`Created animation texture in ${(performance.now() - animTexStartTime).toFixed(2)}ms`);

            // Merge all meshes for performance
            const mergeStartTime = performance.now();
            this.mergeCountryPolygons();
            this.mergeExtrudedBorders();
            console.log(`Merged meshes in ${(performance.now() - mergeStartTime).toFixed(2)}ms`);

            // Render segment borders (international borders only)
            const segmentBordersStartTime = performance.now();
            this.renderSegmentBorders();
            console.log(`Rendered segment borders in ${(performance.now() - segmentBordersStartTime).toFixed(2)}ms`);

            // Detect neighbors after all countries are loaded
            this.detectNeighbors();

            console.log(`Total loadCountries time: ${(performance.now() - totalStartTime).toFixed(2)}ms`);

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
        // Create 1D texture (1024x1) to store animation values per country AND per segment
        const textureWidth = 1024;
        this.animationTexture = new DynamicTexture("animationTexture", { width: textureWidth, height: 1 }, this.scene, false);

        // Pre-allocate buffer for updates
        this.textureBuffer = new Uint8ClampedArray(textureWidth * 4);

        // Initialize alpha channel to 255
        for (let i = 0; i < this.textureBuffer.length; i += 4) {
            this.textureBuffer[i + 3] = 255;
        }

        this.updateAnimationTexture();
    }

    private updateAnimationTexture(): void {
        if (!this.animationTexture || !this.textureBuffer) return;

        const entriesUsed = this.countriesData.length + this.segmentAnimationIndices.size;

        // Update buffer directly (much faster than canvas operations)
        for (let i = 0; i < entriesUsed; i++) {
            const value = this.animationData[i] || 0;
            const pixelIndex = i * 4;
            this.textureBuffer[pixelIndex] = value * 255;  // R channel
            // G, B already 0, A already 255
        }

        // Update texture from buffer (1D, single row)
        const context = this.animationTexture.getContext() as CanvasRenderingContext2D;
        const imageData = new ImageData(this.textureBuffer, 1024, 1);
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
    ): ShaderMaterial {
        try {
            // Setup vertex shader
            const vertexShader = animatedVertexShader
                .replace('// VARYINGS_PLACEHOLDER', varyings)
                .replace('// VARYING_ASSIGNMENTS_PLACEHOLDER', varyingAssignments);

            Effect.ShadersStore[`${name}VertexShader`] = vertexShader;
            Effect.ShadersStore[`${name}FragmentShader`] = fragmentShader;

            // Create shader material
            const shaderMaterial = new ShaderMaterial(name, this.scene, {
                vertex: name,
                fragment: name,
            }, {
                attributes: ["position", "normal", "uv", "countryIndex"],
                uniforms: ["worldViewProjection", "world", "animationTextureWidth", "animationAmplitude", ...uniforms],
                samplers: ["animationTexture"]
            });

            // Setup compilation callbacks
            shaderMaterial.onCompiled = () => console.log(`Shader ${name} compiled successfully`);
            shaderMaterial.onError = (effect, errors) => this.showShaderError(name, errors);

            // Set common uniforms
            if (this.animationTexture) {
                shaderMaterial.setTexture("animationTexture", this.animationTexture);
            }
            shaderMaterial.setFloat("animationTextureWidth", 1024);
            shaderMaterial.setFloat("animationAmplitude", ANIMATION_AMPLITUDE);
            shaderMaterial.backFaceCulling = false;

            return shaderMaterial;
        } catch (error) {
            this.showShaderError(name, error);
            throw error;
        }
    }

    private createUnlitMaterial(originalMaterial: Material | null): ShaderMaterial {
        const materialName = "unlitMaterial_" + Date.now();

        Effect.ShadersStore[`${materialName}VertexShader`] = unlitVertexShader;
        Effect.ShadersStore[`${materialName}FragmentShader`] = unlitFragmentShader;

        const shaderMaterial = new ShaderMaterial(materialName, this.scene, {
            vertex: materialName,
            fragment: materialName,
        }, {
            attributes: ["position", "uv"],
            uniforms: ["worldViewProjection", "baseColor", "hasTexture"],
            samplers: ["baseColorTexture"]
        });

        // Try to extract color from original material
        let baseColor = new Color4(1, 1, 1, 1);
        let hasTexture = false;

        if (originalMaterial) {
            // Try to get base color from PBR material
            const pbrMat = originalMaterial as any;
            if (pbrMat.albedoColor) {
                const c = pbrMat.albedoColor;
                baseColor = new Color4(c.r, c.g, c.b, 1.0);
            } else if (pbrMat.diffuseColor) {
                const c = pbrMat.diffuseColor;
                baseColor = new Color4(c.r, c.g, c.b, 1.0);
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

    private createBorderShaderMaterial(name: string, baseColor: Color3): ShaderMaterial {
        const material = this.createShaderMaterial(name, borderFragmentShader, ["baseColor"]);
        material.setColor3("baseColor", baseColor);
        return material;
    }

    private createCountryShaderMaterial(): ShaderMaterial {
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
        meshGetter: (polygon: PolygonData) => Mesh | null,
        meshName: string,
        materialCreator: () => ShaderMaterial,
        meshSetter?: (polygon: PolygonData, merged: Mesh) => void
    ): Mesh | null {
        console.log(`Merging ${meshName}...`);
        const startTime = performance.now();

        // Collect meshes and their vertex counts BEFORE merging
        const meshes: Mesh[] = [];
        const vertexCounts: number[] = [];
        const countryIndicesPerMesh: number[] = [];

        for (let polygonIdx = 0; polygonIdx < this.polygonsData.length; polygonIdx++) {
            const polygon = this.polygonsData[polygonIdx];
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
        const mergedMesh = Mesh.MergeMeshes(
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
        const buffer = new VertexBuffer(
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

    private renderSegmentBorders(): void {
        if (!this.segmentData) {
            console.log('No segment data loaded, skipping segment border rendering');
            return;
        }

        console.log('Rendering segment borders...');
        const startTime = performance.now();

        // Get only shared segments (no coastlines)
        const sharedSegments = getSharedSegments(this.segmentData);
        console.log(`Rendering ${sharedSegments.length} shared border segments`);

        // Clear previous segment animation mappings
        this.segmentAnimationIndices.clear();

        // Create tube meshes - one per segment
        const segmentTubes: Mesh[] = [];
        const vertexCounts: number[] = [];
        const segmentIndicesPerTube: number[] = [];

        for (let segmentIdx = 0; segmentIdx < sharedSegments.length; segmentIdx++) {
            const segment = sharedSegments[segmentIdx];
            if (segment.points.length < 2) continue;

            try {
                const tube = MeshBuilder.CreateTube(
                    "segmentBorder",
                    {
                        path: segment.points,
                        radius: TUBE_RADIUS * 1.2,  // Slightly thicker than regular borders
                        tessellation: TUBE_TESSELLATION,
                        cap: Mesh.CAP_ALL
                    },
                    this.scene
                );

                // Fix UV coordinates for animation: set uv.y = 1.0 for all vertices
                // This makes the entire tube animate uniformly (like the top of extruded borders)
                const uvs = tube.getVerticesData(VertexBuffer.UVKind);
                if (uvs) {
                    for (let i = 1; i < uvs.length; i += 2) {
                        uvs[i] = 1.0;  // Set all uv.y values to 1.0
                    }
                    tube.setVerticesData(VertexBuffer.UVKind, uvs);
                }

                segmentTubes.push(tube);
                vertexCounts.push(tube.getTotalVertices());

                // Assign this segment an index in the animation texture (after countries)
                const segmentAnimationIndex = MAX_ANIMATION_COUNTRIES + segmentIdx;
                segmentIndicesPerTube.push(segmentAnimationIndex);

                // Store mapping from segment animation index to country indices
                const countryIndices: number[] = [];
                for (const countryCode of segment.countries) {
                    const countryData = this.countriesData.find(c => c.iso2 === countryCode);
                    if (countryData) {
                        countryIndices.push(countryData.index);
                    }
                }
                this.segmentAnimationIndices.set(segmentAnimationIndex, countryIndices);
            } catch (error) {
                console.error('Error creating segment tube:', error);
            }
        }

        if (segmentTubes.length === 0) {
            console.log('No segment tubes created');
            return;
        }

        // Merge all segment tubes into a single mesh
        this.mergedSegmentBorders = Mesh.MergeMeshes(
            segmentTubes,
            true,  // disposeSource
            true,  // allow32BitsIndices
            undefined,  // meshSubclass
            false,  // subdivideWithSubMeshes
            false  // multiMultiMaterial
        );

        if (!this.mergedSegmentBorders) {
            console.error('Failed to merge segment borders');
            return;
        }

        this.mergedSegmentBorders.name = "mergedSegmentBorders";

        // Rebuild countryIndex attribute - but use segment animation index instead
        const totalVertices = this.mergedSegmentBorders.getTotalVertices();
        const segmentIndices = new Float32Array(totalVertices);

        let vertexOffset = 0;
        for (let tubeIdx = 0; tubeIdx < vertexCounts.length; tubeIdx++) {
            const vertexCount = vertexCounts[tubeIdx];
            const segmentAnimationIndex = segmentIndicesPerTube[tubeIdx];
            for (let i = 0; i < vertexCount; i++) {
                segmentIndices[vertexOffset + i] = segmentAnimationIndex;
            }
            vertexOffset += vertexCount;
        }

        // Create custom vertex buffer for countryIndex (stores segment animation index)
        const buffer = new VertexBuffer(
            this.engine,
            segmentIndices,
            "countryIndex",
            false,  // updatable
            false,  // postponeInternalCreation
            1,      // stride
            false   // instanced
        );
        this.mergedSegmentBorders.setVerticesBuffer(buffer);

        // Apply animated shader material (white color to match tube borders)
        const material = this.createBorderShaderMaterial(
            "segmentBorderShader",
            BORDER_COLOR_WHITE
        );
        this.mergedSegmentBorders.material = material;

        const endTime = performance.now();
        console.log(`Rendered ${sharedSegments.length} segment borders in ${(endTime - startTime).toFixed(2)}ms`);
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

    private animationWasEnabled: boolean = false;  // Track previous state to avoid redundant texture updates

    private updateAnimation(): void {
        if (!this.animationEnabled) {
            // Only update texture once when transitioning to disabled
            if (this.animationWasEnabled) {
                this.animationData.fill(0);
                this.updateAnimationTexture();
                this.animationWasEnabled = false;
            }
            return;
        }

        this.animationWasEnabled = true;
        const time = Date.now() * 0.001;  // Time in seconds

        // Animate all countries with unique sine wave patterns
        for (let i = 0; i < this.countriesData.length; i++) {
            const offset = i * 0.5;
            const frequency = 0.5 + (i % 10) * 0.1;
            this.animationData[i] = (Math.sin(time * frequency + offset) + 1) * 0.5;  // Range 0-1
        }

        // Update segment animation values - use max of all countries in that segment
        for (const [segmentAnimationIndex, countryIndices] of this.segmentAnimationIndices) {
            let maxValue = 0;
            for (const countryIndex of countryIndices) {
                const countryValue = this.animationData[countryIndex] || 0;
                maxValue = Math.max(maxValue, countryValue);
            }
            this.animationData[segmentAnimationIndex] = maxValue;
        }

        this.updateAnimationTexture();
    }

    private update(): void {
        this.frameCount++;
        this.updateStats();
        this.updateAnimation();
    }

    private async loadBossPinModel(): Promise<void> {
        try {
            const result = await SceneLoader.ImportMeshAsync("", "/", "BossPin.glb", this.scene);

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
        if (!this.pinButtonImage) return;

        // Handle pointerdown on GUI pin button - click animation and enter placing mode
        this.pinButtonImage.onPointerDownObservable.add(() => {
            // Apply click animation
            this.pinButtonImage!.scaleX = 0.95;
            this.pinButtonImage!.scaleY = 0.95;

            // Enter placing mode
            this.enterPlacingMode();
        });

        // Handle pointerup on button to reset scale
        this.pinButtonImage.onPointerUpObservable.add(() => {
            this.pinButtonImage!.scaleX = 1.0;
            this.pinButtonImage!.scaleY = 1.0;
        });

        // Handle pointermove on canvas - update preview pin position
        this.canvas.addEventListener('pointermove', (e) => {
            if (this.isPlacingMode && this.previewPin) {
                this.updatePreviewPinPosition(e);
            }
        });

        // Handle pointerup - place pin and exit placing mode (left or right button)
        this.canvas.addEventListener('pointerup', (e) => {
            if (this.isPlacingMode && (e.button === 0 || e.button === 2)) {
                this.exitPlacingMode(true); // true = place the pin
            }
        });

        // Handle pointer leaving canvas - cancel placing mode
        this.canvas.addEventListener('pointerleave', (e) => {
            if (this.isPlacingMode) {
                this.exitPlacingMode(false); // false = don't place the pin
            }
        });

        // Right-click on globe enters placing mode
        this.canvas.addEventListener('pointerdown', (e) => {
            if (e.button === 2 && !this.isPlacingMode) {
                // Check if clicking on the globe
                const pickResult = this.scene.pick(e.clientX, e.clientY, (mesh) => {
                    return mesh === this.earthSphere;
                });
                if (pickResult.hit) {
                    this.enterPlacingMode();
                    this.updatePreviewPinPosition(e);
                }
            }
        });

        // Prevent context menu on right-click
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    private enterPlacingMode(): void {
        if (!this.previewPin) return;

        this.isPlacingMode = true;

        // Hide ONLY the GUI pin button, keep the panel visible
        if (this.pinButtonImage) {
            this.pinButtonImage.isVisible = false;
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

        // Show ONLY the GUI pin button (panel stays visible always)
        if (this.pinButtonImage) {
            this.pinButtonImage.isVisible = true;
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
            // Call the country selected callback if set
            if (this.onCountrySelected && this.previewPin) {
                const pinPos = this.previewPin.position;
                const latLon = cartesianToLatLon(pinPos.x, pinPos.y, pinPos.z);
                const country = this.countryPicker.pickCountry(latLon);
                this.onCountrySelected(country, latLon);

                if (country) {
                    console.log(`Pin placed in ${country.name} (${country.iso2}) at lat: ${latLon.lat.toFixed(4)}, lon: ${latLon.lon.toFixed(4)}`);
                } else {
                    console.log(`Pin placed in ocean at lat: ${latLon.lat.toFixed(4)}, lon: ${latLon.lon.toFixed(4)}`);
                }
            } else {
                console.log('Pin placed at current position');
            }
        } else {
            console.log('Pin placement cancelled');
        }

        // Clear hovered country and deselect when exiting placing mode
        if (this.hoveredCountry && this.selectionBehavior) {
            this.selectionBehavior.deselectCurrent();
        }
        this.hoveredCountry = null;
        console.log('Exited placing mode');
    }

    private createPreviewPin(): void {
        if (!this.bossPinTemplate) return;

        const clonedMeshes: AbstractMesh[] = [];
        const originalChildren = this.bossPinTemplate.getChildMeshes();

        // Create parent transform node for preview
        const pinPivot = new TransformNode("previewPinPivot", this.scene);

        // Create pin container as child of pivot
        this.previewPinContainer = new TransformNode("previewPinContainer", this.scene);
        this.previewPinContainer.parent = pinPivot;

        // Initial scale (will be updated based on camera zoom)
        const pinScale = 150;
        this.previewPinContainer.scaling = new Vector3(pinScale, pinScale, pinScale);

        // Clone each child mesh and apply unlit shader
        originalChildren.forEach(child => {
            const clonedChild = child.clone(child.name + "_preview", this.previewPinContainer);
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

    private createGUI(): void {
        // Create fullscreen UI
        this.advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI", true, this.scene);
        this.advancedTexture.background = "";  // Make background transparent

        // Create nine-patch country card at top center
        const countryCard = new Image("countryCard", "/question_card_simple.png");
        countryCard.width = "300px";
        countryCard.height = "100px";
        countryCard.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        countryCard.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        countryCard.top = "20px";
        countryCard.isPointerBlocker = false;

        // Set nine-patch stretch mode
        countryCard.stretch = Image.STRETCH_NINE_PATCH;

        // Set slice values - these are absolute positions from origin for a 101x101 image
        countryCard.sliceLeft = 10;    // Left border ends at x=10
        countryCard.sliceRight = 91;   // Right border starts at x=91 (101-10)
        countryCard.sliceTop = 10;     // Top border ends at y=10
        countryCard.sliceBottom = 91;  // Bottom border starts at y=91 (101-10)

        // Add card to GUI
        this.advancedTexture.addControl(countryCard);

        // Create text for the country name (layered on top)
        const countryText = new TextBlock("countryText", "Sweden");
        countryText.width = "300px";
        countryText.height = "100px";
        countryText.color = "#003366";  // Dark blue color
        countryText.fontSize = 32;
        countryText.fontWeight = "bold";
        countryText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        countryText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        countryText.top = "20px";
        countryText.isPointerBlocker = false;

        // Add text to GUI (on top of the card)
        this.advancedTexture.addControl(countryText);

        // Create pin button FIRST so it appears BEHIND the panel
        // Actual image is 196x900px, scale to 1/2
        const pinScale = 0.5;
        this.pinButtonImage = new Image("pinButton", "/DefaultPin.png");
        this.pinButtonImage.width = `${196 * pinScale}px`;
        this.pinButtonImage.height = `${900 * pinScale}px`;
        this.pinButtonImage.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.pinButtonImage.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.pinButtonImage.top = "170px";  // Way down - negative means up from bottom
        this.pinButtonImage.left = "50px";   // Slight offset to the right
        this.pinButtonImage.rotation = 0.14; // 8 degrees in radians

        // Make it interactive
        this.pinButtonImage.isPointerBlocker = true;

        // Add hover effects
        this.pinButtonImage.onPointerEnterObservable.add(() => {
            if (!this.isPlacingMode) {
                this.pinButtonImage!.scaleX = 1.05;
                this.pinButtonImage!.scaleY = 1.05;
            }
        });

        this.pinButtonImage.onPointerOutObservable.add(() => {
            if (!this.isPlacingMode) {
                this.pinButtonImage!.scaleX = 1.0;
                this.pinButtonImage!.scaleY = 1.0;
            }
        });

        // Add pin to GUI FIRST (so it's behind)
        this.advancedTexture.addControl(this.pinButtonImage);

        // Create bottom panel AFTER pin (so it's in front)
        this.bottomPanel = new Rectangle("bottomPanel");
        this.bottomPanel.width = "600px";
        this.bottomPanel.height = "150px";
        this.bottomPanel.thickness = 0;
        this.bottomPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.bottomPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.bottomPanel.top = "30px";

        // Solid blue color - no transparency
        this.bottomPanel.background = "#6496DC";  // Blue color
        this.bottomPanel.alpha = 1.0;  // Fully opaque
        this.bottomPanel.cornerRadius = 60;

        // Add panel to GUI AFTER pin (so it's in front)
        this.advancedTexture.addControl(this.bottomPanel);

        console.log('GUI created with fixed sizing (matching original DOM layout)');
    }

    private recreateGUI(): void {
        // Dispose old selection behavior (it has GUI elements)
        if (this.selectionBehavior) {
            this.selectionBehavior.dispose();
            this.selectionBehavior = null;
        }

        // Dispose old GUI
        if (this.advancedTexture) {
            this.advancedTexture.dispose();
            this.advancedTexture = null;
        }
        this.pinButtonImage = null;
        this.bottomPanel = null;

        // Recreate GUI with new dimensions
        this.createGUI();

        // Recreate selection behavior
        if (this.advancedTexture) {
            this.selectionBehavior = new CountrySelectionBehavior(
                this.scene,
                this.advancedTexture,
                (countryIndex, altitude) => this.setCountryAltitude(countryIndex, altitude),
                (countryIndex) => this.getCountryAltitude(countryIndex)
            );
            this.setCountryHoveredCallback((country, latLon) => {
                this.selectionBehavior?.onCountrySelected(country, latLon);
            });
        }

        // Re-setup pin drag and drop event handlers
        this.setupPinDragAndDrop();

        console.log('GUI recreated for new screen size');
    }

    private updatePreviewPinPosition(event: PointerEvent): void {
        if (!this.previewPin) return;

        // PERFORMANCE OPTIMIZATION: Only pick against the earth sphere, not all meshes
        const pickResult = this.scene.pick(event.clientX, event.clientY, (mesh) => {
            return mesh === this.earthSphere;
        });

        if (pickResult.hit && pickResult.pickedPoint) {
            // Show the pin when we hit the globe for the first time
            if (!this.previewPin.isEnabled()) {
                this.previewPin.setEnabled(true);
            }

            // Scale pin based on camera distance (smaller when zoomed in, larger when zoomed out)
            if (this.previewPinContainer) {
                const baseScale = 150;
                const referenceRadius = 10;  // Reference distance for base scale
                const pinScale = baseScale * (this.camera.radius / referenceRadius);
                this.previewPinContainer.scaling.setAll(pinScale);
            }

            // Calculate surface normal (normalize in place to avoid allocation)
            const normal = pickResult.pickedPoint.normalize();

            // Position on globe surface (scale in place to avoid allocation)
            this.previewPin.position.copyFrom(normal).scaleInPlace(EARTH_RADIUS);

            // Orient the pivot so its local Y-axis points along the normal
            // Reuse tempQuaternion to avoid allocating a new quaternion every frame
            const defaultUp = Vector3.Up();
            Quaternion.FromUnitVectorsToRef(
                defaultUp,
                normal,
                this.tempQuaternion
            );
            this.previewPin.rotationQuaternion = this.tempQuaternion;

            // Detect which country the pin is over
            const pickedPoint = pickResult.pickedPoint;
            const latLon = cartesianToLatLon(pickedPoint.x, pickedPoint.y, pickedPoint.z);
            const country = this.countryPicker.pickCountry(latLon);

            // Check if hovered country changed
            const previousHovered = this.hoveredCountry;
            const countryChanged = country?.iso2 !== previousHovered?.iso2;

            if (country) {
                this.hoveredCountry = country;
            } else {
                this.hoveredCountry = null;
            }

            // Call hover callback if country changed
            if (countryChanged && this.onCountryHovered) {
                this.onCountryHovered(country, latLon);
            }
        } else {
            // Not over globe - clear hover if was previously hovering
            if (this.hoveredCountry && this.onCountryHovered) {
                const latLon = cartesianToLatLon(0, 0, 0); // Dummy latLon
                this.onCountryHovered(null, latLon);
            }
            this.hoveredCountry = null;
        }
        // Don't hide the pin when not over the globe - keep it at last position
        // It will only be hidden when exiting placing mode
    }

    private async toggleInspector(): Promise<void> {
        // Inspector only available in development builds
        if (!import.meta.env.DEV) {
            console.log('Inspector is only available in development mode');
            return;
        }

        if (this.scene.debugLayer.isVisible()) {
            this.scene.debugLayer.hide();
        } else {
            this.scene.debugLayer.show({
                embedMode: true,
            });
        }
    }

    private toggleWaterShaderControls(): void {
        if (!this.waterMaterial) return;

        // Check if panel already exists
        const existingPanel = document.getElementById('waterShaderPanel');
        if (existingPanel) {
            existingPanel.remove();
            return;
        }

        // Create control panel
        const panel = document.createElement('div');
        panel.id = 'waterShaderPanel';
        panel.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            width: 350px;
            max-height: 80vh;
            overflow-y: auto;
            background: rgba(30, 30, 30, 0.95);
            color: white;
            padding: 20px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 12px;
            z-index: 1000;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        `;

        const title = document.createElement('h3');
        title.textContent = 'Water Shader Controls (Press W to close)';
        title.style.cssText = 'margin: 0 0 15px 0; font-size: 14px;';
        panel.appendChild(title);

        const createSlider = (label: string, min: number, max: number, step: number, value: number, onChange: (v: number) => void) => {
            const container = document.createElement('div');
            container.style.cssText = 'margin-bottom: 12px;';

            const labelEl = document.createElement('div');
            labelEl.textContent = `${label}: `;
            labelEl.style.cssText = 'margin-bottom: 4px; display: flex; justify-content: space-between;';

            const valueEl = document.createElement('span');
            valueEl.textContent = value.toFixed(step < 1 ? 2 : 0);
            valueEl.style.cssText = 'color: #4CAF50;';
            labelEl.appendChild(valueEl);

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = min.toString();
            slider.max = max.toString();
            slider.step = step.toString();
            slider.value = value.toString();
            slider.style.cssText = 'width: 100%;';

            slider.oninput = () => {
                const v = parseFloat(slider.value);
                valueEl.textContent = v.toFixed(step < 1 ? 2 : 0);
                onChange(v);
            };

            container.appendChild(labelEl);
            container.appendChild(slider);
            return container;
        };

        const createColorPicker = (label: string, r: number, g: number, b: number, onChange: (r: number, g: number, b: number) => void) => {
            const container = document.createElement('div');
            container.style.cssText = 'margin-bottom: 12px;';

            const labelEl = document.createElement('div');
            labelEl.textContent = label;
            labelEl.style.cssText = 'margin-bottom: 4px;';

            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            // Convert 0-1 RGB to hex
            const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
            colorInput.value = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
            colorInput.style.cssText = 'width: 100%; height: 30px; cursor: pointer;';

            colorInput.oninput = () => {
                const hex = colorInput.value;
                const r = parseInt(hex.substring(1, 3), 16) / 255;
                const g = parseInt(hex.substring(3, 5), 16) / 255;
                const b = parseInt(hex.substring(5, 7), 16) / 255;
                onChange(r, g, b);
            };

            container.appendChild(labelEl);
            container.appendChild(colorInput);
            return container;
        };

        // Water Colors
        panel.appendChild(createColorPicker('Shallow Water Color', 0.4, 0.8, 0.95, (r, g, b) =>
            this.waterMaterial!.setVector3('shallowColor', new Vector3(r, g, b))));
        panel.appendChild(createColorPicker('Water Color', 0.1, 0.35, 0.65, (r, g, b) =>
            this.waterMaterial!.setVector3('waterColor', new Vector3(r, g, b))));
        panel.appendChild(createColorPicker('Deep Water Color', 0.02, 0.08, 0.25, (r, g, b) =>
            this.waterMaterial!.setVector3('deepColor', new Vector3(r, g, b))));
        panel.appendChild(createColorPicker('Caustic Color', 1.0, 1.0, 1.0, (r, g, b) =>
            this.waterMaterial!.setVector3('causticColor', new Vector3(r, g, b))));
        panel.appendChild(createColorPicker('Foam Color', 0.7, 0.95, 1.0, (r, g, b) =>
            this.waterMaterial!.setVector3('foamColor', new Vector3(r, g, b))));

        // Caustics
        const hr0 = document.createElement('hr');
        hr0.style.cssText = 'border: none; border-top: 1px solid #555; margin: 15px 0;';
        panel.appendChild(hr0);

        panel.appendChild(createSlider('Caustic Scale', 50, 400, 10, 200, v => this.waterMaterial!.setFloat('causticScale', v)));
        panel.appendChild(createSlider('Caustic Strength', 0, 2, 0.1, 0.6, v => this.waterMaterial!.setFloat('causticStrength', v)));
        panel.appendChild(createSlider('Caustic Speed', 0, 1, 0.01, 0.38, v => this.waterMaterial!.setFloat('causticSpeed', v)));
        panel.appendChild(createSlider('Caustic Deform', 0, 300, 10, 131, v => this.waterMaterial!.setFloat('causticDeform', v)));
        panel.appendChild(createSlider('Caustic Deform Scale', 0, 0.2, 0.01, 0.08, v => this.waterMaterial!.setFloat('causticDeformScale', v)));

        // Foam
        const hr1 = document.createElement('hr');
        hr1.style.cssText = 'border: none; border-top: 1px solid #555; margin: 15px 0;';
        panel.appendChild(hr1);

        panel.appendChild(createSlider('Foam Width', 0, 1, 0.01, 0.99, v => this.waterMaterial!.setFloat('foamWidth', v)));
        panel.appendChild(createSlider('Foam Strength', 0, 100, 1, 40, v => this.waterMaterial!.setFloat('foamStrength', v)));
        panel.appendChild(createSlider('Foam Noise Scale', 50, 1000, 10, 500, v => this.waterMaterial!.setFloat('foamNoiseScale', v)));
        panel.appendChild(createSlider('Foam Speed', 0, 0.1, 0.001, 0.03, v => this.waterMaterial!.setFloat('foamNoiseSpeed', v)));
        panel.appendChild(createSlider('Foam Ripple Width', 0, 1, 0.01, 0.2, v => this.waterMaterial!.setFloat('foamRippleWidth', v)));
        panel.appendChild(createSlider('Foam Coast', 0, 1, 0.01, 0.39, v => this.waterMaterial!.setFloat('foamCoast', v)));
        panel.appendChild(createSlider('Foam N Ripples', 0, 10, 1, 3, v => this.waterMaterial!.setFloat('foamNRipples', v)));
        panel.appendChild(createSlider('Foam UV Strength', 0, 200, 10, 0, v => this.waterMaterial!.setFloat('foamUvStrength', v)));

        // Waves
        const hr2 = document.createElement('hr');
        hr2.style.cssText = 'border: none; border-top: 1px solid #555; margin: 15px 0;';
        panel.appendChild(hr2);

        panel.appendChild(createSlider('Wave Height', 0, 0.2, 0.01, 0, v => this.waterMaterial!.setFloat('waveHeight', v)));
        panel.appendChild(createSlider('Wave Scale', 0, 20, 1, 9, v => this.waterMaterial!.setFloat('waveScale', v)));
        panel.appendChild(createSlider('Wave Speed', 0, 0.01, 0.0001, 0.001, v => this.waterMaterial!.setFloat('waveSpeed', v)));

        document.body.appendChild(panel);
        console.log('Water shader controls opened - Press W to close');
    }

}

// Initialize the application when page loads
window.addEventListener('DOMContentLoaded', () => {
    const app = new EarthGlobe();
    // Make the app accessible globally for debugging and external use
    (window as unknown as { earthGlobe: EarthGlobe }).earthGlobe = app;
});

// Export types and class for external use
export { EarthGlobe };
export type { CountryPolygon, LatLon } from './countryPicker';
