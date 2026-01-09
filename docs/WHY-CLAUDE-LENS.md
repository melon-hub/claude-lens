# Why Claude Lens?

> The missing link between what you see and what Claude knows

---

## The Problem

You're building a frontend. Something looks wrong. You can *see* it - the button is misaligned, the card has the wrong padding, the text is the wrong color.

Now you need to tell Claude about it.

**Today's workflow:**

```
1. Open browser DevTools
2. Find the element
3. Copy the selector, maybe some styles
4. Switch to Claude Code
5. Paste and explain: "This button with class .submit-btn has margin-left: 20px but it should be centered..."
6. Get Claude's fix
7. Apply it
8. Refresh
9. Check if it worked
10. Repeat
```

That's 10 steps. And if you need to compare two elements ("make this look like that"), or debug a console error, or check multiple components - each one restarts the loop.

**The deeper problem:** Every time you switch contexts, you lose momentum. Claude doesn't see what you see. You become a translator between your browser and your AI.

---

## The Gap in the Market

We researched every tool in this space. Here's what exists:

| Tool | What it does | The catch |
|------|--------------|-----------|
| **React Grab** | Click element → copies context to clipboard | **Spawns a new Claude session every time.** You lose conversation history. Can't say "now make it like the other one we fixed." |
| **browser-use** | AI controls browser, takes screenshots | **Per-task only.** Great for automation, not iterative development. No persistent conversation. |
| **Playwright MCP** | Claude can control browser via selectors | **You must know the selector.** No visual picking. "Click `.nav-item:nth-child(3)`" not "click that button." |
| **Chrome DevTools MCP** | Claude accesses DevTools data | **Programmatic only.** Great for debugging, but you're still describing elements in code. |
| **Stagehand** | Natural language + code browser control | **Per-task.** Designed for automation scripts, not conversational development. |

**Notice the pattern?**

- Visual tools = no conversation context
- Context-preserving tools = no visual selection

**No tool does both.**

---

## The Insight

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Visual Selection  ←──── THE GAP ────→  Conversation       │
│   (point at things)                      Context            │
│                                          (remember history) │
│                                                             │
│   React Grab                             Playwright MCP     │
│   browser-use                            DevTools MCP       │
│   Stagehand                                                 │
│                                                             │
│                     Claude Lens                             │
│                     fills the gap                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The magic of frontend development is *seeing* your work. The magic of Claude Code is *iterating* through conversation.

Claude Lens connects them.

---

## What Claude Lens Does

**You point. Claude sees. Conversation continues.**

```
You: *Ctrl+clicks a misaligned button in Claude Lens*

Claude: I see that button. It has:
        - margin-left: 20px
        - position: relative
        - parent is display: flex but not justify-content: center

        Want me to center it?

You: Yes

Claude: *edits the CSS*
        Done. I've also highlighted the button so you can verify.

You: Actually, can you make it match the style of the header button?

Claude: Which one? *highlights candidate buttons*

You: *Ctrl+clicks the header button*

Claude: Got it. The header button uses:
        - padding: 12px 24px (yours has 8px 16px)
        - border-radius: 8px (yours has 4px)
        - font-weight: 600 (yours has 400)

        Should I apply all of these, or just some?
```

**That last exchange is impossible with any other tool.** It requires:

1. Visual selection (you pointed at two things)
2. Conversation context (Claude remembered "the button" from earlier)
3. Iterative refinement (you're having a dialogue, not running tasks)

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                      VS Code                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                Claude Lens Panel                        │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │                                                  │  │ │
│  │  │     Your localhost app                           │  │ │
│  │  │     (live screenshot stream)                     │  │ │
│  │  │                                                  │  │ │
│  │  │     Ctrl+Click anywhere to inspect               │  │ │
│  │  │                                                  │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  │  Console errors stream to Claude automatically         │ │
│  └────────────────────────────────────────────────────────┘ │
│                              │                               │
│                              │ MCP (native)                  │
│                              ▼                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                Claude Code Terminal                     │ │
│  │  Same conversation. Full context. No switching.         │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**

1. **MCP-native** - Claude Lens speaks Claude Code's native protocol. No bridges, no hacks, no clipboard workarounds.

2. **Screenshot streaming** - You see your app live. Click coordinates map to real DOM elements via Chrome DevTools Protocol.

3. **Console capture** - Errors and warnings flow to Claude automatically. No copy-paste debugging.

4. **Security-first** - Localhost only by default. Secrets redacted from console logs. No external network access.

---

## The Workflow Revolution

### Before Claude Lens

```
[Browser] → [DevTools] → [Copy] → [Claude] → [Edit] → [Save] → [Refresh] → [Check]
    ↑                                                                          │
    └──────────────────────────────────────────────────────────────────────────┘
                              (manual loop, context lost each cycle)
```

### With Claude Lens

```
[Claude Lens Panel] ←──────────────────────→ [Claude Code]
        │                                          │
        │  click → context                         │
        │  highlight ← response                    │
        │  error → auto-report                     │
        │                                          │
        └──────────── same conversation ───────────┘
```

**One integrated environment. One conversation. Zero context switching.**

---

## What You Get

### Today (v0.2.1)

- **Standalone Electron Desktop App** - No VS Code required
- **VS Code Extension** - Embedded browser panel
- **25+ Playwright-Powered MCP Tools** - Full browser automation
  - Click, fill, type, hover, drag-and-drop, scroll
  - Wait for elements and network responses
  - Keyboard input and dropdown selection
  - Dialog handling (alert/confirm/prompt)
  - JavaScript execution
- Ctrl+Click element inspection (selector, styles, bounding box)
- Console error/warning capture with secret redaction
- Visual element highlighting
- Screenshot capture (viewport or element)
- 5-second default timeouts for fast feedback
- WSL support (auto-launches Windows Chrome)

### Coming Soon

- React/Vue component detection (map DOM to component source)
- Multi-element selection ("make this match that")
- Visual diff mode (before/after comparison)
- Network request monitoring

---

## Who This Is For

**Frontend developers using Claude Code who:**

- Build UIs iteratively (not just writing code blind)
- Want to point at problems instead of describing them
- Debug by seeing, not just reading stack traces
- Work in React, Vue, Svelte, or any web framework
- Value their conversation context with Claude

**Not for:**

- Automated testing (use Playwright MCP)
- Scraping/crawling (use browser-use)
- Production monitoring (use proper observability tools)

---

## The Vision

Frontend development should feel like pair programming with someone who can see your screen.

Not: "The button with class `.submit-btn` in the third row of the grid..."

But: *clicks button* "This one. Fix it."

Claude Lens makes Claude Code visual.

---

## Technical Foundation

| Component | Technology | Why |
|-----------|------------|-----|
| Browser control | Playwright via CDP | Full automation API with Electron BrowserView control |
| Claude integration | Model Context Protocol (MCP) | Native Claude Code support |
| VS Code integration | Extension + Webview | Where developers already work |
| Desktop app | Electron | Standalone option, embedded browser + terminal |
| Security | Localhost-only, CSP, secret redaction | Privacy by design |

**Built on proven technology, not hacks.**

---

## Get Started

```bash
# Clone
git clone https://github.com/melon-hub/claude-lens.git
cd claude-lens

# Install
pnpm install

# Build
pnpm run build

# Run (VS Code)
# Press F5 in VS Code to launch Extension Development Host
# Then: Ctrl+Shift+P → "Claude Lens: Open Browser Panel"
```

---

## Comparison Summary

| Feature | React Grab | browser-use | Playwright MCP | Claude Lens |
|---------|------------|-------------|----------------|-------------|
| Visual element selection | Yes | Yes | No (selectors) | **Yes** |
| Conversation context | No (new session) | No (per-task) | Yes | **Yes** |
| Console streaming | No | No | No | **Yes** |
| Highlight elements | No | Yes | Yes | **Yes** |
| No app modification | No (npm install) | Yes | Yes | **Yes** |
| Screenshots to Claude | No | Yes | Yes | **Yes** |
| MCP native | No | No | Yes | **Yes** |

**Claude Lens is the only tool that combines visual selection with persistent conversation context.**

---

## The Bottom Line

Every other tool makes you choose:

- **Visual** but stateless (React Grab, browser-use)
- **Contextual** but blind (Playwright MCP, DevTools MCP)

Claude Lens refuses to choose.

Point at what's broken. Talk to Claude about it. Keep the conversation going.

That's it. That's the product.

---

*Built for developers who see their bugs before they describe them.*
