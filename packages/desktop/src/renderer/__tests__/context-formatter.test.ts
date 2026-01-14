import { describe, it, expect } from 'vitest';
import {
  formatElementLean,
  formatElementDetailed,
  formatElement,
  formatElements,
  formatSequence,
  formatConsole,
} from '../context-formatter';
import type { ElementInfo, CapturedInteraction } from '../types';

// Test fixtures
const createMinimalElement = (overrides: Partial<ElementInfo> = {}): ElementInfo => ({
  tagName: 'div',
  classes: [],
  selector: 'div',
  text: '',
  ...overrides,
});

const createRichElement = (overrides: Partial<ElementInfo> = {}): ElementInfo => ({
  tagName: 'button',
  id: 'submit-btn',
  classes: ['btn', 'btn-primary', 'flex', 'p-4'],
  selector: '#submit-btn',
  text: 'Submit Form',
  attributes: {
    'data-testid': 'submit-button',
    'aria-label': 'Submit the form',
    type: 'submit',
  },
  position: { x: 100, y: 200, width: 120, height: 40 },
  framework: {
    framework: 'React',
    components: [
      {
        name: 'SubmitButton',
        source: { fileName: 'components/SubmitButton.tsx', lineNumber: 42 },
        props: { variant: 'primary' },
      },
    ],
  },
  parentChain: [
    { tagName: 'form', selector: 'form#login', description: 'form#login' },
    { tagName: 'div', selector: 'div.container', description: 'div.container' },
  ],
  ...overrides,
});

describe('formatElementLean', () => {
  it('should format element with source file info', () => {
    const el = createRichElement();
    const result = formatElementLean(el);

    expect(result).toContain('**Edit:** `components/SubmitButton.tsx:42`');
  });

  it('should format element with component name', () => {
    const el = createRichElement();
    const result = formatElementLean(el);

    expect(result).toContain('**Component:** SubmitButton');
  });

  it('should format element identity with id', () => {
    const el = createRichElement();
    const result = formatElementLean(el);

    expect(result).toContain('**Element:** <button#submit-btn>');
  });

  it('should format element identity with meaningful class when no id', () => {
    const el = createRichElement({ id: undefined, classes: ['primary-action', 'flex', 'p-4'] });
    const result = formatElementLean(el);

    expect(result).toContain('**Element:** <button.primary-action>');
  });

  it('should skip utility classes when finding meaningful class', () => {
    const el = createRichElement({ id: undefined, classes: ['flex', 'p-4', 'bg-blue', 'action-btn'] });
    const result = formatElementLean(el);

    expect(result).toContain('<button.action-btn>');
  });

  it('should truncate long text content', () => {
    const longText = 'This is a very long text that exceeds fifty characters limit';
    const el = createRichElement({ text: longText });
    const result = formatElementLean(el);

    // Text is truncated to 50 chars then ellipsis added
    expect(result).toContain('**Text:** "This is a very long text that exceeds fifty charac...');
    expect(result).not.toContain('limit');
  });

  it('should format key attributes', () => {
    const el = createRichElement();
    const result = formatElementLean(el);

    expect(result).toContain('data-testid="submit-button"');
    expect(result).toContain('aria-label="Submit the form"');
  });

  it('should include parent chain when no component info', () => {
    const el = createRichElement({
      framework: undefined,
      parentChain: [
        { tagName: 'form', selector: 'form#login', description: 'Login Form' },
        { tagName: 'div', selector: 'div.container', description: 'Container' },
      ],
    });
    const result = formatElementLean(el);

    expect(result).toContain('**In:** Login Form → Container');
  });

  it('should NOT include parent chain when component info exists', () => {
    const el = createRichElement();
    const result = formatElementLean(el);

    // Should have component info but not parent chain
    expect(result).toContain('**Component:**');
    expect(result).not.toContain('**In:**');
  });

  it('should handle minimal element', () => {
    const el = createMinimalElement();
    const result = formatElementLean(el);

    expect(result).toContain('<div>');
  });
});

describe('formatElementDetailed', () => {
  it('should include header with tag and id', () => {
    const el = createRichElement();
    const result = formatElementDetailed(el);

    expect(result).toContain('## <button#submit-btn>');
  });

  it('should exclude selector by default (per DEFAULT_OPTIONS)', () => {
    const el = createRichElement();
    const result = formatElementDetailed(el);

    // includeSelector defaults to false in DEFAULT_OPTIONS
    expect(result).not.toContain('**Selector:**');
  });

  it('should include selector when option is true', () => {
    const el = createRichElement();
    const result = formatElementDetailed(el, { includeSelector: true });

    expect(result).toContain('**Selector:** `#submit-btn`');
  });

  it('should translate Tailwind classes', () => {
    const el = createRichElement({ classes: ['flex', 'p-4', 'rounded-lg', 'custom-class'] });
    const result = formatElementDetailed(el);

    expect(result).toContain('flex(flex)');
    expect(result).toContain('p-4(16px)');
    expect(result).toContain('rounded-lg(8px)');
    expect(result).toContain('custom-class'); // Not translated
  });

  it('should limit number of classes shown', () => {
    const el = createRichElement({
      classes: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'],
    });
    const result = formatElementDetailed(el, { maxClasses: 3 });

    expect(result).toContain('+7 more');
  });

  it('should include styles when option is true', () => {
    const el = createRichElement({
      styles: {
        color: 'rgb(255, 0, 0)',
        backgroundColor: 'rgb(0, 255, 0)',
        fontSize: '18px',
      },
    });
    const result = formatElementDetailed(el, { includeStyles: true });

    expect(result).toContain('**Styles:**');
    expect(result).toContain('color:rgb(255, 0, 0)');
    expect(result).toContain('bg:rgb(0, 255, 0)');
    expect(result).toContain('font:18px');
  });

  it('should exclude default style values', () => {
    const el = createRichElement({
      styles: {
        color: 'rgb(0, 0, 0)', // default
        backgroundColor: 'rgba(0, 0, 0, 0)', // default
        fontSize: '16px', // default
      },
    });
    const result = formatElementDetailed(el, { includeStyles: true });

    expect(result).not.toContain('**Styles:**');
  });

  it('should include position when option is true', () => {
    const el = createRichElement({ position: { x: 100.5, y: 200.7, width: 120, height: 40 } });
    const result = formatElementDetailed(el, { includePosition: true });

    expect(result).toContain('**Position:** 120×40 at (101, 201)');
  });

  it('should format form state', () => {
    const el = createRichElement({
      tagName: 'input',
      formState: {
        type: 'email',
        value: 'test@example.com',
        required: true,
        disabled: false,
        readOnly: false,
        validationState: 'invalid',
        validationMessage: 'Invalid email format',
      },
    });
    const result = formatElementDetailed(el);

    expect(result).toContain('**Form:** type:email');
    expect(result).toContain('value:"test@example.com"');
    expect(result).toContain('invalid:"Invalid email format"');
    expect(result).toContain('required');
  });

  it('should include disabled in form state', () => {
    const el = createRichElement({
      formState: {
        type: 'text',
        value: '',
        required: false,
        disabled: true,
        readOnly: false,
        validationState: null,
      },
    });
    const result = formatElementDetailed(el);

    expect(result).toContain('disabled');
  });
});

describe('formatElement', () => {
  it('should use lean mode by default', () => {
    const el = createRichElement();
    const result = formatElement(el);

    // Lean mode doesn't have ## header
    expect(result).not.toContain('## <button');
    expect(result).toContain('**Edit:**');
  });

  it('should use detailed mode when specified', () => {
    const el = createRichElement();
    const result = formatElement(el, { mode: 'detailed' });

    expect(result).toContain('## <button#submit-btn>');
  });
});

describe('formatElements', () => {
  it('should return empty string for empty array', () => {
    const result = formatElements([]);
    expect(result).toBe('');
  });

  it('should format single element without header', () => {
    const el = createRichElement();
    const result = formatElements([el]);

    expect(result).not.toContain('### Element 1');
    expect(result).toContain('**Edit:**');
  });

  it('should format multiple elements with headers', () => {
    const el1 = createRichElement({ id: 'btn-1' });
    const el2 = createRichElement({ id: 'btn-2' });
    const result = formatElements([el1, el2]);

    expect(result).toContain('### Element 1');
    expect(result).toContain('### Element 2');
  });

  it('should pass options to each element', () => {
    const el1 = createRichElement();
    const el2 = createRichElement();
    const result = formatElements([el1, el2], { mode: 'detailed', includePosition: true });

    expect(result).toContain('**Position:**');
  });
});

describe('formatSequence', () => {
  const createInteraction = (overrides: Partial<CapturedInteraction> = {}): CapturedInteraction => ({
    element: createRichElement(),
    action: 'click',
    result: 'clicked',
    timestamp: Date.now(),
    ...overrides,
  });

  it('should return empty string for empty sequence', () => {
    const result = formatSequence([]);
    expect(result).toBe('');
  });

  it('should include step count in header', () => {
    const sequence = [createInteraction(), createInteraction()];
    const result = formatSequence(sequence);

    expect(result).toContain('## Interaction Sequence (2 steps)');
  });

  it('should prioritize file:line location', () => {
    const sequence = [createInteraction()];
    const result = formatSequence(sequence);

    expect(result).toContain('`components/SubmitButton.tsx:42`');
  });

  it('should fall back to component name when no source', () => {
    const el = createRichElement({
      framework: {
        framework: 'React',
        components: [{ name: 'MyButton' }],
      },
    });
    const sequence = [createInteraction({ element: el })];
    const result = formatSequence(sequence);

    expect(result).toContain('`<MyButton />`');
  });

  it('should fall back to selector when no component info', () => {
    const el = createRichElement({ framework: undefined });
    const sequence = [createInteraction({ element: el })];
    const result = formatSequence(sequence);

    expect(result).toContain('`#submit-btn`');
  });

  it('should include truncated text', () => {
    const el = createRichElement({ text: 'Click me to submit the form now' });
    const sequence = [createInteraction({ element: el })];
    const result = formatSequence(sequence);

    expect(result).toContain('"Click me to submit the form no...');
  });

  it('should number steps correctly', () => {
    const sequence = [
      createInteraction(),
      createInteraction(),
      createInteraction(),
    ];
    const result = formatSequence(sequence);

    expect(result).toContain('1. `');
    expect(result).toContain('2. `');
    expect(result).toContain('3. `');
  });
});

describe('formatConsole', () => {
  it('should return empty string for empty messages', () => {
    const result = formatConsole([]);
    expect(result).toBe('');
  });

  it('should format messages with level and count', () => {
    const messages = [
      { level: 'error', message: 'Something went wrong' },
      { level: 'warn', message: 'Deprecated API usage' },
    ];
    const result = formatConsole(messages);

    expect(result).toContain('## Console (2 messages)');
    expect(result).toContain('[ERROR] Something went wrong');
    expect(result).toContain('[WARN] Deprecated API usage');
  });

  it('should wrap messages in code block', () => {
    const messages = [{ level: 'log', message: 'Debug info' }];
    const result = formatConsole(messages);

    expect(result).toContain('```\n[LOG] Debug info\n```');
  });
});

describe('Tailwind translation', () => {
  it('should translate common spacing classes', () => {
    const el = createRichElement({ classes: ['p-1', 'p-2', 'p-4', 'm-auto', 'gap-2'] });
    const result = formatElementDetailed(el);

    expect(result).toContain('p-1(4px)');
    expect(result).toContain('p-2(8px)');
    expect(result).toContain('p-4(16px)');
    expect(result).toContain('m-auto(auto)');
    expect(result).toContain('gap-2(8px)');
  });

  it('should translate layout classes', () => {
    const el = createRichElement({ classes: ['flex', 'flex-col', 'items-center'] });
    const result = formatElementDetailed(el);

    expect(result).toContain('flex(flex)');
    expect(result).toContain('flex-col(column)');
    expect(result).toContain('items-center(center)');
  });

  it('should translate typography classes', () => {
    const el = createRichElement({ classes: ['text-sm', 'text-lg', 'font-bold'] });
    const result = formatElementDetailed(el);

    expect(result).toContain('text-sm(14px)');
    expect(result).toContain('text-lg(18px)');
    expect(result).toContain('font-bold(700)');
  });

  it('should translate border/radius classes', () => {
    const el = createRichElement({ classes: ['rounded', 'rounded-lg', 'rounded-full'] });
    const result = formatElementDetailed(el);

    expect(result).toContain('rounded(4px)');
    expect(result).toContain('rounded-lg(8px)');
    expect(result).toContain('rounded-full(9999px)');
  });

  it('should handle prefixed classes (hover:, dark:, etc.)', () => {
    const el = createRichElement({ classes: ['hover:p-4', 'dark:text-sm', 'sm:flex'] });
    const result = formatElementDetailed(el);

    expect(result).toContain('hover:p-4(16px)');
    expect(result).toContain('dark:text-sm(14px)');
    expect(result).toContain('sm:flex(flex)');
  });
});

describe('Key attributes extraction', () => {
  it('should include data-testid', () => {
    const el = createRichElement({
      attributes: { 'data-testid': 'my-test-id' },
    });
    const result = formatElementLean(el);

    expect(result).toContain('data-testid="my-test-id"');
  });

  it('should include aria-label', () => {
    const el = createRichElement({
      attributes: { 'aria-label': 'Close dialog' },
    });
    const result = formatElementLean(el);

    expect(result).toContain('aria-label="Close dialog"');
  });

  it('should include role', () => {
    const el = createRichElement({
      attributes: { role: 'button' },
    });
    const result = formatElementLean(el);

    expect(result).toContain('role="button"');
  });

  it('should include placeholder', () => {
    const el = createRichElement({
      attributes: { placeholder: 'Enter email' },
    });
    const result = formatElementLean(el);

    expect(result).toContain('placeholder="Enter email"');
  });

  it('should truncate long attribute values', () => {
    const longValue = 'This is a very long attribute value that exceeds the limit';
    const el = createRichElement({
      attributes: { 'data-testid': longValue },
    });
    const result = formatElementLean(el);

    // Attributes are truncated to 30 chars
    expect(result).toContain('data-testid="This is a very long attribute ...');
  });

  it('should not include non-key attributes', () => {
    const el = createRichElement({
      attributes: {
        'data-testid': 'test',
        class: 'btn btn-primary', // Not a key attribute
        style: 'color: red', // Not a key attribute
      },
    });
    const result = formatElementLean(el);

    expect(result).toContain('data-testid');
    expect(result).not.toContain('class=');
    expect(result).not.toContain('style=');
  });
});
