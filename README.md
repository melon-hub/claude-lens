# Claude Lens

> Visual web development companion for Claude Code

**Status:** Planning / Pre-development

## What is this?

Claude Lens is a tool that lets you point at elements in your web app and talk to Claude about them - without losing your conversation context.

```
You: *clicks misaligned button*
Claude: I see that button has margin-left: 20px. Want me to center it?
You: Yes
Claude: *edits CSS, highlights the fixed button* Is this what you wanted?
```

## The Problem

Current tools are fragmented:
- **React Grab** spawns new sessions (loses context)
- **Playwright MCP** is programmatic, not visual
- **Chrome DevTools MCP** requires thinking in selectors

You end up copy-pasting errors, describing layouts in words, and hoping the AI understands.

## The Solution

An embedded browser that:
- Click element → context sent to Claude (same session)
- Console errors → auto-streamed to Claude
- Claude can highlight elements back to you
- Works in VS Code or standalone

## Deployment Modes

| Mode | Browser | Claude Connection |
|------|---------|-------------------|
| VS Code Extension | Embedded Electron | MCP (native) |
| Standalone App | Electron | Claude API |
| External Browser | Chrome via CDP | Either |

## Documentation

- [Project Scope](docs/plans/project-scope.md) - Full technical specification

## Status

This project is in the planning phase. See the scope document for implementation timeline and architecture details.

## License

TBD (likely MIT)
