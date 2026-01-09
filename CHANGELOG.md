# Changelog

All notable changes to Claude Lens will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-09

### Added
- MIT LICENSE file for open-source release
- CONTRIBUTING.md with development guidelines
- ARCHITECTURE.md with system design overview
- Package READMEs for core, desktop, mcp-server, vscode-extension
- API documentation (docs/api/HTTP-BRIDGE.md, docs/api/MCP-TOOLS.md)
- Repository metadata in package.json (homepage, bugs, keywords)

### Fixed
- Removed hardcoded user paths from extension.ts
- Added .mcp.json and .claude/ to .gitignore to prevent local config exposure

### Changed
- Aligned package versions (desktop/core/mcp-server: 0.2.0, vscode-extension: 0.1.0)
- Updated esbuild dependency for security

## [0.1.7] - 2026-01-09

### Added
- `claude_lens/reload` MCP tool - Claude can now reload the browser after making code changes
- Unicode11 addon for better terminal icon/emoji rendering
- Local `.mcp.json` configuration for project-specific MCP server setup
- HTTP API fallback documentation in CLAUDE.md

### Fixed
- PTY exit handling - "Start Claude" button now properly resets when Claude exits (using `exec` to replace shell)
- MCP server connection issues - Added local `.mcp.json` so Claude Code finds the MCP server when running from desktop package directory

### Changed
- Updated CLAUDE.md with comprehensive tool documentation and HTTP API fallback instructions

## [0.1.6] - 2026-01-08

### Added
- React component detection - detects React fiber tree and displays component info
- Bridge server on port 9333 for MCP server communication
- Component info section in context panel showing framework and component details
- CLAUDE.md file with instructions for Claude Code inside the app

### Fixed
- Version display now shows correct version (was hardcoded)

## [0.1.5] - 2026-01-08

### Added
- Three-column layout: Browser | Context Panel | Claude Code Terminal
- Cursor-style element inspection with hover tooltips
- Context panel with collapsible sections (Element, Path, Attributes, Styles, Size, Text)
- Element chip for inserting element references into prompts
- Console message capture and display
- Resizable panels with drag handles

### Core Features
- Embedded BrowserView for localhost development
- Integrated Claude Code terminal with PTY
- Element inspection via Ctrl+Click
- Real-time console log forwarding
- MCP tools for browser interaction:
  - `claude_lens/screenshot` - Capture page screenshots
  - `claude_lens/inspect_element` - Get element details
  - `claude_lens/highlight_element` - Highlight elements visually
  - `claude_lens/get_console` - Retrieve console logs
  - `claude_lens/navigate` - Navigate to URLs

## [0.1.0] - 2026-01-07

### Added
- Initial release
- Basic Electron app with embedded browser
- Claude Code terminal integration
- Simple element inspection
