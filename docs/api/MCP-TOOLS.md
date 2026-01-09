# MCP Tools API

Claude Lens exposes browser inspection tools via the Model Context Protocol (MCP). These tools are available when Claude Code connects to the `@claude-lens/mcp-server`.

## Setup

### With Claude Code

Add to your MCP configuration:

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

### Prerequisites

The Claude Lens browser panel must be open and connected:
- **VS Code:** Run "Claude Lens: Open Browser Panel" command
- **Desktop:** Launch the Claude Lens app

---

## Tools Reference

### claude_lens/inspect_element

Inspect a DOM element and retrieve its properties, styles, and bounding box.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `selector` | string | No | CSS selector. If omitted, returns the last user-clicked element. |

**Response Format:**
```markdown
## Inspected Element

**Selector:** `div#app > button.primary`
**Tag:** `<button id="submit-btn" class="primary large">`

### Computed Styles
| Property | Value |
|----------|-------|
| display | flex |
| position | relative |
| width | 120px |
| height | 40px |
| margin | 0px |
| padding | 8px 16px |
| color | rgb(255, 255, 255) |
| background | rgb(59, 130, 246) |
| font-size | 14px |

### Bounding Box
- Position: (100, 200)
- Size: 120 x 40

### Attributes
- type: submit
- data-testid: submit
```

**When to Use:**
- After user Ctrl+Clicks an element in Claude Lens
- To get styling information for fixing CSS issues
- To understand element structure for test automation

---

### claude_lens/highlight_element

Highlight an element in the browser to visually indicate which element you're referring to.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `selector` | string | Yes | - | CSS selector of element to highlight |
| `color` | string | No | `#3b82f6` | Highlight color (hex) |
| `duration` | number | No | 3000 | Duration in ms (0 = permanent) |

**Response:**
```
Highlighted element: #my-button
```

**When to Use:**
- To show the user which element you're discussing
- Before making changes to confirm the correct element
- During debugging to visualize element boundaries

---

### claude_lens/navigate

Navigate the browser to a URL. Only localhost URLs are permitted for security.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url` | string | Yes | URL to navigate to (must be localhost) |

**Allowed URL formats:**
- `http://localhost:3000`
- `http://localhost:3000/dashboard`
- `http://127.0.0.1:8080`
- `http://[::1]:3000`

**Response:**
```
Navigated to: http://localhost:3000/dashboard
```

**Error Response:**
```
Error: Only localhost URLs are allowed for security. Use http://localhost:PORT or http://127.0.0.1:PORT
```

---

### claude_lens/get_console

Get recent console messages from the browser. Useful for debugging errors and warnings.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `level` | string | No | `error` | Filter: `all`, `error`, `warn`, `log` |
| `limit` | number | No | 20 | Maximum messages to return |

**Response Format:**
```markdown
## Console Messages

```
[ERROR] (http://localhost:3000/app.js:142) Uncaught TypeError: Cannot read property 'map' of undefined
[ERROR] (http://localhost:3000/api.js:89) Failed to fetch: NetworkError
[WARN] (http://localhost:3000/utils.js:23) Deprecated API usage
```
```

**When to Use:**
- To diagnose runtime errors
- After navigation to check for loading issues
- When user reports unexpected behavior

---

### claude_lens/screenshot

Take a screenshot of the page or a specific element. Returns base64-encoded PNG.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `selector` | string | No | Element selector (omit for full viewport) |

**Response:**
Returns an MCP image content block that Claude can view directly.

**When to Use:**
- To see the current state of the page
- After making changes to verify visual result
- To understand layout issues
- When user describes a visual bug

---

### claude_lens/reload

Reload the browser page. Use this after making code changes to see the updated result.

**Parameters:** None

**Response:**
```
Page reloaded successfully. Take a screenshot to see the updated page.
```

**Typical Workflow:**
1. User describes an issue
2. Claude makes code changes to source files
3. Claude calls `reload` to apply changes
4. Claude calls `screenshot` to verify the fix

---

## Error Handling

All tools follow MCP error conventions. Errors return:

```json
{
  "content": [{ "type": "text", "text": "Error: message" }],
  "isError": true
}
```

**Common Errors:**

| Error | Cause | Solution |
|-------|-------|----------|
| "Claude Lens is not connected" | Browser panel not open | Open Claude Lens panel |
| "Element not found: selector" | Invalid CSS selector | Verify selector exists |
| "No element has been clicked" | Called inspect without selector | Ctrl+Click an element first |
| "Only localhost URLs are allowed" | Non-localhost URL | Use localhost URL |

---

## Security

### Input Validation
All inputs are validated using Zod schemas:
- URLs checked against localhost allowlist
- Selectors sanitized before use
- Console output passed through secret redaction

### Localhost Only
The `navigate` tool only accepts localhost URLs:
- `localhost`
- `127.0.0.1`
- `::1` (IPv6 localhost)

This prevents Claude from navigating to arbitrary websites.

### Secret Redaction
Console messages are passed through `redactSecrets()` before being returned. This masks:
- API keys
- Tokens
- Passwords
- Other sensitive patterns

---

## Example Conversation

```
User: The submit button isn't working. I clicked it in Claude Lens.

Claude: Let me inspect that button.
[Calls claude_lens/inspect_element]

Claude: I can see the button has a click handler. Let me check the console for errors.
[Calls claude_lens/get_console with level: "error"]

Claude: Found a TypeError in your handler. Let me fix the code...
[Edits source file]

Claude: I've fixed the issue. Let me reload to verify.
[Calls claude_lens/reload]
[Calls claude_lens/screenshot]

Claude: The button should work now. I can see it rendered correctly in the screenshot.
```
