/**
 * Player Color Palette
 * Consistent, distinguishable colors for up to 8 players
 */

/**
 * Standard color palette - vibrant and distinct
 */
export const PLAYER_COLORS = [
    '#FF4444', // Red
    '#44FF44', // Green
    '#4444FF', // Blue
    '#FFFF44', // Yellow
    '#FF44FF', // Magenta
    '#44FFFF', // Cyan
    '#FF8844', // Orange
    '#8844FF', // Purple
] as const;

/**
 * Color-blind friendly alternative palette
 * Based on Paul Tol's palette for accessibility
 */
export const PLAYER_COLORS_ACCESSIBLE = [
    '#E69F00', // Orange
    '#56B4E9', // Sky Blue
    '#009E73', // Bluish Green
    '#F0E442', // Yellow
    '#0072B2', // Blue
    '#D55E00', // Vermillion
    '#CC79A7', // Reddish Purple
    '#999999', // Gray
] as const;

/**
 * Get color for a player by their index
 *
 * @param playerIndex Zero-based player index (0-7)
 * @param accessible Use color-blind friendly palette
 * @returns Hex color string
 */
export function getPlayerColor(playerIndex: number, accessible: boolean = false): string {
    const palette = accessible ? PLAYER_COLORS_ACCESSIBLE : PLAYER_COLORS;
    return palette[playerIndex % palette.length];
}

/**
 * Convert hex color to RGB values
 *
 * @param hex Hex color string (e.g., "#FF4444")
 * @returns RGB object { r, g, b } with values 0-1
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
        return { r: 1, g: 1, b: 1 }; // Default to white
    }
    return {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
    };
}
