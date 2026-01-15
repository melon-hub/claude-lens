/**
 * IPC Bridge for Claude Lens
 *
 * Provides communication between the MCP server (separate process)
 * and the VS Code extension (which controls the browser).
 *
 * Uses a simple HTTP server on localhost.
 */

import http from 'http';
import type {
  ElementInfo,
  ConsoleMessage,
  ClickOptions,
  TypeOptions,
  WaitForOptions,
} from '../browser/types.js';

export interface BridgeState {
  connected: boolean;
  currentUrl: string;
  lastInspectedElement: ElementInfo | null;
  consoleLogs: ConsoleMessage[];
}

export interface BridgeHandler {
  getState(): BridgeState;
  navigate(url: string): Promise<{ success: boolean; error?: string }>;
  inspectElement(selector?: string): Promise<ElementInfo | null>;
  inspectElementAtPoint(x: number, y: number): Promise<ElementInfo | null>;
  highlight(selector: string, options?: { color?: string; duration?: number }): Promise<void>;
  clearHighlights(): Promise<void>;
  screenshot(selector?: string): Promise<string>; // base64
  getConsoleLogs(level?: string, limit?: number): Promise<ConsoleMessage[]>;
  reload(): Promise<void>;
  // Automation (basic)
  click(selector: string, options?: ClickOptions): Promise<void>;
  type(selector: string, text: string, options?: TypeOptions): Promise<void>;
  waitFor(selector: string, options?: WaitForOptions): Promise<ElementInfo>;
  // Playwright-powered automation (extended)
  fill?(selector: string, value: string): Promise<void>;
  selectOption?(selector: string, values: string | string[]): Promise<string[]>;
  hover?(selector: string): Promise<void>;
  pressKey?(key: string): Promise<void>;
  dragAndDrop?(source: string, target: string): Promise<void>;
  scroll?(options: { selector?: string; direction?: string; distance?: number }): Promise<void>;
  waitForResponse?(urlPattern: string): Promise<{ url: string; status: number }>;
  getText?(selector: string): Promise<string>;
  getAttribute?(selector: string, name: string): Promise<string | null>;
  isVisible?(selector: string): Promise<boolean>;
  isEnabled?(selector: string): Promise<boolean>;
  isChecked?(selector: string): Promise<boolean>;
  evaluate?(script: string): Promise<unknown>;
  getAccessibilitySnapshot?(): Promise<string>;
  goBack?(): Promise<void>;
  goForward?(): Promise<void>;
  setDialogHandler?(action: 'accept' | 'dismiss'): void;
  setViewport?(width: number): void | Promise<void>;
  restartServer?(): Promise<{ success: boolean; error?: string }>;
}

const DEFAULT_PORT = 9333;

/**
 * Validate required string parameter from request body
 * @throws Error if the parameter is missing or not a valid string
 */
function validateString(body: Record<string, unknown>, field: string, required = true): string | undefined {
  const value = body[field];
  if (value === undefined || value === null) {
    if (required) {
      throw new Error(`Missing required parameter: ${field}`);
    }
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`Invalid parameter ${field}: expected string, got ${typeof value}`);
  }
  if (required && !value.trim()) {
    throw new Error(`Parameter ${field} cannot be empty`);
  }
  return value;
}

/**
 * Validate required number parameter from request body
 */
function validateNumber(body: Record<string, unknown>, field: string, required = true): number | undefined {
  const value = body[field];
  if (value === undefined || value === null) {
    if (required) {
      throw new Error(`Missing required parameter: ${field}`);
    }
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid parameter ${field}: expected finite number, got ${value}`);
  }
  return value;
}

/**
 * Bridge server - runs in the VS Code extension
 */
export class BridgeServer {
  private server: http.Server | null = null;
  private handler: BridgeHandler | null = null;

  constructor(private port: number = DEFAULT_PORT) {}

  setHandler(handler: BridgeHandler): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    if (this.server) return;

    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        // CORS headers - restricted to localhost only
        // Use URL parsing to prevent bypass via localhost.evil.com
        const origin = req.headers.origin;
        if (origin) {
          try {
            const url = new URL(origin);
            if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
              res.setHeader('Access-Control-Allow-Origin', origin);
            }
          } catch {
            // Invalid URL, don't set CORS header
          }
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (!this.handler) {
          res.writeHead(503);
          res.end(JSON.stringify({ error: 'Handler not ready' }));
          return;
        }

        try {
          const url = new URL(req.url ?? '/', `http://localhost:${this.port}`);
          const path = url.pathname;

          // Parse body for POST requests
          let body: Record<string, unknown> = {};
          if (req.method === 'POST') {
            body = await this.parseBody(req);
          }

          let result: unknown;

          switch (path) {
            case '/health':
              // Health check endpoint for debugging and monitoring
              result = {
                status: 'ok',
                connected: this.handler?.getState().connected ?? false,
                timestamp: Date.now(),
                uptime: process.uptime(),
              };
              break;

            case '/state':
              result = this.handler.getState();
              break;

            case '/navigate': {
              const url = validateString(body, 'url');
              result = await this.handler.navigate(url!);
              break;
            }

            case '/inspect':
              if (body['x'] !== undefined && body['y'] !== undefined) {
                result = await this.handler.inspectElementAtPoint(
                  body['x'] as number,
                  body['y'] as number
                );
              } else {
                result = await this.handler.inspectElement(body['selector'] as string | undefined);
              }
              break;

            case '/highlight': {
              const selector = validateString(body, 'selector');
              const color = validateString(body, 'color', false);
              const duration = validateNumber(body, 'duration', false);
              await this.handler.highlight(selector!, { color, duration });
              result = { success: true };
              break;
            }

            case '/clear-highlights':
              await this.handler.clearHighlights();
              result = { success: true };
              break;

            case '/screenshot': {
              const imageData = await this.handler.screenshot(body['selector'] as string | undefined);
              result = { image: imageData };
              break;
            }

            case '/console':
              result = await this.handler.getConsoleLogs(
                body['level'] as string | undefined,
                body['limit'] as number | undefined
              );
              break;

            case '/reload':
              await this.handler.reload();
              result = { success: true };
              break;

            // Automation routes
            case '/click': {
              const selector = validateString(body, 'selector');
              await this.handler.click(selector!, body['options'] as ClickOptions | undefined);
              result = { success: true };
              break;
            }

            case '/type': {
              const selector = validateString(body, 'selector');
              const text = validateString(body, 'text');
              await this.handler.type(selector!, text!, body['options'] as TypeOptions | undefined);
              result = { success: true };
              break;
            }

            case '/wait-for': {
              const selector = validateString(body, 'selector');
              result = await this.handler.waitFor(selector!, body['options'] as WaitForOptions | undefined);
              break;
            }

            // Playwright-powered routes
            case '/fill': {
              const selector = validateString(body, 'selector');
              const value = validateString(body, 'value');
              if (this.handler.fill) {
                await this.handler.fill(selector!, value!);
                result = { success: true };
              } else {
                throw new Error('fill not supported');
              }
              break;
            }

            case '/select-option': {
              const selector = validateString(body, 'selector');
              const values = body['values'];
              if (values === undefined || values === null) {
                throw new Error('Missing required parameter: values');
              }
              if (typeof values !== 'string' && !Array.isArray(values)) {
                throw new Error('Invalid parameter values: expected string or string[]');
              }
              if (this.handler.selectOption) {
                result = await this.handler.selectOption(selector!, values);
              } else {
                throw new Error('selectOption not supported');
              }
              break;
            }

            case '/hover': {
              const selector = validateString(body, 'selector');
              if (this.handler.hover) {
                await this.handler.hover(selector!);
                result = { success: true };
              } else {
                throw new Error('hover not supported');
              }
              break;
            }

            case '/press-key': {
              const key = validateString(body, 'key');
              if (this.handler.pressKey) {
                await this.handler.pressKey(key!);
                result = { success: true };
              } else {
                throw new Error('pressKey not supported');
              }
              break;
            }

            case '/drag-and-drop': {
              const source = validateString(body, 'source');
              const target = validateString(body, 'target');
              if (this.handler.dragAndDrop) {
                await this.handler.dragAndDrop(source!, target!);
                result = { success: true };
              } else {
                throw new Error('dragAndDrop not supported');
              }
              break;
            }

            case '/scroll': {
              // Options are optional, but validate if provided
              const options = body['options'] as { selector?: string; direction?: string; distance?: number } | undefined;
              if (this.handler.scroll) {
                await this.handler.scroll(options ?? {});
                result = { success: true };
              } else {
                throw new Error('scroll not supported');
              }
              break;
            }

            case '/wait-for-response': {
              const urlPattern = validateString(body, 'urlPattern');
              if (this.handler.waitForResponse) {
                result = await this.handler.waitForResponse(urlPattern!);
              } else {
                throw new Error('waitForResponse not supported');
              }
              break;
            }

            case '/get-text': {
              const selector = validateString(body, 'selector');
              if (this.handler.getText) {
                result = { text: await this.handler.getText(selector!) };
              } else {
                throw new Error('getText not supported');
              }
              break;
            }

            case '/get-attribute': {
              const selector = validateString(body, 'selector');
              const name = validateString(body, 'name');
              if (this.handler.getAttribute) {
                result = { value: await this.handler.getAttribute(selector!, name!) };
              } else {
                throw new Error('getAttribute not supported');
              }
              break;
            }

            case '/is-visible': {
              const selector = validateString(body, 'selector');
              if (this.handler.isVisible) {
                result = { visible: await this.handler.isVisible(selector!) };
              } else {
                throw new Error('isVisible not supported');
              }
              break;
            }

            case '/is-enabled': {
              const selector = validateString(body, 'selector');
              if (this.handler.isEnabled) {
                result = { enabled: await this.handler.isEnabled(selector!) };
              } else {
                throw new Error('isEnabled not supported');
              }
              break;
            }

            case '/is-checked': {
              const selector = validateString(body, 'selector');
              if (this.handler.isChecked) {
                result = { checked: await this.handler.isChecked(selector!) };
              } else {
                throw new Error('isChecked not supported');
              }
              break;
            }

            case '/evaluate': {
              const script = validateString(body, 'script');
              if (this.handler.evaluate) {
                result = { result: await this.handler.evaluate(script!) };
              } else {
                throw new Error('evaluate not supported');
              }
              break;
            }

            case '/accessibility-snapshot':
              if (this.handler.getAccessibilitySnapshot) {
                result = { snapshot: await this.handler.getAccessibilitySnapshot() };
              } else {
                throw new Error('getAccessibilitySnapshot not supported');
              }
              break;

            case '/go-back':
              if (this.handler.goBack) {
                await this.handler.goBack();
                result = { success: true };
              } else {
                throw new Error('goBack not supported');
              }
              break;

            case '/go-forward':
              if (this.handler.goForward) {
                await this.handler.goForward();
                result = { success: true };
              } else {
                throw new Error('goForward not supported');
              }
              break;

            case '/set-dialog-handler':
              if (this.handler.setDialogHandler) {
                this.handler.setDialogHandler(body['action'] as 'accept' | 'dismiss');
                result = { success: true };
              } else {
                throw new Error('setDialogHandler not supported');
              }
              break;

            case '/set-viewport':
              if (this.handler.setViewport) {
                const width = body['width'];
                if (typeof width !== 'number') {
                  throw new Error('width must be a number');
                }
                await this.handler.setViewport(width);
                result = { success: true };
              } else {
                throw new Error('setViewport not supported');
              }
              break;

            case '/restart-server':
              if (this.handler.restartServer) {
                result = await this.handler.restartServer();
              } else {
                throw new Error('restartServer not supported');
              }
              break;

            default:
              res.writeHead(404);
              res.end(JSON.stringify({ error: 'Not found' }));
              return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          res.writeHead(500);
          res.end(JSON.stringify({ error: message }));
        }
      });

      this.server.on('error', reject);
      this.server.listen(this.port, '127.0.0.1', () => {
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  private static readonly MAX_BODY_SIZE = 1024 * 1024; // 1MB

  private parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let data = '';
      let size = 0;

      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > BridgeServer.MAX_BODY_SIZE) {
          req.destroy();
          reject(new Error('Request body too large (max 1MB)'));
          return;
        }
        data += chunk;
      });

      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }
}

/**
 * Bridge client - used by the MCP server to communicate with the extension
 */
export class BridgeClient {
  constructor(private port: number = DEFAULT_PORT) {}

  private async request<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const url = `http://127.0.0.1:${this.port}${path}`;
    const options: RequestInit = {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    };

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error((error as { error: string }).error || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async getState(): Promise<BridgeState> {
    return this.request<BridgeState>('/state');
  }

  async navigate(url: string): Promise<{ success: boolean; error?: string }> {
    return this.request('/navigate', { url });
  }

  async inspectElement(selector?: string): Promise<ElementInfo | null> {
    return this.request('/inspect', { selector });
  }

  async inspectElementAtPoint(x: number, y: number): Promise<ElementInfo | null> {
    return this.request('/inspect', { x, y });
  }

  async highlight(
    selector: string,
    options?: { color?: string; duration?: number }
  ): Promise<void> {
    await this.request('/highlight', { selector, ...options });
  }

  async clearHighlights(): Promise<void> {
    await this.request('/clear-highlights');
  }

  async screenshot(selector?: string): Promise<string> {
    const result = await this.request<{ image: string }>('/screenshot', { selector });
    return result.image;
  }

  async getConsoleLogs(level?: string, limit?: number): Promise<ConsoleMessage[]> {
    return this.request('/console', { level, limit });
  }

  async reload(): Promise<void> {
    await this.request('/reload');
  }

  // Automation methods

  async click(selector: string, options?: ClickOptions): Promise<void> {
    await this.request('/click', { selector, options });
  }

  async type(selector: string, text: string, options?: TypeOptions): Promise<void> {
    await this.request('/type', { selector, text, options });
  }

  async waitFor(selector: string, options?: WaitForOptions): Promise<ElementInfo> {
    return this.request<ElementInfo>('/wait-for', { selector, options });
  }

  async isConnected(): Promise<boolean> {
    try {
      const state = await this.getState();
      return state.connected;
    } catch {
      return false;
    }
  }

  // Playwright-powered methods

  async fill(selector: string, value: string): Promise<void> {
    await this.request('/fill', { selector, value });
  }

  async selectOption(selector: string, values: string | string[]): Promise<string[]> {
    return this.request('/select-option', { selector, values });
  }

  async hover(selector: string): Promise<void> {
    await this.request('/hover', { selector });
  }

  async pressKey(key: string): Promise<void> {
    await this.request('/press-key', { key });
  }

  async dragAndDrop(source: string, target: string): Promise<void> {
    await this.request('/drag-and-drop', { source, target });
  }

  async scroll(options: { selector?: string; direction?: string; distance?: number }): Promise<void> {
    await this.request('/scroll', { options });
  }

  async waitForResponse(urlPattern: string): Promise<{ url: string; status: number }> {
    return this.request('/wait-for-response', { urlPattern });
  }

  async getText(selector: string): Promise<string> {
    const result = await this.request<{ text: string }>('/get-text', { selector });
    return result.text;
  }

  async getAttribute(selector: string, name: string): Promise<string | null> {
    const result = await this.request<{ value: string | null }>('/get-attribute', { selector, name });
    return result.value;
  }

  async isVisible(selector: string): Promise<boolean> {
    const result = await this.request<{ visible: boolean }>('/is-visible', { selector });
    return result.visible;
  }

  async isEnabled(selector: string): Promise<boolean> {
    const result = await this.request<{ enabled: boolean }>('/is-enabled', { selector });
    return result.enabled;
  }

  async isChecked(selector: string): Promise<boolean> {
    const result = await this.request<{ checked: boolean }>('/is-checked', { selector });
    return result.checked;
  }

  async evaluate(script: string): Promise<unknown> {
    const result = await this.request<{ result: unknown }>('/evaluate', { script });
    return result.result;
  }

  async getAccessibilitySnapshot(): Promise<string> {
    const result = await this.request<{ snapshot: string }>('/accessibility-snapshot');
    return result.snapshot;
  }

  async goBack(): Promise<void> {
    await this.request('/go-back');
  }

  async goForward(): Promise<void> {
    await this.request('/go-forward');
  }

  async setDialogHandler(action: 'accept' | 'dismiss'): Promise<void> {
    await this.request('/set-dialog-handler', { action });
  }

  async setViewport(width: number): Promise<void> {
    await this.request('/set-viewport', { width });
  }

  async restartServer(): Promise<{ success: boolean; error?: string }> {
    return await this.request('/restart-server') as { success: boolean; error?: string };
  }
}
