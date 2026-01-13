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
