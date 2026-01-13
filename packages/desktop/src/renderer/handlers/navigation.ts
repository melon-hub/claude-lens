/**
 * Navigation utilities
 */

/**
 * Normalize URL (add http:// if missing)
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';

  // Already has protocol
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Localhost without protocol
  if (trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1')) {
    return `http://${trimmed}`;
  }

  // Default to http
  return `http://${trimmed}`;
}

/**
 * Extract port from URL
 */
export function extractPort(url: string): number {
  try {
    const urlObj = new URL(normalizeUrl(url));
    return parseInt(urlObj.port, 10) || (urlObj.protocol === 'https:' ? 443 : 80);
  } catch {
    return 0;
  }
}

/**
 * Check if URL is localhost
 */
export function isLocalhostUrl(url: string): boolean {
  try {
    const urlObj = new URL(normalizeUrl(url));
    const hostname = urlObj.hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

/**
 * Viewport presets (matches UI dropdown in index.html)
 */
export const VIEWPORT_PRESETS: Record<string, number> = {
  full: 0,
  desktop: 1280,
  'tablet-landscape': 1024,
  tablet: 768,
  'mobile-large': 425,
  mobile: 375,
};

/**
 * Get viewport width from preset name
 */
export function getViewportWidth(preset: string): number {
  return VIEWPORT_PRESETS[preset] ?? 0;
}
