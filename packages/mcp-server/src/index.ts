#!/usr/bin/env node
/**
 * Claude Lens MCP Server
 *
 * Provides tools for element inspection and highlighting
 * to Claude Code via the Model Context Protocol.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

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
        description: 'Inspect a DOM element and get its properties, styles, and screenshot',
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
        description: 'Highlight an element in the browser to show the user',
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
              description: 'Duration in ms (0 = permanent)',
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'claude_lens/navigate',
        description: 'Navigate the browser to a URL',
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
        description: 'Get recent console messages from the browser',
        inputSchema: {
          type: 'object',
          properties: {
            level: {
              type: 'string',
              enum: ['all', 'error', 'warn', 'log'],
              description: 'Filter by log level',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of messages to return',
            },
          },
        },
      },
      {
        name: 'claude_lens/screenshot',
        description: 'Take a screenshot of the page or a specific element',
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
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'claude_lens/inspect_element': {
        InspectElementSchema.parse(args); // Validates input
        // TODO: Connect to browser adapter and inspect
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'not_connected',
                message: 'Browser not connected. Open Claude Lens panel in VS Code first.',
              }),
            },
          ],
        };
      }

      case 'claude_lens/highlight_element': {
        HighlightElementSchema.parse(args); // Validates input
        // TODO: Highlight element
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: false, message: 'Not connected' }),
            },
          ],
        };
      }

      case 'claude_lens/navigate': {
        const { url } = NavigateSchema.parse(args);
        // Validate localhost
        if (!url.match(/^https?:\/\/(localhost|127\.0\.0\.1)/)) {
          return {
            content: [{ type: 'text', text: 'Error: Only localhost URLs are allowed' }],
            isError: true,
          };
        }
        // TODO: Navigate
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: false, message: 'Not connected' }),
            },
          ],
        };
      }

      case 'claude_lens/get_console': {
        GetConsoleSchema.parse(args); // Validates input
        // TODO: Get console logs
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ messages: [], hasMore: false }),
            },
          ],
        };
      }

      case 'claude_lens/screenshot': {
        ScreenshotSchema.parse(args); // Validates input
        // TODO: Take screenshot
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: false, message: 'Not connected' }),
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
