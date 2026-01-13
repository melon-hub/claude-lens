import { describe, it, expect } from 'vitest';
import {
  formatViewportDisplay,
  getViewportPresetName,
  formatServerStatus,
  formatPlaywrightStatus,
} from '../components';

describe('Status Bar Components', () => {
  describe('formatViewportDisplay', () => {
    it('should return "Full" for 0', () => {
      expect(formatViewportDisplay(0)).toBe('Full');
    });

    it('should format mobile viewport', () => {
      expect(formatViewportDisplay(375)).toBe('Mobile (375px)');
      expect(formatViewportDisplay(640)).toBe('Mobile (640px)');
    });

    it('should format tablet viewport', () => {
      expect(formatViewportDisplay(768)).toBe('Tablet (768px)');
      expect(formatViewportDisplay(1024)).toBe('Tablet (1024px)');
    });

    it('should format desktop viewport', () => {
      expect(formatViewportDisplay(1280)).toBe('Desktop (1280px)');
      expect(formatViewportDisplay(1920)).toBe('Desktop (1920px)');
    });
  });

  describe('getViewportPresetName', () => {
    it('should return preset names', () => {
      expect(getViewportPresetName(0)).toBe('Full Width');
      expect(getViewportPresetName(375)).toBe('iPhone SE');
      expect(getViewportPresetName(390)).toBe('iPhone 14');
      expect(getViewportPresetName(768)).toBe('iPad');
      expect(getViewportPresetName(1024)).toBe('iPad Pro');
      expect(getViewportPresetName(1280)).toBe('Desktop');
      expect(getViewportPresetName(1920)).toBe('Full HD');
    });

    it('should return custom for unknown width', () => {
      expect(getViewportPresetName(500)).toBe('Custom (500px)');
    });
  });

  describe('formatServerStatus', () => {
    it('should return not running for null type', () => {
      expect(formatServerStatus(3000, null)).toBe('Not running');
    });

    it('should return not running for port 0', () => {
      expect(formatServerStatus(0, 'dev')).toBe('Not running');
    });

    it('should format dev server', () => {
      expect(formatServerStatus(3000, 'dev')).toBe('Dev :3000');
    });

    it('should format static server', () => {
      expect(formatServerStatus(8080, 'static')).toBe('Static :8080');
    });
  });

  describe('formatPlaywrightStatus', () => {
    it('should return Connected when connected', () => {
      expect(formatPlaywrightStatus(true)).toBe('Connected');
    });

    it('should return Disconnected when not connected', () => {
      expect(formatPlaywrightStatus(false)).toBe('Disconnected');
    });
  });
});
