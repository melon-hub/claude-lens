/**
 * Phase 4 UI Functions
 *
 * Edge case UI: overlays, z-index, scroll, iframes, shadow DOM, toasts
 */

import type { ElementInfo } from '../types';
import { state, clearCapturedToasts } from '../state';
import {
  overlayInfo,
  overlayContent,
  overlayTypeBadge,
  stackingInfo,
  stackingContent,
  zIndexBadge,
  scrollInfo,
  scrollContent,
  visibilityBadge,
  iframeInfo,
  iframeContent,
  shadowDOMInfo,
  shadowDOMContent,
  toastCapturesInfo,
  toastCapturesList,
  toastCount,
} from '../setup';

/**
 * Helper to create a row with label and value (safe DOM construction)
 */
function createInfoRow(className: string, label: string, value: string, extraClass?: string): HTMLElement {
  const row = document.createElement('div');
  row.className = className;

  const labelEl = document.createElement('span');
  labelEl.className = className.replace('-row', '-label');
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const valueEl = document.createElement('span');
  valueEl.className = className.replace('-row', '-value') + (extraClass ? ` ${extraClass}` : '');
  valueEl.textContent = value;
  row.appendChild(valueEl);

  return row;
}

/**
 * Update overlay/modal UI (Phase 4)
 */
function updateOverlayUI(element: ElementInfo): void {
  const overlay = element.overlay;

  if (!overlay) {
    overlayInfo.classList.add('hidden');
    return;
  }

  overlayInfo.classList.remove('hidden');

  // Set overlay type badge
  overlayTypeBadge.className = `overlay-badge ${overlay.type}`;
  overlayTypeBadge.textContent = overlay.type;

  // Build overlay info rows
  overlayContent.textContent = '';

  if (overlay.isBackdrop) {
    overlayContent.appendChild(createInfoRow('overlay-row', 'Is Backdrop', 'Yes'));
  }
  if (overlay.triggeredBy) {
    overlayContent.appendChild(createInfoRow('overlay-row', 'Triggered By', overlay.triggeredBy));
  }
  overlayContent.appendChild(createInfoRow('overlay-row', 'Can Dismiss', overlay.canDismiss ? 'Yes' : 'No'));
}

/**
 * Update z-index stacking UI (Phase 4)
 */
function updateStackingUI(element: ElementInfo): void {
  const stacking = element.stacking;

  if (!stacking) {
    stackingInfo.classList.add('hidden');
    return;
  }

  stackingInfo.classList.remove('hidden');

  // Set z-index badge
  zIndexBadge.textContent = `z-index: ${stacking.zIndex}`;

  // Build stacking context list
  stackingContent.textContent = '';

  if (stacking.stackingContext && stacking.stackingContext.length > 0) {
    stacking.stackingContext.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = `stacking-item${index === 0 ? ' top' : ''}`;

      const zIndexSpan = document.createElement('span');
      zIndexSpan.className = 'stacking-item-zindex';
      zIndexSpan.textContent = `z:${item.zIndex}`;
      itemEl.appendChild(zIndexSpan);

      const descSpan = document.createElement('span');
      descSpan.className = 'stacking-item-desc';
      descSpan.textContent = item.description;
      itemEl.appendChild(descSpan);

      stackingContent.appendChild(itemEl);
    });
  }
}

/**
 * Update scroll context UI (Phase 4)
 */
function updateScrollUI(element: ElementInfo): void {
  const scroll = element.scroll;

  if (!scroll) {
    scrollInfo.classList.add('hidden');
    return;
  }

  scrollInfo.classList.remove('hidden');

  // Set visibility badge
  visibilityBadge.className = 'visibility-badge';
  if (scroll.visiblePercentage === 100) {
    visibilityBadge.textContent = '100% Visible';
    visibilityBadge.classList.add('visible');
  } else if (scroll.visiblePercentage > 0) {
    visibilityBadge.textContent = `${scroll.visiblePercentage}% Visible`;
    visibilityBadge.classList.add('partial');
  } else {
    visibilityBadge.textContent = 'Not Visible';
    visibilityBadge.classList.add('hidden');
  }

  // Build scroll info rows
  scrollContent.textContent = '';

  scrollContent.appendChild(createInfoRow('scroll-row', 'In Viewport', scroll.isInViewport ? 'Yes' : 'No'));
  if (scroll.isScrollable) {
    scrollContent.appendChild(createInfoRow('scroll-row', 'Scrollable', 'Yes'));
    scrollContent.appendChild(createInfoRow('scroll-row', 'Scroll Position', `${scroll.scrollLeft}px, ${scroll.scrollTop}px`));
    scrollContent.appendChild(createInfoRow('scroll-row', 'Scroll Size', `${scroll.scrollWidth}×${scroll.scrollHeight}px`));
  }
}

/**
 * Update iframe context UI (Phase 4)
 */
function updateIframeUI(element: ElementInfo): void {
  const iframe = element.iframe;

  if (!iframe) {
    iframeInfo.classList.add('hidden');
    return;
  }

  iframeInfo.classList.remove('hidden');
  iframeContent.textContent = '';

  if (iframe.crossOrigin) {
    iframeContent.appendChild(createInfoRow('iframe-row', 'Cross-Origin', 'Yes (limited access)', 'context-warning cross-origin'));
  } else {
    if (iframe.src) {
      const truncatedSrc = iframe.src.slice(0, 50) + (iframe.src.length > 50 ? '...' : '');
      iframeContent.appendChild(createInfoRow('iframe-row', 'Source', truncatedSrc));
    }
    if (iframe.name) {
      iframeContent.appendChild(createInfoRow('iframe-row', 'Name', iframe.name));
    }
    iframeContent.appendChild(createInfoRow('iframe-row', 'Sandboxed', iframe.sandboxed ? 'Yes' : 'No'));
  }
}

/**
 * Update shadow DOM UI (Phase 4)
 */
function updateShadowDOMUI(element: ElementInfo): void {
  const shadowDOM = element.shadowDOM;

  if (!shadowDOM) {
    shadowDOMInfo.classList.add('hidden');
    return;
  }

  shadowDOMInfo.classList.remove('hidden');
  shadowDOMContent.textContent = '';

  if (shadowDOM.isInShadowDOM) {
    shadowDOMContent.appendChild(createInfoRow('shadow-row', 'Inside Shadow DOM', 'Yes'));
    if (shadowDOM.shadowHost) {
      shadowDOMContent.appendChild(createInfoRow('shadow-row', 'Host Element', shadowDOM.shadowHost));
    }
  }

  if (shadowDOM.hasShadowRoot) {
    shadowDOMContent.appendChild(createInfoRow('shadow-row', 'Has Shadow Root', 'Yes'));
    if (shadowDOM.shadowRootMode) {
      shadowDOMContent.appendChild(createInfoRow('shadow-row', 'Mode', shadowDOM.shadowRootMode));
    }
    if (shadowDOM.shadowChildCount !== undefined) {
      shadowDOMContent.appendChild(createInfoRow('shadow-row', 'Child Count', String(shadowDOM.shadowChildCount)));
    }
  }
}

/**
 * Update toast captures UI (Phase 4)
 */
export function updateToastCapturesUI(): void {
  if (state.capturedToasts.length === 0) {
    toastCapturesInfo.classList.add('hidden');
    return;
  }

  toastCapturesInfo.classList.remove('hidden');
  toastCount.textContent = String(state.capturedToasts.length);

  toastCapturesList.textContent = '';

  state.capturedToasts.forEach((toast) => {
    const item = document.createElement('div');
    item.className = 'toast-item';

    const timeDiff = Math.round((Date.now() - toast.timestamp) / 1000);
    const timeStr = timeDiff < 60 ? `${timeDiff}s ago` : `${Math.round(timeDiff / 60)}m ago`;

    const typeBadge = document.createElement('span');
    typeBadge.className = `toast-type-badge ${toast.type}`;
    typeBadge.textContent = toast.type;
    item.appendChild(typeBadge);

    const textSpan = document.createElement('span');
    textSpan.className = 'toast-text';
    textSpan.textContent = toast.text;
    item.appendChild(textSpan);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'toast-time';
    timeSpan.textContent = timeStr;
    item.appendChild(timeSpan);

    toastCapturesList.appendChild(item);
  });
}

/**
 * Clear toast captures
 */
export function clearToastCaptures(): void {
  clearCapturedToasts();
  updateToastCapturesUI();
}

/**
 * Update all Phase 4 UI sections for an element
 */
export function updatePhase4UI(element: ElementInfo): void {
  updateOverlayUI(element);
  updateStackingUI(element);
  updateScrollUI(element);
  updateIframeUI(element);
  updateShadowDOMUI(element);
}
