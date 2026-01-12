/**
 * Edge Case Detection Helpers
 *
 * Browser-side helpers for detecting edge cases during element inspection.
 * These run in the browser context via page.evaluate().
 *
 * Handles: overlays, modals, z-index stacking, iframes, shadow DOM, scroll context
 *
 * DEPENDENCY: This file requires element-inspection-helpers.js to be loaded first.
 * It uses: describeElement(), buildSelector()
 * See playwright-handler.ts for the loading order.
 */

// Detect overlay/modal context
function getOverlayInfo(element) {
  const role = element.getAttribute('role');
  const classes = Array.from(element.classList).join(' ').toLowerCase();
  const styles = window.getComputedStyle(element);

  const isDialog = role === 'dialog' || role === 'alertdialog' || element.tagName === 'DIALOG';
  const isModal = classes.includes('modal') || element.hasAttribute('aria-modal');
  const isDrawer = classes.includes('drawer') || classes.includes('sidebar') || classes.includes('panel');
  const isPopover = classes.includes('popover') || role === 'tooltip';
  const isTooltip = classes.includes('tooltip') || role === 'tooltip';
  const isDropdown = classes.includes('dropdown') || role === 'menu' || role === 'listbox';
  const isBackdrop = classes.includes('backdrop') || classes.includes('overlay') ||
    (styles.position === 'fixed' && styles.inset === '0px');

  if (!isDialog && !isModal && !isDrawer && !isPopover && !isTooltip && !isDropdown && !isBackdrop) {
    return null;
  }

  let overlayType = 'modal';
  if (isDialog) overlayType = 'dialog';
  else if (isDrawer) overlayType = 'drawer';
  else if (isPopover) overlayType = 'popover';
  else if (isTooltip) overlayType = 'tooltip';
  else if (isDropdown) overlayType = 'dropdown';

  const ariaControls = element.getAttribute('aria-controls');
  const triggeredBy = ariaControls ? '#' + ariaControls : undefined;
  const canDismiss = element.querySelector('[data-dismiss], .close, .btn-close') !== null ||
    element.hasAttribute('data-dismiss') || isTooltip || isPopover;

  return { type: overlayType, isBackdrop, triggeredBy, canDismiss };
}

// Get z-index stacking context
function getStackingInfo(element) {
  const styles = window.getComputedStyle(element);
  const zIndex = styles.zIndex;

  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const elementsAtPoint = document.elementsFromPoint(centerX, centerY);
  const stackingContext = elementsAtPoint.slice(0, 5).map(el => {
    const elStyles = window.getComputedStyle(el);
    return {
      description: describeElement(el),
      zIndex: elStyles.zIndex === 'auto' ? 'auto' : elStyles.zIndex,
      selector: buildSelector(el)
    };
  });

  return { zIndex: zIndex === 'auto' ? 'auto' : zIndex, stackingContext };
}

// Detect iframe context
function getIframeInfo() {
  const isInIframe = window !== window.top;
  if (!isInIframe) return null;

  try {
    const frameElement = window.frameElement;
    return {
      src: frameElement ? frameElement.getAttribute('src') : undefined,
      name: frameElement ? frameElement.getAttribute('name') : undefined,
      sandboxed: frameElement ? frameElement.hasAttribute('sandbox') : false,
      crossOrigin: false
    };
  } catch (e) {
    return { crossOrigin: true, sandboxed: false };
  }
}

// Detect shadow DOM context
function getShadowDOMInfo(element) {
  const hasShadowRoot = !!element.shadowRoot;
  let shadowChildCount = undefined;
  let shadowRootMode = undefined;

  if (hasShadowRoot) {
    shadowChildCount = element.shadowRoot.childElementCount;
    shadowRootMode = element.shadowRoot.mode;
  }

  let isInShadowDOM = false;
  let shadowHost = undefined;
  let node = element;

  while (node) {
    const root = node.getRootNode();
    if (root instanceof ShadowRoot) {
      isInShadowDOM = true;
      shadowHost = describeElement(root.host);
      break;
    }
    if (root === document) break;
    node = root.host;
  }

  if (!hasShadowRoot && !isInShadowDOM) return null;

  return { isInShadowDOM, shadowHost, shadowRootMode, hasShadowRoot, shadowChildCount };
}

// Get scroll context
function getScrollInfo(element) {
  const rect = element.getBoundingClientRect();
  const viewport = { width: window.innerWidth, height: window.innerHeight };

  const styles = window.getComputedStyle(element);
  const isScrollable = styles.overflow === 'scroll' || styles.overflow === 'auto' ||
    styles.overflowX === 'scroll' || styles.overflowX === 'auto' ||
    styles.overflowY === 'scroll' || styles.overflowY === 'auto';

  const isInViewport = rect.top < viewport.height && rect.bottom > 0 &&
    rect.left < viewport.width && rect.right > 0;

  let visiblePercentage = 0;
  if (isInViewport && rect.width > 0 && rect.height > 0) {
    const visibleWidth = Math.max(0, Math.min(rect.right, viewport.width) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0));
    const visibleArea = visibleWidth * visibleHeight;
    const totalArea = rect.width * rect.height;
    visiblePercentage = Math.round((visibleArea / totalArea) * 100);
  }

  return {
    isScrollable,
    scrollTop: Math.round(element.scrollTop),
    scrollLeft: Math.round(element.scrollLeft),
    scrollHeight: Math.round(element.scrollHeight),
    scrollWidth: Math.round(element.scrollWidth),
    isInViewport,
    visiblePercentage
  };
}
