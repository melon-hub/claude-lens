/**
 * UI Helper Functions
 *
 * Pure functions for common UI operations.
 * Extracted from main.ts to enable reuse and testing.
 */

import { state, updateState } from './state';
import {
  statusEl,
  thinkingIndicator,
  projectStatus,
  serverStatus,
  playwrightStatus,
  viewportStatus,
} from './setup';

/**
 * Update the connection status display
 */
export function setStatus(text: string, connected = false): void {
  statusEl.textContent = text;
  statusEl.className = connected ? 'status connected' : 'status';
}

/**
 * Show thinking indicator with delay
 * Prevents flashing for instant responses
 */
export function showThinking(): void {
  if (state.thinkingTimeout) clearTimeout(state.thinkingTimeout);
  const timeout = setTimeout(() => {
    updateState({ isThinking: true });
    thinkingIndicator.classList.remove('hidden');
  }, 500);
  updateState({ thinkingTimeout: timeout });
}

/**
 * Hide thinking indicator
 */
export function hideThinking(): void {
  if (state.thinkingTimeout) {
    clearTimeout(state.thinkingTimeout);
  }
  updateState({ thinkingTimeout: null, isThinking: false });
  thinkingIndicator.classList.add('hidden');
}

/**
 * Update the status bar with current state
 */
export function updateStatusBar(): void {
  // Project name
  if (state.currentProjectName) {
    projectStatus.textContent = state.currentProjectName;
    projectStatus.classList.remove('hidden');
  } else {
    projectStatus.classList.add('hidden');
  }

  // Server status
  if (state.currentServerPort > 0) {
    const typeLabel = state.currentServerType === 'dev' ? 'Dev' : 'Static';
    serverStatus.textContent = `${typeLabel} :${state.currentServerPort}`;
    serverStatus.classList.remove('hidden');
  } else {
    serverStatus.classList.add('hidden');
  }

  // Playwright status
  if (state.browserLoaded) {
    playwrightStatus.textContent = state.playwrightConnected ? '✓ Playwright' : '○ Playwright';
    playwrightStatus.classList.toggle('success', state.playwrightConnected);
    playwrightStatus.classList.toggle('warning', !state.playwrightConnected);
    playwrightStatus.classList.remove('hidden');
  } else {
    playwrightStatus.classList.add('hidden');
  }

  // Viewport status
  if (state.viewportWidth > 0) {
    viewportStatus.textContent = `${state.viewportWidth}px`;
    viewportStatus.classList.remove('hidden');
  } else {
    viewportStatus.classList.add('hidden');
  }
}
