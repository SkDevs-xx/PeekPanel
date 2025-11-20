// AIサービスに自動的にテキストを入力するContent Script

// AI設定オブジェクト (Strategy パターン)
const AI_CONFIGS = {
  claude: {
    name: 'Claude',
    urlPattern: 'claude.ai',
    selectors: [
      '.ProseMirror',
      'div[contenteditable="true"]',
      'div[role="textbox"]',
      'textarea',
      'div[data-placeholder]'
    ],
    timeout: 15000, // Claudeは重いので15秒
    submitSelectors: [
      'button[aria-label="Send Message"]',
      'button[aria-label^="Send"]'
    ],
    submitMethod: 'keyboard', // Cmd+Enter送信
    waitAfterInput: 500,
    insertMethod: 'execCommand' // execCommandを使用
  },
  chatgpt: {
    name: 'ChatGPT',
    urlPattern: 'chatgpt.com',
    selectors: [
      '#prompt-textarea',
      'textarea[placeholder*="Message"]',
      'div[contenteditable="true"]',
      'textarea',
      'div[role="textbox"]'
    ],
    timeout: 10000,
    submitSelectors: [
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'button[type="submit"]',
      'button:has(svg)',
      '[data-testid="fruitjuice-send-button"]'
    ],
    submitMethod: 'button',
    waitAfterInput: 300,
    insertMethod: 'value' // value/textContentを使用
  },
  gemini: {
    name: 'Gemini',
    urlPattern: 'gemini.google.com',
    selectors: [
      'rich-textarea .ql-editor[contenteditable="true"]',
      '.ql-editor[contenteditable="true"]',
      'div[contenteditable="true"]',
      'textarea',
      'div[role="textbox"]'
    ],
    timeout: 10000,
    submitSelectors: [
      'button[aria-label*="送信"]',
      'button[aria-label*="Send"]',
      'button.send-button',
      'button[type="submit"]',
      'button:has(svg)',
      '[mattooltip*="送信"]'
    ],
    submitMethod: 'button',
    waitAfterInput: 300,
    insertMethod: 'innerHTML' // innerHTMLを使用
  }
};

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

    // URL パターンに基づいてAIタイプを判定
    let aiType = null;
    for (const [type, config] of Object.entries(AI_CONFIGS)) {
      if (currentUrl.includes(config.urlPattern)) {
        aiType = type;
        break;
      }
    }

    if (aiType) {
      await inputToAI(aiType, pendingCleanupText, {
        promptType: pendingPromptType || 'cleanup',
        autoSubmit: pendingAutoSubmit || false
      });
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

// 統合されたAI入力関数 (Strategy パターン)
async function inputToAI(aiType, text, options = {}) {
  const config = AI_CONFIGS[aiType];
  if (!config) {
    console.error(`[PeekPanel] Unsupported AI type: ${aiType}`);
    return;
  }

  const { promptType = 'cleanup', autoSubmit = false } = options;
  const prompt = generatePrompt(text, promptType);

  // 要素待機
  let textarea = null;
  for (const selector of config.selectors) {
    textarea = await waitForElement(selector, config.timeout);
    if (textarea) {
      break;
    }
  }

  if (!textarea) {
    console.warn(`[PeekPanel] ${config.name}の入力欄が見つかりませんでした`);
    return;
  }

  // フォーカス設定
  textarea.focus();
  await sleep(100);

  // テキスト挿入（AI別の方法を使用）
  await insertText(textarea, prompt, config.insertMethod);

  // イベント発火
  dispatchInputEvents(textarea);

  // 自動送信
  if (autoSubmit) {
    await sleep(config.waitAfterInput);
    await submitPrompt(textarea, config);
  }
}

// テキスト挿入処理（AIごとの方法）
async function insertText(element, text, method) {
  if (method === 'execCommand') {
    // Claude用: execCommandを使用
    element.focus();

    // 既存のコンテンツをクリア
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);

    // テキストを挿入（改行も正しく処理される）
    document.execCommand('insertText', false, text);

    // バックアップ方法：execCommandが失敗した場合
    if (!element.textContent || element.textContent.trim() === '') {
      element.textContent = text;

      // InputEventを発火
      const inputEvent = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text
      });
      element.dispatchEvent(inputEvent);
    }
  } else if (method === 'value') {
    // ChatGPT用: value/textContentを使用
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      element.value = text;
    } else if (element.contentEditable === 'true') {
      element.textContent = text;
    }
  } else if (method === 'innerHTML') {
    // Gemini用: innerHTMLを使用（pタグで囲む）
    if (element.tagName === 'TEXTAREA') {
      element.value = text;
    } else {
      const p = document.createElement('p');
      p.textContent = text;
      element.innerHTML = '';
      element.appendChild(p);
    }
  }
}

// 入力イベントを発火
function dispatchInputEvents(element) {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

// 送信処理（AIごとの方法）
async function submitPrompt(element, config) {
  if (config.submitMethod === 'keyboard') {
    // Claude用: Cmd+Enter / Ctrl+Enter
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

    element.dispatchEvent(enterEvent);

    // バックアップ: キーイベントで送信できなかった場合、ボタンを探す
    await sleep(300);

    const parentForm = element.closest('form') || element.closest('[class*="composer"]') || document;
    for (const selector of config.submitSelectors) {
      const submitButton = parentForm.querySelector(selector);
      if (submitButton && !submitButton.disabled && submitButton.offsetParent !== null) {
        submitButton.click();
        break;
      }
    }
  } else {
    // ボタンクリック送信（ChatGPT, Gemini）
    for (const selector of config.submitSelectors) {
      const submitButton = document.querySelector(selector);
      if (submitButton && !submitButton.disabled) {
        submitButton.click();
        break;
      }
    }
  }
}

// スリープユーティリティ
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 要素が表示されるまで待機するヘルパー関数
// パフォーマンス最適化: より限定的なスコープで監視
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

    // より限定的なスコープで監視（パフォーマンス最適化）
    // 一般的なメインコンテンツコンテナを優先的に使用
    const targetNode =
      document.querySelector('#main-content') ||
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.body;

    observer.observe(targetNode, {
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

// 後方互換性のために旧関数名を残す（将来的に削除可能）
async function inputToClaude(text, promptType = 'cleanup', autoSubmit = false) {
  return await inputToAI('claude', text, { promptType, autoSubmit });
}

async function inputToChatGPT(text, promptType = 'cleanup', autoSubmit = false) {
  return await inputToAI('chatgpt', text, { promptType, autoSubmit });
}

async function inputToGemini(text, promptType = 'cleanup', autoSubmit = false) {
  return await inputToAI('gemini', text, { promptType, autoSubmit });
}
