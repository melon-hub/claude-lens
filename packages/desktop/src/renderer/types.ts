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

export interface ParentChainItem {
  tagName: string;
  selector: string;
  description: string;
}

/** Form field state information */
export interface FormState {
  type: string;
  value: string;
  placeholder?: string;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  validationState: 'valid' | 'invalid' | 'pending' | null;
  validationMessage?: string;
  checked?: boolean;
  selectedIndex?: number;
  options?: string[];
}

/** Overlay/modal context information (Phase 4) */
export interface OverlayInfo {
  type: 'modal' | 'dialog' | 'drawer' | 'popover' | 'tooltip' | 'dropdown';
  isBackdrop: boolean;
  triggeredBy?: string;
  canDismiss: boolean;
}

/** Z-index stacking context (Phase 4) */
export interface StackingInfo {
  zIndex: string;
  stackingContext: Array<{
    description: string;
    zIndex: string;
    selector: string;
  }>;
}

/** iFrame context information (Phase 4) */
export interface IframeInfo {
  src?: string;
  name?: string;
  sandboxed: boolean;
  crossOrigin: boolean;
}

/** Shadow DOM context information (Phase 4) */
export interface ShadowDOMInfo {
  isInShadowDOM: boolean;
  shadowHost?: string;
  shadowRootMode?: 'open' | 'closed';
  hasShadowRoot: boolean;
  shadowChildCount?: number;
}

/** Scroll context information (Phase 4) */
export interface ScrollInfo {
  isScrollable: boolean;
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  isInViewport: boolean;
  visiblePercentage: number;
}

/** Toast notification captured (Phase 4) */
export interface ToastCapture {
  text: string;
  type: 'error' | 'success' | 'warning' | 'info';
  timestamp: number;
}

export interface ElementInfo {
  tagName: string;
  id?: string;
  classes: string[];
  selector: string;
  text: string;
  /** Human-readable description of the element's purpose */
  description?: string;
  /** Parent elements with human-readable descriptions (immediate parent first) */
  parentChain?: ParentChainItem[];
  attributes?: Record<string, string>;
  styles?: Record<string, string>;
  position?: { x: number; y: number; width: number; height: number };
  framework?: FrameworkInfo;
  /** Result of interaction attempt (for inspect sequence) */
  interactionResult?: string;
  /** Form field state (for inputs, selects, textareas) */
  formState?: FormState;
  /** Whether element is in a loading state */
  isLoading?: boolean;
  /** Overlay/modal context (Phase 4) */
  overlay?: OverlayInfo;
  /** Z-index stacking context (Phase 4) */
  stacking?: StackingInfo;
  /** iFrame context (Phase 4) */
  iframe?: IframeInfo;
  /** Shadow DOM context (Phase 4) */
  shadowDOM?: ShadowDOMInfo;
  /** Scroll context (Phase 4) */
  scroll?: ScrollInfo;
}

/** Captured interaction in inspect sequence */
export interface CapturedInteraction {
  element: ElementInfo;
  action: 'click';
  result: string;
  timestamp: number;
}

export interface ProjectInfo {
  path: string;
  name: string;
  type: 'node' | 'static' | 'unknown';
  packageJson?: {
    name: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  devCommand?: string;
  suggestedPort?: number;
  framework?: 'react' | 'vue' | 'svelte' | 'next' | 'vite' | 'angular' | 'unknown';
  entryFile?: string;
}

export interface ClaudeLensAPI {
  version: string;
  pty: {
    start: () => Promise<{ success: boolean; error?: string }>;
    write: (data: string) => void;
    resize: (cols: number, rows: number) => Promise<void>;
    onData: (callback: (data: string) => void) => void;
    onExit: (callback: (code: number) => void) => void;
    onAutoStarted: (callback: () => void) => void;
  };
  browser: {
    navigate: (url: string) => Promise<{ success: boolean; error?: string }>;
    reload: () => Promise<{ success: boolean; error?: string }>;
    getURL: () => Promise<string | null>;
    screenshot: () => Promise<string | null>;
    inspect: (x: number, y: number) => Promise<ElementInfo | null>;
    highlight: (selector: string) => Promise<void>;
    getBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
    updateBounds: (width: number, drawerHeight?: number, panelWidth?: number) => Promise<void>;
    enableInspect: () => Promise<{ success: boolean; error?: string }>;
    disableInspect: () => Promise<void>;
    setVisible: (visible: boolean) => Promise<void>;
    onElementSelected: (callback: (element: ElementInfo) => void) => void;
    onConsoleMessage: (callback: (msg: { level: string; message: string; timestamp: number }) => void) => void;
    onToastCaptured: (callback: (toast: ToastCapture) => void) => void;
    onPlaywrightConnecting: (callback: () => void) => void;
    onPlaywrightConnected: (callback: () => void) => void;
    onPlaywrightError: (callback: (data: { message: string }) => void) => void;
    onSetViewport: (callback: (width: number) => void) => void;
    onResetViewport: (callback: () => void) => void;
    onPageLoaded: (callback: () => void) => void;
  };
  project: {
    open: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
    start: (options: { useDevServer: boolean }) => Promise<{ success: boolean; url?: string; error?: string }>;
    getInfo: () => Promise<ProjectInfo | null>;
    stopServer: () => Promise<{ success: boolean; error?: string }>;
    restartServer: () => Promise<{ success: boolean; error?: string }>;
    getRecent: () => Promise<Array<{ name: string; path: string; useDevServer: boolean; lastOpened: number }>>;
    openRecent: (projectPath: string) => Promise<{ success: boolean; error?: string }>;
    onDetected: (callback: (info: ProjectInfo) => void) => void;
    onClosed: (callback: () => void) => void;
    onLoading: (callback: (info: { name: string; useDevServer: boolean }) => void) => void;
    onLoadingError: (callback: (error: string) => void) => void;
  };
  server: {
    onOutput: (callback: (data: string) => void) => void;
    onReady: (callback: (info: { port: number }) => void) => void;
    onExit: (callback: (info: { code: number }) => void) => void;
    onProgress: (callback: (progress: { elapsed: number; status: string; phase: string }) => void) => void;
  };
  sendToClaude: (prompt: string, elementContext: string) => Promise<{ success: boolean }>;
  clipboard: {
    hasImage: () => Promise<boolean>;
    saveImage: () => Promise<{ success: boolean; path?: string; error?: string }>;
    readText: () => Promise<string>;
  };
}

declare global {
  interface Window {
    claudeLens: ClaudeLensAPI;
  }
}
