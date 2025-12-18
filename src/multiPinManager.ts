/**
 * Multi-Pin Manager Module
 * Handles displaying multiple pins simultaneously (for multiplayer)
 * Unlike PinManager, this doesn't handle placement - just display of existing pins
 */

import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Material } from '@babylonjs/core/Materials/material';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
import { hexToRgb } from '../shared/playerColors';

const EARTH_RADIUS = 2.0;

export interface PlayerPin {
    playerId: string;
    playerName: string;
    color: string;
    position: { lat: number; lon: number };
    mesh: TransformNode;
}

export class MultiPinManager {
    private scene: Scene;
    private camera: ArcRotateCamera;
    private createUnlitMaterial: (originalMaterial: Material | null) => Material;

    // Pin template and instances
    private bossPinTemplate: AbstractMesh | null = null;
    private pins: Map<string, PlayerPin> = new Map();

    constructor(
        scene: Scene,
        camera: ArcRotateCamera,
        createUnlitMaterial: (originalMaterial: Material | null) => Material
    ) {
        this.scene = scene;
        this.camera = camera;
        this.createUnlitMaterial = createUnlitMaterial;
    }

    async init(): Promise<void> {
        await this.loadBossPinModel();
    }

    /**
     * Load the BossPin model to use as template
     */
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
            console.log('MultiPinManager: BossPin model loaded');
        } catch (error) {
            console.error('Failed to load BossPin model:', error);
        }
    }

    /**
     * Add or update a pin for a player
     */
    addPin(playerId: string, playerName: string, color: string, lat: number, lon: number): void {
        // Remove existing pin if it exists
        if (this.pins.has(playerId)) {
            this.removePin(playerId);
        }

        if (!this.bossPinTemplate) {
            console.error('Cannot add pin: BossPin template not loaded');
            return;
        }

        // Create the pin mesh
        const pinMesh = this.createPinMesh(color);
        if (!pinMesh) return;

        // Position the pin
        this.positionPin(pinMesh, lat, lon);

        // Store pin data
        const playerPin: PlayerPin = {
            playerId,
            playerName,
            color,
            position: { lat, lon },
            mesh: pinMesh
        };

        this.pins.set(playerId, playerPin);

        console.log(`Added pin for ${playerName} at (${lat.toFixed(2)}, ${lon.toFixed(2)})`);
    }

    /**
     * Remove a pin
     */
    removePin(playerId: string): void {
        const pin = this.pins.get(playerId);
        if (!pin) return;

        pin.mesh.dispose();
        this.pins.delete(playerId);
        console.log(`Removed pin for ${pin.playerName}`);
    }

    /**
     * Update an existing pin's position
     */
    updatePin(playerId: string, lat: number, lon: number): void {
        const pin = this.pins.get(playerId);
        if (!pin) {
            console.warn(`Cannot update pin: player ${playerId} not found`);
            return;
        }

        pin.position = { lat, lon };
        this.positionPin(pin.mesh, lat, lon);
    }

    /**
     * Clear all pins
     */
    clearAllPins(): void {
        this.pins.forEach(pin => pin.mesh.dispose());
        this.pins.clear();
        console.log('Cleared all pins');
    }

    /**
     * Show or hide all pins
     */
    setVisible(visible: boolean): void {
        this.pins.forEach(pin => pin.mesh.setEnabled(visible));
    }

    /**
     * Get all current pins
     */
    getPins(): Map<string, PlayerPin> {
        return this.pins;
    }

    /**
     * Create a pin mesh with the specified color
     */
    private createPinMesh(color: string): TransformNode | null {
        if (!this.bossPinTemplate) return null;

        // Create pivot transform node
        const pinPivot = new TransformNode(`pin_${Date.now()}`, this.scene);

        // Create container for the pin meshes
        const pinContainer = new TransformNode(`pinContainer_${Date.now()}`, this.scene);
        pinContainer.parent = pinPivot;

        // Scale the pin
        const pinScale = 150;
        pinContainer.scaling = new Vector3(pinScale, pinScale, pinScale);

        // Clone all child meshes from the template
        this.bossPinTemplate.getChildMeshes().forEach(mesh => {
            const cloned = mesh.clone(`pinMesh_${Date.now()}`, pinContainer);
            if (cloned) {
                cloned.setEnabled(true);

                // Apply colored material
                const coloredMaterial = this.createColoredMaterial(color);
                cloned.material = coloredMaterial;
            }
        });

        return pinPivot;
    }

    /**
     * Create an unlit material with the specified color
     */
    private createColoredMaterial(hexColor: string): Material {
        const material = new StandardMaterial(`pinMaterial_${hexColor}`, this.scene);
        const rgb = hexToRgb(hexColor);

        material.diffuseColor = new Color3(rgb.r, rgb.g, rgb.b);
        material.emissiveColor = new Color3(rgb.r * 0.5, rgb.g * 0.5, rgb.b * 0.5);
        material.specularColor = new Color3(0, 0, 0);

        return material;
    }

    /**
     * Position a pin at the given lat/lon on the globe
     */
    private positionPin(pinMesh: TransformNode, lat: number, lon: number): void {
        // Convert lat/lon to cartesian coordinates
        const latRad = lat * (Math.PI / 180);
        const lonRad = lon * (Math.PI / 180);

        const x = EARTH_RADIUS * Math.cos(latRad) * Math.cos(lonRad);
        const y = EARTH_RADIUS * Math.sin(latRad);
        const z = EARTH_RADIUS * Math.cos(latRad) * Math.sin(lonRad);

        const position = new Vector3(x, y, z);
        const normal = position.normalize();

        // Position on globe surface
        pinMesh.position.copyFrom(normal).scaleInPlace(EARTH_RADIUS);

        // Orient the pin to point outward from the globe
        const upVector = Vector3.Up();
        const quaternion = new Quaternion();
        Quaternion.FromUnitVectorsToRef(upVector, normal, quaternion);
        pinMesh.rotationQuaternion = quaternion;

        // Scale based on camera distance
        const baseScale = 150;
        const referenceRadius = 10;
        const pinScale = baseScale * (this.camera.radius / referenceRadius);

        // Apply scale to the container (first child)
        const container = pinMesh.getChildren()[0] as TransformNode;
        if (container) {
            container.scaling.setAll(pinScale);
        }
    }

    /**
     * Update all pin scales based on current camera distance
     * Call this in the render loop if you want pins to scale dynamically
     */
    updatePinScales(): void {
        const baseScale = 150;
        const referenceRadius = 10;
        const pinScale = baseScale * (this.camera.radius / referenceRadius);

        this.pins.forEach(pin => {
            const container = pin.mesh.getChildren()[0] as TransformNode;
            if (container) {
                container.scaling.setAll(pinScale);
            }
        });
    }
}
