/**
 * Claude Lens Desktop - Renderer
 *
 * Three-column layout: Browser | Context Panel | Claude Code Terminal
 * Cursor-style element inspection and context display.
 */

import type { ElementInfo, CapturedInteraction } from './types';
import 'xterm/css/xterm.css';
import {
  formatElements,
  formatSequence,
  formatConsole,
  type ContextMode,
} from './context-formatter';
import {
  terminal,
  fitAddon,
  substituteChars,
  setupContextMenu,
} from './terminal';
import { debounce, waitForFonts, runFontDiagnostics, copyToClipboard } from './utils';
import { VIEWPORT_PRESETS } from './handlers';
import { setStatus, showThinking, hideThinking, updateStatusBar } from './ui-helpers';
import { updateBrowserBounds, setBrowserLoaded } from './browser-helpers';
import {
  showProjectModal,
  setupResizers,
  addConsoleMessage,
  updateConsoleUI,
  updateConsoleDrawer,
  addSelectedElement,
  updateElementChips,
  setContextPanelCallbacks,
  resetContextPanelUI,
  updateInspectSequenceUI,
  clearInspectSequenceUI,
  updateFormStateUI,
} from './panels';
import {
  state,
  updateState,
  consoleBuffer,
  clearSelectedElements,
  addToInspectSequence,
  addCapturedToast,
  clearCapturedToasts,
} from './state';
import {
  // Header
  urlInput,
  goBtn,
  refreshBtn,
  restartServerBtn,
  viewportSelect,
  projectDropdown,
  // Panels
  placeholder,
  loadingOverlay,
  terminalEl,
  startClaudeBtn,
  inspectBtn,
  browserHelpText,
  // Context Panel - Prompt (chips and display elements moved to context-panel module)
  elementPath,
  copySourceBtn,
  sourceLocation,
  promptInput,
  sendPromptBtn,
  contextModeSelect,
  // Console Drawer
  consoleToggleBtn,
  consoleDrawer,
  consoleClearBtn,
  consoleSendBtn,
  // Inspect Sequence
  clearSequenceBtn,
  sendSequenceBtn,
  // Freeze Hover
  freezeHoverBtn,
  // Phase 4: Edge Cases
  overlayInfo,
  overlayContent,
  overlayTypeBadge,
  stackingInfo,
  stackingContent,
  zIndexBadge,
  scrollInfo,
  scrollContent,
  visibilityBadge,
  iframeInfo,
  iframeContent,
  shadowDOMInfo,
  shadowDOMContent,
  // Toast Captures
  toastCapturesInfo,
  toastCapturesList,
  toastCount,
  clearToastsBtn,
  sendToastsBtn,
  // Copy Buttons
  copySelectorBtn,
  copyComponentBtn,
  // Status Bar (serverStatus for click handler)
  serverStatus,
} from './setup';

// Terminal is imported from ./terminal module (terminal, fitAddon, searchAddon, helpers)
// State is managed by the state module - all state accessed via state.* getters
// and modified via updateState() or helper functions
// Browser helpers (updateBrowserBounds, setBrowserLoaded) imported from ./browser-helpers
// Project modal (showProjectModal) imported from ./panels

// Initialize
async function init() {
  // Set up context panel callbacks (to avoid circular dependencies)
  setContextPanelCallbacks(updateFormStateUI, updatePhase4UI);

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

  // searchAddon is loaded in terminal/manager.ts for Ctrl+F functionality

  // Custom key handler for image paste (must intercept before xterm's default paste)
  terminal.attachCustomKeyEventHandler((e) => {
    // Ctrl+Shift+V - check for image paste
    if (e.ctrlKey && e.shiftKey && (e.key === 'v' || e.key === 'V') && e.type === 'keydown') {
      // Prevent browser's native paste from also triggering (causes double paste)
      e.preventDefault();
      // Handle async image check
      (async () => {
        if (!state.claudeRunning) return;
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
                if (state.browserLoaded) setStatus('Connected', true);
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
        e.preventDefault();
        navigator.clipboard.writeText(selection).then(() => {
          setStatus('Copied to clipboard');
          setTimeout(() => {
            if (state.browserLoaded) setStatus('Connected', true);
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

  // PTY data handler (substituteChars imported from terminal module)
  window.claudeLens.pty.onData((data) => {
    // Hide thinking indicator when we receive output from Claude
    if (state.isThinking) {
      hideThinking();
    }
    // Substitute missing characters and enhance MCP output
    const processed = substituteChars(data);
    terminal.write(processed);
  });

  window.claudeLens.pty.onExit((code) => {
    terminal.writeln(`\r\n[Claude exited with code ${code}]`);
    updateState({ claudeRunning: false });
    startClaudeBtn.textContent = 'Start Claude';
  });

  // Terminal input -> PTY
  terminal.onData((data) => {
    if (state.claudeRunning) {
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
      if (state.claudeRunning) {
        window.claudeLens.pty.resize(terminal.cols, terminal.rows);
      }
      // Update browser bounds when window resizes
      if (state.browserLoaded) {
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
    addCapturedToast(toast);
    updateToastCapturesUI();
  });

  // Listen for element selection from BrowserView
  window.claudeLens.browser.onElementSelected((element) => {
    const elementData = element as ElementInfo;

    // If in inspect mode, add to sequence instead of exiting
    if (state.inspectMode) {
      // Add to inspect sequence
      const interaction: CapturedInteraction = {
        element: elementData,
        action: 'click',
        result: elementData.interactionResult || 'Element captured',
        timestamp: Date.now(),
      };
      addToInspectSequence(interaction);
      updateInspectSequenceUI();

      // Also add to selected elements
      addSelectedElement(elementData);
      browserHelpText.textContent = `Captured ${state.inspectSequence.length} • Click more or stop inspecting`;
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
    updateState({ browserLoaded: false });
    refreshBtn.disabled = true;
    restartServerBtn.disabled = true;
    placeholder.classList.remove('hidden');
    urlInput.value = 'http://localhost:3000';
    setStatus('Disconnected');
    browserHelpText.textContent = '';
    // Reset Claude state
    updateState({ claudeRunning: false });
    startClaudeBtn.textContent = 'Start Claude';
    terminal.clear();
    // Reset status bar state
    updateState({
      currentProjectName: '',
      currentServerPort: 0,
      currentServerType: null,
      playwrightConnected: false,
    });
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
    updateState({
      currentProjectName: info.name,
      currentServerType: info.useDevServer ? 'dev' : 'static',
    });
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
    updateState({ claudeRunning: true });
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
    updateState({ currentServerPort: info.port });
    updateStatusBar();
    // Ensure browserLoaded is true for recent projects flow (modal flow sets it separately)
    if (!state.browserLoaded) {
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
    updateState({ playwrightConnected: false });
    updateStatusBar();
  });

  window.claudeLens.browser.onPlaywrightConnected(() => {
    updateState({ playwrightConnected: true });
    updateStatusBar();
  });

  window.claudeLens.browser.onPlaywrightError(() => {
    updateState({ playwrightConnected: false });
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
  if (state.currentProjectName) {
    const currentOption = Array.from(projectDropdown.options).find(
      opt => opt.textContent === state.currentProjectName
    );
    if (currentOption) {
      projectDropdown.value = currentOption.value;
    }
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
  if (state.capturedToasts.length === 0) {
    toastCapturesInfo.classList.add('hidden');
    return;
  }

  toastCapturesInfo.classList.remove('hidden');
  toastCount.textContent = String(state.capturedToasts.length);

  toastCapturesList.textContent = '';

  state.capturedToasts.forEach((toast) => {
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
  clearCapturedToasts();
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
  if (state.claudeRunning) return;

  startClaudeBtn.textContent = 'Starting...';
  const result = await window.claudeLens.pty.start();

  if (result.success) {
    updateState({ claudeRunning: true });
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
  if (!state.browserLoaded) return;
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

// Viewport preset change handler (VIEWPORT_PRESETS imported from ./handlers)
viewportSelect.addEventListener('change', () => {
  const preset = viewportSelect.value;
  updateState({ viewportWidth: VIEWPORT_PRESETS[preset] || 0 });
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
    updateState({ viewportWidth: width });
  } else {
    // Custom width - set to full and apply custom constraint
    viewportSelect.value = 'full';
    updateState({ viewportWidth: width });
  }

  updateBrowserBounds();
  updateStatusBar();
  // Show user feedback
  const widthLabel = state.viewportWidth > 0 ? `${state.viewportWidth}px` : 'Full Width';
  setStatus(`Viewport: ${widthLabel}`);
});

// Update browser bounds on window resize (ensures bounds update after maximize/restore)
window.addEventListener('resize', debounce(() => {
  if (state.browserLoaded) {
    console.log('[Viewport] Window resize detected, updating bounds');
    updateBrowserBounds();
  }
}, 100));

// Use ResizeObserver for more reliable panel size tracking
const browserPanel = document.querySelector('.browser-panel') as HTMLElement;
const panelResizeObserver = new ResizeObserver(debounce(() => {
  if (state.browserLoaded) {
    console.log('[Viewport] Panel resize detected, updating bounds');
    updateBrowserBounds();
  }
}, 50));
panelResizeObserver.observe(browserPanel);

// Reset viewport to full width when starting a new project
window.claudeLens.browser.onResetViewport(() => {
  console.log('[Viewport] Received resetViewport, current viewportWidth:', state.viewportWidth);
  updateState({ viewportWidth: 0 });
  viewportSelect.value = 'full';
  console.log('[Viewport] Reset to full width, calling updateBrowserBounds');
  updateBrowserBounds();
});

// Inspect mode toggle (Phase 2: sequence capture mode)
inspectBtn.addEventListener('click', async () => {
  if (!state.browserLoaded) {
    alert('Load a page first');
    return;
  }

  updateState({ inspectMode: !state.inspectMode });

  if (state.inspectMode) {
    // Clear previous sequence when entering inspect mode
    clearInspectSequenceUI();
    await window.claudeLens.browser.enableInspect();
    inspectBtn.textContent = 'Stop Inspecting';
    inspectBtn.classList.add('btn-primary');
    browserHelpText.textContent = 'Hover to highlight • Click to capture';
  } else {
    await window.claudeLens.browser.disableInspect();
    inspectBtn.textContent = 'Inspect';
    inspectBtn.classList.remove('btn-primary');
    // Don't clear sequence - user may want to send it
    if (state.inspectSequence.length > 0) {
      browserHelpText.textContent = `Captured ${state.inspectSequence.length} • Click "Send Sequence" to send`;
    } else {
      browserHelpText.textContent = 'Ctrl+hover to inspect anytime';
    }
  }
});

// Freeze hover toggle function (Phase 3)
async function toggleFreezeHover() {
  if (!state.browserLoaded) {
    return;
  }

  updateState({ hoverFrozen: !state.hoverFrozen });

  if (state.hoverFrozen) {
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
  if ((e.key === 'f' || e.key === 'F') && !isTyping && state.browserLoaded) {
    e.preventDefault();
    toggleFreezeHover();
  }

  // Ctrl+Shift+I is reserved for DevTools - don't intercept it
  // Inspect mode is accessible via Ctrl+hover or the Inspect button

  // Ctrl+R to refresh (when not in terminal)
  if (e.ctrlKey && (e.key === 'r' || e.key === 'R') && state.browserLoaded && !isTyping) {
    e.preventDefault();
    refreshBtn.click();
  }

  // Note: Ctrl+Shift+C and Ctrl+Shift+V are handled by terminal.attachCustomKeyEventHandler
  // in the init() function for proper interception before xterm processes them
});

// Console drawer toggle
consoleToggleBtn.addEventListener('click', () => {
  updateState({ consoleDrawerOpen: !state.consoleDrawerOpen });

  if (state.consoleDrawerOpen) {
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
  clearInspectSequenceUI();
  setStatus('Sequence cleared', true);
});

// Inspect sequence send button (Phase 2)
sendSequenceBtn.addEventListener('click', async () => {
  if (!state.claudeRunning) {
    alert('Start Claude first!');
    return;
  }

  if (state.inspectSequence.length === 0) {
    alert('No interactions captured. Click elements in Inspect mode first.');
    return;
  }

  // Format sequence using optimized formatter (prioritizes file:line > component > selector)
  const sequenceContext = formatSequence(state.inspectSequence);
  const fullPrompt = `Here is the captured interaction sequence:\n\n${sequenceContext}`;
  showThinking();
  const result = await window.claudeLens.sendToClaude(fullPrompt, '');

  if (result.success) {
    // Clear sequence after sending
    clearInspectSequenceUI();
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
  if (!state.claudeRunning) {
    alert('Start Claude first!');
    return;
  }

  if (state.capturedToasts.length === 0) {
    alert('No toasts captured yet.');
    return;
  }

  // Format lean toast context
  let toastContext = `## Toast Notifications (${state.capturedToasts.length})\n\n`;

  for (const toast of state.capturedToasts) {
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
  if (!state.claudeRunning) {
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

  if (!state.claudeRunning) {
    alert('Start Claude first!');
    return;
  }

  // Require either a prompt or selected elements
  if (!prompt && state.selectedElements.length === 0) {
    return;
  }

  if (state.selectedElements.length === 0) {
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
  const elementContext = formatElements(state.selectedElements, { mode: state.contextMode });

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
      clearSelectedElements();
      updateElementChips();
      resetContextPanelUI();
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
  updateState({ contextMode: contextModeSelect.value as ContextMode });
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
  const lastElement = state.selectedElements[state.selectedElements.length - 1];
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

// Server status click handler - copy URL to clipboard
serverStatus.addEventListener('click', async () => {
  if (state.currentServerPort > 0) {
    const url = `http://localhost:${state.currentServerPort}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus('URL copied!', true);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  }
});

// Terminal context menu - extracted to terminal/context-menu.ts
setupContextMenu(terminalEl);

// Initialize on load
init();
