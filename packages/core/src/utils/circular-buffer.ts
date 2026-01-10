/**
 * CircularBuffer - O(1) fixed-size buffer for high-frequency data
 *
 * Used for console message buffers and dev server output where we need
 * to maintain a sliding window of recent items without the O(n) cost
 * of Array.shift().
 *
 * @example
 * const buffer = new CircularBuffer<string>(100);
 * buffer.push('message 1');
 * buffer.push('message 2');
 * console.log(buffer.toArray()); // ['message 1', 'message 2']
 */
export class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private head = 0; // Index of oldest item
  private tail = 0; // Index where next item will be written
  private count = 0;

  constructor(private readonly capacity: number) {
    if (capacity <= 0) {
      throw new Error('CircularBuffer capacity must be positive');
    }
    this.buffer = new Array(capacity);
  }

  /**
   * Add an item to the buffer. O(1) operation.
   * If buffer is full, overwrites the oldest item.
   */
  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;

    if (this.count < this.capacity) {
      this.count++;
    } else {
      // Buffer is full, move head forward (overwrite oldest)
      this.head = (this.head + 1) % this.capacity;
    }
  }

  /**
   * Add multiple items to the buffer.
   */
  pushMany(items: T[]): void {
    for (const item of items) {
      this.push(item);
    }
  }

  /**
   * Get all items in order (oldest to newest).
   * Returns a new array, does not modify the buffer.
   */
  toArray(): T[] {
    if (this.count === 0) return [];

    const result: T[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const index = (this.head + i) % this.capacity;
      result[i] = this.buffer[index] as T;
    }
    return result;
  }

  /**
   * Get the last n items (most recent).
   */
  last(n: number): T[] {
    const items = this.toArray();
    return items.slice(-n);
  }

  /**
   * Get item at index (0 = oldest, length-1 = newest).
   */
  at(index: number): T | undefined {
    if (index < 0 || index >= this.count) return undefined;
    const bufferIndex = (this.head + index) % this.capacity;
    return this.buffer[bufferIndex];
  }

  /**
   * Get the most recent item.
   */
  peek(): T | undefined {
    if (this.count === 0) return undefined;
    const index = (this.tail - 1 + this.capacity) % this.capacity;
    return this.buffer[index];
  }

  /**
   * Clear all items from the buffer.
   */
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  /**
   * Number of items currently in the buffer.
   */
  get length(): number {
    return this.count;
  }

  /**
   * Maximum capacity of the buffer.
   */
  get size(): number {
    return this.capacity;
  }

  /**
   * Whether the buffer is empty.
   */
  get isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * Whether the buffer is at capacity.
   */
  get isFull(): boolean {
    return this.count === this.capacity;
  }

  /**
   * Iterate over items (oldest to newest).
   */
  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this.count; i++) {
      const index = (this.head + i) % this.capacity;
      yield this.buffer[index] as T;
    }
  }

  /**
   * Filter items and return matching ones.
   */
  filter(predicate: (item: T) => boolean): T[] {
    return this.toArray().filter(predicate);
  }

  /**
   * Find the first item matching the predicate.
   */
  find(predicate: (item: T) => boolean): T | undefined {
    for (const item of this) {
      if (predicate(item)) return item;
    }
    return undefined;
  }
}
