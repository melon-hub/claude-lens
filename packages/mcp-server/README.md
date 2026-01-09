# @claude-lens/mcp-server

MCP server providing 25+ Playwright-powered browser automation tools to Claude Code.

## Overview

This standalone MCP server connects to the Claude Lens bridge and exposes browser automation tools. It runs as a separate process and communicates via HTTP with the Claude Lens desktop app or VS Code extension. Playwright is connected via CDP to Electron's embedded BrowserView, providing full automation capabilities.

## Installation

```bash
pnpm add @claude-lens/mcp-server
```

## Usage

### As a CLI Tool

```bash
claude-lens-mcp
```

### With Claude Code

Add to your MCP configuration (`.mcp.json` or Claude settings):

```json
{
  "mcpServers": {
    "claude-lens": {
      "command": "npx",
      "args": ["@claude-lens/mcp-server"]
    }
  }
}
```

## Available Tools (25+)

### Core Tools
| Tool | Description |
|------|-------------|
| `claude_lens/screenshot` | Capture viewport or specific element |
| `claude_lens/browser_snapshot` | Get accessibility tree (interactive elements) |
| `claude_lens/navigate` | Navigate to URL (localhost only) |
| `claude_lens/reload` | Reload the current page |

### Form Interaction
| Tool | Description |
|------|-------------|
| `claude_lens/click` | Click an element |
| `claude_lens/fill` | Fill input field (clears first) |
| `claude_lens/type` | Type text character by character |
| `claude_lens/select_option` | Select dropdown option(s) |
| `claude_lens/press_key` | Press keyboard key (Enter, Tab, etc.) |

### Mouse Interaction
| Tool | Description |
|------|-------------|
| `claude_lens/hover` | Hover over element (trigger hover states) |
| `claude_lens/drag_and_drop` | Drag from source to target |
| `claude_lens/scroll` | Scroll page or element into view |

### Waiting
| Tool | Description |
|------|-------------|
| `claude_lens/wait_for` | Wait for element to appear |
| `claude_lens/wait_for_response` | Wait for network response |

### Element Inspection
| Tool | Description |
|------|-------------|
| `claude_lens/inspect_element` | Get element details (styles, position) |
| `claude_lens/highlight_element` | Highlight element visually |
| `claude_lens/get_text` | Get element text content |
| `claude_lens/get_attribute` | Get element attribute value |
| `claude_lens/is_visible` | Check if element is visible |
| `claude_lens/is_enabled` | Check if element is enabled |
| `claude_lens/is_checked` | Check if checkbox/radio is checked |

### Navigation & Dialogs
| Tool | Description |
|------|-------------|
| `claude_lens/go_back` | Browser back button |
| `claude_lens/go_forward` | Browser forward button |
| `claude_lens/handle_dialog` | Handle alert/confirm/prompt |
| `claude_lens/evaluate` | Execute custom JavaScript |
| `claude_lens/get_console` | Get browser console logs |

See [MCP-TOOLS.md](../../docs/api/MCP-TOOLS.md) for full parameter documentation.

## Architecture

```
Claude Code
    ↓ (stdio)
MCP Server
    ↓ (HTTP :9333)
Bridge Server (in Desktop/VS Code)
    ↓ (CDP)
Chrome Browser
```

## License

MIT
