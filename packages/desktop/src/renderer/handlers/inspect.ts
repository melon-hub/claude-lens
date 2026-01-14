/**
 * Inspect Mode Handlers
 *
 * Inspect mode toggle and freeze hover functionality.
 */

import { state, updateState } from '../state';
import { clearInspectSequenceUI } from '../panels';
import {
  inspectBtn,
  freezeHoverBtn,
  browserHelpText,
} from '../setup';

/**
 * Toggle freeze hover state
 */
export async function toggleFreezeHover(): Promise<void> {
  if (!state.browserLoaded) {
    return;
  }

  updateState({ hoverFrozen: !state.hoverFrozen });

  if (state.hoverFrozen) {
    await window.claudeLens.browser.freezeHover();
    freezeHoverBtn.textContent = 'Unfreeze (F)';
    freezeHoverBtn.classList.add('active');
    browserHelpText.textContent = 'Hover frozen • Press F to unfreeze';
  } else {
    await window.claudeLens.browser.unfreezeHover();
    freezeHoverBtn.textContent = 'Freeze (F)';
    freezeHoverBtn.classList.remove('active');
    browserHelpText.textContent = '';
  }
}

/**
 * Set up inspect mode and freeze hover event handlers
 */
export function setupInspectHandlers(): void {
  // Inspect mode toggle (Phase 2: sequence capture mode)
  inspectBtn.addEventListener('click', async () => {
    if (!state.browserLoaded) {
      alert('Load a page first');
      return;
    }

    updateState({ inspectMode: !state.inspectMode });

    if (state.inspectMode) {
      // Clear previous sequence when entering inspect mode
      clearInspectSequenceUI();
      await window.claudeLens.browser.enableInspect();
      inspectBtn.textContent = 'Stop Inspecting';
      inspectBtn.classList.add('btn-primary');
      browserHelpText.textContent = 'Hover to highlight • Click to capture';
    } else {
      await window.claudeLens.browser.disableInspect();
      inspectBtn.textContent = 'Inspect';
      inspectBtn.classList.remove('btn-primary');
      // Don't clear sequence - user may want to send it
      if (state.inspectSequence.length > 0) {
        browserHelpText.textContent = `Captured ${state.inspectSequence.length} • Click "Send Sequence" to send`;
      } else {
        browserHelpText.textContent = 'Ctrl+hover to inspect anytime';
      }
    }
  });

  // Freeze hover button click
  freezeHoverBtn.addEventListener('click', toggleFreezeHover);
}

/**
 * Set up keyboard shortcuts
 */
export function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', async (e) => {
    const activeEl = document.activeElement;
    const isTyping = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA';

    // Press F to freeze/unfreeze hover (works while hovering!)
    if ((e.key === 'f' || e.key === 'F') && !isTyping && state.browserLoaded) {
      e.preventDefault();
      toggleFreezeHover().catch(err => console.error('[Inspect] Freeze toggle failed:', err));
    }

    // Ctrl+R to reload browser page (always prevent to block Electron's window reload)
    if (e.ctrlKey && (e.key === 'r' || e.key === 'R') && !isTyping) {
      e.preventDefault();
      window.claudeLens.browser.reload().catch(err => console.error('[Browser] Reload failed:', err));
    }
  });
}
