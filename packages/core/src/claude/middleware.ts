/**
 * Middleware system for Claude adapters
 *
 * Allows intercepting and transforming context before sending to Claude,
 * logging, caching, secret redaction, etc.
 */

import type {
  ClaudeAdapter,
  ClaudeMiddleware,
  InspectionContext,
  ToolCallHandler,
  ToolDefinition,
} from './types.js';
import { redactSecrets } from '../security/secret-redactor.js';

/**
 * Wrap adapter with middleware
 */
export class ClaudeAdapterWithMiddleware implements ClaudeAdapter {
  private toolCallHandler: ToolCallHandler | null = null;

  constructor(
    private adapter: ClaudeAdapter,
    private middleware: ClaudeMiddleware[] = []
  ) {}

  async sendContext(context: InspectionContext): Promise<void> {
    let ctx = context;

    // Run beforeSend middleware
    for (const mw of this.middleware) {
      if (mw.beforeSend) {
        ctx = await mw.beforeSend(ctx);
      }
    }

    // Send to underlying adapter
    await this.adapter.sendContext(ctx);

    // Run afterSend middleware
    for (const mw of this.middleware) {
      if (mw.afterSend) {
        await mw.afterSend(ctx);
      }
    }
  }

  onToolCall(handler: ToolCallHandler): void {
    this.toolCallHandler = handler;

    // Wrap handler with middleware
    this.adapter.onToolCall(async (tool, params) => {
      let t = tool;
      let p = params;

      for (const mw of this.middleware) {
        if (mw.onToolCall) {
          const result = await mw.onToolCall(t, p);
          t = result.tool;
          p = result.params;
        }
      }

      return this.toolCallHandler!(t, p);
    });
  }

  registerTools(tools: ToolDefinition[]): void {
    this.adapter.registerTools(tools);
  }

  async connect(): Promise<void> {
    await this.adapter.connect();
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
  }

  isConnected(): boolean {
    return this.adapter.isConnected();
  }

  addMiddleware(middleware: ClaudeMiddleware): void {
    this.middleware.push(middleware);
  }
}

/**
 * Built-in middleware: Secret redaction
 */
export const secretRedactionMiddleware: ClaudeMiddleware = {
  name: 'secret-redaction',
  async beforeSend(context: InspectionContext): Promise<InspectionContext> {
    if (context.type === 'console') {
      const data = context.data as { messages: Array<{ text: string }> };
      data.messages = data.messages.map((msg) => ({
        ...msg,
        text: redactSecrets(msg.text).text,
      }));
    }

    if (context.type === 'element') {
      const data = context.data as { element: { htmlContent?: string; textContent?: string } };
      if (data.element.htmlContent) {
        data.element.htmlContent = redactSecrets(data.element.htmlContent).text;
      }
      if (data.element.textContent) {
        data.element.textContent = redactSecrets(data.element.textContent).text;
      }
    }

    return context;
  },
};

/**
 * Built-in middleware: Logging
 */
export function createLoggingMiddleware(
  logger: (msg: string) => void = console.error
): ClaudeMiddleware {
  return {
    name: 'logging',
    async beforeSend(context: InspectionContext): Promise<InspectionContext> {
      logger(`[Claude Lens] Sending ${context.type} context`);
      return context;
    },
    async afterSend(context: InspectionContext): Promise<void> {
      logger(`[Claude Lens] Sent ${context.type} context successfully`);
    },
    async onToolCall(tool: string, params: unknown): Promise<{ tool: string; params: unknown }> {
      logger(`[Claude Lens] Tool call: ${tool}`);
      return { tool, params };
    },
  };
}
