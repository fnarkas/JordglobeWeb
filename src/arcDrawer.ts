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
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';

const EARTH_RADIUS = 2.0;
const ARC_SEGMENTS = 64; // Number of points per arc (more = smoother)
const DEFAULT_ARC_ALTITUDE = 0.3; // How high the arc peaks above globe surface

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
    mesh: LinesMesh | null;
}

export class ArcDrawer {
    private scene: Scene;
    private arcs: Map<string, Arc> = new Map();
    private arcIdCounter: number = 0;

    constructor(scene: Scene) {
        this.scene = scene;
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
            mesh: null
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

            // Calculate altitude using parabolic curve (peaks at t=0.5)
            // altitude = maxAltitude * 4 * t * (1 - t)
            // This gives 0 at t=0, maxAltitude at t=0.5, 0 at t=1
            const altitude = maxAltitude * 4 * t * (1 - t);

            // Scale to globe radius plus altitude
            const radius = EARTH_RADIUS + altitude;
            point.scaleInPlace(radius);

            points.push(point);
        }

        return points;
    }

    /**
     * Update the mesh for an arc based on its current progress
     */
    private updateArcMesh(arc: Arc): void {
        // Dispose old mesh
        if (arc.mesh) {
            arc.mesh.dispose();
            arc.mesh = null;
        }

        // Don't render if no progress
        if (arc.progress <= 0) return;

        // Calculate how many points to show based on progress
        const numPointsToShow = Math.max(2, Math.ceil(arc.points.length * arc.progress));
        const visiblePoints = arc.points.slice(0, numPointsToShow);

        // Parse color
        const rgb = this.hexToRgb(arc.color);
        const color = new Color3(rgb.r, rgb.g, rgb.b);

        // Create line mesh
        arc.mesh = MeshBuilder.CreateLines(
            arc.id,
            {
                points: visiblePoints,
                updatable: true
            },
            this.scene
        );

        // Set arc color
        arc.mesh.color = color;

        // Make it render on top of the globe
        arc.mesh.renderingGroupId = 1;
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
