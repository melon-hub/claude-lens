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
      ipcRenderer.on('pty:data', (_event, data) => callback(data));
    },
    onExit: (callback: (code: number) => void) => {
      ipcRenderer.on('pty:exit', (_event, code) => callback(code));
    },
    onAutoStarted: (callback: () => void) => {
      ipcRenderer.on('pty:autoStarted', () => callback());
    },
  },

  // Embedded Browser APIs
  browser: {
    navigate: (url: string) => ipcRenderer.invoke('browser:navigate', url),
    getURL: () => ipcRenderer.invoke('browser:getURL'),
    screenshot: () => ipcRenderer.invoke('browser:screenshot'),
    inspect: (x: number, y: number) => ipcRenderer.invoke('browser:inspect', x, y),
    highlight: (selector: string) => ipcRenderer.invoke('browser:highlight', selector),
    getBounds: () => ipcRenderer.invoke('browser:getBounds'),
    updateBounds: (width: number, drawerHeight?: number) => ipcRenderer.invoke('browser:updateBounds', width, drawerHeight || 0),
    enableInspect: () => ipcRenderer.invoke('browser:enableInspect'),
    disableInspect: () => ipcRenderer.invoke('browser:disableInspect'),
    freezeHover: () => ipcRenderer.invoke('browser:freezeHover'),
    unfreezeHover: () => ipcRenderer.invoke('browser:unfreezeHover'),
    onElementSelected: (callback: (element: unknown) => void) => {
      ipcRenderer.on('element-selected', (_event, element) => callback(element));
    },
    onConsoleMessage: (callback: (msg: { level: string; message: string; timestamp: number }) => void) => {
      ipcRenderer.on('console-message', (_event, msg) => callback(msg));
    },
    onFreezeToggle: (callback: () => void) => {
      ipcRenderer.on('freeze-toggle', () => callback());
    },
    onToastCaptured: (callback: (toast: { text: string; type: string; timestamp: number }) => void) => {
      ipcRenderer.on('toast-captured', (_event, toast) => callback(toast));
    },
  },

  // Project management APIs
  project: {
    open: (folderPath: string) => ipcRenderer.invoke('project:open', folderPath),
    start: (options: { useDevServer: boolean }) => ipcRenderer.invoke('project:start', options),
    getInfo: () => ipcRenderer.invoke('project:getInfo'),
    stopServer: () => ipcRenderer.invoke('project:stopServer'),
    onDetected: (callback: (info: unknown) => void) => {
      ipcRenderer.on('project:detected', (_event, info) => callback(info));
    },
  },

  // Server events (dev server / static server)
  server: {
    onOutput: (callback: (data: string) => void) => {
      ipcRenderer.on('server:output', (_event, data) => callback(data));
    },
    onReady: (callback: (info: { port: number }) => void) => {
      ipcRenderer.on('server:ready', (_event, info) => callback(info));
    },
    onExit: (callback: (info: { code: number }) => void) => {
      ipcRenderer.on('server:exit', (_event, info) => callback(info));
    },
  },

  // The key integration - send prompt to Claude with element context
  sendToClaude: (prompt: string, elementContext: string) =>
    ipcRenderer.invoke('send-to-claude', prompt, elementContext),
});

// TypeScript types for the exposed API
export interface ClaudeLensAPI {
  pty: {
    start: () => Promise<{ success: boolean; error?: string }>;
    write: (data: string) => Promise<{ success: boolean }>;
    resize: (cols: number, rows: number) => Promise<void>;
    onData: (callback: (data: string) => void) => void;
    onExit: (callback: (code: number) => void) => void;
    onAutoStarted: (callback: () => void) => void;
  };
  browser: {
    navigate: (url: string) => Promise<{ success: boolean; error?: string }>;
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
    onElementSelected: (callback: (element: unknown) => void) => void;
  };
  project: {
    open: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
    start: (options: { useDevServer: boolean }) => Promise<{ success: boolean; url?: string; error?: string }>;
    getInfo: () => Promise<ProjectInfo | null>;
    stopServer: () => Promise<{ success: boolean; error?: string }>;
    onDetected: (callback: (info: ProjectInfo) => void) => void;
  };
  server: {
    onOutput: (callback: (data: string) => void) => void;
    onReady: (callback: (info: { port: number }) => void) => void;
    onExit: (callback: (info: { code: number }) => void) => void;
  };
  sendToClaude: (prompt: string, elementContext: string) => Promise<{ success: boolean }>;
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
