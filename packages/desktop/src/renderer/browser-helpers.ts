/**
 * Browser Helper Functions
 *
 * Functions for browser view management and state updates.
 * Extracted from main.ts to enable reuse and testing.
 */

import { state, updateState, DRAWER_HEIGHT } from './state';
import {
  refreshBtn,
  restartServerBtn,
  placeholder,
  browserHelpText,
  urlInput,
} from './setup';
import { setStatus } from './ui-helpers';

/**
 * Update browser bounds with viewport constraint
 * Call this whenever panel size changes or viewport preset changes
 */
export function updateBrowserBounds(): void {
  const browserPanel = document.querySelector('.browser-panel') as HTMLElement;
  const drawerHeight = state.consoleDrawerOpen ? DRAWER_HEIGHT : 0;

  // Apply viewport width constraint
  const panelWidth = browserPanel.offsetWidth;
  const effectiveWidth = state.viewportWidth > 0 ? Math.min(state.viewportWidth, panelWidth) : panelWidth;

  // Pass both panelWidth and effectiveWidth so main can center the browser
  window.claudeLens.browser.updateBounds(effectiveWidth, drawerHeight, panelWidth);
}

/**
 * Set browser as loaded and update UI state
 * Consolidates all the state changes needed when browser content is ready
 */
export function setBrowserLoaded(url?: string): void {
  updateState({ browserLoaded: true });
  refreshBtn.disabled = false;
  restartServerBtn.disabled = false;
  placeholder.classList.add('hidden');
  setStatus('Connected', true);
  browserHelpText.textContent = 'Ctrl+hover to inspect anytime';
  if (url) {
    urlInput.value = url;
  }
  updateBrowserBounds();
}
