import { UI_CONSTANTS } from '../config/constants.js';

/**
 * タブ履歴管理クラス
 * 閉じたタブの履歴を管理し、復元機能を提供
 */
export class TabHistory {
  constructor(storage) {
    this.closedTabsHistory = [];
    this.storage = storage;
    this.maxHistorySize = UI_CONSTANTS.MAX_HISTORY_SIZE || 50;
  }

  /**
   * 初期化 - ストレージから履歴を読み込み
   */
  async init() {
    this.closedTabsHistory = await this.storage.loadClosedTabsHistory();
  }

  /**
   * タブを履歴に追加
   * @param {Object} tabData - タブデータ
   * @param {string} tabData.url - URL
   * @param {string} tabData.title - タイトル
   * @param {string} tabData.favicon - ファビコンURL
   * @param {Array} tabData.history - 履歴配列
   * @param {number} tabData.historyIndex - 履歴インデックス
   */
  addToHistory(tabData) {
    // 内部ページとabout:blankは除外
    if (!tabData.url || tabData.url === 'about:blank' || tabData.isInternal) {
      return;
    }

    // 同じURLが既に存在する場合は削除（重複防止）
    const existingIndex = this.closedTabsHistory.findIndex(item => item.url === tabData.url);
    if (existingIndex !== -1) {
      this.closedTabsHistory.splice(existingIndex, 1);
    }

    // 先頭に追加
    this.closedTabsHistory.unshift({
      url: tabData.url,
      title: tabData.title,
      favicon: tabData.favicon,
      timestamp: Date.now(),
      history: [...(tabData.history || [tabData.url])],
      historyIndex: tabData.historyIndex || 0
    });

    // 最大サイズを超えた場合は古いものを削除
    if (this.closedTabsHistory.length > this.maxHistorySize) {
      this.closedTabsHistory = this.closedTabsHistory.slice(0, this.maxHistorySize);
    }

    // ストレージに保存
    this.storage.saveClosedTabsHistory(this.closedTabsHistory);
  }

  /**
   * 履歴から指定されたインデックスのタブデータを取得
   * @param {number} index - インデックス
   * @returns {Object|null} タブデータ
   */
  getTabData(index) {
    if (index < 0 || index >= this.closedTabsHistory.length) {
      return null;
    }
    return this.closedTabsHistory[index];
  }

  /**
   * 履歴から指定されたインデックスのタブを削除
   * @param {number} index - インデックス
   */
  removeFromHistory(index) {
    if (index >= 0 && index < this.closedTabsHistory.length) {
      this.closedTabsHistory.splice(index, 1);
      this.storage.saveClosedTabsHistory(this.closedTabsHistory);
    }
  }

  /**
   * すべての履歴を取得
   * @returns {Array} 履歴配列
   */
  getHistory() {
    return this.closedTabsHistory;
  }

  /**
   * 履歴をクリア
   */
  clearHistory() {
    this.closedTabsHistory = [];
    this.storage.saveClosedTabsHistory([]);
  }

  /**
   * 履歴のサイズを取得
   * @returns {number}
   */
  getHistorySize() {
    return this.closedTabsHistory.length;
  }

  /**
   * 履歴が空かチェック
   * @returns {boolean}
   */
  isEmpty() {
    return this.closedTabsHistory.length === 0;
  }

  /**
   * 指定されたURLが履歴に存在するかチェック
   * @param {string} url - URL
   * @returns {boolean}
   */
  hasUrl(url) {
    return this.closedTabsHistory.some(item => item.url === url);
  }

  /**
   * 古い履歴を削除（指定された日数より古いもの）
   * @param {number} days - 日数
   */
  removeOldHistory(days) {
    const threshold = Date.now() - (days * 24 * 60 * 60 * 1000);
    this.closedTabsHistory = this.closedTabsHistory.filter(item => item.timestamp > threshold);
    this.storage.saveClosedTabsHistory(this.closedTabsHistory);
  }
}
