/**
 * Pin Manager Module
 * Handles pin placement mode, preview pin, and pin events
 */

import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Material } from '@babylonjs/core/Materials/material';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import type { CountryPicker, CountryPolygon, LatLon } from './countryPicker';
import { cartesianToLatLon } from './countryPicker';

const EARTH_RADIUS = 2.0;

export class PinManager {
    private scene: Scene;
    private camera: ArcRotateCamera;
    private canvas: HTMLCanvasElement;
    private countryPicker: CountryPicker;
    private earthSphere: Mesh;
    private createUnlitMaterial: (originalMaterial: Material | null) => Material;

    // Pin meshes
    private bossPinTemplate: AbstractMesh | null = null;
    private placedPins: AbstractMesh[] = [];
    private previewPin: TransformNode | null = null;
    private previewPinContainer: TransformNode | null = null;

    // State
    private isPlacingMode: boolean = false;
    private hoveredCountry: CountryPolygon | null = null;

    // Callbacks
    private onPinPlacedCallback: ((country: CountryPolygon | null, latLon: LatLon) => void) | null = null;
    private onCountryHoverCallback: ((country: CountryPolygon | null, latLon: LatLon) => void) | null = null;
    private onPlacingModeChangeCallback: ((isPlacing: boolean) => void) | null = null;

    constructor(
        scene: Scene,
        camera: ArcRotateCamera,
        canvas: HTMLCanvasElement,
        countryPicker: CountryPicker,
        earthSphere: Mesh,
        createUnlitMaterial: (originalMaterial: Material | null) => Material
    ) {
        this.scene = scene;
        this.camera = camera;
        this.canvas = canvas;
        this.countryPicker = countryPicker;
        this.earthSphere = earthSphere;
        this.createUnlitMaterial = createUnlitMaterial;
    }

    async init(): Promise<void> {
        await this.loadBossPinModel();
        this.createPreviewPin();
        this.setupEventHandlers();
    }

    onPinPlaced(callback: (country: CountryPolygon | null, latLon: LatLon) => void): void {
        this.onPinPlacedCallback = callback;
    }

    onCountryHover(callback: (country: CountryPolygon | null, latLon: LatLon) => void): void {
        this.onCountryHoverCallback = callback;
    }

    onPlacingModeChange(callback: (isPlacing: boolean) => void): void {
        this.onPlacingModeChangeCallback = callback;
    }

    enterPlacingMode(): void {
        if (!this.previewPin) return;
        this.isPlacingMode = true;
        document.body.classList.add('placing-mode');
        this.camera.detachControl();

        // Notify that we entered placing mode
        if (this.onPlacingModeChangeCallback) {
            this.onPlacingModeChangeCallback(true);
        }

        console.log('Entered placing mode');
    }

    exitPlacingMode(placePin: boolean = false): void {
        this.isPlacingMode = false;
        document.body.classList.remove('placing-mode');
        this.camera.attachControl(this.canvas, true);

        // Notify that we exited placing mode
        if (this.onPlacingModeChangeCallback) {
            this.onPlacingModeChangeCallback(false);
        }

        if (this.previewPin) {
            this.previewPin.setEnabled(false);
        }

        if (placePin && this.previewPin) {
            const pinPos = this.previewPin.position;
            const latLon = cartesianToLatLon(pinPos.x, pinPos.y, pinPos.z);
            const country = this.countryPicker.getCountryAt(latLon);

            if (country) {
                console.log(`Pin placed in ${country.name} (${country.iso2})`);
            } else {
                console.log(`Pin placed in ocean`);
            }

            if (this.onPinPlacedCallback) {
                this.onPinPlacedCallback(country, latLon);
            }
        } else {
            console.log('Pin placement cancelled');
        }

        this.hoveredCountry = null;
        console.log('Exited placing mode');
    }

    isPlacing(): boolean {
        return this.isPlacingMode;
    }

    getPreviewPin(): TransformNode | null {
        return this.previewPin;
    }

    private async loadBossPinModel(): Promise<void> {
        try {
            const result = await SceneLoader.ImportMeshAsync("", "/", "BossPin.glb", this.scene);
            if (result.meshes.length === 0) {
                console.error('No meshes found in BossPin model');
                return;
            }
            const rootMesh = result.meshes[0];
            rootMesh.setEnabled(false);
            this.bossPinTemplate = rootMesh;
            console.log('BossPin model loaded successfully');
        } catch (error) {
            console.error('Failed to load BossPin model:', error);
        }
    }

    private createPreviewPin(): void {
        if (!this.bossPinTemplate) return;

        // Create pivot transform node
        const pinPivot = new TransformNode("previewPinPivot", this.scene);

        // Create container for the pin meshes
        this.previewPinContainer = new TransformNode("previewPinContainer", this.scene);
        this.previewPinContainer.parent = pinPivot;

        // Scale the pin (adjust based on your model size)
        const pinScale = 150;
        this.previewPinContainer.scaling = new Vector3(pinScale, pinScale, pinScale);

        // Clone all child meshes from the template and apply unlit material
        const clonedMeshes: AbstractMesh[] = [];
        this.bossPinTemplate.getChildMeshes().forEach(mesh => {
            const cloned = mesh.clone("previewPinMesh", this.previewPinContainer);
            if (cloned) {
                cloned.setEnabled(true);

                // Apply unlit material to make it bright and visible
                const unlitMaterial = this.createUnlitMaterial(mesh.material);
                cloned.material = unlitMaterial;

                clonedMeshes.push(cloned);
            }
        });

        this.previewPin = pinPivot;
        this.previewPin.setEnabled(false);
        console.log('Preview pin created with', clonedMeshes.length, 'meshes');
    }

    private setupEventHandlers(): void {
        this.canvas.addEventListener('pointermove', (e) => {
            if (this.isPlacingMode && this.previewPin) {
                this.updatePreviewPinPosition(e);
            }
        });

        this.canvas.addEventListener('pointerup', (e) => {
            if (this.isPlacingMode && (e.button === 0 || e.button === 2)) {
                this.exitPlacingMode(true);
            }
        });

        this.canvas.addEventListener('pointerleave', (e) => {
            if (this.isPlacingMode) {
                this.exitPlacingMode(false);
            }
        });

        this.canvas.addEventListener('pointerdown', (e) => {
            if (e.button === 2 && !this.isPlacingMode) {
                const pickResult = this.scene.pick(e.clientX, e.clientY, (mesh) => mesh === this.earthSphere);
                if (pickResult.hit) {
                    this.enterPlacingMode();
                    this.updatePreviewPinPosition(e);
                }
            }
        });

        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    private updatePreviewPinPosition(event: PointerEvent): void {
        if (!this.previewPin) return;

        // Pick only against the earth sphere for performance
        const pickResult = this.scene.pick(event.clientX, event.clientY, (mesh) => mesh === this.earthSphere);

        if (pickResult.hit && pickResult.pickedPoint) {
            // Show the pin when we hit the globe
            if (!this.previewPin.isEnabled()) {
                this.previewPin.setEnabled(true);
            }

            // Scale pin based on camera distance
            if (this.previewPinContainer) {
                const baseScale = 150;
                const referenceRadius = 10;  // Reference distance for base scale
                const pinScale = baseScale * (this.camera.radius / referenceRadius);
                this.previewPinContainer.scaling.setAll(pinScale);
            }

            // Calculate surface normal
            const normal = pickResult.pickedPoint.normalize();

            // Position on globe surface at EARTH_RADIUS
            this.previewPin.position.copyFrom(normal).scaleInPlace(EARTH_RADIUS);

            // Orient the pivot so its local Y-axis points along the normal
            const upVector = Vector3.Up();
            const quaternion = new Quaternion();
            Quaternion.FromUnitVectorsToRef(upVector, normal, quaternion);
            this.previewPin.rotationQuaternion = quaternion;

            // Detect which country the pin is over
            const latLon = cartesianToLatLon(normal.x, normal.y, normal.z);
            const country = this.countryPicker.getCountryAt(latLon);

            // Update hovered country and trigger callback if changed
            if (country !== this.hoveredCountry) {
                this.hoveredCountry = country;
                if (this.onCountryHoverCallback) {
                    this.onCountryHoverCallback(country, latLon);
                }
            }
        } else {
            // Not over globe - hide pin
            if (this.previewPin.isEnabled()) {
                this.previewPin.setEnabled(false);
            }

            // Clear hovered country
            if (this.hoveredCountry) {
                this.hoveredCountry = null;
                if (this.onCountryHoverCallback) {
                    this.onCountryHoverCallback(null, { lat: 0, lon: 0 });
                }
            }
        }
    }
}
