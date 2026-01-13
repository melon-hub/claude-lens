import { describe, it, expect } from 'vitest';
import {
  normalizeUrl,
  extractPort,
  isLocalhostUrl,
  VIEWPORT_PRESETS,
  getViewportWidth,
} from '../handlers';

describe('Navigation Handlers', () => {
  describe('normalizeUrl', () => {
    it('should return empty for empty input', () => {
      expect(normalizeUrl('')).toBe('');
      expect(normalizeUrl('   ')).toBe('');
    });

    it('should keep existing http protocol', () => {
      expect(normalizeUrl('http://example.com')).toBe('http://example.com');
    });

    it('should keep existing https protocol', () => {
      expect(normalizeUrl('https://example.com')).toBe('https://example.com');
    });

    it('should add http to localhost', () => {
      expect(normalizeUrl('localhost:3000')).toBe('http://localhost:3000');
      expect(normalizeUrl('127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
    });

    it('should add http to other URLs', () => {
      expect(normalizeUrl('example.com')).toBe('http://example.com');
    });
  });

  describe('extractPort', () => {
    it('should extract port from URL', () => {
      expect(extractPort('http://localhost:3000')).toBe(3000);
      expect(extractPort('http://localhost:8080/path')).toBe(8080);
    });

    it('should return 80 for http without port', () => {
      expect(extractPort('http://localhost')).toBe(80);
    });

    it('should return 443 for https without port', () => {
      expect(extractPort('https://localhost')).toBe(443);
    });

    it('should return 0 for invalid URL', () => {
      expect(extractPort('not a url')).toBe(0);
    });
  });

  describe('isLocalhostUrl', () => {
    it('should return true for localhost', () => {
      expect(isLocalhostUrl('http://localhost:3000')).toBe(true);
      expect(isLocalhostUrl('localhost:3000')).toBe(true);
    });

    it('should return true for 127.0.0.1', () => {
      expect(isLocalhostUrl('http://127.0.0.1:3000')).toBe(true);
    });

    it('should return true for 0.0.0.0', () => {
      expect(isLocalhostUrl('http://0.0.0.0:3000')).toBe(true);
    });

    it('should return true for subdomain of localhost', () => {
      expect(isLocalhostUrl('http://test.localhost:3000')).toBe(true);
    });

    it('should return false for external URLs', () => {
      expect(isLocalhostUrl('http://example.com')).toBe(false);
      expect(isLocalhostUrl('http://192.168.1.1:3000')).toBe(false);
    });

    it('should return false for invalid URLs', () => {
      expect(isLocalhostUrl('not a url')).toBe(false);
    });
  });

  describe('VIEWPORT_PRESETS', () => {
    it('should have expected presets matching UI dropdown', () => {
      expect(VIEWPORT_PRESETS.full).toBe(0);
      expect(VIEWPORT_PRESETS.desktop).toBe(1280);
      expect(VIEWPORT_PRESETS['tablet-landscape']).toBe(1024);
      expect(VIEWPORT_PRESETS.tablet).toBe(768);
      expect(VIEWPORT_PRESETS['mobile-large']).toBe(425);
      expect(VIEWPORT_PRESETS.mobile).toBe(375);
    });
  });

  describe('getViewportWidth', () => {
    it('should return width for known preset', () => {
      expect(getViewportWidth('full')).toBe(0);
      expect(getViewportWidth('mobile')).toBe(375);
      expect(getViewportWidth('desktop')).toBe(1280);
    });

    it('should return 0 for unknown preset', () => {
      expect(getViewportWidth('unknown')).toBe(0);
    });
  });
});
