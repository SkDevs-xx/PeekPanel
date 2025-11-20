// サイドパネル内のiframeでデフォルトのコンテキストメニューを無効化
// Googleで検索などのデフォルト機能によるクラッシュを防ぐ

(function () {
  // 拡張機能内部ページでは実行しない
  const isExtensionPage = window.location.protocol === 'chrome-extension:' ||
    window.location.href.includes('chrome-extension://');

  // iframe内でない場合も実行しない
  const isInIframe = window.self !== window.top;

  // デバッグログ
  console.log('[PeekPanel Content Script]', {
    protocol: window.location.protocol,
    href: window.location.href,
    isExtensionPage,
    isInIframe,
    willExecute: !isExtensionPage && isInIframe
  });

  // 拡張機能内部ページまたはiframe外では何もしない
  if (isExtensionPage || !isInIframe) {
    return;
  }

  // iframe内でのみ動作
  try {
    // グローバル変数として保存（クリーンアップ用）
    let titleObserver = null;
    let mediaObserver = null;
    let titleCheckInterval = null;

    // 拡張機能のオリジンを取得（セキュリティ強化）
    const EXTENSION_ORIGIN = chrome.runtime?.getURL('').slice(0, -1) || '*';

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
        window.parent.postMessage({
          type: 'showCustomContextMenu',
          text: selectedText,
          x: e.clientX,
          y: e.clientY
        }, EXTENSION_ORIGIN);
      }
    }, true);

    // クリックイベント（カスタムメニュー＆タブコンテキストメニューを閉じる）
    document.addEventListener('click', () => {
      // カスタムコンテキストメニューを閉じる
      window.parent.postMessage({
        type: 'hideCustomContextMenu'
      }, EXTENSION_ORIGIN);

      // タブコンテキストメニューも閉じる
      window.parent.postMessage({
        type: 'closeContextMenu'
      }, EXTENSION_ORIGIN);
    }, true);

    // ページタイトルを親ウィンドウに通知
    function sendTitle() {
      const title = document.title;
      if (title) {
        window.parent.postMessage({
          type: 'updatePageTitle',
          title: title,
          url: window.location.href
        }, EXTENSION_ORIGIN);
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
      const titleElement = document.querySelector('title');
      if (titleElement) {
        titleObserver = new MutationObserver(sendTitle);
        titleObserver.observe(titleElement, { childList: true, characterData: true, subtree: true });
      } else if (retryCount < 10) {
        // title要素がまだない場合は少し待ってから再試行（最大10回）
        setTimeout(() => setupTitleObserver(retryCount + 1), 100);
      } else {
        console.warn('[PeekPanel] Failed to setup title observer after 10 retries');
      }
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
    window.addEventListener('message', (event) => {
      if (event.data.type === 'muteMedia') {
        // すべてのaudio/video要素をミュート
        document.querySelectorAll('audio, video').forEach(media => {
          media.muted = true;
        });
      } else if (event.data.type === 'unmuteMedia') {
        // すべてのaudio/video要素のミュートを解除
        document.querySelectorAll('audio, video').forEach(media => {
          media.muted = false;
        });
      }
    });

    // 新しく追加されるaudio/video要素も監視してミュート状態を適用
    let currentMuteState = false;
    mediaObserver = new MutationObserver((mutations) => {
      if (currentMuteState) {
        document.querySelectorAll('audio, video').forEach(media => {
          media.muted = true;
        });
      }
    });

    // body要素が存在する場合に監視を開始（レースコンディション対策）
    function startMediaObserver(retryCount = 0) {
      if (document.body) {
        mediaObserver.observe(document.body, {
          childList: true,
          subtree: true
        });
      } else if (retryCount < 10) {
        // 最大10回までリトライ
        setTimeout(() => startMediaObserver(retryCount + 1), 100);
      } else {
        console.warn('[PeekPanel] Failed to initialize media observer after 10 retries');
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startMediaObserver);
    } else {
      startMediaObserver();
    }

    // ミュート状態を更新
    window.addEventListener('message', (event) => {
      if (event.data.type === 'muteMedia') {
        currentMuteState = true;
      } else if (event.data.type === 'unmuteMedia') {
        currentMuteState = false;
      }
    });
  } catch (error) {
    // Extension context invalidatedエラーを無視
    // 拡張機能のリロード後に古いコンテンツスクリプトが実行される場合に発生
    if (!error.message?.includes('Extension context invalidated')) {
      console.error('[PeekPanel Content Script] Error:', error);
    }
  }
})(); // 即時実行関数の閉じ括弧

