/**
 * Claude Lens Desktop - Main Process
 *
 * Spawns Claude Code in a pty we control, enabling seamless
 * communication from the browser panel to Claude.
 *
 * Uses embedded BrowserView for the browser panel - no external Chrome needed.
 */

import { app, BrowserWindow, BrowserView, ipcMain, shell, dialog, clipboard, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as pty from 'node-pty';
import { PtyManager } from './pty-manager';
import { startMCPServer, stopMCPServer, setBrowserView, setConsoleBuffer } from './mcp-server';
import { BridgeServer, CircularBuffer, debounce } from '@claude-lens/core';
import { createPlaywrightBridgeHandler } from './playwright-handler.js';
import { PlaywrightAdapter, getCDPPort } from './playwright-adapter.js';
import { analyzeProject, ProjectInfo, detectPackageManager, checkDependencyHealth } from './project-manager';
import { DevServerManager } from './dev-server';
import { StaticServer } from './static-server';

// Enable remote debugging for Playwright integration
// Must be set before app is ready
const CDP_PORT = getCDPPort();
app.commandLine.appendSwitch('remote-debugging-port', String(CDP_PORT));
console.log(`[PlaywrightAdapter] Remote debugging enabled on port ${CDP_PORT}`);

// Enable hot reload in development
if (process.env.NODE_ENV === 'development') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
let bridgeServer: BridgeServer | null = null;
let playwrightAdapter: PlaywrightAdapter | null = null;

// Project management state
let currentProject: ProjectInfo | null = null;
let devServerManager: DevServerManager | null = null;
let staticServer: StaticServer | null = null;

// Console message buffer for MCP server
interface ConsoleMessage {
  level: string;
  message: string;
  timestamp: number;
}
const MAX_CONSOLE_MESSAGES = 100;
const consoleBuffer = new CircularBuffer<ConsoleMessage>(MAX_CONSOLE_MESSAGES);

/**
 * Create the application menu
 */
function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+O',
          click: () => openProjectDialog(),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/melon-hub/claude-lens'),
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/melon-hub/claude-lens/issues'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Show the open project dialog
 */
async function openProjectDialog(): Promise<void> {
  if (!mainWindow) return;

  // Focus and bring window to front before showing dialog
  // This helps with multi-monitor setups on Linux/GTK where dialogs
  // may appear on the wrong screen (Electron issue #32160)
  mainWindow.focus();
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Open Project Folder',
    defaultPath: process.env.HOME || process.env.USERPROFILE,
  });

  if (!result.canceled && result.filePaths.length > 0) {
    await openProject(result.filePaths[0]);
  }
}

/**
 * Open and analyze a project folder
 */
async function openProject(projectPath: string): Promise<void> {
  try {
    // Analyze the project
    currentProject = await analyzeProject(projectPath);

    // Update dev command to use detected package manager
    if (currentProject.devCommand && currentProject.packageJson?.scripts) {
      const pm = detectPackageManager(projectPath);
      const scripts = currentProject.packageJson.scripts;
      if (scripts.dev) {
        currentProject.devCommand = pm === 'npm' ? 'npm run dev' : `${pm} dev`;
      } else if (scripts.start) {
        currentProject.devCommand = pm === 'npm' ? 'npm start' : `${pm} start`;
      }
    }

    // Send to renderer to show dialog
    mainWindow?.webContents.send('project:detected', currentProject);
  } catch (err) {
    console.error('Failed to analyze project:', err);
    dialog.showErrorBox('Error', `Failed to open project: ${err}`);
  }
}

/**
 * Inject Claude Lens context into a project directory
 * Creates .claude/claude-lens.md with instructions (gitignored, won't pollute user's repo)
 */
async function injectClaudeLensContext(projectPath: string): Promise<void> {
  const claudeDir = path.join(projectPath, '.claude');

  // Create .claude directory if it doesn't exist (async for non-blocking I/O)
  await fsPromises.mkdir(claudeDir, { recursive: true });

  // Create claude-lens.md in .claude directory (gitignored by default)
  const claudeMdInstructions = `# Claude Lens Desktop Environment

**IMPORTANT: You are running inside Claude Lens Desktop with Playwright-powered browser automation.**

## CRITICAL: Use \`claude_lens/*\` Tools (NOT \`browser_*\` Tools)

You may have other Playwright MCP tools available (like \`browser_navigate\`, \`browser_click\`, \`browser_take_screenshot\`, etc.).

**DO NOT use those generic \`browser_*\` tools for this project.** They connect to a different browser instance and won't work with Claude Lens.

**ALWAYS use \`claude_lens/*\` tools** - they are specifically designed for the Claude Lens embedded browser.

## Browser Tools (Claude Lens)

Use the \`claude_lens/*\` MCP tools for browser automation:

### Core Tools
| Tool | Purpose |
|------|---------|
| \`claude_lens/screenshot\` | Take a screenshot (do this FIRST to see the page) |
| \`claude_lens/browser_snapshot\` | Get accessibility tree for fast element discovery |
| \`claude_lens/click\` | Click an element |
| \`claude_lens/fill\` | Fill input field (clears first) |
| \`claude_lens/type\` | Type text character by character |
| \`claude_lens/navigate\` | Navigate to a URL |
| \`claude_lens/reload\` | Reload page after code changes |

### Advanced Automation
| Tool | Purpose |
|------|---------|
| \`claude_lens/hover\` | Hover over element (trigger hover states) |
| \`claude_lens/select_option\` | Select dropdown option |
| \`claude_lens/press_key\` | Press keyboard key (Enter, Tab, Escape) |
| \`claude_lens/drag_and_drop\` | Drag from source to target |
| \`claude_lens/scroll\` | Scroll page or element |
| \`claude_lens/wait_for\` | Wait for element to appear |
| \`claude_lens/wait_for_response\` | Wait for network response |

### Element Inspection
| Tool | Purpose |
|------|---------|
| \`claude_lens/inspect_element\` | Get element details |
| \`claude_lens/highlight_element\` | Highlight an element |
| \`claude_lens/get_text\` | Get element text content |
| \`claude_lens/get_attribute\` | Get element attribute |
| \`claude_lens/is_visible\` | Check if element is visible |
| \`claude_lens/is_enabled\` | Check if element is enabled |
| \`claude_lens/get_console\` | Get browser console logs |

### Navigation & Dialogs
| Tool | Purpose |
|------|---------|
| \`claude_lens/go_back\` | Browser back button |
| \`claude_lens/go_forward\` | Browser forward button |
| \`claude_lens/handle_dialog\` | Accept or dismiss alert/confirm dialogs |
| \`claude_lens/evaluate\` | Execute custom JavaScript |

## CSS Selectors

Use **standard CSS selectors**:
- \`#submit-btn\` (ID)
- \`.btn-primary\` (class)
- \`[data-testid="submit"]\` (attribute)
- \`button[type="submit"]\` (tag + attribute)

## Workflow

1. \`claude_lens/screenshot\` or \`claude_lens/browser_snapshot\` → See the page
2. Make code changes
3. \`claude_lens/reload\` → See updates
4. \`claude_lens/screenshot\` → Verify

## Project Location

Source files: \`${projectPath}\`
`;

  // Write to .claude/claude-lens.md (gitignored, won't affect user's repo)
  const claudeMdPath = path.join(claudeDir, 'claude-lens.md');
  await fsPromises.writeFile(claudeMdPath, claudeMdInstructions);
  console.log('Injected Claude Lens context into:', claudeMdPath);

  // Create .mcp.json to enable MCP tools in Claude Code
  // Use the local mcp-server from claude-lens monorepo
  // __dirname at runtime is dist/main/, so we need to go up 3 levels to reach packages/
  const mcpServerPath = path.resolve(__dirname, '../../../mcp-server/dist/index.js');
  console.log('Looking for MCP server at:', mcpServerPath);

  // Check if the mcp-server exists (development mode) - async for non-blocking I/O
  try {
    await fsPromises.access(mcpServerPath);

    const mcpConfig = {
      mcpServers: {
        'claude-lens': {
          command: 'node',
          args: [mcpServerPath],
          env: {
            CLAUDE_LENS_BRIDGE_URL: 'http://localhost:9333'
          }
        }
      }
    };

    const mcpConfigPath = path.join(projectPath, '.mcp.json');
    await fsPromises.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    console.log('Created MCP config:', mcpConfigPath);

    // Create settings.json to auto-approve MCP tools (reduces permission prompts)
    // Format: mcp__<server-name>__<tool-name> where server is "claude-lens" and tools are "claude_lens/..."
    const settingsJsonPath = path.join(claudeDir, 'settings.json');
    const settingsJson = {
      permissions: {
        allow: [
          // Wildcard for all claude-lens tools
          'mcp__claude-lens__*',
          // Explicit permissions as fallback (Claude Code may not support wildcards)
          'mcp__claude-lens__claude_lens/screenshot',
          'mcp__claude-lens__claude_lens/browser_snapshot',
          'mcp__claude-lens__claude_lens/click',
          'mcp__claude-lens__claude_lens/fill',
          'mcp__claude-lens__claude_lens/type',
          'mcp__claude-lens__claude_lens/navigate',
          'mcp__claude-lens__claude_lens/reload',
          'mcp__claude-lens__claude_lens/hover',
          'mcp__claude-lens__claude_lens/select_option',
          'mcp__claude-lens__claude_lens/press_key',
          'mcp__claude-lens__claude_lens/drag_and_drop',
          'mcp__claude-lens__claude_lens/scroll',
          'mcp__claude-lens__claude_lens/wait_for',
          'mcp__claude-lens__claude_lens/wait_for_response',
          'mcp__claude-lens__claude_lens/inspect_element',
          'mcp__claude-lens__claude_lens/highlight_element',
          'mcp__claude-lens__claude_lens/get_text',
          'mcp__claude-lens__claude_lens/get_attribute',
          'mcp__claude-lens__claude_lens/is_visible',
          'mcp__claude-lens__claude_lens/is_enabled',
          'mcp__claude-lens__claude_lens/is_checked',
          'mcp__claude-lens__claude_lens/get_console',
          'mcp__claude-lens__claude_lens/go_back',
          'mcp__claude-lens__claude_lens/go_forward',
          'mcp__claude-lens__claude_lens/handle_dialog',
          'mcp__claude-lens__claude_lens/evaluate'
        ]
      }
    };
    await fsPromises.writeFile(settingsJsonPath, JSON.stringify(settingsJson, null, 2));
    console.log('Created permissions config:', settingsJsonPath);
  } catch {
    // MCP server not found, skip config creation (happens in production builds)
    console.log('MCP server not found at:', mcpServerPath);
  }

}

/**
 * Run npm/yarn/pnpm install and wait for completion
 */
async function runInstallCommand(projectPath: string, command: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

    const installPty = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: projectPath,
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    let output = '';
    let hasError = false;

    installPty.onData((data: string) => {
      output += data;
      mainWindow?.webContents.send('server:output', data);

      // Check for common error patterns
      if (data.includes('ERR!') || data.includes('error:') || data.includes('ENOENT')) {
        hasError = true;
      }
    });

    installPty.onExit(({ exitCode }: { exitCode: number }) => {
      if (exitCode === 0 && !hasError) {
        resolve({ success: true });
      } else {
        // Extract last error message
        const lines = output.split('\n');
        const errorLines = lines.filter((l) => l.includes('ERR!') || l.includes('error'));
        const errorMsg = errorLines.slice(-5).join('\n') || `Exit code: ${exitCode}`;
        resolve({ success: false, error: errorMsg });
      }
    });

    // Run the install command
    installPty.write(`${command}\r`);

    // Set a timeout (5 minutes for npm install)
    setTimeout(() => {
      installPty.kill();
      resolve({ success: false, error: 'Install timed out after 5 minutes' });
    }, 300000);
  });
}

/**
 * Start the project (dev server or static server)
 */
async function startProject(useDevServer: boolean): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!currentProject) {
    return { success: false, error: 'No project loaded' };
  }

  try {
    // Check dependency health for Node projects using dev server
    if (useDevServer && currentProject.type === 'node') {
      const health = await checkDependencyHealth(currentProject.path);

      if (health.status !== 'healthy') {
        console.log(`[Health Check] ${health.status}: ${health.message}`);

        // Show warning dialog and ask if user wants to continue or fix
        const result = await dialog.showMessageBox(mainWindow!, {
          type: health.status === 'missing' ? 'error' : 'warning',
          title: 'Dependency Issue Detected',
          message: health.message,
          detail: health.suggestion
            ? `${health.suggestion}\n\nThis may cause the dev server to fail.`
            : 'The dev server may fail to start.',
          buttons: health.status === 'missing'
            ? ['Run npm install', 'Cancel']
            : ['Continue Anyway', 'Run npm install', 'Cancel'],
          defaultId: health.status === 'missing' ? 0 : 1,
          cancelId: health.status === 'missing' ? 1 : 2,
        });

        const buttonIndex = result.response;
        const runInstall = health.status === 'missing' ? buttonIndex === 0 : buttonIndex === 1;
        const cancel = health.status === 'missing' ? buttonIndex === 1 : buttonIndex === 2;

        if (cancel) {
          return { success: false, error: 'Cancelled by user' };
        }

        if (runInstall) {
          // Run npm install in a temporary PTY and wait for it
          const pm = detectPackageManager(currentProject.path);
          const installCmd = pm === 'yarn' ? 'yarn install' : pm === 'pnpm' ? 'pnpm install' : pm === 'bun' ? 'bun install' : 'npm install';

          mainWindow?.webContents.send('server:output', `\n[Claude Lens] Running ${installCmd}...\n`);

          const installResult = await runInstallCommand(currentProject.path, installCmd);

          if (!installResult.success) {
            dialog.showErrorBox('Install Failed', `Failed to install dependencies:\n\n${installResult.error}`);
            return { success: false, error: installResult.error };
          }

          mainWindow?.webContents.send('server:output', `\n[Claude Lens] Dependencies installed successfully!\n`);
        }
      }
    }

    const port = currentProject.suggestedPort || 3000;
    let url: string;

    // Stop any existing servers
    if (devServerManager) {
      await devServerManager.stop();
      devServerManager = null;
    }
    if (staticServer) {
      await staticServer.stop();
      staticServer = null;
    }

    if (useDevServer && currentProject.devCommand) {
      // Start dev server
      // Use local variable to avoid race conditions in callbacks
      const serverManager = new DevServerManager();
      devServerManager = serverManager;

      serverManager.setOnOutput((data) => {
        // Log dev server output to main process console for debugging
        console.log('[DevServer]', data.replace(/\n/g, '\\n'));
        mainWindow?.webContents.send('server:output', data);
      });

      serverManager.setOnReady(() => {
        const actualPort = serverManager.getActualPort() || port;
        mainWindow?.webContents.send('server:ready', { port: actualPort });
      });

      serverManager.setOnExit((code) => {
        mainWindow?.webContents.send('server:exit', { code });
      });

      serverManager.setOnError((error) => {
        console.log(`[DevServer Error] ${error.type}: ${error.message}`);
        mainWindow?.webContents.send('server:error', {
          type: error.type,
          message: error.message,
          suggestion: error.suggestion,
        });
      });

      serverManager.setOnProgress((progress) => {
        console.log(`[DevServer] ${progress.status}`);
        mainWindow?.webContents.send('server:progress', progress);
      });

      await serverManager.start(currentProject.path, currentProject.devCommand, port);
      // Use the actual detected port (may differ from suggested port)
      const actualPort = serverManager.getActualPort() || port;
      url = `http://localhost:${actualPort}`;
      console.log(`Dev server started on port ${actualPort} (suggested: ${port})`);
    } else {
      // Use built-in static server
      staticServer = new StaticServer();
      const entryFile = currentProject.entryFile || 'index.html';
      await staticServer.start(currentProject.path, port, entryFile);
      url = `http://localhost:${port}`;
      // Notify renderer that server is ready (static server is immediately ready)
      mainWindow?.webContents.send('server:ready', { port });
    }

    // Navigate the browser to the URL
    // Create BrowserView if it doesn't exist yet
    if (!browserView && mainWindow) {
      browserView = new BrowserView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      mainWindow.setBrowserView(browserView);
      updateBrowserViewBounds();
      setupBrowserViewMessaging();
      setBrowserView(browserView);
    }

    if (browserView) {
      await browserView.webContents.loadURL(url);

      // Inject unified inspect system (Ctrl+hover/click + button toggle)
      await injectInspectSystem();

      // Connect Playwright to the BrowserView for automation (non-blocking)
      // Don't await - Playwright connection can take 10+ seconds and isn't required for display
      if (playwrightAdapter) {
        playwrightAdapter.connect(browserView)
          .then(() => console.log('[PlaywrightAdapter] Connected to BrowserView'))
          .catch((err) => console.error('[PlaywrightAdapter] Failed to connect:', err));
      }
    }

    // Inject Claude Lens context into project before starting Claude
    await injectClaudeLensContext(currentProject.path);

    // Only start Claude if not already running
    // If already running, keep the existing session (user can manually restart if needed)
    if (!ptyManager?.isRunning()) {
      const newPtyManager = new PtyManager();
      ptyManager = newPtyManager;
      setupPtyForwarding();
      await newPtyManager.start({ cwd: currentProject.path });

      // Notify renderer that Claude started automatically
      mainWindow?.webContents.send('pty:autoStarted');
    }

    return { success: true, url };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Failed to start project:', errorMsg);

    // Check for specific error suggestions from DevServerManager
    let suggestion = '';
    if (devServerManager?.hasErrors()) {
      const errors = devServerManager.getErrors();
      const lastError = errors[errors.length - 1];
      if (lastError) {
        suggestion = `\n\nSuggestion: ${lastError.suggestion}`;
      }
    }

    // Check if project has HTML files for static fallback
    const hasHtmlFiles = currentProject &&
      (fs.existsSync(path.join(currentProject.path, 'index.html')) ||
       fs.existsSync(path.join(currentProject.path, 'public', 'index.html')) ||
       fs.existsSync(path.join(currentProject.path, 'dist', 'index.html')));

    // Offer fallback to static server if applicable
    if (hasHtmlFiles && useDevServer) {
      const result = await dialog.showMessageBox(mainWindow!, {
        type: 'error',
        title: 'Dev Server Failed',
        message: 'Could not start the development server',
        detail: `${errorMsg}${suggestion}\n\nWould you like to use the built-in static server instead? ` +
          `This will serve files directly but won't have hot reload.`,
        buttons: ['Use Static Server', 'Cancel'],
        defaultId: 0,
      });

      if (result.response === 0) {
        // Try starting with static server
        return startProject(false);
      }
    } else {
      // Show error dialog without fallback option
      dialog.showErrorBox(
        'Failed to Start Project',
        `Could not start the development server:\n\n${errorMsg}${suggestion}\n\n` +
        `Tip: If running Claude Lens in development mode, the Vite dev server uses port 5173. ` +
        `Try closing other dev servers or wait a moment and try again.`
      );
    }

    return { success: false, error: errorMsg };
  }
}

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
    // DevTools can be opened manually with Ctrl+Shift+I or View menu
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

  // Handle resize to update BrowserView bounds (debounced to reduce CPU usage)
  // During drag resize, events fire at ~60fps - debounce to 16ms (~60fps cap)
  const debouncedUpdateBounds = debounce(() => updateBrowserViewBounds(), 16);
  mainWindow.on('resize', debouncedUpdateBounds);
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

// Inject unified inspect system - supports both Ctrl+hover and button toggle
// Ctrl+hover/click always works; Inspect button makes it persistent without Ctrl
async function injectInspectSystem() {
  if (!browserView) return;

  await browserView.webContents.executeJavaScript(`
    (function() {
      // Remove existing tracking if any
      if (window.__claudeLensCleanup) {
        window.__claudeLensCleanup();
      }

      // State
      window.__claudeLensInspectMode = false; // Button toggle state

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

      function getFullSelector(element) {
        function getSelector(el) {
          if (el.id) return '#' + el.id;
          let selector = el.tagName.toLowerCase();
          if (el.className && typeof el.className === 'string') {
            const classes = el.className.trim().split(/\\s+/).filter(c => c && !c.startsWith('claude-lens'));
            if (classes.length) selector += '.' + classes.join('.');
          }
          const parent = el.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
            if (siblings.length > 1) {
              const index = siblings.indexOf(el) + 1;
              selector += ':nth-child(' + index + ')';
            }
          }
          return selector;
        }
        const parts = [];
        let current = element;
        while (current && current !== document.body) {
          parts.unshift(getSelector(current));
          if (current.id) break;
          current = current.parentElement;
        }
        return parts.join(' > ');
      }

      let currentElement = null;
      let ctrlPressed = false;

      // Expose for blur handler to reset
      window.__claudeLensResetCtrl = true;
      Object.defineProperty(window, '__claudeLensCtrlPressed', {
        get: () => ctrlPressed,
        set: (v) => { ctrlPressed = v; },
        configurable: true
      });

      // Track Ctrl key state
      function handleKeyDown(e) {
        if (e.key === 'Control' && !ctrlPressed) {
          ctrlPressed = true;
          document.body.style.cursor = 'crosshair';
        }
      }

      function handleKeyUp(e) {
        if (e.key === 'Control') {
          ctrlPressed = false;
          if (!window.__claudeLensInspectMode) {
            document.body.style.cursor = '';
            tooltip.style.display = 'none';
            highlight.style.display = 'none';
          }
        }
      }

      // Should we show inspect UI?
      function isInspectActive() {
        return ctrlPressed || window.__claudeLensInspectMode;
      }

      function handleMouseMove(e) {
        if (!isInspectActive()) {
          tooltip.style.display = 'none';
          highlight.style.display = 'none';
          return;
        }

        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el === tooltip || el === highlight || el.id?.startsWith('claude-lens')) {
          return;
        }

        if (el !== currentElement) {
          currentElement = el;
          window.__claudeLensLastElement = el;

          // Update tooltip
          const selectorText = getSelectorDisplay(el);
          tooltip.textContent = '<' + selectorText + '>';
          tooltip.style.display = 'block';

          // Position tooltip near cursor
          const tooltipRect = tooltip.getBoundingClientRect();
          let left = e.clientX + 15;
          let top = e.clientY + 15;
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

      function handleClick(e) {
        // Only capture if Ctrl is held OR inspect mode is on
        if (!isInspectActive()) return;

        const el = e.target;
        if (el.id?.startsWith('claude-lens')) return;

        // In inspect mode (button), block the click; with Ctrl, let it through
        if (window.__claudeLensInspectMode) {
          e.preventDefault();
          e.stopPropagation();
        }
        // With Ctrl only, we still capture but DON'T block - allows dropdowns to open

        // Get element info
        const attributes = {};
        for (const attr of el.attributes) {
          if (attr.name !== 'class' && attr.name !== 'id') {
            attributes[attr.name] = attr.value;
          }
        }

        const computed = window.getComputedStyle(el);
        const styles = {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          fontSize: computed.fontSize,
          fontFamily: computed.fontFamily,
          display: computed.display,
          position: computed.position,
        };

        const rect = el.getBoundingClientRect();

        const elementInfo = {
          tagName: el.tagName.toLowerCase(),
          id: el.id || undefined,
          classes: el.className && typeof el.className === 'string'
            ? el.className.trim().split(/\\s+/).filter(c => c && !c.startsWith('claude-lens'))
            : [],
          selector: getFullSelector(el),
          text: el.textContent?.slice(0, 100) || '',
          attributes: attributes,
          styles: styles,
          position: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
          interactionResult: 'Element captured',
        };

        // Show capture highlight (orange)
        const captureHighlight = document.createElement('div');
        captureHighlight.className = 'claude-lens-capture-highlight';
        captureHighlight.style.cssText = 'position:fixed;left:'+rect.left+'px;top:'+rect.top+'px;width:'+rect.width+'px;height:'+rect.height+'px;border:2px solid #f59e0b;background:rgba(245,158,11,0.15);pointer-events:none;z-index:999999;transition:opacity 0.5s;';
        document.body.appendChild(captureHighlight);
        setTimeout(() => { captureHighlight.style.opacity = '0'; }, 1500);
        setTimeout(() => { captureHighlight.remove(); }, 2000);

        // Send to Electron
        console.log('CLAUDE_LENS_ELEMENT:' + JSON.stringify(elementInfo));
      }

      document.addEventListener('keydown', handleKeyDown, true);
      document.addEventListener('keyup', handleKeyUp, true);
      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('mouseleave', handleMouseLeave);
      document.addEventListener('click', handleClick, true);

      // Cleanup function
      window.__claudeLensCleanup = function() {
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('keyup', handleKeyUp, true);
        document.removeEventListener('mousemove', handleMouseMove, true);
        document.removeEventListener('mouseleave', handleMouseLeave);
        document.removeEventListener('click', handleClick, true);
        tooltip?.remove();
        highlight?.remove();
        document.body.style.cursor = '';
      };
    })()
  `);
}

// IPC Handlers

// PTY (Claude Code) handlers
ipcMain.handle('pty:start', async () => {
  if (!ptyManager) return { success: false, error: 'PTY manager not initialized' };

  // Require a project to be loaded first
  if (!currentProject) {
    // Trigger project picker dialog
    await openProjectDialog();
    // If still no project after dialog, user cancelled
    if (!currentProject) {
      return { success: false, error: 'Please open a project first (File > Open Project)' };
    }
  }

  try {
    // Inject CLAUDE.md context before starting
    await injectClaudeLensContext(currentProject.path);
    await ptyManager.start({ cwd: currentProject.path });
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

/**
 * Inject Ctrl+Click element capture listener into the browser.
 * This allows users to quickly capture elements without toggling Inspect Mode.
 * @deprecated Superseded by injectInspectSystem - kept for reference
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _injectCtrlClickCapture() {
  if (!browserView) return;

  try {
    await browserView.webContents.executeJavaScript(`
      (function() {
        // Skip if already injected
        if (window.__claudeLensCtrlClickHandler) return;

        window.__claudeLensCtrlClickHandler = function(e) {
          // Only capture on Ctrl+Click (or Cmd+Click on Mac)
          if (!e.ctrlKey && !e.metaKey) return;

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

          // Get attributes
          const attributes = {};
          for (const attr of el.attributes) {
            if (attr.name !== 'class' && attr.name !== 'id') {
              attributes[attr.name] = attr.value;
            }
          }

          // Get computed styles
          const computed = window.getComputedStyle(el);
          const styles = {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
            fontSize: computed.fontSize,
            fontFamily: computed.fontFamily,
            display: computed.display,
            position: computed.position,
          };

          // Get position
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

          // Highlight briefly
          document.querySelectorAll('.claude-lens-highlight').forEach(h => h.remove());
          const highlight = document.createElement('div');
          highlight.className = 'claude-lens-highlight';
          highlight.style.cssText = 'position:fixed;left:'+rect.left+'px;top:'+rect.top+'px;width:'+rect.width+'px;height:'+rect.height+'px;border:2px solid #10b981;background:rgba(16,185,129,0.1);pointer-events:none;z-index:999999;';
          document.body.appendChild(highlight);
          setTimeout(() => { highlight.style.opacity = '0'; setTimeout(() => highlight.remove(), 300); }, 2000);

          // Send back to Electron
          console.log('CLAUDE_LENS_CTRL_ELEMENT:' + JSON.stringify(elementInfo));
        };

        document.addEventListener('click', window.__claudeLensCtrlClickHandler, true);
      })()
    `);
  } catch {
    // Ignore injection errors
  }
}

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

    // Inject unified inspect system (Ctrl+hover/click + button toggle)
    await injectInspectSystem();

    // Inject Freeze (F key) keyboard shortcut
    await injectFreezeKeyboardShortcut();

    // Inject toast watcher (Phase 4)
    await injectToastWatcher();

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

  // Validate coordinates are finite numbers to prevent XSS injection
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
    console.error('Invalid coordinates for inspect:', { x, y });
    return null;
  }

  try {
    // Execute JS in the browser to find element at coordinates
    // x and y are validated as finite numbers above, safe to interpolate
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

        // Detect React component info
        function getReactInfo(element) {
          // Find React fiber key on element
          const fiberKey = Object.keys(element).find(key =>
            key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
          );
          if (!fiberKey) return null;

          const fiber = element[fiberKey];
          if (!fiber) return null;

          // Walk up fiber tree to find component (function/class, not host elements)
          let current = fiber;
          const components = [];
          let depth = 0;
          const maxDepth = 20; // Prevent infinite loops

          while (current && depth < maxDepth) {
            depth++;
            const type = current.type;

            if (type && typeof type === 'function') {
              const name = type.displayName || type.name || 'Anonymous';
              // Skip internal React components
              if (!name.startsWith('_') && name !== 'Anonymous') {
                const componentInfo = { name };

                // Try to get source location from _source (dev mode only)
                if (current._debugSource) {
                  componentInfo.source = {
                    fileName: current._debugSource.fileName,
                    lineNumber: current._debugSource.lineNumber,
                  };
                }

                // Get props (limited, avoid circular refs)
                if (current.memoizedProps) {
                  const props = {};
                  const propKeys = Object.keys(current.memoizedProps).slice(0, 10);
                  for (const key of propKeys) {
                    const val = current.memoizedProps[key];
                    if (val !== null && typeof val !== 'function' && typeof val !== 'object') {
                      props[key] = val;
                    } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                      props[key] = '{...}';
                    } else if (Array.isArray(val)) {
                      props[key] = '[...]';
                    } else if (typeof val === 'function') {
                      props[key] = 'fn()';
                    }
                  }
                  if (Object.keys(props).length > 0) {
                    componentInfo.props = props;
                  }
                }

                components.push(componentInfo);
                if (components.length >= 3) break; // Get up to 3 parent components
              }
            }
            current = current.return;
          }

          return components.length > 0 ? { components, framework: 'React' } : null;
        }

        // Detect Vue component info
        function getVueInfo(element) {
          const vueKey = Object.keys(element).find(key => key.startsWith('__vue'));
          if (!vueKey) return null;

          const vue = element[vueKey];
          if (!vue) return null;

          const name = vue.$options?.name || vue.$.type?.name || 'VueComponent';
          return {
            framework: 'Vue',
            components: [{ name }]
          };
        }

        // Get framework info
        const reactInfo = getReactInfo(el);
        const vueInfo = !reactInfo ? getVueInfo(el) : null;
        const frameworkInfo = reactInfo || vueInfo || null;

        return {
          tagName: el.tagName.toLowerCase(),
          id: el.id || undefined,
          classes: el.className && typeof el.className === 'string'
            ? el.className.trim().split(/\\s+/).filter(c => c)
            : [],
          selector: getFullSelector(el),
          text: el.textContent?.slice(0, 100) || '',
          framework: frameworkInfo,
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

// Enable inspect mode - toggles persistent inspect (without needing Ctrl)
ipcMain.handle('browser:enableInspect', async () => {
  if (!browserView) return { success: false };

  try {
    // Ensure inspect system is injected
    await injectInspectSystem();

    // Enable persistent inspect mode
    await browserView.webContents.executeJavaScript(`
      window.__claudeLensInspectMode = true;
      document.body.style.cursor = 'crosshair';
    `);

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Disable inspect mode - back to Ctrl-only
ipcMain.handle('browser:disableInspect', async () => {
  if (!browserView) return;

  try {
    await browserView.webContents.executeJavaScript(`
      window.__claudeLensInspectMode = false;
      document.body.style.cursor = '';
      // Hide tooltip/highlight
      const tooltip = document.getElementById('claude-lens-tooltip');
      const highlight = document.getElementById('claude-lens-hover-highlight');
      if (tooltip) tooltip.style.display = 'none';
      if (highlight) highlight.style.display = 'none';
    `);
  } catch {
    // Ignore errors
  }
});

// Freeze hover states (Phase 3) - keeps tooltips/menus visible
ipcMain.handle('browser:freezeHover', async () => {
  if (!browserView) return { success: false };

  try {
    const result = await browserView.webContents.executeJavaScript(`
      (function() {
        // Mark all currently hovered elements
        const hoveredElements = document.querySelectorAll(':hover');
        hoveredElements.forEach(el => {
          el.classList.add('claude-lens-hover-frozen');
        });

        // Add CSS to keep hover styles and prevent pointer events from dismissing
        if (!document.getElementById('claude-lens-freeze-styles')) {
          const style = document.createElement('style');
          style.id = 'claude-lens-freeze-styles';
          style.textContent = \`
            .claude-lens-hover-frozen,
            .claude-lens-hover-frozen * {
              pointer-events: none !important;
            }
            /* Force visibility of common hover patterns */
            .claude-lens-hover-frozen .tooltip,
            .claude-lens-hover-frozen .dropdown-menu,
            .claude-lens-hover-frozen [data-show],
            .claude-lens-hover-frozen .popover,
            .claude-lens-hover-frozen [role="tooltip"],
            .claude-lens-hover-frozen [class*="tooltip"],
            .claude-lens-hover-frozen [class*="dropdown"],
            .claude-lens-hover-frozen [class*="popover"],
            .claude-lens-hover-frozen [class*="menu"] {
              display: block !important;
              visibility: visible !important;
              opacity: 1 !important;
            }
          \`;
          document.head.appendChild(style);
        }

        return { count: hoveredElements.length };
      })()
    `);

    return { success: true, count: result?.count || 0 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Setup keyboard shortcut listener in BrowserView (F key for freeze)
async function injectFreezeKeyboardShortcut() {
  if (!browserView || !mainWindow) return;

  try {
    await browserView.webContents.executeJavaScript(`
      (function() {
        if (window.__claudeLensFreezeKeyHandler) return; // Already injected

        window.__claudeLensFreezeKeyHandler = function(e) {
          if (e.key === 'f' || e.key === 'F') {
            // Don't trigger if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
              return;
            }
            e.preventDefault();
            console.log('CLAUDE_LENS_FREEZE_TOGGLE');
          }
        };

        document.addEventListener('keydown', window.__claudeLensFreezeKeyHandler, true);
      })()
    `);
  } catch {
    // Ignore
  }
}

/**
 * Inject toast/notification watcher into BrowserView (Phase 4)
 * Uses MutationObserver to capture transient toast notifications
 */
async function injectToastWatcher() {
  if (!browserView) return;

  try {
    await browserView.webContents.executeJavaScript(`
      (function() {
        if (window.__claudeLensToastObserver) return; // Already watching

        window.__claudeLensToastObserver = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === 1) { // Element node
                const el = node;
                const tag = el.tagName?.toLowerCase() || '';
                const classes = (el.className || '').toLowerCase();
                const role = el.getAttribute('role');

                // Detect toast/notification patterns
                const isToast =
                  classes.includes('toast') ||
                  classes.includes('notification') ||
                  classes.includes('snackbar') ||
                  classes.includes('alert') ||
                  classes.includes('flash') ||
                  role === 'alert' ||
                  role === 'status' ||
                  el.getAttribute('aria-live') === 'polite' ||
                  el.getAttribute('aria-live') === 'assertive';

                if (isToast) {
                  // Determine toast type
                  let type = 'info';
                  if (classes.includes('error') || classes.includes('danger')) type = 'error';
                  else if (classes.includes('success')) type = 'success';
                  else if (classes.includes('warning') || classes.includes('warn')) type = 'warning';

                  const text = el.textContent?.trim().slice(0, 200) || 'Toast notification';

                  console.log('CLAUDE_LENS_TOAST:' + JSON.stringify({
                    text: text,
                    type: type,
                    timestamp: Date.now()
                  }));
                }
              }
            }
          }
        });

        window.__claudeLensToastObserver.observe(document.body, {
          childList: true,
          subtree: true
        });
      })()
    `);
  } catch {
    // Ignore errors
  }
}

// Unfreeze hover states
ipcMain.handle('browser:unfreezeHover', async () => {
  if (!browserView) return;

  try {
    await browserView.webContents.executeJavaScript(`
      (function() {
        // Remove frozen class from all elements
        document.querySelectorAll('.claude-lens-hover-frozen').forEach(el => {
          el.classList.remove('claude-lens-hover-frozen');
        });

        // Remove freeze styles
        const style = document.getElementById('claude-lens-freeze-styles');
        if (style) style.remove();
      })()
    `);
  } catch {
    // Ignore errors
  }
});

// Set up BrowserView console message forwarding
function setupBrowserViewMessaging() {
  if (!browserView || !mainWindow) return;

  // Re-inject inspect system when page loads/reloads (hot reload loses injected scripts)
  browserView.webContents.on('did-finish-load', async () => {
    await injectInspectSystem();
    console.log('[BrowserView] Re-injected inspect system after page load');
  });

  // Reset Ctrl state when BrowserView loses focus (prevents stuck Ctrl)
  browserView.webContents.on('blur', async () => {
    if (!browserView) return;
    try {
      await browserView.webContents.executeJavaScript(`
        if (window.__claudeLensResetCtrl) {
          // Reset Ctrl state when BrowserView loses focus
          window.__claudeLensCtrlPressed = false;
          if (!window.__claudeLensInspectMode) {
            document.body.style.cursor = '';
            const tooltip = document.getElementById('claude-lens-tooltip');
            const highlight = document.getElementById('claude-lens-hover-highlight');
            if (tooltip) tooltip.style.display = 'none';
            if (highlight) highlight.style.display = 'none';
          }
        }
      `);
    } catch {
      // Ignore - page might not have script loaded
    }
  });

  browserView.webContents.on('console-message', (_event, level, message) => {
    // Check for freeze toggle (F key pressed in BrowserView)
    if (message === 'CLAUDE_LENS_FREEZE_TOGGLE') {
      mainWindow?.webContents.send('freeze-toggle');
      return;
    }

    // Check if it's our element selection message (from Inspect Mode)
    if (message.startsWith('CLAUDE_LENS_ELEMENT:')) {
      try {
        const elementInfo = JSON.parse(message.replace('CLAUDE_LENS_ELEMENT:', ''));
        mainWindow?.webContents.send('element-selected', elementInfo);
      } catch {
        // Ignore parse errors
      }
      return;
    }

    // Check if it's a Ctrl+Click element capture message
    if (message.startsWith('CLAUDE_LENS_CTRL_ELEMENT:')) {
      try {
        const elementInfo = JSON.parse(message.replace('CLAUDE_LENS_CTRL_ELEMENT:', ''));
        mainWindow?.webContents.send('element-selected', elementInfo);
      } catch {
        // Ignore parse errors
      }
      return;
    }

    // Check if it's a toast capture message (Phase 4)
    if (message.startsWith('CLAUDE_LENS_TOAST:')) {
      try {
        const toastInfo = JSON.parse(message.replace('CLAUDE_LENS_TOAST:', ''));
        mainWindow?.webContents.send('toast-captured', toastInfo);
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

    // Add to buffer for MCP server (CircularBuffer handles overflow automatically)
    consoleBuffer.push(consoleMsg);
  });
}

// Project management handlers
ipcMain.handle('project:open', async (_event, folderPath: string) => {
  try {
    await openProject(folderPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('project:start', async (_event, options: { useDevServer: boolean }) => {
  return startProject(options.useDevServer);
});

ipcMain.handle('project:getInfo', () => {
  return currentProject;
});

ipcMain.handle('project:stopServer', async () => {
  try {
    if (devServerManager) {
      await devServerManager.stop();
      devServerManager = null;
    }
    if (staticServer) {
      await staticServer.stop();
      staticServer = null;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

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
  createMenu();
  await createWindow();
  setupPtyForwarding();

  // Start MCP server for Claude Code integration
  setConsoleBuffer(consoleBuffer);
  try {
    const port = await startMCPServer();
    console.log(`MCP server started on port ${port}`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Failed to start MCP server:', errorMsg);
    dialog.showErrorBox(
      'MCP Server Error',
      `Failed to start MCP server on port 3333.\n\n${errorMsg}\n\nAnother instance may be running.`
    );
  }

  // Initialize Playwright adapter
  playwrightAdapter = new PlaywrightAdapter(CDP_PORT);
  console.log('[PlaywrightAdapter] Adapter initialized');

  // Start Bridge server for MCP server communication (port 9333)
  // This allows the claude-lens MCP server to control the browser via Playwright
  try {
    bridgeServer = new BridgeServer(9333);
    // Use Playwright-powered handler for full automation capabilities
    bridgeServer.setHandler(createPlaywrightBridgeHandler(
      () => browserView,
      () => consoleBuffer.toArray(),
      () => playwrightAdapter
    ));
    await bridgeServer.start();
    console.log('Bridge server started on port 9333 (Playwright-powered)');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Failed to start Bridge server:', errorMsg);
    dialog.showErrorBox(
      'Bridge Server Error',
      `Failed to start Bridge server on port 9333.\n\n${errorMsg}\n\nAnother instance may be running.`
    );
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  stopMCPServer();
  bridgeServer?.stop();

  // Clean up Playwright adapter
  if (playwrightAdapter) {
    await playwrightAdapter.disconnect();
    playwrightAdapter = null;
  }

  // Clean up project servers
  if (devServerManager) {
    await devServerManager.stop();
    devServerManager = null;
  }
  if (staticServer) {
    await staticServer.stop();
    staticServer = null;
  }

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
