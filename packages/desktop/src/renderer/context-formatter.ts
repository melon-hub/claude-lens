/**
 * Context Formatter - Optimized element context for Claude
 *
 * Based on Claude's own feedback about what information is actually useful:
 *
 * MOST EFFICIENT (fewest steps to fix):
 * 1. File:line + problem description → Read file → fix (2 steps)
 * 2. Component name + problem → Grep → read → fix (3 steps)
 * 3. UI location + problem → Screenshot → grep → read → fix (4 steps)
 *
 * LEAST USEFUL (often ignored):
 * - Long CSS selectors (just tells hierarchy, rarely used directly)
 * - Computed styles (Claude said "didn't use at all")
 * - Position coordinates (x/y/width/height)
 *
 * This module provides both lean and detailed context modes.
 */

import type { ElementInfo, CapturedInteraction } from './types';

export type ContextMode = 'lean' | 'detailed';

export interface ContextOptions {
  mode: ContextMode;
  includeSelector?: boolean;
  includeStyles?: boolean;
  includePosition?: boolean;
  maxTextLength?: number;
  maxClasses?: number;
}

const DEFAULT_OPTIONS: ContextOptions = {
  mode: 'lean',
  includeSelector: false,
  includeStyles: false,
  includePosition: false,
  maxTextLength: 50,
  maxClasses: 6,
};

/**
 * Format a single element for Claude - LEAN mode
 *
 * Priority order (what Claude actually uses):
 * 1. Edit target (file:line) - MOST IMPORTANT
 * 2. Component name (for grep)
 * 3. Searchable text content (for grep)
 * 4. Key attributes (data-testid, aria-label)
 */
export function formatElementLean(el: ElementInfo): string {
  const lines: string[] = [];

  // 1. PRIMARY: Edit target (file:line) - This is gold
  const source = el.framework?.components?.[0]?.source;
  if (source) {
    lines.push(`**Edit:** \`${source.fileName}:${source.lineNumber}\``);
  }

  // 2. Component info (for grep when file:line unavailable)
  if (el.framework?.components && el.framework.components.length > 0) {
    const componentNames = el.framework.components.map(c => c.name).join(' → ');
    lines.push(`**Component:** ${componentNames}`);
  }

  // 3. Element identity (concise)
  const identity = buildElementIdentity(el);
  if (identity) {
    lines.push(`**Element:** ${identity}`);
  }

  // 4. Searchable text (crucial for grep)
  if (el.text && el.text.trim()) {
    const truncated = el.text.trim().slice(0, 50);
    const suffix = el.text.length > 50 ? '...' : '';
    lines.push(`**Text:** "${truncated}${suffix}"`);
  }

  // 5. Key attributes only (testid, aria-label, role - things that help locate)
  const keyAttrs = extractKeyAttributes(el.attributes);
  if (keyAttrs) {
    lines.push(`**Attrs:** ${keyAttrs}`);
  }

  // 6. Parent context (only if no component info - helps locate visually)
  if (!el.framework?.components?.length && el.parentChain && el.parentChain.length > 0) {
    const parents = el.parentChain.slice(0, 2).map(p => p.description).join(' → ');
    lines.push(`**In:** ${parents}`);
  }

  return lines.join('\n');
}

/**
 * Format a single element for Claude - DETAILED mode
 * Includes everything, similar to current implementation
 */
export function formatElementDetailed(el: ElementInfo, options: Partial<ContextOptions> = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options, mode: 'detailed' as const };
  const lines: string[] = [];

  // Header
  lines.push(`## <${el.tagName}${el.id ? '#' + el.id : ''}>`);

  // Edit target first (most important)
  const source = el.framework?.components?.[0]?.source;
  if (source) {
    lines.push(`**Edit:** \`${source.fileName}:${source.lineNumber}\``);
  }

  // Component hierarchy
  if (el.framework?.components && el.framework.components.length > 0) {
    const comps = el.framework.components.map(c => {
      let s = `<${c.name} />`;
      if (c.source) s += ` (${c.source.fileName}:${c.source.lineNumber})`;
      return s;
    });
    lines.push(`**Components:** ${comps.join(' → ')}`);
  }

  // Selector (optional in detailed mode)
  if (opts.includeSelector !== false) {
    lines.push(`**Selector:** \`${el.selector}\``);
  }

  // Text content
  if (el.text && el.text.trim()) {
    const maxLen = opts.maxTextLength || 50;
    const truncated = el.text.trim().slice(0, maxLen);
    const suffix = el.text.length > maxLen ? '...' : '';
    lines.push(`**Text:** "${truncated}${suffix}"`);
  }

  // Classes with Tailwind translation
  if (el.classes && el.classes.length > 0) {
    const maxClasses = opts.maxClasses || 6;
    const classInfo = el.classes.slice(0, maxClasses).map(c => translateTailwind(c));
    if (el.classes.length > maxClasses) {
      classInfo.push(`+${el.classes.length - maxClasses} more`);
    }
    lines.push(`**Classes:** ${classInfo.join(' ')}`);
  }

  // Key attributes
  const keyAttrs = extractKeyAttributes(el.attributes);
  if (keyAttrs) {
    lines.push(`**Attrs:** ${keyAttrs}`);
  }

  // Computed styles (only if explicitly requested)
  if (opts.includeStyles && el.styles) {
    const styleInfo = extractKeyStyles(el.styles);
    if (styleInfo) {
      lines.push(`**Styles:** ${styleInfo}`);
    }
  }

  // Position (only if explicitly requested)
  if (opts.includePosition && el.position) {
    const pos = el.position;
    lines.push(`**Position:** ${pos.width}×${pos.height} at (${Math.round(pos.x)}, ${Math.round(pos.y)})`);
  }

  // Parent context
  if (el.parentChain && el.parentChain.length > 0) {
    const parents = el.parentChain.slice(0, 3).map(p => p.description).join(' → ');
    lines.push(`**In:** ${parents}`);
  }

  // Form state (if applicable)
  if (el.formState) {
    const fs = el.formState;
    const formParts: string[] = [`type:${fs.type}`];
    if (fs.value) formParts.push(`value:"${fs.value.slice(0, 20)}"`);
    if (fs.validationState === 'invalid') formParts.push(`invalid:"${fs.validationMessage}"`);
    if (fs.disabled) formParts.push('disabled');
    if (fs.required) formParts.push('required');
    lines.push(`**Form:** ${formParts.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Format element based on mode
 */
export function formatElement(el: ElementInfo, options: Partial<ContextOptions> = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return opts.mode === 'lean' ? formatElementLean(el) : formatElementDetailed(el, opts);
}

/**
 * Format multiple elements for context
 */
export function formatElements(elements: ElementInfo[], options: Partial<ContextOptions> = {}): string {
  if (elements.length === 0) return '';

  if (elements.length === 1 && elements[0]) {
    return formatElement(elements[0], options);
  }

  return elements.map((el, i) => {
    const header = `### Element ${i + 1}`;
    const content = formatElement(el, options);
    return `${header}\n${content}`;
  }).join('\n\n');
}

/**
 * Format interaction sequence (lean)
 */
export function formatSequence(sequence: CapturedInteraction[]): string {
  if (sequence.length === 0) return '';

  const lines = [`## Interaction Sequence (${sequence.length} steps)\n`];

  for (let i = 0; i < sequence.length; i++) {
    const interaction = sequence[i];
    if (!interaction) continue;

    const el = interaction.element;
    const source = el.framework?.components?.[0]?.source;

    // Prioritize file:line, then component, then selector
    let location: string;
    if (source) {
      location = `${source.fileName}:${source.lineNumber}`;
    } else if (el.framework?.components?.[0]) {
      location = `<${el.framework.components[0].name} />`;
    } else {
      location = el.selector;
    }

    let line = `${i + 1}. \`${location}\``;
    if (el.text) {
      const text = el.text.slice(0, 30);
      line += ` "${text}${el.text.length > 30 ? '...' : ''}"`;
    }
    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Format console messages (lean)
 */
export function formatConsole(messages: Array<{ level: string; message: string }>): string {
  if (messages.length === 0) return '';

  const lines = messages.map(m => `[${m.level.toUpperCase()}] ${m.message}`);
  return `## Console (${messages.length} messages)\n\`\`\`\n${lines.join('\n')}\n\`\`\``;
}

// --- Helper Functions ---

/**
 * Build concise element identity (tag + id or key class)
 */
function buildElementIdentity(el: ElementInfo): string {
  let identity = `<${el.tagName}`;

  if (el.id) {
    identity += `#${el.id}`;
  } else if (el.classes && el.classes.length > 0) {
    // Pick most meaningful class (skip utility classes)
    const meaningfulClass = el.classes.find(c =>
      !c.match(/^(flex|grid|block|hidden|p-|m-|w-|h-|text-|bg-|border-|rounded-)/)
    );
    if (meaningfulClass) {
      identity += `.${meaningfulClass}`;
    }
  }

  identity += '>';
  return identity;
}

/**
 * Extract only key attributes that help locate/identify elements
 */
function extractKeyAttributes(attrs?: Record<string, string>): string | null {
  if (!attrs) return null;

  const keyAttrNames = ['data-testid', 'aria-label', 'role', 'name', 'placeholder', 'alt', 'title'];
  const found: string[] = [];

  for (const name of keyAttrNames) {
    if (attrs[name]) {
      const val = attrs[name].slice(0, 30);
      const suffix = attrs[name].length > 30 ? '...' : '';
      found.push(`${name}="${val}${suffix}"`);
    }
  }

  return found.length > 0 ? found.join(', ') : null;
}

/**
 * Extract only meaningful computed styles (skip defaults)
 */
function extractKeyStyles(styles: Record<string, string>): string | null {
  const parts: string[] = [];

  // Only include non-default values
  if (styles.color && styles.color !== 'rgb(0, 0, 0)') {
    parts.push(`color:${styles.color}`);
  }
  if (styles.backgroundColor && styles.backgroundColor !== 'rgba(0, 0, 0, 0)') {
    parts.push(`bg:${styles.backgroundColor}`);
  }
  if (styles.fontSize && styles.fontSize !== '16px') {
    parts.push(`font:${styles.fontSize}`);
  }

  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Translate common Tailwind classes to values (helps understanding)
 */
function translateTailwind(className: string): string {
  const translations: Record<string, string> = {
    // Spacing
    'p-0': '0', 'p-1': '4px', 'p-2': '8px', 'p-4': '16px',
    'm-0': '0', 'm-1': '4px', 'm-2': '8px', 'm-4': '16px', 'm-auto': 'auto',
    'gap-1': '4px', 'gap-2': '8px', 'gap-4': '16px',
    // Layout
    'flex': 'flex', 'grid': 'grid', 'block': 'block', 'hidden': 'hidden',
    'flex-col': 'column', 'items-center': 'center', 'justify-between': 'space-between',
    // Typography
    'text-sm': '14px', 'text-base': '16px', 'text-lg': '18px', 'text-xl': '20px',
    'font-medium': '500', 'font-semibold': '600', 'font-bold': '700',
    // Border
    'rounded': '4px', 'rounded-md': '6px', 'rounded-lg': '8px', 'rounded-full': '9999px',
  };

  const translation = translations[className];
  if (translation) {
    return `${className}(${translation})`;
  }

  // Handle prefixed classes (hover:, dark:, sm:, etc.)
  const match = className.match(/^(hover:|focus:|dark:|sm:|md:|lg:)(.+)$/);
  const baseClass = match?.[2];
  if (baseClass && translations[baseClass]) {
    return `${className}(${translations[baseClass]})`;
  }

  return className;
}
