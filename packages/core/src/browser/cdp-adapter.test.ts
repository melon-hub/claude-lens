import { describe, it, expect } from 'vitest';
import { CDPAdapter } from './cdp-adapter.js';

describe('CDPAdapter', () => {
  it('should create instance with default options', () => {
    const adapter = new CDPAdapter();
    expect(adapter).toBeDefined();
    expect(adapter.isConnected()).toBe(false);
  });

  it('should create instance with custom options', () => {
    const adapter = new CDPAdapter({ host: '127.0.0.1', port: 9333 });
    expect(adapter).toBeDefined();
  });

  it('should return empty URL when not connected', () => {
    const adapter = new CDPAdapter();
    expect(adapter.getCurrentUrl()).toBe('');
  });
});
