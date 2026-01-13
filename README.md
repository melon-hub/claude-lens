# Claude Lens

<p align="center">
  <b>Point at what's broken. Talk to Claude about it. Keep the conversation going.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Desktop-v0.2.1-blue" alt="Desktop v0.2.1" />
  <img src="https://img.shields.io/badge/VS_Code-v0.1.0-purple" alt="VS Code v0.1.0" />
  <img src="https://img.shields.io/badge/Status-Working_Prototype-green" alt="Status" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License" />
</p>

<p align="center">
  <img width="2551" alt="Claude Lens Desktop - Three-panel layout with browser, context panel, and Claude Code terminal" src="https://github.com/user-attachments/assets/69a1b03d-3210-4735-a387-dadd21b35c88" />
</p>

---

## What is Claude Lens?

**Claude Lens is a visual web development companion for Claude Code.** It bridges what you *see* in your browser with what Claude *knows* about your code.

Instead of copying selectors and describing elements, you just **click on them**. Claude sees the element details, component info, and styles instantly - all while keeping your conversation context.

### The 30-Second Pitch

```
You: *Ctrl+clicks a misaligned button*

Claude: I see that button. It has margin-left: 20px, the parent is flex but not centered.
        Want me to fix it?

You: Yes, and make it match this one *Ctrl+clicks header button*

Claude: Got it - applying the header button's padding, border-radius, and font-weight.
        Done. Check it out.
```

**That conversation is impossible with other tools.** They either lose context between clicks or can't do visual selection at all.

---

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm 8+

### Install & Run

```bash
git clone https://github.com/melon-hub/claude-lens.git
cd claude-lens
pnpm install
pnpm run build
cd packages/desktop
pnpm run dev
```

### Connect to Claude Code

Add to `~/.claude/settings.json`:

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

That's it! Open the app, navigate to your localhost dev server, and start clicking elements.

---

## Why Claude Lens?

### The Problem

You're debugging a frontend issue. You can *see* the bug - the button is misaligned, the card has wrong padding. Now you need to explain it to Claude:

1. Open browser DevTools, find the element
2. Copy selector and relevant styles
3. Switch to Claude Code, paste and explain
4. Get the fix, apply it, refresh, check
5. Repeat for every element

**Every context switch breaks your flow.**

### The Gap in the Market

| Tool | Visual Selection | Keeps Conversation | The Catch |
|------|:----------------:|:------------------:|-----------|
| React Grab | ✅ | ❌ | New Claude session each click. No memory. |
| browser-use | ✅ | ❌ | Per-task agents, not conversational. |
| Playwright MCP | ❌ | ✅ | Must know selectors. Can't just click. |
| DevTools MCP | ❌ | ✅ | Programmatic only. No visual picking. |
| **Claude Lens** | ✅ | ✅ | **Both.** Click things AND keep context. |

---

## Features

### Desktop App (Recommended)

| Feature | Description |
|---------|-------------|
| **Real Embedded Browser** | Full Electron BrowserView - not screenshots |
| **Integrated Claude Terminal** | Claude Code runs inside the app via PTY |
| **Ctrl+Click Inspection** | Click any element → instant context to Claude |
| **Hover Tooltips** | See selectors as you move your mouse |
| **Framework Detection** | Identifies React, Vue, Svelte, Angular components |
| **Console Drawer** | Live errors/warnings with filtering |
| **Dev Server Integration** | Auto-detects package.json, starts dev server, Claude can restart it |
| **Hot Reload Aware** | Page auto-refreshes when your code changes |

### 25+ MCP Tools (Playwright-Powered)

Claude can automate your browser:

| Category | Tools |
|----------|-------|
| **Core** | screenshot, browser_snapshot, click, fill, type, navigate, reload |
| **Automation** | hover, drag_and_drop, scroll, press_key, select_option |
| **Inspection** | inspect_element, highlight_element, get_text, get_attribute |
| **Waiting** | wait_for, wait_for_response |
| **Navigation** | go_back, go_forward, handle_dialog |
| **Dev Tools** | set_viewport, restart_server, evaluate |

**Example:**
```
You: Test the login form with invalid credentials

Claude: *fills email* *fills password* *clicks submit*
        Error message appeared: "Invalid credentials"
        Form validation is working. Test with valid credentials?
```

### Viewport Testing

Test responsive designs without leaving Claude Lens:

| Preset | Width | Use Case |
|--------|-------|----------|
| Full Width | 100% | Default development view |
| Desktop | 1280px | Standard desktop testing |
| Tablet | 768px | iPad/tablet layouts |
| Mobile | 375px | iPhone/mobile testing |
| Custom | Any | Enter any width you need |

Claude can also change viewports programmatically via `claude_lens/set_viewport`.

### VS Code Extension (Alternative)

For those who prefer staying in VS Code:
- Screenshot streaming from Chrome via CDP
- Same Ctrl+Click inspection workflow
- WSL support (auto-launches Windows Chrome)

---

## Performance Optimizations

Claude Lens includes optimizations that make Claude Code work faster:

| Feature | Benefit |
|---------|---------|
| **Accessibility Tree Snapshots** | `browser_snapshot` returns a compact ~100-line summary instead of full DOM - Claude parses faster |
| **Smart Element Selection** | Ctrl+Click sends only relevant context (selector, styles, component) - not the entire page |
| **Viewport Constraints** | Browser panel respects viewport width for accurate responsive testing |
| **Efficient Console Capture** | Filters duplicate messages, batches updates |

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                      Claude Lens Desktop                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Browser    │  │   Context    │  │    Claude Code       │  │
│  │   Panel      │  │   Panel      │  │    Terminal          │  │
│  │              │  │              │  │                      │  │
│  │  Your app    │  │  Element     │  │  Same conversation   │  │
│  │  runs here   │  │  details,    │  │  throughout your     │  │
│  │              │  │  component   │  │  entire session      │  │
│  │  Ctrl+Click  │  │  info,       │  │                      │  │
│  │  to inspect  │  │  styles      │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         │              MCP Tools                  │
         └────────────────────┴────────────────────┘
                    Playwright automation
```

When you Ctrl+Click an element:
1. **Browser panel** captures the element's selector, bounding box, styles
2. **Context panel** shows React/Vue component info, computed styles, attributes
3. **Claude terminal** receives everything via MCP - ready for your question

---

## Security

| Protection | How |
|------------|-----|
| **Localhost only** | URLs validated - only `localhost`, `127.0.0.1`, `[::1]` |
| **Secret redaction** | API keys, tokens, JWTs auto-redacted from context |
| **No external network** | Extension never phones home |
| **Input validation** | All MCP params validated with Zod |

---

## Roadmap

| Feature | Status |
|---------|--------|
| Framework detection (React/Vue/Svelte/Angular) | ✅ Done |
| Desktop app with real browser | ✅ Done |
| Playwright automation (25+ tools) | ✅ Done |
| Multi-element select ("make this look like that") | 🔜 Planned |
| Visual diff mode (before/after) | 🔜 Planned |
| Network request monitoring | 🔜 Planned |

---

## Development

```bash
pnpm run build      # Build all packages
pnpm run dev        # Watch mode
pnpm run typecheck  # Type check
pnpm run lint       # ESLint
pnpm run test       # Run tests
```

### Package Structure

```
packages/
├── core/              # Shared: CDP, security, framework detection
├── desktop/           # Electron app (recommended)
├── vscode-extension/  # VS Code extension
└── mcp-server/        # Standalone MCP server
```

---

## The Vision

Frontend development should feel like pair programming with someone who can see your screen.

Not: *"The button with class .submit-btn in the third row..."*

But: *clicks* *"This one. Fix it."*

**Claude Lens makes Claude Code visual.**

---

## License

MIT

---

<p align="center">
  <i>Built for developers who see their bugs before they describe them.</i>
</p>
