import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BridgeServer, BridgeClient, type BridgeHandler, type BridgeState } from './index.js';
import type { ElementInfo, ConsoleMessage } from '../browser/types.js';

/**
 * Create a mock BridgeHandler for testing
 */
function createMockHandler(overrides: Partial<BridgeHandler> = {}): BridgeHandler {
  const defaultState: BridgeState = {
    connected: true,
    currentUrl: 'http://localhost:3000',
    lastInspectedElement: null,
    consoleLogs: [],
  };

  return {
    getState: () => overrides.getState?.() ?? defaultState,
    navigate: vi.fn(async (url: string) => ({ success: true })),
    inspectElement: vi.fn(async () => null),
    inspectElementAtPoint: vi.fn(async () => null),
    highlight: vi.fn(async () => {}),
    clearHighlights: vi.fn(async () => {}),
    screenshot: vi.fn(async () => 'base64-image-data'),
    getConsoleLogs: vi.fn(async () => []),
    reload: vi.fn(async () => {}),
    click: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    waitFor: vi.fn(async () => ({ tagName: 'div', selector: 'div' }) as ElementInfo),
    ...overrides,
  };
}

describe('BridgeServer', () => {
  let server: BridgeServer;
  let handler: BridgeHandler;
  const TEST_PORT = 19333; // Use non-default port for testing

  beforeEach(async () => {
    handler = createMockHandler();
    server = new BridgeServer(TEST_PORT);
    server.setHandler(handler);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('CORS handling', () => {
    it('should set CORS header for localhost origin', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/health`, {
        headers: { Origin: 'http://localhost:3000' },
      });
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    });

    it('should set CORS header for 127.0.0.1 origin', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/health`, {
        headers: { Origin: 'http://127.0.0.1:8080' },
      });
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:8080');
    });

    it('should NOT set CORS header for external origin', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/health`, {
        headers: { Origin: 'http://evil.com' },
      });
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should NOT set CORS header for localhost bypass attempt', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/health`, {
        headers: { Origin: 'http://localhost.evil.com' },
      });
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should handle OPTIONS preflight requests', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/navigate`, {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:3000' },
      });
      expect(response.status).toBe(204);
    });
  });

  describe('health endpoint', () => {
    it('should return health status', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.connected).toBe(true);
      expect(typeof data.timestamp).toBe('number');
      expect(typeof data.uptime).toBe('number');
    });
  });

  describe('state endpoint', () => {
    it('should return bridge state', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/state`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.connected).toBe(true);
      expect(data.currentUrl).toBe('http://localhost:3000');
    });
  });

  describe('navigate endpoint', () => {
    it('should call handler.navigate with URL', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://localhost:8080' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(handler.navigate).toHaveBeenCalledWith('http://localhost:8080');
    });

    it('should return 500 for missing URL', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Missing required parameter: url');
    });

    it('should return 500 for empty URL', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: '   ' }),
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('cannot be empty');
    });

    it('should return 500 for non-string URL', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 12345 }),
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('expected string');
    });
  });

  describe('inspect endpoint', () => {
    it('should call inspectElement with selector', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selector: '#my-element' }),
      });

      expect(response.status).toBe(200);
      expect(handler.inspectElement).toHaveBeenCalledWith('#my-element');
    });

    it('should call inspectElementAtPoint with coordinates', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 100, y: 200 }),
      });

      expect(response.status).toBe(200);
      expect(handler.inspectElementAtPoint).toHaveBeenCalledWith(100, 200);
    });
  });

  describe('highlight endpoint', () => {
    it('should call handler.highlight with selector and options', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/highlight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selector: '.button', color: '#ff0000', duration: 5000 }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(handler.highlight).toHaveBeenCalledWith('.button', { color: '#ff0000', duration: 5000 });
    });

    it('should return 500 for missing selector', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/highlight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color: '#ff0000' }),
      });

      expect(response.status).toBe(500);
    });
  });

  describe('screenshot endpoint', () => {
    it('should return base64 image data', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.image).toBe('base64-image-data');
    });

    it('should pass selector to handler', async () => {
      await fetch(`http://127.0.0.1:${TEST_PORT}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selector: '#main' }),
      });

      expect(handler.screenshot).toHaveBeenCalledWith('#main');
    });
  });

  describe('click endpoint', () => {
    it('should call handler.click with selector', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selector: 'button.submit' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(handler.click).toHaveBeenCalled();
    });
  });

  describe('type endpoint', () => {
    it('should call handler.type with selector and text', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/type`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selector: 'input#email', text: 'test@example.com' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(handler.type).toHaveBeenCalled();
    });

    it('should return 500 for missing text', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/type`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selector: 'input#email' }),
      });

      expect(response.status).toBe(500);
    });
  });

  describe('Playwright-powered endpoints', () => {
    it('fill should work when handler supports it', async () => {
      const fillHandler = createMockHandler({
        fill: vi.fn(async () => {}),
      });
      server.setHandler(fillHandler);

      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selector: 'input', value: 'test' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('fill should return error when handler does not support it', async () => {
      // Default handler doesn't have fill
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selector: 'input', value: 'test' }),
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('not supported');
    });

    it('hover should call handler.hover', async () => {
      const hoverHandler = createMockHandler({
        hover: vi.fn(async () => {}),
      });
      server.setHandler(hoverHandler);

      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/hover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selector: '.menu-item' }),
      });

      expect(response.status).toBe(200);
      expect(hoverHandler.hover).toHaveBeenCalledWith('.menu-item');
    });

    it('evaluate should return result', async () => {
      const evalHandler = createMockHandler({
        evaluate: vi.fn(async (script: string) => ({ computed: 42 })),
      });
      server.setHandler(evalHandler);

      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: 'return 1 + 1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.result).toEqual({ computed: 42 });
    });
  });

  describe('error handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/unknown-route`);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Not found');
    });

    it('should return 503 when handler not set', async () => {
      const noHandlerServer = new BridgeServer(TEST_PORT + 1);
      await noHandlerServer.start();

      try {
        const response = await fetch(`http://127.0.0.1:${TEST_PORT + 1}/state`);
        const data = await response.json();

        expect(response.status).toBe(503);
        expect(data.error).toBe('Handler not ready');
      } finally {
        await noHandlerServer.stop();
      }
    });

    it('should return 500 for invalid JSON body', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json',
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Invalid JSON');
    });

    it('should return 500 when handler throws', async () => {
      const throwingHandler = createMockHandler({
        navigate: vi.fn(async () => {
          throw new Error('Navigation failed');
        }),
      });
      server.setHandler(throwingHandler);

      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://localhost:3000' }),
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Navigation failed');
    });
  });

  describe('server lifecycle', () => {
    it('should not start twice', async () => {
      // Server is already started in beforeEach
      await server.start(); // Should be a no-op
      // If we got here without error, it worked
      expect(true).toBe(true);
    });

    it('should handle stop when not started', async () => {
      const newServer = new BridgeServer(TEST_PORT + 2);
      await newServer.stop(); // Should be a no-op
      expect(true).toBe(true);
    });
  });
});

describe('BridgeClient', () => {
  let server: BridgeServer;
  let client: BridgeClient;
  let handler: BridgeHandler;
  const TEST_PORT = 19334;

  beforeEach(async () => {
    handler = createMockHandler({
      fill: vi.fn(async () => {}),
      hover: vi.fn(async () => {}),
      evaluate: vi.fn(async () => 'result'),
      getText: vi.fn(async () => 'Hello World'),
      getAttribute: vi.fn(async () => 'attribute-value'),
      isVisible: vi.fn(async () => true),
      isEnabled: vi.fn(async () => true),
      isChecked: vi.fn(async () => false),
      goBack: vi.fn(async () => {}),
      goForward: vi.fn(async () => {}),
    });
    server = new BridgeServer(TEST_PORT);
    server.setHandler(handler);
    await server.start();
    client = new BridgeClient(TEST_PORT);
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('state methods', () => {
    it('getState should return bridge state', async () => {
      const state = await client.getState();
      expect(state.connected).toBe(true);
      expect(state.currentUrl).toBe('http://localhost:3000');
    });

    it('isConnected should return true when connected', async () => {
      const connected = await client.isConnected();
      expect(connected).toBe(true);
    });

    it('isConnected should return false when server is down', async () => {
      await server.stop();
      const connected = await client.isConnected();
      expect(connected).toBe(false);
    });
  });

  describe('navigation methods', () => {
    it('navigate should call server endpoint', async () => {
      const result = await client.navigate('http://localhost:8080');
      expect(result.success).toBe(true);
      expect(handler.navigate).toHaveBeenCalledWith('http://localhost:8080');
    });

    it('reload should call server endpoint', async () => {
      await client.reload();
      expect(handler.reload).toHaveBeenCalled();
    });

    it('goBack should call server endpoint', async () => {
      await client.goBack();
      expect(handler.goBack).toHaveBeenCalled();
    });

    it('goForward should call server endpoint', async () => {
      await client.goForward();
      expect(handler.goForward).toHaveBeenCalled();
    });
  });

  describe('inspection methods', () => {
    it('inspectElement should return element info', async () => {
      const mockElement: ElementInfo = {
        tagName: 'button',
        selector: 'button.submit',
        classes: ['submit'],
        boundingBox: { x: 0, y: 0, width: 100, height: 50 },
      };
      handler.inspectElement = vi.fn(async () => mockElement);

      const result = await client.inspectElement('button.submit');
      expect(result).toEqual(mockElement);
    });

    it('inspectElementAtPoint should use coordinates', async () => {
      await client.inspectElementAtPoint(150, 250);
      expect(handler.inspectElementAtPoint).toHaveBeenCalledWith(150, 250);
    });

    it('screenshot should return image data', async () => {
      const image = await client.screenshot();
      expect(image).toBe('base64-image-data');
    });
  });

  describe('automation methods', () => {
    it('click should call handler', async () => {
      await client.click('.button');
      expect(handler.click).toHaveBeenCalled();
    });

    it('type should call handler', async () => {
      await client.type('input', 'hello');
      expect(handler.type).toHaveBeenCalled();
    });

    it('fill should call handler', async () => {
      await client.fill('input', 'test value');
      expect(handler.fill).toHaveBeenCalled();
    });

    it('hover should call handler', async () => {
      await client.hover('.menu');
      expect(handler.hover).toHaveBeenCalledWith('.menu');
    });
  });

  describe('query methods', () => {
    it('getText should return element text', async () => {
      const text = await client.getText('.content');
      expect(text).toBe('Hello World');
    });

    it('getAttribute should return attribute value', async () => {
      const value = await client.getAttribute('a', 'href');
      expect(value).toBe('attribute-value');
    });

    it('isVisible should return visibility status', async () => {
      const visible = await client.isVisible('.modal');
      expect(visible).toBe(true);
    });

    it('isEnabled should return enabled status', async () => {
      const enabled = await client.isEnabled('button');
      expect(enabled).toBe(true);
    });

    it('isChecked should return checked status', async () => {
      const checked = await client.isChecked('input[type=checkbox]');
      expect(checked).toBe(false);
    });

    it('evaluate should return script result', async () => {
      const result = await client.evaluate('document.title');
      expect(result).toBe('result');
    });
  });

  describe('error handling', () => {
    it('should throw on server error', async () => {
      handler.navigate = vi.fn(async () => {
        throw new Error('Server error');
      });

      await expect(client.navigate('http://localhost')).rejects.toThrow('Server error');
    });

    it('should throw on connection error', async () => {
      await server.stop();
      await expect(client.navigate('http://localhost')).rejects.toThrow();
    });
  });
});
