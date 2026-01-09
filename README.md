# Claude Lens

> **Point at what's broken. Talk to Claude about it. Keep the conversation going.**

Visual web development companion for Claude Code that bridges what you *see* with what Claude *knows*.

**Status:** Working Prototype | VS Code Extension (v0.1.0) | Desktop App (v0.2.0)

---

## The Problem

You're debugging a frontend issue. You can *see* it - the button is misaligned, the card has wrong padding. Now you need to explain it to Claude:

1. Open browser DevTools
2. Find the element, copy selector and styles
3. Switch to Claude Code
4. Paste and explain what's wrong
5. Get the fix, apply it, refresh, check
6. Repeat

**Every context switch breaks your flow.** Claude doesn't see what you see. You become a translator.

---

## The Gap in the Market

We researched every tool in this space:

| Tool | Visual Selection | Conversation Context | The Catch |
|------|:----------------:|:--------------------:|-----------|
| **React Grab** | ✅ | ❌ | Spawns new Claude session each time. No memory of previous fixes. |
| **browser-use** | ✅ | ❌ | Per-task only. Great for automation, not iterative dev. |
| **Playwright MCP** | ❌ | ✅ | Selector-based. You must know `.nav-item:nth-child(3)`, can't just click. |
| **Chrome DevTools MCP** | ❌ | ✅ | Programmatic only. Powerful debugging, but no visual picking. |
| **Stagehand** | ✅ | ❌ | Designed for automation scripts, not conversational development. |
| **Claude Lens** | ✅ | ✅ | **Both.** Point at things AND keep your conversation. |

**The pattern:** Visual tools lose context. Context-preserving tools aren't visual. **No tool does both - until now.**

---

## How Claude Lens Is Different

### Feature Comparison

| Capability | React Grab | browser-use | Playwright MCP | DevTools MCP | **Claude Lens** |
|------------|:----------:|:-----------:|:--------------:|:------------:|:---------------:|
| Click to select element | ✅ | ✅ | ❌ | ❌ | ✅ |
| Same Claude conversation | ❌ | ❌ | ✅ | ✅ | ✅ |
| Console error streaming | ❌ | ❌ | ❌ | ✅ | ✅ |
| Claude can highlight back | ❌ | ✅ | ✅ | ❌ | ✅ |
| Screenshots to Claude | ❌ | ✅ | ✅ | ❌ | ✅ |
| No app modification needed | ❌ | ✅ | ✅ | ✅ | ✅ |
| MCP native (Claude Code) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Secret redaction | ❌ | ❌ | ❌ | ❌ | ✅ |

### Integration Architecture

Claude Lens combines the best of each approach:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CLAUDE LENS INTEGRATES:                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   From React Grab:        Visual element selection (click, not code)    │
│   From browser-use:       Screenshot streaming + element highlighting   │
│   From Playwright MCP:    MCP-native Claude Code integration            │
│   From DevTools MCP:      Console capture + deep browser inspection     │
│                                                                         │
│   + UNIQUE:               Persistent conversation context               │
│                           (no new sessions, Claude remembers)           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## What This Looks Like

```
You: *Ctrl+clicks a misaligned button in Claude Lens*

Claude: I see that button. It has:
        - margin-left: 20px
        - position: relative
        - parent is flex but not centered

        Want me to center it?

You: Yes

Claude: Done. I've highlighted the button so you can verify.

You: Actually, make it match the header button's style

You: *Ctrl+clicks the header button*

Claude: Got it. The header button uses:
        - padding: 12px 24px (yours has 8px 16px)
        - border-radius: 8px (yours has 4px)
        - font-weight: 600 (yours has 400)

        Apply all of these?
```

**That last exchange is impossible with other tools.** It requires visual selection + conversation memory + iterative refinement.

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+

### Installation

```bash
git clone https://github.com/melon-hub/claude-lens.git
cd claude-lens
pnpm install
pnpm run build
```

### Option A: Desktop App (Recommended)

The desktop app provides the best experience with a real embedded browser and integrated Claude Code terminal.

```bash
cd packages/desktop
pnpm run dev
```

Features:
- **Real browser** (not screenshots) - full interaction
- **Integrated Claude Code terminal** - no context switching
- **Hover tooltips** - see element selectors as you move
- **One-click inspect** - click element → instantly sent to Claude

### Option B: VS Code Extension

For those who prefer staying in VS Code:

1. Open claude-lens in VS Code
2. Press `F5` to launch Extension Development Host
3. `Ctrl+Shift+P` → "Claude Lens: Open Browser Panel"
4. Enter localhost URL → Click "Go"
5. `Ctrl+Click` any element to inspect

### Connect MCP Server to Claude Code

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

---

## Features

### Desktop App (v0.1.5)

| Feature | Description |
|---------|-------------|
| **Real Embedded Browser** | Full BrowserView - not screenshots, real browser interaction |
| **Integrated Claude Terminal** | Claude Code runs inside the app via PTY |
| **Hover Tooltips** | See element selectors as you hover |
| **One-Click to Claude** | Click element → instantly sent to Claude conversation |
| **Console Drawer** | Live console errors/warnings with filtering |
| **Framework Detection** | Detects React, Vue, Svelte, Angular components |

### VS Code Extension (v0.0.1)

| Feature | Description |
|---------|-------------|
| **Browser Panel** | Screenshot streaming from Chrome via CDP |
| **Element Inspection** | Ctrl+Click any element → selector, styles, bounding box |
| **Console Streaming** | Errors and warnings automatically flow to Claude |
| **Secret Redaction** | API keys, tokens, JWTs automatically redacted |
| **Element Highlighting** | Claude can highlight elements in your browser |
| **Screenshots** | Full page or element screenshots as MCP image content |
| **WSL Support** | Auto-launches Windows Chrome from WSL |

### Core Features (Both)

| Feature | Description |
|---------|-------------|
| **React/Vue/Svelte/Angular Detection** | Identifies component names and source files |
| **MCP Integration** | Native Claude Code tools |
| **Localhost Security** | Only allows local development URLs |
| **Secret Redaction** | Automatically redacts API keys, tokens, credentials |

### MCP Tools

| Tool | Description |
|------|-------------|
| `claude_lens_inspect_element` | Get element info from last click or by selector |
| `claude_lens_highlight_element` | Highlight element in browser (color, duration) |
| `claude_lens_navigate` | Navigate to URL (localhost only, security) |
| `claude_lens_get_console` | Get console messages (filter by level) |
| `claude_lens_screenshot` | Capture viewport or specific element |

### Roadmap

#### Automation Tools (browser-use style)

| Tool | Description | Status |
|------|-------------|--------|
| `claude_lens_click` | Claude clicks an element by selector | 🔜 Planned |
| `claude_lens_type` | Claude types into input fields | 🔜 Planned |
| `claude_lens_scroll` | Claude scrolls the page | 🔜 Planned |
| `claude_lens_hover` | Claude hovers over elements | 🔜 Planned |
| `claude_lens_wait_for` | Claude waits for element/condition | 🔜 Planned |
| `claude_lens_select` | Claude selects dropdown options | 🔜 Planned |

**Example workflow with automation:**
```
You: Test the login form with invalid credentials

Claude: I'll test the login form now.
        *clicks email field*
        *types "invalid@test.com"*
        *clicks password field*
        *types "wrongpassword"*
        *clicks submit button*

        I see an error message appeared: "Invalid credentials"
        The form is working correctly. Want me to test valid credentials too?
```

#### Other Planned Features

| Feature | Status | Description |
|---------|--------|-------------|
| React/Vue detection | ✅ Done | Map DOM elements to component source files |
| Standalone app | ✅ Done | Electron desktop app (v0.1.5) |
| Multi-element select | 🔜 Planned | "Make this look like that" workflow |
| Visual diff mode | 🔜 Planned | Before/after comparison |
| Network monitoring | 🔜 Planned | Failed requests auto-reported |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VS Code                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   Claude Lens Panel                          ││
│  │  ┌────────────────────────────────────────────────────────┐ ││
│  │  │  Your localhost app (screenshot stream @ 5fps)         │ ││
│  │  │  Ctrl+Click anywhere to inspect                        │ ││
│  │  └────────────────────────────────────────────────────────┘ ││
│  │  [Console errors stream here]                                ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│                         MCP (native)                             │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Claude Code (same conversation)                 ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                               │
                          CDP (:9222)
                               │
┌──────────────────────────────┴──────────────────────────────────┐
│                      Chrome Browser                              │
│                   (your localhost app)                           │
└─────────────────────────────────────────────────────────────────┘
```

### Package Structure

```
packages/
├── core/              # @claude-lens/core - shared functionality
│   ├── browser/       # CDP adapter, Chrome launcher, framework detection
│   ├── security/      # URL validation, secret redaction
│   ├── bridge/        # HTTP bridge for MCP ↔ Extension
│   └── inspector/     # Element inspection logic
│
├── desktop/           # Electron desktop app (recommended)
│   ├── main/          # Main process - BrowserView, PTY, MCP server
│   └── renderer/      # UI - browser panel, console drawer, Claude terminal
│
├── vscode-extension/  # VS Code extension (alternative)
│
└── mcp-server/        # Standalone MCP server for Claude Code
```

---

## Security

| Protection | Implementation |
|------------|----------------|
| **Localhost only** | URLs validated against `localhost`, `127.0.0.1`, `[::1]` |
| **Secret redaction** | OpenAI keys, GitHub PATs, AWS keys, JWTs, connection strings auto-redacted |
| **No external network** | Extension never makes external requests |
| **CSP enforced** | Strict Content Security Policy in webview |
| **Input validation** | All MCP tool params validated with Zod |

---

## Why Not Just Use...?

| Tool | Why Claude Lens instead |
|------|-------------------------|
| **React Grab** | Lose conversation every click. Can't say "now fix the other one." |
| **browser-use** | Per-task agent, not conversational. Designed for automation. |
| **Playwright MCP** | Must know selectors. Can't point at things. |
| **DevTools MCP** | No visual selection. Great for debugging, not iterative UI work. |
| **Cursor's browser** | Proprietary. Claude Lens is open source and MCP-native. |

---

## vs Cursor's Built-in Browser

Cursor has an integrated browser. Here's how Claude Lens compares:

| Capability | Cursor Browser | Claude Lens Desktop | Claude Lens VS Code |
|------------|:--------------:|:-------------------:|:-------------------:|
| Embedded in IDE/App | ✅ | ✅ | ✅ |
| Live browser view | ✅ Real browser | ✅ Real browser | ⚠️ Screenshot stream |
| User clicks to inspect | ✅ | ✅ | ✅ |
| Hover tooltips | ✅ | ✅ | ❌ |
| **AI clicks autonomously** | ✅ | 🔜 Planned | 🔜 Planned |
| **AI fills forms** | ✅ | 🔜 Planned | 🔜 Planned |
| Console access | ✅ | ✅ | ✅ |
| Framework detection | ? | ✅ React/Vue/Svelte/Angular | ✅ |
| AI conversation context | ✅ Cursor AI | ✅ Claude Code | ✅ Claude Code |
| Works outside Cursor | ❌ | ✅ | ✅ |
| Works with Claude Code | ❌ | ✅ | ✅ |
| Open source | ❌ | ✅ | ✅ |

**Honest comparison:**
- Cursor's browser has AI automation (clicking, typing) that we're still building
- Claude Lens Desktop now has a real embedded browser (BrowserView), matching Cursor's approach
- Claude Lens is open source and designed for Claude Code's MCP ecosystem

**The real difference:** Cursor's browser is proprietary and Cursor-only. Claude Lens is open, extensible, and Claude Code native.

---

## Development

```bash
pnpm run build      # Build all packages
pnpm run typecheck  # Type check
pnpm run dev        # Watch mode
pnpm run lint       # ESLint
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
