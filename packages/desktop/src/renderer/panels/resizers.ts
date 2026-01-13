/**
 * Panel Resizers
 *
 * Three-column layout resize handling with localStorage persistence.
 */

import { state, DRAWER_HEIGHT } from '../state';
import { terminal, fitAddon } from '../terminal';
import { resizer1, resizer2 } from '../setup';

const DEFAULT_CLAUDE_WIDTH = 400;
const MIN_PANEL_WIDTH = 300;

/**
 * Initialize all panel resizers
 */
export function setupResizers(): void {
  // Restore saved widths from localStorage
  restorePanelWidths();

  setupResizer(resizer1, 'browser-panel', 'left');
  setupResizer(resizer2, 'claude-panel', 'right');
}

/**
 * Save panel widths to localStorage
 */
export function savePanelWidths(): void {
  const browserPanel = document.querySelector('.browser-panel') as HTMLElement;
  const claudePanel = document.querySelector('.claude-panel') as HTMLElement;

  const browserWidth = browserPanel.style.flex.includes('px')
    ? parseInt(browserPanel.style.flex.match(/(\d+)px/)?.[1] || '0')
    : 0;
  const claudeWidth = claudePanel.style.flex.includes('px')
    ? parseInt(claudePanel.style.flex.match(/(\d+)px/)?.[1] || '0')
    : 0;

  localStorage.setItem('claude-lens-panel-widths', JSON.stringify({
    browser: browserWidth,
    claude: claudeWidth
  }));
}

/**
 * Restore panel widths from localStorage
 */
export function restorePanelWidths(): void {
  try {
    const saved = localStorage.getItem('claude-lens-panel-widths');
    if (saved) {
      const parsed = JSON.parse(saved);

      // Validate structure before destructuring
      if (typeof parsed !== 'object' || parsed === null) {
        return;
      }

      const { browser, claude } = parsed;
      const browserPanel = document.querySelector('.browser-panel') as HTMLElement;
      const claudePanel = document.querySelector('.claude-panel') as HTMLElement;

      // Validate types before using
      if (typeof browser === 'number' && browser > 0) {
        browserPanel.style.flex = `0 0 ${browser}px`;
      }
      if (typeof claude === 'number' && claude > 0) {
        claudePanel.style.flex = `0 0 ${claude}px`;
      }
    }
  } catch (error) {
    console.warn('[PanelWidths] Failed to restore saved widths:', error);
    // Clear corrupted data
    try {
      localStorage.removeItem('claude-lens-panel-widths');
    } catch {
      // localStorage inaccessible
    }
  }
}

/**
 * Reset panel widths to defaults
 */
export function resetPanelWidths(): void {
  const browserPanel = document.querySelector('.browser-panel') as HTMLElement;
  const claudePanel = document.querySelector('.claude-panel') as HTMLElement;

  browserPanel.style.flex = '1';
  claudePanel.style.flex = `0 0 ${DEFAULT_CLAUDE_WIDTH}px`;

  localStorage.removeItem('claude-lens-panel-widths');

  // Update browser bounds and terminal
  const drawerHeight = state.consoleDrawerOpen ? DRAWER_HEIGHT : 0;
  window.claudeLens.browser.updateBounds(0, drawerHeight);
  fitAddon.fit();
  terminal.refresh(0, terminal.rows - 1);
  if (state.claudeRunning) {
    window.claudeLens.pty.resize(terminal.cols, terminal.rows);
  }
}

/**
 * Set up a single resizer for a panel
 */
function setupResizer(resizer: HTMLElement, panelClass: string, side: 'left' | 'right'): void {
  let isResizing = false;

  // Double-click to reset panel widths
  resizer.addEventListener('dblclick', () => {
    resetPanelWidths();
  });

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const panel = document.querySelector(`.${panelClass}`) as HTMLElement;
    const main = document.querySelector('.main') as HTMLElement;
    const mainRect = main.getBoundingClientRect();

    if (side === 'left') {
      const newWidth = e.clientX - mainRect.left;
      // Ensure minimum widths: browser panel + context panel + claude panel
      if (newWidth >= MIN_PANEL_WIDTH && newWidth < mainRect.width - MIN_PANEL_WIDTH * 2) {
        panel.style.flex = `0 0 ${newWidth}px`;
        const drawerHeight = state.consoleDrawerOpen ? DRAWER_HEIGHT : 0;
        // Apply viewport constraint to resize
        const effectiveWidth = state.viewportWidth > 0 ? Math.min(state.viewportWidth, newWidth) : newWidth;
        window.claudeLens.browser.updateBounds(effectiveWidth, drawerHeight);
      }
    } else {
      const newWidth = mainRect.right - e.clientX;
      // Ensure minimum widths for claude panel and remaining space
      if (newWidth >= MIN_PANEL_WIDTH && newWidth < mainRect.width - MIN_PANEL_WIDTH * 2) {
        panel.style.flex = `0 0 ${newWidth}px`;
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Save panel widths to localStorage
      savePanelWidths();
      fitAddon.fit();
      // Force terminal refresh to clear rendering artifacts after panel resize
      terminal.refresh(0, terminal.rows - 1);
      if (state.claudeRunning) {
        window.claudeLens.pty.resize(terminal.cols, terminal.rows);
      }
    }
  });
}
