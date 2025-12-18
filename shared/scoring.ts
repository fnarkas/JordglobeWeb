/**
 * Scoring System
 * Distance-based scoring formula for geography game
 */

/**
 * Calculate points based on distance from correct answer
 *
 * Formula: max(0, 1000 - distance/10)
 * - Perfect answer (0km): 1000 points
 * - 100km away: 990 points
 * - 5000km away: 500 points
 * - 10000km+ away: 0 points
 *
 * @param distanceKm Distance from correct answer in kilometers
 * @returns Points earned (0-1000)
 */
export function calculatePoints(distanceKm: number): number {
    const points = Math.max(0, 1000 - distanceKm / 10);
    return Math.round(points);
}

/**
 * Get color for distance label based on how close the answer is
 * Green (very close) → Yellow (medium) → Red (far)
 *
 * @param distanceKm Distance in kilometers
 * @returns Hex color string
 */
export function getDistanceColor(distanceKm: number): string {
    if (distanceKm < 100) {
        return '#00FF00'; // Green - excellent
    } else if (distanceKm < 500) {
        return '#88FF00'; // Yellow-green - good
    } else if (distanceKm < 1000) {
        return '#FFFF00'; // Yellow - okay
    } else if (distanceKm < 2000) {
        return '#FFAA00'; // Orange - not great
    } else if (distanceKm < 5000) {
        return '#FF5500'; // Orange-red - poor
    } else {
        return '#FF0000'; // Red - very far
    }
}

/**
 * Format distance for display
 *
 * @param distanceKm Distance in kilometers
 * @returns Formatted string (e.g., "1,234 km")
 */
export function formatDistance(distanceKm: number): string {
    const rounded = Math.round(distanceKm);
    return `${rounded.toLocaleString()} km`;
}
