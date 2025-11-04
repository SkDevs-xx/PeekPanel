// サイドパネル内のiframeでデフォルトのコンテキストメニューを無効化
// Googleで検索などのデフォルト機能によるクラッシュを防ぐ

// iframe内でのみ動作（メインパネルでは動作しない）
if (window.self !== window.top) {
  try {
    // 右クリックイベントをインターセプト
    document.addEventListener('contextmenu', (e) => {
      // テキストが選択されているか確認
      const selectedText = window.getSelection().toString().trim();

      if (selectedText) {
        // デフォルトのコンテキストメニューを無効化
        e.preventDefault();

        // 親ウィンドウ（panel.js）にメッセージを送信
        window.parent.postMessage({
          type: 'showCustomContextMenu',
          text: selectedText,
          x: e.clientX,
          y: e.clientY
        }, '*');
      }
    }, true);

    // クリックで選択を解除（オプション）
    document.addEventListener('click', () => {
      window.parent.postMessage({
        type: 'hideCustomContextMenu'
      }, '*');
    }, true);

    // ページタイトルを親ウィンドウに通知
    function sendTitle() {
      const title = document.title;
      if (title) {
        window.parent.postMessage({
          type: 'updatePageTitle',
          title: title,
          url: window.location.href
        }, '*');
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
    function setupTitleObserver() {
      const titleElement = document.querySelector('title');
      if (titleElement) {
        const titleObserver = new MutationObserver(sendTitle);
        titleObserver.observe(titleElement, { childList: true, characterData: true, subtree: true });
      } else {
        // title要素がまだない場合は少し待ってから再試行
        setTimeout(setupTitleObserver, 100);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupTitleObserver);
    } else {
      setupTitleObserver();
    }

    // 定期的にタイトルをチェック（SPAなど動的に変わる場合に備えて）
    let lastTitle = '';
    setInterval(() => {
      if (document.title && document.title !== lastTitle) {
        lastTitle = document.title;
        sendTitle();
      }
    }, 1000);
  } catch (error) {
    // Extension context invalidatedエラーを無視
    // 拡張機能のリロード後に古いコンテンツスクリプトが実行される場合に発生
    if (!error.message?.includes('Extension context invalidated')) {
      console.error('[PeekPanel Content Script] Error:', error);
    }
  }
}
