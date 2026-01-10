/**
 * Claude Lens Desktop - Renderer
 *
 * Three-column layout: Browser | Context Panel | Claude Code Terminal
 * Cursor-style element inspection and context display.
 */

import { Terminal } from 'xterm';
import type { ElementInfo, ProjectInfo } from './types';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { SearchAddon } from '@xterm/addon-search';
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
  console.log(`Waiting for fonts: ${fontNames.join(', ')}`);

  // Request all fonts to load
  for (const font of fontNames) {
    try {
      await document.fonts.load(`13px "${font}"`);
      console.log(`Font load requested: ${font}`);
    } catch (e) {
      console.warn(`Font load request failed for ${font}:`, e);
    }
  }

  // Wait for all fonts to be ready
  await document.fonts.ready;
  console.log('document.fonts.ready resolved');

  // Check each font
  for (const font of fontNames) {
    let fontAvailable = document.fonts.check(`13px "${font}"`);
    console.log(`Font check (${font}):`, fontAvailable);

    // Poll if not yet available
    while (!fontAvailable && (Date.now() - startTime) < timeoutMs) {
      await new Promise(r => setTimeout(r, 100));
      fontAvailable = document.fonts.check(`13px "${font}"`);
    }

    if (!fontAvailable) {
      console.warn(`Font "${font}" not available after timeout, proceeding anyway`);
    } else {
      console.log(`Font "${font}" is ready`);
    }
  }

  // Additional delay for font rendering to settle
  await new Promise(r => setTimeout(r, 500));
}

/**
 * Font diagnostics for terminal icon rendering
 *
 * Tests critical Unicode codepoints used by Claude Code CLI:
 * - U+23F5 (⏵) - Checkbox/play button icons
 * - U+E0A0-E0B3 - Powerline/git icons
 * - U+F000+ - Nerd Font devicons
 *
 * Logs warnings if fonts are missing or codepoints unsupported.
 */
function runFontDiagnostics(): void {
  const criticalFonts = [
    { name: 'JetBrains Mono NF Bundled', purpose: 'Main terminal text + Nerd Font icons' },
    { name: 'Noto Sans Symbols 2', purpose: 'Unicode symbols (U+23F5 checkboxes)' },
  ];

  // Critical codepoints Claude Code uses
  const criticalCodepoints = [
    { char: '\u23F5', name: 'BLACK MEDIUM RIGHT-POINTING TRIANGLE', usage: 'checkboxes' },
    { char: '\uF00C', name: 'Nerd Font checkmark', usage: 'success indicators' },
    { char: '\uE0A0', name: 'Powerline git branch', usage: 'git status' },
    { char: '\uE0B0', name: 'Powerline arrow right', usage: 'prompt separators' },
  ];

  console.group('🔤 Font Diagnostics');

  // Check font availability
  let allFontsLoaded = true;
  for (const font of criticalFonts) {
    const loaded = document.fonts.check(`13px "${font.name}"`);
    if (loaded) {
      console.log(`✓ ${font.name} - ${font.purpose}`);
    } else {
      console.warn(`✗ ${font.name} NOT LOADED - ${font.purpose}`);
      allFontsLoaded = false;
    }
  }

  // Test codepoint rendering via canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Use the full font stack
    ctx.font = "13px 'JetBrains Mono NF Bundled', 'Symbols Nerd Font', 'Noto Sans Symbols 2', monospace";

    for (const cp of criticalCodepoints) {
      const width = ctx.measureText(cp.char).width;
      const hex = cp.char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0');
      if (width > 0) {
        console.log(`✓ U+${hex} (${cp.name}) - ${width.toFixed(1)}px`);
      } else {
        console.warn(`✗ U+${hex} (${cp.name}) - zero width, may not render`);
      }
    }
  }

  if (allFontsLoaded) {
    console.log('All critical fonts loaded successfully');
  } else {
    console.warn('Some fonts missing - icons may not render correctly');
  }

  console.groupEnd();
}

// Elements - Header
const urlInput = document.getElementById('urlInput') as HTMLInputElement;
const goBtn = document.getElementById('goBtn') as HTMLButtonElement;
const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;

// Elements - Panels
const placeholder = document.getElementById('placeholder') as HTMLDivElement;
const terminalEl = document.getElementById('terminal') as HTMLDivElement;
const startClaudeBtn = document.getElementById('startClaudeBtn') as HTMLButtonElement;
const inspectBtn = document.getElementById('inspectBtn') as HTMLButtonElement;

// Elements - Context Panel
const contextEmpty = document.getElementById('contextEmpty') as HTMLDivElement;
const elementInfo = document.getElementById('elementInfo') as HTMLDivElement;
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

// Console drawer height - 200px CSS + extra buffer for BrowserView bounds
const DRAWER_HEIGHT = 235;

// Console message buffer (last 50 messages)
interface ConsoleMessage {
  level: string;
  message: string;
  timestamp: number;
}
const consoleBuffer: ConsoleMessage[] = [];
const MAX_CONSOLE_MESSAGES = 50;

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
  console.log('Terminal opened with font:', fontFamily);

  // Run font diagnostics to verify icons will render correctly
  runFontDiagnostics();

  // Load search addon for Ctrl+F functionality
  const searchAddon = new SearchAddon();
  terminal.loadAddon(searchAddon);

  fitAddon.fit();
  console.log('Terminal ready');

  // Force a refresh after a delay for any rendering glitches
  setTimeout(() => {
    terminal.refresh(0, terminal.rows - 1);
    console.log('Terminal refreshed');

  }, 500);

  // PTY data handler
  window.claudeLens.pty.onData((data) => {
    terminal.write(data);
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
        const browserPanel = document.querySelector('.browser-panel') as HTMLElement;
        const drawerHeight = consoleDrawerOpen ? DRAWER_HEIGHT : 0;
        window.claudeLens.browser.updateBounds(browserPanel.offsetWidth, drawerHeight);
      }
    }, 100);
  });

  // Set up resizers
  setupResizers();

  // Listen for console messages from BrowserView
  window.claudeLens.browser.onConsoleMessage((msg) => {
    addConsoleMessage(msg);
  });

  // Listen for element selection from BrowserView
  window.claudeLens.browser.onElementSelected((element) => {
    const elementData = element as ElementInfo;
    inspectMode = false;
    inspectBtn.textContent = 'Inspect';
    inspectBtn.classList.remove('btn-primary');
    setStatus('Element selected', true);
    addSelectedElement(elementData);
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
    const browserPanel = document.querySelector('.browser-panel') as HTMLElement;
    const drawerHeight = consoleDrawerOpen ? DRAWER_HEIGHT : 0;
    window.claudeLens.browser.updateBounds(browserPanel.offsetWidth, drawerHeight);
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
        window.claudeLens.browser.updateBounds(newWidth, drawerHeight);
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

// Console message handling
function addConsoleMessage(msg: ConsoleMessage) {
  consoleBuffer.push(msg);
  if (consoleBuffer.length > MAX_CONSOLE_MESSAGES) {
    consoleBuffer.shift();
  }
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
  consoleBuffer.length = 0;
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

  // Update browser view bounds to match panel width
  const browserPanel = document.querySelector('.browser-panel') as HTMLElement;
  const drawerHeight = consoleDrawerOpen ? DRAWER_HEIGHT : 0;
  window.claudeLens.browser.updateBounds(browserPanel.offsetWidth, drawerHeight);
});

urlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') goBtn.click();
});

refreshBtn.addEventListener('click', async () => {
  if (!browserLoaded) return;
  await window.claudeLens.browser.navigate(urlInput.value);
});

// Inspect mode toggle
inspectBtn.addEventListener('click', async () => {
  if (!browserLoaded) {
    alert('Load a page first');
    return;
  }

  inspectMode = !inspectMode;

  if (inspectMode) {
    await window.claudeLens.browser.enableInspect();
    inspectBtn.textContent = 'Click element...';
    inspectBtn.classList.add('btn-primary');
    setStatus('Click an element in the browser', false);
  } else {
    await window.claudeLens.browser.disableInspect();
    inspectBtn.textContent = 'Inspect';
    inspectBtn.classList.remove('btn-primary');
    setStatus('Connected', true);
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
  const browserPanel = document.querySelector('.browser-panel') as HTMLElement;
  const drawerHeight = consoleDrawerOpen ? DRAWER_HEIGHT : 0;
  window.claudeLens.browser.updateBounds(browserPanel.offsetWidth, drawerHeight);
});

// Console clear button
consoleClearBtn.addEventListener('click', () => {
  consoleBuffer.length = 0;
  updateConsoleUI();
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

  // Get current page URL
  const pageURL = await window.claudeLens.browser.getURL();

  // Format console messages
  const consoleLines = consoleBuffer.map(m => {
    const time = new Date(m.timestamp).toLocaleTimeString();
    return `[${time}] [${m.level.toUpperCase()}] ${m.message}`;
  });

  const context = `**Page:** ${pageURL || 'Unknown'}\n\n**Console Output (${consoleBuffer.length} messages):**\n\`\`\`\n${consoleLines.join('\n')}\n\`\`\``;

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

  // Get current page URL
  const pageURL = await window.claudeLens.browser.getURL();

  // Format element context for all selected elements
  const elementContexts = selectedElements.map(el => {
    let ctx = `## Selected Element: <${el.tagName}${el.id ? '#' + el.id : ''}>\n\n`;
    ctx += `**Selector:** \`${el.selector}\`\n`;
    ctx += `**Tag:** ${el.tagName}${el.id ? '#' + el.id : ''}\n`;
    ctx += `**Classes:** ${el.classes.join(', ') || 'none'}\n`;
    if (el.text) ctx += `**Text:** ${el.text.slice(0, 100)}${el.text.length > 100 ? '...' : ''}\n`;
    if (el.position) {
      ctx += `**Position:** ${Math.round(el.position.x)}, ${Math.round(el.position.y)}\n`;
      ctx += `**Size:** ${Math.round(el.position.width)}×${Math.round(el.position.height)}px\n`;
    }

    // Add component info for Claude to know which file to edit
    if (el.framework && el.framework.components.length > 0) {
      ctx += `\n**Framework:** ${el.framework.framework}\n`;
      ctx += `**Component Hierarchy:**\n`;
      for (const comp of el.framework.components) {
        ctx += `  - \`<${comp.name} />\``;
        if (comp.source) {
          ctx += ` → **${comp.source.fileName}:${comp.source.lineNumber}**`;
        }
        ctx += '\n';
      }
      // Emphasize the first component (most specific) for editing
      const primary = el.framework.components[0];
      if (primary?.source) {
        ctx += `\n**Edit this file:** \`${primary.source.fileName}\` at line ${primary.source.lineNumber}\n`;
      }
    }

    return ctx;
  }).join('\n---\n\n');

  // Build full context with page info and tool hints
  const pageContext = pageURL ? `**Page:** ${pageURL}\n\n` : '';

  // Add tool hints so Claude knows to use our MCP tools
  const toolHints = `---
**Claude Lens Context**
- For screenshots, use \`claude_lens/screenshot\` (NOT browser_snapshot/Playwright)
- For element inspection, use \`claude_lens/inspect_element\`
- For console logs, use \`claude_lens/get_console\`
- If you need to edit files but don't know the source path, ASK the user where the project files are located.
---

`;

  // If no prompt, use a default instruction
  const finalPrompt = prompt || 'Here is the element I selected:';
  const fullPrompt = `${toolHints}${finalPrompt}\n\n${pageContext}${elementContexts}`;
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
