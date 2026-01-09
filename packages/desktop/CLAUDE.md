# Claude Lens Desktop - Claude Code Integration

You are running inside Claude Lens Desktop with an embedded browser. You have tools to interact with the browser directly.

## CRITICAL: Screenshot and Browser Tools

**DO NOT use Playwright or browser_snapshot** - they won't work here.

**Use these methods instead:**

### Method 1: MCP Tools (preferred)
If `claude_lens/*` tools are available, use them:
- `claude_lens/screenshot` - Take a screenshot
- `claude_lens/inspect_element` - Inspect a DOM element
- `claude_lens/highlight_element` - Highlight an element
- `claude_lens/get_console` - Get console logs
- `claude_lens/navigate` - Navigate to a URL
- `claude_lens/reload` - Reload the page after making code changes

### Method 2: HTTP API (fallback)
If MCP tools aren't available, use curl to call the local HTTP API:

```bash
# Take a screenshot (returns base64 PNG)
curl -s http://localhost:9333/screenshot -X POST | jq -r '.image' | base64 -d > /tmp/screenshot.png

# Get browser state (URL, connection status)
curl -s http://localhost:9333/state

# Get console logs
curl -s http://localhost:9333/console -X POST -d '{"level":"error","limit":10}'

# Inspect an element
curl -s http://localhost:9333/inspect -X POST -d '{"selector":"#myButton"}'

# Highlight an element
curl -s http://localhost:9333/highlight -X POST -d '{"selector":"#myButton","color":"#3b82f6"}'

# Navigate to URL
curl -s http://localhost:9333/navigate -X POST -d '{"url":"http://localhost:3000"}'
```

## Checking What's Available

Run this to check if the Bridge server is responding:
```bash
curl -s http://localhost:9333/state
```

If it returns `{"connected":true,...}`, the HTTP API is available.

## Important Notes

1. **Source files** - The browser shows localhost content from a SEPARATE project. If you need to edit source files, ASK the user where that project is located.

2. **Element context** - When the user clicks "Send to Claude" after selecting an element, you'll receive element details (selector, styles, position). Use this to make targeted changes.

3. **Console logs** - Use the console endpoint to debug errors. Filter by level: "error", "warn", "log", or "all".

## Typical Workflow

1. User navigates to localhost:3000 (or similar) in the embedded browser
2. User inspects/selects an element and clicks "Send to Claude"
3. You receive element context with selector, styles, position
4. If you need to see the page: take a screenshot via MCP tool or HTTP API
5. ASK user where the source files are located
6. Make the requested changes to the source files
