/**
 * Geographic Utilities
 * Distance calculations using Haversine formula
 */

const EARTH_RADIUS_KM = 6371; // Earth's radius in kilometers

/**
 * Calculate great circle distance between two points on Earth
 * Uses Haversine formula
 *
 * @param lat1 Latitude of first point in degrees
 * @param lon1 Longitude of first point in degrees
 * @param lat2 Latitude of second point in degrees
 * @param lon2 Longitude of second point in degrees
 * @returns Distance in kilometers
 */
export function calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    // Convert degrees to radians
    const toRad = (degrees: number) => degrees * (Math.PI / 180);

    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);

    // Haversine formula
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = EARTH_RADIUS_KM * c;

    return distance;
}

/**
 * Calculate points along a geodesic (great circle) path
 * Used for drawing arcs between locations
 *
 * @param lat1 Start latitude in degrees
 * @param lon1 Start longitude in degrees
 * @param lat2 End latitude in degrees
 * @param lon2 End longitude in degrees
 * @param numPoints Number of points to generate along the path
 * @returns Array of lat/lon points
 */
export function calculateGeodesicPoints(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
    numPoints: number
): { lat: number; lon: number }[] {
    const toRad = (degrees: number) => degrees * (Math.PI / 180);
    const toDeg = (radians: number) => radians * (180 / Math.PI);

    const φ1 = toRad(lat1);
    const λ1 = toRad(lon1);
    const φ2 = toRad(lat2);
    const λ2 = toRad(lon2);

    const points: { lat: number; lon: number }[] = [];

    // Calculate angular distance
    const Δφ = φ2 - φ1;
    const Δλ = λ2 - λ1;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const δ = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Generate points using spherical linear interpolation (slerp)
    for (let i = 0; i < numPoints; i++) {
        const fraction = i / (numPoints - 1);

        const A = Math.sin((1 - fraction) * δ) / Math.sin(δ);
        const B = Math.sin(fraction * δ) / Math.sin(δ);

        const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
        const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
        const z = A * Math.sin(φ1) + B * Math.sin(φ2);

        const φi = Math.atan2(z, Math.sqrt(x * x + y * y));
        const λi = Math.atan2(y, x);

        points.push({
            lat: toDeg(φi),
            lon: toDeg(λi)
        });
    }

    return points;
}
