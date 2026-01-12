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
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { PlaywrightAdapter } from './playwright-adapter.js';

// Cached helper scripts loaded from external files
let elementInspectionHelpers: string | null = null;
let edgeCaseHelpers: string | null = null;

async function loadElementInspectionHelpers(): Promise<string> {
  if (elementInspectionHelpers) return elementInspectionHelpers;
  const scriptPath = path.join(__dirname, 'inject', 'element-inspection-helpers.js');
  elementInspectionHelpers = await fsPromises.readFile(scriptPath, 'utf-8');
  return elementInspectionHelpers;
}

async function loadEdgeCaseHelpers(): Promise<string> {
  if (edgeCaseHelpers) return edgeCaseHelpers;
  const scriptPath = path.join(__dirname, 'inject', 'edge-case-helpers.js');
  edgeCaseHelpers = await fsPromises.readFile(scriptPath, 'utf-8');
  return edgeCaseHelpers;
}

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

        // Load helpers from external files
        const helpers = await loadElementInspectionHelpers();
        const selectorArg = selector ? JSON.stringify(selector) : 'null';
        const script = `
          (function() {
            ${helpers}

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

        // Load helpers from external files
        const [inspectionHelpers, edgeCaseHelperScript] = await Promise.all([
          loadElementInspectionHelpers(),
          loadEdgeCaseHelpers(),
        ]);
        const script = `
          (function() {
            ${inspectionHelpers}
            ${edgeCaseHelperScript}

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
