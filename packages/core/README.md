# @claude-lens/core

Core library for Claude Lens - browser adapters, security utilities, and IPC bridge.

## Overview

This package provides the UI-agnostic foundation that powers both the VS Code extension and Desktop app. It handles browser control via Chrome DevTools Protocol (CDP), inter-process communication, and security validation.

**Note:** The Desktop app extends this with `PlaywrightAdapter` (in `packages/desktop`) which connects Playwright to Electron's BrowserView via CDP for full automation capabilities.

## Installation

```bash
pnpm add @claude-lens/core
```

## Exports

### Browser Module

```typescript
import { CDPAdapter, launchChrome, getExecutionContext } from '@claude-lens/core/browser';
```

- **CDPAdapter** - Chrome DevTools Protocol browser control
- **launchChrome** - Launch Chrome with CDP debugging enabled
- **getExecutionContext** - Detect execution environment (Windows/WSL/Mac/Linux)

### Bridge Module

```typescript
import { BridgeServer, BridgeClient } from '@claude-lens/core';
```

- **BridgeServer** - HTTP server on port 9333 for MCP communication
- **BridgeClient** - HTTP client to query bridge server

### Security Module

```typescript
import { isAllowedUrl, redactSecrets } from '@claude-lens/core/security';
```

- **isAllowedUrl** - URL validation (localhost only by default)
- **redactSecrets** - Redact sensitive values from console output

### Inspector Module

```typescript
import { getElementInfo, buildSelector } from '@claude-lens/core';
```

- **getElementInfo** - Extract element properties, styles, and bounding box
- **buildSelector** - Generate unique CSS selector for an element

### Console Module

```typescript
import { ConsoleCapture } from '@claude-lens/core';
```

- **ConsoleCapture** - Subscribe to and filter browser console messages

### Highlighter Module

```typescript
import { highlightElement, clearHighlights } from '@claude-lens/core';
```

- **highlightElement** - Visual element highlighting via CSS injection
- **clearHighlights** - Remove all highlights

## Peer Dependencies

- `@modelcontextprotocol/sdk` - MCP SDK for tool definitions
- `@anthropic-ai/sdk` - Anthropic API client

## License

MIT
