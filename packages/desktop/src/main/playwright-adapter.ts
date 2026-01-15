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

/**
 * Format a user-friendly timeout error message
 */
function formatTimeoutError(action: string, selector: string, timeout: number, hint?: string): Error {
  let message = `${action} timeout: "${selector}" not found within ${timeout}ms.`;
  if (hint) {
    message += ` ${hint}`;
  }
  return new Error(message);
}

export class PlaywrightAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private browserView: BrowserView | null = null;
  private cdpPort: number;
  // Track dialog handler to prevent memory leaks from multiple registrations
  private dialogHandler: ((dialog: import('playwright-core').Dialog) => Promise<void>) | null = null;

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

      // Set reasonable default timeout (10 seconds)
      // Long enough for lazy loading but short enough for useful feedback
      this.page.setDefaultTimeout(10000);

      console.log('[PlaywrightAdapter] Connected successfully to page:', this.page.url());
    } catch (error) {
      const err = error as Error;
      console.error('[PlaywrightAdapter] Connection failed:', err.message);

      // Provide helpful guidance for common failures
      if (err.message.includes('Timeout') || err.name === 'TimeoutError') {
        console.error('[PlaywrightAdapter] Timeout connecting to CDP. This usually means:');
        console.error('  1. Zombie Electron processes are holding port 9222');
        console.error('  2. Fix: Run "fuser -k 9222/tcp" (Linux/WSL) or kill Electron processes');
        console.error('  3. Then restart the app');
      }

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
    } catch (error) {
      console.debug('[PlaywrightAdapter] URL comparison failed:', {
        url1,
        url2,
        error: error instanceof Error ? error.message : error,
      });
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
    // Remove dialog handler BEFORE disconnecting to prevent memory leak
    if (this.page && this.dialogHandler) {
      this.page.off('dialog', this.dialogHandler);
    }

    try {
      // For CDP connections, browser.close() disconnects the session without killing Electron's browser.
      // This is the correct way to clean up the Playwright connection.
      if (this.browser) {
        await this.browser.close().catch((err) => {
          console.debug('[PlaywrightAdapter] Browser disconnect warning:', err.message);
        });
      }
    } catch (error) {
      console.warn('[PlaywrightAdapter] Disconnect cleanup error:', error);
    } finally {
      this.browser = null;
      this.context = null;
      this.page = null;
      this.browserView = null;
      this.dialogHandler = null;
    }
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
   * Validate selector - reject jQuery pseudo-selectors that aren't valid CSS
   */
  private validateSelector(selector: string): void {
    const jqueryPatterns = [
      ':contains(',
      ':visible',
      ':hidden',
      ':first',
      ':last',
      ':eq(',
      ':gt(',
      ':lt(',
      ':even',
      ':odd',
      ':checkbox',
      ':radio',
      ':text',
      ':submit',
    ];

    for (const pattern of jqueryPatterns) {
      if (selector.includes(pattern)) {
        throw new Error(
          `Invalid selector: '${pattern}' is jQuery syntax, not valid CSS. ` +
          `Use standard CSS selectors or Playwright locators like 'text=...' instead.`
        );
      }
    }
  }

  /**
   * Click an element with improved error handling and retry logic
   */
  async click(
    selector: string,
    options?: {
      button?: 'left' | 'right' | 'middle';
      clickCount?: number;
      delay?: number;
      force?: boolean;
      timeout?: number;
      retries?: number;
    }
  ): Promise<void> {
    // Validate selector - reject jQuery-style selectors
    this.validateSelector(selector);

    const page = await this.ensureConnected();
    const retries = options?.retries ?? 2; // Retry up to 2 times by default
    const timeout = options?.timeout ?? 10000;

    // Use shorter timeout per attempt when retrying
    const timeoutPerAttempt = retries > 0 ? Math.floor(timeout / (retries + 1)) : timeout;

    const clickOptions = {
      button: options?.button,
      clickCount: options?.clickCount,
      delay: options?.delay,
      force: options?.force,
      timeout: timeoutPerAttempt,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Wait for element to be stable before clicking
        await page.locator(selector).waitFor({ state: 'visible', timeout: timeoutPerAttempt });
        await page.click(selector, clickOptions);
        return; // Success
      } catch (error) {
        lastError = error as Error;

        // Don't retry invalid selector errors
        if (lastError.message.includes('is not a valid selector')) {
          throw new Error(
            `Invalid selector: "${selector}". ${lastError.message.split(':').pop()?.trim() || 'Check CSS syntax.'}`
          );
        }

        // On last attempt, throw enhanced error
        if (attempt === retries) {
          if (lastError.message.includes('Timeout')) {
            throw formatTimeoutError(
              'Click',
              selector,
              timeout,
              `Not found after ${retries + 1} attempts. Try using browser_snapshot to find the correct selector.`
            );
          }
          throw lastError;
        }

        // Wait briefly before retry (allows animations to complete)
        await new Promise(r => setTimeout(r, 200));
      }
    }

    throw lastError || new Error('Click failed for unknown reason');
  }

  /**
   * Click an element by its visible text content
   * More reliable than CSS selectors for buttons, links, and menu items
   */
  async clickByText(
    text: string,
    options?: {
      exact?: boolean; // Exact match vs substring
      timeout?: number;
    }
  ): Promise<void> {
    const page = await this.ensureConnected();
    const timeout = options?.timeout ?? 10000;
    const exact = options?.exact ?? false;

    try {
      const locator = exact
        ? page.getByText(text, { exact: true })
        : page.getByText(text);

      await locator.first().waitFor({ state: 'visible', timeout });
      await locator.first().click({ timeout });
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('Timeout')) {
        throw formatTimeoutError('Click by text', `text="${text}"`, timeout, 'Try using browser_snapshot to see available elements.');
      }
      throw error;
    }
  }

  /**
   * Fill an input field (clears first, then types)
   */
  async fill(selector: string, value: string, options?: { timeout?: number }): Promise<void> {
    // Validate selector - reject jQuery-style selectors
    this.validateSelector(selector);

    const page = await this.ensureConnected();
    const fillOptions = {
      ...options,
      timeout: options?.timeout ?? 10000,
    };

    try {
      await page.fill(selector, value, fillOptions);
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('Timeout')) {
        throw formatTimeoutError('Fill', selector, fillOptions.timeout, 'Ensure the input element exists and is editable.');
      }
      if (err.message.includes('not an <input>') || err.message.includes('not editable')) {
        throw new Error(
          `Fill failed: "${selector}" is not an editable input field. ` +
          `Use 'type' for contenteditable elements or check the element type.`
        );
      }
      throw error;
    }
  }

  /**
   * Type text character by character
   */
  async type(
    selector: string,
    text: string,
    options?: { delay?: number; timeout?: number }
  ): Promise<void> {
    // Validate selector - reject jQuery-style selectors
    this.validateSelector(selector);

    const page = await this.ensureConnected();
    const timeout = options?.timeout ?? 10000;

    try {
      const locator = page.locator(selector);
      await locator.waitFor({ state: 'visible', timeout });
      await locator.pressSequentially(text, { delay: options?.delay });
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('Timeout')) {
        throw formatTimeoutError('Type', selector, timeout, 'Element not found or not visible.');
      }
      throw error;
    }
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
    // Validate selector - reject jQuery-style selectors
    this.validateSelector(selector);

    const page = await this.ensureConnected();
    const selectOptions = {
      ...options,
      timeout: options?.timeout ?? 10000,
    };

    try {
      return await page.selectOption(selector, values, selectOptions);
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('Timeout')) {
        throw formatTimeoutError('Select', selector, selectOptions.timeout);
      }
      if (err.message.includes('not a <select>')) {
        throw new Error(
          `Select failed: "${selector}" is not a <select> element. ` +
          `For custom dropdowns, use click() to open and then click an option.`
        );
      }
      throw error;
    }
  }

  /**
   * Hover over an element
   */
  async hover(selector: string, options?: { timeout?: number; force?: boolean }): Promise<void> {
    // Validate selector - reject jQuery-style selectors
    this.validateSelector(selector);

    const page = await this.ensureConnected();
    const hoverOptions = {
      ...options,
      timeout: options?.timeout ?? 10000,
    };

    try {
      await page.hover(selector, hoverOptions);
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('Timeout')) {
        throw formatTimeoutError('Hover', selector, hoverOptions.timeout);
      }
      throw error;
    }
  }

  /**
   * Drag and drop
   */
  async dragAndDrop(
    sourceSelector: string,
    targetSelector: string,
    options?: { timeout?: number }
  ): Promise<void> {
    // Validate selectors - reject jQuery-style selectors
    this.validateSelector(sourceSelector);
    this.validateSelector(targetSelector);

    const page = await this.ensureConnected();
    const dragOptions = {
      ...options,
      timeout: options?.timeout ?? 10000,
    };

    try {
      await page.dragAndDrop(sourceSelector, targetSelector, dragOptions);
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('Timeout')) {
        throw formatTimeoutError('Drag', `${sourceSelector} → ${targetSelector}`, dragOptions.timeout);
      }
      throw error;
    }
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
    // Validate selector - reject jQuery-style selectors
    this.validateSelector(selector);

    const page = await this.ensureConnected();
    const timeout = options?.timeout ?? 10000;
    const state = options?.state ?? 'visible';

    try {
      await page.waitForSelector(selector, { state, timeout });
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('Timeout')) {
        throw formatTimeoutError('Wait', selector, timeout, `Element did not become ${state}.`);
      }
      throw error;
    }
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
    } catch (error) {
      // Response body might not be available (e.g., streaming, binary, or already consumed)
      console.debug('[PlaywrightAdapter] Could not read response body:',
        error instanceof Error ? error.message : 'Unknown error');
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
   * Note: Removes any previously registered handler to prevent memory leaks
   */
  onDialog(handler: (dialog: { type: string; message: string; accept: () => Promise<void>; dismiss: () => Promise<void> }) => void): void {
    if (!this.page) return;

    // Remove previous handler to prevent memory leak
    if (this.dialogHandler) {
      this.page.off('dialog', this.dialogHandler);
    }

    // Create and store new handler
    this.dialogHandler = async (dialog) => {
      handler({
        type: dialog.type(),
        message: dialog.message(),
        accept: () => dialog.accept(),
        dismiss: () => dialog.dismiss(),
      });
    };

    this.page.on('dialog', this.dialogHandler);
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
