import { describe, expect, test } from 'bun:test';
import { CircularBuffer } from '../circular-buffer';

describe('CircularBuffer', () => {
  describe('constructor', () => {
    test('creates buffer with specified capacity', () => {
      const buffer = new CircularBuffer<number>(5);
      expect(buffer.size).toBe(5);
      expect(buffer.length).toBe(0);
    });

    test('throws on zero capacity', () => {
      expect(() => new CircularBuffer<number>(0)).toThrow('capacity must be positive');
    });

    test('throws on negative capacity', () => {
      expect(() => new CircularBuffer<number>(-1)).toThrow('capacity must be positive');
    });
  });

  describe('push', () => {
    test('adds items to buffer', () => {
      const buffer = new CircularBuffer<string>(3);
      buffer.push('a');
      buffer.push('b');
      expect(buffer.length).toBe(2);
      expect(buffer.toArray()).toEqual(['a', 'b']);
    });

    test('overwrites oldest when full', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4); // Overwrites 1
      expect(buffer.length).toBe(3);
      expect(buffer.toArray()).toEqual([2, 3, 4]);
    });

    test('handles wrap-around correctly', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);
      buffer.push(6);
      expect(buffer.toArray()).toEqual([4, 5, 6]);
    });
  });

  describe('pushMany', () => {
    test('adds multiple items', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);
      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });

    test('handles overflow with many items', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.pushMany([1, 2, 3, 4, 5]);
      expect(buffer.toArray()).toEqual([3, 4, 5]);
    });
  });

  describe('toArray', () => {
    test('returns empty array when empty', () => {
      const buffer = new CircularBuffer<number>(3);
      expect(buffer.toArray()).toEqual([]);
    });

    test('returns copy of items in order', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);
      const arr = buffer.toArray();
      expect(arr).toEqual([1, 2, 3]);
      arr.push(99);
      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });
  });

  describe('last', () => {
    test('returns last n items', () => {
      const buffer = new CircularBuffer<number>(10);
      buffer.pushMany([1, 2, 3, 4, 5]);
      expect(buffer.last(3)).toEqual([3, 4, 5]);
    });

    test('returns all items if n > length', () => {
      const buffer = new CircularBuffer<number>(10);
      buffer.pushMany([1, 2, 3]);
      expect(buffer.last(10)).toEqual([1, 2, 3]);
    });
  });

  describe('at', () => {
    test('returns item at index', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.pushMany([10, 20, 30]);
      expect(buffer.at(0)).toBe(10);
      expect(buffer.at(1)).toBe(20);
      expect(buffer.at(2)).toBe(30);
    });

    test('returns undefined for out of bounds', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.pushMany([10, 20]);
      expect(buffer.at(-1)).toBeUndefined();
      expect(buffer.at(5)).toBeUndefined();
    });
  });

  describe('peek', () => {
    test('returns most recent item', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      expect(buffer.peek()).toBe(3);
    });

    test('returns undefined when empty', () => {
      const buffer = new CircularBuffer<number>(5);
      expect(buffer.peek()).toBeUndefined();
    });
  });

  describe('clear', () => {
    test('removes all items', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);
      buffer.clear();
      expect(buffer.length).toBe(0);
      expect(buffer.isEmpty).toBe(true);
      expect(buffer.toArray()).toEqual([]);
    });

    test('can add items after clear', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.pushMany([1, 2, 3]);
      buffer.clear();
      buffer.push(99);
      expect(buffer.toArray()).toEqual([99]);
    });
  });

  describe('properties', () => {
    test('isEmpty returns true when empty', () => {
      const buffer = new CircularBuffer<number>(5);
      expect(buffer.isEmpty).toBe(true);
      buffer.push(1);
      expect(buffer.isEmpty).toBe(false);
    });

    test('isFull returns true at capacity', () => {
      const buffer = new CircularBuffer<number>(2);
      expect(buffer.isFull).toBe(false);
      buffer.push(1);
      expect(buffer.isFull).toBe(false);
      buffer.push(2);
      expect(buffer.isFull).toBe(true);
    });
  });

  describe('iterator', () => {
    test('iterates in order', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);
      const result: number[] = [];
      for (const item of buffer) {
        result.push(item);
      }
      expect(result).toEqual([1, 2, 3]);
    });

    test('works with spread operator', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);
      expect([...buffer]).toEqual([1, 2, 3]);
    });
  });

  describe('filter', () => {
    test('returns matching items', () => {
      const buffer = new CircularBuffer<number>(10);
      buffer.pushMany([1, 2, 3, 4, 5]);
      expect(buffer.filter(n => n % 2 === 0)).toEqual([2, 4]);
    });
  });

  describe('find', () => {
    test('returns first matching item', () => {
      const buffer = new CircularBuffer<number>(10);
      buffer.pushMany([1, 2, 3, 4, 5]);
      expect(buffer.find(n => n > 2)).toBe(3);
    });

    test('returns undefined if not found', () => {
      const buffer = new CircularBuffer<number>(10);
      buffer.pushMany([1, 2, 3]);
      expect(buffer.find(n => n > 10)).toBeUndefined();
    });
  });
});
