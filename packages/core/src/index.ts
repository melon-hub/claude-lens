/**
 * @claude-lens/core
 *
 * Core library for Claude Lens providing:
 * - Browser adapters (CDP, embedded Electron)
 * - Claude adapters (MCP, API)
 * - Inspector logic
 * - Console capture
 * - Element highlighting
 * - Security utilities
 */

export * from './browser/index.js';
export * from './claude/index.js';
export * from './inspector/index.js';
export * from './console/index.js';
export * from './highlighter/index.js';
export * from './security/index.js';
export * from './bridge/index.js';
export * from './utils/index.js';
