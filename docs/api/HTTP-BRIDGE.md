# HTTP Bridge API

The HTTP Bridge provides communication between the MCP server (separate process) and the browser-controlling host (VS Code extension or Desktop app).

**Base URL:** `http://127.0.0.1:9333`

## Overview

The bridge uses a simple HTTP server bound to localhost only. All responses are JSON. The server supports CORS for local development tools.

```
┌─────────────────┐     HTTP      ┌─────────────────┐
│   MCP Server    │ ←───────────→ │  Bridge Server  │
│ (BridgeClient)  │   :9333       │  (in Extension) │
└─────────────────┘               └────────┬────────┘
                                           │ CDP
                                           ↓
                                  ┌─────────────────┐
                                  │  Chrome Browser │
                                  └─────────────────┘
```

## Endpoints

### GET /state

Get the current browser connection state.

**Response:**
```json
{
  "connected": true,
  "currentUrl": "http://localhost:3000/dashboard",
  "lastInspectedElement": { ... } | null,
  "consoleLogs": [ ... ]
}
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `connected` | boolean | Whether browser is connected via CDP |
| `currentUrl` | string | Current page URL |
| `lastInspectedElement` | ElementInfo \| null | Last element the user clicked |
| `consoleLogs` | ConsoleMessage[] | Buffered console messages |

---

### POST /navigate

Navigate the browser to a URL.

**Request:**
```json
{
  "url": "http://localhost:3000/page"
}
```

**Response:**
```json
{
  "success": true
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Navigation timeout"
}
```

**Security:** Only localhost URLs are permitted by the caller (MCP server validates with `isAllowedUrl()`).

---

### POST /inspect

Inspect a DOM element by selector or coordinates.

**By Selector:**
```json
{
  "selector": "#my-button"
}
```

**By Coordinates:**
```json
{
  "x": 150,
  "y": 200
}
```

**No Parameters:** Returns the last user-clicked element.

**Response (ElementInfo):**
```json
{
  "selector": "div#app > button.primary",
  "xpath": "/html/body/div/button",
  "tagName": "button",
  "id": "submit-btn",
  "classes": ["primary", "large"],
  "attributes": {
    "type": "submit",
    "data-testid": "submit"
  },
  "computedStyles": {
    "display": "flex",
    "position": "relative",
    "width": "120px",
    "height": "40px",
    "margin": "0px",
    "padding": "8px 16px",
    "color": "rgb(255, 255, 255)",
    "backgroundColor": "rgb(59, 130, 246)",
    "fontSize": "14px",
    "fontFamily": "Inter, sans-serif"
  },
  "boundingBox": {
    "x": 100,
    "y": 200,
    "width": 120,
    "height": 40
  },
  "innerText": "Submit",
  "parentChain": ["div#app", "form", "body", "html"],
  "siblingCount": 2,
  "childCount": 1,
  "framework": {
    "name": "react",
    "componentName": "Button",
    "componentFile": "/src/components/Button.tsx"
  }
}
```

---

### POST /highlight

Highlight an element in the browser viewport.

**Request:**
```json
{
  "selector": "#my-element",
  "color": "#3b82f6",
  "duration": 3000
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `selector` | string | required | CSS selector |
| `color` | string | `#3b82f6` | Highlight color (hex) |
| `duration` | number | 3000 | Duration in ms (0 = permanent) |

**Response:**
```json
{
  "success": true
}
```

---

### POST /clear-highlights

Remove all highlights from the page.

**Request:** Empty body or `{}`

**Response:**
```json
{
  "success": true
}
```

---

### POST /screenshot

Capture the viewport or a specific element.

**Full Viewport:**
```json
{}
```

**Specific Element:**
```json
{
  "selector": "#main-content"
}
```

**Response:**
```json
{
  "image": "iVBORw0KGgoAAAANSUhEUgAA..."
}
```

The `image` field contains a base64-encoded PNG.

---

### POST /console

Get buffered console log messages.

**Request:**
```json
{
  "level": "error",
  "limit": 20
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `level` | string | `"error"` | Filter: `"all"`, `"error"`, `"warn"`, `"log"` |
| `limit` | number | 20 | Maximum messages to return |

**Response (ConsoleMessage[]):**
```json
[
  {
    "level": "error",
    "text": "Uncaught TypeError: Cannot read property 'map' of undefined",
    "source": "http://localhost:3000/static/js/main.js",
    "line": 142,
    "column": 23,
    "timestamp": 1704750000000,
    "stackTrace": "at Array.map (<anonymous>)\n    at Dashboard.render..."
  }
]
```

---

### POST /reload

Reload the current page.

**Request:** Empty body or `{}`

**Response:**
```json
{
  "success": true
}
```

---

## Error Handling

All endpoints return HTTP 500 on error:

```json
{
  "error": "Error message here"
}
```

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 404 | Unknown endpoint |
| 500 | Internal error |
| 503 | Handler not ready (bridge starting up) |

---

## Usage Example (curl)

```bash
# Check connection status
curl -s http://localhost:9333/state

# Navigate to URL
curl -s http://localhost:9333/navigate \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"url": "http://localhost:3000"}'

# Take screenshot and save to file
curl -s http://localhost:9333/screenshot -X POST \
  | jq -r '.image' | base64 -d > screenshot.png

# Get error logs
curl -s http://localhost:9333/console \
  -X POST \
  -d '{"level": "error", "limit": 10}'

# Highlight an element
curl -s http://localhost:9333/highlight \
  -X POST \
  -d '{"selector": ".my-class", "color": "#ff0000"}'
```

---

## TypeScript Client

The `@claude-lens/core` package exports `BridgeClient` for programmatic access:

```typescript
import { BridgeClient } from '@claude-lens/core';

const bridge = new BridgeClient(9333);

// Check connection
const connected = await bridge.isConnected();

// Navigate
await bridge.navigate('http://localhost:3000');

// Inspect element
const element = await bridge.inspectElement('#my-button');
console.log(element.computedStyles);

// Take screenshot
const base64 = await bridge.screenshot();

// Get console logs
const errors = await bridge.getConsoleLogs('error', 10);
```
