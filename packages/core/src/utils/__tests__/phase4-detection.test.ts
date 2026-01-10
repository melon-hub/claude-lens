/**
 * Phase 4 Edge Case Detection Tests
 *
 * Tests the browser-context helper functions used in playwright-handler.ts
 * for detecting overlays, z-index stacking, iframes, shadow DOM, and scroll context.
 *
 * Note: Uses Function constructor to evaluate the same code that runs in browser context.
 * This is intentional - we're testing string templates that get injected via page.evaluate().
 * The code evaluated is our own helper code, not user input.
 */
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { Window } from 'happy-dom';

// Create a fresh DOM environment for each test
let window: Window;
let document: Document;

beforeEach(() => {
  window = new Window({ url: 'https://localhost:3000' });
  document = window.document;
  // Make window globally available for the evaluated code
  (globalThis as unknown as { window: Window }).window = window;
  (globalThis as unknown as { document: Document }).document = document;
});

afterEach(() => {
  window.close();
});

/**
 * Helper code extracted from playwright-handler.ts ELEMENT_INSPECTION_HELPERS.
 * This is the shared isLoadingState function used by Phase 4 detection.
 */
const isLoadingStateCode = `
  function isLoadingState(element) {
    const classes = Array.from(element.classList);
    const loadingClasses = ['loading', 'spinner', 'skeleton', 'shimmer', 'pulse', 'loader'];
    const hasLoadingClass = classes.some(c =>
      loadingClasses.some(lc => c.toLowerCase().includes(lc))
    );
    const ariaBusy = element.getAttribute('aria-busy') === 'true';
    const hasSpinnerChild = !!element.querySelector('.spinner, .loading, .loader, [aria-busy="true"]');
    return hasLoadingClass || ariaBusy || hasSpinnerChild;
  }
`;

/**
 * Helper code for describeElement (simplified for testing)
 */
const describeElementCode = `
  function describeElement(element) {
    const tag = element.tagName.toLowerCase();
    const id = element.id;
    if (id) return tag + ' (#' + id + ')';
    return tag;
  }
`;

/**
 * Helper code for buildSelector (simplified for testing)
 */
const buildSelectorCode = `
  function buildSelector(element) {
    if (element.id) return '#' + element.id;
    return element.tagName.toLowerCase();
  }
`;

/**
 * Phase 4 getOverlayInfo function from playwright-handler.ts
 */
const getOverlayInfoCode = `
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
`;

/**
 * Phase 4 getStackingInfo function from playwright-handler.ts
 */
const getStackingInfoCode = `
  ${describeElementCode}
  ${buildSelectorCode}

  function getStackingInfo(element) {
    const styles = window.getComputedStyle(element);
    const zIndex = styles.zIndex;

    // Simplified for testing - just get z-index without elementsFromPoint
    return {
      zIndex: zIndex === 'auto' ? 'auto' : zIndex,
      stackingContext: []
    };
  }
`;

/**
 * Phase 4 getScrollInfo function from playwright-handler.ts
 */
const getScrollInfoCode = `
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
`;

/**
 * Phase 4 getShadowDOMInfo function from playwright-handler.ts
 */
const getShadowDOMInfoCode = `
  ${describeElementCode}

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
`;

// Helper to create a function that evaluates our browser-context code
// This mirrors how page.evaluate() works in Playwright
function createEvaluator<T>(code: string, fnName: string) {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('element', 'window', 'document', 'ShadowRoot', `
    ${code}
    return ${fnName}(element);
  `) as (el: Element, win: Window, doc: Document, sr: typeof ShadowRoot) => T;
}

describe('Phase 4: isLoadingState', () => {
  const evaluator = createEvaluator<boolean>(isLoadingStateCode, 'isLoadingState');

  test('detects loading class', () => {
    const div = document.createElement('div');
    div.className = 'card loading';
    document.body.appendChild(div);
    expect(evaluator(div, window, document, window.ShadowRoot)).toBe(true);
  });

  test('detects spinner class', () => {
    const div = document.createElement('div');
    div.className = 'spinner-border';
    document.body.appendChild(div);
    expect(evaluator(div, window, document, window.ShadowRoot)).toBe(true);
  });

  test('detects aria-busy attribute', () => {
    const div = document.createElement('div');
    div.setAttribute('aria-busy', 'true');
    document.body.appendChild(div);
    expect(evaluator(div, window, document, window.ShadowRoot)).toBe(true);
  });

  test('detects spinner child element', () => {
    const div = document.createElement('div');
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    div.appendChild(spinner);
    document.body.appendChild(div);
    expect(evaluator(div, window, document, window.ShadowRoot)).toBe(true);
  });

  test('returns false for non-loading element', () => {
    const div = document.createElement('div');
    div.className = 'card';
    document.body.appendChild(div);
    expect(evaluator(div, window, document, window.ShadowRoot)).toBe(false);
  });

  test('detects skeleton class', () => {
    const div = document.createElement('div');
    div.className = 'skeleton-loader';
    document.body.appendChild(div);
    expect(evaluator(div, window, document, window.ShadowRoot)).toBe(true);
  });

  test('detects shimmer effect class', () => {
    const div = document.createElement('div');
    div.className = 'shimmer-effect';
    document.body.appendChild(div);
    expect(evaluator(div, window, document, window.ShadowRoot)).toBe(true);
  });
});

describe('Phase 4: getOverlayInfo', () => {
  const evaluator = createEvaluator<{
    type: string;
    isBackdrop: boolean;
    triggeredBy?: string;
    canDismiss: boolean;
  } | null>(getOverlayInfoCode, 'getOverlayInfo');

  test('detects dialog role', () => {
    const div = document.createElement('div');
    div.setAttribute('role', 'dialog');
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('dialog');
  });

  test('detects alertdialog role', () => {
    const div = document.createElement('div');
    div.setAttribute('role', 'alertdialog');
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('dialog');
  });

  test('detects modal class', () => {
    const div = document.createElement('div');
    div.className = 'modal';
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('modal');
  });

  test('detects aria-modal attribute', () => {
    const div = document.createElement('div');
    div.setAttribute('aria-modal', 'true');
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('modal');
  });

  test('detects dropdown role menu', () => {
    const div = document.createElement('div');
    div.setAttribute('role', 'menu');
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('dropdown');
  });

  test('detects dropdown role listbox', () => {
    const div = document.createElement('div');
    div.setAttribute('role', 'listbox');
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('dropdown');
  });

  test('detects tooltip class', () => {
    const div = document.createElement('div');
    div.className = 'tooltip';
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('tooltip');
    expect(result!.canDismiss).toBe(true);
  });

  test('detects popover class', () => {
    const div = document.createElement('div');
    div.className = 'popover';
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('popover');
    expect(result!.canDismiss).toBe(true);
  });

  test('detects drawer/sidebar', () => {
    const div = document.createElement('div');
    div.className = 'sidebar';
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('drawer');
  });

  test('detects drawer class', () => {
    const div = document.createElement('div');
    div.className = 'drawer';
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('drawer');
  });

  test('returns null for non-overlay element', () => {
    const div = document.createElement('div');
    div.className = 'card';
    document.body.appendChild(div);

    expect(evaluator(div, window, document, window.ShadowRoot)).toBeNull();
  });

  test('detects canDismiss with close button', () => {
    const div = document.createElement('div');
    div.className = 'modal';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-close';
    div.appendChild(closeBtn);
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result!.canDismiss).toBe(true);
  });

  test('detects canDismiss with data-dismiss attribute', () => {
    const div = document.createElement('div');
    div.className = 'modal';
    div.setAttribute('data-dismiss', 'modal');
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result!.canDismiss).toBe(true);
  });

  test('detects triggeredBy from aria-controls', () => {
    const div = document.createElement('div');
    div.className = 'modal';
    div.setAttribute('aria-controls', 'trigger-btn');
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result!.triggeredBy).toBe('#trigger-btn');
  });
});

describe('Phase 4: getStackingInfo', () => {
  const evaluator = createEvaluator<{
    zIndex: string;
    stackingContext: unknown[];
  }>(getStackingInfoCode, 'getStackingInfo');

  test('returns z-index auto or empty for default element', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    // happy-dom returns '' for auto z-index, real browsers return 'auto'
    expect(['auto', '']).toContain(result.zIndex);
  });

  test('returns numeric z-index when set', () => {
    const div = document.createElement('div');
    div.style.position = 'relative';
    div.style.zIndex = '100';
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result.zIndex).toBe('100');
  });

  test('returns stackingContext array', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(Array.isArray(result.stackingContext)).toBe(true);
  });
});

describe('Phase 4: getScrollInfo', () => {
  const evaluator = createEvaluator<{
    isScrollable: boolean;
    scrollTop: number;
    scrollLeft: number;
    scrollHeight: number;
    scrollWidth: number;
    isInViewport: boolean;
    visiblePercentage: number;
  }>(getScrollInfoCode, 'getScrollInfo');

  test('detects scrollable element with overflow auto', () => {
    const div = document.createElement('div');
    div.style.overflow = 'auto';
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result.isScrollable).toBe(true);
  });

  test('detects scrollable element with overflow scroll', () => {
    const div = document.createElement('div');
    div.style.overflow = 'scroll';
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result.isScrollable).toBe(true);
  });

  test('detects scrollable with overflowX auto', () => {
    const div = document.createElement('div');
    div.style.overflowX = 'auto';
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result.isScrollable).toBe(true);
  });

  test('detects scrollable with overflowY scroll', () => {
    const div = document.createElement('div');
    div.style.overflowY = 'scroll';
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result.isScrollable).toBe(true);
  });

  test('non-scrollable element', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(result.isScrollable).toBe(false);
  });

  test('returns scroll position values', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(typeof result.scrollTop).toBe('number');
    expect(typeof result.scrollLeft).toBe('number');
    expect(typeof result.scrollHeight).toBe('number');
    expect(typeof result.scrollWidth).toBe('number');
  });

  test('returns viewport visibility info', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    const result = evaluator(div, window, document, window.ShadowRoot);
    expect(typeof result.isInViewport).toBe('boolean');
    expect(typeof result.visiblePercentage).toBe('number');
  });
});

describe('Phase 4: getShadowDOMInfo', () => {
  const evaluator = createEvaluator<{
    isInShadowDOM: boolean;
    shadowHost?: string;
    shadowRootMode?: string;
    hasShadowRoot: boolean;
    shadowChildCount?: number;
  } | null>(getShadowDOMInfoCode, 'getShadowDOMInfo');

  test('returns null for regular element without shadow DOM', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    expect(evaluator(div, window, document, window.ShadowRoot)).toBeNull();
  });

  test('detects element with open shadow root', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    // Attach shadow root
    const shadowRoot = div.attachShadow({ mode: 'open' });
    const shadowChild = document.createElement('span');
    shadowRoot.appendChild(shadowChild);

    const result = evaluator(div, window, document, window.ShadowRoot);

    expect(result).not.toBeNull();
    expect(result!.hasShadowRoot).toBe(true);
    expect(result!.shadowRootMode).toBe('open');
    expect(result!.shadowChildCount).toBe(1);
  });

  test('detects element with multiple shadow children', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    const shadowRoot = div.attachShadow({ mode: 'open' });
    shadowRoot.appendChild(document.createElement('span'));
    shadowRoot.appendChild(document.createElement('div'));
    shadowRoot.appendChild(document.createElement('p'));

    const result = evaluator(div, window, document, window.ShadowRoot);

    expect(result).not.toBeNull();
    expect(result!.shadowChildCount).toBe(3);
  });
});
