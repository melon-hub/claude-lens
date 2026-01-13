/**
 * Console Drawer
 *
 * Displays browser console messages in the expandable drawer.
 * Uses a circular buffer for O(1) message handling.
 */

import {
  consoleBuffer,
  addConsoleMessage as stateAddConsoleMessage,
  type ConsoleMessage,
} from '../state';
import { consoleDrawerCount, consoleDrawerMessages } from '../setup';

/**
 * Add a console message and update the UI
 */
export function addConsoleMessage(msg: ConsoleMessage): void {
  stateAddConsoleMessage(msg);
  updateConsoleUI();
}

/**
 * Update the console count badge and drawer content
 */
export function updateConsoleUI(): void {
  consoleDrawerCount.textContent = String(consoleBuffer.length);
  updateConsoleDrawer();
}

/**
 * Render all console messages in the drawer
 */
export function updateConsoleDrawer(): void {
  consoleDrawerMessages.textContent = '';

  if (consoleBuffer.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No console messages';
    consoleDrawerMessages.appendChild(emptyState);
    return;
  }

  for (const msg of consoleBuffer) {
    const row = document.createElement('div');
    row.className = 'console-drawer-message';

    const levelSpan = document.createElement('span');
    levelSpan.className = `console-drawer-level ${msg.level}`;
    levelSpan.textContent = msg.level.toUpperCase();

    const textSpan = document.createElement('span');
    textSpan.className = 'console-drawer-text';
    textSpan.textContent = msg.message;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'console-drawer-time';
    const time = new Date(msg.timestamp);
    timeSpan.textContent = time.toLocaleTimeString();

    row.appendChild(levelSpan);
    row.appendChild(textSpan);
    row.appendChild(timeSpan);
    consoleDrawerMessages.appendChild(row);
  }

  // Auto-scroll to bottom
  consoleDrawerMessages.scrollTop = consoleDrawerMessages.scrollHeight;
}
