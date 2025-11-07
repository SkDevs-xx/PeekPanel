/**
 * シンプルなイベントエミッタークラス
 * TabManager、TabGroupManagerなどがイベント駆動で動作するために使用
 */
export class EventEmitter {
  constructor() {
    this.events = {};
  }

  /**
   * イベントリスナーを登録
   * @param {string} event - イベント名
   * @param {Function} listener - リスナー関数
   */
  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  /**
   * イベントを発火
   * @param {string} event - イベント名
   * @param {*} data - イベントデータ
   */
  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for '${event}':`, error);
        }
      });
    }
  }

  /**
   * イベントリスナーを削除
   * @param {string} event - イベント名
   * @param {Function} listener - リスナー関数
   */
  off(event, listener) {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter(l => l !== listener);
    }
  }

  /**
   * 一度だけ実行されるイベントリスナーを登録
   * @param {string} event - イベント名
   * @param {Function} listener - リスナー関数
   */
  once(event, listener) {
    const onceListener = (data) => {
      listener(data);
      this.off(event, onceListener);
    };
    this.on(event, onceListener);
  }

  /**
   * すべてのイベントリスナーを削除
   * @param {string} event - イベント名（省略時は全イベント）
   */
  removeAllListeners(event) {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
  }

  /**
   * EventEmitterインスタンスを破棄し、すべてのリスナーを削除
   * メモリリーク対策: コンポーネント破棄時に必ず呼び出すこと
   */
  destroy() {
    this.removeAllListeners();
  }

  /**
   * 登録されているリスナー数を取得（デバッグ用）
   * @param {string} event - イベント名（省略時は全イベント）
   * @returns {number} リスナー数
   */
  listenerCount(event) {
    if (event) {
      return this.events[event] ? this.events[event].length : 0;
    } else {
      return Object.values(this.events).reduce((sum, listeners) => sum + listeners.length, 0);
    }
  }
}
