/**
 * Claude Lens VS Code Extension
 *
 * Provides an embedded browser panel with element inspection
 * that sends context to Claude Code via MCP.
 */

import * as vscode from 'vscode';
import {
  CDPAdapter,
  launchChrome,
  isChromeRunning,
  getExecutionContext,
  getManualLaunchInstructions,
  isAllowedUrl,
  redactSecrets,
  BridgeServer,
} from '@claude-lens/core';
import type { ElementInfo, BridgeHandler, BridgeState, ConsoleMessage } from '@claude-lens/core';

let browserPanel: vscode.WebviewPanel | undefined;
let cdpAdapter: CDPAdapter | undefined;
let screenshotInterval: ReturnType<typeof setInterval> | undefined;
let bridgeServer: BridgeServer | undefined;
let lastInspectedElement: ElementInfo | null = null;
let consoleLogs: ConsoleMessage[] = [];

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Lens is now active');

  // Start the bridge server for MCP communication
  startBridgeServer().catch((err) => {
    console.error('Failed to start bridge server:', err);
  });

  // Register commands
  const openCommand = vscode.commands.registerCommand('claudeLens.open', () => {
    openBrowserPanel(context);
  });

  const connectCommand = vscode.commands.registerCommand('claudeLens.connect', async () => {
    await connectToBrowser();
  });

  const disconnectCommand = vscode.commands.registerCommand('claudeLens.disconnect', () => {
    disconnectFromBrowser();
  });

  context.subscriptions.push(openCommand, connectCommand, disconnectCommand);
}

async function startBridgeServer(): Promise<void> {
  bridgeServer = new BridgeServer();

  const handler: BridgeHandler = {
    getState(): BridgeState {
      return {
        connected: cdpAdapter?.isConnected() ?? false,
        currentUrl: cdpAdapter?.getCurrentUrl() ?? '',
        lastInspectedElement,
        consoleLogs: consoleLogs.slice(-100),
      };
    },

    async navigate(url: string) {
      try {
        await navigateToUrl(url);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    },

    async inspectElement(selector?: string) {
      if (!cdpAdapter?.isConnected()) return null;

      if (selector) {
        try {
          return await cdpAdapter.inspectElement(selector);
        } catch {
          return null;
        }
      }

      return lastInspectedElement;
    },

    async inspectElementAtPoint(x: number, y: number) {
      if (!cdpAdapter?.isConnected()) return null;
      return cdpAdapter.inspectElementAtPoint(x, y);
    },

    async highlight(selector: string, options?: { color?: string; duration?: number }) {
      if (!cdpAdapter?.isConnected()) return;
      await cdpAdapter.highlight(selector, options);
    },

    async clearHighlights() {
      if (!cdpAdapter?.isConnected()) return;
      await cdpAdapter.clearHighlights();
    },

    async screenshot(selector?: string) {
      if (!cdpAdapter?.isConnected()) throw new Error('Not connected');
      const buffer = await cdpAdapter.screenshot({ selector });
      return buffer.toString('base64');
    },

    async getConsoleLogs(level?: string, limit?: number) {
      let logs = [...consoleLogs];

      if (level && level !== 'all') {
        logs = logs.filter((log) => log.level === level);
      }

      if (limit) {
        logs = logs.slice(-limit);
      }

      return logs;
    },

    async reload() {
      if (!cdpAdapter?.isConnected()) return;
      await cdpAdapter.reload();
    },
  };

  bridgeServer.setHandler(handler);
  await bridgeServer.start();
  console.log('Claude Lens bridge server started on port 9333');
}

async function connectToBrowser(): Promise<boolean> {
  const config = vscode.workspace.getConfiguration('claudeLens');
  const port = config.get<number>('cdpPort', 9222);
  const autoLaunch = config.get<boolean>('autoLaunchBrowser', true);

  try {
    // Check if Chrome is already running
    const running = await isChromeRunning(port);

    if (!running && autoLaunch) {
      updateStatus('Launching Chrome...');
      try {
        await launchChrome({ port });
        updateStatus('Chrome launched');
      } catch (launchError) {
        // Show manual instructions
        const context = getExecutionContext();
        const instructions = getManualLaunchInstructions(context, port);
        vscode.window.showErrorMessage(
          `Failed to launch Chrome automatically. ${instructions}`,
          'Retry',
          'Open Settings'
        ).then((choice) => {
          if (choice === 'Retry') {
            vscode.commands.executeCommand('claudeLens.connect');
          } else if (choice === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'claudeLens');
          }
        });
        updateStatus('Failed to launch Chrome');
        return false;
      }
    } else if (!running) {
      updateStatus('Chrome not running');
      vscode.window.showWarningMessage(
        `Chrome is not running with debugging enabled on port ${port}. Enable auto-launch in settings or start Chrome manually.`
      );
      return false;
    }

    // Connect to Chrome
    updateStatus('Connecting to Chrome...');
    cdpAdapter = new CDPAdapter({ port });
    await cdpAdapter.connect();

    updateStatus('Connected');
    vscode.window.showInformationMessage('Connected to Chrome');

    // Set up console message forwarding
    const autoStreamConsole = config.get<boolean>('autoStreamConsole', true);
    cdpAdapter.onConsoleMessage((msg) => {
      // Store for MCP access
      consoleLogs.push(msg);
      // Keep only last 500 messages
      if (consoleLogs.length > 500) {
        consoleLogs = consoleLogs.slice(-500);
      }

      if (autoStreamConsole && (msg.level === 'error' || msg.level === 'warn')) {
        const redacted = redactSecrets(msg.text);
        sendToWebview({
          command: 'console',
          level: msg.level,
          text: redacted.text,
          source: msg.source,
          line: msg.line,
        });
      }
    });

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    updateStatus('Connection failed');
    vscode.window.showErrorMessage(`Failed to connect to Chrome: ${message}`);
    return false;
  }
}

function disconnectFromBrowser(): void {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = undefined;
  }

  if (cdpAdapter) {
    cdpAdapter.disconnect().catch(console.error);
    cdpAdapter = undefined;
  }

  lastInspectedElement = null;
  consoleLogs = [];

  updateStatus('Disconnected');
  vscode.window.showInformationMessage('Disconnected from browser');
}

async function navigateToUrl(url: string): Promise<void> {
  if (!cdpAdapter?.isConnected()) {
    const connected = await connectToBrowser();
    if (!connected) throw new Error('Failed to connect to browser');
  }

  // Validate URL
  if (!isAllowedUrl(url)) {
    throw new Error('Only localhost URLs are allowed for security reasons.');
  }

  updateStatus('Loading...');
  await cdpAdapter!.navigate(url, { waitFor: 'load' });
  updateStatus('Loaded');

  // Start screenshot streaming
  startScreenshotStreaming();
}

function startScreenshotStreaming(): void {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
  }

  // Capture initial screenshot
  captureAndSendScreenshot();

  // Stream screenshots at ~5fps (good balance of performance and responsiveness)
  screenshotInterval = setInterval(captureAndSendScreenshot, 200);
}

async function captureAndSendScreenshot(): Promise<void> {
  if (!cdpAdapter?.isConnected()) return;

  try {
    const buffer = await cdpAdapter.screenshot({ format: 'png' });
    const base64 = buffer.toString('base64');
    sendToWebview({
      command: 'screenshot',
      data: base64,
    });
  } catch {
    // Ignore screenshot errors (page might be navigating)
  }
}

async function handleClick(x: number, y: number): Promise<void> {
  if (!cdpAdapter?.isConnected()) return;

  try {
    const elementInfo = await cdpAdapter.inspectElementAtPoint(x, y);
    if (!elementInfo) {
      vscode.window.showWarningMessage('No element found at that position');
      return;
    }

    // Store for MCP access
    lastInspectedElement = elementInfo;

    // Show element info in webview
    sendToWebview({
      command: 'elementInfo',
      element: elementInfo,
    });

    // Show confirmation dialog
    const choice = await vscode.window.showInformationMessage(
      `Send ${elementInfo.tagName}${elementInfo.id ? '#' + elementInfo.id : ''} to Claude?`,
      'Send to Claude',
      'Highlight',
      'Cancel'
    );

    if (choice === 'Send to Claude') {
      await sendElementToClaude(elementInfo);
    } else if (choice === 'Highlight') {
      await cdpAdapter.highlight(elementInfo.selector, {
        style: 'outline',
        color: '#3b82f6',
        duration: 3000,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Failed to inspect element: ${message}`);
  }
}

async function sendElementToClaude(element: ElementInfo): Promise<void> {
  // Format element info for Claude
  const context = `
## Inspected Element

**Selector:** \`${element.selector}\`
**Tag:** ${element.tagName}${element.id ? `#${element.id}` : ''}
**Classes:** ${element.classes.join(', ') || 'none'}

### Computed Styles
- display: ${element.computedStyles.display}
- position: ${element.computedStyles.position}
- width: ${element.computedStyles.width}
- height: ${element.computedStyles.height}
- margin: ${element.computedStyles.margin}
- padding: ${element.computedStyles.padding}
- color: ${element.computedStyles.color}
- background: ${element.computedStyles.backgroundColor}
- font-size: ${element.computedStyles.fontSize}

### Bounding Box
- x: ${element.boundingBox.x}, y: ${element.boundingBox.y}
- width: ${element.boundingBox.width}, height: ${element.boundingBox.height}
`;

  // Copy to clipboard for now (MCP integration comes later)
  await vscode.env.clipboard.writeText(context);
  vscode.window.showInformationMessage('Element info copied to clipboard. Paste into Claude conversation.');
}

function openBrowserPanel(context: vscode.ExtensionContext) {
  if (browserPanel) {
    browserPanel.reveal();
    return;
  }

  browserPanel = vscode.window.createWebviewPanel(
    'claudeLensBrowser',
    'Claude Lens',
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  browserPanel.webview.html = getWebviewContent();

  browserPanel.onDidDispose(() => {
    browserPanel = undefined;
    disconnectFromBrowser();
  });

  // Handle messages from webview
  browserPanel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'navigate':
          try {
            await navigateToUrl(message.url);
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Navigation failed: ${msg}`);
            updateStatus('Navigation failed');
          }
          break;
        case 'click':
          await handleClick(message.x, message.y);
          break;
        case 'refresh':
          if (cdpAdapter?.isConnected()) {
            await cdpAdapter.reload();
            startScreenshotStreaming();
          }
          break;
      }
    },
    undefined,
    context.subscriptions
  );
}

function updateStatus(text: string): void {
  sendToWebview({ command: 'status', text });
}

function sendToWebview(message: Record<string, unknown>): void {
  if (browserPanel) {
    browserPanel.webview.postMessage(message);
  }
}

function getWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Lens</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      padding: 8px;
      background: var(--vscode-titleBar-activeBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .url-input {
      flex: 1;
      padding: 4px 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: 13px;
    }
    .url-input:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    .btn {
      padding: 4px 12px;
      border: none;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    .btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn:active {
      transform: scale(0.98);
    }
    .canvas-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: auto;
      background: var(--vscode-editor-background);
    }
    #browserCanvas {
      max-width: 100%;
      max-height: 100%;
      cursor: crosshair;
    }
    .status-bar {
      padding: 4px 8px;
      background: var(--vscode-statusBar-background);
      color: var(--vscode-statusBar-foreground);
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 16px;
      color: var(--vscode-descriptionForeground);
    }
    .placeholder-icon {
      font-size: 64px;
      opacity: 0.5;
    }
    .console-panel {
      max-height: 150px;
      overflow-y: auto;
      background: var(--vscode-terminal-background);
      border-top: 1px solid var(--vscode-panel-border);
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    .console-entry {
      padding: 2px 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .console-error {
      color: var(--vscode-errorForeground);
      background: var(--vscode-inputValidation-errorBackground);
    }
    .console-warn {
      color: var(--vscode-editorWarning-foreground);
      background: var(--vscode-inputValidation-warningBackground);
    }
    .hidden {
      display: none;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <input type="text" class="url-input" id="urlInput" placeholder="http://localhost:3000" value="http://localhost:3000">
    <button class="btn" id="goBtn">Go</button>
    <button class="btn" id="refreshBtn">↻</button>
  </div>

  <div class="canvas-container">
    <div class="placeholder" id="placeholder">
      <div class="placeholder-icon">🔍</div>
      <div style="font-size: 18px; font-weight: 500;">Claude Lens</div>
      <div style="font-size: 13px;">Visual web development companion</div>
      <div style="font-size: 12px; opacity: 0.7; margin-top: 8px;">
        Enter a localhost URL and click Go to start<br>
        <strong>Ctrl+Click</strong> on elements to inspect
      </div>
    </div>
    <canvas id="browserCanvas" class="hidden"></canvas>
  </div>

  <div class="console-panel hidden" id="consolePanel"></div>

  <div class="status-bar">
    <span id="status">Disconnected</span>
    <span id="info">Ctrl+Click to inspect elements</span>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const urlInput = document.getElementById('urlInput');
    const goBtn = document.getElementById('goBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const canvas = document.getElementById('browserCanvas');
    const placeholder = document.getElementById('placeholder');
    const status = document.getElementById('status');
    const consolePanel = document.getElementById('consolePanel');
    const ctx = canvas.getContext('2d');

    let scaleX = 1;
    let scaleY = 1;

    goBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (url) {
        vscode.postMessage({ command: 'navigate', url });
        status.textContent = 'Connecting...';
      }
    });

    urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        goBtn.click();
      }
    });

    refreshBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'refresh' });
    });

    canvas.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        const rect = canvas.getBoundingClientRect();
        // Account for canvas scaling
        const x = Math.round((e.clientX - rect.left) * scaleX);
        const y = Math.round((e.clientY - rect.top) * scaleY);
        vscode.postMessage({ command: 'click', x, y });
      }
    });

    // Handle messages from extension
    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.command) {
        case 'screenshot':
          const img = new Image();
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            // Calculate scale for coordinate mapping
            const rect = canvas.getBoundingClientRect();
            scaleX = img.width / rect.width;
            scaleY = img.height / rect.height;
            ctx.drawImage(img, 0, 0);
            canvas.classList.remove('hidden');
            placeholder.classList.add('hidden');
          };
          img.src = 'data:image/png;base64,' + message.data;
          break;

        case 'status':
          status.textContent = message.text;
          break;

        case 'console':
          addConsoleEntry(message.level, message.text, message.source);
          break;

        case 'elementInfo':
          // Could show a tooltip with element info
          break;
      }
    });

    function addConsoleEntry(level, text, source) {
      consolePanel.classList.remove('hidden');
      const entry = document.createElement('div');
      entry.className = 'console-entry console-' + level;
      entry.textContent = '[' + level.toUpperCase() + '] ' + text;
      if (source) {
        entry.title = source;
      }
      consolePanel.appendChild(entry);
      consolePanel.scrollTop = consolePanel.scrollHeight;

      // Keep only last 50 entries
      while (consolePanel.children.length > 50) {
        consolePanel.removeChild(consolePanel.firstChild);
      }
    }
  </script>
</body>
</html>`;
}

export function deactivate() {
  disconnectFromBrowser();
  if (browserPanel) {
    browserPanel.dispose();
  }
  if (bridgeServer) {
    bridgeServer.stop().catch(console.error);
  }
}
