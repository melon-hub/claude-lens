# MCP Tools API

Claude Lens exposes 25+ browser automation tools via the Model Context Protocol (MCP). These tools are Playwright-powered and available when Claude Code connects to the `@claude-lens/mcp-server`.

## Setup

### With Claude Code

Add to your MCP configuration:

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

### Prerequisites

The Claude Lens Desktop app must be running with a project open.

---

## Tools Reference

### Core Tools

#### claude_lens/screenshot

Take a screenshot of the page or a specific element.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | No | Element selector (omit for full viewport) |

**Response:** MCP image content block (base64 PNG) with size info.

```
Screenshot captured (45KB)
```

---

#### claude_lens/browser_snapshot

Get a compact accessibility snapshot of interactive elements on the page.

**Parameters:** None

**Response:** Flat list of interactive elements (~100 lines max):

```
Interactive elements (42):
1. [button] "#submit-btn" "Submit Form"
2. [input] "input[name="email"]" "Enter email" (email)
3. [a] "a.nav-link" "Home"
...
```

**Note:** This replaced the old JSON tree format. Now returns ~100 lines instead of ~1400 lines.

---

#### claude_lens/navigate

Navigate the browser to a URL (localhost only).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to navigate to |

```
Navigated to http://localhost:3000/dashboard
```

---

#### claude_lens/reload

Reload the current page after making code changes.

**Parameters:** None

```
Page reloaded
```

---

### Form Interaction

#### claude_lens/click

Click an element.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `selector` | string | Yes | - | CSS selector |
| `button` | string | No | `left` | `left`, `right`, `middle` |
| `clickCount` | number | No | 1 | 2 for double-click |

```
Clicked Submit button
```

---

#### claude_lens/fill

Fill an input field (clears existing value first).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | Input element selector |
| `value` | string | Yes | Value to fill |

```
Filled email field with "test@example.com"
```

---

#### claude_lens/type

Type text character by character (preserves existing value).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `selector` | string | Yes | - | Input element selector |
| `text` | string | Yes | - | Text to type |
| `clearFirst` | boolean | No | false | Clear before typing |
| `delay` | number | No | 0 | Delay between keystrokes (ms) |

```
Typed 15 characters into input#search
```

---

#### claude_lens/select_option

Select option(s) from a dropdown.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | Select element selector |
| `values` | string \| string[] | Yes | Value(s) to select |

```
Selected: option1, option2
```

---

#### claude_lens/press_key

Press a keyboard key.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `key` | string | Yes | Key name (`Enter`, `Tab`, `Escape`, `ArrowDown`, etc.) |
| `selector` | string | No | Focus element first |

```
Pressed Enter
```

---

### Mouse Interaction

#### claude_lens/hover

Hover over an element (triggers hover states/tooltips).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | Element to hover |

```
Hovered over button.tooltip-trigger
```

---

#### claude_lens/drag_and_drop

Drag an element to another location.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string | Yes | Source element selector |
| `target` | string | Yes | Target element selector |

```
Dragged .draggable to .dropzone
```

---

#### claude_lens/scroll

Scroll the page or element.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `selector` | string | No | - | Scroll element into view |
| `x` | number | No | 0 | Horizontal scroll (pixels) |
| `y` | number | No | 0 | Vertical scroll (pixels) |

```
Scrolled to #footer
```

---

### Waiting

#### claude_lens/wait_for

Wait for an element to appear.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `selector` | string | Yes | - | Element to wait for |
| `timeout` | number | No | 5000 | Max wait time (ms) |
| `visible` | boolean | No | true | Wait for visibility |

```
Element found: <div> matching .loading-spinner
```

---

#### claude_lens/wait_for_response

Wait for a network response.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `urlPattern` | string | Yes | - | URL pattern to match |
| `timeout` | number | No | 30000 | Max wait time (ms) |

```
Response received: 200 OK from /api/users (1523 bytes)
```

---

### Element Inspection

#### claude_lens/inspect_element

Get detailed information about an element.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | No | CSS selector (omit for last-clicked element) |

Returns element info with tag, classes, attributes, styles, position, and text.

---

#### claude_lens/highlight_element

Highlight an element visually.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `selector` | string | Yes | - | Element to highlight |
| `color` | string | No | `#3b82f6` | Highlight color |
| `duration` | number | No | 3000 | Duration in ms |

```
Highlighted #my-element for 3000ms
```

---

#### claude_lens/get_text

Get the text content of an element.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | Element selector |

```
Text: "Welcome to the dashboard"
```

---

#### claude_lens/get_attribute

Get an attribute value from an element.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | Element selector |
| `attribute` | string | Yes | Attribute name |

```
href = "/dashboard"
```

---

#### claude_lens/is_visible

Check if an element is visible.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | Element selector |

```
.modal is visible
```

---

#### claude_lens/is_enabled

Check if an element is enabled (not disabled).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | Element selector |

```
#submit-btn is enabled
```

---

#### claude_lens/is_checked

Check if a checkbox/radio is checked.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | Yes | Checkbox/radio selector |

```
#agree-checkbox is checked
```

---

### Navigation

#### claude_lens/go_back

Go back in browser history.

**Parameters:** None

```
Navigated back
```

---

#### claude_lens/go_forward

Go forward in browser history.

**Parameters:** None

```
Navigated forward
```

---

### Console & Dialogs

#### claude_lens/get_console

Get browser console messages.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `level` | string | No | `error` | `all`, `error`, `warn`, `log` |
| `limit` | number | No | 20 | Max messages |

---

#### claude_lens/handle_dialog

Set how to handle alert/confirm/prompt dialogs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `accept` or `dismiss` |

```
Dialog handler set to: accept
```

---

### Advanced

#### claude_lens/evaluate

Execute custom JavaScript in the page.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `script` | string | Yes | JavaScript to execute |

**Response:** Compact summary of result:

```
Executed JavaScript → Array with 5 items
```

---

## Error Handling

All tools use a 5-second default timeout (configurable). On timeout or error:

```
Error: Timeout waiting for selector "#non-existent" (5000ms)
```

## Security

- **Localhost only:** Navigate tool only accepts localhost URLs
- **Secret redaction:** Console output is sanitized
- **Input validation:** All parameters validated with Zod schemas

---

## Example Workflow

```
User: Test the login form with invalid credentials

Claude: I'll test the login form.
[claude_lens/browser_snapshot] → Found 42 interactive elements
[claude_lens/fill] "#email" with "invalid@test.com"
[claude_lens/fill] "#password" with "wrongpassword"
[claude_lens/click] "#submit-btn"
[claude_lens/wait_for] ".error-message"
[claude_lens/get_text] ".error-message"

Claude: The form correctly shows "Invalid credentials" error.
```
