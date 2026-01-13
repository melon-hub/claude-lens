/**
 * Terminal module
 *
 * Exports terminal instance, configuration, and utilities.
 */

// Configuration
export { TERMINAL_OPTIONS, TERMINAL_THEME, TERMINAL_FONT_FAMILY } from './config';

// Character substitution for MCP output
export { substituteChars } from './substitution';

// Terminal manager - instance and helpers
export {
  terminal,
  fitAddon,
  searchAddon,
  fitTerminal,
  refreshTerminal,
  resizePty,
  fullRefresh,
  focusTerminal,
  clearTerminal,
  writeToTerminal,
  writelnToTerminal,
  getSelection,
  hasSelection,
} from './manager';
