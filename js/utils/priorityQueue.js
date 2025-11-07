/**
 * 優先度キュー (Min Heap)
 * タブスリープ処理の最適化に使用
 */
export class PriorityQueue {
  /**
   * @param {Function} compareFn - 比較関数 (a, b) => number
   *   負の値: a < b
   *   0: a === b
   *   正の値: a > b
   */
  constructor(compareFn) {
    this.heap = [];
    this.compareFn = compareFn || ((a, b) => a - b);
  }

  /**
   * 要素を追加
   * @param {*} item - 追加する要素
   */
  push(item) {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  /**
   * 最小要素を取り出す
   * @returns {*} 最小要素
   */
  pop() {
    if (this.heap.length === 0) return null;

    const top = this.heap[0];
    const bottom = this.heap.pop();

    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.bubbleDown(0);
    }

    return top;
  }

  /**
   * 最小要素を取得（削除しない）
   * @returns {*} 最小要素
   */
  peek() {
    return this.heap[0] || null;
  }

  /**
   * サイズを取得
   * @returns {number} サイズ
   */
  size() {
    return this.heap.length;
  }

  /**
   * 空かどうかを確認
   * @returns {boolean}
   */
  isEmpty() {
    return this.heap.length === 0;
  }

  /**
   * すべての要素をクリア
   */
  clear() {
    this.heap = [];
  }

  /**
   * すべての要素を取得（配列として）
   * @returns {Array} すべての要素
   */
  toArray() {
    return [...this.heap];
  }

  /**
   * 要素を上に移動
   * @param {number} index - インデックス
   * @private
   */
  bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.compareFn(this.heap[index], this.heap[parentIndex]) >= 0) {
        break;
      }
      [this.heap[index], this.heap[parentIndex]] =
        [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }

  /**
   * 要素を下に移動
   * @param {number} index - インデックス
   * @private
   */
  bubbleDown(index) {
    while (true) {
      let minIndex = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;

      if (leftChild < this.heap.length &&
          this.compareFn(this.heap[leftChild], this.heap[minIndex]) < 0) {
        minIndex = leftChild;
      }

      if (rightChild < this.heap.length &&
          this.compareFn(this.heap[rightChild], this.heap[minIndex]) < 0) {
        minIndex = rightChild;
      }

      if (minIndex === index) break;

      [this.heap[index], this.heap[minIndex]] =
        [this.heap[minIndex], this.heap[index]];
      index = minIndex;
    }
  }

  /**
   * ヒープ構造を再構築
   * （要素を外部から変更した場合に使用）
   */
  rebuild() {
    for (let i = Math.floor(this.heap.length / 2) - 1; i >= 0; i--) {
      this.bubbleDown(i);
    }
  }
}
