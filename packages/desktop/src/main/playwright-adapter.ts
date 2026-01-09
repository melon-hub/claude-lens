/**
 * Playwright Adapter for Claude Lens Desktop
 *
 * Connects Playwright to Electron's embedded browser via CDP (Chrome DevTools Protocol).
 * This enables full Playwright automation capabilities on the embedded browser.
 *
 * Architecture:
 * 1. Electron must start with --remote-debugging-port=9222
 * 2. Playwright connects via chromium.connectOverCDP()
 * 3. We find the page matching our BrowserView's URL
 */

import type { BrowserView } from 'electron';
import { chromium, Browser, BrowserContext, Page } from 'playwright-core';

// Default port for CDP - must match the --remote-debugging-port flag
const DEFAULT_CDP_PORT = 9222;

export class PlaywrightAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private browserView: BrowserView | null = null;
  private cdpPort: number;

  constructor(cdpPort: number = DEFAULT_CDP_PORT) {
    this.cdpPort = cdpPort;
  }

  /**
   * Connect Playwright to Electron via CDP
   * @param browserView The BrowserView to connect to (used for URL matching)
   */
  async connect(browserView: BrowserView): Promise<void> {
    if (this.browser) {
      await this.disconnect();
    }

    this.browserView = browserView;

    try {
      const cdpUrl = `http://127.0.0.1:${this.cdpPort}`;
      console.log('[PlaywrightAdapter] Connecting to CDP endpoint:', cdpUrl);

      // Connect Playwright to Electron's Chromium via CDP
      this.browser = await chromium.connectOverCDP(cdpUrl, {
        timeout: 10000,
      });

      // Find the page that matches our BrowserView's URL
      // Retry a few times since the page might not be immediately available
      let retries = 3;
      while (retries > 0) {
        await this.findMatchingPage(browserView);
        if (this.page) break;

        retries--;
        if (retries > 0) {
          console.log(`[PlaywrightAdapter] Page not found, retrying... (${retries} attempts left)`);
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (!this.page) {
        throw new Error('Could not find matching page for BrowserView. The browser may not have loaded yet.');
      }

      // Set shorter default timeout (5 seconds instead of 30)
      // This gives faster feedback when selectors don't match
      this.page.setDefaultTimeout(5000);

      console.log('[PlaywrightAdapter] Connected successfully to page:', this.page.url());
    } catch (error) {
      console.error('[PlaywrightAdapter] Connection failed:', error);
      await this.disconnect();
      throw error;
    }
  }

  /**
   * Find the Playwright page that matches the BrowserView's content
   */
  private async findMatchingPage(browserView: BrowserView): Promise<void> {
    if (!this.browser) return;

    const targetUrl = browserView.webContents.getURL();
    console.log('[PlaywrightAdapter] Looking for page with URL:', targetUrl);

    // Get all contexts and pages
    const contexts = this.browser.contexts();

    for (const ctx of contexts) {
      const pages = ctx.pages();
      for (const page of pages) {
        const pageUrl = page.url();
        console.log('[PlaywrightAdapter] Found page:', pageUrl);

        // Match by URL (handle both exact match and localhost variations)
        if (this.urlsMatch(pageUrl, targetUrl)) {
          this.context = ctx;
          this.page = page;
          return;
        }
      }
    }

    // If no exact match, use the first non-blank page
    for (const ctx of contexts) {
      const pages = ctx.pages();
      for (const page of pages) {
        const pageUrl = page.url();
        if (pageUrl && pageUrl !== 'about:blank' && !pageUrl.startsWith('devtools://')) {
          this.context = ctx;
          this.page = page;
          console.log('[PlaywrightAdapter] Using first available page:', pageUrl);
          return;
        }
      }
    }

    // Log available pages for debugging
    console.log('[PlaywrightAdapter] No matching page found. Available pages:');
    for (const ctx of contexts) {
      for (const page of ctx.pages()) {
        console.log('  -', page.url());
      }
    }
    // Don't create a new page - that would be separate from the BrowserView
    // The caller will check if this.page is null
  }

  /**
   * Check if two URLs match (handling localhost variations)
   */
  private urlsMatch(url1: string, url2: string): boolean {
    if (url1 === url2) return true;

    try {
      const parsed1 = new URL(url1);
      const parsed2 = new URL(url2);

      // Normalize localhost variations
      const host1 = parsed1.hostname.replace('127.0.0.1', 'localhost');
      const host2 = parsed2.hostname.replace('127.0.0.1', 'localhost');

      return host1 === host2 && parsed1.port === parsed2.port && parsed1.pathname === parsed2.pathname;
    } catch {
      return false;
    }
  }

  /**
   * Refresh the page reference after navigation
   */
  async refreshPageReference(): Promise<void> {
    if (this.browserView) {
      await this.findMatchingPage(this.browserView);
    }
  }

  /**
   * Disconnect Playwright
   */
  async disconnect(): Promise<void> {
    try {
      // Don't close browser - it's Electron's browser, we're just disconnecting
      if (this.browser) {
        await this.browser.close().catch(() => {});
      }
    } catch {
      // Ignore close errors
    }

    this.browser = null;
    this.context = null;
    this.page = null;
    this.browserView = null;
  }

  /**
   * Get the Playwright Page object
   */
  getPage(): Page | null {
    return this.page;
  }

  /**
   * Get the Playwright Browser object
   */
  getBrowser(): Browser | null {
    return this.browser;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.browser !== null && this.page !== null && !this.page.isClosed();
  }

  /**
   * Ensure we have a valid connection, reconnecting if necessary
   */
  async ensureConnected(): Promise<Page> {
    if (!this.isConnected()) {
      if (this.browserView) {
        await this.connect(this.browserView);
      } else {
        throw new Error('No BrowserView available for reconnection');
      }
    }

    if (!this.page) {
      throw new Error('Playwright not connected to BrowserView');
    }

    return this.page;
  }

  /**
   * Take a screenshot using Playwright
   */
  async screenshot(options?: {
    selector?: string;
    fullPage?: boolean;
    type?: 'png' | 'jpeg';
  }): Promise<Buffer> {
    const page = await this.ensureConnected();

    if (options?.selector) {
      const element = await page.locator(options.selector).first();
      return element.screenshot({ type: options?.type || 'png' });
    }

    return page.screenshot({
      fullPage: options?.fullPage ?? false,
      type: options?.type || 'png',
    });
  }

  /**
   * Get accessibility tree snapshot (key for efficient element discovery)
   */
  async getAccessibilitySnapshot(): Promise<string> {
    const page = await this.ensureConnected();

    // Optimized: Only return interactive elements in a flat, compact format
    // This reduces output from ~14k tokens to ~500-1000 tokens
    const script = `
      (function() {
        var elements = [];
        var interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'FORM'];
        var interactiveRoles = ['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox', 'menuitem', 'tab', 'switch'];

        function getSelector(el) {
          if (el.id) return '#' + el.id;
          if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
          if (el.className && typeof el.className === 'string') {
            var classes = el.className.trim().split(/\\s+/).slice(0, 2).join('.');
            if (classes) return el.tagName.toLowerCase() + '.' + classes;
          }
          // Generate a path-based selector for elements without good identifiers
          var path = [];
          var current = el;
          while (current && current !== document.body && path.length < 3) {
            var tag = current.tagName.toLowerCase();
            var parent = current.parentElement;
            if (parent) {
              var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === current.tagName; });
              if (siblings.length > 1) {
                var idx = siblings.indexOf(current) + 1;
                tag += ':nth-of-type(' + idx + ')';
              }
            }
            path.unshift(tag);
            current = parent;
          }
          return path.join(' > ');
        }

        function getText(el) {
          var text = el.getAttribute('aria-label') ||
                     el.getAttribute('placeholder') ||
                     el.getAttribute('title') ||
                     el.getAttribute('alt') ||
                     (el.textContent || '').trim();
          return text.slice(0, 30).replace(/\\s+/g, ' ');
        }

        document.querySelectorAll('*').forEach(function(el) {
          var tag = el.tagName;
          var role = el.getAttribute('role');
          var isInteractive = interactiveTags.includes(tag) ||
                              interactiveRoles.includes(role) ||
                              el.hasAttribute('onclick') ||
                              el.hasAttribute('tabindex');

          if (!isInteractive) return;
          if (!el.offsetParent && tag !== 'BODY') return; // Skip hidden

          var info = { s: getSelector(el), t: tag.toLowerCase() };
          var text = getText(el);
          if (text) info.n = text;
          if (el.type) info.type = el.type;
          if (el.value && el.value.length < 30) info.v = el.value;
          if (el.disabled) info.disabled = true;
          if (el.checked) info.checked = true;

          elements.push(info);
        });

        return elements.slice(0, 100); // Max 100 elements
      })()
    `;

    const snapshot = await page.evaluate(script);

    // Format as compact, readable list
    const elements = snapshot as Array<{s: string; t: string; n?: string; type?: string; v?: string; disabled?: boolean; checked?: boolean}>;
    const lines = elements.map((el, i) => {
      let line = `${i + 1}. [${el.t}] "${el.s}"`;
      if (el.n) line += ` "${el.n}"`;
      if (el.type) line += ` (${el.type})`;
      if (el.v) line += ` value="${el.v}"`;
      if (el.disabled) line += ' [disabled]';
      if (el.checked) line += ' [checked]';
      return line;
    });

    return `Interactive elements (${elements.length}):\n${lines.join('\n')}`;
  }

  /**
   * Click an element
   */
  async click(
    selector: string,
    options?: {
      button?: 'left' | 'right' | 'middle';
      clickCount?: number;
      delay?: number;
      force?: boolean;
      timeout?: number;
    }
  ): Promise<void> {
    const page = await this.ensureConnected();
    await page.click(selector, options);
  }

  /**
   * Fill an input field (clears first, then types)
   */
  async fill(selector: string, value: string, options?: { timeout?: number }): Promise<void> {
    const page = await this.ensureConnected();
    await page.fill(selector, value, options);
  }

  /**
   * Type text character by character
   */
  async type(
    selector: string,
    text: string,
    options?: { delay?: number; timeout?: number }
  ): Promise<void> {
    const page = await this.ensureConnected();
    await page.locator(selector).pressSequentially(text, { delay: options?.delay });
  }

  /**
   * Press a key (Enter, Tab, Escape, etc.)
   */
  async pressKey(key: string, options?: { delay?: number }): Promise<void> {
    const page = await this.ensureConnected();
    await page.keyboard.press(key, options);
  }

  /**
   * Select an option from a dropdown
   */
  async selectOption(
    selector: string,
    values: string | string[],
    options?: { timeout?: number }
  ): Promise<string[]> {
    const page = await this.ensureConnected();
    return page.selectOption(selector, values, options);
  }

  /**
   * Hover over an element
   */
  async hover(selector: string, options?: { timeout?: number; force?: boolean }): Promise<void> {
    const page = await this.ensureConnected();
    await page.hover(selector, options);
  }

  /**
   * Drag and drop
   */
  async dragAndDrop(
    sourceSelector: string,
    targetSelector: string,
    options?: { timeout?: number }
  ): Promise<void> {
    const page = await this.ensureConnected();
    await page.dragAndDrop(sourceSelector, targetSelector, options);
  }

  /**
   * Scroll element or page
   */
  async scroll(options: {
    selector?: string;
    x?: number;
    y?: number;
    direction?: 'up' | 'down' | 'left' | 'right';
    distance?: number;
  }): Promise<void> {
    const page = await this.ensureConnected();

    if (options.selector) {
      await page.locator(options.selector).scrollIntoViewIfNeeded();
    } else if (options.x !== undefined || options.y !== undefined) {
      // Use string-based evaluate to avoid TypeScript DOM type issues
      const x = options.x ?? 0;
      const y = options.y ?? 0;
      await page.evaluate(`window.scrollTo(${x}, ${y})`);
    } else if (options.direction && options.distance) {
      const deltaX = options.direction === 'left' ? -options.distance : options.direction === 'right' ? options.distance : 0;
      const deltaY = options.direction === 'up' ? -options.distance : options.direction === 'down' ? options.distance : 0;
      await page.evaluate(`window.scrollBy(${deltaX}, ${deltaY})`);
    }
  }

  /**
   * Wait for an element
   */
  async waitForSelector(
    selector: string,
    options?: { state?: 'attached' | 'visible' | 'hidden'; timeout?: number }
  ): Promise<void> {
    const page = await this.ensureConnected();
    // Build options object only with defined values to avoid type issues
    const waitOptions: { state?: 'attached' | 'visible' | 'hidden'; timeout?: number } = {};
    if (options?.state) waitOptions.state = options.state;
    if (options?.timeout) waitOptions.timeout = options.timeout;
    await page.waitForSelector(selector, waitOptions);
  }

  /**
   * Wait for a network response
   */
  async waitForResponse(
    urlPattern: string | RegExp,
    options?: { timeout?: number }
  ): Promise<{ url: string; status: number; body?: string }> {
    const page = await this.ensureConnected();
    const response = await page.waitForResponse(urlPattern, options);
    let body: string | undefined;
    try {
      body = await response.text();
    } catch {
      // Response body might not be available
    }
    return {
      url: response.url(),
      status: response.status(),
      body,
    };
  }

  /**
   * Get element text content
   */
  async getText(selector: string): Promise<string> {
    const page = await this.ensureConnected();
    const text = await page.locator(selector).textContent();
    return text ?? '';
  }

  /**
   * Get element attribute
   */
  async getAttribute(selector: string, attributeName: string): Promise<string | null> {
    const page = await this.ensureConnected();
    return page.locator(selector).getAttribute(attributeName);
  }

  /**
   * Check element visibility
   */
  async isVisible(selector: string): Promise<boolean> {
    const page = await this.ensureConnected();
    return page.locator(selector).isVisible();
  }

  /**
   * Check if element is enabled
   */
  async isEnabled(selector: string): Promise<boolean> {
    const page = await this.ensureConnected();
    return page.locator(selector).isEnabled();
  }

  /**
   * Check if checkbox/radio is checked
   */
  async isChecked(selector: string): Promise<boolean> {
    const page = await this.ensureConnected();
    return page.locator(selector).isChecked();
  }

  /**
   * Evaluate JavaScript in the page context
   */
  async evaluate(script: string): Promise<unknown> {
    const page = await this.ensureConnected();
    return page.evaluate(script);
  }

  /**
   * Handle dialog (alert, confirm, prompt)
   */
  onDialog(handler: (dialog: { type: string; message: string; accept: () => Promise<void>; dismiss: () => Promise<void> }) => void): void {
    if (this.page) {
      this.page.on('dialog', async (dialog) => {
        handler({
          type: dialog.type(),
          message: dialog.message(),
          accept: () => dialog.accept(),
          dismiss: () => dialog.dismiss(),
        });
      });
    }
  }

  /**
   * Get current URL
   */
  async getUrl(): Promise<string> {
    const page = await this.ensureConnected();
    return page.url();
  }

  /**
   * Navigate to URL
   */
  async goto(url: string, options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void> {
    const page = await this.ensureConnected();
    await page.goto(url, options);
  }

  /**
   * Reload page
   */
  async reload(options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void> {
    const page = await this.ensureConnected();
    await page.reload(options);
  }

  /**
   * Go back
   */
  async goBack(): Promise<void> {
    const page = await this.ensureConnected();
    await page.goBack();
  }

  /**
   * Go forward
   */
  async goForward(): Promise<void> {
    const page = await this.ensureConnected();
    await page.goForward();
  }
}

/**
 * Get the CDP port for Electron
 * This should match the port set via app.commandLine.appendSwitch
 */
export function getCDPPort(): number {
  return DEFAULT_CDP_PORT;
}

/**
 * Create a PlaywrightAdapter instance
 */
export function createPlaywrightAdapter(cdpPort?: number): PlaywrightAdapter {
  return new PlaywrightAdapter(cdpPort);
}
