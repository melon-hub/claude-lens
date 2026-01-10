# Claude Lens - Project Plan

> Living document tracking implementation progress

**Last Updated:** 2026-01-09
**GitHub:** https://github.com/melon-hub/claude-lens

---

## Phase 1: Walking Skeleton (Week 1) ✅ COMPLETE

**Goal:** See localhost in VS Code panel via screenshot streaming

### 1.1 Browser Launcher ✅
- [x] Implement `getExecutionContext()` (windows/wsl/mac/linux)
- [x] Implement `launchChrome()` with CDP debugging port
- [x] Test WSL → Windows Chrome launch via powershell.exe
- [x] Add fallback with manual instructions

### 1.2 CDP Connection ✅
- [x] Finish `CDPAdapter.connect()` - connect to running Chrome
- [x] Implement `CDPAdapter.navigate(url)` - load page
- [x] Implement `CDPAdapter.screenshot()` - capture viewport
- [x] Add connection retry logic with timeout

### 1.3 VS Code Webview ✅
- [x] Create webview panel in extension
- [x] Build HTML template with canvas element
- [x] Setup extension ↔ webview messaging
- [x] Stream screenshots to canvas (base64 → image → draw)
- [x] Add URL bar with navigation

### 1.4 Integration ✅
- [x] Wire: Extension command → Launch Chrome → CDP connect → Screenshot → Webview
- [x] Handle disconnection gracefully

**Deliverable:** `Claude Lens: Open Browser Panel` command shows localhost in VS Code ✅

---

## Phase 2: Element Inspection (Week 2) ✅ COMPLETE

**Goal:** Click element → Claude receives context

### 2.1 Click Handling ✅
- [x] Capture Ctrl+Click on canvas
- [x] Map canvas coordinates to page coordinates (scale factor)
- [x] Implement `CDPAdapter.inspectElementAtPoint(x, y)`
- [x] Return ElementInfo with selector, styles, bbox

### 2.2 Confirmation Popup ✅
- [x] Show VS Code dialog with element info
- [x] "Send to Claude" / "Highlight" / "Cancel" options

### 2.3 Element Inspector ✅
- [x] Implement `getElementInfo(nodeId)`
- [x] Get computed styles via CDP.CSS
- [x] Build unique CSS selector
- [x] Get bounding box

### 2.4 MCP Tools ✅
- [x] Create IPC bridge (BridgeServer/BridgeClient)
- [x] Implement `inspect_element` tool handler
- [x] Implement `highlight_element` tool handler
- [x] Format response for Claude

**Deliverable:** Click element → Claude conversation shows element data ✅

---

## Phase 3: Console & MCP Integration (Week 3) ✅ COMPLETE

**Goal:** Full bidirectional feedback loop

### 3.1 Console Capture ✅
- [x] Subscribe to `CDP.Runtime.consoleAPICalled`
- [x] Filter by level (error, warning)
- [x] Format messages with source location
- [x] Implement secret redaction

### 3.2 Console Streaming ✅
- [x] Show console panel in webview
- [x] Implement `get_console` MCP tool

### 3.3 Element Highlighting ✅
- [x] Implement CDP injection highlight
- [x] Implement `highlight_element` MCP tool

### 3.4 Navigation & Screenshot Tools ✅
- [x] Implement `navigate` MCP tool
- [x] Implement `screenshot` MCP tool
- [x] Validate URLs (localhost only)

**Deliverable:** Console errors flow to Claude, Claude can highlight elements ✅

---

## Phase 4: Polish (Week 4+) ✅ COMPLETE

**Goal:** Production-ready extension

### 4.1 Error Handling
- [x] Graceful Chrome disconnect recovery
- [x] Timeout handling (5s default)
- [x] User-friendly error messages

### 4.2 Settings
- [x] Add extension settings (port, auto-refresh)
- [ ] URL allowlist configuration UI
- [ ] Screenshot quality settings

### 4.3 UX Polish
- [ ] Loading states
- [x] Connection status indicator in status bar
- [ ] Keyboard shortcuts

### 4.4 Testing & Docs
- [ ] Unit tests for core modules
- [ ] Integration test with real app
- [x] README with setup instructions
- [ ] VS Code marketplace prep

**Deliverable:** v0.2.1 released ✅

---

## Phase 5: Playwright Automation ✅ COMPLETE

**Goal:** Full browser automation capabilities

### 5.1 Playwright Integration
- [x] Connect Playwright to Electron BrowserView via CDP
- [x] PlaywrightAdapter class with all automation methods
- [x] 5-second default timeout for fast feedback

### 5.2 MCP Tools (25+ total)
- [x] Form interaction: click, fill, type, select_option, press_key
- [x] Mouse: hover, drag_and_drop, scroll
- [x] Waiting: wait_for, wait_for_response
- [x] Inspection: get_text, get_attribute, is_visible, is_enabled, is_checked
- [x] Navigation: go_back, go_forward, handle_dialog, evaluate
- [x] browser_snapshot (compact accessibility tree)

### 5.3 Output Quality
- [x] Human-readable tool outputs ("Clicked Submit button")
- [x] Compact accessibility snapshot (~100 lines vs ~1400)
- [x] Auto-permissions for all claude_lens tools

**Deliverable:** Full automation in v0.2.1 ✅

---

## Quick Reference

### Commands
```bash
cd /path/to/claude-lens

# Build all packages
pnpm run build

# Type check
pnpm run typecheck

# Dev mode (watch)
pnpm run dev

# Test VS Code extension
# In VS Code: F5 to launch Extension Development Host
```

### Package Structure
```
packages/
├── core/              # @claude-lens/core - Browser + Claude adapters
│   ├── browser/       # CDPAdapter, launcher, types
│   ├── bridge/        # IPC between extension and MCP server
│   ├── security/      # URL validation, secret redaction
│   └── ...
├── vscode-extension/  # VS Code extension shell
└── mcp-server/        # Standalone MCP server
```

### Key Files
- `packages/core/src/browser/cdp-adapter.ts` - CDP browser control
- `packages/core/src/browser/launcher.ts` - Chrome launch with WSL support
- `packages/core/src/bridge/index.ts` - IPC bridge
- `packages/vscode-extension/src/extension.ts` - Extension entry
- `packages/mcp-server/src/index.ts` - MCP tools

---

## Session Log

### 2025-01-08
- Monorepo scaffolded ✅
- All packages build successfully ✅
- GitHub repo created ✅
- Phase 1-3 implemented ✅
- Working prototype ready for testing
