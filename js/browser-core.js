// Module imports
import { DEFAULT_AIS, TIMINGS } from './config/constants.js';
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
import { BookmarkManager } from './ui/bookmarkManager.js';
import { normalizeUrl } from './utils/urlHelper.js';
// Extracted modules
import { syncHeaderRules, onTabUrlChanged, onTabRemoved } from './core/headerRuleManager.js';
import { setupMessageHandlers } from './core/messageHandler.js';
import { setupAIDropdown } from './core/aiDropdown.js';

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
let bookmarkManager;
let autoSleepInterval = null;
let previousActiveIframeId = null;

// O(1) tab lookup by contentWindow — avoids getAllTabs().find() on every message
const iframeWindowToTabId = new Map();

function registerIframeWindow(tabId) {
  const iframe = document.getElementById(tabId);
  if (iframe?.contentWindow) {
    iframeWindowToTabId.set(iframe.contentWindow, tabId);
  }
}

function unregisterIframeWindow(tabId) {
  const iframe = document.getElementById(tabId);
  if (iframe?.contentWindow) {
    iframeWindowToTabId.delete(iframe.contentWindow);
  }
}

function findTabByWindow(sourceWindow) {
  const tabId = iframeWindowToTabId.get(sourceWindow);
  return tabId ? tabManager.getTab(tabId) : null;
}

// URLを遷移
function navigateToUrl(url) {
  const tab = tabManager.getTab(tabManager.currentTabId);
  if (!tab) return;

  try {
    // URLの正規化
    url = normalizeUrl(url);

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        console.warn('[PeekPanel] Blocked navigation to unsafe protocol:', parsed.protocol);
        return;
      }
    } catch { /* normalizeUrl already handles invalid URLs */ }

    const iframe = document.getElementById(tabManager.currentTabId);
    if (!iframe) return;

    onTabUrlChanged(url); // Add CSP rule for new domain before navigation
    iframe.src = url;

    // TabManagerを使って履歴を更新
    tabManager.updateTabUrl(tabManager.currentTabId, url);
  } catch (e) {
    console.error('Navigation error:', e);
  }
}

// リロード
function reload() {
  const tab = tabManager.getCurrentTab();
  const iframe = document.getElementById(tabManager.currentTabId);
  if (iframe && tab) {
    // タブに保存された現在のURLを使用（iframe.srcは初期URLの可能性がある）
    iframe.src = tab.url;
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

// マネージャーを初期化
async function initManagers() {
  // Note: header rules synced after tabManager init (syncHeaderRules)

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
  dragDropHandler.setGroupManager(groupManager);

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

          // 連続クリック時に前のタイムアウトをキャンセルしてからリセット（デバウンス）
          if (tab._navHistoryTimeout) clearTimeout(tab._navHistoryTimeout);
          tab._navHistoryTimeout = setTimeout(() => {
            tab.isNavigatingHistory = false;
            tab._navHistoryTimeout = null;
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

          // 連続クリック時に前のタイムアウトをキャンセルしてからリセット（デバウンス）
          if (tab._navHistoryTimeout) clearTimeout(tab._navHistoryTimeout);
          tab._navHistoryTimeout = setTimeout(() => {
            tab.isNavigatingHistory = false;
            tab._navHistoryTimeout = null;
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

  // BookmarkManagerを作成
  bookmarkManager = new BookmarkManager(storage, tabManager, {
    onBookmarkAdded: (bookmark) => {
      console.log('[PeekPanel] Bookmark added:', bookmark.title);
    },
    onBookmarkClick: (bookmark) => {
      // ブックマークをクリックしたら新規タブで開く
      tabManager.createTab(bookmark.url, true);
    }
  });

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
        // content-script.jsにpostMessageを送信（targetOriginをiframeのオリジンに限定）
        const messageType = tab.isMuted ? 'muteMedia' : 'unmuteMedia';
        let targetOrigin;
        try {
          targetOrigin = new URL(tab.url).origin;
        } catch (e) {
          // URLが無効な場合は送信しない（'*'へのフォールバックはセキュリティリスクのため使用しない）
          console.warn('[PeekPanel] Invalid tab URL, cannot send mute message:', tab.url);
          return;
        }
        iframe.contentWindow.postMessage({ type: messageType }, targetOrigin);
      }
    },
    onDuplicateTab: (tabId) => {
      tabManager.duplicateTab(tabId);
    },
    onSendToMainBrowser: (tabId) => sendTabToMainBrowser(tabId),
    onCloseTab: (tabId) => tabManager.closeTab(tabId),
    onAddToBookmark: (tabId) => bookmarkManager.addTabToBookmark(tabId),

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
}

// TabManagerのイベントハンドラーを設定
function setupTabManagerEvents() {
  // TabManagerのイベントを購読してiframeを作成
  tabManager.on('tabCreated', ({ tabId, tabData, isActive, isInternal }) => {
    const iframe = iframeManager.createIframeForTab(tabId, tabData.url, isActive, isInternal);
    onTabUrlChanged(tabData.url); // Add CSP rule for new tab's domain

    // After each navigation (including redirects), ensure CSP rule covers the final URL
    // Also register contentWindow for O(1) tab lookup
    iframe.addEventListener('load', () => {
      registerIframeWindow(tabId);
      try {
        const currentUrl = iframe.contentWindow?.location.href;
        if (currentUrl && currentUrl !== 'about:blank') {
          onTabUrlChanged(currentUrl);
        }
      } catch (e) {
        // Cross-origin: cannot access contentWindow.location; tab.url is used instead
      }
    });
  });

  // タブ切り替え時にiframeを表示/非表示
  tabManager.on('tabSwitched', ({ tabId }) => {
    // 前のアクティブiframeのみを非表示（全件走査を避けてパフォーマンス改善）
    if (previousActiveIframeId && previousActiveIframeId !== tabId) {
      const prevIframe = document.getElementById(previousActiveIframeId);
      if (prevIframe) {
        prevIframe.style.display = 'none';
      }
    }

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

    // 次回の切り替えのために現在のアクティブiframe IDを記録
    previousActiveIframeId = tabId;

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
    unregisterIframeWindow(tabId); // Remove from O(1) lookup map
    const tab = tabManager.getTab(tabId);
    if (tab) onTabRemoved(tab.url); // Remove CSP rule if domain no longer needed
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
}

// デフォルトAIタブを作成
async function initDefaultTabs() {
  // 初回起動時のみデフォルトAIグループとタブを作成
  const { defaultAIGroupCreated } = await chrome.storage.local.get('defaultAIGroupCreated');

  if (!defaultAIGroupCreated && tabManager.getAllTabs().length === 0) {
    // 1. デフォルトAIグループを作成
    const groupId = groupManager.createTabGroup('Default AI', 'blue');

    // 2. 4つのAIタブを作成し、グループに追加
    const createdTabIds = [];
    DEFAULT_AIS.forEach((ai, index) => {
      const tabId = tabManager.createTab(ai.url, index === 0);
      createdTabIds.push(tabId);

      // タブをグループに追加
      groupManager.addTabToGroup(tabId, groupId);
    });

    // 3. グループとタブを保存
    // groupManager.save()はcreateTabGroup/addTabToGroup内で自動的に行われるため不要
    await tabManager.save();

    // 4. 初回作成フラグを保存
    await chrome.storage.local.set({ defaultAIGroupCreated: true });

    console.log('[PeekPanel] Default AI group created with tabs:', createdTabIds);
  } else if (tabManager.getAllTabs().length === 0) {
    // デフォルトAIグループが既に作成済みだが、タブがない場合（通常はありえない）
    DEFAULT_AIS.forEach((ai, index) => {
      tabManager.createTab(ai.url, index === 0);
    });
  }
}

// UIボタンのイベントリスナーを設定
function setupUIEventListeners() {
  // メインブラウザで開くボタン
  document.getElementById('sendToMainBrowser').addEventListener('click', () => {
    const currentTabId = tabManager.currentTabId;
    if (currentTabId) {
      sendTabToMainBrowser(currentTabId);
    }
  });

  // 履歴ボタン
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

  // 他の場所をクリックしたらメニューを閉じる（メニュー内のクリックは除外）
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('customContextMenu');
    if (menu && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  // カスタムコンテキストメニューのGoogle検索
  const searchGoogleItem = document.getElementById('searchGoogleItem');
  if (searchGoogleItem) {
    searchGoogleItem.addEventListener('click', (e) => {
      e.stopPropagation(); // イベントのバブリングを停止
      const selectedTextForSearch = window._selectedTextForSearch || '';
      if (selectedTextForSearch) {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(selectedTextForSearch)}`;
        tabManager.createTab(searchUrl, true);
        const menu = document.getElementById('customContextMenu');
        if (menu) menu.style.display = 'none';
        window._selectedTextForSearch = ''; // 使用後にクリア
      }
    });

    // カスタムコンテキストメニューをホバー時の色変更
    searchGoogleItem.addEventListener('mouseenter', (e) => {
      e.currentTarget.style.background = 'var(--hover-bg)';
    });
    searchGoogleItem.addEventListener('mouseleave', (e) => {
      e.currentTarget.style.background = 'transparent';
    });
  }
}

// 初期化関数
async function init() {
  // マネージャーを初期化
  await initManagers();

  // TabManagerのイベントハンドラーを設定
  setupTabManagerEvents();

  // TabManagerとGroupManagerを初期化（イベントハンドラー登録後）
  await tabManager.init();
  await groupManager.init();

  // デフォルトAIタブを作成
  await initDefaultTabs();

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

  // UIイベントリスナーを設定
  setupUIEventListeners();

  // ブックマークマネージャーを初期化
  await bookmarkManager.init();

  // メッセージハンドラーを設定 (core/messageHandler.js)
  const msgState = setupMessageHandlers({
    tabManager, tabHistory, tabUI, navigationUI,
    contextMenu, groupManager, bookmarkManager,
    findTabByWindow
  });

  // 初期化時に既存のpendingUrlをチェック
  const { pendingUrl } = await chrome.storage.local.get(['pendingUrl']);
  if (pendingUrl && pendingUrl !== msgState.lastProcessedPendingUrl) {
    msgState.lastProcessedPendingUrl = pendingUrl;
    tabManager.createTab(pendingUrl, true);
    chrome.storage.local.remove(['pendingUrl']);
  }

  // Sync CSP header rules for currently open tab domains (core/headerRuleManager.js)
  await syncHeaderRules(tabManager);

  // AI選択プルダウンを初期化 (core/aiDropdown.js)
  setupAIDropdown();

  // 自動スリープのチェック（1分ごと）- 二重実行防止のため既存をクリア
  if (autoSleepInterval) clearInterval(autoSleepInterval);
  autoSleepInterval = setInterval(() => {
    tabManager.checkAndSleepTabs();
  }, TIMINGS.AUTO_SLEEP_CHECK_INTERVAL);
}

// 初期化を実行
init().catch(console.error);
