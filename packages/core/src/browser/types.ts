/**
 * Browser adapter types
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameworkInfo {
  name: 'react' | 'vue' | 'svelte' | 'angular' | 'unknown';
  componentName?: string;
  componentFile?: string;
  props?: Record<string, unknown>;
  state?: Record<string, unknown>;
}

/**
 * Parent element in the DOM hierarchy chain
 */
export interface ParentChainItem {
  tagName: string;
  selector: string;
  description: string;
}

export interface ElementInfo {
  selector: string;
  xpath: string;
  tagName: string;
  id?: string;
  classes: string[];
  attributes: Record<string, string>;
  computedStyles: ComputedStyles;
  boundingBox: BoundingBox;
  innerText?: string;
  innerHTML?: string;
  /** Human-readable description of the element's purpose */
  description?: string;
  /** Parent elements with human-readable descriptions (immediate parent first) */
  parentChain: ParentChainItem[];
  siblingCount: number;
  childCount: number;
  // Framework detection (React, Vue, Svelte, etc.)
  framework?: FrameworkInfo;
}

export interface ComputedStyles {
  display: string;
  position: string;
  width: string;
  height: string;
  margin: string;
  padding: string;
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontFamily: string;
  [key: string]: string;
}

export interface ConsoleMessage {
  level: 'error' | 'warn' | 'log' | 'info' | 'debug';
  text: string;
  source: string;
  line?: number;
  column?: number;
  timestamp: number;
  stackTrace?: string;
}

export interface NavigateOptions {
  waitFor?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
}

export interface NavigateResult {
  success: boolean;
  finalUrl: string;
  title: string;
  loadTime: number;
}

export interface HighlightOptions {
  style?: 'outline' | 'overlay' | 'pulse';
  color?: string;
  duration?: number;
  label?: string;
}

export interface ScreenshotOptions {
  selector?: string;
  format?: 'png' | 'jpeg';
  quality?: number;
}

export interface ConsoleLogOptions {
  level?: 'all' | 'error' | 'warn' | 'log';
  limit?: number;
  since?: number;
}

// Automation options
export interface ClickOptions {
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  delay?: number;
}

export interface TypeOptions {
  clearFirst?: boolean;
  delay?: number;
}

export interface WaitForOptions {
  timeout?: number;
  visible?: boolean;
}

/**
 * Browser adapter interface - implemented by CDP adapter, Electron adapter, etc.
 */
export interface BrowserAdapter {
  // Lifecycle
  connect(target: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Navigation
  navigate(url: string, options?: NavigateOptions): Promise<NavigateResult>;
  reload(): Promise<void>;
  getCurrentUrl(): string;

  // Inspection
  inspectElement(selector: string): Promise<ElementInfo>;
  inspectElementAtPoint(x: number, y: number): Promise<ElementInfo | null>;

  // Highlighting
  highlight(selector: string, options?: HighlightOptions): Promise<void>;
  clearHighlights(): Promise<void>;

  // Screenshots
  screenshot(options?: ScreenshotOptions): Promise<Buffer>;

  // Console
  onConsoleMessage(callback: (msg: ConsoleMessage) => void): void;
  getConsoleLogs(options?: ConsoleLogOptions): Promise<ConsoleMessage[]>;

  // Scripts
  executeScript<T>(script: string): Promise<T>;

  // Events
  onNavigate(callback: (url: string) => void): void;
  onLoad(callback: () => void): void;
  onError(callback: (error: Error) => void): void;

  // Automation
  click(selector: string, options?: ClickOptions): Promise<void>;
  type(selector: string, text: string, options?: TypeOptions): Promise<void>;
  waitFor(selector: string, options?: WaitForOptions): Promise<ElementInfo>;
}
