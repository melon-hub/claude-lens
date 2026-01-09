/**
 * Bridge Handler for Desktop App
 *
 * Implements the BridgeHandler interface so the MCP server
 * can communicate with our embedded BrowserView.
 */

import { BrowserView } from 'electron';
import type { BridgeHandler, BridgeState, ConsoleMessage as CoreConsoleMessage } from '@claude-lens/core';

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
  };
}
