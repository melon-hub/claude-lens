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
import 'xterm/css/xterm.css';

/**
 * Load terminal fonts using native FontFace API
 * Ensures fonts are ready before xterm renders to canvas
 */
async function loadTerminalFonts(fontFamily: string): Promise<void> {
  // Extract primary font name from the font stack
  const primaryFont = (fontFamily.split(',')[0] ?? fontFamily).trim().replace(/['"]/g, '');

  // Use document.fonts API to check/load fonts
  if (document.fonts) {
    try {
      // Check if the font is already loaded
      const fontLoaded = document.fonts.check(`13px "${primaryFont}"`);
      if (fontLoaded) {
        console.log('Font already loaded:', primaryFont);
        return;
      }

      // Wait for fonts to be ready (with timeout)
      await Promise.race([
        document.fonts.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Font load timeout')), 3000))
      ]);

      console.log('Fonts ready via document.fonts');
    } catch (err) {
      console.warn('Font loading warning:', err);
      // Continue anyway - fallback fonts will work
    }
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

// Terminal setup
const terminal = new Terminal({
  theme: {
    background: '#1e1e1e',
    foreground: '#cccccc',
    cursor: '#cccccc',
    selectionBackground: '#264f78',
  },
  fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'SF Mono', Monaco, 'Consolas', 'Courier New', 'Segoe UI Symbol', 'Segoe UI Emoji', 'Noto Color Emoji', 'Apple Color Emoji', monospace",
  fontSize: 13,
  cursorBlink: true,
  allowProposedApi: true,
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

  // Wait for terminal fonts to load before opening
  // This prevents rendering issues with custom fonts in canvas-based xterm
  const fontFamily = terminal.options.fontFamily || 'monospace';
  await loadTerminalFonts(fontFamily);

  // Now open terminal with fonts ready
  terminal.open(terminalEl);
  console.log('Terminal opened with fonts:', fontFamily);
  fitAddon.fit();

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

  // Handle resize
  window.addEventListener('resize', () => {
    fitAddon.fit();
    if (claudeRunning) {
      window.claudeLens.pty.resize(terminal.cols, terminal.rows);
    }
    // Update browser bounds when window resizes
    if (browserLoaded) {
      updateBrowserBounds();
    }
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
      setStatus(`Captured ${inspectSequence.length} interaction(s)`, true);
    } else {
      // Normal single-element selection (Ctrl+Click)
      addSelectedElement(elementData);
      setStatus('Element selected', true);
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
    setStatus('Click elements to capture sequence (click button again to stop)', false);
  } else {
    await window.claudeLens.browser.disableInspect();
    inspectBtn.textContent = 'Inspect';
    inspectBtn.classList.remove('btn-primary');
    // Don't clear sequence - user may want to send it
    if (inspectSequence.length > 0) {
      setStatus(`Captured ${inspectSequence.length} interaction(s) - click "Send Sequence" to send`, true);
    } else {
      setStatus('Connected', true);
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
    setStatus('Hover frozen! Press F again to unfreeze', true);
  } else {
    await window.claudeLens.browser.unfreezeHover();
    freezeHoverBtn.textContent = 'Freeze (F)';
    freezeHoverBtn.classList.remove('active');
    setStatus('Hover states unfrozen', true);
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
  consoleBuffer.length = 0;
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

  // Get current page URL
  const pageURL = await window.claudeLens.browser.getURL();

  // Format sequence for Claude
  let sequenceContext = `## Captured Interaction Sequence (${inspectSequence.length} steps)\n\n`;
  sequenceContext += `**Page:** ${pageURL || 'Unknown'}\n\n`;

  for (let i = 0; i < inspectSequence.length; i++) {
    const interaction = inspectSequence[i];
    if (!interaction) continue;
    const el = interaction.element;

    sequenceContext += `### Step ${i + 1}: ${el.description || el.tagName}\n`;
    sequenceContext += `- **Action:** ${interaction.action}\n`;
    sequenceContext += `- **Selector:** \`${el.selector}\`\n`;
    sequenceContext += `- **Result:** ${interaction.result}\n`;
    if (el.text) {
      sequenceContext += `- **Text:** "${el.text.slice(0, 50)}${el.text.length > 50 ? '...' : ''}"\n`;
    }
    sequenceContext += '\n';
  }

  const toolHints = `---
**Claude Lens Context**
- This is an interaction sequence captured during Inspect mode
- Actions were blocked to preserve UI state (dropdowns stayed open, etc.)
- Use \`claude_lens/screenshot\` to see the current state
- Use \`claude_lens/click\` to replay interactions (without blocking)
---

`;

  const fullPrompt = `${toolHints}Here is the captured interaction sequence:\n\n${sequenceContext}`;
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

  // Get current page URL
  const pageURL = await window.claudeLens.browser.getURL();

  // Format toasts for Claude
  let toastContext = `## Captured Toast Notifications (${capturedToasts.length} messages)\n\n`;
  toastContext += `**Page:** ${pageURL || 'Unknown'}\n\n`;

  for (const toast of capturedToasts) {
    const time = new Date(toast.timestamp).toLocaleTimeString();
    toastContext += `- **[${time}]** [${toast.type.toUpperCase()}] ${toast.text}\n`;
  }

  const toolHints = `---
**Claude Lens Context**
- These are toast notifications captured via MutationObserver
- Toasts may indicate success/error states from user actions
---

`;

  const fullPrompt = `${toolHints}Here are the captured toast notifications:\n\n${toastContext}`;
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
