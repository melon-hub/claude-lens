/**
 * Terminal Context Menu
 *
 * Right-click menu for copy/paste operations in the terminal.
 */

import { terminal } from './manager';
import { state } from '../state';
import { setStatus } from '../ui-helpers';

let contextMenu: HTMLDivElement | null = null;

/**
 * Hide and remove the context menu
 */
export function hideContextMenu(): void {
  if (contextMenu) {
    contextMenu.remove();
    contextMenu = null;
  }
}

/**
 * Show context menu at specified position
 */
export function showContextMenu(x: number, y: number): void {
  hideContextMenu();

  const hasSelection = terminal.hasSelection();

  contextMenu = document.createElement('div');
  contextMenu.className = 'terminal-context-menu';
  contextMenu.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 0;
    min-width: 120px;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;

  // Copy option
  const copyItem = createMenuItem(
    'Copy',
    'Ctrl+Shift+C',
    hasSelection,
    async () => {
      const selection = terminal.getSelection();
      if (selection) {
        await navigator.clipboard.writeText(selection);
        setStatus('Copied to clipboard');
        setTimeout(() => {
          if (state.browserLoaded) setStatus('Connected', true);
        }, 2000);
      }
      hideContextMenu();
    }
  );
  contextMenu.appendChild(copyItem);

  // Paste option
  const pasteItem = createMenuItem(
    'Paste',
    'Ctrl+Shift+V',
    state.claudeRunning,
    async () => {
      hideContextMenu();
      // Check for image first
      const hasImage = await window.claudeLens.clipboard.hasImage();
      if (hasImage) {
        setStatus('Saving image...');
        const result = await window.claudeLens.clipboard.saveImage();
        if (result.success && result.path) {
          window.claudeLens.pty.write(`@${result.path} `);
          setStatus('Image pasted', true);
          setTimeout(() => {
            if (state.browserLoaded) setStatus('Connected', true);
          }, 2000);
        } else {
          setStatus(`Image error: ${result.error}`);
        }
      } else {
        // Paste text via IPC (avoids "document not focused" error)
        const text = await window.claudeLens.clipboard.readText();
        if (text) {
          window.claudeLens.pty.write(text);
        }
      }
      terminal.focus();
    }
  );
  contextMenu.appendChild(pasteItem);

  document.body.appendChild(contextMenu);
}

/**
 * Create a menu item element using safe DOM methods
 */
function createMenuItem(
  label: string,
  shortcut: string,
  enabled: boolean,
  onClick: () => void
): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'context-menu-item';
  item.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    cursor: ${enabled ? 'pointer' : 'default'};
    opacity: ${enabled ? '1' : '0.5'};
    font-size: 12px;
  `;

  // Label text (safe DOM method)
  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  item.appendChild(labelSpan);

  // Shortcut text (safe DOM method)
  const shortcutSpan = document.createElement('span');
  shortcutSpan.textContent = shortcut;
  shortcutSpan.style.cssText = 'color: var(--text-muted); font-size: 11px;';
  item.appendChild(shortcutSpan);

  if (enabled) {
    item.addEventListener('mouseenter', () => {
      item.style.background = 'var(--bg-hover)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = '';
    });
    item.addEventListener('click', onClick);
  }

  return item;
}

/**
 * Set up context menu event listeners
 * Call this once during initialization
 */
export function setupContextMenu(terminalElement: HTMLElement): void {
  terminalElement.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
  });

  // Hide on click outside or Escape
  document.addEventListener('click', hideContextMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideContextMenu();
    }
  });
}
