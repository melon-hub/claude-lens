/**
 * Bridge Handler for Desktop App
 *
 * Implements the BridgeHandler interface so the MCP server
 * can communicate with our embedded BrowserView.
 */

import { BrowserView } from 'electron';
import type {
  BridgeHandler,
  BridgeState,
  ConsoleMessage as CoreConsoleMessage,
  ElementInfo,
  ClickOptions,
  TypeOptions,
  WaitForOptions,
} from '@claude-lens/core';

// Local console message type (from main process)
interface LocalConsoleMessage {
  level: string;
  message: string;
  timestamp: number;
}

export function createBridgeHandler(
  getBrowserView: () => BrowserView | null,
  getConsoleBuffer: () => LocalConsoleMessage[]
): BridgeHandler {
  // Convert local console message to core format
  const toCoreLogs = (buffer: LocalConsoleMessage[]): CoreConsoleMessage[] => {
    return buffer.map((m) => ({
      level: m.level as CoreConsoleMessage['level'],
      text: m.message,
      timestamp: m.timestamp,
      source: 'browser', // Default source since we don't have detailed info
    }));
  };

  return {
    getState(): BridgeState {
      const view = getBrowserView();
      const buffer = getConsoleBuffer();

      return {
        connected: !!view,
        currentUrl: view?.webContents.getURL() || '',
        lastInspectedElement: null,
        consoleLogs: toCoreLogs(buffer),
      };
    },

    async navigate(url: string): Promise<{ success: boolean; error?: string }> {
      const view = getBrowserView();
      if (!view) return { success: false, error: 'Browser not available' };

      try {
        await view.webContents.loadURL(url);
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },

    async inspectElement(selector?: string) {
      const view = getBrowserView();
      if (!view) return null;

      try {
        const result = await view.webContents.executeJavaScript(`
          (function() {
            const el = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : 'window.__claudeLensLastElement'};
            if (!el) return null;

            const rect = el.getBoundingClientRect();
            const styles = window.getComputedStyle(el);

            return {
              tagName: el.tagName.toLowerCase(),
              id: el.id || null,
              classes: Array.from(el.classList),
              selector: ${JSON.stringify(selector)} || '',
              attributes: Object.fromEntries(
                Array.from(el.attributes).map(a => [a.name, a.value])
              ),
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
              },
              boundingBox: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
            };
          })()
        `);
        return result;
      } catch {
        return null;
      }
    },

    async inspectElementAtPoint(x: number, y: number) {
      const view = getBrowserView();
      if (!view) return null;

      try {
        const result = await view.webContents.executeJavaScript(`
          (function() {
            const el = document.elementFromPoint(${x}, ${y});
            if (!el) return null;

            window.__claudeLensLastElement = el;

            const rect = el.getBoundingClientRect();
            const styles = window.getComputedStyle(el);

            return {
              tagName: el.tagName.toLowerCase(),
              id: el.id || null,
              classes: Array.from(el.classList),
              selector: '',
              attributes: Object.fromEntries(
                Array.from(el.attributes).map(a => [a.name, a.value])
              ),
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
              },
              boundingBox: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
            };
          })()
        `);
        return result;
      } catch {
        return null;
      }
    },

    async highlight(selector: string, options?: { color?: string; duration?: number }) {
      const view = getBrowserView();
      if (!view) return;

      const color = options?.color || '#3b82f6';
      const duration = options?.duration ?? 3000;

      await view.webContents.executeJavaScript(`
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return;

          // Remove existing highlights
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
    },

    async clearHighlights() {
      const view = getBrowserView();
      if (!view) return;

      await view.webContents.executeJavaScript(`
        document.querySelectorAll('.claude-lens-highlight').forEach(el => el.remove());
      `);
    },

    async screenshot(selector?: string): Promise<string> {
      const view = getBrowserView();
      if (!view) throw new Error('Browser not available');

      const image = await view.webContents.capturePage();
      return image.toPNG().toString('base64');
    },

    async getConsoleLogs(level?: string, limit?: number): Promise<CoreConsoleMessage[]> {
      const buffer = getConsoleBuffer();
      let logs = [...buffer];

      if (level && level !== 'all') {
        logs = logs.filter((m) => m.level === level);
      }

      return toCoreLogs(logs.slice(-(limit || 20)));
    },

    async reload() {
      const view = getBrowserView();
      if (!view) return;

      view.webContents.reload();
    },

    async click(selector: string, options?: ClickOptions): Promise<void> {
      const view = getBrowserView();
      if (!view) throw new Error('Browser not available');

      const { button = 'left', clickCount = 1, delay } = options ?? {};

      if (delay) await new Promise((r) => setTimeout(r, delay));

      await view.webContents.executeJavaScript(`
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');

          const rect = el.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;

          const eventInit = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
            button: ${button === 'left' ? 0 : button === 'middle' ? 1 : 2}
          };

          for (let i = 0; i < ${clickCount}; i++) {
            el.dispatchEvent(new MouseEvent('mousedown', eventInit));
            el.dispatchEvent(new MouseEvent('mouseup', eventInit));
            el.dispatchEvent(new MouseEvent('click', eventInit));
          }
        })()
      `);
    },

    async type(selector: string, text: string, options?: TypeOptions): Promise<void> {
      const view = getBrowserView();
      if (!view) throw new Error('Browser not available');

      const { clearFirst = false, delay = 0 } = options ?? {};

      await view.webContents.executeJavaScript(`
        (async function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) throw new Error('Element not found: ${selector.replace(/'/g, "\\'")}');

          el.focus();

          if (${clearFirst}) {
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }

          const text = ${JSON.stringify(text)};
          const delay = ${delay};

          for (const char of text) {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            el.value = (el.value || '') + char;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

            if (delay > 0) {
              await new Promise(r => setTimeout(r, delay));
            }
          }
        })()
      `);
    },

    async waitFor(selector: string, options?: WaitForOptions): Promise<ElementInfo> {
      const view = getBrowserView();
      if (!view) throw new Error('Browser not available');

      const { timeout = 5000, visible = true } = options ?? {};
      const start = Date.now();

      while (Date.now() - start < timeout) {
        const result = await view.webContents.executeJavaScript(`
          (function() {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return null;

            const styles = window.getComputedStyle(el);
            const isVisible = styles.display !== 'none';

            if (${visible} && !isVisible) return null;

            const rect = el.getBoundingClientRect();
            return {
              tagName: el.tagName.toLowerCase(),
              id: el.id || undefined,
              classes: Array.from(el.classList),
              selector: ${JSON.stringify(selector)},
              xpath: '',
              attributes: Object.fromEntries(
                Array.from(el.attributes).map(a => [a.name, a.value])
              ),
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
              parentChain: [],
              siblingCount: 0,
              childCount: el.childElementCount,
            };
          })()
        `);

        if (result) return result as ElementInfo;
        await new Promise((r) => setTimeout(r, 100));
      }

      throw new Error(`Element not found within ${timeout}ms: ${selector}`);
    },
  };
}
