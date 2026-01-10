# Claude Lens Desktop

Electron desktop app with embedded browser and Claude Code terminal.

## Overview

Claude Lens Desktop provides a seamless development environment combining:
- **Embedded Browser** - View and inspect your localhost app
- **Claude Code Terminal** - Built-in terminal running Claude Code
- **MCP Bridge** - Automatic tool integration between browser and Claude

## Installation

### Development

```bash
cd packages/desktop
pnpm install
pnpm run dev
```

### Building

```bash
pnpm run build
pnpm run package
```

Output will be in the `release/` directory.

## Features

### Embedded Browser
- Navigate to localhost URLs
- Ctrl+Click to inspect elements
- Console log capture with error filtering
- Visual element highlighting

### Claude Code Terminal
- Full PTY terminal emulation
- xterm.js with Unicode support
- Web links clickable

### MCP Tools Integration (25+ Playwright-Powered Tools)
When Claude Code runs in the embedded terminal, it automatically has access to:

**Core:**
- `claude_lens/screenshot` - Capture viewport or element
- `claude_lens/browser_snapshot` - Accessibility tree for element discovery
- `claude_lens/navigate` - Browser navigation
- `claude_lens/reload` - Page refresh

**Form Interaction:**
- `claude_lens/click` - Click elements
- `claude_lens/fill` - Fill input fields
- `claude_lens/type` - Type text character by character
- `claude_lens/select_option` - Select dropdown options
- `claude_lens/press_key` - Press keyboard keys

**Mouse Interaction:**
- `claude_lens/hover` - Hover over elements
- `claude_lens/drag_and_drop` - Drag elements
- `claude_lens/scroll` - Scroll page or element

**Waiting:**
- `claude_lens/wait_for` - Wait for elements
- `claude_lens/wait_for_response` - Wait for network responses

**Element Inspection:**
- `claude_lens/inspect_element` - Get element details
- `claude_lens/highlight_element` - Visual highlighting
- `claude_lens/get_text` - Get element text
- `claude_lens/get_attribute` - Get element attributes
- `claude_lens/is_visible` / `is_enabled` / `is_checked` - State checks

**Navigation & Dialogs:**
- `claude_lens/go_back` / `go_forward` - Browser history
- `claude_lens/handle_dialog` - Handle alert/confirm/prompt
- `claude_lens/evaluate` - Execute JavaScript
- `claude_lens/get_console` - Console logs

## Architecture

```
┌─────────────────────────────────────────┐
│           Claude Lens Desktop           │
├─────────────────┬───────────────────────┤
│                 │                       │
│  Browser View   │   Claude Terminal     │
│  (BrowserView)  │   (node-pty + xterm)  │
│                 │                       │
├─────────────────┴───────────────────────┤
│              Bridge Server              │
│            (HTTP on :9333)              │
└─────────────────────────────────────────┘
         ↓ CDP                    ↑ stdio
    Chrome Engine            MCP Server
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CDP_PORT` | Chrome DevTools Protocol port | 9222 |
| `BRIDGE_PORT` | HTTP bridge server port | 9333 |

## Security

- **Localhost Only** - Browser navigation restricted to localhost URLs
- **Secret Redaction** - Console output sanitized before exposure
- **Input Validation** - All MCP inputs validated with Zod schemas

## Platform Support

| Platform | Status |
|----------|--------|
| Windows | Supported |
| macOS | Supported |
| Linux | Supported |
| WSL | Supported (launches Windows Chrome) |

## License

MIT
