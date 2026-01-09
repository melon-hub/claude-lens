/**
 * Type declarations for renderer process
 * Matches the API exposed via preload script
 */

export interface ComponentInfo {
  name: string;
  source?: { fileName: string; lineNumber: number };
  props?: Record<string, unknown>;
}

export interface FrameworkInfo {
  framework: 'React' | 'Vue';
  components: ComponentInfo[];
}

export interface ElementInfo {
  tagName: string;
  id?: string;
  classes: string[];
  selector: string;
  text: string;
  attributes?: Record<string, string>;
  styles?: Record<string, string>;
  position?: { x: number; y: number; width: number; height: number };
  framework?: FrameworkInfo;
}

export interface ClaudeLensAPI {
  version: string;
  pty: {
    start: () => Promise<{ success: boolean; error?: string }>;
    write: (data: string) => Promise<{ success: boolean }>;
    resize: (cols: number, rows: number) => Promise<void>;
    onData: (callback: (data: string) => void) => void;
    onExit: (callback: (code: number) => void) => void;
  };
  browser: {
    navigate: (url: string) => Promise<{ success: boolean; error?: string }>;
    getURL: () => Promise<string | null>;
    screenshot: () => Promise<string | null>;
    inspect: (x: number, y: number) => Promise<ElementInfo | null>;
    highlight: (selector: string) => Promise<void>;
    getBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
    updateBounds: (width: number, drawerHeight?: number) => Promise<void>;
    enableInspect: () => Promise<{ success: boolean; error?: string }>;
    disableInspect: () => Promise<void>;
    onElementSelected: (callback: (element: ElementInfo) => void) => void;
    onConsoleMessage: (callback: (msg: { level: string; message: string; timestamp: number }) => void) => void;
  };
  sendToClaude: (prompt: string, elementContext: string) => Promise<{ success: boolean }>;
}

declare global {
  interface Window {
    claudeLens: ClaudeLensAPI;
  }
}
