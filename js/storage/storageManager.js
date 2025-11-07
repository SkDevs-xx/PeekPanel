/**
 * ストレージ管理クラス
 * chrome.storage.localへの保存と、フォールバック機構を提供
 */
export class StorageManager {
  constructor() {
    this.storage = chrome.storage.local;
    this.syncStorage = chrome.storage.sync;
    this.useFallback = false; // localStorageフォールバック使用フラグ
  }

  /**
   * エラーハンドリング付きでストレージに保存
   * @param {Object} data - 保存するデータ
   * @param {boolean} useSync - chrome.storage.syncを使用するか
   * @returns {Promise<void>}
   */
  async safeSet(data, useSync = false) {
    const storage = useSync ? this.syncStorage : this.storage;

    try {
      await storage.set(data);
      this.useFallback = false; // 成功したらフォールバックフラグを解除
    } catch (error) {
      console.error('[StorageManager] Storage set failed, using localStorage fallback:', error);

      // エラーマネージャーで通知（利用可能な場合）
      if (typeof ErrorManager !== 'undefined') {
        try {
          const { ErrorManager: EM } = await import('../ui/errorManager.js');
          EM.getInstance()?.handleError(error, {
            operation: 'storage_set',
            data: Object.keys(data)
          });
        } catch (e) {
          // ErrorManagerが利用できない場合は無視
        }
      }

      // localStorageにフォールバック
      this.useFallback = true;
      try {
        Object.entries(data).forEach(([key, value]) => {
          localStorage.setItem(`peekpanel_${key}`, JSON.stringify(value));
        });
      } catch (fallbackError) {
        console.error('[StorageManager] localStorage fallback also failed:', fallbackError);
        throw new Error('ストレージへの保存に失敗しました');
      }
    }
  }

  /**
   * エラーハンドリング付きでストレージから読み込み
   * @param {string|Array} keys - 読み込むキー
   * @param {boolean} useSync - chrome.storage.syncを使用するか
   * @returns {Promise<Object>}
   */
  async safeGet(keys, useSync = false) {
    const storage = useSync ? this.syncStorage : this.storage;

    try {
      const result = await storage.get(keys);
      return result;
    } catch (error) {
      console.error('[StorageManager] Storage get failed, using localStorage fallback:', error);

      // localStorageからフォールバック
      const result = {};
      const keyArray = Array.isArray(keys) ? keys : [keys];

      keyArray.forEach(key => {
        try {
          const value = localStorage.getItem(`peekpanel_${key}`);
          if (value !== null) {
            result[key] = JSON.parse(value);
          }
        } catch (e) {
          console.error(`[StorageManager] Failed to read ${key} from localStorage:`, e);
        }
      });

      return result;
    }
  }

  /**
   * タブ情報を保存
   * @param {Array} tabs - タブ配列
   * @param {string} currentTabId - 現在アクティブなタブID
   */
  async saveTabs(tabs, currentTabId) {
    const tabsData = tabs
      .filter(tab => !tab.isInternal) // 内部ページは保存しない
      .map(tab => ({
        url: tab.url,
        title: tab.title,
        history: tab.history,
        historyIndex: tab.historyIndex,
        isPinned: tab.isPinned || false,
        isMuted: tab.isMuted || false,
        groupId: tab.groupId || null
      }));

    const currentTabIndex = tabs.findIndex(t => t.id === currentTabId && !t.isInternal);

    await this.safeSet({
      savedTabs: tabsData,
      currentTabIndex: currentTabIndex
    });
  }

  /**
   * タブ情報を読み込み
   * @returns {Promise<{savedTabs: Array, currentTabIndex: number}>}
   */
  async loadTabs() {
    const result = await this.safeGet(['savedTabs', 'currentTabIndex']);
    return {
      savedTabs: result.savedTabs || [],
      currentTabIndex: result.currentTabIndex || 0
    };
  }

  /**
   * タブグループ情報を保存
   * @param {Array} tabGroups - タブグループ配列
   */
  async saveTabGroups(tabGroups) {
    await this.safeSet({ tabGroups });
  }

  /**
   * タブグループ情報を読み込み
   * @returns {Promise<Array>}
   */
  async loadTabGroups() {
    const { tabGroups } = await this.safeGet('tabGroups');
    return (tabGroups || []).map(g => ({
      ...g,
      isCollapsed: g.isCollapsed || false
    }));
  }

  /**
   * 閉じたタブの履歴を保存
   * @param {Array} history - 閉じたタブの履歴配列
   */
  async saveClosedTabsHistory(history) {
    // 最大50件まで保存
    const limitedHistory = history.slice(0, 50);
    await this.safeSet({ closedTabsHistory: limitedHistory });
  }

  /**
   * 閉じたタブの履歴を読み込み
   * @returns {Promise<Array>}
   */
  async loadClosedTabsHistory() {
    const { closedTabsHistory } = await this.safeGet('closedTabsHistory');
    return closedTabsHistory || [];
  }

  /**
   * AI選択情報を保存
   * @param {Object} aiSelection - AI選択情報
   */
  async saveAISelection(aiSelection) {
    await this.safeSet({ aiSelection }, true);
  }

  /**
   * AI選択情報を読み込み
   * @returns {Promise<Object>}
   */
  async loadAISelection() {
    const { aiSelection } = await this.safeGet('aiSelection', true);
    return aiSelection || {};
  }

  /**
   * 設定を保存
   * @param {Object} settings - 設定オブジェクト
   */
  async saveSettings(settings) {
    await this.safeSet(settings, true);
  }

  /**
   * 設定を読み込み
   * @param {Array|string} keys - 取得するキー
   * @param {Object} defaults - デフォルト値
   * @returns {Promise<Object>}
   */
  async loadSettings(keys, defaults = {}) {
    const result = await this.safeGet(keys, true);
    return { ...defaults, ...result };
  }

  /**
   * タブとグループをまとめて保存
   * @param {Array} tabs - タブ配列
   * @param {string} currentTabId - 現在アクティブなタブID
   * @param {Array} tabGroups - タブグループ配列
   */
  async saveAll(tabs, currentTabId, tabGroups) {
    const tabsData = tabs
      .filter(tab => !tab.isInternal)
      .map(tab => ({
        url: tab.url,
        title: tab.title,
        history: tab.history,
        historyIndex: tab.historyIndex,
        isPinned: tab.isPinned || false,
        isMuted: tab.isMuted || false,
        groupId: tab.groupId || null
      }));

    const currentTabIndex = tabs.findIndex(t => t.id === currentTabId && !t.isInternal);

    await this.safeSet({
      savedTabs: tabsData,
      currentTabIndex: currentTabIndex,
      tabGroups: tabGroups
    });
  }

  /**
   * すべてのデータを読み込み
   * @returns {Promise<{savedTabs: Array, currentTabIndex: number, tabGroups: Array}>}
   */
  async loadAll() {
    const result = await this.safeGet(['savedTabs', 'currentTabIndex', 'tabGroups']);
    return {
      savedTabs: result.savedTabs || [],
      currentTabIndex: result.currentTabIndex || 0,
      tabGroups: (result.tabGroups || []).map(g => ({
        ...g,
        isCollapsed: g.isCollapsed || false
      }))
    };
  }
}
