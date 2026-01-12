# Claude Lens Desktop - Claude Code Integration

You are running inside Claude Lens Desktop with Playwright-powered browser automation.

## CRITICAL: Use `claude_lens/*` Tools (NOT `browser_*` Tools)

You may have other Playwright MCP tools available (like `browser_navigate`, `browser_click`, `browser_take_screenshot`, etc.).

**DO NOT use those generic `browser_*` tools for this project.** They connect to a different browser instance and won't work with Claude Lens.

**ALWAYS use `claude_lens/*` tools** - they are specifically designed for the Claude Lens embedded browser.

## Browser Tools (Claude Lens)

Use the `claude_lens/*` MCP tools for browser automation:

### Core Tools
| Tool | Purpose |
|------|---------|
| `claude_lens/screenshot` | Take a screenshot (do this FIRST to see the page) |
| `claude_lens/browser_snapshot` | Get accessibility tree for fast element discovery |
| `claude_lens/click` | Click an element |
| `claude_lens/fill` | Fill input field (clears first) |
| `claude_lens/type` | Type text character by character |
| `claude_lens/navigate` | Navigate to a URL |
| `claude_lens/reload` | Reload page after code changes |

### Advanced Automation
| Tool | Purpose |
|------|---------|
| `claude_lens/hover` | Hover over element (trigger hover states) |
| `claude_lens/select_option` | Select dropdown option |
| `claude_lens/press_key` | Press keyboard key (Enter, Tab, Escape) |
| `claude_lens/drag_and_drop` | Drag from source to target |
| `claude_lens/scroll` | Scroll page or element |
| `claude_lens/wait_for` | Wait for element to appear |
| `claude_lens/wait_for_response` | Wait for network response |

### Element Inspection
| Tool | Purpose |
|------|---------|
| `claude_lens/inspect_element` | Get element details |
| `claude_lens/highlight_element` | Highlight an element |
| `claude_lens/get_text` | Get element text content |
| `claude_lens/get_attribute` | Get element attribute |
| `claude_lens/is_visible` | Check if element is visible |
| `claude_lens/is_enabled` | Check if element is enabled |
| `claude_lens/get_console` | Get browser console logs |

### Navigation & Dialogs
| Tool | Purpose |
|------|---------|
| `claude_lens/go_back` | Browser back button |
| `claude_lens/go_forward` | Browser forward button |
| `claude_lens/handle_dialog` | Accept or dismiss alert/confirm dialogs |
| `claude_lens/evaluate` | Execute custom JavaScript |

### Development Tools
| Tool | Purpose |
|------|---------|
| `claude_lens/set_viewport` | Change viewport size for responsive testing (presets: full, desktop, tablet, mobile, or custom width) |
| `claude_lens/restart_server` | Restart the dev server (after config changes, new dependencies, or when hot reload fails) |

## HTTP API (Fallback)

If MCP tools aren't available, use curl to call the local HTTP API on port 9333:

```bash
# Take a screenshot (returns base64 PNG)
curl -s http://localhost:9333/screenshot -X POST | jq -r '.image' | base64 -d > /tmp/screenshot.png

# Get browser state (URL, connection status)
curl -s http://localhost:9333/state

# Get console logs
curl -s http://localhost:9333/console -X POST -d '{"level":"error","limit":10}'

# Fill an input
curl -s http://localhost:9333/fill -X POST -d '{"selector":"#email","value":"test@example.com"}'

# Click an element
curl -s http://localhost:9333/click -X POST -d '{"selector":"#submit-btn"}'

# Navigate to URL
curl -s http://localhost:9333/navigate -X POST -d '{"url":"http://localhost:3000"}'
```

## CSS Selectors

Use **standard CSS selectors**:
- `#submit-btn` (ID)
- `.btn-primary` (class)
- `[data-testid="submit"]` (attribute)
- `button[type="submit"]` (tag + attribute)

## Workflow

1. `claude_lens/screenshot` or `claude_lens/browser_snapshot` → See the page
2. Make code changes
3. `claude_lens/reload` → See updates
4. `claude_lens/screenshot` → Verify

## Important Notes

1. **Source files** - The browser shows localhost content from a SEPARATE project. If you need to edit source files, ASK the user where that project is located.

2. **Element context** - When the user clicks "Send to Claude" after selecting an element, you'll receive element details (selector, styles, position). Use this to make targeted changes.

3. **Console logs** - Use the console endpoint to debug errors. Filter by level: "error", "warn", "log", or "all".
