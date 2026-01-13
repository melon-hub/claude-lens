/**
 * Browser Control Handlers
 *
 * Navigation, refresh, restart server, and viewport handlers.
 */

import { state, updateState, consoleBuffer } from '../state';
import { setStatus, updateStatusBar } from '../ui-helpers';
import { updateBrowserBounds, setBrowserLoaded } from '../browser-helpers';
import { updateConsoleUI } from '../panels';
import { debounce } from '../utils';
import { VIEWPORT_PRESETS } from './navigation';
import {
  urlInput,
  goBtn,
  refreshBtn,
  restartServerBtn,
  viewportSelect,
  placeholder,
  loadingOverlay,
} from '../setup';

/**
 * Set up navigation event handlers (Go, URL input, refresh, restart)
 */
export function setupNavigationHandlers(): void {
  // Navigate to URL
  goBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return;

    // Clear console buffer on navigation
    consoleBuffer.clear();
    updateConsoleUI();

    // Show loading spinner
    placeholder.classList.add('hidden');
    loadingOverlay.classList.remove('hidden');
    setStatus('Loading...');

    const result = await window.claudeLens.browser.navigate(url);

    // Hide loading spinner
    loadingOverlay.classList.add('hidden');

    if (!result.success) {
      placeholder.classList.remove('hidden');
      setStatus('Failed to load');
      alert(`Could not load URL: ${result.error}`);
      return;
    }

    setBrowserLoaded();
  });

  // Enter to navigate
  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') goBtn.click();
  });

  // Refresh button
  refreshBtn.addEventListener('click', async () => {
    if (!state.browserLoaded) return;
    loadingOverlay.classList.remove('hidden');
    setStatus('Refreshing...');
    await window.claudeLens.browser.navigate(urlInput.value);
    loadingOverlay.classList.add('hidden');
    setStatus('Connected', true);
  });

  // Restart server button
  restartServerBtn.addEventListener('click', async () => {
    if (restartServerBtn.disabled) return;

    restartServerBtn.disabled = true;
    loadingOverlay.classList.remove('hidden');
    setStatus('Restarting server...');

    const result = await window.claudeLens.project.restartServer();

    if (result.success) {
      setStatus('Server restarted', true);
    } else {
      setStatus('Restart failed: ' + (result.error || 'Unknown error'));
      loadingOverlay.classList.add('hidden');
    }
  });
}

/**
 * Set up viewport-related handlers (preset dropdown, MCP viewport changes, resize observers)
 */
export function setupViewportHandlers(): void {
  // Viewport preset change handler
  viewportSelect.addEventListener('change', () => {
    const preset = viewportSelect.value;
    updateState({ viewportWidth: VIEWPORT_PRESETS[preset] || 0 });
    updateBrowserBounds();
    updateStatusBar();
  });

  // Listen for viewport changes from MCP tools (Claude can change viewport programmatically)
  window.claudeLens.browser.onSetViewport((width: number) => {
    // Find matching preset or set as custom
    const presetByWidth: Record<number, string> = {
      0: 'full',
      1280: 'desktop',
      1024: 'tablet-landscape',
      768: 'tablet',
      425: 'mobile-large',
      375: 'mobile',
    };

    const preset = presetByWidth[width];
    if (preset) {
      viewportSelect.value = preset;
      updateState({ viewportWidth: width });
    } else {
      // Custom width - set to full and apply custom constraint
      viewportSelect.value = 'full';
      updateState({ viewportWidth: width });
    }

    updateBrowserBounds();
    updateStatusBar();
    // Show user feedback
    const widthLabel = state.viewportWidth > 0 ? `${state.viewportWidth}px` : 'Full Width';
    setStatus(`Viewport: ${widthLabel}`);
  });

  // Update browser bounds on window resize (ensures bounds update after maximize/restore)
  window.addEventListener('resize', debounce(() => {
    if (state.browserLoaded) {
      console.log('[Viewport] Window resize detected, updating bounds');
      updateBrowserBounds();
    }
  }, 100));

  // Use ResizeObserver for more reliable panel size tracking
  const browserPanel = document.querySelector('.browser-panel') as HTMLElement;
  const panelResizeObserver = new ResizeObserver(debounce(() => {
    if (state.browserLoaded) {
      console.log('[Viewport] Panel resize detected, updating bounds');
      updateBrowserBounds();
    }
  }, 50));
  panelResizeObserver.observe(browserPanel);

  // Reset viewport to full width when starting a new project
  window.claudeLens.browser.onResetViewport(() => {
    console.log('[Viewport] Received resetViewport, current viewportWidth:', state.viewportWidth);
    updateState({ viewportWidth: 0 });
    viewportSelect.value = 'full';
    console.log('[Viewport] Reset to full width, calling updateBrowserBounds');
    updateBrowserBounds();
  });
}
