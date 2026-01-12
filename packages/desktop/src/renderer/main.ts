/**
 * Claude Lens Desktop - Renderer
 *
 * Three-column layout: Browser | Context Panel | Claude Code Terminal
 * Cursor-style element inspection and context display.
 */

import { Terminal } from 'xterm';
import type { ElementInfo, ProjectInfo, CapturedInteraction, ToastCapture } from './types';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { SearchAddon } from '@xterm/addon-search';
import 'xterm/css/xterm.css';
import {
  formatElements,
  formatSequence,
  formatConsole,
  type ContextMode,
} from './context-formatter';
import {
  MCP_TOOL_ICONS,
  CHAR_SUBSTITUTIONS,
  MCP_INDICATORS,
} from './constants/mcp-tool-icons';
import { debounce, waitForFonts, runFontDiagnostics, getEl, copyToClipboard } from './utils';
import {
  consoleBuffer,
  addConsoleMessage as stateAddConsoleMessage,
  DRAWER_HEIGHT,
  type ConsoleMessage,
} from './state';

// Elements - Header
const urlInput = getEl<HTMLInputElement>('urlInput');
const goBtn = getEl<HTMLButtonElement>('goBtn');
const refreshBtn = getEl<HTMLButtonElement>('refreshBtn');
refreshBtn.disabled = true; // Disabled until a page is loaded
const restartServerBtn = getEl<HTMLButtonElement>('restartServerBtn');
const statusEl = getEl<HTMLSpanElement>('status');
const viewportSelect = getEl<HTMLSelectElement>('viewportSelect');
const projectDropdown = getEl<HTMLSelectElement>('projectDropdown');

// Elements - Panels
const placeholder = getEl<HTMLDivElement>('placeholder');
const loadingOverlay = getEl<HTMLDivElement>('loadingOverlay');
const terminalEl = getEl<HTMLDivElement>('terminal');
const startClaudeBtn = getEl<HTMLButtonElement>('startClaudeBtn');
const inspectBtn = getEl<HTMLButtonElement>('inspectBtn');
const browserHelpText = getEl<HTMLSpanElement>('browserHelpText');

// Elements - Context Panel
const contextEmpty = getEl<HTMLDivElement>('contextEmpty');
const descriptionInfo = getEl<HTMLDivElement>('descriptionInfo');
const elementDescription = getEl<HTMLSpanElement>('elementDescription');
const elementInfo = getEl<HTMLDivElement>('elementInfo');
const hierarchyInfo = getEl<HTMLDivElement>('hierarchyInfo');
const hierarchyList = getEl<HTMLDivElement>('hierarchyList');
const pathInfo = getEl<HTMLDivElement>('pathInfo');
const attributesInfo = getEl<HTMLDivElement>('attributesInfo');
const stylesInfo = getEl<HTMLDivElement>('stylesInfo');
const positionInfo = getEl<HTMLDivElement>('positionInfo');
const textInfo = getEl<HTMLDivElement>('textInfo');

// Elements - Console Drawer (browser panel)
const consoleToggleBtn = getEl<HTMLButtonElement>('consoleToggleBtn');
const consoleDrawer = getEl<HTMLDivElement>('consoleDrawer');
const consoleDrawerMessages = getEl<HTMLDivElement>('consoleDrawerMessages');
const consoleDrawerCount = getEl<HTMLSpanElement>('consoleDrawerCount');
const consoleClearBtn = getEl<HTMLButtonElement>('consoleClearBtn');
const consoleSendBtn = getEl<HTMLButtonElement>('consoleSendBtn');

const elementTag = getEl<HTMLElement>('elementTag');
const elementPath = getEl<HTMLElement>('elementPath');
const attributesList = getEl<HTMLDivElement>('attributesList');
const stylesList = getEl<HTMLDivElement>('stylesList');
const positionData = getEl<HTMLDivElement>('positionData');
const innerText = getEl<HTMLSpanElement>('innerText');

// Elements - Component Info
const componentInfo = getEl<HTMLDivElement>('componentInfo');
const frameworkBadge = getEl<HTMLSpanElement>('frameworkBadge');
const componentList = getEl<HTMLDivElement>('componentList');

// Elements - Source Info
const sourceInfo = getEl<HTMLDivElement>('sourceInfo');
const sourceStatus = getEl<HTMLSpanElement>('sourceStatus');
const sourceAvailable = getEl<HTMLDivElement>('sourceAvailable');
const sourceLocation = getEl<HTMLElement>('sourceLocation');
const copySourceBtn = getEl<HTMLButtonElement>('copySourceBtn');
const sourceUnavailable = getEl<HTMLDivElement>('sourceUnavailable');
const sourceNoFramework = getEl<HTMLDivElement>('sourceNoFramework');

// Elements - Chips and Prompt
const elementChips = getEl<HTMLDivElement>('elementChips');
const promptInput = getEl<HTMLTextAreaElement>('promptInput');
const sendPromptBtn = getEl<HTMLButtonElement>('sendPromptBtn');
const contextModeSelect = getEl<HTMLSelectElement>('contextModeSelect');

// Elements - Inspect Sequence (Phase 2)
const inspectSequenceInfo = getEl<HTMLDivElement>('inspectSequenceInfo');
const sequenceCount = getEl<HTMLSpanElement>('sequenceCount');
const inspectSequenceList = getEl<HTMLDivElement>('inspectSequenceList');
const clearSequenceBtn = getEl<HTMLButtonElement>('clearSequenceBtn');
const sendSequenceBtn = getEl<HTMLButtonElement>('sendSequenceBtn');

// Elements - Form State & Freeze Hover (Phase 3)
const formStateInfo = getEl<HTMLDivElement>('formStateInfo');
const formStateContent = getEl<HTMLDivElement>('formStateContent');
const validationBadge = getEl<HTMLSpanElement>('validationBadge');
const freezeHoverBtn = getEl<HTMLButtonElement>('freezeHoverBtn');

// Elements - Phase 4: Edge Cases
const overlayInfo = getEl<HTMLDivElement>('overlayInfo');
const overlayContent = getEl<HTMLDivElement>('overlayContent');
const overlayTypeBadge = getEl<HTMLSpanElement>('overlayTypeBadge');
const stackingInfo = getEl<HTMLDivElement>('stackingInfo');
const stackingContent = getEl<HTMLDivElement>('stackingContent');
const zIndexBadge = getEl<HTMLSpanElement>('zIndexBadge');
const scrollInfo = getEl<HTMLDivElement>('scrollInfo');
const scrollContent = getEl<HTMLDivElement>('scrollContent');
const visibilityBadge = getEl<HTMLSpanElement>('visibilityBadge');
const iframeInfo = getEl<HTMLDivElement>('iframeInfo');
const iframeContent = getEl<HTMLDivElement>('iframeContent');
const shadowDOMInfo = getEl<HTMLDivElement>('shadowDOMInfo');
const shadowDOMContent = getEl<HTMLDivElement>('shadowDOMContent');
const toastCapturesInfo = getEl<HTMLDivElement>('toastCapturesInfo');
const toastCapturesList = getEl<HTMLDivElement>('toastCapturesList');
const toastCount = getEl<HTMLSpanElement>('toastCount');
const clearToastsBtn = getEl<HTMLButtonElement>('clearToastsBtn');
const sendToastsBtn = getEl<HTMLButtonElement>('sendToastsBtn');

// Elements - Resizers
const resizer1 = getEl<HTMLDivElement>('resizer1');
const resizer2 = getEl<HTMLDivElement>('resizer2');

// Elements - Copy Buttons
const copySelectorBtn = getEl<HTMLButtonElement>('copySelectorBtn');
const copyComponentBtn = getEl<HTMLButtonElement>('copyComponentBtn');

// Elements - Thinking Indicator
const thinkingIndicator = getEl<HTMLSpanElement>('thinkingIndicator');

// Elements - Enhanced Status Bar
const projectStatus = getEl<HTMLSpanElement>('projectStatus');
const serverStatus = getEl<HTMLSpanElement>('serverStatus');
const playwrightStatus = getEl<HTMLSpanElement>('playwrightStatus');
const viewportStatus = getEl<HTMLSpanElement>('viewportStatus');

// Terminal setup with optimized scrollback buffer
// Font stack: Main font -> Symbols font for icons -> System fonts for standard Unicode symbols
const terminal = new Terminal({
  theme: {
    background: '#1e1e1e',
    foreground: '#cccccc',
    cursor: '#cccccc',
    selectionBackground: '#264f78',
  },
  // Complete font stack:
  // 1. JetBrains Mono NF - main text + some icons
  // 2. Symbols Nerd Font - Nerd Font icons
  // 3. Noto Sans Symbols 2 - Unicode symbols (U+23F5 play buttons for Claude Code checkboxes)
  // 4. System symbol fonts - standard Unicode symbols
  // 5. monospace - final fallback
  fontFamily: "'JetBrains Mono NF Bundled', 'Symbols Nerd Font', 'Noto Sans Symbols 2', 'Segoe UI Symbol', 'Apple Symbols', monospace",
  fontSize: 13,
  cursorBlink: true,
  allowProposedApi: true,
  scrollback: 5000, // Limit scrollback to control memory usage
});

const fitAddon = new FitAddon();
const unicode11Addon = new Unicode11Addon();
terminal.loadAddon(fitAddon);
terminal.loadAddon(new WebLinksAddon());
terminal.loadAddon(unicode11Addon);
terminal.unicode.activeVersion = '11';

// State is now managed by the state module
// Local references for backward compatibility during refactor
// These will be removed in Phase 7 integration
let selectedElements: ElementInfo[] = [];
let inspectSequence: CapturedInteraction[] = [];
let capturedToasts: ToastCapture[] = [];
let claudeRunning = false;
let browserLoaded = false;
let inspectMode = false;
let consoleDrawerOpen = false;
let contextMode: ContextMode = 'lean';
let hoverFrozen = false;
let isThinking = false;
let thinkingTimeout: ReturnType<typeof setTimeout> | null = null;
let viewportWidth = 0;
let currentProjectName = '';
let currentServerPort = 0;
let currentServerType: 'dev' | 'static' | null = null;
let playwrightConnected = false;

/**
 * Update browser bounds with viewport constraint
 * Call this whenever panel size changes or viewport preset changes
 */
function updateBrowserBounds() {
  const browserPanel = document.querySelector('.browser-panel') as HTMLElement;
  const drawerHeight = consoleDrawerOpen ? DRAWER_HEIGHT : 0;

  // Apply viewport width constraint
  const panelWidth = browserPanel.offsetWidth;
  const effectiveWidth = viewportWidth > 0 ? Math.min(viewportWidth, panelWidth) : panelWidth;

  console.log('[Viewport] updateBrowserBounds:', { viewportWidth, panelWidth, effectiveWidth, drawerHeight });

  // Pass both panelWidth and effectiveWidth so main can center the browser
  window.claudeLens.browser.updateBounds(effectiveWidth, drawerHeight, panelWidth);
}

/**
 * Set browser as loaded and update UI state
 * Consolidates all the state changes needed when browser content is ready
 */
function setBrowserLoaded(url?: string) {
  browserLoaded = true;
  refreshBtn.disabled = false;
  restartServerBtn.disabled = false;
  placeholder.classList.add('hidden');
  setStatus('Connected', true);
  browserHelpText.textContent = 'Ctrl+hover to inspect anytime';
  if (url) {
    urlInput.value = url;
  }
  updateBrowserBounds();
}

// Console buffer is now imported from state module

// Show project modal when a project is detected
function showProjectModal(project: ProjectInfo) {
  // Remove existing modal if any
  const existing = document.querySelector('.project-modal');
  if (existing) existing.remove();

  // Hide BrowserView so modal appears on top (BrowserView is a native element that renders above HTML)
  window.claudeLens.browser.setVisible(false);

  const modal = document.createElement('div');
  modal.className = 'project-modal';

  const content = document.createElement('div');
  content.className = 'project-modal-content';

  const title = document.createElement('h2');
  title.textContent = `Open Project: ${project.name}`;
  content.appendChild(title);

  const info = document.createElement('div');
  info.className = 'project-info';

  const typeLabel = project.type === 'node' ? 'Node.js' : project.type === 'static' ? 'Static HTML' : 'Unknown';
  const typeP = document.createElement('p');
  const typeStrong = document.createElement('strong');
  typeStrong.textContent = 'Type: ';
  typeP.appendChild(typeStrong);
  typeP.appendChild(document.createTextNode(typeLabel));
  info.appendChild(typeP);

  if (project.framework && project.framework !== 'unknown') {
    const frameworkP = document.createElement('p');
    const frameworkStrong = document.createElement('strong');
    frameworkStrong.textContent = 'Framework: ';
    frameworkP.appendChild(frameworkStrong);
    const frameworkLabel = project.framework.charAt(0).toUpperCase() + project.framework.slice(1);
    frameworkP.appendChild(document.createTextNode(frameworkLabel));
    info.appendChild(frameworkP);
  }

  if (project.suggestedPort) {
    const portP = document.createElement('p');
    const portStrong = document.createElement('strong');
    portStrong.textContent = 'Port: ';
    portP.appendChild(portStrong);
    portP.appendChild(document.createTextNode(String(project.suggestedPort)));
    info.appendChild(portP);
  }

  const pathP = document.createElement('p');
  pathP.className = 'project-path';
  const pathStrong = document.createElement('strong');
  pathStrong.textContent = 'Path: ';
  pathP.appendChild(pathStrong);
  const pathCode = document.createElement('code');
  pathCode.textContent = project.path;
  pathP.appendChild(pathCode);
  info.appendChild(pathP);
  content.appendChild(info);

  const buttons = document.createElement('div');
  buttons.className = 'project-buttons';

  if (project.devCommand) {
    const devBtn = document.createElement('button');
    devBtn.className = 'btn btn-primary';
    devBtn.textContent = `Start with ${project.devCommand}`;
    devBtn.addEventListener('click', async () => {
      devBtn.disabled = true;
      devBtn.textContent = 'Starting...';
      // Update status bar state
      currentProjectName = project.name;
      currentServerType = 'dev';
      updateStatusBar();
      const result = await window.claudeLens.project.start({ useDevServer: true });
      modal.remove();
      // Restore BrowserView visibility
      window.claudeLens.browser.setVisible(true);
      if (result.success && result.url) {
        console.log('[Viewport] Browser loaded, updating bounds');
        setBrowserLoaded(result.url);
      } else {
        alert(`Failed to start dev server: ${result.error}`);
      }
    });
    buttons.appendChild(devBtn);
  }

  const staticBtn = document.createElement('button');
  staticBtn.className = project.devCommand ? 'btn btn-secondary' : 'btn btn-primary';
  staticBtn.textContent = 'Use Built-in Server';
  staticBtn.addEventListener('click', async () => {
    staticBtn.disabled = true;
    staticBtn.textContent = 'Starting...';
    // Update status bar state
    currentProjectName = project.name;
    currentServerType = 'static';
    updateStatusBar();
    const result = await window.claudeLens.project.start({ useDevServer: false });
    modal.remove();
    // Restore BrowserView visibility
    window.claudeLens.browser.setVisible(true);
    if (result.success && result.url) {
      setBrowserLoaded(result.url);
    } else {
      alert(`Failed to start server: ${result.error}`);
    }
  });
  buttons.appendChild(staticBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    modal.remove();
    // Restore BrowserView visibility
    window.claudeLens.browser.setVisible(true);
  });
  buttons.appendChild(cancelBtn);

  content.appendChild(buttons);
  modal.appendChild(content);
  document.body.appendChild(modal);
}

// Initialize
async function init() {
  // Display version
  const versionEl = document.getElementById('appVersion');
  if (versionEl) {
    versionEl.textContent = `v${window.claudeLens.version}`;
  }

  // Wait for fonts to load BEFORE opening terminal
  // This is critical - xterm.js caches font measurements on open()
  const fontFamily = terminal.options.fontFamily || 'monospace';
  await waitForFonts(fontFamily);

  // Now open terminal - font measurements will use the loaded font
  terminal.open(terminalEl);

  // Run font diagnostics (only warns if issues)
  runFontDiagnostics();

  // Load search addon for Ctrl+F functionality
  const searchAddon = new SearchAddon();
  terminal.loadAddon(searchAddon);

  // Custom key handler for image paste (must intercept before xterm's default paste)
  terminal.attachCustomKeyEventHandler((e) => {
    // Ctrl+Shift+V - check for image paste
    if (e.ctrlKey && e.shiftKey && (e.key === 'v' || e.key === 'V') && e.type === 'keydown') {
      // Handle async image check
      (async () => {
        if (!claudeRunning) return;
        try {
          const hasImage = await window.claudeLens.clipboard.hasImage();
          console.log('[Clipboard] hasImage:', hasImage);
          if (hasImage) {
            setStatus('Saving image...');
            const result = await window.claudeLens.clipboard.saveImage();
            console.log('[Clipboard] saveImage result:', result);
            if (result.success && result.path) {
              window.claudeLens.pty.write(`@${result.path} `);
              setStatus('Image pasted', true);
              setTimeout(() => {
                if (browserLoaded) setStatus('Connected', true);
              }, 2000);
            } else {
              setStatus(`Image error: ${result.error}`);
            }
          } else {
            // No image - paste text via IPC (avoids "document not focused" error)
            const text = await window.claudeLens.clipboard.readText();
            if (text) {
              window.claudeLens.pty.write(text);
            }
          }
        } catch (err) {
          console.error('[Clipboard] Paste error:', err);
        }
      })();
      // Return false to prevent xterm's default handling
      return false;
    }

    // Ctrl+Shift+C - copy selection
    if (e.ctrlKey && e.shiftKey && (e.key === 'c' || e.key === 'C') && e.type === 'keydown') {
      const selection = terminal.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).then(() => {
          setStatus('Copied to clipboard');
          setTimeout(() => {
            if (browserLoaded) setStatus('Connected', true);
          }, 2000);
        });
        return false;
      }
    }

    // Allow all other keys
    return true;
  });

  fitAddon.fit();

  // Force a refresh after a delay for any rendering glitches
  setTimeout(() => {
    terminal.refresh(0, terminal.rows - 1);
  }, 500);

  // Smart substitution: detect MCP patterns and use semantic icons
  // Constants imported from ./constants/mcp-tool-icons.ts
  const substituteChars = (data: string): string => {
    let result = data;

    // For each MCP indicator character, check if it's followed by a known pattern
    for (const indicator of MCP_INDICATORS) {
      if (!result.includes(indicator)) continue;

      // Find all occurrences of the indicator
      const regex = new RegExp(indicator + '\\s*(.{0,50})', 'g');
      result = result.replace(regex, (match, afterIndicator) => {
        // Check each MCP tool pattern
        for (const tool of MCP_TOOL_ICONS) {
          if (tool.pattern.test(afterIndicator)) {
            // Replace indicator with semantic icon, optionally transform text
            const displayText = tool.transform || afterIndicator;
            return tool.icon + ' ' + displayText;
          }
        }
        // Fallback: use basic substitution
        const fallback = CHAR_SUBSTITUTIONS[indicator] || indicator;
        return fallback + ' ' + afterIndicator;
      });
    }

    // Also do basic substitution for any remaining characters
    for (const [from, to] of Object.entries(CHAR_SUBSTITUTIONS)) {
      if (result.includes(from)) {
        result = result.replaceAll(from, to);
      }
    }

    return result;
  };

  // PTY data handler
  window.claudeLens.pty.onData((data) => {
    // Hide thinking indicator when we receive output from Claude
    if (isThinking) {
      isThinking = false;
      thinkingIndicator.classList.add('hidden');
      if (thinkingTimeout) {
        clearTimeout(thinkingTimeout);
        thinkingTimeout = null;
      }
    }
    // Substitute missing characters and enhance MCP output
    const processed = substituteChars(data);
    terminal.write(processed);
  });

  window.claudeLens.pty.onExit((code) => {
    terminal.writeln(`\r\n[Claude exited with code ${code}]`);
    claudeRunning = false;
    startClaudeBtn.textContent = 'Start Claude';
  });

  // Terminal input -> PTY
  terminal.onData((data) => {
    if (claudeRunning) {
      window.claudeLens.pty.write(data);
    }
  });

  // Handle resize with debounce to prevent artifacts
  let resizeTimeout: number | null = null;
  window.addEventListener('resize', () => {
    // Debounce resize to prevent rapid redraws
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    resizeTimeout = window.setTimeout(() => {
      fitAddon.fit();
      // Force full terminal refresh to clear rendering artifacts
      terminal.refresh(0, terminal.rows - 1);
      if (claudeRunning) {
        window.claudeLens.pty.resize(terminal.cols, terminal.rows);
      }
      // Update browser bounds when window resizes
      if (browserLoaded) {
        updateBrowserBounds();
      }
    }, 100);
  });

  // Set up resizers
  setupResizers();

  // Listen for console messages from BrowserView
  window.claudeLens.browser.onConsoleMessage((msg) => {
    addConsoleMessage(msg);
  });

  // Listen for freeze toggle from F key in BrowserView
  window.claudeLens.browser.onFreezeToggle(() => {
    toggleFreezeHover();
  });

  // Listen for toast captures (Phase 4)
  window.claudeLens.browser.onToastCaptured((toast) => {
    capturedToasts.push(toast);
    updateToastCapturesUI();
  });

  // Listen for element selection from BrowserView
  window.claudeLens.browser.onElementSelected((element) => {
    const elementData = element as ElementInfo;

    // If in inspect mode, add to sequence instead of exiting
    if (inspectMode) {
      // Add to inspect sequence
      const interaction: CapturedInteraction = {
        element: elementData,
        action: 'click',
        result: elementData.interactionResult || 'Element captured',
        timestamp: Date.now(),
      };
      inspectSequence.push(interaction);
      updateInspectSequenceUI();

      // Also add to selected elements
      addSelectedElement(elementData);
      browserHelpText.textContent = `Captured ${inspectSequence.length} • Click more or stop inspecting`;
    } else {
      // Normal single-element selection (Ctrl+Click)
      addSelectedElement(elementData);
      // Don't change browser help text for single element selection
    }
  });

  // Listen for project detection (File > Open Project)
  window.claudeLens.project.onDetected((project) => {
    showProjectModal(project);
  });

  // Listen for project close (File > Close Project)
  window.claudeLens.project.onClosed(() => {
    browserLoaded = false;
    refreshBtn.disabled = true;
    restartServerBtn.disabled = true;
    placeholder.classList.remove('hidden');
    urlInput.value = 'http://localhost:3000';
    setStatus('Disconnected');
    browserHelpText.textContent = '';
    // Reset Claude state
    claudeRunning = false;
    startClaudeBtn.textContent = 'Start Claude';
    terminal.clear();
    // Reset status bar state
    currentProjectName = '';
    currentServerPort = 0;
    currentServerType = null;
    playwrightConnected = false;
    updateStatusBar();
    // Reset project dropdown
    projectDropdown.value = '';
  });

  // Listen for project loading (recent projects flow - shows loading overlay)
  window.claudeLens.project.onLoading((info) => {
    placeholder.classList.add('hidden');
    loadingOverlay.classList.remove('hidden');
    const serverType = info.useDevServer ? 'dev server' : 'static server';
    setStatus(`Loading ${info.name} (${serverType})...`);
    // Update status bar state
    currentProjectName = info.name;
    currentServerType = info.useDevServer ? 'dev' : 'static';
    updateStatusBar();
    // Update project dropdown to show current project
    updateProjectDropdown();
  });

  // Handle project loading errors (recent projects flow - hides loading overlay)
  window.claudeLens.project.onLoadingError((error) => {
    loadingOverlay.classList.add('hidden');
    placeholder.classList.remove('hidden');
    setStatus(`Error: ${error}`);
    console.error('[Project] Loading error:', error);
  });

  // Handle Claude auto-starting when a project opens
  window.claudeLens.pty.onAutoStarted(() => {
    claudeRunning = true;
    startClaudeBtn.textContent = 'Running';
    window.claudeLens.pty.resize(terminal.cols, terminal.rows);
    terminal.focus();

    // Force a refresh to ensure icons render correctly with auto-started output
    // This catches any data written before the 200ms font refresh timer
    setTimeout(() => {
      terminal.refresh(0, terminal.rows - 1);
    }, 300);
  });

  // Handle server ready event (fired for both modal flow and recent projects flow)
  window.claudeLens.server.onReady((info) => {
    setStatus(`Server ready on port ${info.port}`, true);
    // Update status bar with port info
    currentServerPort = info.port;
    updateStatusBar();
    // Ensure browserLoaded is true for recent projects flow (modal flow sets it separately)
    if (!browserLoaded) {
      console.log('[Viewport] Server ready, browser loaded, updating bounds');
      setBrowserLoaded(`http://localhost:${info.port}`);
    } else {
      updateBrowserBounds();
    }
  });

  // Handle page fully loaded event (fired when BrowserView finishes loading)
  // This is the right time to hide loading overlay - after page is actually rendered
  window.claudeLens.browser.onPageLoaded(() => {
    loadingOverlay.classList.add('hidden');
    console.log('[Viewport] Page fully loaded, hiding loading overlay');
  });

  // Handle Playwright connection status for status bar
  window.claudeLens.browser.onPlaywrightConnecting(() => {
    playwrightConnected = false;
    updateStatusBar();
  });

  window.claudeLens.browser.onPlaywrightConnected(() => {
    playwrightConnected = true;
    updateStatusBar();
  });

  window.claudeLens.browser.onPlaywrightError(() => {
    playwrightConnected = false;
    updateStatusBar();
  });

  // Handle server exit event
  window.claudeLens.server.onExit((info) => {
    setStatus(`Server exited (code ${info.code})`);
  });

  // Handle server progress updates (shows timer during startup)
  window.claudeLens.server.onProgress((progress) => {
    // Show progress in status bar with elapsed time
    const isReady = progress.phase === 'ready';
    setStatus(progress.status, isReady);
  });

  // Initialize project dropdown with recent projects
  await updateProjectDropdown();

  // Handle project dropdown change
  projectDropdown.addEventListener('change', async () => {
    const selectedPath = projectDropdown.value;
    if (selectedPath) {
      const result = await window.claudeLens.project.openRecent(selectedPath);
      if (!result.success) {
        console.error('Failed to open project:', result.error);
        setStatus(`Failed: ${result.error}`);
      }
    }
  });
}

// Update project dropdown with recent projects
async function updateProjectDropdown() {
  const recentProjects = await window.claudeLens.project.getRecent();

  // Clear existing options except first
  while (projectDropdown.options.length > 1) {
    projectDropdown.remove(1);
  }

  // Add recent projects
  for (const project of recentProjects) {
    const option = document.createElement('option');
    option.value = project.path;
    option.textContent = project.name;
    option.title = project.path;
    projectDropdown.appendChild(option);
  }

  // Select current project if open
  if (currentProjectName) {
    const currentOption = Array.from(projectDropdown.options).find(
      opt => opt.textContent === currentProjectName
    );
    if (currentOption) {
      projectDropdown.value = currentOption.value;
    }
  }
}

// Default panel widths
const DEFAULT_CLAUDE_WIDTH = 400;
const MIN_PANEL_WIDTH = 300;

// Panel resizers for three-column layout
function setupResizers() {
  // Restore saved widths from localStorage
  restorePanelWidths();

  setupResizer(resizer1, 'browser-panel', 'left');
  setupResizer(resizer2, 'claude-panel', 'right');
}

// Save panel widths to localStorage
function savePanelWidths() {
  const browserPanel = document.querySelector('.browser-panel') as HTMLElement;
  const claudePanel = document.querySelector('.claude-panel') as HTMLElement;

  const browserWidth = browserPanel.style.flex.includes('px')
    ? parseInt(browserPanel.style.flex.match(/(\d+)px/)?.[1] || '0')
    : 0;
  const claudeWidth = claudePanel.style.flex.includes('px')
    ? parseInt(claudePanel.style.flex.match(/(\d+)px/)?.[1] || '0')
    : 0;

  localStorage.setItem('claude-lens-panel-widths', JSON.stringify({
    browser: browserWidth,
    claude: claudeWidth
  }));
}

// Restore panel widths from localStorage
function restorePanelWidths() {
  try {
    const saved = localStorage.getItem('claude-lens-panel-widths');
    if (saved) {
      const parsed = JSON.parse(saved);

      // Validate structure before destructuring
      if (typeof parsed !== 'object' || parsed === null) {
        return;
      }

      const { browser, claude } = parsed;
      const browserPanel = document.querySelector('.browser-panel') as HTMLElement;
      const claudePanel = document.querySelector('.claude-panel') as HTMLElement;

      // Validate types before using
      if (typeof browser === 'number' && browser > 0) {
        browserPanel.style.flex = `0 0 ${browser}px`;
      }
      if (typeof claude === 'number' && claude > 0) {
        claudePanel.style.flex = `0 0 ${claude}px`;
      }
    }
  } catch (error) {
    console.warn('[PanelWidths] Failed to restore saved widths:', error);
    // Clear corrupted data
    try {
      localStorage.removeItem('claude-lens-panel-widths');
    } catch {
      // localStorage inaccessible
    }
  }
}

// Reset panel widths to defaults
function resetPanelWidths() {
  const browserPanel = document.querySelector('.browser-panel') as HTMLElement;
  const claudePanel = document.querySelector('.claude-panel') as HTMLElement;

  browserPanel.style.flex = '1';
  claudePanel.style.flex = `0 0 ${DEFAULT_CLAUDE_WIDTH}px`;

  localStorage.removeItem('claude-lens-panel-widths');

  // Update browser bounds and terminal
  const drawerHeight = consoleDrawerOpen ? DRAWER_HEIGHT : 0;
  window.claudeLens.browser.updateBounds(0, drawerHeight);
  fitAddon.fit();
  terminal.refresh(0, terminal.rows - 1);
  if (claudeRunning) {
    window.claudeLens.pty.resize(terminal.cols, terminal.rows);
  }
}

function setupResizer(resizer: HTMLElement, panelClass: string, side: 'left' | 'right') {
  let isResizing = false;

  // Double-click to reset panel widths
  resizer.addEventListener('dblclick', () => {
    resetPanelWidths();
  });

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const panel = document.querySelector(`.${panelClass}`) as HTMLElement;
    const main = document.querySelector('.main') as HTMLElement;
    const mainRect = main.getBoundingClientRect();

    if (side === 'left') {
      const newWidth = e.clientX - mainRect.left;
      // Ensure minimum widths: browser panel + context panel + claude panel
      if (newWidth >= MIN_PANEL_WIDTH && newWidth < mainRect.width - MIN_PANEL_WIDTH * 2) {
        panel.style.flex = `0 0 ${newWidth}px`;
        const drawerHeight = consoleDrawerOpen ? DRAWER_HEIGHT : 0;
        // Apply viewport constraint to resize
        const effectiveWidth = viewportWidth > 0 ? Math.min(viewportWidth, newWidth) : newWidth;
        window.claudeLens.browser.updateBounds(effectiveWidth, drawerHeight);
      }
    } else {
      const newWidth = mainRect.right - e.clientX;
      // Ensure minimum widths for claude panel and remaining space
      if (newWidth >= MIN_PANEL_WIDTH && newWidth < mainRect.width - MIN_PANEL_WIDTH * 2) {
        panel.style.flex = `0 0 ${newWidth}px`;
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Save panel widths to localStorage
      savePanelWidths();
      fitAddon.fit();
      // Force terminal refresh to clear rendering artifacts after panel resize
      terminal.refresh(0, terminal.rows - 1);
      if (claudeRunning) {
        window.claudeLens.pty.resize(terminal.cols, terminal.rows);
      }
    }
  });
}

// Add selected element to context panel
function addSelectedElement(element: ElementInfo) {
  // Add to list if not already selected
  const existing = selectedElements.find(e => e.selector === element.selector);
  if (!existing) {
    selectedElements.push(element);
  }

  // Update context panel display
  updateContextPanel(element);
  updateElementChips();
}

// Update the context panel with element info
function updateContextPanel(element: ElementInfo) {
  // Hide empty state, show sections
  contextEmpty.classList.add('hidden');
  elementInfo.classList.remove('hidden');
  pathInfo.classList.remove('hidden');
  textInfo.classList.remove('hidden');

  // DESCRIPTION section - human-readable element description
  if (element.description) {
    descriptionInfo.classList.remove('hidden');
    elementDescription.textContent = element.description;
  } else {
    descriptionInfo.classList.add('hidden');
  }

  // ELEMENT section - build tag display
  let tagDisplay = `<${element.tagName}`;
  if (element.id) tagDisplay += ` id="${element.id}"`;
  if (element.classes.length > 0) tagDisplay += ` class="${element.classes.join(' ')}"`;
  tagDisplay += '>';
  elementTag.textContent = tagDisplay;

  // COMPONENT section (React/Vue)
  if (element.framework && element.framework.components.length > 0) {
    componentInfo.classList.remove('hidden');

    // Set framework badge
    frameworkBadge.textContent = element.framework.framework;
    frameworkBadge.className = `framework-badge ${element.framework.framework.toLowerCase()}`;

    // Display component hierarchy
    componentList.textContent = '';
    for (const comp of element.framework.components) {
      const row = document.createElement('div');
      row.className = 'component-row';

      // Component name (e.g., <UserProfile />)
      const nameEl = document.createElement('div');
      nameEl.className = 'component-name';
      nameEl.textContent = `<${comp.name} />`;
      row.appendChild(nameEl);

      // Source file and line number
      if (comp.source) {
        const sourceEl = document.createElement('div');
        sourceEl.className = 'component-source';
        sourceEl.textContent = `${comp.source.fileName}:${comp.source.lineNumber}`;
        row.appendChild(sourceEl);
      }

      // Props (limited display)
      if (comp.props && Object.keys(comp.props).length > 0) {
        const propsEl = document.createElement('div');
        propsEl.className = 'component-props';
        const propEntries = Object.entries(comp.props).slice(0, 3);
        const propsText = propEntries.map(([k, v]) => {
          const valueStr = typeof v === 'string' ? `"${v}"` : String(v);
          return `<span class="prop-name">${k}</span>=<span class="prop-value">${valueStr}</span>`;
        }).join(' ');
        propsEl.innerHTML = propsText;
        if (Object.keys(comp.props).length > 3) {
          propsEl.innerHTML += ' ...';
        }
        row.appendChild(propsEl);
      }

      componentList.appendChild(row);
    }

  } else {
    componentInfo.classList.add('hidden');
  }

  // SOURCE section - always show to indicate whether source detection is working
  // Three states: available (file:line), missing (framework but no source), no-framework (hint)
  sourceInfo.classList.remove('hidden');
  sourceAvailable.classList.add('hidden');
  sourceUnavailable.classList.add('hidden');
  sourceNoFramework.classList.add('hidden');

  if (element.framework && element.framework.components.length > 0) {
    const firstComponent = element.framework.components[0];
    if (firstComponent?.source) {
      // Source available - show file:line
      sourceStatus.textContent = 'Available';
      sourceStatus.className = 'source-status available';
      sourceAvailable.classList.remove('hidden');
      sourceLocation.textContent = `${firstComponent.source.fileName}:${firstComponent.source.lineNumber}`;
    } else {
      // Framework detected but source NOT available - show warning with fix button
      sourceStatus.textContent = 'Missing';
      sourceStatus.className = 'source-status unavailable';
      sourceUnavailable.classList.remove('hidden');
    }
  } else {
    // No framework detected - show hint to select a component
    sourceStatus.textContent = '';
    sourceStatus.className = 'source-status';
    sourceNoFramework.classList.remove('hidden');
  }

  // HIERARCHY section - clickable parent chain
  if (element.parentChain && element.parentChain.length > 0) {
    hierarchyInfo.classList.remove('hidden');
    hierarchyList.textContent = '';

    // Show as breadcrumb: "This element" → parent → grandparent...
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'hierarchy-breadcrumb';

    // Current element (first item, not clickable)
    const currentItem = document.createElement('span');
    currentItem.className = 'hierarchy-item current';
    currentItem.textContent = element.description || element.tagName;
    breadcrumb.appendChild(currentItem);

    // Add parent chain items (clickable to highlight)
    for (const parent of element.parentChain) {
      const separator = document.createElement('span');
      separator.className = 'hierarchy-separator';
      separator.textContent = ' → ';
      breadcrumb.appendChild(separator);

      const parentItem = document.createElement('span');
      parentItem.className = 'hierarchy-item clickable';
      parentItem.textContent = parent.description;
      parentItem.title = `Click to highlight: ${parent.selector}`;
      parentItem.dataset.selector = parent.selector;
      parentItem.addEventListener('click', () => {
        // Highlight this parent element in the browser
        window.claudeLens?.browser.highlight(parent.selector);
      });
      breadcrumb.appendChild(parentItem);
    }

    hierarchyList.appendChild(breadcrumb);
  } else {
    hierarchyInfo.classList.add('hidden');
  }

  // PATH section
  elementPath.textContent = element.selector;

  // ATTRIBUTES section
  if (element.attributes && Object.keys(element.attributes).length > 0) {
    attributesInfo.classList.remove('hidden');
    attributesList.textContent = '';
    for (const [name, value] of Object.entries(element.attributes)) {
      const row = document.createElement('div');
      row.className = 'attribute-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'attribute-name';
      nameSpan.textContent = name;

      const valueSpan = document.createElement('span');
      valueSpan.className = 'attribute-value';
      valueSpan.textContent = `"${value}"`;

      row.appendChild(nameSpan);
      row.appendChild(valueSpan);
      attributesList.appendChild(row);
    }
  } else {
    attributesInfo.classList.add('hidden');
  }

  // STYLES section
  if (element.styles && Object.keys(element.styles).length > 0) {
    stylesInfo.classList.remove('hidden');
    stylesList.textContent = '';
    const styles = element.styles;
    for (const name of Object.keys(styles)) {
      const value = styles[name];
      if (!value) continue;

      const row = document.createElement('div');
      row.className = 'style-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'style-name';
      nameSpan.textContent = name;

      const valueSpan = document.createElement('span');
      valueSpan.className = 'style-value';

      // Add color swatch for color values
      if (name.toLowerCase().includes('color') && value.match(/^(#|rgb|hsl)/)) {
        const swatch = document.createElement('span');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = value;
        valueSpan.appendChild(swatch);
      }

      const textNode = document.createTextNode(value);
      valueSpan.appendChild(textNode);

      row.appendChild(nameSpan);
      row.appendChild(valueSpan);
      stylesList.appendChild(row);
    }
  } else {
    stylesInfo.classList.add('hidden');
  }

  // POSITION section
  if (element.position) {
    positionInfo.classList.remove('hidden');
    positionData.textContent = '';

    const grid = document.createElement('div');
    grid.className = 'position-grid';

    const items = [
      { label: 'X', value: `${Math.round(element.position.x)}px` },
      { label: 'Y', value: `${Math.round(element.position.y)}px` },
      { label: 'Width', value: `${Math.round(element.position.width)}px` },
      { label: 'Height', value: `${Math.round(element.position.height)}px` },
    ];

    for (const item of items) {
      const div = document.createElement('div');
      div.className = 'position-item';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'position-label';
      labelSpan.textContent = item.label;

      const valueSpan = document.createElement('span');
      valueSpan.className = 'position-value';
      valueSpan.textContent = item.value;

      div.appendChild(labelSpan);
      div.appendChild(valueSpan);
      grid.appendChild(div);
    }

    positionData.appendChild(grid);
  } else {
    positionInfo.classList.add('hidden');
  }

  // TEXT section
  if (element.text && element.text.trim()) {
    textInfo.classList.remove('hidden');
    innerText.textContent = element.text.slice(0, 200) + (element.text.length > 200 ? '...' : '');
  } else {
    textInfo.classList.add('hidden');
  }

  // FORM STATE section (Phase 3)
  updateFormStateUI(element);

  // Phase 4 sections (overlay, stacking, scroll, iframe, shadow DOM)
  updatePhase4UI(element);
}

// Update element chips display
function updateElementChips() {
  elementChips.textContent = '';

  for (const element of selectedElements) {
    const chip = document.createElement('div');
    chip.className = 'element-chip';

    const icon = document.createElement('span');
    icon.className = 'chip-icon';
    icon.textContent = '◇';

    const text = document.createElement('span');
    const displayName = `<${element.tagName}${element.id ? '#' + element.id : ''}>`;
    text.textContent = displayName;

    const close = document.createElement('span');
    close.className = 'chip-close';
    close.textContent = '×';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      removeElement(element.selector);
    });

    chip.appendChild(icon);
    chip.appendChild(text);
    chip.appendChild(close);

    chip.addEventListener('click', () => {
      updateContextPanel(element);
      window.claudeLens.browser.highlight(element.selector);
    });

    elementChips.appendChild(chip);
  }
}

// Remove element from selection
function removeElement(selector: string) {
  selectedElements = selectedElements.filter(e => e.selector !== selector);
  updateElementChips();

  if (selectedElements.length === 0) {
    // Reset context panel to empty state
    contextEmpty.classList.remove('hidden');
    elementInfo.classList.add('hidden');
    componentInfo.classList.add('hidden');
    sourceInfo.classList.add('hidden');
    pathInfo.classList.add('hidden');
    attributesInfo.classList.add('hidden');
    stylesInfo.classList.add('hidden');
    positionInfo.classList.add('hidden');
    textInfo.classList.add('hidden');
  } else {
    // Show the last selected element
    const lastElement = selectedElements[selectedElements.length - 1];
    if (lastElement) {
      updateContextPanel(lastElement);
    }
  }
}

// Console message handling - CircularBuffer handles overflow automatically (O(1))
function addConsoleMessage(msg: ConsoleMessage) {
  stateAddConsoleMessage(msg);
  updateConsoleUI();
}

function updateConsoleUI() {
  // Update drawer count and content
  consoleDrawerCount.textContent = String(consoleBuffer.length);
  updateConsoleDrawer();
}

function updateConsoleDrawer() {
  consoleDrawerMessages.textContent = '';

  if (consoleBuffer.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No console messages';
    consoleDrawerMessages.appendChild(emptyState);
    return;
  }

  for (const msg of consoleBuffer) {
    const row = document.createElement('div');
    row.className = 'console-drawer-message';

    const levelSpan = document.createElement('span');
    levelSpan.className = `console-drawer-level ${msg.level}`;
    levelSpan.textContent = msg.level.toUpperCase();

    const textSpan = document.createElement('span');
    textSpan.className = 'console-drawer-text';
    textSpan.textContent = msg.message;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'console-drawer-time';
    const time = new Date(msg.timestamp);
    timeSpan.textContent = time.toLocaleTimeString();

    row.appendChild(levelSpan);
    row.appendChild(textSpan);
    row.appendChild(timeSpan);
    consoleDrawerMessages.appendChild(row);
  }

  // Auto-scroll to bottom
  consoleDrawerMessages.scrollTop = consoleDrawerMessages.scrollHeight;
}

// Update inspect sequence UI (Phase 2)
function updateInspectSequenceUI() {
  // Show/hide sequence section
  if (inspectSequence.length > 0) {
    inspectSequenceInfo.classList.remove('hidden');
    sequenceCount.textContent = String(inspectSequence.length);
  } else {
    inspectSequenceInfo.classList.add('hidden');
  }

  // Render sequence items
  inspectSequenceList.textContent = '';

  for (let i = 0; i < inspectSequence.length; i++) {
    const interaction = inspectSequence[i];
    if (!interaction) continue;
    const el = interaction.element;

    const item = document.createElement('div');
    item.className = 'sequence-item';

    // Step number
    const numberEl = document.createElement('div');
    numberEl.className = 'sequence-number';
    numberEl.textContent = String(i + 1);
    item.appendChild(numberEl);

    // Content
    const contentEl = document.createElement('div');
    contentEl.className = 'sequence-content';

    // Element description
    const elementEl = document.createElement('div');
    elementEl.className = 'sequence-element';
    elementEl.textContent = el.description || `<${el.tagName}${el.id ? '#' + el.id : ''}>`;
    contentEl.appendChild(elementEl);

    // Selector
    const selectorEl = document.createElement('div');
    selectorEl.className = 'sequence-selector';
    selectorEl.textContent = el.selector;
    contentEl.appendChild(selectorEl);

    // Result
    const resultEl = document.createElement('div');
    resultEl.className = 'sequence-result';
    if (interaction.result.includes('blocked')) {
      resultEl.classList.add('blocked');
    }
    resultEl.textContent = interaction.result;
    contentEl.appendChild(resultEl);

    item.appendChild(contentEl);
    inspectSequenceList.appendChild(item);
  }
}

// Clear inspect sequence
function clearInspectSequence() {
  inspectSequence = [];
  updateInspectSequenceUI();
}

// Update form state UI (Phase 3)
function updateFormStateUI(element: ElementInfo) {
  const formState = element.formState;

  if (!formState) {
    formStateInfo.classList.add('hidden');
    return;
  }

  formStateInfo.classList.remove('hidden');

  // Set validation badge
  validationBadge.className = 'validation-badge';
  if (formState.disabled) {
    validationBadge.textContent = 'Disabled';
    validationBadge.classList.add('disabled');
  } else if (formState.validationState === 'invalid') {
    validationBadge.textContent = 'Invalid';
    validationBadge.classList.add('invalid');
  } else if (formState.validationState === 'valid') {
    validationBadge.textContent = 'Valid';
    validationBadge.classList.add('valid');
  } else if (formState.required) {
    validationBadge.textContent = 'Required';
    validationBadge.classList.add('required');
  } else {
    validationBadge.textContent = '';
  }

  // Build form state rows
  formStateContent.textContent = '';

  const addRow = (label: string, value: string, isError = false) => {
    const row = document.createElement('div');
    row.className = 'form-state-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'form-state-label';
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const valueEl = document.createElement('span');
    valueEl.className = 'form-state-value';
    if (isError) valueEl.classList.add('error');
    valueEl.textContent = value;
    row.appendChild(valueEl);

    formStateContent.appendChild(row);
  };

  addRow('Type', formState.type);

  if (formState.value) {
    const displayValue = formState.type === 'password' ? '••••••••' : formState.value.slice(0, 30);
    addRow('Value', displayValue + (formState.value.length > 30 ? '...' : ''));
  }

  if (formState.placeholder) {
    addRow('Placeholder', formState.placeholder);
  }

  if (formState.checked !== undefined) {
    addRow('Checked', formState.checked ? 'Yes' : 'No');
  }

  if (formState.options && formState.options.length > 0) {
    addRow('Options', formState.options.slice(0, 5).join(', ') + (formState.options.length > 5 ? '...' : ''));
  }

  if (formState.readOnly) {
    addRow('Read-only', 'Yes');
  }

  if (formState.validationMessage) {
    addRow('Error', formState.validationMessage, true);
  }
}

/**
 * Helper to create a row with label and value (safe DOM construction)
 */
function createInfoRow(className: string, label: string, value: string, extraClass?: string): HTMLElement {
  const row = document.createElement('div');
  row.className = className;

  const labelEl = document.createElement('span');
  labelEl.className = className.replace('-row', '-label');
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const valueEl = document.createElement('span');
  valueEl.className = className.replace('-row', '-value') + (extraClass ? ` ${extraClass}` : '');
  valueEl.textContent = value;
  row.appendChild(valueEl);

  return row;
}

/**
 * Update overlay/modal UI (Phase 4)
 */
function updateOverlayUI(element: ElementInfo) {
  const overlay = element.overlay;

  if (!overlay) {
    overlayInfo.classList.add('hidden');
    return;
  }

  overlayInfo.classList.remove('hidden');

  // Set overlay type badge
  overlayTypeBadge.className = `overlay-badge ${overlay.type}`;
  overlayTypeBadge.textContent = overlay.type;

  // Build overlay info rows
  overlayContent.textContent = '';

  if (overlay.isBackdrop) {
    overlayContent.appendChild(createInfoRow('overlay-row', 'Is Backdrop', 'Yes'));
  }
  if (overlay.triggeredBy) {
    overlayContent.appendChild(createInfoRow('overlay-row', 'Triggered By', overlay.triggeredBy));
  }
  overlayContent.appendChild(createInfoRow('overlay-row', 'Can Dismiss', overlay.canDismiss ? 'Yes' : 'No'));
}

/**
 * Update z-index stacking UI (Phase 4)
 */
function updateStackingUI(element: ElementInfo) {
  const stacking = element.stacking;

  if (!stacking) {
    stackingInfo.classList.add('hidden');
    return;
  }

  stackingInfo.classList.remove('hidden');

  // Set z-index badge
  zIndexBadge.textContent = `z-index: ${stacking.zIndex}`;

  // Build stacking context list
  stackingContent.textContent = '';

  if (stacking.stackingContext && stacking.stackingContext.length > 0) {
    stacking.stackingContext.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = `stacking-item${index === 0 ? ' top' : ''}`;

      const zIndexSpan = document.createElement('span');
      zIndexSpan.className = 'stacking-item-zindex';
      zIndexSpan.textContent = `z:${item.zIndex}`;
      itemEl.appendChild(zIndexSpan);

      const descSpan = document.createElement('span');
      descSpan.className = 'stacking-item-desc';
      descSpan.textContent = item.description;
      itemEl.appendChild(descSpan);

      stackingContent.appendChild(itemEl);
    });
  }
}

/**
 * Update scroll context UI (Phase 4)
 */
function updateScrollUI(element: ElementInfo) {
  const scroll = element.scroll;

  if (!scroll) {
    scrollInfo.classList.add('hidden');
    return;
  }

  scrollInfo.classList.remove('hidden');

  // Set visibility badge
  visibilityBadge.className = 'visibility-badge';
  if (scroll.visiblePercentage === 100) {
    visibilityBadge.textContent = '100% Visible';
    visibilityBadge.classList.add('visible');
  } else if (scroll.visiblePercentage > 0) {
    visibilityBadge.textContent = `${scroll.visiblePercentage}% Visible`;
    visibilityBadge.classList.add('partial');
  } else {
    visibilityBadge.textContent = 'Not Visible';
    visibilityBadge.classList.add('hidden');
  }

  // Build scroll info rows
  scrollContent.textContent = '';

  scrollContent.appendChild(createInfoRow('scroll-row', 'In Viewport', scroll.isInViewport ? 'Yes' : 'No'));
  if (scroll.isScrollable) {
    scrollContent.appendChild(createInfoRow('scroll-row', 'Scrollable', 'Yes'));
    scrollContent.appendChild(createInfoRow('scroll-row', 'Scroll Position', `${scroll.scrollLeft}px, ${scroll.scrollTop}px`));
    scrollContent.appendChild(createInfoRow('scroll-row', 'Scroll Size', `${scroll.scrollWidth}×${scroll.scrollHeight}px`));
  }
}

/**
 * Update iframe context UI (Phase 4)
 */
function updateIframeUI(element: ElementInfo) {
  const iframe = element.iframe;

  if (!iframe) {
    iframeInfo.classList.add('hidden');
    return;
  }

  iframeInfo.classList.remove('hidden');
  iframeContent.textContent = '';

  if (iframe.crossOrigin) {
    iframeContent.appendChild(createInfoRow('iframe-row', 'Cross-Origin', 'Yes (limited access)', 'context-warning cross-origin'));
  } else {
    if (iframe.src) {
      const truncatedSrc = iframe.src.slice(0, 50) + (iframe.src.length > 50 ? '...' : '');
      iframeContent.appendChild(createInfoRow('iframe-row', 'Source', truncatedSrc));
    }
    if (iframe.name) {
      iframeContent.appendChild(createInfoRow('iframe-row', 'Name', iframe.name));
    }
    iframeContent.appendChild(createInfoRow('iframe-row', 'Sandboxed', iframe.sandboxed ? 'Yes' : 'No'));
  }
}

/**
 * Update shadow DOM UI (Phase 4)
 */
function updateShadowDOMUI(element: ElementInfo) {
  const shadowDOM = element.shadowDOM;

  if (!shadowDOM) {
    shadowDOMInfo.classList.add('hidden');
    return;
  }

  shadowDOMInfo.classList.remove('hidden');
  shadowDOMContent.textContent = '';

  if (shadowDOM.isInShadowDOM) {
    shadowDOMContent.appendChild(createInfoRow('shadow-row', 'Inside Shadow DOM', 'Yes'));
    if (shadowDOM.shadowHost) {
      shadowDOMContent.appendChild(createInfoRow('shadow-row', 'Host Element', shadowDOM.shadowHost));
    }
  }

  if (shadowDOM.hasShadowRoot) {
    shadowDOMContent.appendChild(createInfoRow('shadow-row', 'Has Shadow Root', 'Yes'));
    if (shadowDOM.shadowRootMode) {
      shadowDOMContent.appendChild(createInfoRow('shadow-row', 'Mode', shadowDOM.shadowRootMode));
    }
    if (shadowDOM.shadowChildCount !== undefined) {
      shadowDOMContent.appendChild(createInfoRow('shadow-row', 'Child Count', String(shadowDOM.shadowChildCount)));
    }
  }
}

/**
 * Update toast captures UI (Phase 4)
 */
function updateToastCapturesUI() {
  if (capturedToasts.length === 0) {
    toastCapturesInfo.classList.add('hidden');
    return;
  }

  toastCapturesInfo.classList.remove('hidden');
  toastCount.textContent = String(capturedToasts.length);

  toastCapturesList.textContent = '';

  capturedToasts.forEach((toast) => {
    const item = document.createElement('div');
    item.className = 'toast-item';

    const timeDiff = Math.round((Date.now() - toast.timestamp) / 1000);
    const timeStr = timeDiff < 60 ? `${timeDiff}s ago` : `${Math.round(timeDiff / 60)}m ago`;

    const typeBadge = document.createElement('span');
    typeBadge.className = `toast-type-badge ${toast.type}`;
    typeBadge.textContent = toast.type;
    item.appendChild(typeBadge);

    const textSpan = document.createElement('span');
    textSpan.className = 'toast-text';
    textSpan.textContent = toast.text;
    item.appendChild(textSpan);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'toast-time';
    timeSpan.textContent = timeStr;
    item.appendChild(timeSpan);

    toastCapturesList.appendChild(item);
  });
}

/**
 * Clear toast captures
 */
function clearToastCaptures() {
  capturedToasts = [];
  updateToastCapturesUI();
}

/**
 * Update all Phase 4 UI sections for an element
 */
function updatePhase4UI(element: ElementInfo) {
  updateOverlayUI(element);
  updateStackingUI(element);
  updateScrollUI(element);
  updateIframeUI(element);
  updateShadowDOMUI(element);
}

// Start Claude
startClaudeBtn.addEventListener('click', async () => {
  if (claudeRunning) return;

  startClaudeBtn.textContent = 'Starting...';
  const result = await window.claudeLens.pty.start();

  if (result.success) {
    claudeRunning = true;
    startClaudeBtn.textContent = 'Running';
    window.claudeLens.pty.resize(terminal.cols, terminal.rows);
  } else {
    startClaudeBtn.textContent = 'Start Claude';
    terminal.writeln(`\r\n[Error: ${result.error}]`);
  }
});

// Navigate to URL
goBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) return;

  // Clear console buffer on navigation
  consoleBuffer.clear();
  updateConsoleUI();

  // Show loading spinner
  placeholder.classList.add('hidden');
  loadingOverlay.classList.remove('hidden');
  setStatus('Loading...');

  const result = await window.claudeLens.browser.navigate(url);

  // Hide loading spinner
  loadingOverlay.classList.add('hidden');

  if (!result.success) {
    placeholder.classList.remove('hidden');
    setStatus('Failed to load');
    alert(`Could not load URL: ${result.error}`);
    return;
  }

  setBrowserLoaded();
});

urlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') goBtn.click();
});

refreshBtn.addEventListener('click', async () => {
  if (!browserLoaded) return;
  loadingOverlay.classList.remove('hidden');
  setStatus('Refreshing...');
  await window.claudeLens.browser.navigate(urlInput.value);
  loadingOverlay.classList.add('hidden');
  setStatus('Connected', true);
});

// Restart server button
restartServerBtn.addEventListener('click', async () => {
  if (restartServerBtn.disabled) return;

  restartServerBtn.disabled = true;
  loadingOverlay.classList.remove('hidden');
  setStatus('Restarting server...');

  const result = await window.claudeLens.project.restartServer();

  if (result.success) {
    setStatus('Server restarted', true);
  } else {
    setStatus('Restart failed: ' + (result.error || 'Unknown error'));
    loadingOverlay.classList.add('hidden');
  }
  // Button will be re-enabled when server:ready fires
});

// Viewport preset widths (0 = full width / no constraint)
const VIEWPORT_PRESETS: Record<string, number> = {
  'full': 0,
  'desktop': 1280,
  'tablet-landscape': 1024,
  'tablet': 768,
  'mobile-large': 425,
  'mobile': 375,
};

// Viewport preset change handler
viewportSelect.addEventListener('change', () => {
  const preset = viewportSelect.value;
  viewportWidth = VIEWPORT_PRESETS[preset] || 0;
  updateBrowserBounds();
  updateStatusBar();
});

// Listen for viewport changes from MCP tools (Claude can change viewport programmatically)
window.claudeLens.browser.onSetViewport((width: number) => {
  // Find matching preset or set as custom
  const presetByWidth: Record<number, string> = {
    0: 'full',
    1280: 'desktop',
    1024: 'tablet-landscape',
    768: 'tablet',
    425: 'mobile-large',
    375: 'mobile',
  };

  const preset = presetByWidth[width];
  if (preset) {
    viewportSelect.value = preset;
    viewportWidth = width;
  } else {
    // Custom width - set to full and apply custom constraint
    viewportSelect.value = 'full';
    viewportWidth = width;
  }

  updateBrowserBounds();
  updateStatusBar();
  // Show user feedback
  const widthLabel = viewportWidth > 0 ? `${viewportWidth}px` : 'Full Width';
  setStatus(`Viewport: ${widthLabel}`);
});

// Update browser bounds on window resize (ensures bounds update after maximize/restore)
window.addEventListener('resize', debounce(() => {
  if (browserLoaded) {
    console.log('[Viewport] Window resize detected, updating bounds');
    updateBrowserBounds();
  }
}, 100));

// Use ResizeObserver for more reliable panel size tracking
const browserPanel = document.querySelector('.browser-panel') as HTMLElement;
const panelResizeObserver = new ResizeObserver(debounce(() => {
  if (browserLoaded) {
    console.log('[Viewport] Panel resize detected, updating bounds');
    updateBrowserBounds();
  }
}, 50));
panelResizeObserver.observe(browserPanel);

// Reset viewport to full width when starting a new project
window.claudeLens.browser.onResetViewport(() => {
  console.log('[Viewport] Received resetViewport, current viewportWidth:', viewportWidth);
  viewportWidth = 0;
  viewportSelect.value = 'full';
  console.log('[Viewport] Reset to full width, calling updateBrowserBounds');
  updateBrowserBounds();
});

// Inspect mode toggle (Phase 2: sequence capture mode)
inspectBtn.addEventListener('click', async () => {
  if (!browserLoaded) {
    alert('Load a page first');
    return;
  }

  inspectMode = !inspectMode;

  if (inspectMode) {
    // Clear previous sequence when entering inspect mode
    clearInspectSequence();
    await window.claudeLens.browser.enableInspect();
    inspectBtn.textContent = 'Stop Inspecting';
    inspectBtn.classList.add('btn-primary');
    browserHelpText.textContent = 'Hover to highlight • Click to capture';
  } else {
    await window.claudeLens.browser.disableInspect();
    inspectBtn.textContent = 'Inspect';
    inspectBtn.classList.remove('btn-primary');
    // Don't clear sequence - user may want to send it
    if (inspectSequence.length > 0) {
      browserHelpText.textContent = `Captured ${inspectSequence.length} • Click "Send Sequence" to send`;
    } else {
      browserHelpText.textContent = 'Ctrl+hover to inspect anytime';
    }
  }
});

// Freeze hover toggle function (Phase 3)
async function toggleFreezeHover() {
  if (!browserLoaded) {
    return;
  }

  hoverFrozen = !hoverFrozen;

  if (hoverFrozen) {
    await window.claudeLens.browser.freezeHover();
    freezeHoverBtn.textContent = 'Unfreeze (F)';
    freezeHoverBtn.classList.add('active');
    browserHelpText.textContent = 'Hover frozen • Press F to unfreeze';
  } else {
    await window.claudeLens.browser.unfreezeHover();
    freezeHoverBtn.textContent = 'Freeze (F)';
    freezeHoverBtn.classList.remove('active');
    browserHelpText.textContent = '';
  }
}

// Freeze hover button click
freezeHoverBtn.addEventListener('click', toggleFreezeHover);

// Keyboard shortcuts
document.addEventListener('keydown', async (e) => {
  const activeEl = document.activeElement;
  const isTyping = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA';

  // Press F to freeze/unfreeze hover (works while hovering!)
  if ((e.key === 'f' || e.key === 'F') && !isTyping && browserLoaded) {
    e.preventDefault();
    toggleFreezeHover();
  }

  // Ctrl+Shift+I is reserved for DevTools - don't intercept it
  // Inspect mode is accessible via Ctrl+hover or the Inspect button

  // Ctrl+R to refresh (when not in terminal)
  if (e.ctrlKey && (e.key === 'r' || e.key === 'R') && browserLoaded && !isTyping) {
    e.preventDefault();
    refreshBtn.click();
  }

  // Note: Ctrl+Shift+C and Ctrl+Shift+V are handled by terminal.attachCustomKeyEventHandler
  // in the init() function for proper interception before xterm processes them
});

// Console drawer toggle
consoleToggleBtn.addEventListener('click', () => {
  consoleDrawerOpen = !consoleDrawerOpen;

  if (consoleDrawerOpen) {
    consoleDrawer.classList.remove('hidden');
    consoleToggleBtn.classList.add('active');
    updateConsoleDrawer();
  } else {
    consoleDrawer.classList.add('hidden');
    consoleToggleBtn.classList.remove('active');
  }

  // Update browser view bounds to account for drawer height
  updateBrowserBounds();
});

// Console clear button
consoleClearBtn.addEventListener('click', () => {
  consoleBuffer.clear();
  updateConsoleUI();
});

// Inspect sequence clear button (Phase 2)
clearSequenceBtn.addEventListener('click', () => {
  clearInspectSequence();
  setStatus('Sequence cleared', true);
});

// Inspect sequence send button (Phase 2)
sendSequenceBtn.addEventListener('click', async () => {
  if (!claudeRunning) {
    alert('Start Claude first!');
    return;
  }

  if (inspectSequence.length === 0) {
    alert('No interactions captured. Click elements in Inspect mode first.');
    return;
  }

  // Format sequence using optimized formatter (prioritizes file:line > component > selector)
  const sequenceContext = formatSequence(inspectSequence);
  const fullPrompt = `Here is the captured interaction sequence:\n\n${sequenceContext}`;
  showThinking();
  const result = await window.claudeLens.sendToClaude(fullPrompt, '');

  if (result.success) {
    // Clear sequence after sending
    clearInspectSequence();
    terminal.focus();
    setStatus('Sequence sent to Claude', true);
  } else {
    hideThinking();
    alert('Failed to send to Claude');
  }
});

// Toast capture clear button (Phase 4)
clearToastsBtn.addEventListener('click', () => {
  clearToastCaptures();
  setStatus('Toasts cleared', true);
});

// Toast capture send button (Phase 4)
sendToastsBtn.addEventListener('click', async () => {
  if (!claudeRunning) {
    alert('Start Claude first!');
    return;
  }

  if (capturedToasts.length === 0) {
    alert('No toasts captured yet.');
    return;
  }

  // Format lean toast context
  let toastContext = `## Toast Notifications (${capturedToasts.length})\n\n`;

  for (const toast of capturedToasts) {
    toastContext += `- [${toast.type.toUpperCase()}] ${toast.text}\n`;
  }

  const fullPrompt = `Here are the captured toast notifications:\n\n${toastContext}`;
  showThinking();
  const result = await window.claudeLens.sendToClaude(fullPrompt, '');

  if (result.success) {
    clearToastCaptures();
    terminal.focus();
    setStatus('Toasts sent to Claude', true);
  } else {
    hideThinking();
    alert('Failed to send to Claude');
  }
});

// Send console to Claude button
consoleSendBtn.addEventListener('click', async () => {
  if (!claudeRunning) {
    alert('Start Claude first!');
    return;
  }

  if (consoleBuffer.length === 0) {
    alert('No console messages to send');
    return;
  }

  // Format console using optimized formatter
  const consoleContext = formatConsole(consoleBuffer.toArray());
  showThinking();
  const result = await window.claudeLens.sendToClaude(`Here are the browser console messages:\n\n${consoleContext}`, '');

  if (result.success) {
    terminal.focus();
    setStatus('Console sent to Claude', true);
  } else {
    hideThinking();
    alert('Failed to send to Claude');
  }
});

// Send to Claude
sendPromptBtn.addEventListener('click', async () => {
  const prompt = promptInput.value.trim();

  if (!claudeRunning) {
    alert('Start Claude first!');
    return;
  }

  // Require either a prompt or selected elements
  if (!prompt && selectedElements.length === 0) {
    return;
  }

  if (selectedElements.length === 0) {
    // Send prompt without element context
    showThinking();
    window.claudeLens.pty.write(prompt + '\n');
    promptInput.value = '';
    terminal.focus();
    return;
  }

  // Format element context using the optimized formatter
  // Lean mode prioritizes: file:line > component name > searchable text
  // Detailed mode includes: selector, classes, styles, position
  const elementContext = formatElements(selectedElements, { mode: contextMode });

  // If no prompt, use a default instruction
  const finalPrompt = prompt || 'Here is the element I selected:';
  const fullPrompt = `${finalPrompt}\n\n${elementContext}`;
  showThinking();
  const result = await window.claudeLens.sendToClaude(fullPrompt, '');

  if (result.success) {
    promptInput.value = '';
    terminal.focus();
    setStatus('Sent to Claude', true);
    // Delay clearing context to let Claude's output appear first (smoother transition)
    setTimeout(() => {
      selectedElements = [];
      updateElementChips();
      contextEmpty.classList.remove('hidden');
      elementInfo.classList.add('hidden');
      componentInfo.classList.add('hidden');
      sourceInfo.classList.add('hidden');
      pathInfo.classList.add('hidden');
      attributesInfo.classList.add('hidden');
      stylesInfo.classList.add('hidden');
      positionInfo.classList.add('hidden');
      textInfo.classList.add('hidden');
      descriptionInfo.classList.add('hidden');
      hierarchyInfo.classList.add('hidden');
    }, 500);
  } else {
    hideThinking();
    alert('Failed to send to Claude');
  }
});

promptInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendPromptBtn.click();
  }
});

// Context mode toggle (lean vs detailed)
contextModeSelect.addEventListener('change', () => {
  contextMode = contextModeSelect.value as ContextMode;
});

// Copy selector button
copySelectorBtn.addEventListener('click', () => {
  const selector = elementPath.textContent;
  if (selector) {
    copyToClipboard(selector, copySelectorBtn, setStatus);
  }
});

// Copy component info button
copyComponentBtn.addEventListener('click', () => {
  // Get the current element's component info
  const lastElement = selectedElements[selectedElements.length - 1];
  if (lastElement?.framework?.components && lastElement.framework.components.length > 0) {
    const comp = lastElement.framework.components[0];
    let copyText = `<${comp?.name} />`;
    if (comp?.source) {
      copyText += `\n${comp.source.fileName}:${comp.source.lineNumber}`;
    }
    copyToClipboard(copyText, copyComponentBtn, setStatus);
  }
});

// Copy source location button
copySourceBtn.addEventListener('click', () => {
  const source = sourceLocation.textContent;
  if (source) {
    copyToClipboard(source, copySourceBtn, setStatus);
  }
});


// Status helper
function setStatus(text: string, connected = false) {
  statusEl.textContent = text;
  statusEl.className = connected ? 'status connected' : 'status';
}

// Thinking indicator helper
function showThinking(): void {
  // Show thinking indicator after a brief delay (500ms)
  // This prevents flashing for instant responses
  if (thinkingTimeout) clearTimeout(thinkingTimeout);
  thinkingTimeout = setTimeout(() => {
    isThinking = true;
    thinkingIndicator.classList.remove('hidden');
  }, 500);
}

function hideThinking(): void {
  if (thinkingTimeout) {
    clearTimeout(thinkingTimeout);
    thinkingTimeout = null;
  }
  isThinking = false;
  thinkingIndicator.classList.add('hidden');
}

// Status bar update helper
function updateStatusBar(): void {
  // Project name
  if (currentProjectName) {
    projectStatus.textContent = currentProjectName;
    projectStatus.classList.remove('hidden');
  } else {
    projectStatus.classList.add('hidden');
  }

  // Server status
  if (currentServerPort > 0) {
    const typeLabel = currentServerType === 'dev' ? 'Dev' : 'Static';
    serverStatus.textContent = `${typeLabel} :${currentServerPort}`;
    serverStatus.classList.remove('hidden');
  } else {
    serverStatus.classList.add('hidden');
  }

  // Playwright status
  if (browserLoaded) {
    playwrightStatus.textContent = playwrightConnected ? '✓ Playwright' : '○ Playwright';
    playwrightStatus.classList.toggle('success', playwrightConnected);
    playwrightStatus.classList.toggle('warning', !playwrightConnected);
    playwrightStatus.classList.remove('hidden');
  } else {
    playwrightStatus.classList.add('hidden');
  }

  // Viewport status
  if (viewportWidth > 0) {
    viewportStatus.textContent = `${viewportWidth}px`;
    viewportStatus.classList.remove('hidden');
  } else {
    viewportStatus.classList.add('hidden');
  }
}

// Server status click handler - copy URL to clipboard
serverStatus.addEventListener('click', async () => {
  if (currentServerPort > 0) {
    const url = `http://localhost:${currentServerPort}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus('URL copied!', true);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  }
});

// Terminal context menu for copy/paste
let contextMenu: HTMLDivElement | null = null;

function hideContextMenu() {
  if (contextMenu) {
    contextMenu.remove();
    contextMenu = null;
  }
}

terminalEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  hideContextMenu();

  const hasSelection = terminal.hasSelection();

  contextMenu = document.createElement('div');
  contextMenu.className = 'terminal-context-menu';
  contextMenu.style.cssText = `
    position: fixed;
    left: ${e.clientX}px;
    top: ${e.clientY}px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 0;
    min-width: 120px;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;

  // Copy option
  const copyItem = document.createElement('div');
  copyItem.className = 'context-menu-item';
  copyItem.innerHTML = `<span>Copy</span><span style="color: var(--text-muted); font-size: 11px;">Ctrl+Shift+C</span>`;
  copyItem.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    cursor: ${hasSelection ? 'pointer' : 'default'};
    opacity: ${hasSelection ? '1' : '0.5'};
    font-size: 12px;
  `;
  if (hasSelection) {
    copyItem.addEventListener('mouseenter', () => {
      copyItem.style.background = 'var(--bg-hover)';
    });
    copyItem.addEventListener('mouseleave', () => {
      copyItem.style.background = '';
    });
    copyItem.addEventListener('click', async () => {
      const selection = terminal.getSelection();
      if (selection) {
        await navigator.clipboard.writeText(selection);
        setStatus('Copied to clipboard');
        setTimeout(() => {
          if (browserLoaded) setStatus('Connected', true);
        }, 2000);
      }
      hideContextMenu();
    });
  }
  contextMenu.appendChild(copyItem);

  // Paste option
  const pasteItem = document.createElement('div');
  pasteItem.className = 'context-menu-item';
  pasteItem.innerHTML = `<span>Paste</span><span style="color: var(--text-muted); font-size: 11px;">Ctrl+Shift+V</span>`;
  pasteItem.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    cursor: ${claudeRunning ? 'pointer' : 'default'};
    opacity: ${claudeRunning ? '1' : '0.5'};
    font-size: 12px;
  `;
  if (claudeRunning) {
    pasteItem.addEventListener('mouseenter', () => {
      pasteItem.style.background = 'var(--bg-hover)';
    });
    pasteItem.addEventListener('mouseleave', () => {
      pasteItem.style.background = '';
    });
    pasteItem.addEventListener('click', async () => {
      hideContextMenu();
      // Check for image first
      const hasImage = await window.claudeLens.clipboard.hasImage();
      if (hasImage) {
        setStatus('Saving image...');
        const result = await window.claudeLens.clipboard.saveImage();
        if (result.success && result.path) {
          window.claudeLens.pty.write(`@${result.path} `);
          setStatus('Image pasted', true);
          setTimeout(() => {
            if (browserLoaded) setStatus('Connected', true);
          }, 2000);
        } else {
          setStatus(`Image error: ${result.error}`);
        }
      } else {
        // Paste text via IPC (avoids "document not focused" error)
        const text = await window.claudeLens.clipboard.readText();
        if (text) {
          window.claudeLens.pty.write(text);
        }
      }
      terminal.focus();
    });
  }
  contextMenu.appendChild(pasteItem);

  document.body.appendChild(contextMenu);
});

// Hide context menu on click elsewhere or escape
document.addEventListener('click', hideContextMenu);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideContextMenu();
});

// Initialize on load
init();
