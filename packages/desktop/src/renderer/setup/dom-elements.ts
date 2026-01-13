/**
 * DOM Element References
 *
 * Centralizes all getElementById calls for the renderer.
 * Elements are grouped by feature/section for easier navigation.
 */

import { getEl } from '../utils';

// ═══════════════════════════════════════════════════════════════════════════
// Header Elements
// ═══════════════════════════════════════════════════════════════════════════

export const urlInput = getEl<HTMLInputElement>('urlInput');
export const goBtn = getEl<HTMLButtonElement>('goBtn');
export const refreshBtn = getEl<HTMLButtonElement>('refreshBtn');
export const restartServerBtn = getEl<HTMLButtonElement>('restartServerBtn');
export const statusEl = getEl<HTMLSpanElement>('status');
export const viewportSelect = getEl<HTMLSelectElement>('viewportSelect');
export const projectDropdown = getEl<HTMLSelectElement>('projectDropdown');

// ═══════════════════════════════════════════════════════════════════════════
// Panel Elements
// ═══════════════════════════════════════════════════════════════════════════

export const placeholder = getEl<HTMLDivElement>('placeholder');
export const loadingOverlay = getEl<HTMLDivElement>('loadingOverlay');
export const terminalEl = getEl<HTMLDivElement>('terminal');
export const startClaudeBtn = getEl<HTMLButtonElement>('startClaudeBtn');
export const inspectBtn = getEl<HTMLButtonElement>('inspectBtn');
export const browserHelpText = getEl<HTMLSpanElement>('browserHelpText');

// ═══════════════════════════════════════════════════════════════════════════
// Context Panel - Core
// ═══════════════════════════════════════════════════════════════════════════

export const contextEmpty = getEl<HTMLDivElement>('contextEmpty');
export const descriptionInfo = getEl<HTMLDivElement>('descriptionInfo');
export const elementDescription = getEl<HTMLSpanElement>('elementDescription');
export const elementInfo = getEl<HTMLDivElement>('elementInfo');
export const hierarchyInfo = getEl<HTMLDivElement>('hierarchyInfo');
export const hierarchyList = getEl<HTMLDivElement>('hierarchyList');
export const pathInfo = getEl<HTMLDivElement>('pathInfo');
export const attributesInfo = getEl<HTMLDivElement>('attributesInfo');
export const stylesInfo = getEl<HTMLDivElement>('stylesInfo');
export const positionInfo = getEl<HTMLDivElement>('positionInfo');
export const textInfo = getEl<HTMLDivElement>('textInfo');

// ═══════════════════════════════════════════════════════════════════════════
// Context Panel - Element Details
// ═══════════════════════════════════════════════════════════════════════════

export const elementTag = getEl<HTMLElement>('elementTag');
export const elementPath = getEl<HTMLElement>('elementPath');
export const attributesList = getEl<HTMLDivElement>('attributesList');
export const stylesList = getEl<HTMLDivElement>('stylesList');
export const positionData = getEl<HTMLDivElement>('positionData');
export const innerText = getEl<HTMLSpanElement>('innerText');

// ═══════════════════════════════════════════════════════════════════════════
// Context Panel - Component Info
// ═══════════════════════════════════════════════════════════════════════════

export const componentInfo = getEl<HTMLDivElement>('componentInfo');
export const frameworkBadge = getEl<HTMLSpanElement>('frameworkBadge');
export const componentList = getEl<HTMLDivElement>('componentList');

// ═══════════════════════════════════════════════════════════════════════════
// Context Panel - Source Info
// ═══════════════════════════════════════════════════════════════════════════

export const sourceInfo = getEl<HTMLDivElement>('sourceInfo');
export const sourceStatus = getEl<HTMLSpanElement>('sourceStatus');
export const sourceAvailable = getEl<HTMLDivElement>('sourceAvailable');
export const sourceLocation = getEl<HTMLElement>('sourceLocation');
export const copySourceBtn = getEl<HTMLButtonElement>('copySourceBtn');
export const sourceUnavailable = getEl<HTMLDivElement>('sourceUnavailable');
export const sourceNoFramework = getEl<HTMLDivElement>('sourceNoFramework');

// ═══════════════════════════════════════════════════════════════════════════
// Context Panel - Chips and Prompt
// ═══════════════════════════════════════════════════════════════════════════

export const elementChips = getEl<HTMLDivElement>('elementChips');
export const promptInput = getEl<HTMLTextAreaElement>('promptInput');
export const sendPromptBtn = getEl<HTMLButtonElement>('sendPromptBtn');
export const contextModeSelect = getEl<HTMLSelectElement>('contextModeSelect');

// ═══════════════════════════════════════════════════════════════════════════
// Console Drawer (Browser Panel)
// ═══════════════════════════════════════════════════════════════════════════

export const consoleToggleBtn = getEl<HTMLButtonElement>('consoleToggleBtn');
export const consoleDrawer = getEl<HTMLDivElement>('consoleDrawer');
export const consoleDrawerMessages = getEl<HTMLDivElement>('consoleDrawerMessages');
export const consoleDrawerCount = getEl<HTMLSpanElement>('consoleDrawerCount');
export const consoleClearBtn = getEl<HTMLButtonElement>('consoleClearBtn');
export const consoleSendBtn = getEl<HTMLButtonElement>('consoleSendBtn');

// ═══════════════════════════════════════════════════════════════════════════
// Inspect Sequence (Phase 2)
// ═══════════════════════════════════════════════════════════════════════════

export const inspectSequenceInfo = getEl<HTMLDivElement>('inspectSequenceInfo');
export const sequenceCount = getEl<HTMLSpanElement>('sequenceCount');
export const inspectSequenceList = getEl<HTMLDivElement>('inspectSequenceList');
export const clearSequenceBtn = getEl<HTMLButtonElement>('clearSequenceBtn');
export const sendSequenceBtn = getEl<HTMLButtonElement>('sendSequenceBtn');

// ═══════════════════════════════════════════════════════════════════════════
// Form State & Freeze Hover (Phase 3)
// ═══════════════════════════════════════════════════════════════════════════

export const formStateInfo = getEl<HTMLDivElement>('formStateInfo');
export const formStateContent = getEl<HTMLDivElement>('formStateContent');
export const validationBadge = getEl<HTMLSpanElement>('validationBadge');
export const freezeHoverBtn = getEl<HTMLButtonElement>('freezeHoverBtn');

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4: Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

export const overlayInfo = getEl<HTMLDivElement>('overlayInfo');
export const overlayContent = getEl<HTMLDivElement>('overlayContent');
export const overlayTypeBadge = getEl<HTMLSpanElement>('overlayTypeBadge');
export const stackingInfo = getEl<HTMLDivElement>('stackingInfo');
export const stackingContent = getEl<HTMLDivElement>('stackingContent');
export const zIndexBadge = getEl<HTMLSpanElement>('zIndexBadge');
export const scrollInfo = getEl<HTMLDivElement>('scrollInfo');
export const scrollContent = getEl<HTMLDivElement>('scrollContent');
export const visibilityBadge = getEl<HTMLSpanElement>('visibilityBadge');
export const iframeInfo = getEl<HTMLDivElement>('iframeInfo');
export const iframeContent = getEl<HTMLDivElement>('iframeContent');
export const shadowDOMInfo = getEl<HTMLDivElement>('shadowDOMInfo');
export const shadowDOMContent = getEl<HTMLDivElement>('shadowDOMContent');

// ═══════════════════════════════════════════════════════════════════════════
// Toast Captures (Phase 4)
// ═══════════════════════════════════════════════════════════════════════════

export const toastCapturesInfo = getEl<HTMLDivElement>('toastCapturesInfo');
export const toastCapturesList = getEl<HTMLDivElement>('toastCapturesList');
export const toastCount = getEl<HTMLSpanElement>('toastCount');
export const clearToastsBtn = getEl<HTMLButtonElement>('clearToastsBtn');
export const sendToastsBtn = getEl<HTMLButtonElement>('sendToastsBtn');

// ═══════════════════════════════════════════════════════════════════════════
// Resizers
// ═══════════════════════════════════════════════════════════════════════════

export const resizer1 = getEl<HTMLDivElement>('resizer1');
export const resizer2 = getEl<HTMLDivElement>('resizer2');

// ═══════════════════════════════════════════════════════════════════════════
// Copy Buttons
// ═══════════════════════════════════════════════════════════════════════════

export const copySelectorBtn = getEl<HTMLButtonElement>('copySelectorBtn');
export const copyComponentBtn = getEl<HTMLButtonElement>('copyComponentBtn');

// ═══════════════════════════════════════════════════════════════════════════
// Thinking Indicator
// ═══════════════════════════════════════════════════════════════════════════

export const thinkingIndicator = getEl<HTMLSpanElement>('thinkingIndicator');

// ═══════════════════════════════════════════════════════════════════════════
// Enhanced Status Bar
// ═══════════════════════════════════════════════════════════════════════════

export const projectStatus = getEl<HTMLSpanElement>('projectStatus');
export const serverStatus = getEl<HTMLSpanElement>('serverStatus');
export const playwrightStatus = getEl<HTMLSpanElement>('playwrightStatus');
export const viewportStatus = getEl<HTMLSpanElement>('viewportStatus');

// ═══════════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Critical elements that must exist for the app to function.
 * Validates during app initialization.
 */
const CRITICAL_ELEMENTS = [
  { el: urlInput, name: 'urlInput' },
  { el: goBtn, name: 'goBtn' },
  { el: terminalEl, name: 'terminal' },
  { el: startClaudeBtn, name: 'startClaudeBtn' },
  { el: placeholder, name: 'placeholder' },
  { el: contextEmpty, name: 'contextEmpty' },
];

/**
 * Validates that all critical DOM elements exist.
 * Call this during app initialization.
 * @throws Error if any critical element is missing
 */
export function validateDomElements(): void {
  const missing: string[] = [];

  for (const { el, name } of CRITICAL_ELEMENTS) {
    if (!el) {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing critical DOM elements: ${missing.join(', ')}`);
  }
}
