// サイドパネル内のiframeでデフォルトのコンテキストメニューを無効化
// Googleで検索などのデフォルト機能によるクラッシュを防ぐ

(function () {
  // 拡張機能内部ページでは実行しない
  const isExtensionPage = window.location.protocol === 'chrome-extension:' ||
    window.location.href.includes('chrome-extension://');

  // iframe内でない場合も実行しない
  const isInIframe = window.self !== window.top;

  // 拡張機能内部ページまたはiframe外では何もしない
  if (isExtensionPage || !isInIframe) {
    return;
  }

  // PeekPanelのiframeでない場合は実行しない（一般のWebサイト上のiframeでの実行を防止）
  // iframeManager.jsで設定したname属性（peekpanel-view-...）をチェック
  if (!window.name || !window.name.startsWith('peekpanel-view-')) {
    return;
  }

  // iframe内でのみ動作
  try {
    // グローバル変数として保存（クリーンアップ用）
    let titleObserver = null;
    let mediaObserver = null;
    let titleCheckInterval = null;
    let urlCheckInterval = null;
    let currentMuteState = false;

    // 拡張機能のオリジンを取得（セキュリティ強化）
    // chrome.runtimeが利用不可の場合はundefinedのまま保持（'*'フォールバックは使用しない）
    const EXTENSION_ORIGIN = chrome.runtime?.getURL('').slice(0, -1);

    // 安全にpostMessageを送信するヘルパー関数
    function safePostMessage(message, targetOrigin = EXTENSION_ORIGIN) {
      try {
        // オリジンが不明な場合は送信しない（セキュリティ対策）
        if (!targetOrigin) return;
        // window.parentが存在し、かつ自分自身でないことを確認
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(message, targetOrigin);
        }
      } catch (error) {
        // postMessageエラーを静かに無視（origin mismatchなど）
        // デバッグ用に必要な場合のみログ出力
        if (error.message && !error.message.includes('does not match')) {
          console.debug('[PeekPanel] postMessage error:', error.message);
        }
      }
    }

    // クリーンアップ処理（メモリリーク対策）
    function cleanup() {
      if (titleObserver) {
        titleObserver.disconnect();
        titleObserver = null;
      }
      if (mediaObserver) {
        mediaObserver.disconnect();
        mediaObserver = null;
      }
      if (titleCheckInterval) {
        clearInterval(titleCheckInterval);
        titleCheckInterval = null;
      }
      if (urlCheckInterval) {
        clearInterval(urlCheckInterval);
        urlCheckInterval = null;
      }
    }

    // ページアンロード時にクリーンアップ
    window.addEventListener('beforeunload', cleanup);

    // 右クリックイベントをインターセプト
    document.addEventListener('contextmenu', (e) => {
      // テキストが選択されているか確認
      const selectedText = window.getSelection().toString().trim();

      if (selectedText) {
        // テキスト選択時のみデフォルトのコンテキストメニューを無効化
        e.preventDefault();

        // 親ウィンドウ（panel.js）にメッセージを送信（オリジン検証強化）
        safePostMessage({
          type: 'showCustomContextMenu',
          text: selectedText,
          x: e.clientX,
          y: e.clientY
        });
      }
    }, true);

    // クリックイベント（カスタムメニュー＆タブコンテキストメニューを閉じる）
    document.addEventListener('click', () => {
      // カスタムコンテキストメニューを閉じる
      safePostMessage({
        type: 'hideCustomContextMenu'
      });

      // タブコンテキストメニューも閉じる
      safePostMessage({
        type: 'closeContextMenu'
      });
    }, true);

    // リンクを新規タブで開くヘルパー関数
    function openLinkInNewTab(e, requireBlankTarget = true) {
      const link = e.target.closest('a');
      if (!link) return false;

      // requireBlankTarget=trueの場合はtarget="_blank"のリンクのみ対象
      if (requireBlankTarget) {
        const target = link.getAttribute('target');
        if (target !== '_blank') return false;
      }

      const href = link.getAttribute('href');
      if (!href || href.startsWith('javascript:') || href === '' || href === '#') return false;

      let absoluteUrl;
      try {
        absoluteUrl = new URL(href, window.location.href).href;
      } catch (e) {
        return false;
      }

      e.preventDefault();
      e.stopPropagation();

      safePostMessage({
        type: 'openNewTab',
        url: absoluteUrl
      });

      return true;
    }

    // target="_blank" リンクのクリックをインターセプト（サブパネル内で新規タブとして開く）
    document.addEventListener('click', (e) => {
      openLinkInNewTab(e, true);
    }, true);

    // マウスホイールクリック（中クリック）をインターセプト（すべてのリンクを新規タブで開く）
    document.addEventListener('auxclick', (e) => {
      // 中クリック（button === 1）のみ処理
      if (e.button !== 1) return;
      openLinkInNewTab(e, false);
    }, true);

    // ページタイトルを親ウィンドウに通知
    function sendTitle() {
      const title = document.title;
      if (title) {
        safePostMessage({
          type: 'updatePageTitle',
          title: title,
          url: window.location.href
        });
      }
    }

    // 初回読み込み時（複数のタイミングで試す）
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', sendTitle);
      window.addEventListener('load', sendTitle);
    } else if (document.readyState === 'interactive') {
      sendTitle();
      window.addEventListener('load', sendTitle);
    } else {
      sendTitle();
    }

    // タイトルの変更を監視（DOMContentLoaded後に設定）
    function setupTitleObserver(retryCount = 0) {
      // 既存のObserverをdisconnectしてから新規作成（二重登録防止）
      if (titleObserver) {
        titleObserver.disconnect();
        titleObserver = null;
      }
      const titleElement = document.querySelector('title');
      if (titleElement) {
        titleObserver = new MutationObserver(sendTitle);
        titleObserver.observe(titleElement, { childList: true, characterData: true, subtree: true });
      } else if (retryCount < 10) {
        // title要素がまだない場合は少し待ってから再試行（最大10回）
        setTimeout(() => setupTitleObserver(retryCount + 1), 100);
      }
      // title要素がないページ（Google One Tapなど）も存在するため、警告は不要
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupTitleObserver);
    } else {
      setupTitleObserver();
    }

    // 定期的にタイトルをチェック（SPAなど動的に変わる場合に備えて）
    // パフォーマンス最適化: 1秒→5秒間隔に変更
    let lastTitle = '';
    titleCheckInterval = setInterval(() => {
      if (document.title && document.title !== lastTitle) {
        lastTitle = document.title;
        sendTitle();
      }
    }, 5000);

    // 親ウィンドウからのミュート/ミュート解除メッセージを受信
    // currentMuteStateの更新とメディア操作を1つのリスナーで処理（二重登録防止）
    window.addEventListener('message', (event) => {
      // Validate origin to only accept messages from the extension
      if (!EXTENSION_ORIGIN || event.origin !== EXTENSION_ORIGIN) return;

      if (event.data.type === 'muteMedia') {
        currentMuteState = true;
        // すべてのaudio/video要素をミュート
        document.querySelectorAll('audio, video').forEach(media => {
          media.muted = true;
        });
      } else if (event.data.type === 'unmuteMedia') {
        currentMuteState = false;
        // すべてのaudio/video要素のミュートを解除
        document.querySelectorAll('audio, video').forEach(media => {
          media.muted = false;
        });
      }
    });

    // 新しく追加されるaudio/video要素も監視してミュート状態を適用
    mediaObserver = new MutationObserver((mutations) => {
      if (currentMuteState) {
        document.querySelectorAll('audio, video').forEach(media => {
          media.muted = true;
        });
      }
    });

    // body要素が存在する場合に監視を開始（レースコンディション対策）
    function startMediaObserver(retryCount = 0) {
      if (document.body && mediaObserver) {
        try {
          mediaObserver.observe(document.body, {
            childList: true,
            subtree: true
          });
        } catch (e) {
          console.error('[PeekPanel] Failed to observe media:', e);
        }
      } else if (retryCount < 10) {
        // 最大10回までリトライ
        setTimeout(() => startMediaObserver(retryCount + 1), 100);
      }
      // body要素がないページも存在するため、警告は不要
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startMediaObserver);
    } else {
      startMediaObserver();
    }

    // ページロード時にナビゲーションを検出（マウスサイドボタンでの戻る/進む）
    // document_start で実行されるため、ページロード直後にメッセージを送る
    safePostMessage({
      type: 'pageLoaded',
      url: window.location.href,
      title: document.title || ''
    });

    // マウスサイドボタンでのナビゲーションを検出（popstateイベント）
    window.addEventListener('popstate', (e) => {
      // ブラウザの戻る/進む機能でページ遷移が発生した
      safePostMessage({
        type: 'historyNavigated',
        url: window.location.href,
        title: document.title
      });
    });

    // URLが変更された時のバックアップ検出（SPAなど）
    let lastUrl = window.location.href;
    urlCheckInterval = setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // popstateで検出できない場合のフォールバック
        safePostMessage({
          type: 'urlChanged',
          url: currentUrl,
          title: document.title
        });
      }
    }, 1000);
  } catch (error) {
    // Extension context invalidatedエラーを無視
    // 拡張機能のリロード後に古いコンテンツスクリプトが実行される場合に発生
    if (!error.message?.includes('Extension context invalidated')) {
      console.error('[PeekPanel Content Script] Error:', error);
    }
  }
})(); // 即時実行関数の閉じ括弧

