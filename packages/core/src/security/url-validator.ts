/**
 * URL validation for security
 *
 * Only allows localhost URLs by default to prevent
 * accessing malicious external sites.
 */

const DEFAULT_ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/\[::1\](:\d+)?$/,
];

let customAllowedOrigins: RegExp[] = [];

/**
 * Check if URL is allowed
 */
export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const origin = parsed.origin;

    // Check default patterns
    if (DEFAULT_ALLOWED_ORIGINS.some((p) => p.test(origin))) {
      return true;
    }

    // Check custom patterns
    if (customAllowedOrigins.some((p) => p.test(origin))) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Add allowed origin pattern
 */
export function addAllowedOrigin(pattern: RegExp): void {
  customAllowedOrigins.push(pattern);
}

/**
 * Clear custom allowed origins
 */
export function clearCustomOrigins(): void {
  customAllowedOrigins = [];
}

/**
 * Get all allowed origin patterns
 */
export function getAllowedOrigins(): RegExp[] {
  return [...DEFAULT_ALLOWED_ORIGINS, ...customAllowedOrigins];
}

/**
 * Validate and normalize URL
 */
export function validateUrl(url: string): { valid: boolean; normalized?: string; error?: string } {
  try {
    const parsed = new URL(url);

    if (!isAllowedUrl(url)) {
      return {
        valid: false,
        error: `URL origin not allowed: ${parsed.origin}. Only localhost URLs are permitted.`,
      };
    }

    return {
      valid: true,
      normalized: parsed.href,
    };
  } catch (e) {
    return {
      valid: false,
      error: `Invalid URL: ${e instanceof Error ? e.message : 'Unknown error'}`,
    };
  }
}
