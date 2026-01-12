/**
 * Terminal configuration and constants
 */

import type { ITerminalOptions, ITheme } from 'xterm';

/**
 * Terminal theme - dark mode with VS Code-like colors
 */
export const TERMINAL_THEME: ITheme = {
  background: '#1e1e1e',
  foreground: '#cccccc',
  cursor: '#cccccc',
  selectionBackground: '#264f78',
};

/**
 * Terminal font stack
 * Order matters - each font serves a specific purpose:
 * 1. JetBrains Mono NF - main text + some icons
 * 2. Symbols Nerd Font - Nerd Font icons
 * 3. Noto Sans Symbols 2 - Unicode symbols (U+23F5 play buttons for Claude Code checkboxes)
 * 4. System symbol fonts - standard Unicode symbols
 * 5. monospace - final fallback
 */
export const TERMINAL_FONT_FAMILY =
  "'JetBrains Mono NF Bundled', 'Symbols Nerd Font', 'Noto Sans Symbols 2', 'Segoe UI Symbol', 'Apple Symbols', monospace";

/**
 * Default terminal options
 */
export const TERMINAL_OPTIONS: ITerminalOptions = {
  theme: TERMINAL_THEME,
  fontFamily: TERMINAL_FONT_FAMILY,
  fontSize: 13,
  cursorBlink: true,
  allowProposedApi: true,
  scrollback: 5000, // Limit scrollback to control memory usage
};
