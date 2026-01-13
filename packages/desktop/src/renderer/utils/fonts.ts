/**
 * Font loading utilities for xterm.js terminal
 *
 * xterm.js measures fonts during terminal.open() and caches the measurements.
 * If the font isn't loaded yet, it measures fallback fonts and icons won't render.
 * Based on Tabby terminal's approach: https://github.com/Eugeny/tabby
 */

/**
 * Wait for fonts to load before opening terminal
 * @param fontFamily - CSS font-family string
 * @param timeoutMs - Maximum time to wait for fonts (default: 3000ms)
 */
export async function waitForFonts(fontFamily: string, timeoutMs = 3000): Promise<void> {
  const startTime = Date.now();

  // Extract all font names from the stack
  const fontNames = fontFamily
    .split(',')
    .map((f) => f.trim().replace(/['"]/g, ''))
    .filter((f) => f && f !== 'monospace');

  // Request all fonts to load (silently)
  for (const font of fontNames) {
    try {
      await document.fonts.load(`13px "${font}"`);
    } catch {
      // Font load failed, will use fallback
    }
  }

  // Wait for all fonts to be ready
  await document.fonts.ready;

  // Check each font, only warn if missing
  const missingFonts: string[] = [];
  for (const font of fontNames) {
    let fontAvailable = document.fonts.check(`13px "${font}"`);

    // Poll if not yet available
    while (!fontAvailable && Date.now() - startTime < timeoutMs) {
      await new Promise((r) => setTimeout(r, 100));
      fontAvailable = document.fonts.check(`13px "${font}"`);
    }

    if (!fontAvailable) {
      missingFonts.push(font);
    }
  }

  if (missingFonts.length > 0) {
    console.warn(`Fonts not available: ${missingFonts.join(', ')}`);
  }

  // Additional delay for font rendering to settle
  await new Promise((r) => setTimeout(r, 500));
}

/**
 * Critical fonts required for proper terminal rendering
 */
const CRITICAL_FONTS = [
  'JetBrains Mono NF Bundled',
  'Symbols Nerd Font',
  'Noto Sans Symbols 2',
];

/**
 * Font diagnostics - only logs warnings if something is wrong
 */
export function runFontDiagnostics(): void {
  // Check font availability - only warn if missing
  const missingFonts = CRITICAL_FONTS.filter(
    (font) => !document.fonts.check(`13px "${font}"`)
  );

  if (missingFonts.length > 0) {
    console.warn('Missing fonts:', missingFonts.join(', '));
  }
}
