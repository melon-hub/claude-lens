#!/usr/bin/env node
/**
 * Claude Lens MCP Server
 *
 * Provides tools for element inspection and highlighting
 * to Claude Code via the Model Context Protocol.
 *
 * Communicates with the VS Code extension via local HTTP bridge.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { BridgeClient, redactSecrets, isAllowedUrl } from '@claude-lens/core';

// Bridge client to communicate with VS Code extension
const bridge = new BridgeClient();

// Tool schemas
const InspectElementSchema = z.object({
  selector: z.string().optional().describe('CSS selector (if omitted, uses last clicked element)'),
});

const HighlightElementSchema = z.object({
  selector: z.string().describe('CSS selector of element to highlight'),
  color: z.string().optional().default('#3b82f6').describe('Highlight color'),
  duration: z.number().optional().describe('Duration in ms (0 = permanent)'),
});

const NavigateSchema = z.object({
  url: z.string().describe('URL to navigate to (must be localhost)'),
});

const GetConsoleSchema = z.object({
  level: z.enum(['all', 'error', 'warn', 'log']).optional().default('error'),
  limit: z.number().optional().default(20),
});

const ScreenshotSchema = z.object({
  selector: z.string().optional().describe('Element selector (omit for full viewport)'),
});

// Automation schemas
const ClickSchema = z.object({
  selector: z.string().describe('CSS selector of element to click'),
  button: z.enum(['left', 'right', 'middle']).optional().default('left'),
  clickCount: z.number().optional().default(1),
  delay: z.number().optional().describe('Delay before clicking (ms)'),
});

const TypeSchema = z.object({
  selector: z.string().describe('CSS selector of input element'),
  text: z.string().describe('Text to type'),
  clearFirst: z.boolean().optional().default(false),
  delay: z.number().optional().describe('Delay between keystrokes (ms)'),
});

const WaitForSchema = z.object({
  selector: z.string().describe('CSS selector to wait for'),
  timeout: z.number().optional().default(5000),
  visible: z.boolean().optional().default(true),
});

// Playwright-powered tool schemas
const FillSchema = z.object({
  selector: z.string().describe('CSS selector of input element'),
  value: z.string().describe('Value to fill (clears existing value first)'),
});

const SelectOptionSchema = z.object({
  selector: z.string().describe('CSS selector of select element'),
  values: z.union([z.string(), z.array(z.string())]).describe('Option value(s) to select'),
});

const HoverSchema = z.object({
  selector: z.string().describe('CSS selector of element to hover'),
});

const PressKeySchema = z.object({
  key: z.string().describe('Key to press (e.g., "Enter", "Tab", "Escape", "ArrowDown")'),
});

const DragAndDropSchema = z.object({
  source: z.string().describe('CSS selector of element to drag'),
  target: z.string().describe('CSS selector of drop target'),
});

const ScrollSchema = z.object({
  selector: z.string().optional().describe('CSS selector to scroll into view'),
  direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  distance: z.number().optional().default(100).describe('Scroll distance in pixels'),
});

const WaitForResponseSchema = z.object({
  urlPattern: z.string().describe('URL pattern to wait for (string or regex pattern)'),
  timeout: z.number().optional().default(10000),
});

const GetTextSchema = z.object({
  selector: z.string().describe('CSS selector of element'),
});

const GetAttributeSchema = z.object({
  selector: z.string().describe('CSS selector of element'),
  name: z.string().describe('Attribute name to get'),
});

const IsVisibleSchema = z.object({
  selector: z.string().describe('CSS selector to check'),
});

const IsEnabledSchema = z.object({
  selector: z.string().describe('CSS selector to check'),
});

const IsCheckedSchema = z.object({
  selector: z.string().describe('CSS selector of checkbox/radio'),
});

const EvaluateSchema = z.object({
  script: z.string().describe('JavaScript code to execute in browser context'),
});

const DialogHandlerSchema = z.object({
  action: z.enum(['accept', 'dismiss']).describe('How to handle dialogs (alerts, confirms, prompts)'),
});

const SetViewportSchema = z.object({
  preset: z.enum(['full', 'desktop', 'tablet-landscape', 'tablet', 'mobile-large', 'mobile', 'custom'])
    .optional()
    .describe('Viewport preset (or "custom" with width)'),
  width: z.number().min(320).max(3840).optional()
    .describe('Custom width in pixels (320-3840). Only used when preset is "custom" or omitted.'),
});

// Create server
const server = new Server(
  {
    name: 'claude-lens',
    version: '0.0.1',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'claude_lens/inspect_element',
        description:
          'Inspect a DOM element and get its properties, styles, and bounding box. Use this after the user clicks an element in Claude Lens.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector (if omitted, uses last clicked element)',
            },
          },
        },
      },
      {
        name: 'claude_lens/highlight_element',
        description:
          'Highlight an element in the browser to show the user. Use this to visually indicate which element you are referring to.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector of element to highlight',
            },
            color: {
              type: 'string',
              description: 'Highlight color (default: #3b82f6)',
            },
            duration: {
              type: 'number',
              description: 'Duration in ms (0 = permanent, default: 3000)',
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'claude_lens/navigate',
        description: 'Navigate the browser to a URL. Only localhost URLs are allowed for security.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to navigate to (must be localhost)',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'claude_lens/get_console',
        description:
          'Get recent console messages from the browser. Useful for debugging errors and warnings.',
        inputSchema: {
          type: 'object',
          properties: {
            level: {
              type: 'string',
              enum: ['all', 'error', 'warn', 'log'],
              description: 'Filter by log level (default: error)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of messages to return (default: 20)',
            },
          },
        },
      },
      {
        name: 'claude_lens/screenshot',
        description:
          'Take a screenshot of the page or a specific element. Returns base64-encoded PNG.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'Element selector (omit for full viewport)',
            },
          },
        },
      },
      {
        name: 'claude_lens/reload',
        description:
          'Reload the browser page. Use this after making code changes to see the updated result.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'claude_lens/click',
        description:
          'Click an element in the browser. Use this to interact with buttons, links, checkboxes, and other clickable elements.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector of element to click',
            },
            button: {
              type: 'string',
              enum: ['left', 'right', 'middle'],
              description: 'Mouse button (default: left)',
            },
            clickCount: {
              type: 'number',
              description: '1 for single-click, 2 for double-click (default: 1)',
            },
            delay: {
              type: 'number',
              description: 'Delay before clicking in ms',
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'claude_lens/type',
        description:
          'Type text into an input field or textarea. Focuses the element first, then types each character.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector of input element',
            },
            text: {
              type: 'string',
              description: 'Text to type',
            },
            clearFirst: {
              type: 'boolean',
              description: 'Clear existing value before typing (default: false)',
            },
            delay: {
              type: 'number',
              description: 'Delay between keystrokes in ms',
            },
          },
          required: ['selector', 'text'],
        },
      },
      {
        name: 'claude_lens/wait_for',
        description:
          'Wait for an element to appear in the DOM. Use before interacting with dynamically loaded content.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector to wait for',
            },
            timeout: {
              type: 'number',
              description: 'Maximum wait time in ms (default: 5000)',
            },
            visible: {
              type: 'boolean',
              description: 'Wait for element to be visible, not just present (default: true)',
            },
          },
          required: ['selector'],
        },
      },
      // Playwright-powered tools
      {
        name: 'claude_lens/browser_snapshot',
        description:
          'Get an accessibility tree snapshot of the page. This is much faster than screenshots for understanding page structure and finding elements.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'claude_lens/fill',
        description:
          'Fill an input field, clearing any existing value first. Better than type() for form inputs.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector of input element' },
            value: { type: 'string', description: 'Value to fill' },
          },
          required: ['selector', 'value'],
        },
      },
      {
        name: 'claude_lens/select_option',
        description: 'Select an option from a dropdown/select element.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector of select element' },
            values: {
              oneOf: [
                { type: 'string', description: 'Single option value' },
                { type: 'array', items: { type: 'string' }, description: 'Multiple option values' },
              ],
            },
          },
          required: ['selector', 'values'],
        },
      },
      {
        name: 'claude_lens/hover',
        description: 'Hover over an element to trigger hover states or tooltips.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector of element to hover' },
          },
          required: ['selector'],
        },
      },
      {
        name: 'claude_lens/press_key',
        description:
          'Press a keyboard key. Use for Enter, Tab, Escape, arrow keys, etc.',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Key to press (e.g., "Enter", "Tab", "Escape", "ArrowDown", "Control+a")',
            },
          },
          required: ['key'],
        },
      },
      {
        name: 'claude_lens/drag_and_drop',
        description: 'Drag an element and drop it on another element.',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'CSS selector of element to drag' },
            target: { type: 'string', description: 'CSS selector of drop target' },
          },
          required: ['source', 'target'],
        },
      },
      {
        name: 'claude_lens/scroll',
        description: 'Scroll the page or scroll an element into view.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector to scroll into view (optional)' },
            direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction' },
            distance: { type: 'number', description: 'Scroll distance in pixels (default: 100)' },
          },
        },
      },
      {
        name: 'claude_lens/wait_for_response',
        description: 'Wait for a specific network response. Use after actions that trigger API calls.',
        inputSchema: {
          type: 'object',
          properties: {
            urlPattern: { type: 'string', description: 'URL pattern to match (e.g., "/api/users")' },
            timeout: { type: 'number', description: 'Maximum wait time in ms (default: 10000)' },
          },
          required: ['urlPattern'],
        },
      },
      {
        name: 'claude_lens/get_text',
        description: 'Get the text content of an element.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector of element' },
          },
          required: ['selector'],
        },
      },
      {
        name: 'claude_lens/get_attribute',
        description: 'Get an attribute value from an element.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector of element' },
            name: { type: 'string', description: 'Attribute name (e.g., "href", "src", "data-id")' },
          },
          required: ['selector', 'name'],
        },
      },
      {
        name: 'claude_lens/is_visible',
        description: 'Check if an element is visible on the page.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector to check' },
          },
          required: ['selector'],
        },
      },
      {
        name: 'claude_lens/is_enabled',
        description: 'Check if a form element is enabled (not disabled).',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector to check' },
          },
          required: ['selector'],
        },
      },
      {
        name: 'claude_lens/is_checked',
        description: 'Check if a checkbox or radio button is checked.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector of checkbox/radio' },
          },
          required: ['selector'],
        },
      },
      {
        name: 'claude_lens/evaluate',
        description:
          'Run JavaScript in the browser context. Can query DOM, read computed styles, access window/document, and return structured data. ' +
          'Supports multiple operations in one call. ' +
          'Note: For form inputs in React/Vue, prefer fill() which triggers change events properly.',
        inputSchema: {
          type: 'object',
          properties: {
            script: {
              type: 'string',
              description:
                'JavaScript to execute. Wrap in IIFE for multiple statements: (() => { ...code...; return result; })(). ' +
                'Has access to document, window, and all DOM APIs.',
            },
          },
          required: ['script'],
        },
      },
      {
        name: 'claude_lens/go_back',
        description: 'Navigate back in browser history.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'claude_lens/go_forward',
        description: 'Navigate forward in browser history.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'claude_lens/handle_dialog',
        description:
          'Set how to handle browser dialogs (alert, confirm, prompt). Call before triggering the dialog.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['accept', 'dismiss'],
              description: 'accept = click OK, dismiss = click Cancel',
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'claude_lens/set_viewport',
        description:
          'Change browser viewport size for responsive testing. Use presets for common sizes or custom width for specific breakpoints.',
        inputSchema: {
          type: 'object',
          properties: {
            preset: {
              type: 'string',
              enum: ['full', 'desktop', 'tablet-landscape', 'tablet', 'mobile-large', 'mobile', 'custom'],
              description: 'Viewport preset: full (no constraint), desktop (1280px), tablet-landscape (1024px), tablet (768px), mobile-large (425px), mobile (375px), or custom',
            },
            width: {
              type: 'number',
              description: 'Custom viewport width in pixels (320-3840). Use with preset="custom" or alone.',
            },
          },
        },
      },
      {
        name: 'claude_lens/restart_server',
        description:
          'Restart the currently running dev server or static server. Useful after installing new dependencies, changing config files, or when hot reload is not working.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls with performance timing
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = performance.now();
  const getDuration = () => Math.round(performance.now() - startTime);

  try {
    // Check if bridge is connected
    const connected = await bridge.isConnected();
    if (!connected) {
      return {
        content: [
          {
            type: 'text',
            text: 'Claude Lens is not connected. Please open the Claude Lens desktop app, load a project, and ensure Playwright is connected (check status bar). If the app is running but not connected, try restarting it - zombie processes may be blocking port 9222.',
          },
        ],
        isError: true,
      };
    }

    switch (name) {
      case 'claude_lens/inspect_element': {
        const { selector } = InspectElementSchema.parse(args);
        console.error(`[claude_lens/inspect_element] Inspecting${selector ? `: ${selector}` : ' clicked element'}...`);
        const element = await bridge.inspectElement(selector);

        if (!element) {
          return {
            content: [
              {
                type: 'text',
                text: selector
                  ? `Element not found: ${selector}`
                  : 'No element has been clicked. Ctrl+Click an element in Claude Lens first.',
              },
            ],
            isError: true,
          };
        }

        // Format element info nicely
        const info = `## Inspected Element

**Selector:** \`${element.selector}\`
**Tag:** \`<${element.tagName}${element.id ? ` id="${element.id}"` : ''}${element.classes.length ? ` class="${element.classes.join(' ')}"` : ''}>\`

### Computed Styles
| Property | Value |
|----------|-------|
| display | ${element.computedStyles.display} |
| position | ${element.computedStyles.position} |
| width | ${element.computedStyles.width} |
| height | ${element.computedStyles.height} |
| margin | ${element.computedStyles.margin} |
| padding | ${element.computedStyles.padding} |
| color | ${element.computedStyles.color} |
| background | ${element.computedStyles.backgroundColor} |
| font-size | ${element.computedStyles.fontSize} |

### Bounding Box
- Position: (${element.boundingBox.x}, ${element.boundingBox.y})
- Size: ${element.boundingBox.width} x ${element.boundingBox.height}

### Attributes
${Object.entries(element.attributes).map(([k, v]) => `- ${k}: ${v}`).join('\n') || 'None'}
`;
        console.error(`[claude_lens/inspect_element] Found: <${element.tagName}> at (${element.boundingBox.x}, ${element.boundingBox.y})`);

        return {
          content: [{ type: 'text', text: info }],
        };
      }

      case 'claude_lens/highlight_element': {
        const { selector, color, duration } = HighlightElementSchema.parse(args);
        console.error(`[claude_lens/highlight_element] Highlighting: ${selector} (${color || 'red'}, ${duration || 3000}ms)`);
        await bridge.highlight(selector, { color, duration: duration ?? 3000 });
        console.error(`[claude_lens/highlight_element] Done`);

        return {
          content: [
            {
              type: 'text',
              text: `Highlighted element: ${selector}`,
            },
          ],
        };
      }

      case 'claude_lens/navigate': {
        const { url } = NavigateSchema.parse(args);
        console.error(`[claude_lens/navigate] Navigating to: ${url}`);

        // Validate URL is localhost
        if (!isAllowedUrl(url)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Only localhost URLs are allowed for security. Use http://localhost:PORT or http://127.0.0.1:PORT',
              },
            ],
            isError: true,
          };
        }

        const result = await bridge.navigate(url);

        if (!result.success) {
          console.error(`[claude_lens/navigate] Failed: ${result.error}`);
          return {
            content: [{ type: 'text', text: `Navigation failed: ${result.error}` }],
            isError: true,
          };
        }

        console.error(`[claude_lens/navigate] Success in ${getDuration()}ms`);
        return {
          content: [{ type: 'text', text: `Navigated to: ${url}` }],
        };
      }

      case 'claude_lens/get_console': {
        const { level, limit } = GetConsoleSchema.parse(args);
        console.error(`[claude_lens/get_console] Fetching ${level} logs (limit: ${limit || 'none'})...`);
        const messages = await bridge.getConsoleLogs(level, limit);

        if (messages.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No ${level === 'all' ? '' : level + ' '}console messages found.`,
              },
            ],
          };
        }

        // Format console messages, redacting secrets
        const formatted = messages
          .map((msg) => {
            const redacted = redactSecrets(msg.text);
            const location = msg.source ? ` (${msg.source}${msg.line ? `:${msg.line}` : ''})` : '';
            return `[${msg.level.toUpperCase()}]${location} ${redacted.text}`;
          })
          .join('\n');

        console.error(`[claude_lens/get_console] Found ${messages.length} messages`);
        return {
          content: [{ type: 'text', text: `## Console Messages\n\n\`\`\`\n${formatted}\n\`\`\`` }],
        };
      }

      case 'claude_lens/screenshot': {
        const { selector } = ScreenshotSchema.parse(args);
        console.error(`[claude_lens/screenshot] Capturing${selector ? ` element: ${selector}` : ' full page'}...`);
        const imageData = await bridge.screenshot(selector);
        const sizeKB = Math.round((imageData.length * 3) / 4 / 1024); // base64 to bytes
        console.error(`[claude_lens/screenshot] Captured: ${sizeKB}KB in ${getDuration()}ms`);

        return {
          content: [
            {
              type: 'text',
              text: `Screenshot captured (${sizeKB}KB)${selector ? ` of element: ${selector}` : ''}`,
            },
            {
              type: 'image',
              data: imageData,
              mimeType: 'image/png',
            },
          ],
        };
      }

      case 'claude_lens/reload': {
        console.error(`[claude_lens/reload] Reloading page...`);
        await bridge.reload();
        console.error(`[claude_lens/reload] Done in ${getDuration()}ms`);
        return {
          content: [
            {
              type: 'text',
              text: 'Page reloaded successfully. Take a screenshot to see the updated page.',
            },
          ],
        };
      }

      case 'claude_lens/click': {
        const { selector, button, clickCount, delay } = ClickSchema.parse(args);
        const clickType = clickCount === 2 ? 'Double-clicked' : 'Clicked';
        console.error(`[claude_lens/click] ${clickType}: ${selector}${button ? ` (${button})` : ''}`);
        await bridge.click(selector, { button, clickCount, delay });
        console.error(`[claude_lens/click] Done`);
        // Describe what was clicked in plain language
        const lowerSel = selector.toLowerCase();
        const elementDesc = lowerSel.includes('submit') ? 'Submit button'
          : lowerSel.includes('cancel') ? 'Cancel button'
          : lowerSel.includes('save') ? 'Save button'
          : lowerSel.includes('delete') ? 'Delete button'
          : lowerSel.includes('add') ? 'Add button'
          : lowerSel.includes('btn') || lowerSel.includes('button') ? `button ${selector}`
          : lowerSel.includes('link') || selector.startsWith('a') ? `link ${selector}`
          : selector;
        return {
          content: [{ type: 'text', text: `${clickType} ${elementDesc}` }],
        };
      }

      case 'claude_lens/type': {
        const { selector, text, clearFirst, delay } = TypeSchema.parse(args);
        const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
        console.error(`[claude_lens/type] Typing "${preview}" into: ${selector}${clearFirst ? ' (clearing first)' : ''}`);
        await bridge.type(selector, text, { clearFirst, delay });
        console.error(`[claude_lens/type] Done`);
        const charCount = text.length;
        return {
          content: [{ type: 'text', text: `Typed ${charCount} characters into ${selector}` }],
        };
      }

      case 'claude_lens/wait_for': {
        const { selector, timeout, visible } = WaitForSchema.parse(args);
        console.error(`[claude_lens/wait_for] Waiting for: ${selector} (timeout: ${timeout || 30000}ms, visible: ${visible ?? true})`);
        const element = await bridge.waitFor(selector, { timeout, visible });
        console.error(`[claude_lens/wait_for] Found: <${element.tagName}> in ${getDuration()}ms`);
        return {
          content: [
            {
              type: 'text',
              text: `Element found: <${element.tagName}> matching ${selector}`,
            },
          ],
        };
      }

      // Playwright-powered tool handlers
      case 'claude_lens/browser_snapshot': {
        console.error(`[claude_lens/browser_snapshot] Scanning page for interactive elements...`);
        const snapshot = await bridge.getAccessibilitySnapshot();
        // Count elements from the new compact format
        const elementCount = (snapshot.match(/^\d+\./gm) || []).length;
        console.error(`[claude_lens/browser_snapshot] Found ${elementCount} interactive elements in ${getDuration()}ms`);
        return {
          content: [
            {
              type: 'text',
              text: snapshot, // Already formatted as readable list
            },
          ],
        };
      }

      case 'claude_lens/fill': {
        const { selector, value } = FillSchema.parse(args);
        const preview = value.length > 50 ? value.substring(0, 50) + '...' : value;
        console.error(`[claude_lens/fill] Filling: ${selector} with "${preview}"`);
        await bridge.fill(selector, value);
        console.error(`[claude_lens/fill] Done`);
        // Describe what was filled in plain language
        const fieldDesc = selector.includes('email') ? 'email field'
          : selector.includes('password') ? 'password field'
          : selector.includes('name') ? 'name field'
          : selector.includes('search') ? 'search box'
          : `input ${selector}`;
        return {
          content: [{ type: 'text', text: `Filled ${fieldDesc} with "${preview}"` }],
        };
      }

      case 'claude_lens/select_option': {
        const { selector, values } = SelectOptionSchema.parse(args);
        const valuesStr = Array.isArray(values) ? values.join(', ') : values;
        console.error(`[claude_lens/select_option] Selecting in: ${selector} values: ${valuesStr}`);
        const selected = await bridge.selectOption(selector, values);
        console.error(`[claude_lens/select_option] Selected: ${selected.join(', ')}`);
        return {
          content: [
            { type: 'text', text: `Selected option(s): ${selected.join(', ')} in ${selector}` },
          ],
        };
      }

      case 'claude_lens/hover': {
        const { selector } = HoverSchema.parse(args);
        console.error(`[claude_lens/hover] Hovering: ${selector}`);
        await bridge.hover(selector);
        console.error(`[claude_lens/hover] Done`);
        return {
          content: [{ type: 'text', text: `Hovered over ${selector}` }],
        };
      }

      case 'claude_lens/press_key': {
        const { key } = PressKeySchema.parse(args);
        console.error(`[claude_lens/press_key] Pressing: ${key}`);
        await bridge.pressKey(key);
        console.error(`[claude_lens/press_key] Done`);
        return {
          content: [{ type: 'text', text: `Pressed key: ${key}` }],
        };
      }

      case 'claude_lens/drag_and_drop': {
        const { source, target } = DragAndDropSchema.parse(args);
        console.error(`[claude_lens/drag_and_drop] Dragging: ${source} -> ${target}`);
        await bridge.dragAndDrop(source, target);
        console.error(`[claude_lens/drag_and_drop] Done`);
        return {
          content: [{ type: 'text', text: `Dragged ${source} to ${target}` }],
        };
      }

      case 'claude_lens/scroll': {
        const { selector, direction, distance } = ScrollSchema.parse(args);
        const scrollDesc = selector ? `into view: ${selector}` : `${direction} ${distance}px`;
        console.error(`[claude_lens/scroll] Scrolling ${scrollDesc}`);
        await bridge.scroll({ selector, direction, distance });
        console.error(`[claude_lens/scroll] Done`);
        const desc = selector
          ? `Scrolled ${selector} into view`
          : direction
            ? `Scrolled ${direction} ${distance}px`
            : 'Scrolled page';
        return {
          content: [{ type: 'text', text: desc }],
        };
      }

      case 'claude_lens/wait_for_response': {
        const { urlPattern } = WaitForResponseSchema.parse(args);
        console.error(`[claude_lens/wait_for_response] Waiting for: ${urlPattern}`);
        const response = await bridge.waitForResponse(urlPattern);
        console.error(`[claude_lens/wait_for_response] Got: ${response.status} ${response.url} in ${getDuration()}ms`);
        return {
          content: [
            {
              type: 'text',
              text: `Response received:\n- URL: ${response.url}\n- Status: ${response.status}`,
            },
          ],
        };
      }

      case 'claude_lens/get_text': {
        const { selector } = GetTextSchema.parse(args);
        console.error(`[claude_lens/get_text] Getting text from: ${selector}`);
        const text = await bridge.getText(selector);
        const preview = text.length > 100 ? text.substring(0, 100) + '...' : text;
        console.error(`[claude_lens/get_text] Got: "${preview}"`);
        return {
          content: [{ type: 'text', text: `Text content of ${selector}:\n"${text}"` }],
        };
      }

      case 'claude_lens/get_attribute': {
        const { selector, name: attrName } = GetAttributeSchema.parse(args);
        console.error(`[claude_lens/get_attribute] Getting ${attrName} from: ${selector}`);
        const value = await bridge.getAttribute(selector, attrName);
        console.error(`[claude_lens/get_attribute] Got: ${value !== null ? `"${value}"` : 'null'}`);
        return {
          content: [
            {
              type: 'text',
              text: value !== null
                ? `${selector}[${attrName}] = "${value}"`
                : `${selector} has no ${attrName} attribute`,
            },
          ],
        };
      }

      case 'claude_lens/is_visible': {
        const { selector } = IsVisibleSchema.parse(args);
        console.error(`[claude_lens/is_visible] Checking: ${selector}`);
        const visible = await bridge.isVisible(selector);
        console.error(`[claude_lens/is_visible] Result: ${visible}`);
        return {
          content: [{ type: 'text', text: `${selector} is ${visible ? 'visible' : 'not visible'}` }],
        };
      }

      case 'claude_lens/is_enabled': {
        const { selector } = IsEnabledSchema.parse(args);
        console.error(`[claude_lens/is_enabled] Checking: ${selector}`);
        const enabled = await bridge.isEnabled(selector);
        console.error(`[claude_lens/is_enabled] Result: ${enabled}`);
        return {
          content: [{ type: 'text', text: `${selector} is ${enabled ? 'enabled' : 'disabled'}` }],
        };
      }

      case 'claude_lens/is_checked': {
        const { selector } = IsCheckedSchema.parse(args);
        console.error(`[claude_lens/is_checked] Checking: ${selector}`);
        const checked = await bridge.isChecked(selector);
        console.error(`[claude_lens/is_checked] Result: ${checked}`);
        return {
          content: [{ type: 'text', text: `${selector} is ${checked ? 'checked' : 'not checked'}` }],
        };
      }

      case 'claude_lens/evaluate': {
        const { script } = EvaluateSchema.parse(args);
        const scriptPreview = script.length > 50 ? script.substring(0, 50) + '...' : script;
        console.error(`[claude_lens/evaluate] Running: ${scriptPreview}`);
        const result = await bridge.evaluate(script);
        console.error(`[claude_lens/evaluate] Done`);

        // Format result in a compact, human-readable way
        let resultText: string;
        if (result === undefined || result === null) {
          resultText = 'Executed successfully (no return value)';
        } else if (typeof result === 'string') {
          resultText = result.length > 200 ? `"${result.slice(0, 200)}..." (${result.length} chars)` : `"${result}"`;
        } else if (typeof result === 'number' || typeof result === 'boolean') {
          resultText = String(result);
        } else if (Array.isArray(result)) {
          resultText = `Array with ${result.length} items`;
        } else if (typeof result === 'object') {
          const keys = Object.keys(result);
          resultText = `Object with ${keys.length} keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`;
        } else {
          resultText = String(result);
        }

        return {
          content: [
            {
              type: 'text',
              text: `Executed JavaScript → ${resultText}`,
            },
          ],
        };
      }

      case 'claude_lens/go_back': {
        console.error(`[claude_lens/go_back] Navigating back...`);
        await bridge.goBack();
        console.error(`[claude_lens/go_back] Done`);
        return {
          content: [{ type: 'text', text: 'Navigated back in history' }],
        };
      }

      case 'claude_lens/go_forward': {
        console.error(`[claude_lens/go_forward] Navigating forward...`);
        await bridge.goForward();
        console.error(`[claude_lens/go_forward] Done`);
        return {
          content: [{ type: 'text', text: 'Navigated forward in history' }],
        };
      }

      case 'claude_lens/handle_dialog': {
        const { action } = DialogHandlerSchema.parse(args);
        console.error(`[claude_lens/handle_dialog] Setting handler to: ${action}`);
        await bridge.setDialogHandler(action);
        console.error(`[claude_lens/handle_dialog] Done`);
        return {
          content: [
            {
              type: 'text',
              text: `Dialog handler set to ${action}. Next dialog will be ${action === 'accept' ? 'accepted' : 'dismissed'}.`,
            },
          ],
        };
      }

      case 'claude_lens/set_viewport': {
        const { preset, width } = SetViewportSchema.parse(args);
        const presetWidths: Record<string, number> = {
          'full': 0,
          'desktop': 1280,
          'tablet-landscape': 1024,
          'tablet': 768,
          'mobile-large': 425,
          'mobile': 375,
        };

        // Preset labels for display
        const presetLabels: Record<string, string> = {
          'full': 'Full Width (no constraint)',
          'desktop': '1280px (Desktop)',
          'tablet-landscape': '1024px (Tablet Landscape)',
          'tablet': '768px (Tablet)',
          'mobile-large': '425px (Mobile L)',
          'mobile': '375px (Mobile)',
        };

        // Determine actual width: custom width takes precedence, then preset
        let actualWidth: number;
        let description: string;

        if (width !== undefined) {
          actualWidth = width;
          description = `${width}px (Custom)`;
        } else if (preset && preset !== 'custom' && preset in presetWidths) {
          actualWidth = presetWidths[preset] ?? 0;
          description = presetLabels[preset] ?? 'Unknown';
        } else {
          // No valid input - default to full width
          actualWidth = 0;
          description = 'Full Width (no constraint)';
        }

        console.error(`[claude_lens/set_viewport] Setting viewport to: ${description}`);
        await bridge.setViewport(actualWidth);
        console.error(`[claude_lens/set_viewport] Done`);
        return {
          content: [
            {
              type: 'text',
              text: `Viewport changed to ${description}`,
            },
          ],
        };
      }

      case 'claude_lens/restart_server': {
        console.error('[claude_lens/restart_server] Restarting server...');
        const result = await bridge.restartServer();
        console.error(`[claude_lens/restart_server] Done: ${result.success ? 'success' : result.error}`);
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: 'Server restarted successfully. The page will reload automatically when the server is ready.',
              },
            ],
          };
        } else {
          return {
            content: [{ type: 'text', text: `Failed to restart server: ${result.error}` }],
            isError: true,
          };
        }
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${name}] Failed after ${getDuration()}ms: ${message}`);
    // Never throw - return error in MCP format
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Claude Lens MCP server started');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
