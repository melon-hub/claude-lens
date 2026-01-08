/**
 * Claude adapter types
 */

import type { ElementInfo, ConsoleMessage } from '../browser/types.js';

export interface InspectionContext {
  type: 'element' | 'console' | 'screenshot' | 'navigation';
  timestamp: number;
  data: ElementInspection | ConsoleContext | ScreenshotContext | NavigationContext;
}

export interface ElementInspection {
  element: ElementInfo;
  screenshot?: string; // Base64
  userAction: 'click' | 'hover' | 'select';
}

export interface ConsoleContext {
  messages: ConsoleMessage[];
  level: 'error' | 'warn' | 'all';
}

export interface ScreenshotContext {
  image: string; // Base64
  width: number;
  height: number;
  selector?: string;
}

export interface NavigationContext {
  url: string;
  title: string;
  loadTime: number;
}

export interface ToolCallHandler {
  (tool: string, params: unknown): Promise<unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Claude adapter interface - implemented by MCP adapter, API adapter, etc.
 */
export interface ClaudeAdapter {
  // Send context to Claude
  sendContext(context: InspectionContext): Promise<void>;

  // Handle incoming tool calls from Claude
  onToolCall(handler: ToolCallHandler): void;

  // For MCP: register available tools
  registerTools(tools: ToolDefinition[]): void;

  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

/**
 * Middleware for Claude adapter
 */
export interface ClaudeMiddleware {
  name: string;
  beforeSend?(context: InspectionContext): Promise<InspectionContext>;
  afterSend?(context: InspectionContext): Promise<void>;
  onToolCall?(tool: string, params: unknown): Promise<{ tool: string; params: unknown }>;
}
