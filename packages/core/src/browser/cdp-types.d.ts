/**
 * Type declarations for chrome-remote-interface
 */

declare module 'chrome-remote-interface' {
  interface CDPOptions {
    host?: string;
    port?: number;
    target?: string;
  }

  interface Client {
    Page: {
      enable(): Promise<void>;
      navigate(params: { url: string }): Promise<void>;
      reload(): Promise<void>;
      loadEventFired(): Promise<void>;
      domContentEventFired(): Promise<void>;
      captureScreenshot(params?: {
        format?: 'png' | 'jpeg';
        quality?: number;
        clip?: { x: number; y: number; width: number; height: number; scale: number };
      }): Promise<{ data: string }>;
      on(event: string, callback: (params: unknown) => void): void;
    };
    Runtime: {
      enable(): Promise<void>;
      evaluate(params: { expression: string; returnByValue?: boolean }): Promise<{ result: { value: unknown; description?: string } }>;
      on(event: string, callback: (params: unknown) => void): void;
    };
    DOM: {
      enable(): Promise<void>;
      getDocument(): Promise<{ root: { nodeId: number; nodeName: string } }>;
      querySelector(params: { nodeId: number; selector: string }): Promise<{ nodeId: number }>;
      getNodeForLocation(params: { x: number; y: number }): Promise<{ nodeId: number }>;
      describeNode(params: { nodeId: number; depth?: number }): Promise<{
        node: {
          nodeName: string;
          nodeValue?: string;
          attributes?: string[];
          childNodeCount?: number;
        };
      }>;
      getBoxModel(params: { nodeId: number }): Promise<{ model: { content: number[] } }>;
      getOuterHTML(params: { nodeId: number }): Promise<{ outerHTML: string }>;
    };
    CSS: {
      enable(): Promise<void>;
      getComputedStyleForNode(params: { nodeId: number }): Promise<{
        computedStyle: Array<{ name: string; value: string }>;
      }>;
    };
    Network: {
      enable(): Promise<void>;
    };
    close(): Promise<void>;
  }

  function CDP(options?: CDPOptions): Promise<Client>;
  export default CDP;
  export { Client, CDPOptions };
}
