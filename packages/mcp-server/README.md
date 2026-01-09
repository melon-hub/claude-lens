# @claude-lens/mcp-server

MCP server providing browser inspection tools to Claude Code.

## Overview

This standalone MCP server connects to the Claude Lens bridge and exposes browser inspection tools. It runs as a separate process and communicates via HTTP with the Claude Lens desktop app or VS Code extension.

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

## Available Tools

### `claude_lens/inspect_element`

Get element details including selector, computed styles, and bounding box.

```typescript
// Parameters
{
  selector?: string  // CSS selector (optional, uses last clicked element if omitted)
}

// Response
{
  selector: string,
  tagName: string,
  styles: Record<string, string>,
  boundingBox: { x, y, width, height }
}
```

### `claude_lens/highlight_element`

Visually highlight an element in the browser.

```typescript
// Parameters
{
  selector: string,  // CSS selector to highlight
  color?: string     // Highlight color (default: #3b82f6)
}
```

### `claude_lens/screenshot`

Capture the current viewport as a PNG image.

```typescript
// Parameters
{
  fullPage?: boolean  // Capture full page (default: false)
}

// Response
{
  image: string  // Base64-encoded PNG
}
```

### `claude_lens/navigate`

Navigate to a URL (localhost only for security).

```typescript
// Parameters
{
  url: string  // URL to navigate to (must be localhost)
}
```

### `claude_lens/get_console`

Retrieve console log messages.

```typescript
// Parameters
{
  level?: "error" | "warn" | "log" | "all",  // Filter by level
  limit?: number  // Max messages to return
}

// Response
{
  messages: Array<{ level, text, source, timestamp }>
}
```

### `claude_lens/reload`

Reload the current page.

```typescript
// No parameters required
```

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
