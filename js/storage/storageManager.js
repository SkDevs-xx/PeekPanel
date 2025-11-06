// ストレージ管理クラス
export class StorageManager {
  constructor() {
    this.storage = chrome.storage.local;
    this.syncStorage = chrome.storage.sync;
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

    await this.storage.set({
      savedTabs: tabsData,
      currentTabIndex: currentTabIndex
    });
  }

  /**
   * タブ情報を読み込み
   * @returns {Promise<{savedTabs: Array, currentTabIndex: number}>}
   */
  async loadTabs() {
    const result = await this.storage.get(['savedTabs', 'currentTabIndex']);
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
    await this.storage.set({ tabGroups });
  }

  /**
   * タブグループ情報を読み込み
   * @returns {Promise<Array>}
   */
  async loadTabGroups() {
    const { tabGroups } = await this.storage.get('tabGroups');
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
    await this.storage.set({ closedTabsHistory: limitedHistory });
  }

  /**
   * 閉じたタブの履歴を読み込み
   * @returns {Promise<Array>}
   */
  async loadClosedTabsHistory() {
    const { closedTabsHistory } = await this.storage.get('closedTabsHistory');
    return closedTabsHistory || [];
  }

  /**
   * AI選択情報を保存
   * @param {Object} aiSelection - AI選択情報
   */
  async saveAISelection(aiSelection) {
    await this.syncStorage.set({ aiSelection });
  }

  /**
   * AI選択情報を読み込み
   * @returns {Promise<Object>}
   */
  async loadAISelection() {
    const { aiSelection } = await this.syncStorage.get('aiSelection');
    return aiSelection || {};
  }

  /**
   * 設定を保存
   * @param {Object} settings - 設定オブジェクト
   */
  async saveSettings(settings) {
    await this.syncStorage.set(settings);
  }

  /**
   * 設定を読み込み
   * @param {Array|string} keys - 取得するキー
   * @param {Object} defaults - デフォルト値
   * @returns {Promise<Object>}
   */
  async loadSettings(keys, defaults = {}) {
    const result = await this.syncStorage.get(keys);
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

    await this.storage.set({
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
    const result = await this.storage.get(['savedTabs', 'currentTabIndex', 'tabGroups']);
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
