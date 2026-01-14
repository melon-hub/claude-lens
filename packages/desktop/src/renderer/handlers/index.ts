/**
 * Handlers module
 *
 * Exports handler utilities and setup functions.
 */

export {
  normalizeUrl,
  extractPort,
  isLocalhostUrl,
  VIEWPORT_PRESETS,
  getViewportWidth,
} from './navigation';

export { updateProjectDropdown } from './project';
export { setupSendHandlers } from './send-handlers';
export { setupNavigationHandlers, setupViewportHandlers } from './browser-controls';
export { setupInspectHandlers, setupKeyboardShortcuts, toggleFreezeHover } from './inspect';
