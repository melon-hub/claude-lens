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
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Check if bridge is connected
    const connected = await bridge.isConnected();
    if (!connected) {
      return {
        content: [
          {
            type: 'text',
            text: 'Claude Lens is not connected. Please open the Claude Lens panel in VS Code (Command Palette > "Claude Lens: Open Browser Panel") and navigate to a localhost URL first.',
          },
        ],
        isError: true,
      };
    }

    switch (name) {
      case 'claude_lens/inspect_element': {
        const { selector } = InspectElementSchema.parse(args);
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

        return {
          content: [{ type: 'text', text: info }],
        };
      }

      case 'claude_lens/highlight_element': {
        const { selector, color, duration } = HighlightElementSchema.parse(args);
        await bridge.highlight(selector, { color, duration: duration ?? 3000 });

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
          return {
            content: [{ type: 'text', text: `Navigation failed: ${result.error}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: `Navigated to: ${url}` }],
        };
      }

      case 'claude_lens/get_console': {
        const { level, limit } = GetConsoleSchema.parse(args);
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

        return {
          content: [{ type: 'text', text: `## Console Messages\n\n\`\`\`\n${formatted}\n\`\`\`` }],
        };
      }

      case 'claude_lens/screenshot': {
        const { selector } = ScreenshotSchema.parse(args);
        const imageData = await bridge.screenshot(selector);

        return {
          content: [
            {
              type: 'image',
              data: imageData,
              mimeType: 'image/png',
            },
          ],
        };
      }

      case 'claude_lens/reload': {
        await bridge.reload();
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
        await bridge.click(selector, { button, clickCount, delay });
        const clickType = clickCount === 2 ? 'Double-clicked' : 'Clicked';
        return {
          content: [
            {
              type: 'text',
              text: `${clickType} element: ${selector}`,
            },
          ],
        };
      }

      case 'claude_lens/type': {
        const { selector, text, clearFirst, delay } = TypeSchema.parse(args);
        await bridge.type(selector, text, { clearFirst, delay });
        const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
        return {
          content: [
            {
              type: 'text',
              text: `Typed "${preview}" into ${selector}${clearFirst ? ' (cleared first)' : ''}`,
            },
          ],
        };
      }

      case 'claude_lens/wait_for': {
        const { selector, timeout, visible } = WaitForSchema.parse(args);
        const element = await bridge.waitFor(selector, { timeout, visible });
        return {
          content: [
            {
              type: 'text',
              text: `Element found: <${element.tagName}> matching ${selector}`,
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
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
