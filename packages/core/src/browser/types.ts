/**
 * Browser adapter types
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
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
  parentChain: string[];
  siblingCount: number;
  childCount: number;
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
}
