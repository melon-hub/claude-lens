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
import { CircularBuffer } from '@claude-lens/core';
import 'xterm/css/xterm.css';

/**
 * Wait for fonts to load before opening terminal
 * Based on Tabby terminal's approach: https://github.com/Eugeny/tabby
 *
 * xterm.js measures fonts during terminal.open() and caches the measurements.
 * If the font isn't loaded yet, it measures fallback fonts and icons won't render.
 */
async function waitForFonts(fontFamily: string, timeoutMs = 3000): Promise<void> {
  const startTime = Date.now();

  // Extract all font names from the stack
  const fontNames = fontFamily.split(',').map(f => f.trim().replace(/['"]/g, '')).filter(f => f && f !== 'monospace');

  // Request all fonts to load (silently)
  for (const font of fontNames) {
    try {
      await document.fonts.load(`13px "${font}"`);
    } catch {
      // Font load failed, will use fallback
    }
  }

  // Wait for all fonts to be ready
  await document.fonts.ready;

  // Check each font, only warn if missing
  const missingFonts: string[] = [];
  for (const font of fontNames) {
    let fontAvailable = document.fonts.check(`13px "${font}"`);

    // Poll if not yet available
    while (!fontAvailable && (Date.now() - startTime) < timeoutMs) {
      await new Promise(r => setTimeout(r, 100));
      fontAvailable = document.fonts.check(`13px "${font}"`);
    }

    if (!fontAvailable) {
      missingFonts.push(font);
    }
  }

  if (missingFonts.length > 0) {
    console.warn(`Fonts not available: ${missingFonts.join(', ')}`);
  }

  // Additional delay for font rendering to settle
  await new Promise(r => setTimeout(r, 500));
}

/**
 * Font diagnostics - only logs warnings if something is wrong
 */
function runFontDiagnostics(): void {
  const criticalFonts = [
    'JetBrains Mono NF Bundled',
    'Symbols Nerd Font',
    'Noto Sans Symbols 2',
  ];

  // Check font availability - only warn if missing
  const missingFonts = criticalFonts.filter(font => !document.fonts.check(`13px "${font}"`));

  if (missingFonts.length > 0) {
    console.warn('Missing fonts:', missingFonts.join(', '));
  }
}

// Elements - Header
const urlInput = document.getElementById('urlInput') as HTMLInputElement;
const goBtn = document.getElementById('goBtn') as HTMLButtonElement;
const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const viewportSelect = document.getElementById('viewportSelect') as HTMLSelectElement;

// Elements - Panels
const placeholder = document.getElementById('placeholder') as HTMLDivElement;
const terminalEl = document.getElementById('terminal') as HTMLDivElement;
const startClaudeBtn = document.getElementById('startClaudeBtn') as HTMLButtonElement;
const inspectBtn = document.getElementById('inspectBtn') as HTMLButtonElement;
const browserHelpText = document.getElementById('browserHelpText') as HTMLSpanElement;

// Elements - Context Panel
const contextEmpty = document.getElementById('contextEmpty') as HTMLDivElement;
const descriptionInfo = document.getElementById('descriptionInfo') as HTMLDivElement;
const elementDescription = document.getElementById('elementDescription') as HTMLSpanElement;
const elementInfo = document.getElementById('elementInfo') as HTMLDivElement;
const hierarchyInfo = document.getElementById('hierarchyInfo') as HTMLDivElement;
const hierarchyList = document.getElementById('hierarchyList') as HTMLDivElement;
const pathInfo = document.getElementById('pathInfo') as HTMLDivElement;
const attributesInfo = document.getElementById('attributesInfo') as HTMLDivElement;
const stylesInfo = document.getElementById('stylesInfo') as HTMLDivElement;
const positionInfo = document.getElementById('positionInfo') as HTMLDivElement;
const textInfo = document.getElementById('textInfo') as HTMLDivElement;

// Elements - Console Drawer (browser panel)
const consoleToggleBtn = document.getElementById('consoleToggleBtn') as HTMLButtonElement;
const consoleDrawer = document.getElementById('consoleDrawer') as HTMLDivElement;
const consoleDrawerMessages = document.getElementById('consoleDrawerMessages') as HTMLDivElement;
const consoleDrawerCount = document.getElementById('consoleDrawerCount') as HTMLSpanElement;
const consoleClearBtn = document.getElementById('consoleClearBtn') as HTMLButtonElement;
const consoleSendBtn = document.getElementById('consoleSendBtn') as HTMLButtonElement;

const elementTag = document.getElementById('elementTag') as HTMLElement;
const elementPath = document.getElementById('elementPath') as HTMLElement;
const attributesList = document.getElementById('attributesList') as HTMLDivElement;
const stylesList = document.getElementById('stylesList') as HTMLDivElement;
const positionData = document.getElementById('positionData') as HTMLDivElement;
const innerText = document.getElementById('innerText') as HTMLSpanElement;

// Elements - Component Info
const componentInfo = document.getElementById('componentInfo') as HTMLDivElement;
const frameworkBadge = document.getElementById('frameworkBadge') as HTMLSpanElement;
const componentList = document.getElementById('componentList') as HTMLDivElement;

// Elements - Chips and Prompt
const elementChips = document.getElementById('elementChips') as HTMLDivElement;
const promptInput = document.getElementById('promptInput') as HTMLTextAreaElement;
const sendPromptBtn = document.getElementById('sendPromptBtn') as HTMLButtonElement;

// Elements - Inspect Sequence (Phase 2)
const inspectSequenceInfo = document.getElementById('inspectSequenceInfo') as HTMLDivElement;
const sequenceCount = document.getElementById('sequenceCount') as HTMLSpanElement;
const inspectSequenceList = document.getElementById('inspectSequenceList') as HTMLDivElement;
const clearSequenceBtn = document.getElementById('clearSequenceBtn') as HTMLButtonElement;
const sendSequenceBtn = document.getElementById('sendSequenceBtn') as HTMLButtonElement;

// Elements - Form State & Freeze Hover (Phase 3)
const formStateInfo = document.getElementById('formStateInfo') as HTMLDivElement;
const formStateContent = document.getElementById('formStateContent') as HTMLDivElement;
const validationBadge = document.getElementById('validationBadge') as HTMLSpanElement;
const freezeHoverBtn = document.getElementById('freezeHoverBtn') as HTMLButtonElement;

// Elements - Phase 4: Edge Cases
const overlayInfo = document.getElementById('overlayInfo') as HTMLDivElement;
const overlayContent = document.getElementById('overlayContent') as HTMLDivElement;
const overlayTypeBadge = document.getElementById('overlayTypeBadge') as HTMLSpanElement;
const stackingInfo = document.getElementById('stackingInfo') as HTMLDivElement;
const stackingContent = document.getElementById('stackingContent') as HTMLDivElement;
const zIndexBadge = document.getElementById('zIndexBadge') as HTMLSpanElement;
const scrollInfo = document.getElementById('scrollInfo') as HTMLDivElement;
const scrollContent = document.getElementById('scrollContent') as HTMLDivElement;
const visibilityBadge = document.getElementById('visibilityBadge') as HTMLSpanElement;
const iframeInfo = document.getElementById('iframeInfo') as HTMLDivElement;
const iframeContent = document.getElementById('iframeContent') as HTMLDivElement;
const shadowDOMInfo = document.getElementById('shadowDOMInfo') as HTMLDivElement;
const shadowDOMContent = document.getElementById('shadowDOMContent') as HTMLDivElement;
const toastCapturesInfo = document.getElementById('toastCapturesInfo') as HTMLDivElement;
const toastCapturesList = document.getElementById('toastCapturesList') as HTMLDivElement;
const toastCount = document.getElementById('toastCount') as HTMLSpanElement;
const clearToastsBtn = document.getElementById('clearToastsBtn') as HTMLButtonElement;
const sendToastsBtn = document.getElementById('sendToastsBtn') as HTMLButtonElement;

// Elements - Resizers
const resizer1 = document.getElementById('resizer1') as HTMLDivElement;
const resizer2 = document.getElementById('resizer2') as HTMLDivElement;

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

// State
let claudeRunning = false;
let browserLoaded = false;
let inspectMode = false;
let selectedElements: ElementInfo[] = [];
let consoleDrawerOpen = false;

// Inspect sequence state (Phase 2: multi-click capture)
let inspectSequence: CapturedInteraction[] = [];

// Freeze hover state (Phase 3)
let hoverFrozen = false;

// Captured toasts state (Phase 4)
let capturedToasts: ToastCapture[] = [];

// Console drawer height - 200px CSS + extra buffer for BrowserView bounds
const DRAWER_HEIGHT = 235;

// Viewport width constraint (0 = full width)
let viewportWidth = 0;

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

  window.claudeLens.browser.updateBounds(effectiveWidth, drawerHeight);
}

// Console message buffer (last 50 messages)
interface ConsoleMessage {
  level: string;
  message: string;
  timestamp: number;
}
const MAX_CONSOLE_MESSAGES = 50;
const consoleBuffer = new CircularBuffer<ConsoleMessage>(MAX_CONSOLE_MESSAGES);

// Show project modal when a project is detected
function showProjectModal(project: ProjectInfo) {
  // Remove existing modal if any
  const existing = document.querySelector('.project-modal');
  if (existing) existing.remove();

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
      const result = await window.claudeLens.project.start({ useDevServer: true });
      modal.remove();
      if (result.success && result.url) {
        urlInput.value = result.url;
        browserLoaded = true;
        placeholder.classList.add('hidden');
        setStatus('Connected', true);
        browserHelpText.textContent = 'Ctrl+hover to inspect anytime';
      } else {
        alert(`Failed to start dev server: ${result.error}`);
      }
    });
    buttons.appendChild(devBtn);
  }

  const staticBtn = document.createElement('button');
  staticBtn.className = project.devCommand ? 'btn' : 'btn btn-primary';
  staticBtn.textContent = 'Start with Built-in Server';
  staticBtn.addEventListener('click', async () => {
    staticBtn.disabled = true;
    staticBtn.textContent = 'Starting...';
    const result = await window.claudeLens.project.start({ useDevServer: false });
    modal.remove();
    if (result.success && result.url) {
      urlInput.value = result.url;
      browserLoaded = true;
      placeholder.classList.add('hidden');
      setStatus('Connected', true);
      browserHelpText.textContent = 'Ctrl+hover to inspect anytime';
    } else {
      alert(`Failed to start server: ${result.error}`);
    }
  });
  buttons.appendChild(staticBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => modal.remove());
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

  fitAddon.fit();

  // Force a refresh after a delay for any rendering glitches
  setTimeout(() => {
    terminal.refresh(0, terminal.rows - 1);
  }, 500);


  // MCP tool pattern detection with semantic icons (Nerd Font)
  // Format: [pattern to match after indicator, replacement icon, description]
  // Some patterns also transform the text for better UX
  const mcpToolIcons: Array<{ pattern: RegExp; icon: string; name: string; transform?: string }> = [
    // Screenshot/Image tools
    { pattern: /Screenshot captured/i, icon: '\uF030', name: 'camera' },        //
    { pattern: /\[Image\]/i, icon: '\uF03E', name: 'image', transform: 'Attached to context' },  // Transform [Image] to clearer text
    { pattern: /Taking screenshot/i, icon: '\uF030', name: 'camera' },

    // File operations
    { pattern: /Read \d+ lines?/i, icon: '\uF15C', name: 'file-text' },         //
    { pattern: /Error reading/i, icon: '\uF071', name: 'warning' },             //

    // MCP/Playwright errors - make them stand out
    { pattern: /Error:.*Timeout/i, icon: '\uF017', name: 'clock' },             // ⏱ Timeout
    { pattern: /Error:.*not a valid selector/i, icon: '\uF06A', name: 'exclamation-circle' }, //
    { pattern: /Error:.*Failed to execute/i, icon: '\uF06A', name: 'exclamation-circle' },
    { pattern: /DOMException/i, icon: '\uF06A', name: 'exclamation-circle' },
    { pattern: /waiting for locator/i, icon: '\uF017', name: 'clock' },         // Timeout waiting
    { pattern: /Write.*success/i, icon: '\uF0C7', name: 'save' },               //
    { pattern: /Created file/i, icon: '\uF15B', name: 'file-new' },             //
    { pattern: /Edited file/i, icon: '\uF044', name: 'edit' },                  //

    // Search operations
    { pattern: /Found \d+ (?:lines?|matches?|files?)/i, icon: '\uF002', name: 'search' },  //
    { pattern: /No matches/i, icon: '\uF00D', name: 'times' },                  //
    { pattern: /Searching/i, icon: '\uF002', name: 'search' },

    // Browser/Navigation - MCP actions
    { pattern: /Navigate/i, icon: '\uF0AC', name: 'globe' },                    //
    { pattern: /Page loaded/i, icon: '\uF0AC', name: 'globe' },
    { pattern: /Clicked button/i, icon: '\uF25A', name: 'hand-pointer' },       // Successful click
    { pattern: /Clicked/i, icon: '\uF245', name: 'pointer' },                   //
    { pattern: /Click/i, icon: '\uF245', name: 'pointer' },
    { pattern: /Type|Fill/i, icon: '\uF11C', name: 'keyboard' },                //
    { pattern: /Hover/i, icon: '\uF245', name: 'pointer' },

    // Execution/Commands
    { pattern: /Command.*exit/i, icon: '\uF120', name: 'terminal' },            //
    { pattern: /Running/i, icon: '\uF04B', name: 'play' },                      //
    { pattern: /Executed/i, icon: '\uF0E7', name: 'bolt' },                     //

    // Git operations
    { pattern: /Commit/i, icon: '\uF1D3', name: 'git' },                        //
    { pattern: /Branch/i, icon: '\uE0A0', name: 'git-branch' },                 //
    { pattern: /Push|Pull/i, icon: '\uF0C2', name: 'cloud' },                   //

    // API/Network
    { pattern: /Fetching|Request/i, icon: '\uF0C1', name: 'link' },             //
    { pattern: /Response/i, icon: '\uF063', name: 'arrow-down' },               //
  ];

  // Basic character substitution for missing glyphs (fallback)
  const charSubstitutions: Record<string, string> = {
    '\u23F5': '\u25B6', // ⏵ → ▶ (play button)
    '\u23F1': '\u25CF', // ⏱ → ● (stopwatch → bullet)
    '\u23BF': '\u25B8', // ⎿ → ▸ (indicator)
    '\u23F4': '\u25C0', // ⏴ → ◀ (reverse)
    '\u23F9': '\u25A0', // ⏹ → ■ (stop)
    '\u23FA': '\u25CF', // ⏺ → ● (record)
  };

  // The indicator characters Claude Code uses for MCP results
  const mcpIndicators = ['\u23F5', '\u23F1', '\u23BF'];

  // Smart substitution: detect MCP patterns and use semantic icons
  const substituteChars = (data: string): string => {
    let result = data;

    // For each MCP indicator character, check if it's followed by a known pattern
    for (const indicator of mcpIndicators) {
      if (!result.includes(indicator)) continue;

      // Find all occurrences of the indicator
      const regex = new RegExp(indicator + '\\s*(.{0,50})', 'g');
      result = result.replace(regex, (match, afterIndicator) => {
        // Check each MCP tool pattern
        for (const tool of mcpToolIcons) {
          if (tool.pattern.test(afterIndicator)) {
            // Replace indicator with semantic icon, optionally transform text
            const displayText = tool.transform || afterIndicator;
            return tool.icon + ' ' + displayText;
          }
        }
        // Fallback: use basic substitution
        const fallback = charSubstitutions[indicator] || indicator;
        return fallback + ' ' + afterIndicator;
      });
    }

    // Also do basic substitution for any remaining characters
    for (const [from, to] of Object.entries(charSubstitutions)) {
      if (result.includes(from)) {
        result = result.replaceAll(from, to);
      }
    }

    return result;
  };

  // PTY data handler
  window.claudeLens.pty.onData((data) => {
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

  // Handle server ready event
  window.claudeLens.server.onReady((info) => {
    setStatus(`Server ready on port ${info.port}`, true);
    updateBrowserBounds();
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
}

// Panel resizers for three-column layout
function setupResizers() {
  setupResizer(resizer1, 'browser-panel', 'left');
  setupResizer(resizer2, 'claude-panel', 'right');
}

function setupResizer(resizer: HTMLElement, panelClass: string, side: 'left' | 'right') {
  let isResizing = false;

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
      if (newWidth > 300 && newWidth < mainRect.width - 600) {
        panel.style.flex = `0 0 ${newWidth}px`;
        const drawerHeight = consoleDrawerOpen ? DRAWER_HEIGHT : 0;
        // Apply viewport constraint to resize
        const effectiveWidth = viewportWidth > 0 ? Math.min(viewportWidth, newWidth) : newWidth;
        window.claudeLens.browser.updateBounds(effectiveWidth, drawerHeight);
      }
    } else {
      const newWidth = mainRect.right - e.clientX;
      if (newWidth > 300 && newWidth < mainRect.width - 600) {
        panel.style.flex = `0 0 ${newWidth}px`;
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
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
  consoleBuffer.push(msg);
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

  setStatus('Loading...');
  const result = await window.claudeLens.browser.navigate(url);

  if (!result.success) {
    setStatus('Failed to load');
    alert(`Could not load URL: ${result.error}`);
    return;
  }

  browserLoaded = true;
  placeholder.classList.add('hidden');
  setStatus('Connected', true);
  browserHelpText.textContent = 'Ctrl+hover to inspect anytime';

  // Update browser view bounds to match panel width
  updateBrowserBounds();
});

urlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') goBtn.click();
});

refreshBtn.addEventListener('click', async () => {
  if (!browserLoaded) return;
  await window.claudeLens.browser.navigate(urlInput.value);
});

// Viewport preset widths (0 = full width / no constraint)
const viewportPresets: Record<string, number> = {
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
  viewportWidth = viewportPresets[preset] || 0;
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

// Keyboard shortcut: Press F to freeze/unfreeze hover (works while hovering!)
document.addEventListener('keydown', (e) => {
  // Only trigger if F key and not typing in an input
  if (e.key === 'f' || e.key === 'F') {
    const activeEl = document.activeElement;
    const isTyping = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA';
    if (!isTyping && browserLoaded) {
      e.preventDefault();
      toggleFreezeHover();
    }
  }
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

  // Format lean sequence context
  let sequenceContext = `## Interaction Sequence (${inspectSequence.length} steps)\n\n`;

  for (let i = 0; i < inspectSequence.length; i++) {
    const interaction = inspectSequence[i];
    if (!interaction) continue;
    const el = interaction.element;

    sequenceContext += `${i + 1}. \`${el.selector}\``;
    if (el.text) sequenceContext += ` "${el.text.slice(0, 30)}${el.text.length > 30 ? '...' : ''}"`;
    sequenceContext += '\n';
  }

  const fullPrompt = `Here is the captured interaction sequence:\n\n${sequenceContext}`;
  const result = await window.claudeLens.sendToClaude(fullPrompt, '');

  if (result.success) {
    // Clear sequence after sending
    clearInspectSequence();
    terminal.focus();
    setStatus('Sequence sent to Claude', true);
  } else {
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
  const result = await window.claudeLens.sendToClaude(fullPrompt, '');

  if (result.success) {
    clearToastCaptures();
    terminal.focus();
    setStatus('Toasts sent to Claude', true);
  } else {
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

  // Format lean console context
  const consoleLines = consoleBuffer.toArray().map(m => {
    return `[${m.level.toUpperCase()}] ${m.message}`;
  });

  const context = `## Console (${consoleBuffer.length} messages)\n\`\`\`\n${consoleLines.join('\n')}\n\`\`\``;

  const result = await window.claudeLens.sendToClaude(`Here are the browser console messages:\n\n${context}`, '');

  if (result.success) {
    terminal.focus();
    setStatus('Console sent to Claude', true);
  } else {
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
    window.claudeLens.pty.write(prompt + '\n');
    promptInput.value = '';
    terminal.focus();
    return;
  }

  // Format rich element context with Tailwind translations
  const elementContexts = selectedElements.map(el => {
    let ctx = `## <${el.tagName}${el.id ? '#' + el.id : ''}>\n`;
    ctx += `**Selector:** \`${el.selector}\`\n`;

    // Primary edit target (most important for Claude)
    if (el.framework?.components[0]?.source) {
      const src = el.framework.components[0].source;
      ctx += `**Edit:** \`${src.fileName}:${src.lineNumber}\`\n`;
    }

    if (el.text) ctx += `**Text:** "${el.text.slice(0, 50)}${el.text.length > 50 ? '...' : ''}"\n`;

    // CSS classes with Tailwind translations
    if (el.classes && el.classes.length > 0) {
      const tw: Record<string, string> = {
        // Typography
        'text-xs': '12px', 'text-sm': '14px', 'text-base': '16px', 'text-lg': '18px',
        'text-xl': '20px', 'text-2xl': '24px', 'text-3xl': '30px', 'text-4xl': '36px',
        'text-5xl': '48px', 'font-thin': '100', 'font-light': '300', 'font-normal': '400',
        'font-medium': '500', 'font-semibold': '600', 'font-bold': '700', 'font-extrabold': '800',
        'italic': 'italic', 'underline': 'underline', 'tracking-tight': '-0.025em',
        'tracking-wide': '0.025em', 'leading-tight': 'lh:1.25', 'leading-relaxed': 'lh:1.625',
        // Layout
        'flex': 'flex', 'grid': 'grid', 'block': 'block', 'inline': 'inline', 'hidden': 'hidden',
        'flex-row': 'row', 'flex-col': 'column', 'items-center': 'align-center',
        'items-start': 'align-start', 'items-end': 'align-end', 'justify-center': 'center',
        'justify-between': 'space-between', 'justify-start': 'start',
        'gap-1': '4px', 'gap-2': '8px', 'gap-4': '16px', 'gap-6': '24px', 'gap-8': '32px',
        // Spacing
        'p-0': '0', 'p-1': '4px', 'p-2': '8px', 'p-4': '16px', 'p-6': '24px', 'p-8': '32px',
        'm-0': '0', 'm-auto': 'auto', 'm-1': '4px', 'm-2': '8px', 'm-4': '16px',
        'px-4': 'x:16px', 'py-2': 'y:8px', 'px-6': 'x:24px', 'py-4': 'y:16px',
        // Sizing
        'w-full': '100%', 'w-auto': 'auto', 'h-full': '100%', 'h-auto': 'auto',
        'max-w-md': '448px', 'max-w-lg': '512px', 'max-w-xl': '576px',
        // Position
        'relative': 'relative', 'absolute': 'absolute', 'fixed': 'fixed', 'sticky': 'sticky',
        // Border/radius
        'rounded': '4px', 'rounded-md': '6px', 'rounded-lg': '8px', 'rounded-xl': '12px',
        'rounded-full': '9999px', 'border': '1px', 'border-2': '2px',
        // Effects
        'shadow': 'shadow-sm', 'shadow-md': 'shadow-md', 'shadow-lg': 'shadow-lg',
        'opacity-50': '0.5', 'cursor-pointer': 'clickable',
        // Colors
        'bg-white': '#fff', 'bg-black': '#000', 'text-white': '#fff', 'text-black': '#000',
        'text-gray-500': '#6b7280', 'text-gray-700': '#374151', 'text-gray-900': '#111827',
        'bg-gray-100': '#f3f4f6', 'bg-gray-800': '#1f2937', 'bg-blue-500': '#3b82f6',
        'bg-red-500': '#ef4444', 'bg-green-500': '#22c55e',
      };

      // Translate Tailwind classes (max 12 to avoid bloat)
      const classInfo = el.classes.slice(0, 12).map(c => {
        if (tw[c]) return `${c}(${tw[c]})`;
        // Handle responsive/state prefixes
        const match = c.match(/^(hover:|focus:|dark:|sm:|md:|lg:)(.+)$/);
        if (match && tw[match[2]]) return `${c}(${tw[match[2]]})`;
        return c;
      });
      ctx += `**Classes:** ${classInfo.join(' ')}\n`;
    }

    // Key computed styles
    if (el.styles) {
      const keyStyles: string[] = [];
      if (el.styles.color && el.styles.color !== 'rgb(0, 0, 0)') keyStyles.push(`color:${el.styles.color}`);
      if (el.styles.backgroundColor && el.styles.backgroundColor !== 'rgba(0, 0, 0, 0)') keyStyles.push(`bg:${el.styles.backgroundColor}`);
      if (el.styles.fontSize) keyStyles.push(`font:${el.styles.fontSize}`);
      if (keyStyles.length > 0) ctx += `**Computed:** ${keyStyles.join(', ')}\n`;
    }

    // Key attributes
    if (el.attributes) {
      const keyAttrs: string[] = [];
      for (const attr of ['href', 'src', 'alt', 'type', 'placeholder', 'aria-label', 'data-testid', 'role']) {
        if (el.attributes[attr]) {
          const val = el.attributes[attr].slice(0, 40);
          keyAttrs.push(`${attr}="${val}${el.attributes[attr].length > 40 ? '...' : ''}"`);
        }
      }
      if (keyAttrs.length > 0) ctx += `**Attrs:** ${keyAttrs.join(', ')}\n`;
    }

    // Parent context (DOM hierarchy)
    if (el.parentChain && el.parentChain.length > 0) {
      const parents = el.parentChain.slice(0, 3).map(p => p.description).join(' → ');
      ctx += `**In:** ${parents}\n`;
    }

    return ctx;
  }).join('\n');

  // If no prompt, use a default instruction
  const finalPrompt = prompt || 'Here is the element I selected:';
  const fullPrompt = `${finalPrompt}\n\n${elementContexts}`;
  const result = await window.claudeLens.sendToClaude(fullPrompt, '');

  if (result.success) {
    promptInput.value = '';
    // Clear selected elements after sending
    selectedElements = [];
    updateElementChips();
    contextEmpty.classList.remove('hidden');
    elementInfo.classList.add('hidden');
    componentInfo.classList.add('hidden');
    pathInfo.classList.add('hidden');
    attributesInfo.classList.add('hidden');
    stylesInfo.classList.add('hidden');
    positionInfo.classList.add('hidden');
    textInfo.classList.add('hidden');
    terminal.focus();
    setStatus('Sent to Claude', true);
  } else {
    alert('Failed to send to Claude');
  }
});

promptInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendPromptBtn.click();
  }
});

// Status helper
function setStatus(text: string, connected = false) {
  statusEl.textContent = text;
  statusEl.className = connected ? 'status connected' : 'status';
}

// Initialize on load
init();
