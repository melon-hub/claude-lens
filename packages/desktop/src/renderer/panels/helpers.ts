/**
 * Panel UI helper functions
 *
 * Pure functions for building UI elements and formatting data
 */

import type { ElementInfo } from '../types';

/**
 * Build tag display string (e.g., "<button id="submit" class="btn primary">")
 */
export function buildTagDisplay(element: Pick<ElementInfo, 'tagName' | 'id' | 'classes'>): string {
  let display = `<${element.tagName}`;
  if (element.id) {
    display += ` id="${element.id}"`;
  }
  if (element.classes && element.classes.length > 0) {
    display += ` class="${element.classes.join(' ')}"`;
  }
  display += '>';
  return display;
}

/**
 * Truncate text content for display
 */
export function truncateText(text: string, maxLength = 200): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '...';
}

/**
 * Format props for display (limited entries)
 */
export function formatProps(props: Record<string, unknown>, maxEntries = 3): string {
  const entries = Object.entries(props).slice(0, maxEntries);
  const formatted = entries.map(([k, v]) => {
    const valueStr = typeof v === 'string' ? `"${v}"` : String(v);
    return `<span class="prop-name">${k}</span>=<span class="prop-value">${valueStr}</span>`;
  }).join(' ');

  if (Object.keys(props).length > maxEntries) {
    return formatted + ' ...';
  }
  return formatted;
}

/**
 * Create a simple info row element
 */
export function createInfoRow(label: string, value: string, className = ''): HTMLDivElement {
  const row = document.createElement('div');
  row.className = `info-row ${className}`.trim();

  const labelEl = document.createElement('span');
  labelEl.className = 'info-label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const valueEl = document.createElement('span');
  valueEl.className = 'info-value';
  valueEl.textContent = value;
  row.appendChild(valueEl);

  return row;
}

/**
 * Create badge element
 */
export function createBadge(text: string, type = 'default'): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = `badge badge-${type}`;
  badge.textContent = text;
  return badge;
}

/**
 * Format position data for display
 */
export function formatPosition(position: ElementInfo['position']): string {
  return `${Math.round(position.x)}, ${Math.round(position.y)} | ${Math.round(position.width)}×${Math.round(position.height)}`;
}

/**
 * Format selector for display (truncated if long)
 */
export function formatSelector(selector: string, maxLength = 80): string {
  if (selector.length <= maxLength) {
    return selector;
  }
  return selector.substring(0, maxLength) + '...';
}

/**
 * Escape HTML for safe display
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format timestamp for console messages
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
