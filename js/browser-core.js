// 新しいモジュールをインポート
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

// Dynamic CSP removal — only for domains currently open in PeekPanel tabs
const activeHeaderRules = new Map(); // domain -> ruleId
let nextSessionRuleId = 100; // Start high to avoid conflict with static rules

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function addHeaderRuleForDomain(domain) {
  if (!domain || activeHeaderRules.has(domain)) return;
  const ruleId = nextSessionRuleId++;
  activeHeaderRules.set(domain, ruleId);
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [{
        id: ruleId,
        priority: 1,
        action: {
          type: "modifyHeaders",
          responseHeaders: [
            { header: "x-frame-options", operation: "remove" },
            { header: "content-security-policy", operation: "remove" },
            { header: "content-security-policy-report-only", operation: "remove" },
            { header: "permissions-policy", operation: "remove" }
          ]
        },
        condition: {
          requestDomains: [domain],
          resourceTypes: ["sub_frame"]
        }
      }]
    });
  } catch (e) {
    console.error('[PeekPanel] Failed to add header rule for', domain, e);
    activeHeaderRules.delete(domain);
  }
}

async function removeHeaderRuleForDomain(domain) {
  if (!domain || !activeHeaderRules.has(domain)) return;
  const ruleId = activeHeaderRules.get(domain);
  activeHeaderRules.delete(domain);
  // Only remove if no other tab uses this domain
  const stillUsed = tabManager?.getAllTabs().some(t => getDomain(t.url) === domain);
  if (stillUsed) {
    activeHeaderRules.set(domain, ruleId); // Restore
    return;
  }
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
  } catch (e) {
    console.error('[PeekPanel] Failed to remove header rule for', domain, e);
  }
}

async function syncHeaderRules() {
  // Clear all existing session rules, then add rules for current tab domains
  const existingRules = await chrome.declarativeNetRequest.getSessionRules();
  const existingIds = existingRules.map(r => r.id).filter(id => id >= 100);
  if (existingIds.length > 0) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: existingIds });
  }
  activeHeaderRules.clear();

  if (!tabManager) return;
  const domains = new Set();
  for (const tab of tabManager.getAllTabs()) {
    const domain = getDomain(tab.url);
    if (domain) domains.add(domain);
  }
  for (const domain of domains) {
    await addHeaderRuleForDomain(domain);
  }
}

function onTabUrlChanged(url) {
  const domain = getDomain(url);
  if (domain) addHeaderRuleForDomain(domain);
}

function onTabRemoved(url) {
  const domain = getDomain(url);
  if (domain) removeHeaderRuleForDomain(domain);
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
    iframeManager.createIframeForTab(tabId, tabData.url, isActive, isInternal);
    onTabUrlChanged(tabData.url); // Add CSP rule for new tab's domain
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

// Track last processed pendingUrl to prevent double-processing
let lastProcessedPendingUrl = null;

// メッセージハンドラーを設定
function setupMessageHandlers() {
  // chrome.storageの変更を監視
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.pendingUrl) {
      const url = changes.pendingUrl.newValue;
      if (url && url !== lastProcessedPendingUrl) {
        lastProcessedPendingUrl = url;
        tabManager.createTab(url, true);
        chrome.storage.local.remove('pendingUrl');
      }
    }
  });

  // history.html、settings.html、およびiframe内からのメッセージを受信
  window.addEventListener('message', async (event) => {
    const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);

    // 内部ページ（settings.html, history.html）からのみ受け付けるメッセージ: originで検証
    const internalOnlyTypes = ['closeSettings', 'closeHistory', 'openHistory', 'restoreTab'];
    if (internalOnlyTypes.includes(event.data.type)) {
      if (event.origin !== extensionOrigin) {
        console.warn('[PeekPanel] Rejected internal message from unexpected origin:', event.origin);
        return;
      }
    }

    // 外部iframe（content-script）からのみ受け付けるメッセージ: event.sourceで検証
    const iframeOnlyTypes = ['showCustomContextMenu', 'hideCustomContextMenu', 'closeContextMenu', 'openNewTab'];
    if (iframeOnlyTypes.includes(event.data.type)) {
      const isFromKnownIframe = event.source && tabManager.getAllTabs().some(t => {
        const iframe = document.getElementById(t.id);
        return iframe && iframe.contentWindow === event.source;
      });
      if (!isFromKnownIframe) {
        console.warn('[PeekPanel] Rejected iframe message from unknown source:', event.data.type);
        return;
      }
    }

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
      window._selectedTextForSearch = event.data.text;
      const menu = document.getElementById('customContextMenu');
      if (!menu) return; // 要素が存在しない場合はスキップ

      // メニューテキストを更新（選択テキストを20文字に制限）
      const truncatedText = event.data.text.length > 20
        ? event.data.text.substring(0, 20) + '...'
        : event.data.text;
      const searchGoogleText = document.getElementById('searchGoogleText');
      if (searchGoogleText) {
        searchGoogleText.textContent = `Googleで「${truncatedText}」を検索`;
      }

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
      // ブックマークメニューも閉じる
      bookmarkManager.hideDropdown();
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
        const oldUrl = sourceTab.url;
        const urlChanged = oldUrl !== newUrl;

        // 履歴ナビゲーション中は履歴更新をスキップ
        if (sourceTab.isNavigatingHistory) {
          sourceTab.title = event.data.title;
          tabManager.updateTabTitle(sourceTab.id, event.data.title);
          // URLが変わった場合はファビコン更新
          if (urlChanged) {
            tabUI.updateTabFavicon(sourceTab.id, newUrl);
          }
          return;
        }

        // 履歴が空の場合は初期URLを追加
        if (sourceTab.history.length === 0) {
          tabManager.updateTabUrl(sourceTab.id, newUrl);
          // ファビコン更新
          tabUI.updateTabFavicon(sourceTab.id, newUrl);
        }
        // URLが変わった場合は履歴に追加
        else if (urlChanged) {
          const lastUrl = sourceTab.history[sourceTab.historyIndex];
          const normalizedLast = normalizeUrl(lastUrl);
          const normalizedNew = normalizeUrl(newUrl);

          if (normalizedLast !== normalizedNew) {
            tabManager.updateTabUrl(sourceTab.id, newUrl);
          }
          // URLが変わったらファビコンも更新
          tabUI.updateTabFavicon(sourceTab.id, newUrl);
        }

        // タイトルを更新
        tabManager.updateTabTitle(sourceTab.id, event.data.title);
      }
    } else if (event.data.type === 'pageLoaded' || event.data.type === 'historyNavigated') {
      // ページロードまたはマウスサイドボタンなどでのブラウザネイティブナビゲーションを検出
      const sourceIframe = event.source;
      if (!sourceIframe) return;

      const sourceTab = tabManager.getAllTabs().find(t => {
        const iframe = document.getElementById(t.id);
        return iframe && iframe.contentWindow === sourceIframe;
      });

      if (!sourceTab || sourceTab.isInternal) return;

      const newUrl = event.data.url;
      const oldUrl = sourceTab.url;

      // URL が実際に変更されている場合のみ処理
      if (oldUrl !== newUrl) {
        // ブラウザネイティブの履歴移動なので、historyIndex を適切に更新
        const historyIndex = sourceTab.history.indexOf(newUrl);

        if (historyIndex !== -1) {
          // 履歴内に存在するURLへの移動
          sourceTab.historyIndex = historyIndex;
          sourceTab.url = newUrl;

          tabManager.save();

          // 現在のタブの場合のみ UI を更新
          if (sourceTab.id === tabManager.currentTabId) {
            navigationUI.updateNavButtons(sourceTab);
          }

          if (event.data.title) {
            tabManager.updateTabTitle(sourceTab.id, event.data.title);
          }
          tabUI.updateTabFavicon(sourceTab.id, newUrl);
        } else {
          // 履歴にない新しいURLへの移動（通常の処理）
          tabManager.updateTabUrl(sourceTab.id, newUrl);
          if (event.data.title) {
            tabManager.updateTabTitle(sourceTab.id, event.data.title);
          }
          tabUI.updateTabFavicon(sourceTab.id, newUrl);
        }
      }
    } else if (event.data.type === 'urlChanged') {
      // SPA などでの URL 変更のフォールバック処理
      const sourceIframe = event.source;
      if (!sourceIframe) return;

      const sourceTab = tabManager.getAllTabs().find(t => {
        const iframe = document.getElementById(t.id);
        return iframe && iframe.contentWindow === sourceIframe;
      });

      if (!sourceTab || sourceTab.isInternal || sourceTab.isNavigatingHistory) return;

      const newUrl = event.data.url;
      const oldUrl = sourceTab.url;

      if (oldUrl !== newUrl) {
        tabManager.updateTabUrl(sourceTab.id, newUrl);
        onTabUrlChanged(newUrl); // Add CSP rule for new domain
        if (event.data.title) {
          tabManager.updateTabTitle(sourceTab.id, event.data.title);
        }
        tabUI.updateTabFavicon(sourceTab.id, newUrl);
      }
    } else if (event.data.type === 'openNewTab') {
      // iframe内からの新規タブ作成リクエスト（target="_blank"リンクのクリック）
      if (event.data.url) {
        try {
          const url = new URL(event.data.url);
          // http/httpsスキームのみ許可（セキュリティ対策）
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            tabManager.createTab(event.data.url, true);
          } else {
            console.warn('[PeekPanel] Invalid protocol for new tab:', url.protocol);
          }
        } catch (e) {
          console.warn('[PeekPanel] Invalid URL for new tab:', event.data.url);
        }
      }
    }
  });
}

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

// AI選択のイベントリスナーを設定
function setupAIDropdownEvents() {
  initAIDropdown();

  const aiDropdown = document.getElementById('ai-selector-dropdown');
  if (aiDropdown) {
    aiDropdown.addEventListener('change', (e) => {
      saveAISelection(e.target.value);
    });
  }

  loadAISelection();
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

  // メッセージハンドラーを設定
  setupMessageHandlers();

  // 初期化時に既存のpendingUrlをチェック（サイドパネル起動前に設定された場合に対応）
  const { pendingUrl } = await chrome.storage.local.get(['pendingUrl']);
  if (pendingUrl && pendingUrl !== lastProcessedPendingUrl) {
    lastProcessedPendingUrl = pendingUrl;
    tabManager.createTab(pendingUrl, true);
    // pendingUrlのみ削除し、pendingCleanupText等はai-auto-input.jsのために残す
    chrome.storage.local.remove(['pendingUrl']);
  }

  // Sync CSP header rules for currently open tab domains
  await syncHeaderRules();

  // AI選択プルダウンを初期化
  setupAIDropdownEvents();

  // 自動スリープのチェック（1分ごと）- 二重実行防止のため既存をクリア
  if (autoSleepInterval) clearInterval(autoSleepInterval);
  autoSleepInterval = setInterval(() => {
    tabManager.checkAndSleepTabs();
  }, TIMINGS.AUTO_SLEEP_CHECK_INTERVAL);
}

// 初期化を実行
init().catch(console.error);
