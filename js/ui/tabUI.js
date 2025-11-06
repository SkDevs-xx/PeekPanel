import { DEFAULT_FAVICON } from '../config/constants.js';
import { getRealFavicon } from '../utils/favicon.js';
import { getTabTitle } from '../utils/urlHelper.js';

/**
 * タブUI管理クラス
 * タブ要素のレンダリングとイベントハンドリングを担当
 */
export class TabUI {
  constructor(tabManager, eventHandlers = {}) {
    this.tabManager = tabManager;
    this.eventHandlers = eventHandlers;
    this.tabsContainer = document.getElementById('tabs');

    // TabManagerのイベントをリスニング
    this.setupEventListeners();
  }

  /**
   * 初期化 - 既存のタブをすべてレンダリング
   */
  init() {
    // 既存のタブ要素を削除（二重レンダリング防止）
    this.tabsContainer.querySelectorAll('.tab').forEach(el => el.remove());

    // 既存のタブをすべてレンダリング
    this.tabManager.getAllTabs().forEach(tab => {
      if (!tab.isInternal) {
        this.renderTab(tab);
      }
    });
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    this.tabManager.on('tabCreated', ({ tabData, isInternal }) => {
      if (!isInternal) {
        this.renderTab(tabData);
      }
    });

    this.tabManager.on('tabClosed', ({ tabId }) => {
      this.removeTabElement(tabId);
    });

    this.tabManager.on('tabSwitched', ({ tabId }) => {
      this.setActiveTab(tabId);
    });

    this.tabManager.on('tabUpdated', (tabData) => {
      this.updateTabElement(tabData);
    });

    this.tabManager.on('tabPinned', (tabData) => {
      this.updatePinIndicator(tabData.id, tabData.isPinned);
    });

    this.tabManager.on('tabMuted', (tabData) => {
      this.updateMuteIndicator(tabData.id, tabData.isMuted);
    });

    this.tabManager.on('tabError', ({ tabId }) => {
      this.updateTabFaviconToError(tabId);
    });

    this.tabManager.on('tabSlept', ({ tabId }) => {
      this.updateSleepState(tabId, true);
    });

    this.tabManager.on('tabWoken', ({ tabId }) => {
      this.updateSleepState(tabId, false);
    });
  }

  /**
   * タブ要素を作成してDOMに追加
   * @param {Object} tabData - タブデータ
   */
  renderTab(tabData) {
    const tabElement = document.createElement('button');
    tabElement.className = 'tab';
    tabElement.draggable = true;
    tabElement.dataset.tabId = tabData.id;

    // ファビコン表示
    const img = document.createElement('img');
    img.className = 'tab-favicon';
    img.src = tabData.url ? getRealFavicon(tabData.url) : DEFAULT_FAVICON;
    this.setupFaviconFallback(img, tabData.url);
    tabElement.appendChild(img);

    // タブタイトル（グループ内でのみ表示）
    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-title';
    titleSpan.textContent = tabData.title || getTabTitle(tabData.url);
    tabElement.appendChild(titleSpan);

    // ピン留めインジケーター
    const pinIndicator = document.createElement('span');
    pinIndicator.className = 'pin-indicator';
    pinIndicator.textContent = '📌';
    pinIndicator.style.display = tabData.isPinned ? '' : 'none';
    tabElement.appendChild(pinIndicator);

    // ミュートインジケーター
    const muteIndicator = document.createElement('span');
    muteIndicator.className = 'mute-indicator';
    muteIndicator.textContent = '🔇';
    muteIndicator.style.display = tabData.isMuted ? '' : 'none';
    tabElement.appendChild(muteIndicator);

    // クリックイベント
    tabElement.onclick = () => {
      if (this.eventHandlers.onTabClick) {
        this.eventHandlers.onTabClick(tabData.id);
      }
    };

    // 中クリック（ホイールクリック）でタブを閉じる
    tabElement.onmousedown = (e) => {
      if (e.button === 1) { // 中クリック
        e.preventDefault();
        if (this.eventHandlers.onTabMiddleClick) {
          this.eventHandlers.onTabMiddleClick(tabData.id);
        }
      }
    };

    // ドラッグイベント
    if (this.eventHandlers.onSetupDragDrop) {
      this.eventHandlers.onSetupDragDrop(tabElement);
    }

    // 右クリックメニュー
    tabElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.eventHandlers.onTabContextMenu) {
        this.eventHandlers.onTabContextMenu(tabData.id, e.clientX, e.clientY);
      }
    });

    // タブを追加
    this.tabsContainer.appendChild(tabElement);

    return tabElement;
  }

  /**
   * ファビコンのフォールバック設定
   * @param {HTMLImageElement} img - 画像要素
   * @param {string} url - URL
   */
  setupFaviconFallback(img, url) {
    img.onerror = () => {
      try {
        // フォールバック：Google Favicon API
        const domain = new URL(url).hostname;
        img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

        img.onerror = () => {
          // 最終フォールバック
          img.src = DEFAULT_FAVICON;
        };
      } catch {
        // URL解析に失敗した場合
        img.src = DEFAULT_FAVICON;
      }
    };
  }

  /**
   * タブ要素を更新
   * @param {Object} tabData - タブデータ
   */
  updateTabElement(tabData) {
    const tabElement = this.getTabElement(tabData.id);
    if (!tabElement) return;

    // タイトル更新
    const titleSpan = tabElement.querySelector('.tab-title');
    if (titleSpan && tabData.title) {
      titleSpan.textContent = tabData.title;
    }

    // ファビコン更新
    if (tabData.faviconUrl) {
      const img = tabElement.querySelector('.tab-favicon');
      if (img) {
        img.src = tabData.faviconUrl;
      }
    }

    // ピン留め状態更新
    if (tabData.isPinned !== undefined) {
      this.updatePinIndicator(tabData.id, tabData.isPinned);
    }

    // ミュート状態更新
    if (tabData.isMuted !== undefined) {
      this.updateMuteIndicator(tabData.id, tabData.isMuted);
    }
  }

  /**
   * タブ要素を削除
   * @param {string} tabId - タブID
   */
  removeTabElement(tabId) {
    const tabElement = this.getTabElement(tabId);
    if (tabElement && tabElement.parentNode) {
      tabElement.parentNode.removeChild(tabElement);
    }
  }

  /**
   * アクティブタブを設定
   * @param {string} tabId - タブID
   */
  setActiveTab(tabId) {
    // すべてのタブからactiveクラスを削除
    this.tabsContainer.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });

    // 指定されたタブにactiveクラスを追加
    const tabElement = this.getTabElement(tabId);
    if (tabElement) {
      tabElement.classList.add('active');
    }
  }

  /**
   * タブタイトルを更新
   * @param {string} tabId - タブID
   * @param {string} title - 新しいタイトル
   */
  updateTabTitle(tabId, title) {
    const tabElement = this.getTabElement(tabId);
    if (!tabElement) return;

    const titleSpan = tabElement.querySelector('.tab-title');
    if (titleSpan) {
      titleSpan.textContent = title;
    }
  }

  /**
   * タブファビコンを更新
   * @param {string} tabId - タブID
   * @param {string} url - URL
   */
  updateTabFavicon(tabId, url) {
    const tabElement = this.getTabElement(tabId);
    if (!tabElement) return;

    const tab = this.tabManager.getTab(tabId);

    // スリープ中のタブはファビコンを更新しない
    if (tab && tab.isSleeping && tab.faviconUrl) {
      return;
    }

    const img = tabElement.querySelector('.tab-favicon');
    if (img && url) {
      const favicon = getRealFavicon(url);
      img.src = favicon;
      this.setupFaviconFallback(img, url);
    }
  }

  /**
   * タブファビコンをエラー表示に変更
   * @param {string} tabId - タブID
   */
  updateTabFaviconToError(tabId) {
    const tabElement = this.getTabElement(tabId);
    if (!tabElement) return;

    const img = tabElement.querySelector('.tab-favicon');
    if (img) {
      // エラーアイコンに変更
      img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="20" font-size="20">⚠️</text></svg>';

      // タブにエラークラスを追加
      tabElement.classList.add('tab-error');
    }
  }

  /**
   * ピン留めインジケーターを更新
   * @param {string} tabId - タブID
   * @param {boolean} isPinned - ピン留め状態
   */
  updatePinIndicator(tabId, isPinned) {
    const tabElement = this.getTabElement(tabId);
    if (!tabElement) return;

    const pinIndicator = tabElement.querySelector('.pin-indicator');
    if (pinIndicator) {
      pinIndicator.style.display = isPinned ? '' : 'none';
    }
  }

  /**
   * ミュートインジケーターを更新
   * @param {string} tabId - タブID
   * @param {boolean} isMuted - ミュート状態
   */
  updateMuteIndicator(tabId, isMuted) {
    const tabElement = this.getTabElement(tabId);
    if (!tabElement) return;

    const muteIndicator = tabElement.querySelector('.mute-indicator');
    if (muteIndicator) {
      muteIndicator.style.display = isMuted ? '' : 'none';
    }
  }

  /**
   * スリープ状態を更新
   * @param {string} tabId - タブID
   * @param {boolean} isSleeping - スリープ状態
   */
  updateSleepState(tabId, isSleeping) {
    const tabElement = this.getTabElement(tabId);
    if (!tabElement) return;

    if (isSleeping) {
      tabElement.classList.add('sleeping');
    } else {
      tabElement.classList.remove('sleeping');
    }
  }

  /**
   * タブ要素を取得
   * @param {string} tabId - タブID
   * @returns {HTMLElement|null}
   */
  getTabElement(tabId) {
    return this.tabsContainer.querySelector(`.tab[data-tab-id="${tabId}"]`);
  }

  /**
   * すべてのタブ要素を取得
   * @returns {NodeList}
   */
  getAllTabElements() {
    return this.tabsContainer.querySelectorAll('.tab');
  }

  /**
   * タブバーを再構築（グループUIと連携）
   * この関数はGroupUIと協力してタブバー全体を再構築します
   */
  rebuildTabBar(groupUI) {
    // 既存のタブ要素を保持
    const existingTabElements = new Map();
    Array.from(this.tabsContainer.querySelectorAll('.tab')).forEach(el => {
      existingTabElements.set(el.dataset.tabId, el);
    });

    // 既存のグループコンテナとヘッダーを削除
    this.tabsContainer.querySelectorAll('.group-container, .tab-group-header').forEach(el => el.remove());

    // グループごとにタブを分類
    const groupedTabs = new Map();
    const ungroupedTabs = [];

    this.tabManager.getAllTabs().forEach(tab => {
      if (tab.isInternal) return; // 内部ページは除外

      if (tab.groupId) {
        if (!groupedTabs.has(tab.groupId)) {
          groupedTabs.set(tab.groupId, []);
        }
        groupedTabs.get(tab.groupId).push(tab);
      } else {
        ungroupedTabs.push(tab);
      }
    });

    // GroupUIを使ってグループコンテナを作成
    if (groupUI) {
      groupUI.renderAllGroups(groupedTabs, existingTabElements);
    }

    // グループ化されていないタブを配置
    ungroupedTabs.forEach(tab => {
      const tabElement = existingTabElements.get(tab.id);
      if (tabElement) {
        tabElement.classList.remove('grouped');
        this.tabsContainer.appendChild(tabElement);
      }
    });
  }
}
