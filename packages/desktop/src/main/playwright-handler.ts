/**
 * Playwright-powered Bridge Handler for Desktop App
 *
 * Implements the BridgeHandler interface using Playwright for real browser automation.
 * This replaces the JavaScript injection approach with true browser control.
 *
 * Uses a mutex to prevent race conditions when multiple MCP tool calls come in
 * simultaneously, ensuring adapter operations are serialized.
 */

import type { BrowserView } from 'electron';
import type {
  BridgeHandler,
  BridgeState,
  ConsoleMessage as CoreConsoleMessage,
  ElementInfo,
  ClickOptions,
  TypeOptions,
  WaitForOptions,
} from '@claude-lens/core';
import { Mutex } from 'async-mutex';
import { PlaywrightAdapter } from './playwright-adapter.js';

// Local console message type (from main process)
interface LocalConsoleMessage {
  level: string;
  message: string;
  timestamp: number;
}

// Extended BridgeHandler with Playwright-specific methods
export interface PlaywrightBridgeHandler extends BridgeHandler {
  // Playwright-specific extensions
  fill(selector: string, value: string): Promise<void>;
  selectOption(selector: string, values: string | string[]): Promise<string[]>;
  hover(selector: string): Promise<void>;
  pressKey(key: string): Promise<void>;
  dragAndDrop(source: string, target: string): Promise<void>;
  scroll(options: { selector?: string; direction?: string; distance?: number }): Promise<void>;
  waitForResponse(urlPattern: string): Promise<{ url: string; status: number }>;
  getText(selector: string): Promise<string>;
  getAttribute(selector: string, name: string): Promise<string | null>;
  isVisible(selector: string): Promise<boolean>;
  isEnabled(selector: string): Promise<boolean>;
  isChecked(selector: string): Promise<boolean>;
  evaluate(script: string): Promise<unknown>;
  getAccessibilitySnapshot(): Promise<string>;
  goBack(): Promise<void>;
  goForward(): Promise<void>;
  // Dialog handling
  setDialogHandler(action: 'accept' | 'dismiss'): void;
  // Viewport control
  setViewport(width: number): void | Promise<void>;
  // Server control
  restartServer(): Promise<{ success: boolean; error?: string }>;
}

/**
 * Shared JavaScript helpers for element inspection.
 * These run in the browser context via page.evaluate().
 * Extracted to avoid code duplication between inspectElement and inspectElementAtPoint.
 */
const ELEMENT_INSPECTION_HELPERS = `
  // Check if element is in a loading state
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

  // Get form field state
  function getFormState(element) {
    const tag = element.tagName.toLowerCase();
    if (!['input', 'select', 'textarea'].includes(tag)) return null;

    const formState = {
      type: element.type || tag,
      value: element.value || '',
      placeholder: element.placeholder || undefined,
      required: element.required || false,
      disabled: element.disabled || false,
      readOnly: element.readOnly || false,
      validationState: null,
      validationMessage: undefined,
    };

    if (element.validity) {
      if (element.validity.valid) {
        formState.validationState = 'valid';
      } else if (element.validationMessage) {
        formState.validationState = 'invalid';
        formState.validationMessage = element.validationMessage;
      }
    }

    if (element.type === 'checkbox' || element.type === 'radio') {
      formState.checked = element.checked;
    }

    if (tag === 'select') {
      formState.selectedIndex = element.selectedIndex;
      formState.options = Array.from(element.options).slice(0, 10).map(o => o.text);
    }

    return formState;
  }

  // Semantic element descriptions mapping
  const semanticMap = {
    'nav': 'Navigation', 'header': 'Header', 'footer': 'Footer',
    'main': 'Main content', 'aside': 'Sidebar', 'article': 'Article',
    'section': 'Section', 'form': 'Form', 'button': 'Button', 'a': 'Link',
    'ul': 'List', 'ol': 'Numbered list', 'table': 'Table',
    'thead': 'Table header', 'tbody': 'Table body', 'tr': 'Table row',
    'td': 'Table cell', 'th': 'Header cell', 'input': 'Input field',
    'select': 'Dropdown', 'textarea': 'Text area', 'dialog': 'Dialog',
    'menu': 'Menu', 'img': 'Image', 'video': 'Video', 'audio': 'Audio',
  };

  // Role-based descriptions mapping
  const roleMap = {
    'navigation': 'Navigation', 'banner': 'Header banner',
    'contentinfo': 'Footer info', 'main': 'Main content',
    'complementary': 'Sidebar', 'dialog': 'Dialog',
    'alertdialog': 'Alert dialog', 'menu': 'Menu', 'menubar': 'Menu bar',
    'menuitem': 'Menu item', 'tab': 'Tab', 'tabpanel': 'Tab panel',
    'tablist': 'Tab list', 'listbox': 'Dropdown list', 'option': 'Option',
    'grid': 'Grid', 'row': 'Row', 'cell': 'Cell', 'button': 'Button',
    'link': 'Link', 'search': 'Search', 'form': 'Form',
  };

  // Generate human-readable description for an element
  function describeElement(element) {
    const tag = element.tagName.toLowerCase();
    const loading = isLoadingState(element);
    const role = element.getAttribute('role');
    const ariaLabel = element.getAttribute('aria-label');
    const dataTestId = element.getAttribute('data-testid');

    let label = '';
    if (ariaLabel) {
      label = ariaLabel;
    } else if (element.textContent && element.textContent.trim().length < 30) {
      label = element.textContent.trim().split('\\n')[0];
    }

    let description = '';
    if (role && roleMap[role]) {
      description = roleMap[role];
    } else if (semanticMap[tag]) {
      description = semanticMap[tag];
    } else if (tag === 'div' || tag === 'span') {
      const classes = Array.from(element.classList);
      const inferredRole = classes.find(c =>
        /nav|header|footer|sidebar|modal|dropdown|menu|card|panel|container|wrapper|content|body/i.test(c)
      );
      if (inferredRole) {
        description = inferredRole.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
        description = description.charAt(0).toUpperCase() + description.slice(1).toLowerCase();
      } else {
        description = 'Container';
      }
    } else {
      description = tag;
    }

    if (label && label !== description) {
      description = description + ': "' + label.substring(0, 25) + (label.length > 25 ? '...' : '') + '"';
    } else if (element.id) {
      description = description + ' (#' + element.id + ')';
    } else if (dataTestId) {
      description = description + ' [' + dataTestId + ']';
    }

    if (loading) {
      description = 'Loading: ' + description;
    }

    return description;
  }

  // Build unique selector for an element
  function buildSelector(element) {
    if (element.id) return '#' + element.id;

    let selector = element.tagName.toLowerCase();
    if (element.classList.length > 0) {
      selector += '.' + Array.from(element.classList).slice(0, 2).join('.');
    }

    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(s => s.tagName === element.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(element) + 1;
        selector += ':nth-of-type(' + index + ')';
      }
    }

    return selector;
  }

  // Build parent chain (up to 6 levels)
  function buildParentChain(element, maxDepth = 6) {
    const chain = [];
    let current = element.parentElement;
    let depth = 0;

    while (current && current !== document.body && depth < maxDepth) {
      chain.push({
        tagName: current.tagName.toLowerCase(),
        selector: buildSelector(current),
        description: describeElement(current),
      });
      current = current.parentElement;
      depth++;
    }

    return chain;
  }

  // Get computed styles object
  function getComputedStylesObject(element) {
    const styles = window.getComputedStyle(element);
    return {
      display: styles.display,
      position: styles.position,
      width: styles.width,
      height: styles.height,
      margin: styles.margin,
      padding: styles.padding,
      color: styles.color,
      backgroundColor: styles.backgroundColor,
      fontSize: styles.fontSize,
      fontFamily: styles.fontFamily,
    };
  }

  // Build base element info object
  function buildBaseElementInfo(el, selectorOverride) {
    const rect = el.getBoundingClientRect();
    const parent = el.parentElement;
    const siblingCount = parent ? parent.children.length - 1 : 0;

    return {
      tagName: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classes: Array.from(el.classList),
      selector: selectorOverride || buildSelector(el),
      xpath: '',
      attributes: Object.fromEntries(Array.from(el.attributes).map(a => [a.name, a.value])),
      computedStyles: getComputedStylesObject(el),
      boundingBox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      parentChain: buildParentChain(el),
      siblingCount: siblingCount,
      childCount: el.childElementCount,
      description: describeElement(el),
      formState: getFormState(el),
      isLoading: isLoadingState(el),
    };
  }
`;

/**
 * Phase 4 helpers for edge case detection.
 * These also run in the browser context via page.evaluate().
 */
const PHASE4_EDGE_CASE_HELPERS = `
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
`;

export function createPlaywrightBridgeHandler(
  getBrowserView: () => BrowserView | null,
  getConsoleBuffer: () => LocalConsoleMessage[],
  getPlaywrightAdapter: () => PlaywrightAdapter | null,
  onSetViewport?: (width: number) => void,
  onRestartServer?: () => Promise<{ success: boolean; error?: string }>
): PlaywrightBridgeHandler {
  // Track dialog handling preference
  let dialogAction: 'accept' | 'dismiss' = 'dismiss';

  // Mutex to prevent race conditions in concurrent MCP tool calls
  // This ensures adapter operations are serialized, preventing issues
  // where one call might invalidate the connection mid-operation
  const adapterMutex = new Mutex();

  // Convert local console message to core format
  const toCoreLogs = (buffer: LocalConsoleMessage[]): CoreConsoleMessage[] => {
    return buffer.map((m) => ({
      level: m.level as CoreConsoleMessage['level'],
      text: m.message,
      timestamp: m.timestamp,
      source: 'browser',
    }));
  };

  // Helper to get adapter or throw
  const getAdapter = (): PlaywrightAdapter => {
    const adapter = getPlaywrightAdapter();
    if (!adapter) {
      throw new Error('Playwright adapter not initialized');
    }
    return adapter;
  };

  /**
   * Execute an adapter operation with mutex protection.
   * This prevents race conditions when multiple MCP tools are called concurrently.
   */
  const withAdapter = async <T>(
    operation: (adapter: PlaywrightAdapter) => Promise<T>
  ): Promise<T> => {
    return adapterMutex.runExclusive(async () => {
      const adapter = getAdapter();
      await adapter.ensureConnected();
      return operation(adapter);
    });
  };

  // Helper to inject highlight overlay (still uses executeJS for visual feedback)
  const injectHighlight = async (
    browserView: BrowserView,
    selector: string,
    color: string,
    duration: number
  ): Promise<void> => {
    await browserView.webContents.executeJavaScript(`
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return;

        document.querySelectorAll('.claude-lens-highlight').forEach(h => h.remove());

        const rect = el.getBoundingClientRect();
        const highlight = document.createElement('div');
        highlight.className = 'claude-lens-highlight';
        highlight.style.cssText = \`
          position: fixed;
          left: \${rect.left}px;
          top: \${rect.top}px;
          width: \${rect.width}px;
          height: \${rect.height}px;
          border: 2px solid ${color};
          background: ${color}33;
          pointer-events: none;
          z-index: 999999;
          transition: opacity 0.3s;
        \`;
        document.body.appendChild(highlight);

        if (${duration} > 0) {
          setTimeout(() => {
            highlight.style.opacity = '0';
            setTimeout(() => highlight.remove(), 300);
          }, ${duration});
        }
      })()
    `);
  };

  return {
    // Core BridgeHandler methods

    getState(): BridgeState {
      const view = getBrowserView();
      const buffer = getConsoleBuffer();
      const adapter = getPlaywrightAdapter();

      return {
        connected: !!view && (adapter?.isConnected() ?? false),
        currentUrl: view?.webContents.getURL() || '',
        lastInspectedElement: null,
        consoleLogs: toCoreLogs(buffer),
      };
    },

    async navigate(url: string): Promise<{ success: boolean; error?: string }> {
      try {
        await withAdapter(async (adapter) => {
          await adapter.goto(url, { waitUntil: 'domcontentloaded' });
        });
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },

    async inspectElement(selector?: string): Promise<ElementInfo | null> {
      const view = getBrowserView();
      if (!view) return null;

      try {
        const adapter = getAdapter();
        const page = await adapter.ensureConnected();

        // Use shared helpers to avoid code duplication
        const selectorArg = selector ? JSON.stringify(selector) : 'null';
        const script = `
          (function() {
            ${ELEMENT_INSPECTION_HELPERS}

            const sel = ${selectorArg};
            const el = sel
              ? document.querySelector(sel)
              : window.__claudeLensLastElement;
            if (!el) return null;

            return buildBaseElementInfo(el, sel);
          })()
        `;

        const result = await page.evaluate(script);
        return result as ElementInfo | null;
      } catch (error) {
        console.debug('[PlaywrightHandler] inspectElement failed:', {
          selector,
          error: error instanceof Error ? error.message : error,
        });
        return null;
      }
    },

    async inspectElementAtPoint(x: number, y: number): Promise<ElementInfo | null> {
      const view = getBrowserView();
      if (!view) return null;

      try {
        const adapter = getAdapter();
        const page = await adapter.ensureConnected();

        // Use shared helpers to avoid code duplication
        // inspectElementAtPoint includes Phase 4 edge case detection
        const script = `
          (function() {
            ${ELEMENT_INSPECTION_HELPERS}
            ${PHASE4_EDGE_CASE_HELPERS}

            const px = ${x};
            const py = ${y};
            const el = document.elementFromPoint(px, py);
            if (!el) return null;

            // Store for later reference
            window.__claudeLensLastElement = el;

            // Build base info and add Phase 4 edge case info
            const info = buildBaseElementInfo(el, null);
            info.overlay = getOverlayInfo(el);
            info.stacking = getStackingInfo(el);
            info.iframe = getIframeInfo();
            info.shadowDOM = getShadowDOMInfo(el);
            info.scroll = getScrollInfo(el);

            return info;
          })()
        `;

        const result = await page.evaluate(script);
        return result as ElementInfo | null;
      } catch (error) {
        console.debug('[PlaywrightHandler] inspectElementAtPoint failed:', {
          x,
          y,
          error: error instanceof Error ? error.message : error,
        });
        return null;
      }
    },

    async highlight(selector: string, options?: { color?: string; duration?: number }): Promise<void> {
      const view = getBrowserView();
      if (!view) return;

      const color = options?.color || '#3b82f6';
      const duration = options?.duration ?? 3000;

      // Use JS injection for visual highlight (Playwright doesn't have built-in highlight)
      await injectHighlight(view, selector, color, duration);
    },

    async clearHighlights(): Promise<void> {
      const view = getBrowserView();
      if (!view) return;

      await view.webContents.executeJavaScript(`
        document.querySelectorAll('.claude-lens-highlight').forEach(el => el.remove());
      `);
    },

    async screenshot(selector?: string): Promise<string> {
      const adapter = getAdapter();
      const buffer = await adapter.screenshot({ selector });
      return buffer.toString('base64');
    },

    async getConsoleLogs(level?: string, limit?: number): Promise<CoreConsoleMessage[]> {
      const buffer = getConsoleBuffer();
      let logs = [...buffer];

      if (level && level !== 'all') {
        logs = logs.filter((m) => m.level === level);
      }

      return toCoreLogs(logs.slice(-(limit || 20)));
    },

    async reload(): Promise<void> {
      const adapter = getAdapter();
      await adapter.reload({ waitUntil: 'domcontentloaded' });
    },

    async click(selector: string, options?: ClickOptions): Promise<void> {
      await withAdapter(async (adapter) => {
        await adapter.click(selector, {
          button: options?.button,
          clickCount: options?.clickCount,
          delay: options?.delay,
        });
      });
    },

    async type(selector: string, text: string, options?: TypeOptions): Promise<void> {
      await withAdapter(async (adapter) => {
        if (options?.clearFirst) {
          // Use fill to clear and type (Playwright's fill clears first)
          await adapter.fill(selector, text);
        } else {
          // Use pressSequentially for typing without clearing
          await adapter.type(selector, text, { delay: options?.delay });
        }
      });
    },

    async waitFor(selector: string, options?: WaitForOptions): Promise<ElementInfo> {
      return withAdapter(async (adapter) => {
        const page = await adapter.ensureConnected();

        await page.waitForSelector(selector, {
          state: options?.visible ? 'visible' : 'attached',
          timeout: options?.timeout ?? 5000,
        });

        // Now get element info (call without mutex since we're already in one)
        const view = getBrowserView();
        if (!view) throw new Error('Browser view not available');

        const script = `
          (function() {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return {
              tagName: el.tagName.toLowerCase(),
              selector: ${JSON.stringify(selector)},
              boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            };
          })()
        `;
        const info = await page.evaluate(script);
        if (!info) {
          throw new Error(`Element found but info could not be retrieved: ${selector}`);
        }
        return info as ElementInfo;
      });
    },

    // Playwright-specific extensions

    async fill(selector: string, value: string): Promise<void> {
      await withAdapter(async (adapter) => {
        await adapter.fill(selector, value);
      });
    },

    async selectOption(selector: string, values: string | string[]): Promise<string[]> {
      return withAdapter(async (adapter) => {
        return adapter.selectOption(selector, values);
      });
    },

    async hover(selector: string): Promise<void> {
      await withAdapter(async (adapter) => {
        await adapter.hover(selector);
      });
    },

    async pressKey(key: string): Promise<void> {
      await withAdapter(async (adapter) => {
        await adapter.pressKey(key);
      });
    },

    async dragAndDrop(source: string, target: string): Promise<void> {
      await withAdapter(async (adapter) => {
        await adapter.dragAndDrop(source, target);
      });
    },

    async scroll(options: { selector?: string; direction?: string; distance?: number }): Promise<void> {
      await withAdapter(async (adapter) => {
        await adapter.scroll({
          selector: options.selector,
          direction: options.direction as 'up' | 'down' | 'left' | 'right' | undefined,
          distance: options.distance,
        });
      });
    },

    async waitForResponse(urlPattern: string): Promise<{ url: string; status: number }> {
      return withAdapter(async (adapter) => {
        const result = await adapter.waitForResponse(urlPattern);
        return { url: result.url, status: result.status };
      });
    },

    async getText(selector: string): Promise<string> {
      return withAdapter(async (adapter) => {
        return adapter.getText(selector);
      });
    },

    async getAttribute(selector: string, name: string): Promise<string | null> {
      return withAdapter(async (adapter) => {
        return adapter.getAttribute(selector, name);
      });
    },

    async isVisible(selector: string): Promise<boolean> {
      return withAdapter(async (adapter) => {
        return adapter.isVisible(selector);
      });
    },

    async isEnabled(selector: string): Promise<boolean> {
      return withAdapter(async (adapter) => {
        return adapter.isEnabled(selector);
      });
    },

    async isChecked(selector: string): Promise<boolean> {
      return withAdapter(async (adapter) => {
        return adapter.isChecked(selector);
      });
    },

    async evaluate(script: string): Promise<unknown> {
      return withAdapter(async (adapter) => {
        return adapter.evaluate(script);
      });
    },

    async getAccessibilitySnapshot(): Promise<string> {
      return withAdapter(async (adapter) => {
        return adapter.getAccessibilitySnapshot();
      });
    },

    async goBack(): Promise<void> {
      await withAdapter(async (adapter) => {
        await adapter.goBack();
      });
    },

    async goForward(): Promise<void> {
      await withAdapter(async (adapter) => {
        await adapter.goForward();
      });
    },

    setDialogHandler(action: 'accept' | 'dismiss'): void {
      dialogAction = action;
      const adapter = getPlaywrightAdapter();
      if (adapter) {
        adapter.onDialog(async (dialog) => {
          if (dialogAction === 'accept') {
            await dialog.accept();
          } else {
            await dialog.dismiss();
          }
        });
      }
    },

    async setViewport(width: number): Promise<void> {
      if (onSetViewport) {
        onSetViewport(width);
        // Wait for bounds update to complete and Playwright to stabilize
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    },

    async restartServer(): Promise<{ success: boolean; error?: string }> {
      if (onRestartServer) {
        return await onRestartServer();
      }
      return { success: false, error: 'restartServer not configured' };
    },
  };
}
