// 新しいモジュールをインポート
import { DEFAULT_AIS } from './config/constants.js';
import { StorageManager } from './storage/storageManager.js';
import { TabManager } from './tabs/tabManager.js';
import { TabGroupManager } from './tabs/tabGroups.js';
import { TabHistory } from './tabs/tabHistory.js';
import { TabUI } from './ui/tabUI.js';
import { GroupUI } from './ui/groupUI.js';
import { NavigationUI } from './ui/navigationUI.js';
import { ContextMenu } from './ui/contextMenu.js';
import { DragDropHandler } from './ui/dragDrop.js';
import { ModalManager } from './ui/modalManager.js';
import { ErrorManager } from './ui/errorManager.js';
import { IframeManager } from './ui/iframeManager.js';
import { normalizeUrl } from './utils/urlHelper.js';

// グローバルインスタンス（init関数内で初期化）
let tabManager;
let groupManager;
let tabHistory;
let tabUI;
let groupUI;
let navigationUI;
let contextMenu;
let dragDropHandler;
let modalManager;
let errorManager;
let iframeManager;

// ヘッダー除去設定
async function setupHeaderRemoval() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          { header: "x-frame-options", operation: "remove" },
          { header: "content-security-policy", operation: "remove" }
        ]
      },
      condition: {
        urlFilter: "*",
        resourceTypes: ["sub_frame"]
      }
    }]
  });
}

// URLを遷移
function navigateToUrl(url) {
  const tab = tabManager.getTab(tabManager.currentTabId);
  if (!tab) return;

  try {
    // URLの正規化
    url = normalizeUrl(url);

    const iframe = document.getElementById(tabManager.currentTabId);
    if (!iframe) return;

    iframe.src = url;

    // TabManagerを使って履歴を更新
    tabManager.updateTabUrl(tabManager.currentTabId, url);
  } catch (e) {
    console.error('Navigation error:', e);
  }
}

// リロード
function reload() {
  const iframe = document.getElementById(tabManager.currentTabId);
  if (iframe) {
    iframe.src = iframe.src;
  }
}
// メインブラウザに送信
async function sendTabToMainBrowser(tabId) {
  const tab = tabManager.getTab(tabId);
  if (!tab) return;

  // 内部ページは送信できない
  if (tab.isInternal) {
    console.warn('[PeekPanel] Cannot send internal pages to main browser');
    return;
  }

  try {
    await chrome.tabs.create({ url: tab.url });
    // サブブラウザからタブを削除
    tabManager.closeTab(tabId);
  } catch (error) {
    console.error('[PeekPanel] Failed to send tab to main browser:', error);
  }
}

// 初期化関数
async function init() {
  // ヘッダー削除設定
  await setupHeaderRemoval();

  // ストレージマネージャーを作成
  const storage = new StorageManager();

  // 履歴管理を作成
  tabHistory = new TabHistory(storage);
  await tabHistory.init();

  // タブマネージャーを作成（まだinit()は呼ばない）
  tabManager = new TabManager(storage, tabHistory);

  // グループマネージャーを作成（まだinit()は呼ばない）
  groupManager = new TabGroupManager(storage, tabManager);

  // ドラッグ&ドロップハンドラーを作成
  dragDropHandler = new DragDropHandler(tabManager, null, {
    onRebuildTabBar: () => tabUI.rebuildTabBar(groupUI),
    onSave: () => tabManager.save(),
    onUpdateTabsOrder: (tabs) => { tabManager.tabs = tabs; }
  });

  // TabUIを作成（イベントリスナーは後で設定）
  tabUI = new TabUI(tabManager, {
    onTabClick: (tabId) => tabManager.switchTab(tabId),
    onTabMiddleClick: (tabId) => tabManager.closeTab(tabId),
    onSetupDragDrop: (el) => dragDropHandler.setupTabDragDrop(el),
    onTabContextMenu: (tabId, x, y) => contextMenu.showTabContextMenu(tabId, x, y)
  });

  // GroupUIを作成
  groupUI = new GroupUI(groupManager, {
    onGroupHeaderClick: (groupId) => groupManager.toggleGroupCollapse(groupId),
    onGroupContextMenu: (groupId, x, y) => contextMenu.showGroupManagementMenu(groupId, x, y),
    onSetupGroupHeaderDragDrop: (el) => dragDropHandler.setupGroupHeaderDragDrop(el),
    onSetupGroupContainerDragDrop: (el) => dragDropHandler.setupGroupContainerDragDrop(el)
  });

  // DragDropHandlerにGroupUIを設定
  dragDropHandler.groupUI = groupUI;

  // NavigationUIを作成
  navigationUI = new NavigationUI(tabManager, {
    onBackClick: () => {
      const tab = tabManager.getCurrentTab();
      if (!tab) return;

      // 履歴ナビゲーション中フラグを設定
      tab.isNavigatingHistory = true;

      const success = tabManager.goBack(tabManager.currentTabId);
      if (success) {
        const iframe = document.getElementById(tabManager.currentTabId);
        if (iframe && tab) {
          iframe.src = tab.url;

          // 少し後にフラグをリセット
          setTimeout(() => {
            tab.isNavigatingHistory = false;
          }, 500);
        }
      } else {
        tab.isNavigatingHistory = false;
      }
    },
    onForwardClick: () => {
      const tab = tabManager.getCurrentTab();
      if (!tab) return;

      // 履歴ナビゲーション中フラグを設定
      tab.isNavigatingHistory = true;

      const success = tabManager.goForward(tabManager.currentTabId);
      if (success) {
        const iframe = document.getElementById(tabManager.currentTabId);
        if (iframe && tab) {
          iframe.src = tab.url;

          // 少し後にフラグをリセット
          setTimeout(() => {
            tab.isNavigatingHistory = false;
          }, 500);
        }
      } else {
        tab.isNavigatingHistory = false;
      }
    },
    onReloadClick: () => reload(),
    onNavigateToUrl: (url) => navigateToUrl(url),
    onNewTabClick: () => {
      tabManager.createTab('https://www.google.com', true);
    }
  });

  // ModalManagerを作成（ContextMenuで使用するため先に初期化）
  modalManager = new ModalManager(groupManager, tabUI, groupUI);

  // ErrorManagerを作成
  errorManager = new ErrorManager(tabManager, tabUI);

  // IframeManagerを作成
  iframeManager = new IframeManager(tabManager, tabUI, errorManager);

  // ContextMenuを作成
  contextMenu = new ContextMenu(tabManager, groupManager, {
    // タブメニュー
    onTogglePin: (tabId) => tabManager.togglePinTab(tabId),
    onToggleMute: (tabId) => {
      tabManager.toggleMuteTab(tabId);
      // iframe内のメディアをミュート/ミュート解除
      const tab = tabManager.getTab(tabId);
      const iframe = document.getElementById(tabId);
      if (iframe && iframe.contentWindow && tab) {
        // content-script.jsにpostMessageを送信
        const messageType = tab.isMuted ? 'muteMedia' : 'unmuteMedia';
        iframe.contentWindow.postMessage({ type: messageType }, '*');
      }
    },
    onDuplicateTab: (tabId) => {
      tabManager.duplicateTab(tabId);
    },
    onSendToMainBrowser: (tabId) => sendTabToMainBrowser(tabId),
    onCloseTab: (tabId) => tabManager.closeTab(tabId),

    // グループメニュー
    onAddTabToGroup: (tabId, groupId) => {
      groupManager.addTabToGroup(tabId, groupId);
      tabUI.rebuildTabBar(groupUI);
    },
    onRemoveTabFromGroup: (tabId) => {
      groupManager.removeTabFromGroup(tabId);
      tabUI.rebuildTabBar(groupUI);
    },
    onCreateNewGroup: (tabId) => modalManager.showCreateGroupModal(tabId),
    onRenameGroup: (groupId, newName) => groupManager.renameTabGroup(groupId, newName),
    onChangeGroupColor: (groupId, colorId) => groupManager.changeGroupColor(groupId, colorId),
    onToggleGroupCollapse: (groupId) => groupManager.toggleGroupCollapse(groupId),
    onUngroupTabs: (groupId, tabCount) => modalManager.showUngroupDialog(groupId, tabCount),
    onDeleteGroup: (groupId, tabCount) => modalManager.showDeleteGroupDialog(groupId, tabCount)
  });

  // TabManagerのイベントを購読してiframeを作成
  tabManager.on('tabCreated', ({ tabId, tabData, isActive, isInternal }) => {
    iframeManager.createIframeForTab(tabId, tabData.url, isActive, isInternal);
  });

  // タブ切り替え時にiframeを表示/非表示
  tabManager.on('tabSwitched', ({ tabId }) => {
    // すべてのiframeを非表示
    document.querySelectorAll('#iframeContainer iframe').forEach(iframe => {
      iframe.style.display = 'none';
    });

    // アクティブなiframeを表示
    const iframe = document.getElementById(tabId);
    if (iframe) {
      iframe.style.display = 'block';

      // 遅延読み込み対応
      const tab = tabManager.getTab(tabId);
      if (tab && tab.needsLoad && !tab.isLoaded && iframe.src === '') {
        iframe.src = tab.url;
        tab.needsLoad = false;
      }
    }

    // エラーオーバーレイを表示/非表示
    const iframeContainer = document.getElementById('iframeContainer');
    const overlay = iframeContainer.querySelector('.error-overlay');
    const tab = tabManager.getTab(tabId);

    if (overlay) {
      if (tab && tab.hasError) {
        overlay.style.display = 'flex';
      } else {
        overlay.style.display = 'none';
      }
    } else if (tab && tab.hasError) {
      errorManager.showErrorOverlay(tabId);
    }
  });

  // タブ削除時にiframeを削除
  tabManager.on('tabClosed', ({ tabId }) => {
    const iframe = document.getElementById(tabId);
    if (iframe && iframe.parentNode) {
      // メモリリーク対策: iframeのリソースを解放
      iframe.src = 'about:blank';

      // 少し待ってから削除（リソースの完全な解放を待つ）
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 0);
    }
  });

  // タブスリープ時にiframeをアンロード
  tabManager.on('tabSlept', ({ tabId }) => {
    const iframe = document.getElementById(tabId);
    const tab = tabManager.getTab(tabId);
    if (iframe && tab) {
      // URLを保存してからiframeをアンロード
      tab.sleepUrl = iframe.src;
      iframe.src = 'about:blank';
      console.log('[PeekPanel] Tab slept:', tabId);
    }
  });

  // タブ復帰時にiframeを再ロード
  tabManager.on('tabWoke', ({ tabId, tabData }) => {
    const iframe = document.getElementById(tabId);
    if (iframe && tabData && tabData.sleepUrl) {
      iframe.src = tabData.sleepUrl;
      delete tabData.sleepUrl;
      console.log('[PeekPanel] Tab woke:', tabId);
    } else if (iframe && tabData && tabData.url) {
      iframe.src = tabData.url;
      console.log('[PeekPanel] Tab woke with current URL:', tabId);
    }
  });

  // TabManagerとGroupManagerを初期化（イベントハンドラー登録後）
  await tabManager.init();
  await groupManager.init();

  // 初期タブを作成（tabCreatedイベントで自動的にiframeも作成される）
  if (tabManager.getAllTabs().length === 0) {
    DEFAULT_AIS.forEach((ai, index) => {
      tabManager.createTab(ai.url, index === 0);
    });
  }

  // 既存のタブをレンダリング（init()でイベントリスナー設定済み）
  tabUI.init();

  // タブバーを再構築（グループを含む）
  tabUI.rebuildTabBar(groupUI);

  // 現在のタブに切り替え
  if (tabManager.currentTabId) {
    const iframe = document.getElementById(tabManager.currentTabId);
    if (iframe) {
      iframe.style.display = 'block';
    }
  }



  // メインブラウザで開くボタン
  document.getElementById('sendToMainBrowser').addEventListener('click', () => {
    const currentTabId = tabManager.currentTabId;
    if (currentTabId) {
      sendTabToMainBrowser(currentTabId);
    }
  });

  // 履歴ボタン（まだ実装されていない場合）
  const historyButton = document.getElementById('historyButton');
  if (historyButton) {
    historyButton.addEventListener('click', () => {
      const historyUrl = chrome.runtime.getURL('pages/history.html');

      // 既に開いている履歴タブを探す
      const existingTab = tabManager.getAllTabs().find(t => t.isInternal && t.url.includes('history.html'));

      if (existingTab) {
        tabManager.switchTab(existingTab.id);
      } else {
        tabManager.createTab(historyUrl, true, true);
      }
    });
  }

  // 設定ボタン
  const settingsButton = document.getElementById('settingsButton');
  if (settingsButton) {
    settingsButton.addEventListener('click', () => {
      const settingsUrl = chrome.runtime.getURL('pages/settings.html');

      // 既に開いている設定タブを探す
      const existingTab = tabManager.getAllTabs().find(t => t.isInternal && t.url.includes('settings.html'));

      if (existingTab) {
        tabManager.switchTab(existingTab.id);
      } else {
        tabManager.createTab(settingsUrl, true, true);
      }
    });
  }

  // chrome.storageの変更を監視
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.pendingUrl) {
      const url = changes.pendingUrl.newValue;
      if (url) {
        tabManager.createTab(url, true);
        chrome.storage.local.remove('pendingUrl');
      }
    }
  });

  // 初期化時に既存のpendingUrlをチェック（サイドパネル起動前に設定された場合に対応）
  const { pendingUrl } = await chrome.storage.local.get(['pendingUrl']);
  if (pendingUrl) {
    tabManager.createTab(pendingUrl, true);
    // pendingUrlのみ削除し、pendingCleanupText等はai-auto-input.jsのために残す
    chrome.storage.local.remove(['pendingUrl']);
  }

  // グローバル変数（カスタムコンテキストメニュー用）
  let selectedTextForSearch = '';

  // history.html、settings.html、およびiframe内からのメッセージを受信
  window.addEventListener('message', async (event) => {
    if (event.data.type === 'closeSettings') {
      // 設定ページを閉じる
      const settingsTab = tabManager.getAllTabs().find(t => t.isInternal && t.url.includes('settings.html'));
      if (settingsTab) {
        tabManager.closeTab(settingsTab.id);
      }
    } else if (event.data.type === 'closeHistory') {
      // 履歴ページを閉じる
      const historyTab = tabManager.getAllTabs().find(t => t.isInternal && t.url.includes('history.html'));
      if (historyTab) {
        tabManager.closeTab(historyTab.id);
      }
    } else if (event.data.type === 'openHistory') {
      // 設定ページから履歴ページを開く
      const historyUrl = chrome.runtime.getURL('pages/history.html');

      // 既に開いている履歴タブを探す
      const existingTab = tabManager.getAllTabs().find(t => t.isInternal && t.url.includes('history.html'));

      if (existingTab) {
        tabManager.switchTab(existingTab.id);
      } else {
        tabManager.createTab(historyUrl, true, true);
      }
    } else if (event.data.type === 'restoreTab') {
      const { tabData, index } = event.data;

      // 履歴から削除
      tabHistory.removeFromHistory(index);

      // タブを復元
      const tabId = tabManager.createTab(tabData.url, true);

      const tab = tabManager.getTab(tabId);
      if (tab && tabData.history) {
        tab.history = [...tabData.history];
        tab.historyIndex = tabData.historyIndex || 0;
        tabManager.save();
      }
    } else if (event.data.type === 'showCustomContextMenu') {
      // カスタムコンテキストメニューを表示
      selectedTextForSearch = event.data.text;
      const menu = document.getElementById('customContextMenu');
      menu.style.display = 'block';
      menu.style.left = `${event.data.x}px`;
      menu.style.top = `${event.data.y}px`;
    } else if (event.data.type === 'hideCustomContextMenu') {
      // カスタムコンテキストメニューを非表示
      document.getElementById('customContextMenu').style.display = 'none';
    } else if (event.data.type === 'closeContextMenu') {
      // タブコンテキストメニューを閉じる（iframe内クリック時）
      contextMenu.closeMenu();
      // タブグループも閉じる
      groupManager.closeAllGroups();
    } else if (event.data.type === 'updatePageTitle') {
      // ページタイトルとURLを更新（iframe内からの通知）
      if (event.data.url && event.data.title) {
        const sourceIframe = event.source;
        if (!sourceIframe) return;

        // 送信元iframeに対応するタブを見つける
        const sourceTab = tabManager.getAllTabs().find(t => {
          const iframe = document.getElementById(t.id);
          return iframe && iframe.contentWindow === sourceIframe;
        });

        if (!sourceTab || sourceTab.isInternal) return;

        const newUrl = event.data.url;

        // 履歴ナビゲーション中は履歴更新をスキップ
        if (sourceTab.isNavigatingHistory) {
          sourceTab.title = event.data.title;
          tabManager.updateTabTitle(sourceTab.id, event.data.title);
          return;
        }

        // 履歴が空の場合は初期URLを追加
        if (sourceTab.history.length === 0) {
          tabManager.updateTabUrl(sourceTab.id, newUrl);
        }
        // URLが変わった場合は履歴に追加
        else if (sourceTab.url !== newUrl) {
          const lastUrl = sourceTab.history[sourceTab.historyIndex];
          const normalizedLast = normalizeUrl(lastUrl);
          const normalizedNew = normalizeUrl(newUrl);

          if (normalizedLast !== normalizedNew) {
            tabManager.updateTabUrl(sourceTab.id, newUrl);
          }
        }

        // タイトルを更新
        tabManager.updateTabTitle(sourceTab.id, event.data.title);
      }
    }
  });

  // カスタムコンテキストメニューのGoogle検索
  document.getElementById('searchGoogleItem').addEventListener('click', () => {
    if (selectedTextForSearch) {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(selectedTextForSearch)}`;
      tabManager.createTab(searchUrl, true);
      document.getElementById('customContextMenu').style.display = 'none';
    }
  });

  // カスタムコンテキストメニューをホバー時の色変更
  document.getElementById('searchGoogleItem').addEventListener('mouseenter', (e) => {
    e.currentTarget.style.background = 'var(--hover-bg)';
  });
  document.getElementById('searchGoogleItem').addEventListener('mouseleave', (e) => {
    e.currentTarget.style.background = 'transparent';
  });

  // 他の場所をクリックしたらメニューを閉じる
  document.addEventListener('click', () => {
    document.getElementById('customContextMenu').style.display = 'none';
  });

  // AI選択プルダウンを初期化
  function initAIDropdown() {
    const dropdown = document.getElementById('ai-selector-dropdown');
    if (!dropdown) return;

    // DEFAULT_AISからoptionタグを生成
    DEFAULT_AIS.forEach(ai => {
      const option = document.createElement('option');
      option.value = ai.id;
      // 最初の文字を大文字にして表示名を生成
      option.textContent = ai.id.charAt(0).toUpperCase() + ai.id.slice(1);
      dropdown.appendChild(option);
    });
  }

  // AI選択を読み込み
  async function loadAISelection() {
    try {
      if (!chrome.runtime?.id) return;

      const { cleanupAI } = await chrome.storage.sync.get({
        cleanupAI: 'claude'
      });

      // プルダウンの値を設定
      const dropdown = document.getElementById('ai-selector-dropdown');
      if (dropdown) {
        dropdown.value = cleanupAI;
      }
    } catch (error) {
      if (!error.message?.includes('Extension context invalidated')) {
        console.error('[PeekPanel] Error loading AI selection:', error);
      }
    }
  }

  // AI選択を保存
  async function saveAISelection(selectedAI) {
    try {
      if (!chrome.runtime?.id) return;

      await chrome.storage.sync.set({
        cleanupAI: selectedAI
      });
    } catch (error) {
      if (!error.message?.includes('Extension context invalidated')) {
        console.error('[PeekPanel] Error saving AI selection:', error);
      }
    }
  }

  // AI選択プルダウンを初期化
  initAIDropdown();

  // AI選択のイベントリスナー
  const aiDropdown = document.getElementById('ai-selector-dropdown');
  if (aiDropdown) {
    aiDropdown.addEventListener('change', (e) => {
      saveAISelection(e.target.value);
    });
  }

  // AI選択を読み込み
  loadAISelection();

  // 自動スリープのチェック（1分ごと）
  setInterval(() => {
    tabManager.checkAndSleepTabs();
  }, 60000);
}

// 初期化を実行
init().catch(console.error);
