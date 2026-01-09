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
          'Execute JavaScript in the browser and return the result. Use for complex queries or custom logic.',
        inputSchema: {
          type: 'object',
          properties: {
            script: { type: 'string', description: 'JavaScript code to execute' },
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

      // Playwright-powered tool handlers
      case 'claude_lens/browser_snapshot': {
        const snapshot = await bridge.getAccessibilitySnapshot();
        return {
          content: [
            {
              type: 'text',
              text: `## Accessibility Tree\n\n\`\`\`json\n${snapshot}\n\`\`\``,
            },
          ],
        };
      }

      case 'claude_lens/fill': {
        const { selector, value } = FillSchema.parse(args);
        await bridge.fill(selector, value);
        const preview = value.length > 50 ? value.substring(0, 50) + '...' : value;
        return {
          content: [{ type: 'text', text: `Filled "${preview}" into ${selector}` }],
        };
      }

      case 'claude_lens/select_option': {
        const { selector, values } = SelectOptionSchema.parse(args);
        const selected = await bridge.selectOption(selector, values);
        return {
          content: [
            { type: 'text', text: `Selected option(s): ${selected.join(', ')} in ${selector}` },
          ],
        };
      }

      case 'claude_lens/hover': {
        const { selector } = HoverSchema.parse(args);
        await bridge.hover(selector);
        return {
          content: [{ type: 'text', text: `Hovered over ${selector}` }],
        };
      }

      case 'claude_lens/press_key': {
        const { key } = PressKeySchema.parse(args);
        await bridge.pressKey(key);
        return {
          content: [{ type: 'text', text: `Pressed key: ${key}` }],
        };
      }

      case 'claude_lens/drag_and_drop': {
        const { source, target } = DragAndDropSchema.parse(args);
        await bridge.dragAndDrop(source, target);
        return {
          content: [{ type: 'text', text: `Dragged ${source} to ${target}` }],
        };
      }

      case 'claude_lens/scroll': {
        const { selector, direction, distance } = ScrollSchema.parse(args);
        await bridge.scroll({ selector, direction, distance });
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
        const response = await bridge.waitForResponse(urlPattern);
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
        const text = await bridge.getText(selector);
        return {
          content: [{ type: 'text', text: `Text content of ${selector}:\n"${text}"` }],
        };
      }

      case 'claude_lens/get_attribute': {
        const { selector, name: attrName } = GetAttributeSchema.parse(args);
        const value = await bridge.getAttribute(selector, attrName);
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
        const visible = await bridge.isVisible(selector);
        return {
          content: [{ type: 'text', text: `${selector} is ${visible ? 'visible' : 'not visible'}` }],
        };
      }

      case 'claude_lens/is_enabled': {
        const { selector } = IsEnabledSchema.parse(args);
        const enabled = await bridge.isEnabled(selector);
        return {
          content: [{ type: 'text', text: `${selector} is ${enabled ? 'enabled' : 'disabled'}` }],
        };
      }

      case 'claude_lens/is_checked': {
        const { selector } = IsCheckedSchema.parse(args);
        const checked = await bridge.isChecked(selector);
        return {
          content: [{ type: 'text', text: `${selector} is ${checked ? 'checked' : 'not checked'}` }],
        };
      }

      case 'claude_lens/evaluate': {
        const { script } = EvaluateSchema.parse(args);
        const result = await bridge.evaluate(script);
        return {
          content: [
            {
              type: 'text',
              text: `JavaScript result:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
            },
          ],
        };
      }

      case 'claude_lens/go_back': {
        await bridge.goBack();
        return {
          content: [{ type: 'text', text: 'Navigated back in history' }],
        };
      }

      case 'claude_lens/go_forward': {
        await bridge.goForward();
        return {
          content: [{ type: 'text', text: 'Navigated forward in history' }],
        };
      }

      case 'claude_lens/handle_dialog': {
        const { action } = DialogHandlerSchema.parse(args);
        await bridge.setDialogHandler(action);
        return {
          content: [
            {
              type: 'text',
              text: `Dialog handler set to ${action}. Next dialog will be ${action === 'accept' ? 'accepted' : 'dismissed'}.`,
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
