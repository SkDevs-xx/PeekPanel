// AIサービスに自動的にテキストを入力するContent Script

(async function () {
  try {
    // 拡張機能のコンテキストが有効かチェック
    if (!chrome.runtime?.id) {
      return;
    }

    // ストレージから清書テキスト、プロンプトタイプ、自動送信フラグを取得
    const { pendingCleanupText, pendingPromptType, pendingAutoSubmit } = await chrome.storage.local.get([
      'pendingCleanupText',
      'pendingPromptType',
      'pendingAutoSubmit'
    ]);

    if (!pendingCleanupText) {
      return; // 清書テキストがなければ何もしない
    }

    const currentUrl = window.location.href;

    // Claude用の自動入力
    if (currentUrl.includes('claude.ai')) {
      await inputToClaude(pendingCleanupText, pendingPromptType || 'cleanup', pendingAutoSubmit || false);
    }
    // ChatGPT用の自動入力
    else if (currentUrl.includes('chatgpt.com')) {
      await inputToChatGPT(pendingCleanupText, pendingPromptType || 'cleanup', pendingAutoSubmit || false);
    }
    // Gemini用の自動入力
    else if (currentUrl.includes('gemini.google.com')) {
      await inputToGemini(pendingCleanupText, pendingPromptType || 'cleanup', pendingAutoSubmit || false);
    }

    // 使用後は削除
    if (chrome.runtime?.id) {
      await chrome.storage.local.remove(['pendingCleanupText', 'pendingPromptType', 'pendingAutoSubmit']);
    }
  } catch (error) {
    // 拡張機能コンテキストが無効化されている場合は静かに終了
    if (!error.message.includes('Extension context invalidated')) {
      console.error('[PeekPanel] Error in auto-input:', error);
    }
  }
})();

// プロンプトタイプに応じたプロンプトを生成
function generatePrompt(text, promptType) {
  // カスタムプロンプトの場合、textがすでに完成したプロンプト
  if (promptType === 'custom') {
    return text;
  }

  // デフォルトプロンプト
  const prompts = {
    'cleanup': `次の文章を読みやすく清書してください:\n\n${text}`,
    'summary': `次の文章を簡潔に要約してください:\n\n${text}`,
    'translate': `次の文章を英語に翻訳してください:\n\n${text}`,
    'professional': `次の文章をビジネス文書として整形してください:\n\n${text}`
  };

  return prompts[promptType] || prompts['cleanup'];
}

// Claude用の入力処理
async function inputToClaude(text, promptType = 'cleanup', autoSubmit = false) {
  const prompt = generatePrompt(text, promptType);

  // 複数のセレクタを試す（ProseMirrorを優先）
  const selectors = [
    '.ProseMirror',
    'div[contenteditable="true"]',
    'div[role="textbox"]',
    'textarea',
    'div[data-placeholder]'
  ];

  let textarea = null;
  for (const selector of selectors) {
    // Claudeは重いので15秒待機
    textarea = await waitForElement(selector, 15000);
    if (textarea) {
      break;
    }
  }

  if (textarea) {
    // フォーカス
    textarea.focus();

    // 少し待機してフォーカスが確実に当たるようにする
    await new Promise(resolve => setTimeout(resolve, 100));

    // テキストを挿入
    if (textarea.tagName === 'TEXTAREA') {
      textarea.value = prompt;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // contenteditable要素の場合
      // document.execCommand を使って確実に入力
      textarea.focus();

      // 既存のコンテンツをクリア
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);

      // テキストを挿入（改行も正しく処理される）
      document.execCommand('insertText', false, prompt);

      // バックアップ方法：execCommandが失敗した場合
      if (!textarea.textContent || textarea.textContent.trim() === '') {
        textarea.textContent = prompt;

        // InputEventを発火
        const inputEvent = new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: prompt
        });
        textarea.dispatchEvent(inputEvent);
      }

      // その他のイベントも発火
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 自動送信が有効な場合のみ送信処理を実行
    if (autoSubmit) {
      // Claude用はEnterキーで送信（Cmd+Enter / Ctrl+Enter）
      await new Promise(resolve => setTimeout(resolve, 500)); // 少し待機

      // Cmd+Enter (Mac) または Ctrl+Enter (Windows/Linux) を送信
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        metaKey: true,  // Mac用
        ctrlKey: true,  // Windows/Linux用
        bubbles: true,
        cancelable: true
      });

      textarea.dispatchEvent(enterEvent);

      // バックアップ: キーイベントで送信できなかった場合、ボタンを探す
      await new Promise(resolve => setTimeout(resolve, 300));

      const parentForm = textarea.closest('form') || textarea.closest('[class*="composer"]') || document;
      const submitSelectors = [
        'button[aria-label="Send Message"]',
        'button[aria-label^="Send"]'
      ];

      let submitButton = null;
      for (const selector of submitSelectors) {
        submitButton = parentForm.querySelector(selector);
        if (submitButton && !submitButton.disabled && submitButton.offsetParent !== null) {
          submitButton.click();
          break;
        }
      }
    }
  }
}

// ChatGPT用の入力処理
async function inputToChatGPT(text, promptType = 'cleanup', autoSubmit = false) {
  const prompt = generatePrompt(text, promptType);

  // 複数のセレクタを試す
  const selectors = [
    '#prompt-textarea',
    'textarea[placeholder*="Message"]',
    'div[contenteditable="true"]',
    'textarea',
    'div[role="textbox"]'
  ];

  let textarea = null;
  for (const selector of selectors) {
    // 10秒待機
    textarea = await waitForElement(selector, 10000);
    if (textarea) {
      break;
    }
  }

  if (textarea) {
    // フォーカス
    textarea.focus();

    // テキストを挿入
    if (textarea.tagName === 'TEXTAREA' || textarea.tagName === 'INPUT') {
      textarea.value = prompt;
    } else if (textarea.contentEditable === 'true') {
      textarea.textContent = prompt;
    }

    // 各種イベントを発火
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

    // 自動送信が有効な場合のみ送信処理を実行
    if (autoSubmit) {
      // 送信ボタンを探してクリック
      await new Promise(resolve => setTimeout(resolve, 300)); // 少し待機

      const submitSelectors = [
        'button[data-testid="send-button"]',
        'button[aria-label*="Send"]',
        'button[type="submit"]',
        'button:has(svg)',
        '[data-testid="fruitjuice-send-button"]'
      ];

      let submitButton = null;
      for (const selector of submitSelectors) {
        submitButton = document.querySelector(selector);
        if (submitButton && !submitButton.disabled) {
          submitButton.click();
          break;
        }
      }
    }
  }
}

// Gemini用の入力処理
async function inputToGemini(text, promptType = 'cleanup', autoSubmit = false) {
  const prompt = generatePrompt(text, promptType);

  // 複数のセレクタを試す
  const selectors = [
    'rich-textarea .ql-editor[contenteditable="true"]',
    '.ql-editor[contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea',
    'div[role="textbox"]'
  ];

  let textarea = null;
  for (const selector of selectors) {
    // 10秒待機
    textarea = await waitForElement(selector, 10000);
    if (textarea) {
      break;
    }
  }

  if (textarea) {
    // フォーカス
    textarea.focus();

    // テキストを挿入
    if (textarea.tagName === 'TEXTAREA') {
      textarea.value = prompt;
    } else {
      // contenteditable要素の場合
      const p = document.createElement('p');
      p.textContent = prompt;
      textarea.innerHTML = '';
      textarea.appendChild(p);
    }

    // 各種イベントを発火
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

    // 自動送信が有効な場合のみ送信処理を実行
    if (autoSubmit) {
      // 送信ボタンを探してクリック
      await new Promise(resolve => setTimeout(resolve, 300)); // 少し待機

      const submitSelectors = [
        'button[aria-label*="送信"]',
        'button[aria-label*="Send"]',
        'button.send-button',
        'button[type="submit"]',
        'button:has(svg)',
        '[mattooltip*="送信"]'
      ];

      let submitButton = null;
      for (const selector of submitSelectors) {
        submitButton = document.querySelector(selector);
        if (submitButton && !submitButton.disabled) {
          submitButton.click();
          break;
        }
      }
    }
  }
}

// 要素が表示されるまで待機するヘルパー関数
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    // すでに存在する場合は即座に返す
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    // MutationObserverで要素の出現を監視
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        clearTimeout(timeoutId);
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // タイムアウト設定
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}
