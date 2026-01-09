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
  // Automation
  click(selector: string, options?: ClickOptions): Promise<void>;
  type(selector: string, text: string, options?: TypeOptions): Promise<void>;
  waitFor(selector: string, options?: WaitForOptions): Promise<ElementInfo>;
}

const DEFAULT_PORT = 9333;

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
        // CORS headers for local access
        res.setHeader('Access-Control-Allow-Origin', '*');
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
            case '/state':
              result = this.handler.getState();
              break;

            case '/navigate':
              result = await this.handler.navigate(body['url'] as string);
              break;

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

            case '/highlight':
              await this.handler.highlight(body['selector'] as string, {
                color: body['color'] as string | undefined,
                duration: body['duration'] as number | undefined,
              });
              result = { success: true };
              break;

            case '/clear-highlights':
              await this.handler.clearHighlights();
              result = { success: true };
              break;

            case '/screenshot':
              const imageData = await this.handler.screenshot(body['selector'] as string | undefined);
              result = { image: imageData };
              break;

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
            case '/click':
              await this.handler.click(
                body['selector'] as string,
                body['options'] as ClickOptions | undefined
              );
              result = { success: true };
              break;

            case '/type':
              await this.handler.type(
                body['selector'] as string,
                body['text'] as string,
                body['options'] as TypeOptions | undefined
              );
              result = { success: true };
              break;

            case '/wait-for':
              result = await this.handler.waitFor(
                body['selector'] as string,
                body['options'] as WaitForOptions | undefined
              );
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

  private parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
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
}
