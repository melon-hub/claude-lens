/**
 * Claude Lens Desktop - Main Process
 *
 * Spawns Claude Code in a pty we control, enabling seamless
 * communication from the browser panel to Claude.
 *
 * Uses embedded BrowserView for the browser panel - no external Chrome needed.
 */

import { app, BrowserWindow, BrowserView, ipcMain, shell, dialog, clipboard } from 'electron';
import * as path from 'path';
import { PtyManager } from './pty-manager';
import { startMCPServer, stopMCPServer, setBrowserView, setConsoleBuffer } from './mcp-server';

// Enable hot reload in development
if (process.env.NODE_ENV === 'development') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, '../../node_modules/.bin/electron'),
      forceHardReset: true,
      hardResetMethod: 'exit',
    });
  } catch {
    // electron-reload not available
  }
}

// Custom error handler with copyable messages
process.on('uncaughtException', (error) => {
  const errorMessage = `${error.name}: ${error.message}\n\nStack:\n${error.stack}`;
  console.error('Uncaught Exception:', errorMessage);

  dialog.showMessageBox({
    type: 'error',
    title: 'Error',
    message: 'An error occurred',
    detail: errorMessage,
    buttons: ['Copy & Close', 'Close'],
    defaultId: 0,
  }).then((result) => {
    if (result.response === 0) {
      clipboard.writeText(errorMessage);
    }
  });
});

let mainWindow: BrowserWindow | null = null;
let browserView: BrowserView | null = null;
let ptyManager: PtyManager | null = null;

// Console message buffer for MCP server
interface ConsoleMessage {
  level: string;
  message: string;
  timestamp: number;
}
const consoleBuffer: ConsoleMessage[] = [];
const MAX_CONSOLE_MESSAGES = 100;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Claude Lens',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Initialize pty manager
  ptyManager = new PtyManager();

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
    browserView = null;
    ptyManager?.dispose();
  });

  // Handle resize to update BrowserView bounds
  mainWindow.on('resize', () => updateBrowserViewBounds());
  mainWindow.on('maximize', () => setTimeout(() => updateBrowserViewBounds(), 100));
  mainWindow.on('unmaximize', () => setTimeout(() => updateBrowserViewBounds(), 100));
  mainWindow.on('restore', () => setTimeout(() => updateBrowserViewBounds(), 100));
}

// Track browser panel width and console drawer height for bounds calculation
let browserPanelWidth = 0;
let consoleDrawerHeight = 0;

function updateBrowserViewBounds(panelWidth?: number, drawerHeight?: number) {
  if (!mainWindow || !browserView) return;

  const bounds = mainWindow.getBounds();
  const headerHeight = 45;
  const panelHeaderHeight = 38; // padding 8px*2 + font ~18px + border 1px

  // Calculate browser panel width based on CSS flex layout:
  // browser-panel: flex 1 1 40%, context-panel: 280px fixed, claude-panel: flex 1 1 40%
  // Resizers: 4px each (8px total)
  const contextPanelWidth = 280;
  const resizerWidth = 8;
  const availableWidth = bounds.width - contextPanelWidth - resizerWidth;
  // Browser panel gets ~50% of remaining space (equal with claude panel)
  const defaultWidth = Math.floor(availableWidth * 0.5);
  const width = panelWidth || browserPanelWidth || defaultWidth;

  // Subtract console drawer height if open
  const effectiveDrawerHeight = drawerHeight !== undefined ? drawerHeight : consoleDrawerHeight;
  const height = bounds.height - headerHeight - panelHeaderHeight - effectiveDrawerHeight;

  // Validate bounds before setting (avoid NaN/negative values)
  if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
    return;
  }

  browserPanelWidth = width;
  if (drawerHeight !== undefined) {
    consoleDrawerHeight = drawerHeight;
  }

  browserView.setBounds({
    x: 0,
    y: headerHeight + panelHeaderHeight,
    width: Math.round(width),
    height: Math.round(height),
  });
}

// IPC handler to update browser panel width from renderer
ipcMain.handle('browser:updateBounds', async (_event, width: number, drawerHeight: number) => {
  browserPanelWidth = width;
  consoleDrawerHeight = drawerHeight;
  updateBrowserViewBounds(width, drawerHeight);
});

// Inject hover tracking script into BrowserView for element inspection tooltips
async function injectHoverTracking() {
  if (!browserView) return;

  await browserView.webContents.executeJavaScript(`
    (function() {
      // Remove existing hover tracking if any
      if (window.__claudeLensHoverCleanup) {
        window.__claudeLensHoverCleanup();
      }

      // Create tooltip element
      let tooltip = document.getElementById('claude-lens-tooltip');
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'claude-lens-tooltip';
        tooltip.style.cssText = 'position:fixed;padding:4px 8px;background:#1e1e1e;color:#3794ff;font-family:monospace;font-size:12px;border-radius:4px;pointer-events:none;z-index:999999;display:none;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:1px solid #3c3c3c;white-space:nowrap;';
        document.body.appendChild(tooltip);
      }

      // Create highlight element
      let highlight = document.getElementById('claude-lens-hover-highlight');
      if (!highlight) {
        highlight = document.createElement('div');
        highlight.id = 'claude-lens-hover-highlight';
        highlight.style.cssText = 'position:fixed;pointer-events:none;z-index:999998;border:2px solid #3794ff;background:rgba(55,148,255,0.1);display:none;';
        document.body.appendChild(highlight);
      }

      // Build selector string for display
      function getSelectorDisplay(element) {
        let selector = element.tagName.toLowerCase();
        if (element.id) selector += '#' + element.id;
        if (element.className && typeof element.className === 'string') {
          const classes = element.className.trim().split(/\\s+/).filter(c => c && !c.startsWith('claude-lens'));
          if (classes.length) selector += '.' + classes.slice(0, 3).join('.');
          if (classes.length > 3) selector += '...';
        }
        return selector;
      }

      let currentElement = null;

      function handleMouseMove(e) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el === tooltip || el === highlight || el.id?.startsWith('claude-lens')) {
          return;
        }

        if (el !== currentElement) {
          currentElement = el;

          // Update tooltip
          const selectorText = getSelectorDisplay(el);
          tooltip.textContent = '<' + selectorText + '>';
          tooltip.style.display = 'block';

          // Position tooltip near cursor but not overlapping
          const tooltipRect = tooltip.getBoundingClientRect();
          let left = e.clientX + 15;
          let top = e.clientY + 15;

          // Keep tooltip in viewport
          if (left + tooltipRect.width > window.innerWidth) {
            left = e.clientX - tooltipRect.width - 10;
          }
          if (top + tooltipRect.height > window.innerHeight) {
            top = e.clientY - tooltipRect.height - 10;
          }

          tooltip.style.left = left + 'px';
          tooltip.style.top = top + 'px';

          // Update highlight
          const rect = el.getBoundingClientRect();
          highlight.style.left = rect.left + 'px';
          highlight.style.top = rect.top + 'px';
          highlight.style.width = rect.width + 'px';
          highlight.style.height = rect.height + 'px';
          highlight.style.display = 'block';
        }
      }

      function handleMouseLeave() {
        tooltip.style.display = 'none';
        highlight.style.display = 'none';
        currentElement = null;
      }

      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('mouseleave', handleMouseLeave);

      // Cleanup function
      window.__claudeLensHoverCleanup = function() {
        document.removeEventListener('mousemove', handleMouseMove, true);
        document.removeEventListener('mouseleave', handleMouseLeave);
        tooltip?.remove();
        highlight?.remove();
      };
    })()
  `);
}

// IPC Handlers

// PTY (Claude Code) handlers
ipcMain.handle('pty:start', async () => {
  if (!ptyManager) return { success: false, error: 'PTY manager not initialized' };
  try {
    await ptyManager.start();
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('pty:write', async (_event, data: string) => {
  if (!ptyManager) return { success: false, error: 'PTY manager not initialized' };
  ptyManager.write(data);
  return { success: true };
});

ipcMain.handle('pty:resize', async (_event, cols: number, rows: number) => {
  if (!ptyManager) return;
  ptyManager.resize(cols, rows);
});

// Browser (embedded BrowserView) handlers
ipcMain.handle('browser:navigate', async (_event, url: string) => {
  if (!mainWindow) return { success: false, error: 'Window not ready' };

  try {
    // Create BrowserView if not exists
    if (!browserView) {
      browserView = new BrowserView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      mainWindow.setBrowserView(browserView);
      updateBrowserViewBounds();
      setupBrowserViewMessaging();
      // Pass reference to MCP server
      setBrowserView(browserView);
    }

    // Navigate to URL
    await browserView.webContents.loadURL(url);

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('browser:getURL', () => {
  if (!browserView) return null;
  return browserView.webContents.getURL();
});

ipcMain.handle('browser:screenshot', async () => {
  if (!browserView) return null;
  try {
    const image = await browserView.webContents.capturePage();
    return image.toPNG().toString('base64');
  } catch {
    return null;
  }
});

ipcMain.handle('browser:inspect', async (_event, x: number, y: number) => {
  if (!browserView) return null;

  try {
    // Execute JS in the browser to find element at coordinates
    const result = await browserView.webContents.executeJavaScript(`
      (function() {
        const el = document.elementFromPoint(${x}, ${y});
        if (!el) return null;

        // Build a unique selector
        function getSelector(element) {
          if (element.id) return '#' + element.id;

          let selector = element.tagName.toLowerCase();
          if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\\s+/).filter(c => c);
            if (classes.length) selector += '.' + classes.join('.');
          }

          // Add nth-child if needed for uniqueness
          const parent = element.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === element.tagName);
            if (siblings.length > 1) {
              const index = siblings.indexOf(element) + 1;
              selector += ':nth-child(' + index + ')';
            }
          }

          return selector;
        }

        // Build full path for more unique selector
        function getFullSelector(element) {
          const parts = [];
          let current = element;
          while (current && current !== document.body) {
            parts.unshift(getSelector(current));
            if (current.id) break; // Stop at ID since it's unique
            current = current.parentElement;
          }
          return parts.join(' > ');
        }

        return {
          tagName: el.tagName.toLowerCase(),
          id: el.id || undefined,
          classes: el.className && typeof el.className === 'string'
            ? el.className.trim().split(/\\s+/).filter(c => c)
            : [],
          selector: getFullSelector(el),
          text: el.textContent?.slice(0, 100) || '',
        };
      })()
    `);

    return result;
  } catch (error) {
    console.error('Inspect error:', error);
    return null;
  }
});

ipcMain.handle('browser:highlight', async (_event, selector: string) => {
  if (!browserView) return;

  try {
    await browserView.webContents.executeJavaScript(`
      (function() {
        // Remove existing highlights
        document.querySelectorAll('.claude-lens-highlight').forEach(el => el.remove());

        const target = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!target) return;

        const rect = target.getBoundingClientRect();
        const highlight = document.createElement('div');
        highlight.className = 'claude-lens-highlight';
        highlight.style.cssText = \`
          position: fixed;
          left: \${rect.left}px;
          top: \${rect.top}px;
          width: \${rect.width}px;
          height: \${rect.height}px;
          border: 2px solid #3b82f6;
          background: rgba(59, 130, 246, 0.1);
          pointer-events: none;
          z-index: 999999;
          transition: opacity 0.3s;
        \`;
        document.body.appendChild(highlight);

        // Remove after 3 seconds
        setTimeout(() => {
          highlight.style.opacity = '0';
          setTimeout(() => highlight.remove(), 300);
        }, 3000);
      })()
    `);
  } catch (error) {
    console.error('Highlight error:', error);
  }
});

ipcMain.handle('browser:getBounds', () => {
  if (!browserView) return null;
  return browserView.getBounds();
});

// Enable inspect mode - inject click listener and hover tracking into BrowserView
ipcMain.handle('browser:enableInspect', async () => {
  if (!browserView) return { success: false };

  try {
    // First inject hover tracking
    await injectHoverTracking();

    // Then inject click handler
    await browserView.webContents.executeJavaScript(`
      (function() {
        // Remove existing listener if any
        if (window.__claudeLensInspectHandler) {
          document.removeEventListener('click', window.__claudeLensInspectHandler, true);
        }

        window.__claudeLensInspectHandler = function(e) {
          e.preventDefault();
          e.stopPropagation();

          const el = e.target;

          // Build selector
          function getSelector(element) {
            if (element.id) return '#' + element.id;
            let selector = element.tagName.toLowerCase();
            if (element.className && typeof element.className === 'string') {
              const classes = element.className.trim().split(/\\s+/).filter(c => c);
              if (classes.length) selector += '.' + classes.join('.');
            }
            const parent = element.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(c => c.tagName === element.tagName);
              if (siblings.length > 1) {
                const index = siblings.indexOf(element) + 1;
                selector += ':nth-child(' + index + ')';
              }
            }
            return selector;
          }

          function getFullSelector(element) {
            const parts = [];
            let current = element;
            while (current && current !== document.body) {
              parts.unshift(getSelector(current));
              if (current.id) break;
              current = current.parentElement;
            }
            return parts.join(' > ');
          }

          // Get all attributes
          const attributes = {};
          for (const attr of el.attributes) {
            if (attr.name !== 'class' && attr.name !== 'id') {
              attributes[attr.name] = attr.value;
            }
          }

          // Get computed styles (key ones)
          const computed = window.getComputedStyle(el);
          const styles = {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
            fontSize: computed.fontSize,
            fontFamily: computed.fontFamily,
            display: computed.display,
            position: computed.position,
          };

          // Get position and size
          const rect = el.getBoundingClientRect();
          const position = {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          };

          const elementInfo = {
            tagName: el.tagName.toLowerCase(),
            id: el.id || undefined,
            classes: el.className && typeof el.className === 'string'
              ? el.className.trim().split(/\\s+/).filter(c => c)
              : [],
            selector: getFullSelector(el),
            text: el.textContent?.slice(0, 100) || '',
            attributes: attributes,
            styles: styles,
            position: position,
          };

          // Highlight
          document.querySelectorAll('.claude-lens-highlight').forEach(h => h.remove());
          const highlight = document.createElement('div');
          highlight.className = 'claude-lens-highlight';
          highlight.style.cssText = 'position:fixed;left:'+rect.left+'px;top:'+rect.top+'px;width:'+rect.width+'px;height:'+rect.height+'px;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);pointer-events:none;z-index:999999;';
          document.body.appendChild(highlight);
          setTimeout(() => { highlight.style.opacity = '0'; setTimeout(() => highlight.remove(), 300); }, 3000);

          // Send back to Electron via console (we'll catch this)
          console.log('CLAUDE_LENS_ELEMENT:' + JSON.stringify(elementInfo));

          // Remove listener after one click
          document.removeEventListener('click', window.__claudeLensInspectHandler, true);
          window.__claudeLensInspectHandler = null;
          document.body.style.cursor = '';

          // Clean up hover tracking
          if (window.__claudeLensHoverCleanup) {
            window.__claudeLensHoverCleanup();
          }
        };

        document.addEventListener('click', window.__claudeLensInspectHandler, true);
        document.body.style.cursor = 'crosshair';
      })()
    `);

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('browser:disableInspect', async () => {
  if (!browserView) return;

  try {
    await browserView.webContents.executeJavaScript(`
      (function() {
        if (window.__claudeLensInspectHandler) {
          document.removeEventListener('click', window.__claudeLensInspectHandler, true);
          window.__claudeLensInspectHandler = null;
        }
        // Clean up hover tracking
        if (window.__claudeLensHoverCleanup) {
          window.__claudeLensHoverCleanup();
        }
        document.body.style.cursor = '';
      })()
    `);
  } catch {
    // Ignore errors
  }
});

// Set up BrowserView console message forwarding
function setupBrowserViewMessaging() {
  if (!browserView || !mainWindow) return;

  browserView.webContents.on('console-message', (_event, level, message) => {
    // Check if it's our element selection message
    if (message.startsWith('CLAUDE_LENS_ELEMENT:')) {
      try {
        const elementInfo = JSON.parse(message.replace('CLAUDE_LENS_ELEMENT:', ''));
        mainWindow?.webContents.send('element-selected', elementInfo);
      } catch {
        // Ignore parse errors
      }
      return;
    }

    // Forward other console messages to renderer
    // level: 0=log, 1=warning, 2=error, 3=info
    const levelMap: Record<number, string> = { 0: 'log', 1: 'warn', 2: 'error', 3: 'info' };
    const levelName = levelMap[level] || 'log';
    const consoleMsg = { level: levelName, message, timestamp: Date.now() };

    // Send to renderer
    mainWindow?.webContents.send('console-message', consoleMsg);

    // Add to buffer for MCP server
    consoleBuffer.push(consoleMsg);
    if (consoleBuffer.length > MAX_CONSOLE_MESSAGES) {
      consoleBuffer.shift();
    }
  });
}

// Send element to Claude - the key seamless integration!
ipcMain.handle('send-to-claude', async (_event, prompt: string, elementContext: string) => {
  if (!ptyManager) return { success: false, error: 'Claude not running' };

  // Format the full prompt with element context
  const fullPrompt = `${prompt}\n\n${elementContext}`;

  // Write directly to Claude's stdin - this is the magic!
  ptyManager.write(fullPrompt + '\n');

  return { success: true };
});

// Forward PTY output to renderer
function setupPtyForwarding() {
  if (!ptyManager) return;

  ptyManager.onData((data) => {
    mainWindow?.webContents.send('pty:data', data);
  });

  ptyManager.onExit((code) => {
    mainWindow?.webContents.send('pty:exit', code);
  });
}

// App lifecycle
app.whenReady().then(async () => {
  await createWindow();
  setupPtyForwarding();

  // Start MCP server for Claude Code integration
  setConsoleBuffer(consoleBuffer);
  try {
    const port = await startMCPServer();
    console.log(`MCP server started on port ${port}`);
  } catch (err) {
    console.error('Failed to start MCP server:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopMCPServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: don't allow navigation away from our app's UI
app.on('web-contents-created', (_event, contents) => {
  // Only restrict the main renderer, not the BrowserView
  if (contents.getType() === 'browserView') return;

  contents.on('will-navigate', (event, _url) => {
    event.preventDefault();
  });

  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});
