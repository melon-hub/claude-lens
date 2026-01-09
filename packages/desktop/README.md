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

### MCP Tools Integration
When Claude Code runs in the embedded terminal, it automatically has access to:
- `claude_lens/inspect_element` - Inspect DOM elements
- `claude_lens/highlight_element` - Visual highlighting
- `claude_lens/screenshot` - Capture viewport
- `claude_lens/navigate` - Browser navigation
- `claude_lens/get_console` - Console logs
- `claude_lens/reload` - Page refresh

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
