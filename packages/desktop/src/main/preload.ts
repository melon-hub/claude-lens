/**
 * Preload Script - Secure IPC Bridge
 *
 * Exposes safe APIs to the renderer process.
 */

import { contextBridge, ipcRenderer } from 'electron';

// App version from package.json
const APP_VERSION = '0.1.7';

// Expose protected APIs to renderer
contextBridge.exposeInMainWorld('claudeLens', {
  version: APP_VERSION,
  // PTY (Claude Code) APIs
  pty: {
    start: () => ipcRenderer.invoke('pty:start'),
    write: (data: string) => ipcRenderer.invoke('pty:write', data),
    resize: (cols: number, rows: number) => ipcRenderer.invoke('pty:resize', cols, rows),
    onData: (callback: (data: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
      ipcRenderer.on('pty:data', handler);
      return () => ipcRenderer.removeListener('pty:data', handler);
    },
    onExit: (callback: (code: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, code: number) => callback(code);
      ipcRenderer.on('pty:exit', handler);
      return () => ipcRenderer.removeListener('pty:exit', handler);
    },
    onAutoStarted: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('pty:autoStarted', handler);
      return () => ipcRenderer.removeListener('pty:autoStarted', handler);
    },
  },

  // Embedded Browser APIs
  browser: {
    navigate: (url: string) => ipcRenderer.invoke('browser:navigate', url),
    reload: () => ipcRenderer.invoke('browser:reload'),
    getURL: () => ipcRenderer.invoke('browser:getURL'),
    screenshot: () => ipcRenderer.invoke('browser:screenshot'),
    inspect: (x: number, y: number) => ipcRenderer.invoke('browser:inspect', x, y),
    highlight: (selector: string) => ipcRenderer.invoke('browser:highlight', selector),
    getBounds: () => ipcRenderer.invoke('browser:getBounds'),
    updateBounds: (width: number, drawerHeight?: number, panelWidth?: number) => ipcRenderer.invoke('browser:updateBounds', width, drawerHeight || 0, panelWidth || width),
    enableInspect: () => ipcRenderer.invoke('browser:enableInspect'),
    disableInspect: () => ipcRenderer.invoke('browser:disableInspect'),
    freezeHover: () => ipcRenderer.invoke('browser:freezeHover'),
    unfreezeHover: () => ipcRenderer.invoke('browser:unfreezeHover'),
    setVisible: (visible: boolean) => ipcRenderer.invoke('browser:setVisible', visible),
    onElementSelected: (callback: (element: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, element: unknown) => callback(element);
      ipcRenderer.on('element-selected', handler);
      return () => ipcRenderer.removeListener('element-selected', handler);
    },
    onConsoleMessage: (callback: (msg: { level: string; message: string; timestamp: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, msg: { level: string; message: string; timestamp: number }) => callback(msg);
      ipcRenderer.on('console-message', handler);
      return () => ipcRenderer.removeListener('console-message', handler);
    },
    onFreezeToggle: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('freeze-toggle', handler);
      return () => ipcRenderer.removeListener('freeze-toggle', handler);
    },
    onToastCaptured: (callback: (toast: { text: string; type: string; timestamp: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, toast: { text: string; type: string; timestamp: number }) => callback(toast);
      ipcRenderer.on('toast-captured', handler);
      return () => ipcRenderer.removeListener('toast-captured', handler);
    },
    // Playwright connection status
    onPlaywrightConnecting: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('playwright:connecting', handler);
      return () => ipcRenderer.removeListener('playwright:connecting', handler);
    },
    onPlaywrightConnected: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('playwright:connected', handler);
      return () => ipcRenderer.removeListener('playwright:connected', handler);
    },
    onPlaywrightError: (callback: (data: { message: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data);
      ipcRenderer.on('playwright:error', handler);
      return () => ipcRenderer.removeListener('playwright:error', handler);
    },
    onSetViewport: (callback: (width: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, width: number) => callback(width);
      ipcRenderer.on('browser:setViewport', handler);
      return () => ipcRenderer.removeListener('browser:setViewport', handler);
    },
    onResetViewport: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('browser:resetViewport', handler);
      return () => ipcRenderer.removeListener('browser:resetViewport', handler);
    },
    onPageLoaded: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('browser:loaded', handler);
      return () => ipcRenderer.removeListener('browser:loaded', handler);
    },
  },

  // Project management APIs
  project: {
    open: (folderPath: string) => ipcRenderer.invoke('project:open', folderPath),
    start: (options: { useDevServer: boolean }) => ipcRenderer.invoke('project:start', options),
    getInfo: () => ipcRenderer.invoke('project:getInfo'),
    stopServer: () => ipcRenderer.invoke('project:stopServer'),
    restartServer: () => ipcRenderer.invoke('project:restartServer'),
    getRecent: () => ipcRenderer.invoke('project:getRecent') as Promise<Array<{ name: string; path: string; useDevServer: boolean; lastOpened: number }>>,
    openRecent: (projectPath: string) => ipcRenderer.invoke('project:openRecent', projectPath) as Promise<{ success: boolean; error?: string }>,
    onDetected: (callback: (info: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: unknown) => callback(info);
      ipcRenderer.on('project:detected', handler);
      return () => ipcRenderer.removeListener('project:detected', handler);
    },
    onClosed: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('project:closed', handler);
      return () => ipcRenderer.removeListener('project:closed', handler);
    },
    onLoading: (callback: (info: { name: string; useDevServer: boolean }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: { name: string; useDevServer: boolean }) => callback(info);
      ipcRenderer.on('project:loading', handler);
      return () => ipcRenderer.removeListener('project:loading', handler);
    },
    onLoadingError: (callback: (error: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, error: string) => callback(error);
      ipcRenderer.on('project:loadingError', handler);
      return () => ipcRenderer.removeListener('project:loadingError', handler);
    },
  },

  // Server events (dev server / static server)
  server: {
    onOutput: (callback: (data: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
      ipcRenderer.on('server:output', handler);
      return () => ipcRenderer.removeListener('server:output', handler);
    },
    onReady: (callback: (info: { port: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: { port: number }) => callback(info);
      ipcRenderer.on('server:ready', handler);
      return () => ipcRenderer.removeListener('server:ready', handler);
    },
    onExit: (callback: (info: { code: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: { code: number }) => callback(info);
      ipcRenderer.on('server:exit', handler);
      return () => ipcRenderer.removeListener('server:exit', handler);
    },
    onProgress: (callback: (progress: { elapsed: number; status: string; phase: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: { elapsed: number; status: string; phase: string }) => callback(progress);
      ipcRenderer.on('server:progress', handler);
      return () => ipcRenderer.removeListener('server:progress', handler);
    },
  },

  // The key integration - send prompt to Claude with element context
  sendToClaude: (prompt: string, elementContext: string) =>
    ipcRenderer.invoke('send-to-claude', prompt, elementContext),

  // Clipboard APIs for image paste
  clipboard: {
    hasImage: () => ipcRenderer.invoke('clipboard:hasImage') as Promise<boolean>,
    saveImage: () => ipcRenderer.invoke('clipboard:saveImage') as Promise<{ success: boolean; path?: string; error?: string }>,
    readText: () => ipcRenderer.invoke('clipboard:readText') as Promise<string>,
  },
});

// Cleanup function type for event listeners
type CleanupFn = () => void;

// TypeScript types for the exposed API
export interface ClaudeLensAPI {
  version: string;
  pty: {
    start: () => Promise<{ success: boolean; error?: string }>;
    write: (data: string) => Promise<{ success: boolean }>;
    resize: (cols: number, rows: number) => Promise<void>;
    onData: (callback: (data: string) => void) => CleanupFn;
    onExit: (callback: (code: number) => void) => CleanupFn;
    onAutoStarted: (callback: () => void) => CleanupFn;
  };
  browser: {
    navigate: (url: string) => Promise<{ success: boolean; error?: string }>;
    getURL: () => Promise<string>;
    screenshot: () => Promise<string | null>;
    inspect: (x: number, y: number) => Promise<{
      tagName: string;
      id?: string;
      classes: string[];
      selector: string;
      text: string;
      attributes?: Record<string, string>;
      styles?: Record<string, string>;
      position?: { x: number; y: number; width: number; height: number };
    } | null>;
    highlight: (selector: string) => Promise<void>;
    getBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
    updateBounds: (width: number, drawerHeight?: number) => Promise<void>;
    enableInspect: () => Promise<{ success: boolean; error?: string }>;
    disableInspect: () => Promise<void>;
    freezeHover: () => Promise<void>;
    unfreezeHover: () => Promise<void>;
    setVisible: (visible: boolean) => Promise<void>;
    onElementSelected: (callback: (element: unknown) => void) => CleanupFn;
    onConsoleMessage: (callback: (msg: { level: string; message: string; timestamp: number }) => void) => CleanupFn;
    onFreezeToggle: (callback: () => void) => CleanupFn;
    onToastCaptured: (callback: (toast: { text: string; type: string; timestamp: number }) => void) => CleanupFn;
    onPlaywrightConnecting: (callback: () => void) => CleanupFn;
    onPlaywrightConnected: (callback: () => void) => CleanupFn;
    onPlaywrightError: (callback: (data: { message: string }) => void) => CleanupFn;
  };
  project: {
    open: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
    start: (options: { useDevServer: boolean }) => Promise<{ success: boolean; url?: string; error?: string }>;
    getInfo: () => Promise<ProjectInfo | null>;
    stopServer: () => Promise<{ success: boolean; error?: string }>;
    onDetected: (callback: (info: ProjectInfo) => void) => CleanupFn;
  };
  server: {
    onOutput: (callback: (data: string) => void) => CleanupFn;
    onReady: (callback: (info: { port: number }) => void) => CleanupFn;
    onExit: (callback: (info: { code: number }) => void) => CleanupFn;
    onProgress: (callback: (progress: { elapsed: number; status: string; phase: string }) => void) => CleanupFn;
  };
  sendToClaude: (prompt: string, elementContext: string) => Promise<{ success: boolean }>;
  clipboard: {
    hasImage: () => Promise<boolean>;
    saveImage: () => Promise<{ success: boolean; path?: string; error?: string }>;
    readText: () => Promise<string>;
  };
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

declare global {
  interface Window {
    claudeLens: ClaudeLensAPI;
  }
}
