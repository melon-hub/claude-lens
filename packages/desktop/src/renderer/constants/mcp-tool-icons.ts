/**
 * MCP Tool Icons Constants
 *
 * Pattern detection with semantic icons (Nerd Font) for MCP tool results.
 * Format: [pattern to match after indicator, replacement icon, description]
 * Some patterns also transform the text for better UX.
 */

export interface McpToolIcon {
  pattern: RegExp;
  icon: string;
  name: string;
  transform?: string;
}

export const MCP_TOOL_ICONS: McpToolIcon[] = [
  // Screenshot/Image tools
  { pattern: /Screenshot captured/i, icon: '\uF030', name: 'camera' },
  { pattern: /\[Image\]/i, icon: '\uF03E', name: 'image', transform: 'Attached to context' },
  { pattern: /Taking screenshot/i, icon: '\uF030', name: 'camera' },

  // File operations
  { pattern: /Read \d+ lines?/i, icon: '\uF15C', name: 'file-text' },
  { pattern: /Error reading/i, icon: '\uF071', name: 'warning' },

  // MCP/Playwright errors - make them stand out
  { pattern: /Error:.*Timeout/i, icon: '\uF017', name: 'clock' },
  { pattern: /Error:.*not a valid selector/i, icon: '\uF06A', name: 'exclamation-circle' },
  { pattern: /Error:.*Failed to execute/i, icon: '\uF06A', name: 'exclamation-circle' },
  { pattern: /DOMException/i, icon: '\uF06A', name: 'exclamation-circle' },
  { pattern: /waiting for locator/i, icon: '\uF017', name: 'clock' },
  { pattern: /Write.*success/i, icon: '\uF0C7', name: 'save' },
  { pattern: /Created file/i, icon: '\uF15B', name: 'file-new' },
  { pattern: /Edited file/i, icon: '\uF044', name: 'edit' },

  // Search operations
  { pattern: /Found \d+ (?:lines?|matches?|files?)/i, icon: '\uF002', name: 'search' },
  { pattern: /No matches/i, icon: '\uF00D', name: 'times' },
  { pattern: /Searching/i, icon: '\uF002', name: 'search' },

  // Browser/Navigation - MCP actions
  { pattern: /Navigate/i, icon: '\uF0AC', name: 'globe' },
  { pattern: /Page loaded/i, icon: '\uF0AC', name: 'globe' },
  { pattern: /Clicked button/i, icon: '\uF25A', name: 'hand-pointer' },
  { pattern: /Clicked/i, icon: '\uF245', name: 'pointer' },
  { pattern: /Click/i, icon: '\uF245', name: 'pointer' },
  { pattern: /Type|Fill/i, icon: '\uF11C', name: 'keyboard' },
  { pattern: /Hover/i, icon: '\uF245', name: 'pointer' },

  // Execution/Commands
  { pattern: /Command.*exit/i, icon: '\uF120', name: 'terminal' },
  { pattern: /Running/i, icon: '\uF04B', name: 'play' },
  { pattern: /Executed/i, icon: '\uF0E7', name: 'bolt' },

  // Git operations
  { pattern: /Commit/i, icon: '\uF1D3', name: 'git' },
  { pattern: /Branch/i, icon: '\uE0A0', name: 'git-branch' },
  { pattern: /Push|Pull/i, icon: '\uF0C2', name: 'cloud' },

  // API/Network
  { pattern: /Fetching|Request/i, icon: '\uF0C1', name: 'link' },
  { pattern: /Response/i, icon: '\uF063', name: 'arrow-down' },
];

/**
 * Basic character substitution for missing glyphs (fallback)
 */
export const CHAR_SUBSTITUTIONS: Record<string, string> = {
  '\u23F5': '\u25B6', // ⏵ → ▶ (play button)
  '\u23F1': '\u25CF', // ⏱ → ● (stopwatch → bullet)
  '\u23BF': '\u25B8', // ⎿ → ▸ (indicator)
  '\u23F4': '\u25C0', // ⏴ → ◀ (reverse)
  '\u23F9': '\u25A0', // ⏹ → ■ (stop)
  '\u23FA': '\u25CF', // ⏺ → ● (record)
};

/**
 * The indicator characters Claude Code uses for MCP results
 */
export const MCP_INDICATORS = ['\u23F5', '\u23F1', '\u23BF'];
