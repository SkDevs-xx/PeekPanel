import { DEFAULT_PROMPTS, AI_URLS } from './config/constants.js';

// 拡張機能アイコンクリックでサイドパネルを開く
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// インストール時にコンテキストメニューを作成
chrome.runtime.onInstalled.addListener(async () => {
  // 既存のメニューをすべて削除
  chrome.contextMenus.removeAll();

  // ページ右クリックメニュー（リンクタグ以外）
  chrome.contextMenus.create({
    id: 'openInSubPanel',
    title: 'Open PeekPanel',
    contexts: ['page'], // リンクタグは除外、ページのみ
    documentUrlPatterns: ['http://*/*', 'https://*/*'] // 拡張機能内では非表示
  });

  // カスタムプロンプトメニューを作成
  await createPromptMenus();
});

// カスタムプロンプトのコンテキストメニューを作成
async function createPromptMenus() {
  const { customPrompts, disabledDefaultPrompts } = await chrome.storage.sync.get({
    customPrompts: [],
    disabledDefaultPrompts: []
  });

  // デフォルトプロンプト
  const defaultPrompts = DEFAULT_PROMPTS.filter(p => !disabledDefaultPrompts.includes(p.id));

  // 有効なカスタムプロンプト
  const enabledCustomPrompts = customPrompts.filter(p => p.enabled);

  // 全プロンプトを結合
  const allPrompts = [...defaultPrompts, ...enabledCustomPrompts];

  // 各プロンプトのメニューを作成（awaitで完了を保証）
  for (const prompt of allPrompts) {
    await chrome.contextMenus.create({
      id: `prompt-${prompt.id}`,
      title: prompt.name,
      contexts: ['selection']
    });
  }
}

// コンテキストメニューがクリックされた時
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // カスタムプロンプトの処理
  if (info.menuItemId.startsWith('prompt-')) {
    const promptId = info.menuItemId.replace('prompt-', '');

    // サブパネルを開く
    await chrome.sidePanel.open({ windowId: tab.windowId });

    try {
      // プロンプトデータを取得
      const { customPrompts, disabledDefaultPrompts, cleanupAI, autoSubmit } = await chrome.storage.sync.get({
        customPrompts: [],
        disabledDefaultPrompts: [],
        cleanupAI: 'claude',
        autoSubmit: false
      });

      const defaultPrompts = DEFAULT_PROMPTS.filter(p => !disabledDefaultPrompts.includes(p.id));
      const allPrompts = [...defaultPrompts, ...customPrompts];
      const prompt = allPrompts.find(p => p.id === promptId);

      if (!prompt) {
        console.error('[PeekPanel] Prompt not found:', promptId);
        return;
      }

      // プロンプトを生成（{text}を選択テキストに置換）
      const finalPrompt = prompt.prompt.replace(/{text}/g, info.selectionText);

      try {
        await chrome.storage.local.set({
          pendingUrl: AI_URLS[cleanupAI],
          pendingCleanupText: finalPrompt,
          pendingPromptType: 'custom',
          pendingAutoSubmit: autoSubmit,
          pendingAIType: cleanupAI
        });
      } catch (storageError) {
        console.error('[PeekPanel] Failed to save to storage:', storageError);
        // ストレージクォータ超過の場合
        if (storageError.message?.includes('QUOTA')) {
          console.error('[PeekPanel] Storage quota exceeded. Please clear some data.');
        }
      }
    } catch (error) {
      console.error('[PeekPanel] Failed to process custom prompt:', error);
    }

    return;
  }

  // ページ右クリック時の処理（「サブパネルで開く」）
  if (info.menuItemId === 'openInSubPanel') {
    // Peekpanel内のiframeからのクリックの場合は何もしない
    // frameId !== 0 かつ pageUrl が Peekpanel のメインページの場合
    const extensionId = chrome.runtime.id;
    const isPeekPanelIframe = info.frameId && info.frameId !== 0 &&
      info.pageUrl &&
      info.pageUrl.startsWith(`chrome-extension://${extensionId}/pages/main.html`);

    if (isPeekPanelIframe) {
      console.log('[PeekPanel] Context menu clicked from PeekPanel iframe, ignoring');
      return;
    }

    const url = info.pageUrl;

    if (url) {
      // サブパネルを開く
      await chrome.sidePanel.open({ windowId: tab.windowId });

      // URLをストレージに保存（panel.jsで読み取る）
      await chrome.storage.local.set({ pendingUrl: url });

      // ページ全体を右クリックした場合は元のタブを閉じる（移動）
      // 最後の1つのタブの場合、新しいタブを作成してから閉じる
      const tabsInWindow = await chrome.tabs.query({ windowId: tab.windowId });

      if (tabsInWindow.length === 1) {
        // 最後の1つの場合、新しいタブを作成
        await chrome.tabs.create({ windowId: tab.windowId, url: 'chrome://newtab' });
      }

      // 元のタブを閉じる
      await chrome.tabs.remove(tab.id);
    }
  }
});

// カスタムプロンプトが変更されたらメニューを再生成
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'sync' && (changes.customPrompts || changes.disabledDefaultPrompts)) {
    // メニューを再生成（async/awaitで順序を保証）
    await chrome.contextMenus.removeAll();
    // ページ右クリックメニュー（リンクタグ以外）
    chrome.contextMenus.create({
      id: 'openInSubPanel',
      title: 'Open PeekPanel',
      contexts: ['page'] // リンクタグは除外、ページのみ
    });
    // カスタムプロンプトメニューを作成
    await createPromptMenus();
  }
});
