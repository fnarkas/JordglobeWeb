/**
 * Environment Configuration
 * Auto-detects dev vs production and provides correct URLs
 */

export interface EnvironmentConfig {
    isDevelopment: boolean;
    isProduction: boolean;
    websocketUrl: string;
    baseUrl: string;
}

/**
 * Detects the current environment based on the protocol and hostname
 */
function detectEnvironment(): EnvironmentConfig {
    const protocol = window.location.protocol; // 'http:' or 'https:'
    const hostname = window.location.hostname;
    const port = window.location.port;

    // Production: HTTPS on Cloud Run (hostname ends with .run.app or custom domain with HTTPS)
    const isProduction = protocol === 'https:';
    const isDevelopment = !isProduction;

    let websocketUrl: string;
    let baseUrl: string;

    if (isDevelopment) {
        // Development: separate WebSocket server on port 3003
        websocketUrl = `ws://${hostname}:3003`;
        baseUrl = `http://${hostname}:${port || 3000}`;
    } else {
        // Production: same server, WebSocket on same port (8080), use wss://
        websocketUrl = `wss://${hostname}`;
        baseUrl = `https://${hostname}`;
    }

    return {
        isDevelopment,
        isProduction,
        websocketUrl,
        baseUrl
    };
}

// Export singleton config
export const config = detectEnvironment();

// For debugging
if (config.isDevelopment) {
    console.log('[Config] Running in DEVELOPMENT mode');
    console.log('[Config] WebSocket URL:', config.websocketUrl);
    console.log('[Config] Base URL:', config.baseUrl);
} else {
    console.log('[Config] Running in PRODUCTION mode');
    console.log('[Config] WebSocket URL:', config.websocketUrl);
    console.log('[Config] Base URL:', config.baseUrl);
}
