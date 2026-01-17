import { describe, it, expect, beforeEach } from 'vitest';
import {
  isAllowedUrl,
  validateUrl,
  addAllowedOrigin,
  clearCustomOrigins,
  getAllowedOrigins,
} from './url-validator.js';

describe('url-validator', () => {
  beforeEach(() => {
    clearCustomOrigins();
  });

  describe('isAllowedUrl', () => {
    it('should allow localhost URLs', () => {
      expect(isAllowedUrl('http://localhost')).toBe(true);
      expect(isAllowedUrl('http://localhost:3000')).toBe(true);
      expect(isAllowedUrl('https://localhost:8080')).toBe(true);
    });

    it('should allow 127.0.0.1 URLs', () => {
      expect(isAllowedUrl('http://127.0.0.1')).toBe(true);
      expect(isAllowedUrl('http://127.0.0.1:3000')).toBe(true);
      expect(isAllowedUrl('https://127.0.0.1:443')).toBe(true);
    });

    it('should allow IPv6 localhost URLs', () => {
      expect(isAllowedUrl('http://[::1]')).toBe(true);
      expect(isAllowedUrl('http://[::1]:3000')).toBe(true);
    });

    it('should reject external URLs', () => {
      expect(isAllowedUrl('http://example.com')).toBe(false);
      expect(isAllowedUrl('https://google.com')).toBe(false);
      expect(isAllowedUrl('http://192.168.1.1:3000')).toBe(false);
    });

    it('should reject file:// URLs', () => {
      expect(isAllowedUrl('file:///etc/passwd')).toBe(false);
      expect(isAllowedUrl('file://C:/Windows/system32')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(isAllowedUrl('not-a-url')).toBe(false);
      expect(isAllowedUrl('')).toBe(false);
      expect(isAllowedUrl('://missing-protocol')).toBe(false);
    });

    it('should allow custom origins after adding', () => {
      expect(isAllowedUrl('http://dev.local:3000')).toBe(false);
      addAllowedOrigin(/^https?:\/\/dev\.local(:\d+)?$/);
      expect(isAllowedUrl('http://dev.local:3000')).toBe(true);
    });
  });

  describe('validateUrl', () => {
    it('should return valid for localhost URLs', () => {
      const result = validateUrl('http://localhost:3000/path?query=1');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('http://localhost:3000/path?query=1');
      expect(result.error).toBeUndefined();
    });

    it('should return error for external URLs', () => {
      const result = validateUrl('http://example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
      expect(result.normalized).toBeUndefined();
    });

    it('should return error for invalid URLs', () => {
      const result = validateUrl('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });

    it('should normalize URLs', () => {
      const result = validateUrl('http://localhost:3000');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('http://localhost:3000/');
    });
  });

  describe('getAllowedOrigins', () => {
    it('should return default origins', () => {
      const origins = getAllowedOrigins();
      expect(origins.length).toBeGreaterThanOrEqual(3);
    });

    it('should include custom origins', () => {
      const initialCount = getAllowedOrigins().length;
      addAllowedOrigin(/^https?:\/\/custom\.local$/);
      expect(getAllowedOrigins().length).toBe(initialCount + 1);
    });
  });

  describe('clearCustomOrigins', () => {
    it('should clear custom origins but keep defaults', () => {
      addAllowedOrigin(/^https?:\/\/custom1\.local$/);
      addAllowedOrigin(/^https?:\/\/custom2\.local$/);

      const beforeClear = getAllowedOrigins().length;
      clearCustomOrigins();
      const afterClear = getAllowedOrigins().length;

      expect(afterClear).toBeLessThan(beforeClear);
      expect(isAllowedUrl('http://localhost:3000')).toBe(true);
    });
  });
});
