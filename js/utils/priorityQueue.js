/**
 * Simple priority queue using sorted array.
 * Sufficient for small collections (tab count is typically < 50).
 */
export class PriorityQueue {
  constructor(comparator = (a, b) => a - b) {
    this.items = [];
    this.comparator = comparator;
  }

  push(item) {
    this.items.push(item);
  }

  pop() {
    if (this.isEmpty()) return undefined;
    this.items.sort(this.comparator);
    return this.items.shift();
  }

  peek() {
    if (this.isEmpty()) return undefined;
    this.items.sort(this.comparator);
    return this.items[0];
  }

  isEmpty() {
    return this.items.length === 0;
  }

  get size() {
    return this.items.length;
  }

  clear() {
    this.items = [];
  }
}
