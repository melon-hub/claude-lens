# Claude Lens for VS Code

Visual web development companion for Claude Code - see your localhost app, inspect elements, and get context for AI-assisted development.

## Overview

Claude Lens adds a browser panel to VS Code that:
- Displays your localhost app inside the editor
- Lets you inspect elements and send context to Claude
- Captures console errors for debugging
- Integrates with Claude Code via MCP tools

## Installation

### From Marketplace (Coming Soon)

Search for "Claude Lens" in VS Code Extensions.

### From Source

```bash
cd packages/vscode-extension
pnpm install
pnpm run build
```

Then press F5 in VS Code to launch the Extension Development Host.

## Usage

1. **Open the panel**: Run command `Claude Lens: Open Browser Panel`
2. **Navigate**: Enter a localhost URL in the address bar
3. **Inspect**: Ctrl+Click on any element to select it
4. **Send to Claude**: Click "Send to Claude" in the dialog

## Commands

| Command | Description |
|---------|-------------|
| `Claude Lens: Open Browser Panel` | Open the browser webview panel |
| `Claude Lens: Connect to Browser` | Connect to running Chrome instance |
| `Claude Lens: Disconnect` | Disconnect from browser |

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `claudeLens.cdpPort` | number | 9222 | Chrome DevTools Protocol port |
| `claudeLens.autoLaunchBrowser` | boolean | true | Auto-launch Chrome on open |
| `claudeLens.autoStreamConsole` | boolean | true | Stream console errors to Claude |

## MCP Tools

When used with Claude Code, these tools become available:

- `claude_lens/inspect_element` - Get element details
- `claude_lens/highlight_element` - Highlight elements visually
- `claude_lens/screenshot` - Capture the viewport
- `claude_lens/navigate` - Navigate to URL
- `claude_lens/get_console` - Get console logs
- `claude_lens/reload` - Reload the page

## Requirements

- VS Code 1.85.0 or higher
- Chrome browser (for CDP connection)
- Node.js 18+ (for MCP server)

## Architecture

```
VS Code
├── Extension (this package)
│   ├── Webview Panel (browser display)
│   └── CDP Adapter (browser control)
│
├── Bridge Server (:9333)
│   └── HTTP API for MCP communication
│
└── MCP Server (separate process)
    └── Tools for Claude Code
```

## Development

```bash
# Watch mode
pnpm run dev

# Type check
pnpm run typecheck

# Package for distribution
pnpm run package
```

## License

MIT
