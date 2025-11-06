/**
 * エラー管理クラス
 * iframe読み込みエラーの表示と再試行を管理
 */
export class ErrorManager {
  constructor(tabManager, tabUI) {
    this.tabManager = tabManager;
    this.tabUI = tabUI;
  }

  /**
   * iframeエラーをハンドリング
   * @param {string} tabId - タブID
   * @param {string} errorType - エラータイプ（network, 404, 403, timeout, blocked等）
   */
  handleIframeError(tabId, errorType) {
    const tab = this.tabManager.getTab(tabId);
    if (!tab) return;

    const errorMessages = {
      'network': 'このページへの接続に失敗しました',
      '404': 'ページが見つかりません',
      '403': 'アクセスが拒否されました',
      'timeout': '読み込みがタイムアウトしました（60秒）',
      'blocked': 'このページは埋め込みで表示できません'
    };

    const errorMessage = errorMessages[errorType] || '不明なエラーが発生しました';

    // TabManagerでエラー状態を設定
    this.tabManager.setTabError(tabId, errorType, errorMessage);

    // エラーUIを表示
    if (tabId === this.tabManager.currentTabId) {
      this.showErrorOverlay(tabId);
    }

    console.error(`[ErrorManager] Tab ${tabId} error:`, errorType, errorMessage);
  }

  /**
   * エラーオーバーレイを表示
   * @param {string} tabId - タブID
   */
  showErrorOverlay(tabId) {
    const tab = this.tabManager.getTab(tabId);
    if (!tab || !tab.hasError) return;

    const iframe = document.getElementById(tabId);
    if (!iframe) return;

    // 既存のエラーオーバーレイを削除
    const iframeContainer = document.getElementById('iframeContainer');
    const existingOverlay = iframeContainer.querySelector('.error-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // テンプレートからクローン
    const template = document.getElementById('errorOverlayTemplate');
    if (!template) {
      console.error('[ErrorManager] Error overlay template not found');
      return;
    }

    const overlay = template.content.firstElementChild.cloneNode(true);

    // エラーメッセージを設定
    overlay.querySelector('.error-message').textContent = tab.errorMessage;

    // 再読み込みボタンのイベント
    overlay.querySelector('[data-action="retry"]').onclick = () => {
      this.retryLoadTab(tabId);
    };

    // 閉じるボタンのイベント
    overlay.querySelector('[data-action="close"]').onclick = () => {
      this.tabManager.closeTab(tabId);
    };

    // iframeContainerに追加
    iframeContainer.appendChild(overlay);
  }

  /**
   * タブの再読み込みを試行
   * @param {string} tabId - タブID
   */
  retryLoadTab(tabId) {
    const tab = this.tabManager.getTab(tabId);
    if (!tab) return;

    // エラー状態をリセット
    this.tabManager.clearTabError(tabId);

    // エラーオーバーレイを削除
    const iframeContainer = document.getElementById('iframeContainer');
    const overlay = iframeContainer.querySelector('.error-overlay');
    if (overlay) {
      overlay.remove();
    }

    // iframeを再読み込み
    const iframe = document.getElementById(tabId);
    if (iframe) {
      iframe.src = tab.url;
    }

    // ファビコンを通常に戻す
    this.tabUI.updateTabFavicon(tabId, tab.url);

    // タブエラークラスを削除
    const tabElement = this.tabUI.getTabElement(tabId);
    if (tabElement) {
      tabElement.classList.remove('tab-error');
    }
  }

  /**
   * エラーオーバーレイを非表示
   */
  hideErrorOverlay() {
    const iframeContainer = document.getElementById('iframeContainer');
    const overlay = iframeContainer.querySelector('.error-overlay');
    if (overlay) {
      overlay.remove();
    }
  }
}
