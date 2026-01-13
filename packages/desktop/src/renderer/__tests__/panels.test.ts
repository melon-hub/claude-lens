import { describe, it, expect } from 'vitest';
import {
  buildTagDisplay,
  truncateText,
  formatProps,
  createInfoRow,
  createBadge,
  formatPosition,
  formatSelector,
  escapeHtml,
  formatTimestamp,
} from '../panels';

describe('Panel Helpers', () => {
  describe('buildTagDisplay', () => {
    it('should build basic tag', () => {
      expect(buildTagDisplay({ tagName: 'div', id: '', classes: [] })).toBe('<div>');
    });

    it('should include id', () => {
      expect(buildTagDisplay({ tagName: 'button', id: 'submit', classes: [] })).toBe(
        '<button id="submit">'
      );
    });

    it('should include classes', () => {
      expect(buildTagDisplay({ tagName: 'div', id: '', classes: ['btn', 'primary'] })).toBe(
        '<div class="btn primary">'
      );
    });

    it('should include both id and classes', () => {
      expect(buildTagDisplay({ tagName: 'button', id: 'submit', classes: ['btn'] })).toBe(
        '<button id="submit" class="btn">'
      );
    });
  });

  describe('truncateText', () => {
    it('should not truncate short text', () => {
      expect(truncateText('Hello')).toBe('Hello');
    });

    it('should truncate long text', () => {
      const longText = 'a'.repeat(250);
      const result = truncateText(longText);
      expect(result).toHaveLength(203); // 200 + '...'
      expect(result.endsWith('...')).toBe(true);
    });

    it('should respect custom max length', () => {
      const result = truncateText('Hello World', 5);
      expect(result).toBe('Hello...');
    });
  });

  describe('formatProps', () => {
    it('should format single prop', () => {
      const result = formatProps({ name: 'John' });
      expect(result).toContain('name');
      expect(result).toContain('"John"');
    });

    it('should limit to 3 props by default', () => {
      const props = { a: 1, b: 2, c: 3, d: 4 };
      const result = formatProps(props);
      expect(result).toContain('...');
    });

    it('should not show ellipsis for 3 or fewer props', () => {
      const props = { a: 1, b: 2 };
      const result = formatProps(props);
      expect(result).not.toContain('...');
    });
  });

  describe('createInfoRow', () => {
    it('should create row with label and value', () => {
      const row = createInfoRow('Name', 'John');
      expect(row.className).toContain('info-row');
      expect(row.querySelector('.info-label')?.textContent).toBe('Name');
      expect(row.querySelector('.info-value')?.textContent).toBe('John');
    });

    it('should include custom class', () => {
      const row = createInfoRow('Test', 'Value', 'custom-class');
      expect(row.className).toContain('custom-class');
    });
  });

  describe('createBadge', () => {
    it('should create badge with text', () => {
      const badge = createBadge('Error');
      expect(badge.textContent).toBe('Error');
      expect(badge.className).toContain('badge');
    });

    it('should include type class', () => {
      const badge = createBadge('Warning', 'warning');
      expect(badge.className).toContain('badge-warning');
    });
  });

  describe('formatPosition', () => {
    it('should format position data', () => {
      const result = formatPosition({ x: 100.5, y: 200.7, width: 50.2, height: 30.8 });
      expect(result).toBe('101, 201 | 50×31');
    });
  });

  describe('formatSelector', () => {
    it('should not truncate short selector', () => {
      expect(formatSelector('#submit')).toBe('#submit');
    });

    it('should truncate long selector', () => {
      const longSelector = '#' + 'a'.repeat(100);
      const result = formatSelector(longSelector);
      expect(result.length).toBe(83); // 80 + '...'
      expect(result.endsWith('...')).toBe(true);
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert("xss")&lt;/script&gt;'
      );
    });

    it('should handle normal text', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });
  });

  describe('formatTimestamp', () => {
    it('should format timestamp', () => {
      // Create a specific timestamp
      const date = new Date(2024, 0, 15, 14, 30, 45); // Jan 15, 2024 14:30:45
      const result = formatTimestamp(date.getTime());
      expect(result).toBe('14:30:45');
    });
  });
});
