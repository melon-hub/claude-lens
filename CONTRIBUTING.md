# Contributing to Claude Lens

Thank you for your interest in contributing to Claude Lens! This document provides guidelines and information for contributors.

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm 8+
- Chrome browser (for testing)

### Installation

```bash
# Clone the repository
git clone https://github.com/melon-hub/claude-lens.git
cd claude-lens

# Install dependencies
pnpm install

# Build all packages
pnpm run build
```

### Development Workflow

**Desktop App:**
```bash
cd packages/desktop
pnpm run dev
```

**VS Code Extension:**
1. Open `packages/vscode-extension` in VS Code
2. Press F5 to launch Extension Development Host
3. Run command: "Claude Lens: Open Browser Panel"

**MCP Server (standalone):**
```bash
cd packages/mcp-server
pnpm run build
node dist/index.js
```

## Package Structure

| Package | Description | Key Files |
|---------|-------------|-----------|
| `core` | Browser adapters, security, bridge (UI-agnostic) | `cdp-adapter.ts`, `bridge/index.ts` |
| `desktop` | Electron app with embedded browser | `main/index.ts`, `renderer/main.ts` |
| `mcp-server` | MCP tools for Claude Code | `index.ts` |
| `vscode-extension` | VS Code extension | `extension.ts` |

### Dependency Flow

```
desktop → core
vscode-extension → core
mcp-server → core (via bridge)
```

The `core` package must remain UI-agnostic - no Electron or VS Code dependencies.

## Code Style

- **TypeScript**: Strict mode enabled
- **Linting**: ESLint with TypeScript rules
- **Formatting**: Consistent indentation (2 spaces)

### Key Conventions

1. **MCP Handlers**: Never throw exceptions - return `{ isError: true }` format
2. **Input Validation**: Use Zod schemas for all MCP tool inputs
3. **Security**: All URLs validated through `isAllowedUrl()` (localhost only)
4. **Secrets**: Console output passed through `redactSecrets()`

## Making Changes

### Before You Start

1. Check existing issues for related discussions
2. For new features, open an issue first to discuss the approach
3. Fork the repository and create a feature branch

### Development Process

1. Make your changes
2. Run type checking: `pnpm typecheck`
3. Run linting: `pnpm lint`
4. Build all packages: `pnpm run build`
5. Test your changes manually

### Testing

Currently, the project uses manual integration testing:

- **Desktop**: Launch app, verify MCP tools work
- **VS Code Extension**: Launch in Extension Development Host
- **MCP Server**: Test with Claude Code in terminal

## Pull Request Process

1. **Branch naming**: `feature/description` or `fix/description`
2. **Commit messages**: Use conventional commits format
   - `feat: add new feature`
   - `fix: resolve bug`
   - `docs: update documentation`
   - `chore: maintenance tasks`
3. **PR description**: Clearly explain what changes were made and why
4. **Link issues**: Reference related issues with `Fixes #123`

### PR Checklist

- [ ] Code builds without errors (`pnpm run build`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Changes are documented if needed
- [ ] No hardcoded paths or secrets

## Architecture Overview

### Communication Flow

```
User clicks element in Browser
         ↓
CDP (Chrome DevTools Protocol)
         ↓
CDPAdapter captures element info
         ↓
Bridge Server (HTTP on :9333)
         ↓
MCP Server queries via Bridge Client
         ↓
Claude Code receives context
```

### Key Design Decisions

1. **HTTP Bridge**: MCP server runs in separate process, HTTP enables cross-process communication
2. **CDP over Puppeteer**: Direct CDP access provides full DevTools capabilities without extra abstraction
3. **Core as shared library**: Keeps browser logic separate from UI implementations

## Getting Help

- **Issues**: Open a GitHub issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
