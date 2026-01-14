/**
 * Terminal Manager
 *
 * Creates and manages the xterm.js terminal instance.
 * Provides a centralized access point for terminal operations.
 */

import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { SearchAddon } from '@xterm/addon-search';
import { TERMINAL_OPTIONS } from './config';
import { state } from '../state';

// Terminal instance - created once, used throughout the app
export const terminal = new Terminal(TERMINAL_OPTIONS);

// Addons - exported for advanced use cases
export const fitAddon = new FitAddon();
export const searchAddon = new SearchAddon();

// Internal addons (not typically needed externally)
const unicode11Addon = new Unicode11Addon();

// Load addons
terminal.loadAddon(fitAddon);
terminal.loadAddon(new WebLinksAddon());
terminal.loadAddon(unicode11Addon);
terminal.loadAddon(searchAddon);
terminal.unicode.activeVersion = '11';

/**
 * Fit terminal to container and refresh display
 */
export function fitTerminal(): void {
  fitAddon.fit();
}

/**
 * Refresh terminal display (clears rendering artifacts)
 */
export function refreshTerminal(): void {
  terminal.refresh(0, terminal.rows - 1);
}

/**
 * Resize PTY to match terminal dimensions
 * Only resizes if Claude is running
 */
export function resizePty(): void {
  if (state.claudeRunning) {
    window.claudeLens.pty.resize(terminal.cols, terminal.rows);
  }
}

/**
 * Full terminal refresh: fit, refresh display, resize PTY
 * Use after container resize or visibility changes
 */
export function fullRefresh(): void {
  fitTerminal();
  refreshTerminal();
  resizePty();
}

/**
 * Focus the terminal
 */
export function focusTerminal(): void {
  terminal.focus();
}

/**
 * Clear terminal content
 */
export function clearTerminal(): void {
  terminal.clear();
}

/**
 * Write to terminal
 */
export function writeToTerminal(data: string): void {
  terminal.write(data);
}

/**
 * Write line to terminal (with newline)
 */
export function writelnToTerminal(data: string): void {
  terminal.writeln(data);
}

/**
 * Get current terminal selection
 */
export function getSelection(): string {
  return terminal.getSelection();
}

/**
 * Check if terminal has selection
 */
export function hasSelection(): boolean {
  return terminal.hasSelection();
}
