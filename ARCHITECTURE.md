# Claude Lens Architecture

This document describes the high-level architecture of Claude Lens, a visual web development companion for Claude Code.

## System Overview

Claude Lens enables AI-assisted web development by giving Claude visibility into a running web application. Users can see their localhost app, click elements to select them, and have Claude understand the visual context.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Claude Lens                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐    │
│  │   Desktop    │     │   VS Code    │     │   MCP Server     │    │
│  │    App       │     │  Extension   │     │   (standalone)   │    │
│  │  (Electron)  │     │              │     │                  │    │
│  └──────┬───────┘     └──────┬───────┘     └────────┬─────────┘    │
│         │                    │                       │              │
│         └────────────┬───────┘                       │              │
│                      │                               │              │
│                      ▼                               │              │
│           ┌──────────────────┐                       │              │
│           │   @claude-lens   │                       │              │
│           │      /core       │◄──────────────────────┘              │
│           │                  │      HTTP Bridge                     │
│           └────────┬─────────┘         :9333                        │
│                    │                                                │
│                    │ CDP (Chrome DevTools Protocol)                 │
│                    ▼                                                │
│           ┌──────────────────┐                                      │
│           │  Chrome Browser  │                                      │
│           │   (localhost)    │                                      │
│           └──────────────────┘                                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Package Structure

```
packages/
├── core/                 # Shared library (UI-agnostic)
│   ├── browser/         # CDP adapter, launcher, types
│   ├── bridge/          # HTTP IPC server/client
│   ├── security/        # URL validation, secret redaction
│   ├── inspector/       # Element inspection logic
│   ├── highlighter/     # Visual highlighting
│   └── console/         # Console log capture
│
├── desktop/             # Electron desktop app
│   ├── main/           # Electron main process
│   └── renderer/       # UI (BrowserView + Terminal)
│       ├── utils/      # DOM utilities, debounce, fonts
│       ├── state/      # Centralized state management
│       ├── terminal/   # Terminal config and substitution
│       ├── panels/     # Panel UI helpers
│       ├── components/ # Status bar utilities
│       ├── handlers/   # Navigation utilities
│       └── __tests__/  # Unit tests (87 tests)
│
├── vscode-extension/    # VS Code extension
│   └── src/            # Extension + Webview
│
└── mcp-server/          # Standalone MCP server
    └── src/            # Tool handlers
```

### Dependency Graph

```
desktop ──────────┐
                  ├──→ core
vscode-extension ─┘

mcp-server ───────────→ core (via HTTP bridge)
```

**Key Constraint:** The `core` package must remain UI-agnostic. No Electron, VS Code, or framework-specific dependencies.

## Communication Architecture

### The Bridge Pattern

The MCP server runs as a separate process from the UI host. They communicate via an HTTP bridge:

```
┌─────────────┐         stdio          ┌─────────────┐
│ Claude Code │ ◄─────────────────────►│ MCP Server  │
│  (client)   │          MCP           │  (tools)    │
└─────────────┘                        └──────┬──────┘
                                              │
                                         HTTP │ :9333
                                              │
                                       ┌──────▼──────┐
                                       │ Bridge      │
                                       │ Server      │
                                       │ (in host)   │
                                       └──────┬──────┘
                                              │
                                          CDP │ :9222
                                              │
                                       ┌──────▼──────┐
                                       │   Chrome    │
                                       └─────────────┘
```

**Why HTTP instead of direct IPC?**
- MCP servers run in isolated processes (spawned by Claude Code)
- Cannot share memory or direct IPC with the extension
- HTTP is simple, debuggable, and works across process boundaries
- Localhost-only binding ensures security

### Chrome DevTools Protocol (CDP) + Playwright

Claude Lens uses Playwright connected via CDP to Electron's embedded browser:

| Layer | Purpose |
|-------|---------|
| **Electron BrowserView** | Embedded browser the user sees |
| **CDP (:9222)** | Debug protocol exposed by Chromium |
| **Playwright** | High-level automation API connected via `connectOverCDP()` |
| **MCP Tools** | 25+ tools exposed to Claude Code |

This architecture provides:
- DOM inspection with computed styles and accessibility tree
- Full automation: click, fill, type, hover, drag, scroll, keyboard
- JavaScript execution
- Console message interception
- Screenshot capture (viewport or element)
- Dialog handling (alert, confirm, prompt)

## Data Flow Examples

### User Clicks Element

```
1. User Ctrl+Clicks element in embedded browser
2. Canvas click event captured in webview
3. Coordinates mapped to page (accounting for scroll/zoom)
4. CDPAdapter.inspectElementAtPoint(x, y) called
5. CDP DOM.getNodeForLocation → nodeId
6. CDP CSS.getComputedStylesForNode → styles
7. ElementInfo constructed and stored
8. Confirmation dialog shown to user
9. User clicks "Send to Claude"
10. (User types message in Claude Code)
11. Claude calls claude_lens/inspect_element
12. MCP server → Bridge → returns stored ElementInfo
```

### Claude Takes Screenshot

```
1. Claude calls claude_lens/screenshot tool
2. MCP server sends POST /screenshot to bridge
3. Bridge server calls PlaywrightAdapter.screenshot()
4. Playwright page.screenshot() → base64 PNG
5. Response flows back: Bridge → MCP → Claude
6. Claude "sees" the image via MCP image content
```

### Claude Fills a Form (Automation)

```
1. Claude calls claude_lens/fill { selector: "#email", value: "test@example.com" }
2. MCP server sends POST /fill to bridge
3. Bridge server calls PlaywrightAdapter.fill()
4. Playwright page.fill("#email", "test@example.com")
   - Waits for element (5s timeout)
   - Clears existing value
   - Types new value
   - Dispatches input/change events (React-compatible)
5. Response: "Filled email field with 'test@example.com'"
6. User sees the form field filled in the embedded browser
```

## Security Model

### Localhost Restriction

All navigation is restricted to localhost URLs:

```typescript
// Allowed
isAllowedUrl('http://localhost:3000')     // true
isAllowedUrl('http://127.0.0.1:8080')     // true
isAllowedUrl('http://[::1]:3000')         // true

// Blocked
isAllowedUrl('https://example.com')       // false
isAllowedUrl('file:///etc/passwd')        // false
```

This prevents Claude from:
- Navigating to arbitrary websites
- Accessing local files
- Exfiltrating data

### Secret Redaction

Console output is sanitized before exposure:

```typescript
const raw = "API_KEY=sk-1234567890abcdef";
const { text, redactedCount } = redactSecrets(raw);
// text = "API_KEY=[REDACTED]"
// redactedCount = 1
```

Detected patterns:
- API keys (sk-*, key_*, api_*)
- Bearer tokens
- Basic auth headers
- Common secret formats

### Input Validation

All MCP tool inputs are validated with Zod schemas:

```typescript
const NavigateSchema = z.object({
  url: z.string().describe('URL to navigate to (must be localhost)'),
});

// In handler
const { url } = NavigateSchema.parse(args);
if (!isAllowedUrl(url)) {
  return { isError: true, ... };
}
```

## Design Decisions

### Why Embedded Browser?

| Option | Verdict | Reasoning |
|--------|---------|-----------|
| External Chrome | Rejected | Requires user to position windows, alt-tab friction |
| Embedded BrowserView | Chosen | Seamless integration, visible alongside code |
| iframe | Rejected | Security restrictions, limited access |

### Why Playwright (via CDP)?

**Update (v0.2.1):** We now use Playwright connected via CDP to Electron's embedded browser.

| Approach | Verdict | Reasoning |
|----------|---------|-----------|
| Raw CDP only | Rejected | Too low-level, would require reimplementing Playwright |
| Playwright (launch) | Rejected | Creates separate browser, not embedded |
| **Playwright (CDP connect)** | **Chosen** | Best of both worlds |

How it works:
```
Electron BrowserView
        │
        ▼ (--remote-debugging-port=9222)
   CDP Endpoint
        │
        ▼ (playwright.chromium.connectOverCDP)
  Playwright Page
        │
        ▼ (page.click, page.fill, page.screenshot, etc.)
   25+ MCP Tools
```

Benefits:
- **Full automation API:** click, fill, type, hover, drag, scroll, keyboard
- **Embedded browser:** Playwright controls the same BrowserView user sees
- **DOM inspection:** Access computed styles, accessibility tree
- **Reliable selectors:** Playwright's smart waiting and retry logic
- **5s default timeout:** Fast failure feedback instead of 30s waits

### Why TypeScript Strict Mode?

- Catches null/undefined errors at compile time
- Better IDE support and autocomplete
- Self-documenting type signatures
- Required for reliable MCP tool definitions

## Extension Points

### Adding New MCP Tools

1. Add Zod schema in `mcp-server/src/index.ts`
2. Add tool definition to `ListToolsRequestSchema` handler
3. Add case in `CallToolRequestSchema` handler
4. Implement in BridgeClient/BridgeServer if needed

### Adding New Browser Adapters

1. Implement `BrowserAdapter` interface from `core/browser/types.ts`
2. Handle all lifecycle and inspection methods
3. Integrate with host (Electron, VS Code, etc.)

### Supporting New Frameworks

The inspector can detect React, Vue, Svelte components:

```typescript
// In inspector module
export function detectFramework(element: Element): FrameworkInfo {
  if (element._reactFiber) return { name: 'react', ... };
  if (element.__vue__) return { name: 'vue', ... };
  // etc.
}
```

Add detection logic for new frameworks as needed.

## Future Considerations

### Potential Enhancements

- **Network monitoring:** Capture API requests/responses
- **Performance profiling:** Lighthouse integration
- **Hot reload detection:** Know when code changes apply
- **Multi-tab support:** Work with multiple localhost apps
- **Remote debugging:** Connect to mobile devices

### Known Limitations

- **Single page focus:** Only one page visible at a time
- **No file access:** Cannot read source files directly
- **Memory usage:** Screenshot and console buffers grow unbounded
- **Platform quirks:** WSL Chrome launching requires special handling
