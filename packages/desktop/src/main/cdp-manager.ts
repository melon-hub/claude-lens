/**
 * CDP Manager - Chrome DevTools Protocol integration
 *
 * Connects to Chrome for page inspection, screenshots, and console capture.
 * Similar to the VS Code extension's CDP adapter but for Electron.
 */

import { CDPAdapter, type ElementInfo, type ConsoleMessage } from '@claude-lens/core';

export class CDPManager {
  private adapter: CDPAdapter | null = null;
  private consoleCallbacks: Array<(msg: ConsoleMessage) => void> = [];

  async connect(port: number = 9222): Promise<void> {
    this.adapter = new CDPAdapter({ port });
    await this.adapter.connect();

    // Set up console forwarding
    this.adapter.onConsoleMessage((msg) => {
      this.consoleCallbacks.forEach((cb) => cb(msg));
    });
  }

  async disconnect(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
      this.adapter = null;
    }
  }

  isConnected(): boolean {
    return this.adapter?.isConnected() ?? false;
  }

  async navigate(url: string): Promise<void> {
    if (!this.adapter) throw new Error('Not connected');
    await this.adapter.navigate(url, { waitFor: 'load' });
  }

  async screenshot(): Promise<string | null> {
    if (!this.adapter) return null;
    try {
      const buffer = await this.adapter.screenshot({ format: 'png' });
      return buffer.toString('base64');
    } catch {
      return null;
    }
  }

  async inspectElementAtPoint(x: number, y: number): Promise<ElementInfo | null> {
    if (!this.adapter) return null;
    return this.adapter.inspectElementAtPoint(x, y);
  }

  async highlight(selector: string): Promise<void> {
    if (!this.adapter) return;
    await this.adapter.highlight(selector, {
      color: '#3b82f6',
      duration: 3000,
    });
  }

  async clearHighlights(): Promise<void> {
    if (!this.adapter) return;
    await this.adapter.clearHighlights();
  }

  async reload(): Promise<void> {
    if (!this.adapter) return;
    await this.adapter.reload();
  }

  getCurrentUrl(): string {
    return this.adapter?.getCurrentUrl() ?? '';
  }

  onConsoleMessage(callback: (msg: ConsoleMessage) => void): void {
    this.consoleCallbacks.push(callback);
  }
}
