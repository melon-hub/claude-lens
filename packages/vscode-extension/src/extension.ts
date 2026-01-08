/**
 * Claude Lens VS Code Extension
 *
 * Provides an embedded browser panel with element inspection
 * that sends context to Claude Code via MCP.
 */

import * as vscode from 'vscode';

let browserPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Lens is now active');

  // Register commands
  const openCommand = vscode.commands.registerCommand('claudeLens.open', () => {
    openBrowserPanel(context);
  });

  const connectCommand = vscode.commands.registerCommand('claudeLens.connect', async () => {
    const port = vscode.workspace.getConfiguration('claudeLens').get<number>('cdpPort', 9222);
    vscode.window.showInformationMessage(`Connecting to Chrome on port ${port}...`);
    // TODO: Implement connection
  });

  const disconnectCommand = vscode.commands.registerCommand('claudeLens.disconnect', () => {
    vscode.window.showInformationMessage('Disconnected from browser');
    // TODO: Implement disconnection
  });

  context.subscriptions.push(openCommand, connectCommand, disconnectCommand);
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
  });

  // Handle messages from webview
  browserPanel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'navigate':
          // TODO: Navigate to URL
          break;
        case 'click':
          // TODO: Handle click at coordinates
          break;
        case 'refresh':
          // TODO: Refresh page
          break;
      }
    },
    undefined,
    context.subscriptions
  );
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
    }
    .btn {
      padding: 4px 12px;
      border: none;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 4px;
      cursor: pointer;
    }
    .btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .canvas-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    #browserCanvas {
      max-width: 100%;
      max-height: 100%;
      border: 1px solid var(--vscode-panel-border);
    }
    .status-bar {
      padding: 4px 8px;
      background: var(--vscode-statusBar-background);
      color: var(--vscode-statusBar-foreground);
      font-size: 12px;
      display: flex;
      justify-content: space-between;
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
      font-size: 48px;
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
      <div>Claude Lens</div>
      <div style="font-size: 12px;">Enter a localhost URL and click Go to start</div>
      <div style="font-size: 11px; opacity: 0.7;">Ctrl+Click on elements to send to Claude</div>
    </div>
    <canvas id="browserCanvas" style="display: none;"></canvas>
  </div>

  <div class="status-bar">
    <span id="status">Disconnected</span>
    <span id="info">Week 1 - Screenshot streaming coming soon</span>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const urlInput = document.getElementById('urlInput');
    const goBtn = document.getElementById('goBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const canvas = document.getElementById('browserCanvas');
    const placeholder = document.getElementById('placeholder');
    const status = document.getElementById('status');

    goBtn.addEventListener('click', () => {
      const url = urlInput.value;
      vscode.postMessage({ command: 'navigate', url });
      status.textContent = 'Connecting...';
    });

    refreshBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'refresh' });
    });

    canvas.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        vscode.postMessage({ command: 'click', x, y });
      }
    });

    // Handle messages from extension
    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.command) {
        case 'screenshot':
          // Display screenshot on canvas
          const img = new Image();
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            canvas.style.display = 'block';
            placeholder.style.display = 'none';
          };
          img.src = 'data:image/png;base64,' + message.data;
          break;
        case 'status':
          status.textContent = message.text;
          break;
      }
    });
  </script>
</body>
</html>`;
}

export function deactivate() {
  if (browserPanel) {
    browserPanel.dispose();
  }
}
