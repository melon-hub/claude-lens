/**
 * Character substitution for MCP output
 *
 * Handles replacing MCP indicator characters with semantic icons
 * for better readability in the terminal.
 */

import {
  MCP_TOOL_ICONS,
  CHAR_SUBSTITUTIONS,
  MCP_INDICATORS,
} from '../constants/mcp-tool-icons';

/**
 * Substitute characters in terminal output
 * Detects MCP patterns and uses semantic icons
 *
 * @param data - Raw terminal data
 * @returns Processed data with substituted characters
 */
export function substituteChars(data: string): string {
  let result = data;

  // For each MCP indicator character, check if it's followed by a known pattern
  for (const indicator of MCP_INDICATORS) {
    if (!result.includes(indicator)) continue;

    // Find all occurrences of the indicator
    const regex = new RegExp(indicator + '\\s*(.{0,50})', 'g');
    result = result.replace(regex, (_match, afterIndicator) => {
      // Check each MCP tool pattern
      for (const tool of MCP_TOOL_ICONS) {
        if (tool.pattern.test(afterIndicator)) {
          // Replace indicator with semantic icon, optionally transform text
          const displayText = tool.transform || afterIndicator;
          return tool.icon + ' ' + displayText;
        }
      }
      // Fallback: use basic substitution
      const fallback = CHAR_SUBSTITUTIONS[indicator] || indicator;
      return fallback + ' ' + afterIndicator;
    });
  }

  // Also do basic substitution for any remaining characters
  for (const [from, to] of Object.entries(CHAR_SUBSTITUTIONS)) {
    if (result.includes(from)) {
      result = result.split(from).join(to);
    }
  }

  return result;
}
