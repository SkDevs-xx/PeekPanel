import { EventEmitter } from '../utils/eventEmitter.js';
import { getTabTitle } from '../utils/urlHelper.js';
import { PriorityQueue } from '../utils/priorityQueue.js';

/**
 * タブ管理クラス
 * タブのライフサイクル（作成、削除、切り替えなど）を管理
 */
export class TabManager extends EventEmitter {
  constructor(storage, history) {
    super();
    this.tabs = [];
    this.currentTabId = null;
    this.tabCounter = 0;
    this.storage = storage;
    this.history = history;
  }

  /**
   * 初期化 - 保存されたタブを復元
   */
  async init() {
    const { savedTabs, currentTabIndex } = await this.storage.loadTabs();

    if (savedTabs && savedTabs.length > 0) {
      // 保存されたタブを復元
      savedTabs.forEach((tabData) => {
        const tabId = this.createTab(tabData.url, false, false);
        const tab = this.tabs.find(t => t.id === tabId);
        if (tab) {
          tab.title = tabData.title || getTabTitle(tabData.url);
          tab.history = tabData.history || [tabData.url];
          tab.historyIndex = tabData.historyIndex || 0;
          tab.isPinned = tabData.isPinned || false;
          tab.isMuted = tabData.isMuted || false;
          tab.groupId = tabData.groupId || null;
        }
      });

      // 現在のタブを設定
      const normalTabs = this.tabs.filter(t => !t.isInternal);
      if (currentTabIndex >= 0 && currentTabIndex < normalTabs.length) {
        this.switchTab(normalTabs[currentTabIndex].id);
      } else if (normalTabs.length > 0) {
        this.switchTab(normalTabs[0].id);
      }
    }

    // タブカウンターを設定
    if (this.tabs.length > 0) {
      const maxId = Math.max(...this.tabs.map(t => parseInt(t.id.replace('tab-', ''))));
      this.tabCounter = maxId + 1;
    }
  }

  /**
   * タブを作成
   * @param {string} url - URL
   * @param {boolean} isActive - 作成後にアクティブにするか
   * @param {boolean} isInternal - 内部ページフラグ
   * @returns {string} タブID
   */
  createTab(url, isActive = false, isInternal = false) {
    const tabId = `tab-${this.tabCounter++}`;

    const tabData = {
      id: tabId,
      url: url || 'about:blank',
      title: url ? getTabTitle(url) : '新しいタブ',
      history: [],
      historyIndex: -1,
      isInternal: isInternal,
      lastActiveTime: Date.now(),
      isLoaded: false,
      faviconUrl: null,
      isSleeping: false,
      needsLoad: !isActive && url && url !== 'about:blank',
      hasError: false,
      errorType: null,
      errorMessage: null,
      lastErrorTime: null,
      groupId: null,
      isPinned: false,
      isMuted: false
    };

    this.tabs.push(tabData);

    // イベント発火（UIがリスニング）
    this.emit('tabCreated', {
      tabId,
      tabData,
      isActive,
      isInternal
    });

    if (isActive) {
      this.switchTab(tabId);
    }

    this.save();

    return tabId;
  }

  /**
   * タブを閉じる
   * @param {string} tabId - タブID
   */
  closeTab(tabId) {
    const tabIndex = this.tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    const tab = this.tabs[tabIndex];

    // 通常のタブが1つしかない場合は閉じない（内部タブは常に閉じられる）
    const normalTabs = this.tabs.filter(t => !t.isInternal);
    if (!tab.isInternal && normalTabs.length <= 1) {
      console.log('[TabManager] Cannot close the last normal tab');
      return;
    }

    // 履歴に追加（内部ページとabout:blankは除外）
    if (tab.url && tab.url !== 'about:blank' && !tab.isInternal) {
      this.history.addToHistory({
        url: tab.url,
        title: tab.title,
        favicon: tab.faviconUrl,
        history: tab.history,
        historyIndex: tab.historyIndex,
        isInternal: tab.isInternal
      });
    }

    const oldGroupId = tab.groupId;

    // タブを削除
    this.tabs.splice(tabIndex, 1);

    // イベント発火
    this.emit('tabClosed', {
      tabId,
      groupId: oldGroupId
    });

    // 現在のタブが閉じられた場合、別のタブに切り替え
    if (this.currentTabId === tabId) {
      const newIndex = Math.min(tabIndex, this.tabs.length - 1);
      if (newIndex >= 0) {
        this.switchTab(this.tabs[newIndex].id);
      }
    }

    this.save();
  }

  /**
   * タブを切り替え
   * @param {string} tabId - タブID
   */
  switchTab(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    this.currentTabId = tabId;
    tab.lastActiveTime = Date.now();

    // スリープタブを復帰
    if (tab.isSleeping) {
      this.wakeTab(tabId);
    }

    // イベント発火
    this.emit('tabSwitched', {
      tabId,
      tabData: tab
    });

    this.save();
  }

  /**
   * タブを複製
   * @param {string} tabId - タブID
   * @returns {string} 新しいタブID
   */
  duplicateTab(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return null;

    const newTabId = this.createTab(tab.url, true, tab.isInternal);
    const newTab = this.tabs.find(t => t.id === newTabId);

    if (newTab) {
      newTab.title = tab.title;
      newTab.faviconUrl = tab.faviconUrl;
      newTab.groupId = tab.groupId;
      newTab.history = [...tab.history];
      newTab.historyIndex = tab.historyIndex;

      this.emit('tabUpdated', newTab);
      this.save();
    }

    return newTabId;
  }

  /**
   * 指定したタブの右側のタブをすべて閉じる
   * @param {string} tabId - 基準となるタブID
   */
  closeTabsToRight(tabId) {
    const index = this.tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    const tabsToClose = this.tabs.slice(index + 1).filter(t => !t.isInternal);
    tabsToClose.forEach(tab => this.closeTab(tab.id));
  }

  /**
   * すべてのタブを閉じる（ピン留めとinternalは除く）
   */
  closeAllTabs() {
    const tabsToClose = this.tabs.filter(t => !t.isInternal && !t.isPinned);
    tabsToClose.forEach(tab => this.closeTab(tab.id));
  }

  /**
   * 指定したタブ以外をすべて閉じる
   * @param {string} tabId - 残すタブID
   */
  closeOtherTabs(tabId) {
    const tabsToClose = this.tabs.filter(t => t.id !== tabId && !t.isInternal && !t.isPinned);
    tabsToClose.forEach(tab => this.closeTab(tab.id));
  }

  /**
   * タブのピン留めを切り替え
   * @param {string} tabId - タブID
   */
  togglePinTab(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    tab.isPinned = !tab.isPinned;
    this.emit('tabPinned', { id: tabId, isPinned: tab.isPinned });
    this.save();
  }

  /**
   * タブのミュートを切り替え
   * @param {string} tabId - タブID
   */
  toggleMuteTab(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    tab.isMuted = !tab.isMuted;
    this.emit('tabMuted', { id: tabId, isMuted: tab.isMuted });
    this.save();
  }

  /**
   * タブをスリープ状態にする
   * @param {string} tabId - タブID
   */
  sleepTab(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab || tab.isInternal || tab.isSleeping) return;

    tab.isSleeping = true;
    this.emit('tabSlept', { tabId });
    this.save();
  }

  /**
   * タブをスリープから復帰
   * @param {string} tabId - タブID
   */
  wakeTab(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab || tab.isInternal || !tab.isSleeping) return;

    tab.isSleeping = false;
    tab.lastActiveTime = Date.now();

    this.emit('tabWoke', { tabId, tabData: tab });
    this.save();
  }

  /**
   * すべてのタブをチェックして自動スリープ
   * 優先度キューを使用して最適化（古いタブから順にチェック）
   */
  async checkAndSleepTabs() {
    const settings = await this.storage.loadSettings(
      ['autoSleepEnabled', 'autoSleepMinutes', 'noSleepDomains'],
      {
        autoSleepEnabled: true,
        autoSleepMinutes: 5,
        noSleepDomains: ['youtube.com', 'youtu.be', 'music.youtube.com', 'twitch.tv']
      }
    );

    if (!settings.autoSleepEnabled) return;

    const now = Date.now();
    const threshold = settings.autoSleepMinutes * 60 * 1000;

    // 優先度キュー: lastActiveTimeが古い順（Min Heap）
    const queue = new PriorityQueue((a, b) => a.lastActiveTime - b.lastActiveTime);

    // スリープ対象候補をキューに追加
    this.tabs.forEach(tab => {
      if (tab.id === this.currentTabId) return;
      if (tab.isSleeping) return;
      if (tab.isPinned) return;
      if (tab.isInternal) return;

      try {
        const domain = new URL(tab.url).hostname;
        if (settings.noSleepDomains.some(d => domain.includes(d))) return;
      } catch {
        return;
      }

      queue.push(tab);
    });

    // 古いタブから順にチェック（O(k log n) where k = スリープ対象数）
    while (!queue.isEmpty()) {
      const oldestTab = queue.peek();

      if (now - oldestTab.lastActiveTime > threshold) {
        queue.pop();
        this.sleepTab(oldestTab.id);
      } else {
        // これ以降のタブはまだスリープ不要
        break;
      }
    }
  }

  /**
   * タブのタイトルを更新
   * @param {string} tabId - タブID
   * @param {string} title - 新しいタイトル
   */
  updateTabTitle(tabId, title) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    tab.title = title;
    this.emit('tabTitleUpdated', { tabId, title });
    this.save();
  }

  /**
   * タブのファビコンURLを更新
   * @param {string} tabId - タブID
   * @param {string} faviconUrl - ファビコンURL
   */
  updateTabFavicon(tabId, faviconUrl) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    tab.faviconUrl = faviconUrl;
    this.emit('tabFaviconUpdated', { tabId, faviconUrl });
  }

  /**
   * タブのURLを更新（ナビゲーション時）
   * @param {string} tabId - タブID
   * @param {string} url - 新しいURL
   */
  updateTabUrl(tabId, url) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    // 履歴管理
    if (tab.historyIndex < tab.history.length - 1) {
      tab.history = tab.history.slice(0, tab.historyIndex + 1);
    }
    tab.history.push(url);
    tab.historyIndex = tab.history.length - 1;
    tab.url = url;

    this.emit('tabNavigated', { tabId, url });
    this.save();
  }

  /**
   * 戻る
   * @param {string} tabId - タブID
   * @returns {boolean} 成功したか
   */
  goBack(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab || tab.historyIndex <= 0) return false;

    tab.historyIndex--;
    tab.url = tab.history[tab.historyIndex];

    this.emit('tabNavigated', { tabId, url: tab.url, direction: 'back' });
    this.save();
    return true;
  }

  /**
   * 進む
   * @param {string} tabId - タブID
   * @returns {boolean} 成功したか
   */
  goForward(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab || tab.historyIndex >= tab.history.length - 1) return false;

    tab.historyIndex++;
    tab.url = tab.history[tab.historyIndex];

    this.emit('tabNavigated', { tabId, url: tab.url, direction: 'forward' });
    this.save();
    return true;
  }

  /**
   * 戻る/進むが可能かチェック
   * @param {string} tabId - タブID
   * @returns {{canGoBack: boolean, canGoForward: boolean}}
   */
  getNavigationState(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return { canGoBack: false, canGoForward: false };

    return {
      canGoBack: tab.historyIndex > 0,
      canGoForward: tab.historyIndex < tab.history.length - 1
    };
  }

  /**
   * タブをグループに追加
   * @param {string} tabId - タブID
   * @param {string} groupId - グループID
   */
  addToGroup(tabId, groupId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    tab.groupId = groupId;
    this.emit('tabAddedToGroup', { tabId, groupId });
    this.save();
  }

  /**
   * タブをグループから削除
   * @param {string} tabId - タブID
   */
  removeFromGroup(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    const oldGroupId = tab.groupId;
    tab.groupId = null;

    this.emit('tabRemovedFromGroup', { tabId, groupId: oldGroupId });
    this.save();
  }

  /**
   * タブデータを取得
   * @param {string} tabId - タブID
   * @returns {Object|null}
   */
  getTab(tabId) {
    return this.tabs.find(t => t.id === tabId) || null;
  }

  /**
   * すべてのタブを取得
   * @returns {Array}
   */
  getAllTabs() {
    return this.tabs;
  }

  /**
   * 現在アクティブなタブを取得
   * @returns {Object|null}
   */
  getCurrentTab() {
    return this.tabs.find(t => t.id === this.currentTabId) || null;
  }

  /**
   * 指定したグループIDのタブを取得
   * @param {string} groupId - グループID
   * @returns {Array}
   */
  getTabsByGroupId(groupId) {
    return this.tabs.filter(t => t.groupId === groupId);
  }

  /**
   * グループに属していないタブを取得
   * @returns {Array}
   */
  getUngroupedTabs() {
    return this.tabs.filter(t => !t.groupId && !t.isInternal);
  }

  /**
   * ピン留めされたタブを取得
   * @returns {Array}
   */
  getPinnedTabs() {
    return this.tabs.filter(t => t.isPinned);
  }

  /**
   * タブ情報をストレージに保存
   */
  save() {
    this.storage.saveTabs(this.tabs, this.currentTabId);
  }

  /**
   * タブのエラー状態を設定
   * @param {string} tabId - タブID
   * @param {string} errorType - エラータイプ
   * @param {string} errorMessage - エラーメッセージ
   */
  setTabError(tabId, errorType, errorMessage) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    tab.hasError = true;
    tab.errorType = errorType;
    tab.errorMessage = errorMessage;
    tab.lastErrorTime = Date.now();

    this.emit('tabError', { tabId, errorType, errorMessage });
  }

  /**
   * タブのエラー状態をクリア
   * @param {string} tabId - タブID
   */
  clearTabError(tabId) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    tab.hasError = false;
    tab.errorType = null;
    tab.errorMessage = null;
    tab.lastErrorTime = null;

    this.emit('tabErrorCleared', { tabId });
  }

  /**
   * タブの読み込み状態を設定
   * @param {string} tabId - タブID
   * @param {boolean} isLoaded - 読み込み完了か
   */
  setTabLoaded(tabId, isLoaded) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    tab.isLoaded = isLoaded;
    tab.needsLoad = !isLoaded;

    this.emit('tabLoadStateChanged', { tabId, isLoaded });
  }
}
