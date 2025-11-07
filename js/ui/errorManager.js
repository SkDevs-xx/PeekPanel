/**
 * エラー管理クラス
 * iframe読み込みエラーの表示と再試行を管理
 * アプリケーション全体のエラーハンドリングを統一
 */
export class ErrorManager {
  static instance = null;

  /**
   * シングルトンインスタンスを取得
   * @returns {ErrorManager}
   */
  static getInstance() {
    if (!ErrorManager.instance) {
      throw new Error('ErrorManager not initialized. Call constructor first.');
    }
    return ErrorManager.instance;
  }

  constructor(tabManager, tabUI) {
    this.tabManager = tabManager;
    this.tabUI = tabUI;
    this.errorHandlers = new Map();

    // シングルトンインスタンスを設定
    if (!ErrorManager.instance) {
      ErrorManager.instance = this;
    }

    // デフォルトハンドラーを登録
    this.registerDefaultHandlers();
  }

  /**
   * デフォルトエラーハンドラーを登録
   */
  registerDefaultHandlers() {
    this.registerHandler('NETWORK_ERROR', this.handleNetworkError.bind(this));
    this.registerHandler('STORAGE_ERROR', this.handleStorageError.bind(this));
    this.registerHandler('PERMISSION_ERROR', this.handlePermissionError.bind(this));
    this.registerHandler('UNKNOWN_ERROR', this.handleUnknownError.bind(this));
  }

  /**
   * エラーハンドラーを登録
   * @param {string} errorType - エラータイプ
   * @param {Function} handler - ハンドラー関数
   */
  registerHandler(errorType, handler) {
    this.errorHandlers.set(errorType, handler);
  }

  /**
   * エラーを分類
   * @param {Error} error - エラーオブジェクト
   * @returns {string} エラータイプ
   */
  classifyError(error) {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return 'NETWORK_ERROR';
    }
    if (message.includes('storage') || message.includes('quota')) {
      return 'STORAGE_ERROR';
    }
    if (message.includes('permission') || message.includes('denied')) {
      return 'PERMISSION_ERROR';
    }

    return 'UNKNOWN_ERROR';
  }

  /**
   * エラーをハンドリング（汎用）
   * @param {Error} error - エラーオブジェクト
   * @param {Object} context - エラーコンテキスト
   */
  handleError(error, context = {}) {
    const errorType = this.classifyError(error);
    const handler = this.errorHandlers.get(errorType);

    if (handler) {
      handler(error, context);
    } else {
      this.handleUnknownError(error, context);
    }
  }

  /**
   * ネットワークエラーハンドラー
   */
  handleNetworkError(error, context) {
    console.error('[ErrorManager] Network error:', error, context);
    this.showToast({
      message: 'ネットワークエラーが発生しました',
      action: 'ネット接続を確認してください',
      type: 'error'
    });
  }

  /**
   * ストレージエラーハンドラー
   */
  handleStorageError(error, context) {
    console.error('[ErrorManager] Storage error:', error, context);
    this.showToast({
      message: 'データの保存に失敗しました',
      action: 'ブラウザを再起動してください',
      type: 'error'
    });
  }

  /**
   * 権限エラーハンドラー
   */
  handlePermissionError(error, context) {
    console.error('[ErrorManager] Permission error:', error, context);
    this.showToast({
      message: '権限エラーが発生しました',
      action: '拡張機能の権限を確認してください',
      type: 'error'
    });
  }

  /**
   * 不明なエラーハンドラー
   */
  handleUnknownError(error, context) {
    console.error('[ErrorManager] Unknown error:', error, context);
    this.showToast({
      message: '予期しないエラーが発生しました',
      action: 'ページをリロードしてください',
      type: 'error'
    });
  }

  /**
   * トースト通知を表示
   * @param {Object} options - トーストオプション
   */
  showToast({ message, action, type = 'info', duration = 5000 }) {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;

    const messageEl = document.createElement('div');
    messageEl.textContent = message;
    toast.appendChild(messageEl);

    if (action) {
      const actionEl = document.createElement('div');
      actionEl.style.fontSize = '12px';
      actionEl.style.marginTop = '4px';
      actionEl.style.opacity = '0.8';
      actionEl.textContent = action;
      toast.appendChild(actionEl);
    }

    document.body.appendChild(toast);

    // 自動削除
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, duration);
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
