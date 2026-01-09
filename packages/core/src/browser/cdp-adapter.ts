/**
 * Chrome DevTools Protocol adapter
 *
 * Connects to Chrome/Chromium via CDP for:
 * - Page navigation
 * - DOM inspection
 * - Console capture
 * - Screenshots
 * - Script execution
 */

import type {
  BrowserAdapter,
  ElementInfo,
  FrameworkInfo,
  NavigateOptions,
  NavigateResult,
  HighlightOptions,
  ScreenshotOptions,
  ConsoleMessage,
  ConsoleLogOptions,
  ClickOptions,
  TypeOptions,
  WaitForOptions,
} from './types.js';

// CDP client type (simplified for now)
interface CDPClient {
  Page: {
    enable(): Promise<void>;
    navigate(params: { url: string }): Promise<void>;
    reload(): Promise<void>;
    loadEventFired(): Promise<void>;
    domContentEventFired(): Promise<void>;
    captureScreenshot(params?: {
      format?: 'png' | 'jpeg';
      quality?: number;
      clip?: { x: number; y: number; width: number; height: number; scale: number };
    }): Promise<{ data: string }>;
    on(event: string, callback: (params: Record<string, unknown>) => void): void;
  };
  Runtime: {
    enable(): Promise<void>;
    evaluate(params: { expression: string; returnByValue?: boolean }): Promise<{
      result: { value: unknown; description?: string };
    }>;
    on(event: string, callback: (params: Record<string, unknown>) => void): void;
  };
  DOM: {
    enable(): Promise<void>;
    getDocument(): Promise<{ root: { nodeId: number; nodeName: string } }>;
    querySelector(params: { nodeId: number; selector: string }): Promise<{ nodeId: number }>;
    getNodeForLocation(params: { x: number; y: number }): Promise<{ nodeId: number }>;
    describeNode(params: { nodeId: number; depth?: number }): Promise<{
      node: {
        nodeName: string;
        nodeValue?: string;
        attributes?: string[];
        childNodeCount?: number;
      };
    }>;
    getBoxModel(params: { nodeId: number }): Promise<{ model: { content: number[] } }>;
    getOuterHTML(params: { nodeId: number }): Promise<{ outerHTML: string }>;
  };
  CSS: {
    enable(): Promise<void>;
    getComputedStyleForNode(params: { nodeId: number }): Promise<{
      computedStyle: Array<{ name: string; value: string }>;
    }>;
  };
  Network: {
    enable(): Promise<void>;
  };
  Input: {
    dispatchMouseEvent(params: {
      type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel';
      x: number;
      y: number;
      button?: 'left' | 'right' | 'middle' | 'none';
      clickCount?: number;
    }): Promise<void>;
    dispatchKeyEvent(params: {
      type: 'keyDown' | 'keyUp' | 'char';
      text?: string;
      key?: string;
      code?: string;
      modifiers?: number;
    }): Promise<void>;
  };
  close(): Promise<void>;
}

export interface CDPAdapterOptions {
  host?: string;
  port?: number;
}

export class CDPAdapter implements BrowserAdapter {
  private client: CDPClient | null = null;
  private currentUrl = '';
  private consoleLogs: ConsoleMessage[] = [];
  private consoleCallbacks: Array<(msg: ConsoleMessage) => void> = [];
  private navigateCallbacks: Array<(url: string) => void> = [];
  private loadCallbacks: Array<() => void> = [];
  private errorCallbacks: Array<(error: Error) => void> = [];

  private static readonly MAX_CONSOLE_LOGS = 500;
  private static readonly DEFAULT_TIMEOUT = 10000;

  constructor(private options: CDPAdapterOptions = {}) {
    this.options.host = options.host ?? 'localhost';
    this.options.port = options.port ?? 9222;
  }

  /**
   * Wrap an operation with a timeout
   */
  private async withTimeout<T>(
    operation: Promise<T>,
    ms: number = CDPAdapter.DEFAULT_TIMEOUT,
    message: string = 'Operation timed out'
  ): Promise<T> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    );
    return Promise.race([operation, timeout]);
  }

  /**
   * Add a console message with buffer limit enforcement
   */
  private addConsoleLog(msg: ConsoleMessage): void {
    this.consoleLogs.push(msg);
    if (this.consoleLogs.length > CDPAdapter.MAX_CONSOLE_LOGS) {
      this.consoleLogs.shift();
    }
    this.consoleCallbacks.forEach((cb) => cb(msg));
  }

  async connect(target?: string): Promise<void> {
    const CDP = (await import('chrome-remote-interface')).default;

    this.client = (await CDP({
      host: this.options.host,
      port: this.options.port,
      target,
    })) as unknown as CDPClient;

    const { Page, Runtime, DOM, CSS, Network } = this.client;

    // Enable necessary domains
    await Promise.all([
      Page.enable(),
      Runtime.enable(),
      DOM.enable(),
      CSS.enable(),
      Network.enable(),
    ]);

    // Set up console capture
    Runtime.on('consoleAPICalled', (params: Record<string, unknown>) => {
      const args = params['args'] as Array<{ value?: unknown; description?: string }> | undefined;
      const msg: ConsoleMessage = {
        level: (params['type'] as string) as ConsoleMessage['level'],
        text: args?.map((arg) => String(arg.value ?? arg.description ?? '')).join(' ') ?? '',
        source: 'console',
        timestamp: Date.now(),
      };
      this.addConsoleLog(msg);
    });

    // Set up exception capture
    Runtime.on('exceptionThrown', (params: Record<string, unknown>) => {
      const details = params['exceptionDetails'] as {
        text: string;
        url?: string;
        lineNumber?: number;
        columnNumber?: number;
        stackTrace?: { callFrames: Array<{ functionName: string; url: string; lineNumber: number; columnNumber: number }> };
      };
      const msg: ConsoleMessage = {
        level: 'error',
        text: details.text,
        source: details.url ?? 'unknown',
        line: details.lineNumber,
        column: details.columnNumber,
        timestamp: Date.now(),
        stackTrace: details.stackTrace?.callFrames
          .map((f) => `  at ${f.functionName} (${f.url}:${f.lineNumber}:${f.columnNumber})`)
          .join('\n'),
      };
      this.addConsoleLog(msg);
    });

    // Set up navigation events
    Page.on('frameNavigated', (params: Record<string, unknown>) => {
      const frame = params['frame'] as { parentId?: string; url: string };
      if (!frame.parentId) {
        this.currentUrl = frame.url;
        this.navigateCallbacks.forEach((cb) => cb(frame.url));
      }
    });

    Page.on('loadEventFired', () => {
      this.loadCallbacks.forEach((cb) => cb());
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  async navigate(url: string, options: NavigateOptions = {}): Promise<NavigateResult> {
    if (!this.client) throw new Error('Not connected');

    const timeout = options.timeout ?? 30000;
    const { Page } = this.client;
    const startTime = Date.now();

    const navigateImpl = async (): Promise<NavigateResult> => {
      await Page.navigate({ url });

      if (options.waitFor === 'load') {
        await Page.loadEventFired();
      } else if (options.waitFor === 'domcontentloaded') {
        await Page.domContentEventFired();
      }

      const { root } = await this.client!.DOM.getDocument();
      const title = root.nodeName === '#document' ? '' : root.nodeName;

      return {
        success: true,
        finalUrl: url,
        title,
        loadTime: Date.now() - startTime,
      };
    };

    return this.withTimeout(navigateImpl(), timeout, `Navigation to ${url} timed out after ${timeout}ms`);
  }

  async reload(): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    await this.client.Page.reload();
  }

  getCurrentUrl(): string {
    return this.currentUrl;
  }

  async inspectElement(selector: string): Promise<ElementInfo> {
    if (!this.client) throw new Error('Not connected');

    const { DOM } = this.client;

    // Get document and find element
    const { root } = await DOM.getDocument();
    const { nodeId } = await DOM.querySelector({ nodeId: root.nodeId, selector });

    if (!nodeId) {
      throw new Error(`Element not found: ${selector}`);
    }

    return this.getElementInfo(nodeId);
  }

  async inspectElementAtPoint(x: number, y: number): Promise<ElementInfo | null> {
    if (!this.client) throw new Error('Not connected');

    const { DOM } = this.client;
    const { nodeId } = await DOM.getNodeForLocation({ x, y });

    if (!nodeId) return null;

    return this.getElementInfo(nodeId);
  }

  /**
   * Detect React/Vue/Svelte/Angular component info for an element
   */
  private async detectFramework(x: number, y: number): Promise<FrameworkInfo | undefined> {
    if (!this.client) return undefined;

    const result = await this.client.Runtime.evaluate({
      expression: `
        (function() {
          const el = document.elementFromPoint(${x}, ${y});
          if (!el) return null;

          // Detect React
          const reactFiberKey = Object.keys(el).find(k =>
            k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
          );
          if (reactFiberKey) {
            let fiber = el[reactFiberKey];
            let componentName = null;
            let componentFile = null;

            // Walk up fiber tree to find component
            while (fiber) {
              if (fiber.type && typeof fiber.type === 'function') {
                componentName = fiber.type.displayName || fiber.type.name || 'Anonymous';
                // Try to get source file from _debugSource
                if (fiber._debugSource) {
                  componentFile = fiber._debugSource.fileName;
                }
                break;
              }
              // Also check for forwardRef/memo wrapped components
              if (fiber.type && fiber.type.$$typeof) {
                const inner = fiber.type.render || fiber.type.type;
                if (inner && typeof inner === 'function') {
                  componentName = inner.displayName || inner.name || 'Anonymous';
                  break;
                }
              }
              fiber = fiber.return;
            }

            // Try to get props (safely)
            let props = null;
            try {
              if (fiber && fiber.memoizedProps) {
                props = JSON.parse(JSON.stringify(fiber.memoizedProps, (key, value) => {
                  if (typeof value === 'function') return '[Function]';
                  if (value instanceof Element) return '[Element]';
                  return value;
                }));
              }
            } catch (e) {}

            return {
              name: 'react',
              componentName,
              componentFile,
              props
            };
          }

          // Detect Vue 3
          if (el.__vueParentComponent || el._vnode) {
            const instance = el.__vueParentComponent;
            let componentName = null;
            if (instance && instance.type) {
              componentName = instance.type.name || instance.type.__name || 'Anonymous';
            }
            return {
              name: 'vue',
              componentName
            };
          }

          // Detect Vue 2
          if (el.__vue__) {
            const componentName = el.__vue__.$options.name || el.__vue__.$options._componentTag || 'Anonymous';
            return {
              name: 'vue',
              componentName
            };
          }

          // Detect Svelte
          const svelteKey = Object.keys(el).find(k => k.startsWith('__svelte'));
          if (svelteKey) {
            return {
              name: 'svelte',
              componentName: 'SvelteComponent'
            };
          }

          // Detect Angular
          if (el.getAttribute && el.getAttribute('ng-version')) {
            return { name: 'angular' };
          }
          const ngKey = Object.keys(el).find(k => k.startsWith('__ng'));
          if (ngKey) {
            return { name: 'angular' };
          }

          return null;
        })()
      `,
      returnByValue: true,
    });

    return (result.result.value as FrameworkInfo) || undefined;
  }

  private async getElementInfo(nodeId: number): Promise<ElementInfo> {
    if (!this.client) throw new Error('Not connected');

    const { DOM, CSS, Runtime } = this.client;

    // Get node details
    const { node } = await DOM.describeNode({ nodeId, depth: 0 });

    // Get computed styles
    const { computedStyle } = await CSS.getComputedStyleForNode({ nodeId });
    const styles: Record<string, string> = {};
    for (const s of computedStyle) {
      styles[s.name] = s.value;
    }

    // Get bounding box
    const { model } = await DOM.getBoxModel({ nodeId });
    const content = model.content;

    // Get outer HTML
    const { outerHTML } = await DOM.getOuterHTML({ nodeId });

    // Generate unique selector
    const selectorResult = await Runtime.evaluate({
      expression: `
        (function() {
          const el = document.elementFromPoint(${content[0]}, ${content[1]});
          if (!el) return '';
          const path = [];
          let current = el;
          while (current && current !== document.body) {
            let sel = current.tagName.toLowerCase();
            if (current.id) {
              sel = '#' + current.id;
              path.unshift(sel);
              break;
            }
            if (current.className && typeof current.className === 'string') {
              sel += '.' + current.className.split(' ').filter(Boolean).join('.');
            }
            path.unshift(sel);
            current = current.parentElement;
          }
          return path.join(' > ');
        })()
      `,
    });

    // Parse attributes
    const attrs = node.attributes ?? [];
    const attributes: Record<string, string> = {};
    for (let i = 0; i < attrs.length; i += 2) {
      const key = attrs[i];
      const val = attrs[i + 1];
      if (key !== undefined && val !== undefined) {
        attributes[key] = val;
      }
    }

    // Find ID and classes from attributes
    const id = attributes['id'];
    const classAttr = attributes['class'] ?? '';
    const classes = classAttr.split(' ').filter(Boolean);

    // Detect React/Vue/Svelte/Angular component
    const framework = await this.detectFramework(content[0] ?? 0, content[1] ?? 0);

    return {
      selector: String(selectorResult.result.value ?? ''),
      xpath: '',
      tagName: node.nodeName.toLowerCase(),
      id,
      classes,
      attributes,
      computedStyles: {
        display: styles['display'] ?? '',
        position: styles['position'] ?? '',
        width: styles['width'] ?? '',
        height: styles['height'] ?? '',
        margin: `${styles['margin-top'] ?? ''} ${styles['margin-right'] ?? ''} ${styles['margin-bottom'] ?? ''} ${styles['margin-left'] ?? ''}`,
        padding: `${styles['padding-top'] ?? ''} ${styles['padding-right'] ?? ''} ${styles['padding-bottom'] ?? ''} ${styles['padding-left'] ?? ''}`,
        color: styles['color'] ?? '',
        backgroundColor: styles['background-color'] ?? '',
        fontSize: styles['font-size'] ?? '',
        fontFamily: styles['font-family'] ?? '',
      },
      boundingBox: {
        x: content[0] ?? 0,
        y: content[1] ?? 0,
        width: (content[2] ?? 0) - (content[0] ?? 0),
        height: (content[5] ?? 0) - (content[1] ?? 0),
      },
      innerText: node.nodeValue ?? undefined,
      innerHTML: outerHTML,
      parentChain: [],
      siblingCount: 0,
      childCount: node.childNodeCount ?? 0,
      framework,
    };
  }

  async highlight(selector: string, options: HighlightOptions = {}): Promise<void> {
    if (!this.client) throw new Error('Not connected');

    const color = options.color ?? '#3b82f6';

    await this.client.Runtime.evaluate({
      expression: `
        (function() {
          const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!el) return;
          el.style.outline = '2px solid ${color}';
          el.style.outlineOffset = '2px';
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          ${options.duration ? `setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, ${options.duration});` : ''}
        })()
      `,
    });
  }

  async clearHighlights(): Promise<void> {
    if (!this.client) throw new Error('Not connected');

    await this.client.Runtime.evaluate({
      expression: `
        document.querySelectorAll('[style*="outline"]').forEach(el => {
          el.style.outline = '';
          el.style.outlineOffset = '';
        });
      `,
    });
  }

  async screenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
    if (!this.client) throw new Error('Not connected');

    const { Page, DOM } = this.client;

    let clip: { x: number; y: number; width: number; height: number; scale: number } | undefined;

    if (options.selector) {
      const { root } = await DOM.getDocument();
      const { nodeId } = await DOM.querySelector({ nodeId: root.nodeId, selector: options.selector });
      if (nodeId) {
        const { model } = await DOM.getBoxModel({ nodeId });
        const content = model.content;
        clip = {
          x: content[0] ?? 0,
          y: content[1] ?? 0,
          width: (content[2] ?? 0) - (content[0] ?? 0),
          height: (content[5] ?? 0) - (content[1] ?? 0),
          scale: 1,
        };
      }
    }

    const { data } = await Page.captureScreenshot({
      format: options.format ?? 'png',
      quality: options.quality,
      clip,
    });

    return Buffer.from(data, 'base64');
  }

  onConsoleMessage(callback: (msg: ConsoleMessage) => void): void {
    this.consoleCallbacks.push(callback);
  }

  async getConsoleLogs(options: ConsoleLogOptions = {}): Promise<ConsoleMessage[]> {
    let logs = [...this.consoleLogs];

    if (options.level && options.level !== 'all') {
      logs = logs.filter((log) => log.level === options.level);
    }

    if (options.since) {
      const since = options.since;
      logs = logs.filter((log) => log.timestamp >= since);
    }

    if (options.limit) {
      logs = logs.slice(-options.limit);
    }

    return logs;
  }

  async executeScript<T>(script: string): Promise<T> {
    if (!this.client) throw new Error('Not connected');

    const { result } = await this.client.Runtime.evaluate({
      expression: script,
      returnByValue: true,
    });

    return result.value as T;
  }

  onNavigate(callback: (url: string) => void): void {
    this.navigateCallbacks.push(callback);
  }

  onLoad(callback: () => void): void {
    this.loadCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  // Automation methods

  async click(selector: string, options: ClickOptions = {}): Promise<void> {
    if (!this.client) throw new Error('Not connected');

    const { button = 'left', clickCount = 1, delay } = options;

    // Get element center coordinates
    const { result } = await this.client.Runtime.evaluate({
      expression: `(() => {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
      })()`,
      returnByValue: true,
    });

    if (!result.value) throw new Error(`Element not found: ${selector}`);
    const { x, y } = result.value as { x: number; y: number };

    if (delay) await new Promise((r) => setTimeout(r, delay));

    await this.client.Input.dispatchMouseEvent({
      type: 'mousePressed',
      x,
      y,
      button,
      clickCount,
    });
    await this.client.Input.dispatchMouseEvent({
      type: 'mouseReleased',
      x,
      y,
      button,
      clickCount,
    });
  }

  async type(selector: string, text: string, options: TypeOptions = {}): Promise<void> {
    if (!this.client) throw new Error('Not connected');

    const { clearFirst = false, delay = 0 } = options;

    // Focus element
    await this.client.Runtime.evaluate({
      expression: `document.querySelector('${selector.replace(/'/g, "\\'")}')?.focus()`,
    });

    // Clear if requested
    if (clearFirst) {
      await this.client.Runtime.evaluate({
        expression: `document.querySelector('${selector.replace(/'/g, "\\'")}').value = ''`,
      });
    }

    // Type each character
    for (const char of text) {
      await this.client.Input.dispatchKeyEvent({ type: 'char', text: char });
      if (delay) await new Promise((r) => setTimeout(r, delay));
    }
  }

  async waitFor(selector: string, options: WaitForOptions = {}): Promise<ElementInfo> {
    const { timeout = 5000, visible = true } = options;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        const element = await this.inspectElement(selector);
        if (!visible || element.computedStyles.display !== 'none') {
          return element;
        }
      } catch {
        // Element not found yet, continue waiting
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    throw new Error(`Element not found within ${timeout}ms: ${selector}`);
  }
}
