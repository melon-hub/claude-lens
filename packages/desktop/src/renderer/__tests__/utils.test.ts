import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../utils/debounce';
import { getEl, copyToClipboard } from '../utils/dom';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay function execution', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should cancel previous timeout on subsequent calls', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    vi.advanceTimersByTime(50);
    debouncedFn(); // Reset timer
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to the function', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn('arg1', 'arg2');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('should only call function once for multiple rapid calls', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    debouncedFn();
    debouncedFn();
    debouncedFn();
    debouncedFn();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('getEl', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="test-div">Test Div</div>
      <button id="test-button">Test Button</button>
      <input id="test-input" type="text" />
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should return element by id', () => {
    const div = getEl<HTMLDivElement>('test-div');
    expect(div).toBeDefined();
    expect(div.textContent).toBe('Test Div');
  });

  it('should return correctly typed element', () => {
    const button = getEl<HTMLButtonElement>('test-button');
    expect(button.tagName).toBe('BUTTON');
  });

  it('should return null for non-existent id', () => {
    const element = getEl<HTMLDivElement>('non-existent');
    expect(element).toBeNull();
  });
});

describe('copyToClipboard', () => {
  let mockButton: HTMLButtonElement;
  let mockSetStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockButton = document.createElement('button');
    mockButton.innerHTML = '<svg>original</svg>';
    mockSetStatus = vi.fn();

    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('should copy text to clipboard', async () => {
    await copyToClipboard('test text', mockButton, mockSetStatus);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test text');
  });

  it('should add copied class to button', async () => {
    await copyToClipboard('test', mockButton, mockSetStatus);

    expect(mockButton.classList.contains('copied')).toBe(true);
  });

  it('should call setStatus with success message', async () => {
    await copyToClipboard('test', mockButton, mockSetStatus);

    expect(mockSetStatus).toHaveBeenCalledWith('Copied!', true);
  });

  it('should swap button icon to checkmark', async () => {
    await copyToClipboard('test', mockButton, mockSetStatus);

    expect(mockButton.innerHTML).toContain('polyline');
    expect(mockButton.innerHTML).toContain('20 6 9 17 4 12');
  });

  it('should handle clipboard error', async () => {
    const error = new Error('Clipboard error');
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await copyToClipboard('test', mockButton, mockSetStatus);

    expect(consoleSpy).toHaveBeenCalledWith('Failed to copy:', error);
    expect(mockSetStatus).toHaveBeenCalledWith('Copy failed');

    consoleSpy.mockRestore();
  });

  it('should work without setStatus callback', async () => {
    await copyToClipboard('test', mockButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test');
    expect(mockButton.classList.contains('copied')).toBe(true);
  });
});
