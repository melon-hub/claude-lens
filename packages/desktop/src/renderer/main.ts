/**
 * Claude Lens Desktop - Renderer
 *
 * Three-column layout: Browser | Context Panel | Claude Code Terminal
 * Cursor-style element inspection and context display.
 */

import type { ElementInfo, CapturedInteraction } from './types';
import 'xterm/css/xterm.css';
import { type ContextMode } from './context-formatter';
import {
  terminal,
  fitAddon,
  substituteChars,
  setupContextMenu,
} from './terminal';
import { waitForFonts, runFontDiagnostics, copyToClipboard } from './utils';
import {
  updateProjectDropdown,
  setupSendHandlers,
  setupNavigationHandlers,
  setupViewportHandlers,
  setupInspectHandlers,
  setupKeyboardShortcuts,
  toggleFreezeHover,
} from './handlers';
import { setStatus, hideThinking, updateStatusBar } from './ui-helpers';
import { updateBrowserBounds, setBrowserLoaded } from './browser-helpers';
import {
  showProjectModal,
  setupResizers,
  addConsoleMessage,
  updateConsoleUI,
  updateConsoleDrawer,
  addSelectedElement,
  setContextPanelCallbacks,
  updateInspectSequenceUI,
  updateFormStateUI,
  updatePhase4UI,
  updateToastCapturesUI,
} from './panels';
import {
  state,
  updateState,
  consoleBuffer,
  addToInspectSequence,
  addCapturedToast,
} from './state';
import {
  // Header
  urlInput,
  refreshBtn,
  restartServerBtn,
  projectDropdown,
  // Panels
  placeholder,
  loadingOverlay,
  terminalEl,
  startClaudeBtn,
  browserHelpText,
  // Context Panel - Prompt
  elementPath,
  copySourceBtn,
  sourceLocation,
  contextModeSelect,
  // Console Drawer
  consoleToggleBtn,
  consoleDrawer,
  consoleClearBtn,
  // Copy Buttons
  copySelectorBtn,
  copyComponentBtn,
  // Status Bar
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

  // Set up all event handlers (extracted to handlers/)
  setupSendHandlers();
  setupNavigationHandlers();
  setupViewportHandlers();
  setupInspectHandlers();
  setupKeyboardShortcuts();
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
