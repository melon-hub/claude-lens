# Claude Lens Research Findings

> Consolidated findings from 5 specialized research agents

**Research Date:** 2025-01-07

---

## Critical Architectural Findings

### 1. VS Code Webview Cannot Embed Browser

**Source:** Architecture Agent + CDP Agent

**Finding:** VS Code webviews are sandboxed iframes without access to Electron APIs. You CANNOT:
- Use BrowserView/WebContentsView inside a webview
- Get CDP access from inside a webview
- Control external websites from a webview

**Required Architecture:**
```
Extension Host (Node.js)     Webview (Display Only)
         │                           │
         │ CDP (WebSocket)           │ Screenshots
         ▼                           ▼
   Chrome Process ──────────────> Canvas Display
```

### 2. BrowserView is DEPRECATED

**Source:** CDP Agent

**Finding:** Electron 30+ deprecates BrowserView. Must use WebContentsView instead.

```javascript
// OLD (deprecated)
const view = new BrowserView();

// NEW
const view = new WebContentsView();
mainWindow.contentView.addChildView(view);
```

### 3. WSL Requires Windows Browser

**Source:** MCP Agent + Architecture Agent

**Finding:** WSL cannot directly access Windows display. Must launch Windows Chrome via powershell.exe:

```typescript
// From WSL, launch Windows Chrome
spawn('powershell.exe', [
  '-Command',
  `& 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' --remote-debugging-port=9222`
]);

// Connect via CDP (works across WSL/Windows boundary)
const client = await CDP({ port: 9222 });
```

---

## MCP Implementation Requirements

### Must Do

| Requirement | Reason |
|-------------|--------|
| Use `console.error` for logging | stdout breaks stdio transport |
| Return errors via `{ isError: true }` | Never throw exceptions |
| Validate ALL inputs with Zod | Prevent injection attacks |
| Use stdio transport | Native Claude Code support |

### Anti-Patterns to Avoid

```typescript
// BAD: Throws crash the server
throw new Error("Something went wrong");

// GOOD: Return error in MCP format
return {
  content: [{ type: "text", text: "Error: Something went wrong" }],
  isError: true
};

// BAD: Logging to stdout
console.log("Debug info");  // Breaks stdio!

// GOOD: Use stderr
console.error("Debug info");
```

### Long-Running Operations Pattern

```typescript
// For operations like "wait for user to click element"
// Return immediately with tracking ID, poll for status

server.tool("wait-for-click", schema, async ({ selector }) => {
  const operationId = crypto.randomUUID();
  this.startMonitoring(operationId, selector);  // Async, don't await
  return {
    content: [{
      type: "text",
      text: `Waiting for click. Check status with ID: ${operationId}`
    }]
  };
});

server.tool("check-operation", schema, async ({ operationId }) => {
  return { content: [{ type: "text", text: JSON.stringify(this.getStatus(operationId)) }] };
});
```

---

## Competitive Gap Analysis

### Our Unique Opportunity

**Source:** Similar Tools Agent

**No existing tool maintains conversation context while allowing repeated element selections.**

| Tool | Element Selection | Context Persistence |
|------|-------------------|---------------------|
| React Grab | ✅ | ❌ Spawns new session |
| browser-use | ✅ | ❌ Per-task only |
| Playwright MCP | ❌ (selector-based) | ✅ |
| Chrome DevTools MCP | ❌ (programmatic) | ✅ |
| **Claude Lens** | ✅ | ✅ **Both!** |

### Ideas Worth Stealing

| From | Idea | How to Use |
|------|------|-----------|
| click-to-component | `__source` prop injection | Map DOM → source file:line |
| browser-use | Element indexing with numbered bounding boxes | Visual element targeting |
| Stagehand | Robust selector generation | Repeatable interactions |
| react-scan | React fiber traversal | Component boundary detection |

---

## Security Requirements

### CRITICAL (MVP Blockers)

| ID | Requirement | Attack Prevented |
|----|-------------|------------------|
| S-01 | Strict CSP in webviews | XSS |
| S-02 | Zod validation on ALL MCP params | Injection |
| S-03 | Sanitize DOM before display | Stored XSS |
| S-04 | Redact secrets in console logs | Credential exposure |
| S-05 | Path traversal validation | File access |
| S-06 | Localhost-only default | Malicious pages |
| S-07 | Isolated script execution | Privilege escalation |
| S-08 | User confirmation for screenshots | Data capture |

### Secret Detection Patterns

```javascript
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,                    // OpenAI
  /ghp_[a-zA-Z0-9]{36}/g,                    // GitHub PAT
  /AKIA[0-9A-Z]{16}/g,                       // AWS
  /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,  // JWT
  /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/g,       // MongoDB
  /(password|secret|token|api_key)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
];
```

### Webview CSP

```typescript
const csp = [
  `default-src 'none'`,
  `style-src ${webview.cspSource} 'unsafe-inline'`,
  `script-src 'nonce-${nonce}'`,
  `img-src ${webview.cspSource} data:`,
  `connect-src 'none'`,
  `frame-src 'none'`,
].join('; ');
```

---

## CDP Stability Issues

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Target closed" | Page navigated/closed during operation | Check `page.isClosed()`, wrap in try-catch |
| "Session closed" | Browser crashed | Implement reconnection logic |
| "Execution context destroyed" | Page navigated mid-evaluation | Use `waitForNavigation()` properly |
| Navigation timeout | Slow page | Use `domcontentloaded` instead of `networkidle` |

### Recommended Pattern

```typescript
async function safeCdpCall(page, method, params) {
  if (page.isClosed()) {
    throw new Error('Page is closed');
  }
  try {
    return await page.client.send(method, params);
  } catch (err) {
    if (err.message.includes('Target closed')) {
      return null;  // Expected, don't crash
    }
    throw err;
  }
}
```

---

## Race Conditions to Handle

### 1. User Click During Claude Action

```
t=0:    Claude starts Page.click(x, y)
t=50ms: User clicks different element
t=100ms: Claude's click completes
t=150ms: User's click processed
Result: Unexpected behavior
```

**Solution:** Action locking

```typescript
class ActionLock {
  private locked = false;
  async acquire<T>(action: () => Promise<T>): Promise<T> {
    if (this.locked) {
      throw new Error('Action in progress');
    }
    this.locked = true;
    try {
      return await action();
    } finally {
      this.locked = false;
    }
  }
}
```

### 2. Navigation During DOM Query

```
t=0:    Query DOM for element
t=50ms: Page navigates
t=100ms: Try to click element from old page
Result: "Element not found"
```

**Solution:** Verify frame ID before action

```typescript
const { frameId } = await Page.getFrameTree();
// ... find element ...
const { frameId: currentFrameId } = await Page.getFrameTree();
if (frameId !== currentFrameId) {
  throw new Error('Navigation occurred');
}
```

---

## Revised Architecture

Based on all research, the recommended architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                         VS Code                                 │
│  ┌────────────────────┐      ┌──────────────────────────────┐  │
│  │  Extension Host    │      │       Webview Panel          │  │
│  │  (Node.js)         │      │  ┌────────────────────────┐  │  │
│  │                    │      │  │   Canvas (screenshots) │  │  │
│  │  - CDP Client      │─────▶│  │   + Input capture      │  │  │
│  │  - MCP Server      │      │  │   + Overlay controls   │  │  │
│  │  - State Machine   │◀─────│  │   + Claude status      │  │  │
│  │  - Action Queue    │      │  └────────────────────────┘  │  │
│  └─────────┬──────────┘      └──────────────────────────────┘  │
└────────────┼────────────────────────────────────────────────────┘
             │ CDP (WebSocket)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Chrome/Chromium Process                      │
│                (--remote-debugging-port=9222)                   │
│                                                                 │
│  - Can be visible window (user sees real browser)               │
│  - Or headless (screenshot-only mode)                           │
└─────────────────────────────────────────────────────────────────┘

On WSL: Chrome launched via powershell.exe, CDP connects over localhost
```

---

## Updated Implementation Phases

### Phase 0: Security Foundation (Before Features)

```typescript
// Create these FIRST:
/src/security/
  ├── mcp-validator.ts      // Zod schemas for all tools
  ├── dom-sanitizer.ts      // XSS prevention
  ├── secret-redactor.ts    // Console log cleaning
  ├── path-validator.ts     // Traversal prevention
  └── csp.ts                // Webview CSP
```

### Phase 1: Core + CDP (Week 1-2)

- [ ] Browser detection (Windows/Mac/Linux/WSL)
- [ ] Chrome launch with debugging port
- [ ] CDP connection with reconnection logic
- [ ] Screenshot capture and streaming
- [ ] Basic navigation

### Phase 2: MCP Integration (Week 2-3)

- [ ] MCP server with stdio transport
- [ ] Element inspection tool
- [ ] Console log streaming (with redaction)
- [ ] Highlight element tool
- [ ] Action queue with locking

### Phase 3: VS Code UI (Week 3-4)

- [ ] Webview panel with canvas
- [ ] Screenshot display
- [ ] Click forwarding
- [ ] Status indicators

### Phase 4: Polish (Week 4-6)

- [ ] WSL-specific handling
- [ ] Error recovery
- [ ] Settings UI
- [ ] Documentation

---

## Key Risks Updated

| Risk | Severity | Mitigation |
|------|----------|------------|
| VS Code webview can't embed browser | HIGH | Use screenshot streaming (confirmed approach) |
| BrowserView deprecated | HIGH | Use WebContentsView or external Chrome |
| WSL display access | HIGH | Launch Windows Chrome via powershell |
| Context window explosion | MEDIUM | Smart DOM serialization, incremental updates |
| CDP stability | MEDIUM | Reconnection logic, error handling |
| Secret exposure | CRITICAL | Mandatory redaction before sending to Claude |

---

## Sources

1. **CDP Agent:** Chrome DevTools Protocol stability, Electron deprecations
2. **MCP Agent:** MCP server patterns, Claude Code integration, WSL considerations
3. **Similar Tools Agent:** React Grab, browser-use, click-to-component analysis
4. **Architecture Agent:** VS Code webview limitations, state synchronization
5. **Security Agent:** Attack vectors, CSP configuration, secret detection

---

*Research compiled from 5 specialized agents running in parallel*
