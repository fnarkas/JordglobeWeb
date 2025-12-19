/**
 * Arc Drawer Module
 * Draws animated geodesic arcs from player answers to correct location
 * Uses great circle paths with altitude curves that peak at midpoint
 */

import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { EarthGlobe } from './earthGlobe';

const EARTH_RADIUS = 2.0;
const ARC_SEGMENTS = 64; // Number of points per arc (more = smoother)
const DEFAULT_ARC_ALTITUDE = 0.3; // How high the arc peaks above globe surface
const ARC_THICKNESS = 0.008; // Radius of the tube (thickness)

interface Arc {
    id: string;
    startLat: number;
    startLon: number;
    endLat: number;
    endLon: number;
    altitude: number;
    color: string;
    progress: number; // 0 to 1
    points: Vector3[]; // Pre-calculated full arc points
    mesh: Mesh | null;
    material: StandardMaterial | null; // Cached material
    originalPositions: Float32Array | null; // Cached original vertex positions
}

export class ArcDrawer {
    private scene: Scene;
    private globe: EarthGlobe;
    private arcs: Map<string, Arc> = new Map();
    private arcIdCounter: number = 0;

    constructor(scene: Scene, globe: EarthGlobe) {
        this.scene = scene;
        this.globe = globe;
    }

    /**
     * Add an arc from start to end location
     * @returns Arc ID for future reference
     */
    addArc(
        startLat: number,
        startLon: number,
        endLat: number,
        endLon: number,
        color: string,
        altitude: number = DEFAULT_ARC_ALTITUDE
    ): string {
        const id = `arc_${this.arcIdCounter++}`;

        // Pre-calculate all points along the geodesic path
        const points = this.calculateGeodesicPoints(
            startLat, startLon,
            endLat, endLon,
            altitude,
            ARC_SEGMENTS
        );

        const arc: Arc = {
            id,
            startLat,
            startLon,
            endLat,
            endLon,
            altitude,
            color,
            progress: 0,
            points,
            mesh: null,
            material: null,
            originalPositions: null
        };

        this.arcs.set(id, arc);

        // Create initial mesh (invisible - 0 progress)
        this.updateArcMesh(arc);

        return id;
    }

    /**
     * Set the progress of a specific arc (0 to 1)
     */
    setArcProgress(arcId: string, progress: number): void {
        const arc = this.arcs.get(arcId);
        if (!arc) return;

        arc.progress = Math.max(0, Math.min(1, progress));
        this.updateArcMesh(arc);
    }

    /**
     * Animate all arcs from 0% to 100%
     * @param duration Animation duration in milliseconds
     * @returns Promise that resolves when animation is complete
     */
    async animateArcs(duration: number): Promise<void> {
        return new Promise((resolve) => {
            const startTime = performance.now();

            const animate = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(1, elapsed / duration);

                // Update all arcs
                this.arcs.forEach(arc => {
                    arc.progress = progress;
                    this.updateArcMesh(arc);
                });

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            };

            requestAnimationFrame(animate);
        });
    }

    /**
     * Animate a single arc from 0% to 100%
     */
    async animateArc(arcId: string, duration: number): Promise<void> {
        const arc = this.arcs.get(arcId);
        if (!arc) return;

        return new Promise((resolve) => {
            const startTime = performance.now();

            const animate = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(1, elapsed / duration);

                arc.progress = progress;
                this.updateArcMesh(arc);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            };

            requestAnimationFrame(animate);
        });
    }

    /**
     * Remove a specific arc
     */
    removeArc(arcId: string): void {
        const arc = this.arcs.get(arcId);
        if (!arc) return;

        if (arc.mesh) {
            arc.mesh.dispose();
        }
        if (arc.material) {
            arc.material.dispose();
        }
        this.arcs.delete(arcId);
    }

    /**
     * Clear all arcs
     */
    clearArcs(): void {
        this.arcs.forEach(arc => {
            if (arc.mesh) {
                arc.mesh.dispose();
            }
            if (arc.material) {
                arc.material.dispose();
            }
        });
        this.arcs.clear();
    }

    /**
     * Get all arc IDs
     */
    getArcIds(): string[] {
        return Array.from(this.arcs.keys());
    }

    /**
     * Calculate points along a geodesic (great circle) path
     * with altitude that peaks at the midpoint
     */
    private calculateGeodesicPoints(
        startLat: number,
        startLon: number,
        endLat: number,
        endLon: number,
        maxAltitude: number,
        numPoints: number
    ): Vector3[] {
        const points: Vector3[] = [];

        // Get surface altitude at start and end points (land vs ocean)
        const startSurfaceAltitude = this.globe.getAltitudeAtLatLon(startLat, startLon);
        const endSurfaceAltitude = this.globe.getAltitudeAtLatLon(endLat, endLon);

        // Convert to radians
        const lat1 = startLat * (Math.PI / 180);
        const lon1 = startLon * (Math.PI / 180);
        const lat2 = endLat * (Math.PI / 180);
        const lon2 = endLon * (Math.PI / 180);

        // Convert to Cartesian unit vectors
        const start = new Vector3(
            Math.cos(lat1) * Math.cos(lon1),
            Math.sin(lat1),
            Math.cos(lat1) * Math.sin(lon1)
        );

        const end = new Vector3(
            Math.cos(lat2) * Math.cos(lon2),
            Math.sin(lat2),
            Math.cos(lat2) * Math.sin(lon2)
        );

        // Calculate the angle between start and end (for slerp)
        const dot = Vector3.Dot(start, end);
        const angle = Math.acos(Math.min(1, Math.max(-1, dot)));

        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;

            // Spherical linear interpolation (slerp)
            let point: Vector3;
            if (angle < 0.0001) {
                // Points are very close, just use linear interpolation
                point = Vector3.Lerp(start, end, t);
            } else {
                const sinAngle = Math.sin(angle);
                const a = Math.sin((1 - t) * angle) / sinAngle;
                const b = Math.sin(t * angle) / sinAngle;
                point = start.scale(a).add(end.scale(b));
            }

            // Normalize to unit sphere
            point.normalize();

            // Interpolate base altitude between start and end surface
            const baseAltitude = startSurfaceAltitude * (1 - t) + endSurfaceAltitude * t;

            // Calculate arc altitude using parabolic curve (peaks at t=0.5)
            // altitude = maxAltitude * 4 * t * (1 - t)
            // This gives 0 at t=0, maxAltitude at t=0.5, 0 at t=1
            const arcAltitude = maxAltitude * 4 * t * (1 - t);

            // Total altitude = base surface + arc above it
            const totalAltitude = baseAltitude + arcAltitude;

            // Scale to globe radius plus altitude
            const radius = EARTH_RADIUS + totalAltitude;
            point.scaleInPlace(radius);

            points.push(point);
        }

        return points;
    }

    /**
     * Update the mesh for an arc based on its current progress
     *
     * PERFORMANCE: Create full mesh once, then update vertex positions
     * to show only the visible portion based on progress
     */
    private updateArcMesh(arc: Arc): void {
        // Create mesh once if it doesn't exist
        if (!arc.mesh) {
            // Parse color
            const rgb = this.hexToRgb(arc.color);
            const color = new Color3(rgb.r, rgb.g, rgb.b);

            // Create full-length tube mesh (updatable for vertex manipulation)
            arc.mesh = MeshBuilder.CreateTube(
                arc.id,
                {
                    path: arc.points,
                    radius: ARC_THICKNESS,
                    tessellation: 8,
                    updatable: true
                },
                this.scene
            );

            // Cache original vertex positions for restoration during animation
            const originalPositions = arc.mesh.getVerticesData('position');
            if (originalPositions) {
                arc.originalPositions = new Float32Array(originalPositions);
            }

            // Create and cache material
            arc.material = new StandardMaterial(`${arc.id}_mat`, this.scene);
            arc.material.emissiveColor = color;
            arc.material.disableLighting = true;
            arc.mesh.material = arc.material;

            // Enable depth testing so arcs properly hide behind globe
            // (renderingGroupId defaults to 0, same as globe)
        }

        // Update visibility based on progress
        if (arc.progress <= 0) {
            arc.mesh.setEnabled(false);
            return;
        }

        arc.mesh.setEnabled(true);

        // Calculate cutoff point based on progress
        const numPointsToShow = Math.max(2, Math.ceil(arc.points.length * arc.progress));

        // Update vertex positions to "hide" vertices beyond the progress point
        // by collapsing them to the last visible point
        const positions = arc.mesh.getVerticesData('position');
        if (positions && arc.originalPositions) {
            const tessellation = 8;
            const verticesPerPoint = tessellation + 1; // Ring of vertices

            // Get the last visible point in world space
            const lastVisiblePoint = arc.points[Math.min(numPointsToShow - 1, arc.points.length - 1)];

            // For each point along the path
            for (let i = 0; i < arc.points.length; i++) {
                if (i < numPointsToShow) {
                    // Visible - restore original positions from cache
                    for (let j = 0; j < verticesPerPoint; j++) {
                        const idx = (i * verticesPerPoint + j) * 3;
                        positions[idx] = arc.originalPositions[idx];
                        positions[idx + 1] = arc.originalPositions[idx + 1];
                        positions[idx + 2] = arc.originalPositions[idx + 2];
                    }
                } else {
                    // Hidden - collapse to last visible point
                    for (let j = 0; j < verticesPerPoint; j++) {
                        const idx = (i * verticesPerPoint + j) * 3;
                        positions[idx] = lastVisiblePoint.x;
                        positions[idx + 1] = lastVisiblePoint.y;
                        positions[idx + 2] = lastVisiblePoint.z;
                    }
                }
            }

            arc.mesh.updateVerticesData('position', positions);
        }
    }

    /**
     * Convert hex color to RGB (0-1 range)
     */
    private hexToRgb(hex: string): { r: number; g: number; b: number } {
        // Remove # if present
        hex = hex.replace(/^#/, '');

        // Parse hex values
        const bigint = parseInt(hex, 16);
        const r = ((bigint >> 16) & 255) / 255;
        const g = ((bigint >> 8) & 255) / 255;
        const b = (bigint & 255) / 255;

        return { r, g, b };
    }
}
