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
import * as os from 'os';
import * as fsPromises from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
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
  } catch (error) {
    // Only log if it's not the expected "module not found" error
    const err = error as Error;
    if (!err.message?.includes('Cannot find module')) {
      console.debug('[Hot Reload] Failed to initialize:', err.message);
    }
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
  }).catch((err) => {
    console.error('[ErrorHandler] Failed to show error dialog:', err);
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

// Component source cache - maps component name to file:line
// Cleared when project changes, invalidated on file save
const componentSourceCache = new Map<string, { fileName: string; lineNumber: number } | null>();

/**
 * Search for a component definition in the project source files.
 * Uses grep to find function/const/class declarations.
 * Results are cached for instant subsequent lookups.
 */
async function findComponentSource(componentName: string): Promise<{ fileName: string; lineNumber: number } | null> {
  // Check cache first
  if (componentSourceCache.has(componentName)) {
    return componentSourceCache.get(componentName) || null;
  }

  if (!currentProject?.path) {
    return null;
  }

  // Validate component name - only allow alphanumeric and underscore
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(componentName)) {
    console.warn(`[ComponentSearch] Invalid component name: ${componentName}`);
    return null;
  }

  try {
    const projectPath = currentProject.path;

    // Search patterns for component definitions
    const patterns = [
      `function ${componentName}\\b`,
      `const ${componentName}\\s*=`,
      `let ${componentName}\\s*=`,
      `class ${componentName}\\b`,
    ];

    const grepPattern = patterns.join('\\|');

    // Search in common source directories
    const searchPaths = ['src', 'app', 'components', 'lib', '.'];

    for (const searchPath of searchPaths) {
      const fullSearchPath = path.join(projectPath, searchPath);
      if (!fs.existsSync(fullSearchPath)) continue;

      try {
        // Use execFile with array args (safe from injection)
        const { stdout } = await execFileAsync('grep', [
          '-rn',
          '--include=*.tsx',
          '--include=*.jsx',
          '--include=*.ts',
          '--include=*.js',
          grepPattern,
          fullSearchPath
        ], { timeout: 5000, maxBuffer: 1024 * 1024 });

        const firstLine = stdout.split('\n')[0]?.trim();
        if (firstLine) {
          // Parse grep output: /path/to/file.tsx:42:const ComponentName = ...
          const match = firstLine.match(/^(.+?):(\d+):/);
          if (match) {
            const [, filePath, lineNum] = match;
            const relativePath = path.relative(projectPath, filePath);
            const source = { fileName: relativePath, lineNumber: parseInt(lineNum, 10) };
            componentSourceCache.set(componentName, source);
            console.log(`[ComponentSearch] Found ${componentName} at ${relativePath}:${lineNum}`);
            return source;
          }
        }
      } catch {
        // grep returns exit code 1 if no matches, continue to next path
        continue;
      }
    }

    // Cache negative result to avoid repeated searches
    componentSourceCache.set(componentName, null);
    return null;
  } catch (error) {
    console.error(`[ComponentSearch] Error searching for ${componentName}:`, error);
    return null;
  }
}


/**
 * Enhance element info with React/Vue framework detection and source lookup.
 * Called when element is selected via console message (inspect mode).
 */
async function enhanceElementWithFramework(selector: string): Promise<{ framework?: { framework: string; components: Array<{ name: string; source?: { fileName: string; lineNumber: number } }> } } | null> {
  if (!browserView || !selector) return null;

  try {
    // Run React/Vue detection in the browser
    const result = await browserView.webContents.executeJavaScript(`
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;

        // Detect React component info - walks up DOM tree if no fiber found on element
        function getReactInfo(element) {
          let domNode = element;
          let fiber = null;
          let domDepth = 0;
          const maxDomDepth = 10;

          while (domNode && domDepth < maxDomDepth) {
            const fiberKey = Object.keys(domNode).find(key =>
              key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
            );
            if (fiberKey && domNode[fiberKey]) {
              fiber = domNode[fiberKey];
              break;
            }
            domNode = domNode.parentElement;
            domDepth++;
          }

          if (!fiber) return null;

          let current = fiber;
          const components = [];
          let depth = 0;
          const maxDepth = 20;

          while (current && depth < maxDepth) {
            depth++;
            const type = current.type;

            if (type && typeof type === 'function') {
              const name = type.displayName || type.name || 'Anonymous';
              if (!name.startsWith('_') && name !== 'Anonymous') {
                const componentInfo = { name };
                if (current._debugSource) {
                  componentInfo.source = {
                    fileName: current._debugSource.fileName,
                    lineNumber: current._debugSource.lineNumber,
                  };
                }
                components.push(componentInfo);
                if (components.length >= 3) break;
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
          return { framework: 'Vue', components: [{ name }] };
        }

        const reactInfo = getReactInfo(el);
        const vueInfo = !reactInfo ? getVueInfo(el) : null;
        return { framework: reactInfo || vueInfo || null };
      })()
    `);

    // Enhance components with source info from grep search (for React 19)
    if (result?.framework?.components) {
      console.log('[Enhance] Found components:', result.framework.components.map((c: { name: string }) => c.name));
      for (const component of result.framework.components) {
        if (!component.source && component.name) {
          console.log('[Enhance] Searching source for:', component.name);
          const source = await findComponentSource(component.name);
          if (source) {
            component.source = source;
            console.log('[Enhance] Found source:', source);
          }
        }
      }
    }

    return result;
  } catch (error) {
    console.debug('[Enhance] Error:', error);
    return null;
  }
}

// Recent projects management
interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
  useDevServer: boolean; // Remember the server type preference
}
const MAX_RECENT_PROJECTS = 5;
let recentProjects: RecentProject[] = [];

function getRecentProjectsPath(): string {
  return path.join(app.getPath('userData'), 'recent-projects.json');
}

async function loadRecentProjects(): Promise<void> {
  try {
    const data = await fsPromises.readFile(getRecentProjectsPath(), 'utf-8');
    const parsed = JSON.parse(data);

    // Validate structure - must be an array
    if (!Array.isArray(parsed)) {
      console.warn('[RecentProjects] Invalid data format, expected array');
      recentProjects = [];
      return;
    }

    // Filter out invalid entries
    recentProjects = parsed.filter((p): p is RecentProject => {
      return typeof p === 'object' && p !== null &&
             typeof p.path === 'string' &&
             typeof p.name === 'string' &&
             typeof p.lastOpened === 'number' &&
             typeof p.useDevServer === 'boolean';
    }).slice(0, MAX_RECENT_PROJECTS);
  } catch (error) {
    // File not found is expected on first run
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      recentProjects = [];
      return;
    }
    // Log unexpected errors
    console.error('[RecentProjects] Failed to load:', error);
    recentProjects = [];
  }
}

async function saveRecentProjects(): Promise<void> {
  try {
    await fsPromises.writeFile(getRecentProjectsPath(), JSON.stringify(recentProjects, null, 2));
  } catch (error) {
    console.error('[RecentProjects] Failed to save:', error);
  }
}

async function addRecentProject(projectPath: string, projectName: string, useDevServer: boolean): Promise<void> {
  // Remove if already exists
  recentProjects = recentProjects.filter(p => p.path !== projectPath);
  // Add to front
  recentProjects.unshift({
    path: projectPath,
    name: projectName,
    lastOpened: Date.now(),
    useDevServer,
  });
  // Limit to max
  recentProjects = recentProjects.slice(0, MAX_RECENT_PROJECTS);
  await saveRecentProjects();
  // Update menu to show new recent project
  createMenu();
}

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
  // Build recent projects submenu
  const recentProjectsSubmenu: Electron.MenuItemConstructorOptions[] = recentProjects.length > 0
    ? [
        ...recentProjects.map((project, index) => ({
          label: `${index + 1}. ${project.name}`,
          sublabel: project.path,
          click: () => openRecentProject(project),
        })),
        { type: 'separator' as const },
        {
          label: 'Clear Recent Projects',
          click: async () => {
            recentProjects = [];
            await saveRecentProjects();
            createMenu();
          },
        },
      ]
    : [{ label: 'No Recent Projects', enabled: false }];

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+O',
          click: () => openProjectDialog(),
        },
        {
          label: 'Open Recent',
          submenu: recentProjectsSubmenu,
        },
        {
          label: 'Close Project',
          accelerator: 'CmdOrCtrl+W',
          click: () => closeProject(),
        },
        { type: 'separator' },
        {
          label: 'Restart App',
          accelerator: 'CmdOrCtrl+Shift+R',
          enabled: process.env.NODE_ENV !== 'development',
          click: () => {
            // Only works in production - in dev mode, use terminal to restart
            app.relaunch();
            app.exit(0);
          },
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
        // Note: 'reload' and 'forceReload' roles removed - they reload the entire app
        // which kills Claude and the terminal. Use Ctrl+R for BrowserView reload instead.
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
 * Close the current project and reset state
 */
async function closeProject(): Promise<void> {
  // Stop any running servers and Claude Code
  await Promise.all([
    devServerManager?.stop(),
    staticServer?.stop(),
    ptyManager?.dispose(),
  ]);
  devServerManager = null;
  staticServer = null;
  currentProject = null;

  // Clear the BrowserView
  if (browserView) {
    browserView.webContents.loadURL('about:blank');
  }

  // Notify renderer to reset UI
  mainWindow?.webContents.send('project:closed');
}

/**
 * Open and analyze a project folder
 */
async function openProject(projectPath: string, skipModal = false): Promise<void> {
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

    // Send to renderer to show dialog (unless opening from recent projects)
    if (!skipModal) {
      mainWindow?.webContents.send('project:detected', currentProject);
    }
  } catch (err) {
    console.error('Failed to analyze project:', err);
    dialog.showErrorBox('Error', `Failed to open project: ${err}`);
  }
}

/**
 * Open a recent project directly (skip modal, use stored server preference)
 */
async function openRecentProject(recent: RecentProject): Promise<void> {
  // Analyze the project (skip modal since we already know server preference)
  await openProject(recent.path, true);

  // If project was loaded successfully, start it with stored preference
  if (currentProject) {
    // Notify renderer to show loading state
    mainWindow?.webContents.send('project:loading', {
      name: currentProject.name,
      useDevServer: recent.useDevServer,
    });

    // Hide BrowserView before starting (will be restored in startProject)
    if (browserView && mainWindow) {
      browserView.setBounds({ x: -9999, y: -9999, width: 1, height: 1 });
    }

    // Start with the remembered server preference
    const result = await startProject(recent.useDevServer);

    if (result.success) {
      // Restore BrowserView visibility
      updateBrowserViewBounds();
    } else {
      // Restore BrowserView visibility even on error (otherwise stuck offscreen)
      updateBrowserViewBounds();
      // Notify renderer to hide loading state
      mainWindow?.webContents.send('project:loadingError', result.error || 'Unknown error');
      // Show error to user
      dialog.showErrorBox('Failed to Start Project', result.error || 'Unknown error');
    }
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

### Responsive Testing
| Tool | Purpose |
|------|---------|
| \`claude_lens/set_viewport\` | Change viewport size (presets: full, desktop, tablet, mobile, or custom width) |

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

    // Stop any existing servers and Claude (in parallel since they're independent)
    await Promise.all([
      devServerManager?.stop(),
      staticServer?.stop(),
      ptyManager?.dispose(),
    ]);
    devServerManager = null;
    staticServer = null;

    // Reset viewport to full width when starting a new project
    console.log('[Viewport] Resetting viewport to full width, was:', browserViewportWidth);
    browserViewportWidth = 0;
    mainWindow?.webContents.send('browser:resetViewport');
    console.log('[Viewport] Sent browser:resetViewport to renderer');

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
      // Small delay to let Vite finish initializing after port opens
      await new Promise(resolve => setTimeout(resolve, 500));
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
        mainWindow?.webContents.send('playwright:connecting');

        playwrightAdapter.connect(browserView)
          .then(() => {
            console.log('[PlaywrightAdapter] Connected to BrowserView');
            mainWindow?.webContents.send('playwright:connected');
          })
          .catch((err) => {
            console.error('[PlaywrightAdapter] Failed to connect:', err);
            mainWindow?.webContents.send('playwright:error', {
              message: 'Browser automation unavailable. MCP tools may not work.',
            });
          });
      }
    }

    // Inject Claude Lens context into project before starting Claude
    await injectClaudeLensContext(currentProject.path);

    // Start Claude in the new project directory
    const newPtyManager = new PtyManager();
    ptyManager = newPtyManager;
    setupPtyForwarding();
    await newPtyManager.start({ cwd: currentProject.path });

    // Notify renderer that Claude started automatically
    mainWindow?.webContents.send('pty:autoStarted');

    // Add to recent projects with server preference
    await addRecentProject(currentProject.path, currentProject.name, useDevServer);

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

/**
 * Restart the currently running server (dev or static)
 * Used by both the UI button and MCP tool
 */
async function restartServer(): Promise<{ success: boolean; error?: string }> {
  if (!currentProject) {
    return { success: false, error: 'No project loaded' };
  }

  // Determine which mode was running
  const wasDevServer = devServerManager !== null;
  const wasStaticServer = staticServer !== null;

  if (!wasDevServer && !wasStaticServer) {
    return { success: false, error: 'No server running to restart' };
  }

  try {
    console.log('[Server] Restarting server...');

    // Stop current server
    await Promise.all([
      devServerManager?.stop(),
      staticServer?.stop(),
    ]);
    devServerManager = null;
    staticServer = null;

    // Brief pause to ensure port is released
    await new Promise(resolve => setTimeout(resolve, 500));

    // Restart with same mode
    const result = await startProject(wasDevServer);

    if (result.success) {
      console.log('[Server] Restart complete');
    }

    return result;
  } catch (error) {
    return { success: false, error: String(error) };
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

// Track browser panel width, viewport width, and console drawer height for bounds calculation
let browserPanelWidth = 0;
let browserViewportWidth = 0; // The constrained viewport width (0 = full panel width)
let consoleDrawerHeight = 0;

function updateBrowserViewBounds(viewportWidth?: number, drawerHeight?: number, actualPanelWidth?: number) {
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

  // actualPanelWidth = the full panel width from renderer
  // viewportWidth = the constrained viewport width (for responsive testing)
  const panelWidth = actualPanelWidth || browserPanelWidth || defaultWidth;
  const width = viewportWidth || panelWidth;

  // Subtract console drawer height if open
  const effectiveDrawerHeight = drawerHeight !== undefined ? drawerHeight : consoleDrawerHeight;
  const height = bounds.height - headerHeight - panelHeaderHeight - effectiveDrawerHeight;

  // Validate bounds before setting (avoid NaN/negative values)
  if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
    return;
  }

  browserPanelWidth = panelWidth;
  browserViewportWidth = viewportWidth || 0;
  if (drawerHeight !== undefined) {
    consoleDrawerHeight = drawerHeight;
  }

  // Calculate x offset to center the browser when viewport is constrained
  const xOffset = width < panelWidth ? Math.floor((panelWidth - width) / 2) : 0;

  const newBounds = {
    x: xOffset,
    y: headerHeight + panelHeaderHeight,
    width: Math.round(width),
    height: Math.round(height),
  };
  console.log('[Viewport] setBounds:', newBounds, 'browserViewportWidth:', browserViewportWidth, 'input viewportWidth:', viewportWidth);
  browserView.setBounds(newBounds);
}

// IPC handler to update browser panel width from renderer
// panelWidth is the actual panel width, width is the constrained viewport width
ipcMain.handle('browser:updateBounds', async (_event, width: number, drawerHeight: number, panelWidth?: number) => {
  browserPanelWidth = panelWidth || width;
  consoleDrawerHeight = drawerHeight;
  updateBrowserViewBounds(width, drawerHeight, panelWidth);
});

// IPC handler to temporarily hide/show BrowserView (for modals that need to appear above it)
// BrowserView is a native element that always renders on top of HTML, so we need to hide it
ipcMain.handle('browser:setVisible', async (_event, visible: boolean) => {
  if (!browserView || !mainWindow) return;

  if (visible) {
    // Restore bounds with viewport constraint for centering
    updateBrowserViewBounds(browserViewportWidth || undefined, consoleDrawerHeight, browserPanelWidth);
  } else {
    // Move off-screen (setting bounds to 0,0,0,0 can cause issues)
    browserView.setBounds({ x: -9999, y: -9999, width: 1, height: 1 });
  }
});

// Inject unified inspect system - supports both Ctrl+hover and button toggle
// Ctrl+hover/click always works; Inspect button makes it persistent without Ctrl
// The inspect system JS is loaded from ./inject/inspect-system.js
let inspectSystemScript: string | null = null;

async function loadInspectSystemScript(): Promise<string> {
  if (inspectSystemScript) return inspectSystemScript;

  const scriptPath = path.join(__dirname, 'inject', 'inspect-system.js');
  try {
    inspectSystemScript = await fsPromises.readFile(scriptPath, 'utf-8');
    return inspectSystemScript;
  } catch (error) {
    console.error('[InspectSystem] Failed to load inspect-system.js from:', scriptPath, error);
    // Return minimal fallback script that prevents crash
    return '(function() { console.warn("Claude Lens inspect system not available"); })()';
  }
}

async function injectInspectSystem() {
  if (!browserView) return;

  const script = await loadInspectSystemScript();
  await browserView.webContents.executeJavaScript(script);
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

// Browser (embedded BrowserView) handlers
ipcMain.handle('browser:navigate', async (_event, url: string) => {
  if (!mainWindow) return { success: false, error: 'Window not ready' };

  // Validate URL protocol (security: prevent javascript:, file:, etc.)
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { success: false, error: `Invalid protocol: ${parsed.protocol}. Only http and https are allowed.` };
    }
  } catch {
    return { success: false, error: 'Invalid URL format' };
  }

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

ipcMain.handle('browser:reload', async () => {
  if (!browserView) return { success: false, error: 'No browser view' };
  try {
    browserView.webContents.reload();
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
  } catch (error) {
    console.debug('[Screenshot] Capture failed:', error);
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

        // Detect React component info - walks up DOM tree if no fiber found on element
        function getReactInfo(element) {
          // Walk up DOM tree to find element with React fiber (max 10 levels)
          let domNode = element;
          let fiber = null;
          let domDepth = 0;
          const maxDomDepth = 10;

          while (domNode && domDepth < maxDomDepth) {
            const fiberKey = Object.keys(domNode).find(key =>
              key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
            );
            if (fiberKey && domNode[fiberKey]) {
              fiber = domNode[fiberKey];
              break;
            }
            domNode = domNode.parentElement;
            domDepth++;
          }

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

    // Enhance component info with source locations from grep search
    // This handles React 19 which removed _debugSource
    console.log('[Inspect] Result framework:', result?.framework ? JSON.stringify(result.framework) : 'none');
    if (result?.framework?.components) {
      console.log('[Inspect] Found components:', result.framework.components.map((c: { name: string }) => c.name));
      for (const component of result.framework.components) {
        if (!component.source && component.name) {
          console.log('[Inspect] Searching source for:', component.name);
          const source = await findComponentSource(component.name);
          if (source) {
            component.source = source;
            console.log('[Inspect] Found source:', source);
          }
        }
      }
    }

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

        const target = document.querySelector(${JSON.stringify(selector)});
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
  } catch (error) {
    console.debug('[BrowserView] Script execution error:', error);
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
  } catch (error) {
    console.debug('[BrowserView] Script error:', error);
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
  } catch (error) {
    console.debug('[BrowserView] Script execution error:', error);
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
  } catch (error) {
    console.debug('[BrowserView] Script execution error:', error);
  }
});

// Set up BrowserView console message forwarding
function setupBrowserViewMessaging() {
  if (!browserView || !mainWindow) return;

  // Re-inject inspect system when page loads/reloads (hot reload loses injected scripts)
  browserView.webContents.on('did-finish-load', async () => {
    await injectInspectSystem();
    console.log('[BrowserView] Re-injected inspect system after page load');
    // Notify renderer that page finished loading (for hiding loading overlay)
    mainWindow?.webContents.send('browser:loaded');
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
    } catch (error) {
      console.debug('[BrowserView] Reset Ctrl state failed (page may have navigated):', error);
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
      (async () => {
        try {
          const elementInfo = JSON.parse(message.replace('CLAUDE_LENS_ELEMENT:', ''));
          // Enhance with React component info via browser:inspect
          const enhanced = await enhanceElementWithFramework(elementInfo.selector);
          if (enhanced?.framework) {
            elementInfo.framework = enhanced.framework;
          }
          mainWindow?.webContents.send('element-selected', elementInfo);
        } catch (error) {
          console.debug('[Console] JSON parse error:', error);
        }
      })();
      return;
    }

    // Check if it's a Ctrl+Click element capture message
    if (message.startsWith('CLAUDE_LENS_CTRL_ELEMENT:')) {
      (async () => {
        try {
          const elementInfo = JSON.parse(message.replace('CLAUDE_LENS_CTRL_ELEMENT:', ''));
          // Enhance with React component info via browser:inspect
          const enhanced = await enhanceElementWithFramework(elementInfo.selector);
          if (enhanced?.framework) {
            elementInfo.framework = enhanced.framework;
          }
          mainWindow?.webContents.send('element-selected', elementInfo);
        } catch (error) {
          console.debug('[Console] JSON parse error:', error);
        }
      })();
      return;
    }

    // Check if it's a toast capture message (Phase 4)
    if (message.startsWith('CLAUDE_LENS_TOAST:')) {
      try {
        const toastInfo = JSON.parse(message.replace('CLAUDE_LENS_TOAST:', ''));
        mainWindow?.webContents.send('toast-captured', toastInfo);
      } catch (error) {
        console.debug('[Console] JSON parse error:', error);
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
    // Stop servers in parallel since they're independent
    await Promise.all([
      devServerManager?.stop(),
      staticServer?.stop(),
    ]);
    devServerManager = null;
    staticServer = null;
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('project:restartServer', async () => {
  return restartServer();
});

ipcMain.handle('project:getRecent', () => {
  return recentProjects.map(p => ({
    name: p.name,
    path: p.path,
    useDevServer: p.useDevServer,
    lastOpened: p.lastOpened
  }));
});

ipcMain.handle('project:openRecent', async (_event, projectPath: string) => {
  const recent = recentProjects.find(p => p.path === projectPath);
  if (!recent) return { success: false, error: 'Project not found in recent list' };

  try {
    await openRecentProject(recent);
    // Verify the project actually opened
    if (!currentProject) {
      return { success: false, error: 'Project failed to load' };
    }
    return { success: true };
  } catch (error) {
    console.error('[project:openRecent] Failed to open project:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
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

// =============================================================================
// Platform Detection & Path Utilities (Hardened)
// =============================================================================

type PlatformType = 'windows' | 'wsl' | 'macos' | 'linux';

interface PlatformInfo {
  type: PlatformType;
  canAccessWindowsClipboard: boolean;
  tempDir: string;
  powerShellPath: string | null;
  windowsUsername: string | null;
}

// Cache platform info to avoid repeated filesystem checks
let cachedPlatformInfo: PlatformInfo | null = null;

// Safe filesystem helpers that don't throw
function safeFileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function safeReadDir(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
}

function safeReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// Detect platform type with multiple indicators
function detectPlatformType(): PlatformType {
  // Native Windows
  if (process.platform === 'win32') {
    return 'windows';
  }

  // macOS
  if (process.platform === 'darwin') {
    return 'macos';
  }

  // Linux - check for WSL indicators
  if (process.platform === 'linux') {
    // WSL environment variables (most reliable)
    if (process.env.WSL_DISTRO_NAME || process.env.WSLENV || process.env.WSL_INTEROP) {
      return 'wsl';
    }

    // Check /proc/version for Microsoft string
    const procVersion = safeReadFile('/proc/version');
    if (procVersion && (procVersion.toLowerCase().includes('microsoft') || procVersion.toLowerCase().includes('wsl'))) {
      return 'wsl';
    }

    // Check for WSL interop binary support
    if (safeFileExists('/proc/sys/fs/binfmt_misc/WSLInterop')) {
      return 'wsl';
    }

    // Check for Windows drive mounts (less reliable, could be network mount)
    if (safeFileExists('/mnt/c/Windows/System32')) {
      return 'wsl';
    }
  }

  return 'linux';
}

// Find PowerShell executable - check multiple candidate paths
function findPowerShell(): string | null {
  const candidates = [
    // WSL paths to Windows PowerShell
    '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    '/mnt/c/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe',
    // PowerShell Core (cross-platform)
    '/mnt/c/Program Files/PowerShell/7/pwsh.exe',
    '/mnt/c/Program Files (x86)/PowerShell/7/pwsh.exe',
    // Native Windows paths
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe',
    // PATH fallback (works if WSL has windows PATH integration)
    'powershell.exe',
  ];

  for (const candidate of candidates) {
    // Skip PATH-based candidates for existence check
    if (!candidate.includes('/') && !candidate.includes('\\')) {
      // For PATH candidates, we'll try them last
      continue;
    }
    if (safeFileExists(candidate)) {
      return candidate;
    }
  }

  // Try PATH-based as last resort
  return 'powershell.exe';
}

// Find Windows username by checking existing user directories
function findWindowsUsername(): string | null {
  const usersDir = '/mnt/c/Users';
  const skipDirs = new Set(['Default', 'Default User', 'Public', 'All Users', 'desktop.ini']);

  const users = safeReadDir(usersDir);
  for (const user of users) {
    if (skipDirs.has(user)) continue;

    // Verify this is a real user directory with expected subdirs
    const userPath = path.join(usersDir, user);
    if (safeFileExists(path.join(userPath, 'AppData', 'Local'))) {
      return user;
    }
  }

  // Fallback: try common environment variables
  const envUser = process.env.WINDOWS_USERNAME || process.env.LOGNAME || process.env.USER;
  if (envUser && safeFileExists(path.join(usersDir, envUser, 'AppData', 'Local'))) {
    return envUser;
  }

  return null;
}

// Find Windows temp directory with multiple fallback strategies
function findWindowsTempDir(windowsUsername: string | null): string {
  // Strategy 1: Windows environment variables (native Windows only)
  const winTemp = process.env.TEMP || process.env.TMP;
  if (winTemp && /^[A-Za-z]:\\/.test(winTemp)) {
    // Convert to WSL path if needed
    return windowsPathToWsl(winTemp);
  }

  // Strategy 2: User-specific temp directory
  if (windowsUsername) {
    const userTemp = `/mnt/c/Users/${windowsUsername}/AppData/Local/Temp`;
    if (safeFileExists(userTemp)) {
      return userTemp;
    }
  }

  // Strategy 3: Scan for any valid user temp
  const usersDir = '/mnt/c/Users';
  const skipDirs = new Set(['Default', 'Default User', 'Public', 'All Users']);
  const users = safeReadDir(usersDir);
  for (const user of users) {
    if (skipDirs.has(user)) continue;
    const userTemp = path.join(usersDir, user, 'AppData', 'Local', 'Temp');
    if (safeFileExists(userTemp)) {
      return userTemp;
    }
  }

  // Strategy 4: Windows system temp (always exists, may need admin)
  const systemTemp = '/mnt/c/Windows/Temp';
  if (safeFileExists(systemTemp)) {
    return systemTemp;
  }

  // Strategy 5: Linux temp (won't work for PowerShell but prevents crash)
  console.warn('[Platform] No Windows temp directory found, falling back to Linux temp');
  return os.tmpdir();
}

// Convert Windows path to WSL path
function windowsPathToWsl(winPath: string): string {
  // C:\Users\Name -> /mnt/c/Users/Name
  return winPath
    .replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`)
    .replace(/\\/g, '/');
}

// Get platform info (cached)
function getPlatformInfo(): PlatformInfo {
  if (cachedPlatformInfo) {
    return cachedPlatformInfo;
  }

  const type = detectPlatformType();
  const windowsUsername = (type === 'wsl' || type === 'windows') ? findWindowsUsername() : null;
  const powerShellPath = (type === 'wsl' || type === 'windows') ? findPowerShell() : null;

  let tempDir: string;
  let canAccessWindowsClipboard: boolean;

  switch (type) {
    case 'windows':
      tempDir = process.env.TEMP || process.env.TMP || 'C:\\Windows\\Temp';
      canAccessWindowsClipboard = true;
      break;
    case 'wsl':
      tempDir = findWindowsTempDir(windowsUsername);
      canAccessWindowsClipboard = powerShellPath !== null;
      break;
    default:
      tempDir = os.tmpdir();
      canAccessWindowsClipboard = false;
  }

  cachedPlatformInfo = {
    type,
    canAccessWindowsClipboard,
    tempDir,
    powerShellPath,
    windowsUsername,
  };

  console.log('[Platform] Detected:', JSON.stringify(cachedPlatformInfo, null, 2));

  return cachedPlatformInfo;
}

// PowerShell script to check and save clipboard image (for WSL)
function createPowerShellScript(outputPath: string): string {
  // Convert WSL path to Windows path for PowerShell
  const winPath = outputPath.replace(/^\/mnt\/([a-z])\//, '$1:\\\\').replace(/\//g, '\\\\');

  return `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$result = @{ hasImage = $false; path = ""; error = "" }

try {
    # Check for file drops first (copied image files)
    $files = [System.Windows.Forms.Clipboard]::GetFileDropList()
    if ($files -and $files.Count -gt 0) {
        $imageExtensions = @('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp')
        foreach ($file in $files) {
            $ext = [System.IO.Path]::GetExtension($file).ToLower()
            if ($imageExtensions -contains $ext) {
                Copy-Item -Path $file -Destination "${winPath}" -Force
                $result.hasImage = $true
                $result.path = "${winPath}"
                break
            }
        }
    }

    # If no file drop, check for bitmap data (screenshots)
    if (-not $result.hasImage) {
        $image = [System.Windows.Forms.Clipboard]::GetImage()
        if ($image) {
            $image.Save("${winPath}", [System.Drawing.Imaging.ImageFormat]::Png)
            $result.hasImage = $true
            $result.path = "${winPath}"
            $image.Dispose()
        }
    }
} catch {
    $result.error = $_.Exception.Message
}

$result | ConvertTo-Json
`;
}

// Run PowerShell and get clipboard image (WSL/Windows workaround)
async function getClipboardImageWSL(): Promise<{ hasImage: boolean; path?: string; error?: string }> {
  const platform = getPlatformInfo();

  // Verify we can access Windows clipboard
  if (!platform.canAccessWindowsClipboard) {
    return { hasImage: false, error: 'Windows clipboard not accessible on this platform' };
  }

  if (!platform.powerShellPath) {
    return { hasImage: false, error: 'PowerShell not found' };
  }

  // Store in local const for TypeScript narrowing (null check done above)
  const powerShellPath = platform.powerShellPath;

  return new Promise((resolve) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `claude-lens-${timestamp}.png`;
    const imagePath = path.join(platform.tempDir, filename);
    console.log('[Clipboard WSL] Using temp path:', imagePath);
    console.log('[Clipboard WSL] Using PowerShell:', powerShellPath);

    const script = createPowerShellScript(imagePath);

    execFile(
      powerShellPath,
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 15000 },  // Increased timeout for slow systems
      (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          console.error('[Clipboard WSL] PowerShell error:', error.message);
          if (stderr) console.error('[Clipboard WSL] stderr:', stderr);
          resolve({ hasImage: false, error: error.message });
          return;
        }

        try {
          // Handle empty or whitespace-only output
          const trimmedOutput = stdout.trim();
          if (!trimmedOutput) {
            console.error('[Clipboard WSL] Empty PowerShell output');
            resolve({ hasImage: false, error: 'Empty PowerShell output' });
            return;
          }

          const result = JSON.parse(trimmedOutput);
          console.log('[Clipboard WSL] Result:', result);

          if (result.hasImage && result.path) {
            // Convert Windows path back to WSL path
            const wslPath = windowsPathToWsl(result.path);
            resolve({ hasImage: true, path: wslPath });
          } else {
            resolve({ hasImage: false, error: result.error || 'No image in clipboard' });
          }
        } catch (parseError) {
          console.error('[Clipboard WSL] Parse error:', parseError);
          console.error('[Clipboard WSL] Raw stdout:', stdout);
          resolve({ hasImage: false, error: 'Failed to parse PowerShell output' });
        }
      }
    );
  });
}

// Clipboard image detection
ipcMain.handle('clipboard:hasImage', async () => {
  const platform = getPlatformInfo();
  console.log('[Clipboard] Platform:', platform.type);

  // Always try native Electron clipboard first
  const formats = clipboard.availableFormats();
  const image = clipboard.readImage();
  const hasImage = !image.isEmpty();
  console.log('[Clipboard] availableFormats:', formats);
  console.log('[Clipboard] Native hasImage:', hasImage, 'size:', image.getSize());

  // If native works, use it
  if (hasImage) {
    return true;
  }

  // If native doesn't work and we can access Windows clipboard, try PowerShell
  if (platform.canAccessWindowsClipboard && (platform.type === 'wsl' || formats.length === 0)) {
    console.log('[Clipboard] Trying PowerShell workaround...');
    const result = await getClipboardImageWSL();
    // Cache the result for saveImage call
    (global as Record<string, unknown>).__clipboardCache = result;
    return result.hasImage;
  }

  return false;
});

// Save clipboard image to temp file and return path
ipcMain.handle('clipboard:saveImage', async () => {
  // Check for cached PowerShell result first
  const cached = (global as Record<string, unknown>).__clipboardCache as { hasImage: boolean; path?: string; error?: string } | undefined;
  if (cached?.hasImage && cached?.path) {
    console.log('[Clipboard] Using cached PowerShell image:', cached.path);
    // Clear cache after use
    (global as Record<string, unknown>).__clipboardCache = undefined;
    return { success: true, path: cached.path };
  }

  // Try native Electron clipboard
  try {
    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      // Generate timestamped filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `claude-lens-${timestamp}.png`;
      const tempDir = os.tmpdir();
      const imagePath = path.join(tempDir, filename);

      // Save as PNG
      const pngBuffer = image.toPNG();
      await fsPromises.writeFile(imagePath, pngBuffer);

      console.log(`[Clipboard] Saved native image to ${imagePath}`);
      return { success: true, path: imagePath };
    }
  } catch (error) {
    console.error('[Clipboard] Native save failed:', error);
  }

  // Fall back to PowerShell
  console.log('[Clipboard] Trying PowerShell fallback for save...');
  const result = await getClipboardImageWSL();
  if (result.hasImage && result.path) {
    return { success: true, path: result.path };
  }
  return { success: false, error: result.error || 'No image in clipboard' };
});

// Read text from clipboard (works without document focus)
ipcMain.handle('clipboard:readText', () => {
  return clipboard.readText();
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
  await loadRecentProjects();
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
      () => playwrightAdapter,
      // Viewport callback - sends width to renderer
      (width: number) => {
        mainWindow?.webContents.send('browser:setViewport', width);
      },
      // Restart server callback - for MCP tool
      restartServer
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

  // Clean up project servers (in parallel since they're independent)
  await Promise.all([
    devServerManager?.stop(),
    staticServer?.stop(),
  ]);
  devServerManager = null;
  staticServer = null;

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
