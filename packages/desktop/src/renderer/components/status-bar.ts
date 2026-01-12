/**
 * Status bar component utilities
 */

/**
 * Format viewport display string
 */
export function formatViewportDisplay(width: number): string {
  if (width === 0) return 'Full';
  if (width <= 640) return `Mobile (${width}px)`;
  if (width <= 1024) return `Tablet (${width}px)`;
  return `Desktop (${width}px)`;
}

/**
 * Get viewport preset name
 */
export function getViewportPresetName(width: number): string {
  switch (width) {
    case 0:
      return 'Full Width';
    case 375:
      return 'iPhone SE';
    case 390:
      return 'iPhone 14';
    case 768:
      return 'iPad';
    case 1024:
      return 'iPad Pro';
    case 1280:
      return 'Desktop';
    case 1920:
      return 'Full HD';
    default:
      return `Custom (${width}px)`;
  }
}

/**
 * Format server status display
 */
export function formatServerStatus(
  port: number,
  type: 'dev' | 'static' | null
): string {
  if (!type || port === 0) return 'Not running';
  return type === 'dev' ? `Dev :${port}` : `Static :${port}`;
}

/**
 * Format Playwright connection status
 */
export function formatPlaywrightStatus(connected: boolean): string {
  return connected ? 'Connected' : 'Disconnected';
}
