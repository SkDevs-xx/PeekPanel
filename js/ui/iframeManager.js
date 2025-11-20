import { getTabTitle } from '../utils/urlHelper.js';

/**
 * iframe管理クラス
 * iframeの作成、ロード処理、エラーハンドリングを管理
 */
export class IframeManager {
  constructor(tabManager, tabUI, errorManager) {
    this.tabManager = tabManager;
    this.tabUI = tabUI;
    this.errorManager = errorManager;
  }

  /**
   * タブ用のiframe要素を作成
   * @param {string} tabId - タブID
   * @param {string} url - 読み込むURL
   * @param {boolean} isActive - アクティブなタブかどうか
   * @param {boolean} isInternal - 内部ページかどうか
   * @returns {HTMLIFrameElement} 作成されたiframe要素
   */
  createIframeForTab(tabId, url, isActive, isInternal) {
    const iframe = document.createElement('iframe');
    iframe.id = tabId;
    // content-scriptで識別するためにname属性を設定
    iframe.name = `peekpanel-view-${tabId}`;
    iframe.allow = 'camera; clipboard-write; fullscreen; microphone; geolocation';

    // タイムアウト検知（60秒）- 内部ページは除外
    let loadTimeout = setTimeout(() => {
      const tab = this.tabManager.getTab(tabId);
      if (tab && !tab.isInternal && !tab.isLoaded && !tab.hasError && iframe.src && iframe.src !== 'about:blank') {
        this.errorManager.handleIframeError(tabId, 'timeout');
      }
    }, 60000);

    // エラー検知 - 内部ページは除外
    iframe.addEventListener('error', (e) => {
      clearTimeout(loadTimeout);
      const tab = this.tabManager.getTab(tabId);
      if (tab && !tab.isInternal) {
        console.error('[IframeManager] iframe error:', e);
        this.errorManager.handleIframeError(tabId, 'network');
      }
    });

    // iframeのロード完了時にファビコンとタイトルを更新
    iframe.addEventListener('load', () => {
      clearTimeout(loadTimeout);
      try {
        const currentUrl = iframe.src;
        const tab = this.tabManager.getTab(tabId);

        // スリープ中のタブはファビコン更新をスキップ
        if (tab && !tab.isSleeping) {
          this.tabUI.updateTabFavicon(tabId, currentUrl);
        }

        // タイトル更新
        try {
          const title = iframe.contentDocument?.title;
          if (title) {
            this.tabManager.updateTabTitle(tabId, title);
          }
        } catch (e) {
          // CORS エラー - URLからタイトルを推測
          if (iframe.src) {
            const title = getTabTitle(iframe.src);
            this.tabManager.updateTabTitle(tabId, title);
          }
        }

        // 読み込み完了をマーク
        const isPanelPage = currentUrl && currentUrl.includes('/pages/main.html');
        if (tab && currentUrl && currentUrl !== 'about:blank' && currentUrl !== '' && !isPanelPage) {
          this.tabManager.setTabLoaded(tabId, true);
        }

        // 内部ページのみloadイベントで履歴を管理
        if (tab && currentUrl && currentUrl !== 'about:blank' && tab.isInternal) {
          if (tab.history.length === 0) {
            this.tabManager.updateTabUrl(tabId, currentUrl);
          }
        }
      } catch (e) {
        console.log('[IframeManager] Cannot access iframe URL (cross-origin)');
      }
    });

    document.getElementById('iframeContainer').appendChild(iframe);

    // chrome://やchrome-extension://などの特殊URLをチェック
    const isRestrictedUrl = !isInternal && url && (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') ||
      (url.startsWith('about:') && url !== 'about:blank')
    );

    // 制限されたURLの場合はエラー状態にする
    if (isRestrictedUrl) {
      this.tabManager.setTabError(tabId, 'blocked', 'このページは埋め込みで表示できません');
      if (isActive) {
        this.tabUI.updateTabFaviconToError(tabId);
      }
    }
    // アクティブなタブのみURLを読み込む
    else if (url && isActive) {
      iframe.src = url;
    }

    return iframe;
  }
}
