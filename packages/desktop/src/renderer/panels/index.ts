/**
 * Panels module
 *
 * Exports panel helper functions and utilities.
 */

export {
  buildTagDisplay,
  truncateText,
  formatProps,
  createInfoRow,
  createBadge,
  formatPosition,
  formatSelector,
  escapeHtml,
  formatTimestamp,
} from './helpers';

// Project modal
export { showProjectModal } from './project-modal';

// Panel resizers
export { setupResizers, savePanelWidths, restorePanelWidths, resetPanelWidths } from './resizers';

// Console drawer
export { addConsoleMessage, updateConsoleUI, updateConsoleDrawer } from './console-drawer';

// Context panel
export {
  addSelectedElement,
  updateContextPanel,
  updateElementChips,
  removeElement,
  setContextPanelCallbacks,
  resetContextPanelUI,
} from './context-panel';

// Inspect sequence
export { updateInspectSequenceUI, clearInspectSequenceUI } from './inspect-sequence';

// Form state
export { updateFormStateUI } from './form-state';

// Phase 4 UI
export { updatePhase4UI, updateToastCapturesUI, clearToastCaptures } from './phase4-ui';
