/**
 * MCP Server for Claude Lens Desktop
 *
 * Exposes tools that allow Claude Code to query browser state:
 * - get_page_info: Get current page URL and title
 * - get_console_logs: Get recent console messages
 * - get_element_info: Get info about an element by selector
 * - get_page_dom: Get simplified DOM structure
 * - get_screenshot: Capture a screenshot of the current page
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { BrowserView } from 'electron';

// MCP Protocol types
interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface ConsoleMessage {
  level: string;
  message: string;
  timestamp: number;
}

// Store references
let browserViewRef: BrowserView | null = null;
let consoleBufferRef: ConsoleMessage[] = [];

export function setBrowserView(view: BrowserView | null) {
  browserViewRef = view;
}

export function setConsoleBuffer(buffer: ConsoleMessage[]) {
  consoleBufferRef = buffer;
}

// Tool definitions
const tools = [
  {
    name: 'get_page_info',
    description: 'Get information about the current browser page (URL, title)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_console_logs',
    description: 'Get recent console messages from the browser (last 20 messages)',
    inputSchema: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          description: 'Filter by log level (log, warn, error, info). Optional.',
          enum: ['log', 'warn', 'error', 'info'],
        },
      },
      required: [],
    },
  },
  {
    name: 'get_element_info',
    description: 'Get information about a DOM element by CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector to find the element (e.g., "#myButton", ".card", "button[type=submit]")',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'get_page_dom',
    description: 'Get a simplified DOM structure of the current page',
    inputSchema: {
      type: 'object',
      properties: {
        maxDepth: {
          type: 'number',
          description: 'Maximum depth to traverse (default: 3)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_screenshot',
    description: 'Capture a screenshot of the current browser page. Returns base64-encoded PNG image.',
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: {
          type: 'boolean',
          description: 'Capture full scrollable page (default: false, captures visible viewport only)',
        },
      },
      required: [],
    },
  },
];

// Tool handlers
async function handleGetPageInfo(): Promise<{ url: string; title: string } | null> {
  if (!browserViewRef) return null;

  try {
    const url = browserViewRef.webContents.getURL();
    const title = browserViewRef.webContents.getTitle();
    return { url, title };
  } catch {
    return null;
  }
}

async function handleGetConsoleLogs(level?: string): Promise<ConsoleMessage[]> {
  let logs = [...consoleBufferRef];
  if (level) {
    logs = logs.filter(m => m.level === level);
  }
  return logs.slice(-20);
}

async function handleGetElementInfo(selector: string): Promise<unknown> {
  if (!browserViewRef) return { error: 'No browser view available' };

  try {
    const result = await browserViewRef.webContents.executeJavaScript(`
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;

        const rect = el.getBoundingClientRect();
        const styles = window.getComputedStyle(el);

        return {
          tagName: el.tagName.toLowerCase(),
          id: el.id || null,
          classes: Array.from(el.classList),
          text: (el.textContent || '').trim().slice(0, 200),
          attributes: Object.fromEntries(
            Array.from(el.attributes).map(a => [a.name, a.value])
          ),
          styles: {
            color: styles.color,
            backgroundColor: styles.backgroundColor,
            fontSize: styles.fontSize,
            display: styles.display,
            position: styles.position,
          },
          position: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      })()
    `);
    return result || { error: 'Element not found' };
  } catch (err) {
    return { error: String(err) };
  }
}

async function handleGetPageDom(maxDepth = 3): Promise<unknown> {
  if (!browserViewRef) return { error: 'No browser view available' };

  try {
    const result = await browserViewRef.webContents.executeJavaScript(`
      (function() {
        function serializeElement(el, depth, maxDepth) {
          if (depth > maxDepth) return null;
          if (el.nodeType !== 1) return null;

          const tag = el.tagName.toLowerCase();
          // Skip script, style, and other non-visual elements
          if (['script', 'style', 'noscript', 'svg', 'path'].includes(tag)) return null;

          const node = {
            tag,
            id: el.id || undefined,
            classes: el.className ? el.className.split(' ').filter(c => c) : undefined,
          };

          // Add text content for leaf nodes
          if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
            const text = el.textContent.trim();
            if (text) node.text = text.slice(0, 100);
          }

          // Recurse into children
          const children = [];
          for (const child of el.children) {
            const serialized = serializeElement(child, depth + 1, maxDepth);
            if (serialized) children.push(serialized);
          }
          if (children.length > 0) node.children = children;

          return node;
        }

        return serializeElement(document.body, 0, ${maxDepth});
      })()
    `);
    return result || { error: 'Could not serialize DOM' };
  } catch (err) {
    return { error: String(err) };
  }
}

async function handleGetScreenshot(fullPage = false): Promise<{ image: string; width: number; height: number } | { error: string }> {
  if (!browserViewRef) return { error: 'No browser view available' };

  try {
    // For full page, we need to scroll and capture, but for now just do viewport
    const image = await browserViewRef.webContents.capturePage();
    const pngBuffer = image.toPNG();
    const base64 = pngBuffer.toString('base64');
    const size = image.getSize();

    return {
      image: base64,
      width: size.width,
      height: size.height,
    };
  } catch (err) {
    return { error: String(err) };
  }
}

// Handle MCP requests
async function handleRequest(request: MCPRequest): Promise<MCPResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'claude-lens', version: '0.1.6' },
            capabilities: { tools: {} },
          },
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { tools },
        };

      case 'tools/call': {
        const toolName = (params as { name: string })?.name;
        const toolArgs = (params as { arguments?: Record<string, unknown> })?.arguments || {};

        let result: unknown;
        switch (toolName) {
          case 'get_page_info':
            result = await handleGetPageInfo();
            break;
          case 'get_console_logs':
            result = await handleGetConsoleLogs(toolArgs.level as string | undefined);
            break;
          case 'get_element_info':
            result = await handleGetElementInfo(toolArgs.selector as string);
            break;
          case 'get_page_dom':
            result = await handleGetPageDom(toolArgs.maxDepth as number | undefined);
            break;
          case 'get_screenshot': {
            const screenshotResult = await handleGetScreenshot(toolArgs.fullPage as boolean | undefined);
            if ('error' in screenshotResult) {
              result = screenshotResult;
            } else {
              // Return as image content for Claude to see
              return {
                jsonrpc: '2.0',
                id,
                result: {
                  content: [
                    {
                      type: 'image',
                      data: screenshotResult.image,
                      mimeType: 'image/png',
                    },
                    {
                      type: 'text',
                      text: `Screenshot captured: ${screenshotResult.width}x${screenshotResult.height}px`,
                    },
                  ],
                },
              };
            }
            break;
          }
          default:
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Unknown tool: ${toolName}` },
            };
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: String(err) },
    };
  }
}

// HTTP request handler
function handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk;
  });

  req.on('end', async () => {
    try {
      const request = JSON.parse(body) as MCPRequest;
      const response = await handleRequest(request);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      }));
    }
  });
}

// Start the MCP server
let server: ReturnType<typeof createServer> | null = null;
const MCP_PORT = 3333;

export function startMCPServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve(MCP_PORT);
      return;
    }

    server = createServer(handleHttpRequest);

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`MCP port ${MCP_PORT} in use, trying next...`);
        server?.listen(MCP_PORT + 1);
      } else {
        reject(err);
      }
    });

    server.listen(MCP_PORT, () => {
      const addr = server?.address();
      const port = typeof addr === 'object' ? addr?.port : MCP_PORT;
      console.log(`MCP server listening on port ${port}`);
      resolve(port || MCP_PORT);
    });
  });
}

export function stopMCPServer() {
  if (server) {
    server.close();
    server = null;
  }
}
