import { describe, expect, test, mock } from 'bun:test';
import { debounce, throttle } from '../index';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('debounce', () => {
  test('delays function execution', async () => {
    const fn = mock(() => {});
    const debounced = debounce(fn, 50);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    await sleep(60);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('resets timer on subsequent calls', async () => {
    const fn = mock(() => {});
    const debounced = debounce(fn, 50);

    debounced();
    await sleep(30);
    debounced(); // Reset timer
    await sleep(30);
    expect(fn).not.toHaveBeenCalled();

    await sleep(30);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('only calls once after rapid calls', async () => {
    const fn = mock(() => {});
    const debounced = debounce(fn, 50);

    debounced();
    debounced();
    debounced();
    debounced();
    debounced();

    await sleep(60);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('passes arguments to function', async () => {
    const fn = mock((_a: number, _b: string) => {});
    const debounced = debounce(fn, 50);

    debounced(42, 'hello');

    await sleep(60);
    expect(fn).toHaveBeenCalledWith(42, 'hello');
  });

  test('uses latest arguments', async () => {
    const fn = mock((_value: number) => {});
    const debounced = debounce(fn, 50);

    debounced(1);
    debounced(2);
    debounced(3);

    await sleep(60);
    expect(fn).toHaveBeenCalledWith(3);
  });
});

describe('throttle', () => {
  test('calls immediately on first invocation', () => {
    const fn = mock(() => {});
    const throttled = throttle(fn, 50);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('ignores calls within wait period', async () => {
    const fn = mock(() => {});
    const throttled = throttle(fn, 50);

    throttled(); // Immediate
    throttled(); // Ignored, schedules trailing
    throttled(); // Ignored
    throttled(); // Ignored

    expect(fn).toHaveBeenCalledTimes(1);

    await sleep(60);
    expect(fn).toHaveBeenCalledTimes(2); // Trailing call
  });

  test('allows call after wait period', async () => {
    const fn = mock(() => {});
    const throttled = throttle(fn, 50);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);

    await sleep(60);

    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('passes arguments to function', () => {
    const fn = mock((_a: number, _b: string) => {});
    const throttled = throttle(fn, 50);

    throttled(42, 'hello');
    expect(fn).toHaveBeenCalledWith(42, 'hello');
  });

  test('trailing call uses first scheduled arguments', async () => {
    const fn = mock((_value: number) => {});
    const throttled = throttle(fn, 50);

    throttled(1); // Immediate call with 1
    throttled(2); // Schedules trailing with 2
    throttled(3); // Ignored (trailing already scheduled)

    await sleep(60);
    // Trailing call uses args from when it was scheduled (2)
    expect(fn).toHaveBeenLastCalledWith(2);
  });

  test('rate limits rapid calls', async () => {
    const fn = mock(() => {});
    const throttled = throttle(fn, 100);

    throttled();
    await sleep(50);
    throttled();
    await sleep(50);
    throttled();
    await sleep(50);
    throttled();
    await sleep(120);

    // Should have called: immediate + trailing calls
    // With 100ms throttle over ~270ms, expect 2-3 calls
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(fn.mock.calls.length).toBeLessThanOrEqual(4);
  });
});
