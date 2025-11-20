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
    insertMethod: 'prosemirror' // ProseMirror用メソッドを使用
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
      'rich-textarea .ql-editor[contenteditable="true"]',  // 最優先: 実際のDOM構造
      '.ql-editor[contenteditable="true"]',                // フォールバック
      'div[aria-label*="プロンプト"][contenteditable="true"]', // 日本語UI
      'div[contenteditable="true"][role="textbox"]'        // 一般的なパターン
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
  },
  grok: {
    name: 'Grok',
    urlPattern: 'grok.com',
    selectors: [
      'textarea',                           // 最優先: 最も確実
      'textarea[aria-label*="Grok"]',      // aria-label
      'div[contenteditable="true"]',
      'input[type="text"]'
    ],
    timeout: 8000,  // 3秒→8秒に延長（ページ読み込みを考慮）
    submitSelectors: [
      'button[type="submit"]',
      'button[aria-label*="Send"]',
      'button:has(svg)',
      'button.send-button'
    ],
    submitMethod: 'button',
    waitAfterInput: 300,
    insertMethod: 'value'
  }
};

(async function () {
  try {
    // 拡張機能のコンテキストが有効かチェック
    if (!chrome.runtime?.id) {
      return;
    }

    // ストレージから清書テキスト、プロンプトタイプ、自動送信フラグ、AIタイプを取得
    const { pendingCleanupText, pendingPromptType, pendingAutoSubmit, pendingAIType } = await chrome.storage.local.get([
      'pendingCleanupText',
      'pendingPromptType',
      'pendingAutoSubmit',
      'pendingAIType'
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

    console.log('[PeekPanel] Auto-input check:', {
      currentUrl,
      aiType,
      pendingAIType,
      pendingCleanupText: pendingCleanupText ? 'exists' : 'missing'
    });

    if (aiType) {
      // AIタイプが指定されている場合、一致しなければスキップ
      // ただし、Claudeのリダイレクト(/new -> /chat)などは同じ 'claude' タイプになるので問題ない
      if (pendingAIType && pendingAIType !== aiType) {
        console.log(`[PeekPanel] AI type mismatch: pending=${pendingAIType}, current=${aiType}`);
        return;
      }

      console.log('[PeekPanel] Starting auto-input for:', aiType);
      const success = await inputToAI(aiType, pendingCleanupText, {
        promptType: pendingPromptType || 'cleanup',
        autoSubmit: pendingAutoSubmit || false
      });

      // 成功した場合のみストレージから削除
      if (success && chrome.runtime?.id) {
        console.log('[PeekPanel] Auto-input successful, clearing storage');
        await chrome.storage.local.remove(['pendingCleanupText', 'pendingPromptType', 'pendingAutoSubmit', 'pendingAIType']);
      } else {
        console.log('[PeekPanel] Auto-input failed or pending, keeping storage');
      }
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
// 成功時はtrue、失敗時はfalseを返す
async function inputToAI(aiType, text, options = {}) {
  const config = AI_CONFIGS[aiType];
  if (!config) {
    console.error(`[PeekPanel] Unsupported AI type: ${aiType}`);
    return false;
  }

  const { promptType = 'cleanup', autoSubmit = false } = options;
  const prompt = generatePrompt(text, promptType);

  // 要素待機
  // 複数のセレクターを同時に監視して最初に見つかった要素を取得
  const textarea = await findFirstElement(config.selectors, config.timeout);

  if (!textarea) {
    console.warn(`[PeekPanel] ${config.name}の入力欄が見つかりませんでした`);
    return false; // 失敗
  }

  // フォーカス設定
  textarea.focus();

  // エディタが完全に初期化されるまで待機（Claudeなど重いエディタ用）
  const initWaitTime = aiType === 'claude' ? 2000 : 500;
  await sleep(initWaitTime);

  // テキスト挿入（AI別の方法を使用）
  await insertText(textarea, prompt, config.insertMethod);

  // イベント発火
  dispatchInputEvents(textarea);

  // 自動送信
  if (autoSubmit) {
    await sleep(config.waitAfterInput);
    await submitPrompt(textarea, config);
  }

  return true; // 成功
}

// テキスト挿入処理（AIごとの方法）
async function insertText(element, text, method) {
  if (method === 'execCommand') {
    // 旧Claude用: execCommandを使用（非推奨）
    element.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, text);
  } else if (method === 'prosemirror') {
    // 新Claude用: ProseMirror対応
    element.focus();

    // まず既存の内容をクリア
    element.innerHTML = '<p><br></p>';

    // execCommandでの挿入を試みる（これが最も自然）
    const success = document.execCommand('insertText', false, text);

    // 失敗した場合、または内容が空の場合は直接DOM操作
    if (!success || element.textContent.trim() === '') {
      // 改行を<br>に変換して挿入
      // ProseMirrorは<p>タグで囲むことを期待することが多い
      const lines = text.split('\n');
      element.innerHTML = '';

      lines.forEach((line, index) => {
        const p = document.createElement('p');
        p.textContent = line;
        element.appendChild(p);
      });
    }

    // 入力イベントを念入りに発火
    const inputEvent = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: text
    });
    element.dispatchEvent(inputEvent);
  } else if (method === 'value') {
    // ChatGPT/Grok/GenSpark用: value/textContentを使用
    element.focus();

    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      // React/Vue対応: ネイティブsetterを使用
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set || Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, text);
      } else {
        element.value = text;
      }

      // React/Vueが検知できるようにイベントを発火
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text
      }));
    } else if (element.contentEditable === 'true') {
      element.textContent = text;
      dispatchInputEvents(element);
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
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        clearTimeout(timeoutId);
        resolve(element);
      }
    });

    const targetNode = document.body;
    observer.observe(targetNode, { childList: true, subtree: true });

    const timeoutId = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// 複数のセレクターから最初に見つかった要素を返す（高速版）
async function findFirstElement(selectors, timeout = 5000) {
  // まず全てのセレクターで即座にチェック
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      console.log(`[PeekPanel] Element found immediately: ${selector}`);
      return element;
    }
  }

  // 見つからない場合は、全セレクターを同時に監視
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          console.log(`[PeekPanel] Element found via observer: ${selector}`);
          observer.disconnect();
          clearTimeout(timeoutId);
          resolve(element);
          return;
        }
      }
    });

    const targetNode = document.body;
    observer.observe(targetNode, { childList: true, subtree: true });

    const timeoutId = setTimeout(() => {
      observer.disconnect();
      console.log(`[PeekPanel] No elements found (timeout)`);
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
