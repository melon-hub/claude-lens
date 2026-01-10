/**
 * CircularBuffer - O(1) fixed-size buffer for high-frequency data
 *
 * Browser-compatible version for renderer process.
 */
export class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private head = 0;
  private tail = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    if (capacity <= 0) {
      throw new Error('CircularBuffer capacity must be positive');
    }
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;

    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
  }

  toArray(): T[] {
    if (this.count === 0) return [];

    const result: T[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const index = (this.head + i) % this.capacity;
      result[i] = this.buffer[index] as T;
    }
    return result;
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.toArray().filter(predicate);
  }

  get length(): number {
    return this.count;
  }
}
