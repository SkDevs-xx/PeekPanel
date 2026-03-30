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
    this._loadTimeouts = new Map(); // タイムアウトをtabId単位で管理
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
    // Permissions Policy: カメラ・マイク・位置情報は不要なため除外
    iframe.allow = 'fullscreen *; clipboard-write; encrypted-media; autoplay; picture-in-picture';

    // タイムアウト検知（20秒）- 内部ページは除外
    // 既存のタイムアウトをクリア（リロード・タブ復帰時のリーク防止）
    if (this._loadTimeouts.has(tabId)) {
      clearTimeout(this._loadTimeouts.get(tabId));
    }
    const loadTimeout = setTimeout(() => {
      this._loadTimeouts.delete(tabId);
      const tab = this.tabManager.getTab(tabId);
      if (tab && !tab.isInternal && !tab.isLoaded && !tab.hasError && iframe.src && iframe.src !== 'about:blank') {
        this.errorManager.handleIframeError(tabId, 'timeout');
      }
    }, 20000);
    this._loadTimeouts.set(tabId, loadTimeout);

    // エラー検知 - 内部ページは除外
    iframe.addEventListener('error', (e) => {
      clearTimeout(this._loadTimeouts.get(tabId));
      this._loadTimeouts.delete(tabId);
      const tab = this.tabManager.getTab(tabId);
      if (tab && !tab.isInternal) {
        console.error('[IframeManager] iframe error:', e);
        this.errorManager.handleIframeError(tabId, 'network');
      }
    });

    // iframeのロード完了時にタイトルを更新
    iframe.addEventListener('load', () => {
      clearTimeout(this._loadTimeouts.get(tabId));
      this._loadTimeouts.delete(tabId);
      try {
        const currentUrl = iframe.src;
        const tab = this.tabManager.getTab(tabId);

        // ファビコン更新はcontent-scriptからのupdatePageTitleメッセージで行うため、ここでは行わない
        // （iframe.srcは初期URLなので、ナビゲーション後の実際のURLとは異なる場合がある）

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
      url.startsWith('file://') ||
      url.startsWith('data:') ||
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
