/**
 * Playwright-powered Bridge Handler for Desktop App
 *
 * Implements the BridgeHandler interface using Playwright for real browser automation.
 * This replaces the JavaScript injection approach with true browser control.
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
}

export function createPlaywrightBridgeHandler(
  getBrowserView: () => BrowserView | null,
  getConsoleBuffer: () => LocalConsoleMessage[],
  getPlaywrightAdapter: () => PlaywrightAdapter | null
): PlaywrightBridgeHandler {
  // Track dialog handling preference
  let dialogAction: 'accept' | 'dismiss' = 'dismiss';

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
        const adapter = getAdapter();
        await adapter.goto(url, { waitUntil: 'domcontentloaded' });
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

        // Use string-based evaluate to avoid TypeScript DOM type issues
        const selectorArg = selector ? JSON.stringify(selector) : 'null';
        const script = `
          (function() {
            const sel = ${selectorArg};
            const el = sel
              ? document.querySelector(sel)
              : window.__claudeLensLastElement;
            if (!el) return null;

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

              // Check validation state
              if (element.validity) {
                if (element.validity.valid) {
                  formState.validationState = 'valid';
                } else if (element.validationMessage) {
                  formState.validationState = 'invalid';
                  formState.validationMessage = element.validationMessage;
                }
              }

              // Checkbox/radio specific
              if (element.type === 'checkbox' || element.type === 'radio') {
                formState.checked = element.checked;
              }

              // Select specific
              if (tag === 'select') {
                formState.selectedIndex = element.selectedIndex;
                formState.options = Array.from(element.options).slice(0, 10).map(o => o.text);
              }

              return formState;
            }

            // Helper to generate human-readable description for an element
            function describeElement(element) {
              const tag = element.tagName.toLowerCase();

              // Check for loading state first
              const loading = isLoadingState(element);

              // Check for common semantic roles/landmarks
              const role = element.getAttribute('role');
              const ariaLabel = element.getAttribute('aria-label');
              const dataTestId = element.getAttribute('data-testid');

              // Try to get a meaningful label
              let label = '';
              if (ariaLabel) {
                label = ariaLabel;
              } else if (element.textContent && element.textContent.trim().length < 30) {
                label = element.textContent.trim().split('\\n')[0];
              }

              // Semantic element descriptions
              const semanticMap = {
                'nav': 'Navigation',
                'header': 'Header',
                'footer': 'Footer',
                'main': 'Main content',
                'aside': 'Sidebar',
                'article': 'Article',
                'section': 'Section',
                'form': 'Form',
                'button': 'Button',
                'a': 'Link',
                'ul': 'List',
                'ol': 'Numbered list',
                'table': 'Table',
                'thead': 'Table header',
                'tbody': 'Table body',
                'tr': 'Table row',
                'td': 'Table cell',
                'th': 'Header cell',
                'input': 'Input field',
                'select': 'Dropdown',
                'textarea': 'Text area',
                'dialog': 'Dialog',
                'menu': 'Menu',
                'img': 'Image',
                'video': 'Video',
                'audio': 'Audio',
              };

              // Role-based descriptions
              const roleMap = {
                'navigation': 'Navigation',
                'banner': 'Header banner',
                'contentinfo': 'Footer info',
                'main': 'Main content',
                'complementary': 'Sidebar',
                'dialog': 'Dialog',
                'alertdialog': 'Alert dialog',
                'menu': 'Menu',
                'menubar': 'Menu bar',
                'menuitem': 'Menu item',
                'tab': 'Tab',
                'tabpanel': 'Tab panel',
                'tablist': 'Tab list',
                'listbox': 'Dropdown list',
                'option': 'Option',
                'grid': 'Grid',
                'row': 'Row',
                'cell': 'Cell',
                'button': 'Button',
                'link': 'Link',
                'search': 'Search',
                'form': 'Form',
              };

              let description = '';

              // Priority: role > semantic tag > generic
              if (role && roleMap[role]) {
                description = roleMap[role];
              } else if (semanticMap[tag]) {
                description = semanticMap[tag];
              } else if (tag === 'div' || tag === 'span') {
                // For generic containers, try to infer from classes
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

              // Add label/name if available
              if (label && label !== description) {
                description = description + ': "' + label.substring(0, 25) + (label.length > 25 ? '...' : '') + '"';
              } else if (element.id) {
                description = description + ' (#' + element.id + ')';
              } else if (dataTestId) {
                description = description + ' [' + dataTestId + ']';
              }

              // Prefix with Loading: if in loading state
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

              // Add nth-child if needed for uniqueness
              const parent = element.parentElement;
              if (parent) {
                const siblings = Array.from(parent.children).filter(
                  s => s.tagName === element.tagName
                );
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

            const rect = el.getBoundingClientRect();
            const styles = window.getComputedStyle(el);
            const parent = el.parentElement;
            const siblingCount = parent ? parent.children.length - 1 : 0;

            return {
              tagName: el.tagName.toLowerCase(),
              id: el.id || undefined,
              classes: Array.from(el.classList),
              selector: sel || buildSelector(el),
              xpath: '',
              attributes: Object.fromEntries(Array.from(el.attributes).map(a => [a.name, a.value])),
              computedStyles: {
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
              },
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
          })()
        `;

        const result = await page.evaluate(script);
        return result as ElementInfo | null;
      } catch {
        return null;
      }
    },

    async inspectElementAtPoint(x: number, y: number): Promise<ElementInfo | null> {
      const view = getBrowserView();
      if (!view) return null;

      try {
        const adapter = getAdapter();
        const page = await adapter.ensureConnected();

        // Use string-based evaluate to avoid TypeScript DOM type issues
        const script = `
          (function() {
            const px = ${x};
            const py = ${y};
            const el = document.elementFromPoint(px, py);
            if (!el) return null;

            // Store for later reference
            window.__claudeLensLastElement = el;

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

              // Check validation state
              if (element.validity) {
                if (element.validity.valid) {
                  formState.validationState = 'valid';
                } else if (element.validationMessage) {
                  formState.validationState = 'invalid';
                  formState.validationMessage = element.validationMessage;
                }
              }

              // Checkbox/radio specific
              if (element.type === 'checkbox' || element.type === 'radio') {
                formState.checked = element.checked;
              }

              // Select specific
              if (tag === 'select') {
                formState.selectedIndex = element.selectedIndex;
                formState.options = Array.from(element.options).slice(0, 10).map(o => o.text);
              }

              return formState;
            }

            // Helper to generate human-readable description for an element
            function describeElement(element) {
              const tag = element.tagName.toLowerCase();

              // Check for loading state first
              const loading = isLoadingState(element);

              // Check for common semantic roles/landmarks
              const role = element.getAttribute('role');
              const ariaLabel = element.getAttribute('aria-label');
              const dataTestId = element.getAttribute('data-testid');

              // Try to get a meaningful label
              let label = '';
              if (ariaLabel) {
                label = ariaLabel;
              } else if (element.textContent && element.textContent.trim().length < 30) {
                label = element.textContent.trim().split('\\n')[0];
              }

              // Semantic element descriptions
              const semanticMap = {
                'nav': 'Navigation',
                'header': 'Header',
                'footer': 'Footer',
                'main': 'Main content',
                'aside': 'Sidebar',
                'article': 'Article',
                'section': 'Section',
                'form': 'Form',
                'button': 'Button',
                'a': 'Link',
                'ul': 'List',
                'ol': 'Numbered list',
                'table': 'Table',
                'thead': 'Table header',
                'tbody': 'Table body',
                'tr': 'Table row',
                'td': 'Table cell',
                'th': 'Header cell',
                'input': 'Input field',
                'select': 'Dropdown',
                'textarea': 'Text area',
                'dialog': 'Dialog',
                'menu': 'Menu',
                'img': 'Image',
                'video': 'Video',
                'audio': 'Audio',
              };

              // Role-based descriptions
              const roleMap = {
                'navigation': 'Navigation',
                'banner': 'Header banner',
                'contentinfo': 'Footer info',
                'main': 'Main content',
                'complementary': 'Sidebar',
                'dialog': 'Dialog',
                'alertdialog': 'Alert dialog',
                'menu': 'Menu',
                'menubar': 'Menu bar',
                'menuitem': 'Menu item',
                'tab': 'Tab',
                'tabpanel': 'Tab panel',
                'tablist': 'Tab list',
                'listbox': 'Dropdown list',
                'option': 'Option',
                'grid': 'Grid',
                'row': 'Row',
                'cell': 'Cell',
                'button': 'Button',
                'link': 'Link',
                'search': 'Search',
                'form': 'Form',
              };

              let description = '';

              // Priority: role > semantic tag > generic
              if (role && roleMap[role]) {
                description = roleMap[role];
              } else if (semanticMap[tag]) {
                description = semanticMap[tag];
              } else if (tag === 'div' || tag === 'span') {
                // For generic containers, try to infer from classes
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

              // Add label/name if available
              if (label && label !== description) {
                description = description + ': "' + label.substring(0, 25) + (label.length > 25 ? '...' : '') + '"';
              } else if (element.id) {
                description = description + ' (#' + element.id + ')';
              } else if (dataTestId) {
                description = description + ' [' + dataTestId + ']';
              }

              // Prefix with Loading: if in loading state
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

              // Add nth-child if needed for uniqueness
              const parent = element.parentElement;
              if (parent) {
                const siblings = Array.from(parent.children).filter(
                  s => s.tagName === element.tagName
                );
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

            // Phase 4: Detect overlay/modal context
            function getOverlayInfo(element) {
              const role = element.getAttribute('role');
              const classes = Array.from(element.classList).join(' ').toLowerCase();
              const styles = window.getComputedStyle(element);

              // Check for modal/dialog
              const isDialog = role === 'dialog' || role === 'alertdialog' || element.tagName === 'DIALOG';
              const isModal = classes.includes('modal') || element.hasAttribute('aria-modal');
              const isDrawer = classes.includes('drawer') || classes.includes('sidebar') || classes.includes('panel');
              const isPopover = classes.includes('popover') || role === 'tooltip';
              const isTooltip = classes.includes('tooltip') || role === 'tooltip';
              const isDropdown = classes.includes('dropdown') || role === 'menu' || role === 'listbox';

              // Check for backdrop
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

              // Try to find trigger element
              const ariaControls = element.getAttribute('aria-controls');
              const triggeredBy = ariaControls ? '#' + ariaControls : undefined;

              // Check if dismissible
              const canDismiss = element.querySelector('[data-dismiss], .close, .btn-close') !== null ||
                element.hasAttribute('data-dismiss') || isTooltip || isPopover;

              return {
                type: overlayType,
                isBackdrop: isBackdrop,
                triggeredBy: triggeredBy,
                canDismiss: canDismiss
              };
            }

            // Phase 4: Get z-index stacking context
            function getStackingInfo(element) {
              const styles = window.getComputedStyle(element);
              const zIndex = styles.zIndex;

              // Get elements at this point (stacking order)
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

              return {
                zIndex: zIndex === 'auto' ? 'auto' : zIndex,
                stackingContext: stackingContext
              };
            }

            // Phase 4: Detect iframe context
            function getIframeInfo() {
              // Check if we're inside an iframe
              const isInIframe = window !== window.top;

              if (!isInIframe) {
                return null;
              }

              try {
                const frameElement = window.frameElement;
                return {
                  src: frameElement ? frameElement.getAttribute('src') : undefined,
                  name: frameElement ? frameElement.getAttribute('name') : undefined,
                  sandboxed: frameElement ? frameElement.hasAttribute('sandbox') : false,
                  crossOrigin: false // Same origin if we can access this
                };
              } catch (e) {
                // Cross-origin iframe - limited access
                return {
                  crossOrigin: true,
                  sandboxed: false
                };
              }
            }

            // Phase 4: Detect shadow DOM context
            function getShadowDOMInfo(element) {
              // Check if element has a shadow root
              const hasShadowRoot = !!element.shadowRoot;
              let shadowChildCount = undefined;
              let shadowRootMode = undefined;

              if (hasShadowRoot) {
                shadowChildCount = element.shadowRoot.childElementCount;
                shadowRootMode = element.shadowRoot.mode;
              }

              // Check if element is inside a shadow DOM
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

              if (!hasShadowRoot && !isInShadowDOM) {
                return null;
              }

              return {
                isInShadowDOM: isInShadowDOM,
                shadowHost: shadowHost,
                shadowRootMode: shadowRootMode,
                hasShadowRoot: hasShadowRoot,
                shadowChildCount: shadowChildCount
              };
            }

            // Phase 4: Get scroll context
            function getScrollInfo(element) {
              const rect = element.getBoundingClientRect();
              const viewport = {
                width: window.innerWidth,
                height: window.innerHeight
              };

              // Check if element is scrollable
              const styles = window.getComputedStyle(element);
              const isScrollable = styles.overflow === 'scroll' || styles.overflow === 'auto' ||
                styles.overflowX === 'scroll' || styles.overflowX === 'auto' ||
                styles.overflowY === 'scroll' || styles.overflowY === 'auto';

              // Check if in viewport
              const isInViewport = rect.top < viewport.height && rect.bottom > 0 &&
                rect.left < viewport.width && rect.right > 0;

              // Calculate visible percentage
              let visiblePercentage = 0;
              if (isInViewport && rect.width > 0 && rect.height > 0) {
                const visibleWidth = Math.max(0, Math.min(rect.right, viewport.width) - Math.max(rect.left, 0));
                const visibleHeight = Math.max(0, Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0));
                const visibleArea = visibleWidth * visibleHeight;
                const totalArea = rect.width * rect.height;
                visiblePercentage = Math.round((visibleArea / totalArea) * 100);
              }

              return {
                isScrollable: isScrollable,
                scrollTop: Math.round(element.scrollTop),
                scrollLeft: Math.round(element.scrollLeft),
                scrollHeight: Math.round(element.scrollHeight),
                scrollWidth: Math.round(element.scrollWidth),
                isInViewport: isInViewport,
                visiblePercentage: visiblePercentage
              };
            }

            const rect = el.getBoundingClientRect();
            const styles = window.getComputedStyle(el);
            const parent = el.parentElement;
            const siblingCount = parent ? parent.children.length - 1 : 0;

            return {
              tagName: el.tagName.toLowerCase(),
              id: el.id || undefined,
              classes: Array.from(el.classList),
              selector: buildSelector(el),
              xpath: '',
              attributes: Object.fromEntries(Array.from(el.attributes).map(a => [a.name, a.value])),
              computedStyles: {
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
              },
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
              overlay: getOverlayInfo(el),
              stacking: getStackingInfo(el),
              iframe: getIframeInfo(),
              shadowDOM: getShadowDOMInfo(el),
              scroll: getScrollInfo(el),
            };
          })()
        `;

        const result = await page.evaluate(script);
        return result as ElementInfo | null;
      } catch {
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
      const adapter = getAdapter();
      await adapter.click(selector, {
        button: options?.button,
        clickCount: options?.clickCount,
        delay: options?.delay,
      });
    },

    async type(selector: string, text: string, options?: TypeOptions): Promise<void> {
      const adapter = getAdapter();

      if (options?.clearFirst) {
        // Use fill to clear and type (Playwright's fill clears first)
        await adapter.fill(selector, text);
      } else {
        // Use pressSequentially for typing without clearing
        await adapter.type(selector, text, { delay: options?.delay });
      }
    },

    async waitFor(selector: string, options?: WaitForOptions): Promise<ElementInfo> {
      const adapter = getAdapter();
      const page = await adapter.ensureConnected();

      await page.waitForSelector(selector, {
        state: options?.visible ? 'visible' : 'attached',
        timeout: options?.timeout ?? 5000,
      });

      // Now get element info
      const info = await this.inspectElement(selector);
      if (!info) {
        throw new Error(`Element found but info could not be retrieved: ${selector}`);
      }

      return info;
    },

    // Playwright-specific extensions

    async fill(selector: string, value: string): Promise<void> {
      const adapter = getAdapter();
      await adapter.fill(selector, value);
    },

    async selectOption(selector: string, values: string | string[]): Promise<string[]> {
      const adapter = getAdapter();
      return adapter.selectOption(selector, values);
    },

    async hover(selector: string): Promise<void> {
      const adapter = getAdapter();
      await adapter.hover(selector);
    },

    async pressKey(key: string): Promise<void> {
      const adapter = getAdapter();
      await adapter.pressKey(key);
    },

    async dragAndDrop(source: string, target: string): Promise<void> {
      const adapter = getAdapter();
      await adapter.dragAndDrop(source, target);
    },

    async scroll(options: { selector?: string; direction?: string; distance?: number }): Promise<void> {
      const adapter = getAdapter();
      await adapter.scroll({
        selector: options.selector,
        direction: options.direction as 'up' | 'down' | 'left' | 'right' | undefined,
        distance: options.distance,
      });
    },

    async waitForResponse(urlPattern: string): Promise<{ url: string; status: number }> {
      const adapter = getAdapter();
      const result = await adapter.waitForResponse(urlPattern);
      return { url: result.url, status: result.status };
    },

    async getText(selector: string): Promise<string> {
      const adapter = getAdapter();
      return adapter.getText(selector);
    },

    async getAttribute(selector: string, name: string): Promise<string | null> {
      const adapter = getAdapter();
      return adapter.getAttribute(selector, name);
    },

    async isVisible(selector: string): Promise<boolean> {
      const adapter = getAdapter();
      return adapter.isVisible(selector);
    },

    async isEnabled(selector: string): Promise<boolean> {
      const adapter = getAdapter();
      return adapter.isEnabled(selector);
    },

    async isChecked(selector: string): Promise<boolean> {
      const adapter = getAdapter();
      return adapter.isChecked(selector);
    },

    async evaluate(script: string): Promise<unknown> {
      const adapter = getAdapter();
      return adapter.evaluate(script);
    },

    async getAccessibilitySnapshot(): Promise<string> {
      const adapter = getAdapter();
      return adapter.getAccessibilitySnapshot();
    },

    async goBack(): Promise<void> {
      const adapter = getAdapter();
      await adapter.goBack();
    },

    async goForward(): Promise<void> {
      const adapter = getAdapter();
      await adapter.goForward();
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
  };
}
