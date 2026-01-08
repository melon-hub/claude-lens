# Claude Lens

> Visual web development companion for Claude Code

**Status:** Working Prototype (v0.0.1)

## What is this?

Claude Lens is a tool that lets you point at elements in your web app and talk to Claude about them - without losing your conversation context.

```
You: *Ctrl+clicks misaligned button*
Claude: I see that button has margin-left: 20px. Want me to center it?
You: Yes
Claude: *edits CSS, highlights the fixed button* Is this what you wanted?
```

## Quick Start

### Prerequisites

- VS Code
- Node.js 18+
- pnpm 8+
- Google Chrome

### Installation

```bash
# Clone the repo
git clone https://github.com/melon-hub/claude-lens.git
cd claude-lens

# Install dependencies
pnpm install

# Build all packages
pnpm run build
```

### Running the Extension

1. Open the claude-lens folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. In the new VS Code window, open Command Palette (`Ctrl+Shift+P`)
4. Run `Claude Lens: Open Browser Panel`
5. Enter a localhost URL and click "Go"
6. `Ctrl+Click` on any element to inspect it

### Adding MCP Server to Claude Code

Add this to your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "claude-lens": {
      "command": "node",
      "args": ["/path/to/claude-lens/packages/mcp-server/dist/index.js"]
    }
  }
}
```

Or use the included `.mcp.json` if working within the claude-lens project.

## Features

### Current (v0.0.1)

- [x] VS Code extension with browser panel
- [x] Screenshot streaming from Chrome via CDP
- [x] Ctrl+Click element inspection
- [x] Element info (selector, styles, bounding box)
- [x] Console error/warning capture
- [x] Secret redaction in console logs
- [x] Localhost-only URL validation
- [x] WSL compatibility (auto-launch Windows Chrome)
- [x] MCP tools: `inspect_element`, `highlight_element`, `navigate`, `get_console`, `screenshot`

### Planned

- [ ] Visual element highlighting in browser
- [ ] React/Vue component detection
- [ ] Multi-element selection ("make this look like that")
- [ ] Visual diff mode
- [ ] Standalone Electron app

## MCP Tools

| Tool | Description |
|------|-------------|
| `claude_lens/inspect_element` | Get element info (selector, styles, bbox) |
| `claude_lens/highlight_element` | Highlight element in browser |
| `claude_lens/navigate` | Navigate to URL (localhost only) |
| `claude_lens/get_console` | Get console errors/warnings |
| `claude_lens/screenshot` | Take page/element screenshot |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension                         │
│  ┌───────────────────┐  ┌─────────────────────────────────┐ │
│  │    Webview        │  │     Extension Host              │ │
│  │  - Canvas         │←→│  - CDPAdapter                   │ │
│  │  - Click handler  │  │  - BridgeServer (:9333)         │ │
│  │  - Console panel  │  │  - Screenshot streaming         │ │
│  └───────────────────┘  └─────────────────────────────────┘ │
└───────────────────────────────────┬─────────────────────────┘
                                    │ HTTP Bridge
┌───────────────────────────────────┴─────────────────────────┐
│                    MCP Server (stdio)                        │
│  - BridgeClient                                              │
│  - Tool handlers                                             │
│  - Claude Code integration                                   │
└─────────────────────────────────────────────────────────────┘
                                    │ CDP
┌───────────────────────────────────┴─────────────────────────┐
│                    Chrome (:9222)                            │
│  - localhost:PORT (your app)                                 │
└─────────────────────────────────────────────────────────────┘
```

## Development

```bash
# Build all packages
pnpm run build

# Type check
pnpm run typecheck

# Watch mode (dev)
pnpm run dev
```

### Project Structure

```
packages/
├── core/           # @claude-lens/core - Browser adapters, security, bridge
├── vscode-extension/  # VS Code extension
└── mcp-server/     # Standalone MCP server for Claude Code
```

## Security

- **Localhost only**: Only `http://localhost:*` and `http://127.0.0.1:*` URLs allowed
- **Secret redaction**: API keys, tokens, and credentials are redacted from console logs
- **No external network**: Extension never makes external requests

## License

MIT
