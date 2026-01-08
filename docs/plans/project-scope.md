# Claude Lens - Project Scope

> Visual web development companion for Claude Code

**Version:** 1.0
**Created:** 2025-01-07
**Status:** Ready for development

---

## Executive Summary

Claude Lens is a visual web development tool that bridges the gap between browser-based UI work and AI-assisted coding. It provides an embedded browser with element inspection capabilities that maintains session context with Claude Code through MCP (Model Context Protocol), enabling intuitive "point and describe" development workflows.

**Key Differentiator:** Unlike React Grab (spawns new sessions) or Playwright MCP (programmatic, not visual), Claude Lens provides a seamless visual feedback loop within a single Claude Code session.

**Estimated MVP Timeline:** 4-6 weeks

---

## Problem Statement

### Current Pain Points

1. **Context Fragmentation**: Tools like React Grab spawn new Claude sessions, losing valuable conversation context and requiring users to re-explain their project state.

2. **Programmatic vs Visual**: Tools like Chrome DevTools MCP and Playwright MCP require developers to think in selectors and code rather than pointing at visual elements.

3. **Tool Sprawl**: Developers juggle multiple disconnected tools:
   - Browser DevTools for inspection
   - Terminal for Claude Code
   - Separate windows for preview
   - Manual copy-paste of error messages

4. **Feedback Loop Latency**: The cycle of "see issue → describe to AI → get fix → verify" involves too much manual context transfer.

### User Stories

- *"I can see the button is misaligned, but describing it to Claude requires me to find the component, explain the layout, and hope Claude understands what I mean."*
- *"When my app throws a console error, I have to copy it, switch to Claude, paste it, and explain what I was doing."*
- *"I want to say 'make this card look like that card' while pointing at both."*

---

## Proposed Solution

### High-Level Architecture (Flexible)

```
┌─────────────────────────────────────────────────────────────┐
│                      UI Shells (thin)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  VS Code    │  │  Electron   │  │  Headless/CLI       │ │
│  │  Extension  │  │  Standalone │  │  (future)           │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
└─────────┼────────────────┼────────────────────┼─────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    @claude-lens/core                        │
│  ┌────────────────────────────────────────────────────────┐│
│  │  Inspector | Console Bridge | Highlighter | State Mgmt ││
│  └────────────────────────────────────────────────────────┘│
└────────────┬────────────────────────────────┬───────────────┘
             │                                │
             ▼                                ▼
┌────────────────────────┐      ┌─────────────────────────────┐
│   Browser Adapters     │      │    Claude Adapters          │
│ ┌────────────────────┐ │      │ ┌─────────────────────────┐ │
│ │ EmbeddedElectron   │ │      │ │ MCP (stdio) - CC native │ │
│ ├────────────────────┤ │      │ ├─────────────────────────┤ │
│ │ ExternalChrome     │ │      │ │ Claude API (direct)     │ │
│ │ (CDP over ws://)   │ │      │ ├─────────────────────────┤ │
│ ├────────────────────┤ │      │ │ WebSocket bridge        │ │
│ │ ExternalFirefox    │ │      │ │ (for web UI future)     │ │
│ └────────────────────┘ │      │ └─────────────────────────┘ │
└────────────────────────┘      └─────────────────────────────┘
```

### Deployment Modes

| Mode | Browser | Claude Connection | Use Case |
|------|---------|-------------------|----------|
| **VS Code Extension** | Embedded Electron | MCP (stdio) | Primary dev workflow |
| **Standalone + Embedded** | Electron window | Claude API | Users without VS Code |
| **Standalone + External Browser** | Chrome via CDP | Claude API | Use existing browser session |
| **Headless** | Puppeteer/Playwright | MCP or API | CI/automated testing |

### Data Flow

```
User clicks element
        │
        ▼
Inspector captures:
- DOM path/selector
- Computed styles
- Bounding box
- Screenshot region
- Component source (if React/Vue)
        │
        ▼
MCP Tool: claude_lens/inspect_element
        │
        ▼
Claude Code receives context
(same session, full history preserved)
        │
        ▼
Claude suggests change
        │
        ▼
MCP Tool: claude_lens/highlight_element
        │
        ▼
User sees highlighted preview
```

---

## Tech Stack

### Primary: VS Code Extension + Electron Webview

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Host** | VS Code Extension | Already where devs work; Claude Code integration path exists |
| **Browser** | Electron BrowserView | Full CDP access; can render any localhost app |
| **Protocol** | Chrome DevTools Protocol (CDP) | Industry standard; rich inspection APIs |
| **MCP Server** | TypeScript, stdio transport | Matches Claude Code's native protocol |
| **State** | In-memory with optional persistence | Fast; no external dependencies |

### Why Not Alternatives?

| Alternative | Reason Against |
|-------------|----------------|
| **Standalone Electron App** | Context switch from VS Code; but supported as secondary mode |
| **Chrome Extension Only** | Limited to Chrome; can't embed in VS Code; security restrictions |
| **Pure Web App** | Can't access localhost reliably; no CDP access |
| **Fork Browser MCP** | Playwright-focused; would need major refactor for visual UX |

### Key Dependencies

```json
{
  "dependencies": {
    "electron": "^28.0.0",
    "chrome-remote-interface": "^0.33.0",
    "@anthropic-ai/sdk": "^0.30.0",
    "ws": "^8.0.0"
  },
  "vscode": "^1.85.0"
}
```

---

## Project Structure

```
claude-lens/
├── packages/
│   ├── core/                     # @claude-lens/core
│   │   ├── src/
│   │   │   ├── browser/          # Browser adapter interface + implementations
│   │   │   │   ├── types.ts
│   │   │   │   ├── electron-adapter.ts
│   │   │   │   ├── cdp-adapter.ts
│   │   │   │   └── index.ts
│   │   │   ├── claude/           # Claude adapter interface + implementations
│   │   │   │   ├── types.ts
│   │   │   │   ├── mcp-adapter.ts
│   │   │   │   ├── api-adapter.ts
│   │   │   │   └── index.ts
│   │   │   ├── inspector/        # DOM inspection logic
│   │   │   ├── console/          # Console capture logic
│   │   │   ├── highlighter/      # Element highlighting
│   │   │   └── state/            # Session state management
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── vscode-extension/         # VS Code extension shell
│   │   ├── src/
│   │   │   ├── extension.ts
│   │   │   ├── webview/
│   │   │   └── mcp-server.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── electron-app/             # Standalone Electron app
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── renderer/
│   │   │   └── preload.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── mcp-server/               # Standalone MCP server
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── docs/
│   └── plans/
│       └── project-scope.md      # This file
│
├── package.json                  # Workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

---

## Feature Breakdown

### MVP (v1.0) - 4-6 Weeks

| Feature | Description | Priority |
|---------|-------------|----------|
| **Core Library** | Browser + Claude adapter interfaces | P0 |
| **Embedded Browser** | Render localhost URLs in VS Code panel | P0 |
| **Basic Inspector** | Click element → get selector + styles + screenshot | P0 |
| **Console Streaming** | Auto-forward errors/warnings to Claude | P0 |
| **MCP Integration** | 3 core tools (inspect, console, navigate) | P0 |
| **Element Highlight** | Claude can highlight elements back | P1 |
| **URL Bar** | Navigate to different localhost ports | P1 |
| **Refresh Control** | Manual and auto-refresh on file save | P1 |

### v1.5 - Additional 3-4 Weeks

| Feature | Description | Priority |
|---------|-------------|----------|
| **Standalone Electron App** | Run without VS Code | P1 |
| **External Browser Connection** | Connect to existing Chrome | P1 |
| **React/Vue DevTools** | Component tree, props, state inspection | P2 |
| **Visual Diff** | Before/after comparison mode | P2 |
| **Multi-element Select** | "Make this look like that" workflow | P2 |
| **Responsive Testing** | Quick viewport size presets | P2 |
| **Network Panel** | Failed requests auto-reported | P2 |

### v2.0 - Future

| Feature | Description | Priority |
|---------|-------------|----------|
| **Flow Recording** | Record user flows for testing context | P3 |
| **Visual Regression** | Screenshot comparison on changes | P3 |
| **Remote URL Support** | Staging/preview environments (with auth) | P3 |
| **Collaborative Pointers** | Multi-user pointing for pair programming | P3 |
| **AI Suggestions** | Proactive "I notice this element..." | P3 |

---

## MCP Tool Specifications

### Tool 1: `claude_lens/inspect_element`

**Purpose:** User clicks element, sends rich context to Claude.

```typescript
interface InspectElementParams {
  // Automatically populated from user click
}

interface InspectElementResult {
  selector: string;           // Unique CSS selector
  xpath: string;              // XPath alternative
  tagName: string;            // e.g., "button"
  id?: string;
  classes: string[];
  attributes: Record<string, string>;
  computedStyles: {
    display: string;
    position: string;
    width: string;
    height: string;
    margin: string;
    padding: string;
    color: string;
    backgroundColor: string;
    fontSize: string;
    fontFamily: string;
  };
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  innerText?: string;          // Truncated if long
  innerHTML?: string;          // Truncated if long
  screenshot?: string;         // Base64 PNG of element region
  sourceFile?: string;         // If React/Vue, the component file
  sourceLine?: number;
  parentChain: string[];       // Ancestor selectors for context
  siblingCount: number;
  childCount: number;
}
```

### Tool 2: `claude_lens/get_console`

**Purpose:** Retrieve recent console messages.

```typescript
interface GetConsoleParams {
  level?: 'all' | 'error' | 'warn' | 'log';
  limit?: number;  // Default 20
  since?: number;  // Timestamp, for incremental
}

interface GetConsoleResult {
  messages: Array<{
    level: 'error' | 'warn' | 'log' | 'info' | 'debug';
    text: string;
    source: string;      // URL
    line?: number;
    column?: number;
    timestamp: number;
    stackTrace?: string; // For errors
  }>;
  hasMore: boolean;
}
```

### Tool 3: `claude_lens/navigate`

**Purpose:** Change the browser URL.

```typescript
interface NavigateParams {
  url: string;              // Must be localhost or allowed origin
  waitFor?: 'load' | 'domcontentloaded' | 'networkidle';
}

interface NavigateResult {
  success: boolean;
  finalUrl: string;
  title: string;
  loadTime: number;
}
```

### Tool 4: `claude_lens/highlight_element`

**Purpose:** Claude highlights element to user.

```typescript
interface HighlightElementParams {
  selector: string;
  style?: 'outline' | 'overlay' | 'pulse';
  color?: string;           // Default: blue
  duration?: number;        // ms, 0 = until cleared
  label?: string;           // Text label next to element
}

interface HighlightElementResult {
  success: boolean;
  found: boolean;
  matchCount: number;       // If selector matches multiple
}
```

### Tool 5: `claude_lens/screenshot`

**Purpose:** Capture current viewport or element.

```typescript
interface ScreenshotParams {
  selector?: string;        // If omitted, full viewport
  format?: 'png' | 'jpeg';
  quality?: number;         // 0-100 for jpeg
}

interface ScreenshotResult {
  image: string;            // Base64
  width: number;
  height: number;
}
```

### Tool 6: `claude_lens/execute_script`

**Purpose:** Run JavaScript in page context (for advanced inspection).

```typescript
interface ExecuteScriptParams {
  script: string;
  // Security: Only allowed for localhost origins
}

interface ExecuteScriptResult {
  result: unknown;          // JSON-serializable result
  error?: string;
}
```

---

## Core Interfaces

### Browser Adapter

```typescript
interface BrowserAdapter {
  // Lifecycle
  connect(target: string): Promise<void>;
  disconnect(): Promise<void>;

  // Navigation
  navigate(url: string, options?: NavigateOptions): Promise<NavigateResult>;
  reload(): Promise<void>;
  getCurrentUrl(): string;

  // Inspection
  inspectElement(selector: string): Promise<ElementInfo>;
  inspectElementAtPoint(x: number, y: number): Promise<ElementInfo>;
  getElementBySelector(selector: string): Promise<ElementInfo | null>;

  // Highlighting
  highlight(selector: string, options?: HighlightOptions): Promise<void>;
  clearHighlights(): Promise<void>;

  // Screenshots
  screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  screenshotElement(selector: string): Promise<Buffer>;

  // Console
  onConsoleMessage(callback: (msg: ConsoleMessage) => void): void;
  getConsoleLogs(options?: ConsoleLogOptions): Promise<ConsoleMessage[]>;

  // Scripts
  executeScript<T>(script: string): Promise<T>;

  // Events
  onNavigate(callback: (url: string) => void): void;
  onLoad(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
}
```

### Claude Adapter

```typescript
interface ClaudeAdapter {
  // Send context to Claude (for auto-streaming console, etc.)
  sendContext(context: InspectionContext): Promise<void>;

  // Handle incoming tool calls from Claude
  onToolCall(callback: (tool: string, params: unknown) => Promise<unknown>): void;

  // For MCP: register available tools
  registerTools(tools: ToolDefinition[]): void;

  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}
```

---

## Security Considerations

### Threat Model

| Threat | Risk Level | Mitigation |
|--------|------------|------------|
| **Arbitrary URL access** | HIGH | Allowlist localhost + explicit user-approved origins |
| **Script injection** | HIGH | CSP in webview; sanitize all MCP inputs |
| **Credential exposure** | MEDIUM | Never capture/log auth headers; redact in console |
| **Path traversal** | MEDIUM | Validate all file paths; stay within workspace |
| **XSS via inspector** | MEDIUM | Sanitize innerHTML before display; use textContent |
| **MCP command injection** | MEDIUM | Validate all tool parameters; use TypeScript strict |

### Security Implementation

```typescript
// URL Allowlist
const ALLOWED_ORIGINS = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^http:\/\/\[::1\](:\d+)?$/,
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_ORIGINS.some(pattern => pattern.test(parsed.origin));
  } catch {
    return false;
  }
}
```

### Data Handling

1. **No persistent storage of page content** - All inspection data is ephemeral
2. **Console logs sanitized** - Detect and redact common secret patterns
3. **Screenshots optional** - User can disable screenshot capture
4. **MCP transport security** - stdio only (no network exposure)

---

## Risks and Mitigations

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Electron in VS Code webview complexity** | HIGH | HIGH | Start with simpler iframe approach; escalate to Electron only if needed |
| **CDP API instability** | MEDIUM | MEDIUM | Pin Chrome/Electron version; abstract CDP calls |
| **MCP protocol changes** | LOW | HIGH | Follow Anthropic's MCP spec closely; version the protocol |
| **Performance with large DOMs** | MEDIUM | MEDIUM | Lazy load; paginate inspector results; debounce |
| **React DevTools integration complexity** | HIGH | MEDIUM | Make it v1.5 feature; start with DOM-only |

### Dependency Risks

| Risk | Mitigation |
|------|------------|
| **Claude Code MCP interface changes** | Abstract MCP layer; don't depend on internals |
| **VS Code webview limitations** | Prototype early; have Electron standalone as fallback |
| **Electron security updates** | Use latest stable; automate updates |

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

- [ ] Monorepo scaffold with pnpm workspaces
- [ ] Core package with browser/claude adapter interfaces
- [ ] VS Code extension scaffold with webview
- [ ] Basic Electron BrowserView integration
- [ ] CDP connection to embedded browser
- [ ] Simple URL navigation

**Deliverable:** Can open localhost URL in VS Code panel

### Phase 2: Inspection (Week 2-3)

- [ ] Click-to-inspect overlay
- [ ] Element data extraction (selector, styles, bbox)
- [ ] Screenshot capture
- [ ] `inspect_element` MCP tool
- [ ] `highlight_element` MCP tool

**Deliverable:** Click element → data appears in Claude conversation

### Phase 3: Console Integration (Week 3-4)

- [ ] CDP console message capture
- [ ] Error/warning filtering
- [ ] Auto-stream to Claude (configurable)
- [ ] `get_console` MCP tool
- [ ] Secret redaction

**Deliverable:** Console errors auto-appear in Claude context

### Phase 4: Polish & Integration (Week 4-6)

- [ ] Settings UI (URL allowlist, auto-refresh, etc.)
- [ ] Keyboard shortcuts
- [ ] Error handling and recovery
- [ ] Documentation
- [ ] Testing (manual + automated)
- [ ] VS Code marketplace prep

**Deliverable:** Publishable v1.0

---

## Sample User Workflows

### Workflow 1: Fix Misaligned Button

```
1. User opens Claude Lens, navigates to localhost:3000
2. User clicks misaligned button
3. Inspector overlay appears, user confirms selection
4. Claude receives:
   - Button selector: ".submit-btn"
   - Current styles: margin-left: 20px, position: relative
   - Screenshot of button and surrounding area
   - Parent container context
5. User says: "This button should be centered"
6. Claude suggests CSS fix
7. User applies fix
8. Claude Lens auto-refreshes
9. Claude highlights the fixed button: "Is this what you wanted?"
```

### Workflow 2: Debug Console Error

```
1. User interacts with app, triggers error
2. Console shows: "TypeError: Cannot read property 'map' of undefined"
3. Claude Lens auto-sends to Claude:
   - Error message
   - Stack trace
   - Source file and line
   - Recent user actions (if tracking enabled)
4. Claude: "The error is in UserList.tsx:42. The 'users' prop is undefined
   on initial render. Here's a fix..."
```

### Workflow 3: "Make This Look Like That"

```
1. User clicks "Reference Card" element
2. User Ctrl+clicks "Target Card" element
3. Claude receives both elements' styles
4. User: "Make the target card match the reference"
5. Claude diffs styles, suggests changes
6. User applies
7. Claude Lens shows before/after comparison
```

---

## Next Steps

### Immediate

1. [ ] Initialize monorepo structure
2. [ ] Prototype VS Code webview + Electron BrowserView
3. [ ] Test CDP integration with basic page
4. [ ] Build minimal MCP server skeleton

### Before v1.0

1. [ ] Lock MVP feature scope
2. [ ] Set up CI/CD pipeline
3. [ ] Decide on licensing (MIT recommended for adoption)
4. [ ] Create README with clear value proposition

### Architecture Decisions Needed

1. **Webview approach:** Pure iframe vs Electron BrowserView?
2. **State management:** In-memory only vs persistent session state?
3. **Multi-window support:** Single browser vs multiple tabs?

---

## Appendix: Competitive Analysis

| Tool | Focus | Gap for Claude Lens |
|------|-------|---------------------|
| **Browser MCP** | Playwright automation | Not visual; testing-focused |
| **Chrome DevTools MCP** | Programmatic DevTools | No visual UX; selector-based |
| **React Grab** | Component extraction | Spawns new sessions |
| **UI Selector MCP** | Element selection | Unknown UX quality; worth testing |
| **Cursor Visual Editor** | Full visual editing | Proprietary to Cursor |

---

*Document generated with Claude Code + Vibe Guardian orchestration*
