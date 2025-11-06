import { normalizeUrl, getTabTitle } from '../utils/urlHelper.js';

/**
 * ナビゲーションUI管理クラス
 * ブラウザコントロール（戻る/進む/リロード/URL入力）のUI管理
 */
export class NavigationUI {
  constructor(tabManager, eventHandlers = {}) {
    this.tabManager = tabManager;
    this.eventHandlers = eventHandlers;

    // DOM要素
    this.backButton = document.getElementById('back');
    this.forwardButton = document.getElementById('forward');
    this.reloadButton = document.getElementById('reload');
    this.urlBar = document.getElementById('urlBar');
    this.newTabButton = document.getElementById('newTab');

    // イベントリスナーを設定
    this.setupEventListeners();
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // TabManagerのイベントをリスニング
    this.tabManager.on('tabSwitched', ({ tabData }) => {
      this.updateUrlBar(tabData);
      this.updateNavButtons(tabData);
    });

    this.tabManager.on('tabNavigated', ({ tabId }) => {
      const tabData = this.tabManager.getTab(tabId);
      if (tabData && tabId === this.tabManager.currentTabId) {
        this.updateUrlBar(tabData);
        this.updateNavButtons(tabData);
      }
    });

    this.tabManager.on('tabUpdated', (tabData) => {
      if (tabData.id === this.tabManager.currentTabId) {
        this.updateUrlBar(tabData);
      }
    });

    // ナビゲーションボタンのイベント
    this.backButton.addEventListener('click', () => {
      if (this.eventHandlers.onBackClick) {
        this.eventHandlers.onBackClick();
      }
    });

    this.forwardButton.addEventListener('click', () => {
      if (this.eventHandlers.onForwardClick) {
        this.eventHandlers.onForwardClick();
      }
    });

    this.reloadButton.addEventListener('click', () => {
      if (this.eventHandlers.onReloadClick) {
        this.eventHandlers.onReloadClick();
      }
    });

    // URLバーでEnterキー
    this.urlBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const url = e.target.value.trim();
        if (url && this.eventHandlers.onNavigateToUrl) {
          this.eventHandlers.onNavigateToUrl(url);
        }
      }
    });

    // 新しいタブボタン
    if (this.newTabButton) {
      this.newTabButton.addEventListener('click', () => {
        if (this.eventHandlers.onNewTabClick) {
          this.eventHandlers.onNewTabClick();
        }
      });
    }
  }

  /**
   * URL入力バーを更新
   * @param {Object} tabData - タブデータ
   */
  updateUrlBar(tabData) {
    if (tabData && this.urlBar) {
      this.urlBar.value = tabData.url || '';
    }
  }

  /**
   * ナビゲーションボタンの状態を更新
   * @param {Object} tabData - タブデータ
   */
  updateNavButtons(tabData) {
    if (!tabData) return;

    // 戻るボタン
    if (this.backButton) {
      this.backButton.disabled = !tabData.history || tabData.historyIndex <= 0;
    }

    // 進むボタン
    if (this.forwardButton) {
      this.forwardButton.disabled = !tabData.history || tabData.historyIndex >= tabData.history.length - 1;
    }
  }

  /**
   * 現在のタブのナビゲーション状態を取得して更新
   */
  updateCurrentTab() {
    const currentTab = this.tabManager.getCurrentTab();
    if (currentTab) {
      this.updateUrlBar(currentTab);
      this.updateNavButtons(currentTab);
    }
  }

  /**
   * URLバーの値を取得
   * @returns {string}
   */
  getUrlBarValue() {
    return this.urlBar ? this.urlBar.value.trim() : '';
  }

  /**
   * URLバーの値を設定
   * @param {string} url - URL
   */
  setUrlBarValue(url) {
    if (this.urlBar) {
      this.urlBar.value = url || '';
    }
  }

  /**
   * URLバーにフォーカス
   */
  focusUrlBar() {
    if (this.urlBar) {
      this.urlBar.focus();
      this.urlBar.select();
    }
  }

  /**
   * ナビゲーションボタンを無効化/有効化
   * @param {boolean} disabled - 無効化するかどうか
   */
  setButtonsDisabled(disabled) {
    if (this.backButton) this.backButton.disabled = disabled;
    if (this.forwardButton) this.forwardButton.disabled = disabled;
    if (this.reloadButton) this.reloadButton.disabled = disabled;
  }

  /**
   * 戻るボタンを無効化/有効化
   * @param {boolean} disabled - 無効化するかどうか
   */
  setBackButtonDisabled(disabled) {
    if (this.backButton) {
      this.backButton.disabled = disabled;
    }
  }

  /**
   * 進むボタンを無効化/有効化
   * @param {boolean} disabled - 無効化するかどうか
   */
  setForwardButtonDisabled(disabled) {
    if (this.forwardButton) {
      this.forwardButton.disabled = disabled;
    }
  }

  /**
   * リロードボタンを無効化/有効化
   * @param {boolean} disabled - 無効化するかどうか
   */
  setReloadButtonDisabled(disabled) {
    if (this.reloadButton) {
      this.reloadButton.disabled = disabled;
    }
  }
}
