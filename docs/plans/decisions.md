# Claude Lens - Architectural Decisions

> Consolidated from requirements gathering session

**Date:** 2025-01-08
**Status:** Ready to implement

---

## Summary of Decisions

| Area | Decision |
|------|----------|
| Browser Mode | Screenshot streaming to VS Code webview canvas |
| WSL Handling | Auto-detect + fallback to manual instructions |
| Claude Integration | Both MCP + API from start (abstracted adapter) |
| Security MVP | S-04 (secret redaction) + S-06 (localhost-only) |
| Click UX | Ctrl+Click with confirmation popup |
| Console Errors | Auto-stream all errors to Claude |
| Dev Approach | Core library first, then VS Code shell |
| Dev Tooling | pnpm + Bun for scripts, watch mode with auto-reload |
| Webview UI | Vanilla JS + Canvas (DevTools-level precision) |
| Adapter Design | Interface + implementations + event-driven middleware |
| Highlight UX | Both canvas overlay AND CDP injection |
| Testing | Unit tests for core logic only |
| Release Strategy | Fast iteration - get it working, then polish |
| Framework Detection | Nice to have (v1.5) |
| URL Scope | Localhost only |
| Multi-page | Single page mode |

---

## Core Value Proposition

**"Cursor's internal browser, but for Claude Code"**

The key differentiator is seamless integration. It must feel like a native part of Claude Code, not a separate tool. This means:

1. **Zero context switch** - Stay in VS Code, stay in the same Claude conversation
2. **Instant feedback** - Click → Claude sees it immediately
3. **Bidirectional** - Claude can point back at elements
4. **Console integration** - Errors flow to Claude automatically

**Amalgamation of tools:**
- Browser DevTools inspection
- Claude Code conversation
- Visual feedback loop
- Error debugging

All in one place, maintaining context.

---

## Timeline: Fast Iteration

**Week 1: Walking skeleton**
- [ ] Monorepo + pnpm workspace
- [ ] VS Code extension that opens webview
- [ ] CDP connection to Chrome
- [ ] Screenshot streaming to canvas
- **Deliverable:** Can see localhost in VS Code panel

**Week 2: Core interaction**
- [ ] Ctrl+Click detection on canvas
- [ ] Element inspection via CDP
- [ ] Confirmation popup
- [ ] MCP tool: `inspect_element`
- **Deliverable:** Click element → Claude receives context

**Week 3: Console + highlights**
- [ ] Console error capture
- [ ] Auto-stream to Claude
- [ ] Secret redaction
- [ ] MCP tool: `highlight_element`
- **Deliverable:** Full feedback loop working

**Week 4+: Polish as needed**
- Inspector panel details
- Better UI/UX
- Error handling
- Documentation

**Philosophy:** Ship each week's deliverable, use it yourself, improve based on real usage.

---

## WSL Compatibility Matrix

Claude Lens must work in all these scenarios:

| VS Code Context | Extension Runs In | Browser Launch | CDP Connection |
|-----------------|-------------------|----------------|----------------|
| Windows native | Windows Node.js | Direct Chrome launch | localhost:9222 |
| Remote WSL | WSL Node.js | powershell.exe → Chrome | localhost:9222 |
| WSL (code .) | WSL Node.js | powershell.exe → Chrome | localhost:9222 |

### Detection Logic

```typescript
function getExecutionContext(): 'windows' | 'wsl' | 'linux' | 'mac' {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'mac';

  // Linux - check if WSL
  try {
    const release = fs.readFileSync('/proc/version', 'utf8');
    if (release.toLowerCase().includes('microsoft')) return 'wsl';
  } catch {}

  return 'linux';
}
```

### Browser Launch by Context

```typescript
async function launchChrome(port: number = 9222): Promise<void> {
  const context = getExecutionContext();

  switch (context) {
    case 'windows':
      await spawn(getWindowsChromePath(), [
        `--remote-debugging-port=${port}`,
        '--no-first-run',
        '--no-default-browser-check'
      ]);
      break;

    case 'wsl':
      // Launch Windows Chrome from WSL
      const winChromePath = getWindowsChromePath().replace(/\//g, '\\\\');
      await spawn('powershell.exe', [
        '-Command',
        `& "${winChromePath}" --remote-debugging-port=${port} --no-first-run`
      ]);
      break;

    case 'mac':
      await spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
        `--remote-debugging-port=${port}`
      ]);
      break;

    case 'linux':
      await spawn('google-chrome', [`--remote-debugging-port=${port}`]);
      break;
  }
}

function getWindowsChromePath(): string {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of paths) {
    if (fs.existsSync(p.replace(/\\\\/g, '/'))) return p;
  }
  throw new Error('Chrome not found');
}
```

### WSL-Specific Considerations

1. **Localhost works across boundary** - WSL2 can access Windows localhost:9222
2. **File paths** - Use `wslpath` for conversion if needed
3. **powershell.exe not powershell** - Must use `.exe` suffix from WSL
4. **No display in WSL** - Cannot launch GUI apps directly, must use Windows
5. **VS Code Remote** - Extension host runs in WSL, webview renders in Windows

### Fallback Flow

```
1. Try auto-launch Chrome
   ├─ Success → Connect CDP
   └─ Fail → Show manual instructions:
      "Run in PowerShell:
       chrome.exe --remote-debugging-port=9222
       Then click 'Connect' in Claude Lens"
```

---

## Detailed Decisions

### 1. Browser Integration

**Decision:** Screenshot streaming via canvas

**Rationale:**
- VS Code webviews cannot embed browsers directly (sandboxed iframes)
- Screenshot streaming works within webview constraints
- CDP provides full control without requiring external window

**Implementation:**
```
Extension Host (Node.js)
    │
    │ CDP.Page.captureScreenshot()
    │ (continuous @ 30fps or on-demand)
    ▼
Webview Canvas
    │
    │ User clicks on canvas
    │ → coordinates mapped to page
    ▼
Extension Host → CDP.DOM.getNodeForLocation()
```

---

### 2. WSL Support

**Decision:** Auto-detect WSL, launch Windows Chrome, fallback to manual

**Implementation:**
```typescript
async function launchBrowser(): Promise<CDPConnection> {
  if (isWSL()) {
    try {
      // Try Windows Chrome via powershell
      await spawn('powershell.exe', [
        '-Command',
        `& "${getWindowsChromePath()}" --remote-debugging-port=9222`
      ]);
      return await connectCDP('localhost', 9222);
    } catch {
      // Fallback: show instructions
      showManualInstructions();
    }
  } else {
    // Native launch
    await spawn(getChromePath(), ['--remote-debugging-port=9222']);
    return await connectCDP('localhost', 9222);
  }
}
```

---

### 3. Claude Adapter Architecture

**Decision:** Interface + implementations + event middleware

**Implementation:**
```typescript
// Core interface
interface ClaudeAdapter {
  sendContext(context: InspectionContext): Promise<void>;
  onToolCall(handler: ToolCallHandler): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

// Event middleware layer
class ClaudeAdapterWithMiddleware implements ClaudeAdapter {
  constructor(
    private adapter: ClaudeAdapter,
    private middleware: Middleware[]
  ) {}

  async sendContext(context: InspectionContext) {
    let ctx = context;
    for (const mw of this.middleware) {
      ctx = await mw.beforeSend(ctx);
    }
    await this.adapter.sendContext(ctx);
    for (const mw of this.middleware) {
      await mw.afterSend(ctx);
    }
  }
}

// Implementations
class MCPAdapter implements ClaudeAdapter { /* stdio transport */ }
class APIAdapter implements ClaudeAdapter { /* direct API calls */ }

// Middleware examples
class LoggingMiddleware { /* logs all context */ }
class SecretRedactionMiddleware { /* removes secrets */ }
class CachingMiddleware { /* dedupes identical contexts */ }
```

---

### 4. Security (MVP)

**Decision:** S-04 (secret redaction) + S-06 (localhost-only)

**S-04 Implementation:**
```typescript
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,                    // OpenAI
  /ghp_[a-zA-Z0-9]{36}/g,                    // GitHub
  /AKIA[0-9A-Z]{16}/g,                       // AWS
  /(password|secret|token|api_key)\s*[:=]\s*['"][^'"]+['"]/gi,
];

function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}
```

**S-06 Implementation:**
```typescript
const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/\[::1\](:\d+)?$/,
];

function isAllowedUrl(url: string): boolean {
  const origin = new URL(url).origin;
  return ALLOWED_ORIGINS.some(p => p.test(origin));
}
```

---

### 5. Inspector UX

**Decision:** Ctrl+Click with confirmation popup

**Flow:**
```
1. User holds Ctrl, clicks element in canvas
2. CDP: DOM.getNodeForLocation(x, y)
3. Overlay popup appears showing:
   - Element preview (tag, classes, id)
   - What will be sent (selector, styles, screenshot)
   - "Send to Claude" / "Cancel" buttons
4. User confirms → context sent to Claude
```

**Why confirmation:**
- Prevents accidental sends
- User sees exactly what Claude will receive
- Builds trust in the tool

---

### 6. Console Streaming

**Decision:** Auto-stream all errors to Claude

**Implementation:**
```typescript
cdp.Runtime.on('consoleAPICalled', (params) => {
  if (params.type === 'error' || params.type === 'warning') {
    const message = formatConsoleMessage(params);
    const redacted = redactSecrets(message);
    claudeAdapter.sendContext({
      type: 'console',
      level: params.type,
      message: redacted,
      timestamp: Date.now(),
    });
  }
});
```

---

### 7. Highlight System

**Decision:** Both canvas overlay AND CDP injection

**Canvas overlay:**
```typescript
function drawHighlight(ctx: CanvasRenderingContext2D, box: BoundingBox) {
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  // Pulse animation
  animatePulse(ctx, box);
}
```

**CDP injection:**
```typescript
async function injectHighlight(selector: string) {
  await cdp.Runtime.evaluate({
    expression: `
      const el = document.querySelector('${selector}');
      if (el) {
        el.style.outline = '2px solid #3b82f6';
        el.style.outlineOffset = '2px';
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    `
  });
}
```

---

### 8. UI Precision Requirements

**Decision:** Full DevTools-level precision

**Features needed:**
- Pixel-perfect element targeting (exact bounding boxes)
- Rich inspector panel (CSS, computed styles, DOM tree)
- Visual diffing (before/after comparisons)

**Webview structure:**
```
┌────────────────────────────────────────────────────┐
│  URL Bar                              [Refresh]    │
├────────────────────────────────────────────────────┤
│                                                    │
│                                                    │
│              Canvas (screenshot)                   │
│              + hover overlay                       │
│              + click handling                      │
│                                                    │
├────────────────────────────────────────────────────┤
│  Inspector Panel (collapsible)                     │
│  ┌──────────────────────────────────────────────┐ │
│  │ Element: <button class="btn-primary">        │ │
│  │ Selector: .submit-form > button:first-child  │ │
│  │ ─────────────────────────────────────────────│ │
│  │ Computed Styles:                              │ │
│  │   display: flex                               │ │
│  │   margin: 0 8px                               │ │
│  │   ...                                         │ │
│  └──────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────┤
│  Console (collapsible)                             │
│  [Error] TypeError: Cannot read 'map' of undefined │
│  [Warn] React: Key prop missing                    │
└────────────────────────────────────────────────────┘
```

---

### 9. Project Structure (Updated)

```
claude-lens/
├── packages/
│   ├── core/                     # @claude-lens/core
│   │   ├── src/
│   │   │   ├── browser/
│   │   │   │   ├── types.ts
│   │   │   │   ├── cdp-adapter.ts
│   │   │   │   └── index.ts
│   │   │   ├── claude/
│   │   │   │   ├── types.ts
│   │   │   │   ├── mcp-adapter.ts
│   │   │   │   ├── api-adapter.ts
│   │   │   │   ├── middleware.ts
│   │   │   │   └── index.ts
│   │   │   ├── inspector/
│   │   │   │   ├── element-inspector.ts
│   │   │   │   ├── style-resolver.ts
│   │   │   │   └── index.ts
│   │   │   ├── console/
│   │   │   │   ├── console-bridge.ts
│   │   │   │   └── index.ts
│   │   │   ├── highlighter/
│   │   │   │   ├── canvas-highlighter.ts
│   │   │   │   ├── cdp-highlighter.ts
│   │   │   │   └── index.ts
│   │   │   ├── security/
│   │   │   │   ├── secret-redactor.ts
│   │   │   │   ├── url-validator.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── vscode-extension/
│   │   ├── src/
│   │   │   ├── extension.ts
│   │   │   ├── webview/
│   │   │   │   ├── main.ts          # Webview entry
│   │   │   │   ├── canvas.ts        # Screenshot rendering
│   │   │   │   ├── inspector-panel.ts
│   │   │   │   ├── console-panel.ts
│   │   │   │   └── styles.css
│   │   │   ├── browser-launcher.ts
│   │   │   └── mcp-server.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── mcp-server/                  # Standalone MCP server
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── docs/
│   └── plans/
│       ├── project-scope.md
│       ├── research-findings.md
│       └── decisions.md             # This file
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── bunfig.toml                      # Bun config for scripts
└── README.md
```

---

### 10. Development Setup

**Scripts (using Bun for speed):**
```json
{
  "scripts": {
    "dev": "bun run --filter '@claude-lens/*' dev",
    "build": "bun run --filter '@claude-lens/*' build",
    "test": "bun test",
    "lint": "eslint packages/*/src",
    "typecheck": "tsc --noEmit"
  }
}
```

**VS Code Extension Dev:**
```json
{
  "scripts": {
    "dev": "bun run watch",
    "watch": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --platform=node --watch",
    "package": "vsce package"
  }
}
```

---

## Next Steps

1. **Initialize monorepo** with pnpm workspace
2. **Create @claude-lens/core** package structure
3. **Implement security module** (S-04, S-06) first
4. **Build CDP adapter** with basic navigation + screenshot
5. **Create VS Code extension** scaffold with webview
6. **Wire up screenshot streaming** to canvas
7. **Add click handling** with confirmation popup
8. **Implement MCP tools** (inspect, console, highlight)
9. **Test with real localhost app**
10. **Polish and document**

---

*Decisions captured from requirements session with user*
