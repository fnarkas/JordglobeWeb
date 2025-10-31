// Babylon.js Earth Globe Application

const EARTH_RADIUS = 2.0;
const MAX_COUNTRIES = 5000;

class EarthGlobe {
    constructor() {
        this.canvas = document.getElementById('renderCanvas');
        this.engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
        this.scene = null;
        this.camera = null;
        this.earthSphere = null;
        this.earthTexture = null;
        this.countryMeshes = [];
        this.borderLines = [];
        this.extrudedBorders = [];
        this.showCountries = false;
        this.frameCount = 0;

        this.init();
    }

    init() {
        // Create scene
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color3(0.95, 0.95, 0.95);

        // Create camera
        this.camera = new BABYLON.ArcRotateCamera(
            "camera",
            Math.PI / 2,
            Math.PI / 2,
            10,
            BABYLON.Vector3.Zero(),
            this.scene
        );
        this.camera.attachControl(this.canvas, true);
        this.camera.lowerRadiusLimit = 3;
        this.camera.upperRadiusLimit = 20;
        this.camera.wheelPrecision = 50;
        this.camera.minZ = 0.01; // Adjust near clipping plane

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

        // Load countries
        this.loadCountries();
    }

    createEarthSphere() {
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

    latLonToSphere(lat, lon, altitude = 0) {
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

    triangulatePolygon(points) {
        // Use earcut library for triangulation
        // Flatten the 2D coordinates for earcut
        const flatCoords = [];
        for (const point of points) {
            flatCoords.push(point.x, point.y);
        }

        // Triangulate using earcut
        const indices = earcut(flatCoords);

        return indices;
    }

    createCountryMesh(latLonPoints, altitude = 0.08) {
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
            const reversedIndices = [];
            for (let i = 0; i < indices.length; i += 3) {
                reversedIndices.push(indices[i + 2], indices[i + 1], indices[i]);
            }

            // Convert lat/lon points to 3D sphere coordinates
            const positions = [];
            const normals = [];

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
            const hue = (this.countryMeshes.length % 360) / 360;
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

    hsvToRgb(h, s, v) {
        let r, g, b;

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
        }

        return { r, g, b };
    }

    createCountryBorderLines(latLonPoints, altitude = 0.09) {
        try {
            // Convert lat/lon points to 3D sphere coordinates
            const points3D = [];

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
                    radius: 0.002,  // Tube thickness
                    tessellation: 8,
                    cap: BABYLON.Mesh.CAP_ALL
                },
                this.scene
            );

            // Create unlit white material for the border (not affected by light)
            const material = new BABYLON.StandardMaterial("borderMat", this.scene);
            material.emissiveColor = new BABYLON.Color3(1, 1, 1); // Full brightness white
            material.disableLighting = true; // Unlit shader
            tube.material = material;

            return tube;
        } catch (error) {
            console.error("Error creating border lines:", error);
            return null;
        }
    }

    createExtrudedBorder(latLonPoints, altitude = 0.08) {
        try {
            // Convert lat/lon points to 3D sphere coordinates (top edge of border)
            const topPoints = [];
            for (const point of latLonPoints) {
                const vertex = this.latLonToSphere(point.lat, point.lon, altitude);
                topPoints.push(vertex);
            }

            if (topPoints.length < 2) {
                return null;
            }

            // Calculate extrude ratio - scale points toward sphere center
            // Bottom edge is closer to sphere center
            const extrudeDepth = 0.05; // Depth of the border wall
            const bottomRadius = EARTH_RADIUS + altitude - extrudeDepth;
            const topRadius = EARTH_RADIUS + altitude;
            const extrudeRatio = bottomRadius / topRadius;

            // Create bottom points by scaling top points toward center
            const bottomPoints = [];
            for (const topPoint of topPoints) {
                const bottomPoint = topPoint.scale(extrudeRatio);
                bottomPoints.push(bottomPoint);
            }

            // Build extruded border mesh (quad strip)
            const positions = [];
            const indices = [];
            const normals = [];
            const uvs = [];

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
                uvs.push(startU, 0); // Bottom left
                uvs.push(startU, 1); // Top left
                uvs.push(endU, 0);   // Bottom right
                uvs.push(endU, 1);   // Top right

                // Add triangles (2 per quad) - winding order for outward facing
                // Triangle 1: bottom-left, top-left, bottom-right
                indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
                // Triangle 2: top-left, top-right, bottom-right
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
            material.emissiveColor = new BABYLON.Color3(0.9, 0.9, 0.9); // Light gray, unlit
            material.disableLighting = true; // Unlit shader
            borderMesh.material = material;

            return borderMesh;
        } catch (error) {
            console.error("Error creating extruded border:", error);
            return null;
        }
    }

    addCountry(coordinates) {
        if (this.countryMeshes.length >= MAX_COUNTRIES) {
            console.error("Max countries reached");
            return;
        }

        // Convert flat array to lat/lon points
        const latLonPoints = [];
        for (let i = 0; i < coordinates.length; i += 2) {
            latLonPoints.push({
                lat: coordinates[i],
                lon: coordinates[i + 1]
            });
        }

        const mesh = this.createCountryMesh(latLonPoints, 0.08);

        if (mesh) {
            this.countryMeshes.push(mesh);
            this.showCountries = true;

            // Create border lines (tubes) for this country
            const borderLines = this.createCountryBorderLines(latLonPoints, 0.09);
            if (borderLines) {
                this.borderLines.push(borderLines);
            }

            // Create extruded border walls for this country
            const extrudedBorder = this.createExtrudedBorder(latLonPoints, 0.08);
            if (extrudedBorder) {
                this.extrudedBorders.push(extrudedBorder);
            }

            console.log("Country added successfully. Total:", this.countryMeshes.length);
        }
    }

    async loadCountries() {
        try {
            const response = await fetch('countries.json');
            const countries = await response.json();

            console.log('Loaded', countries.length, 'countries');

            let addedCount = 0;

            for (const country of countries) {
                if (!country.paths || country.paths === '[]') continue;

                try {
                    const paths = JSON.parse(country.paths);
                    let polygonCount = 0;

                    // Process all polygons (including islands)
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
                        const flatCoords = [];
                        for (const point of polygon) {
                            flatCoords.push(point[0]); // lat
                            flatCoords.push(point[1]); // lon
                        }

                        if (flatCoords.length < 6) continue; // Need at least 3 points

                        this.addCountry(flatCoords);
                        polygonCount++;
                    }

                    if (polygonCount > 0) {
                        console.log('Added country:', country.name_en, 'with', polygonCount, 'polygon(s)');
                        addedCount++;
                    }
                } catch (e) {
                    console.error('Failed to add country', country.name_en, ':', e);
                }
            }

            console.log('Added', addedCount, 'countries');
            document.getElementById('status').style.display = 'block';
        } catch (error) {
            console.error('Failed to load countries.json:', error);
        }
    }

    update() {
        this.frameCount++;

        // Update FPS counter
        const fps = Math.round(this.engine.getFps());
        document.getElementById('fps').textContent = `FPS: ${fps}`;
    }
}

// Initialize the application when page loads
window.addEventListener('DOMContentLoaded', () => {
    const app = new EarthGlobe();
});
