/**
 * Message handler for postMessage and chrome.storage events.
 * Handles communication between main panel, internal pages, and iframes.
 */
import { normalizeUrl } from '../utils/urlHelper.js';
import { onTabUrlChanged } from './headerRuleManager.js';

/**
 * Set up message handlers
 * @param {object} deps - Dependencies
 */
export function setupMessageHandlers({
  tabManager, tabHistory, tabUI, navigationUI,
  contextMenu, groupManager, bookmarkManager,
  findTabByWindow
}) {
  // Track last processed pendingUrl to prevent double-processing
  let lastProcessedPendingUrl = null;

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

    // 内部ページからのみ受け付けるメッセージ: originで検証
    const internalOnlyTypes = ['closeSettings', 'closeHistory', 'openHistory', 'restoreTab'];
    if (internalOnlyTypes.includes(event.data.type)) {
      if (event.origin !== extensionOrigin) {
        console.warn('[PeekPanel] Rejected internal message from unexpected origin:', event.origin);
        return;
      }
    }

    // 外部iframeからのみ受け付けるメッセージ: event.sourceで検証
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

    switch (event.data.type) {
      case 'closeSettings':
        handleCloseInternalTab(tabManager, 'settings.html');
        break;

      case 'closeHistory':
        handleCloseInternalTab(tabManager, 'history.html');
        break;

      case 'openHistory':
        handleOpenInternalTab(tabManager, 'history.html');
        break;

      case 'restoreTab':
        handleRestoreTab(tabManager, tabHistory, event.data);
        break;

      case 'showCustomContextMenu':
        handleShowContextMenu(event.data);
        break;

      case 'hideCustomContextMenu':
        document.getElementById('customContextMenu').style.display = 'none';
        break;

      case 'closeContextMenu':
        contextMenu.closeMenu();
        groupManager.closeAllGroups();
        bookmarkManager.hideDropdown();
        break;

      case 'updatePageTitle':
        handleUpdatePageTitle(tabManager, tabUI, navigationUI, findTabByWindow, event);
        break;

      case 'pageLoaded':
      case 'historyNavigated':
        handlePageLoaded(tabManager, tabUI, navigationUI, findTabByWindow, event);
        break;

      case 'urlChanged':
        handleUrlChanged(tabManager, tabUI, findTabByWindow, event);
        break;

      case 'openNewTab':
        handleOpenNewTab(tabManager, event.data);
        break;
    }
  });

  // Expose lastProcessedPendingUrl getter for init check
  return {
    get lastProcessedPendingUrl() { return lastProcessedPendingUrl; },
    set lastProcessedPendingUrl(v) { lastProcessedPendingUrl = v; }
  };
}

// --- Handler functions ---

function handleCloseInternalTab(tabManager, filename) {
  const tab = tabManager.getAllTabs().find(t => t.isInternal && t.url.includes(filename));
  if (tab) tabManager.closeTab(tab.id);
}

function handleOpenInternalTab(tabManager, filename) {
  const url = chrome.runtime.getURL(`pages/${filename}`);
  const existing = tabManager.getAllTabs().find(t => t.isInternal && t.url.includes(filename));
  if (existing) {
    tabManager.switchTab(existing.id);
  } else {
    tabManager.createTab(url, true, true);
  }
}

function handleRestoreTab(tabManager, tabHistory, data) {
  const { tabData, index } = data;
  tabHistory.removeFromHistory(index);
  const tabId = tabManager.createTab(tabData.url, true);
  const tab = tabManager.getTab(tabId);
  if (tab && tabData.history) {
    tab.history = [...tabData.history];
    tab.historyIndex = tabData.historyIndex || 0;
    tabManager.save();
  }
}

function handleShowContextMenu(data) {
  window._selectedTextForSearch = data.text;
  const menu = document.getElementById('customContextMenu');
  if (!menu) return;

  const truncatedText = data.text.length > 20
    ? data.text.substring(0, 20) + '...'
    : data.text;
  const searchGoogleText = document.getElementById('searchGoogleText');
  if (searchGoogleText) {
    searchGoogleText.textContent = `Googleで「${truncatedText}」を検索`;
  }

  menu.style.display = 'block';
  menu.style.left = `${data.x}px`;
  menu.style.top = `${data.y}px`;
}

function handleUpdatePageTitle(tabManager, tabUI, navigationUI, findTabByWindow, event) {
  if (!event.data.url || !event.data.title) return;
  const sourceIframe = event.source;
  if (!sourceIframe) return;

  const sourceTab = findTabByWindow(sourceIframe);
  if (!sourceTab || sourceTab.isInternal) return;

  const newUrl = event.data.url;
  const oldUrl = sourceTab.url;
  const urlChanged = oldUrl !== newUrl;

  if (sourceTab.isNavigatingHistory) {
    sourceTab.title = event.data.title;
    tabManager.updateTabTitle(sourceTab.id, event.data.title);
    if (urlChanged) tabUI.updateTabFavicon(sourceTab.id, newUrl);
    return;
  }

  if (sourceTab.history.length === 0) {
    tabManager.updateTabUrl(sourceTab.id, newUrl);
    tabUI.updateTabFavicon(sourceTab.id, newUrl);
  } else if (urlChanged) {
    const lastUrl = sourceTab.history[sourceTab.historyIndex];
    const normalizedLast = normalizeUrl(lastUrl);
    const normalizedNew = normalizeUrl(newUrl);
    if (normalizedLast !== normalizedNew) {
      tabManager.updateTabUrl(sourceTab.id, newUrl);
    }
    tabUI.updateTabFavicon(sourceTab.id, newUrl);
  }

  tabManager.updateTabTitle(sourceTab.id, event.data.title);
}

function handlePageLoaded(tabManager, tabUI, navigationUI, findTabByWindow, event) {
  const sourceIframe = event.source;
  if (!sourceIframe) return;

  const sourceTab = findTabByWindow(sourceIframe);
  if (!sourceTab || sourceTab.isInternal) return;

  const newUrl = event.data.url;
  const oldUrl = sourceTab.url;

  if (oldUrl !== newUrl) {
    const historyIndex = sourceTab.history.indexOf(newUrl);

    if (historyIndex !== -1) {
      sourceTab.historyIndex = historyIndex;
      sourceTab.url = newUrl;
      tabManager.save();

      if (sourceTab.id === tabManager.currentTabId) {
        navigationUI.updateNavButtons(sourceTab);
      }

      if (event.data.title) tabManager.updateTabTitle(sourceTab.id, event.data.title);
      tabUI.updateTabFavicon(sourceTab.id, newUrl);
    } else {
      tabManager.updateTabUrl(sourceTab.id, newUrl);
      if (event.data.title) tabManager.updateTabTitle(sourceTab.id, event.data.title);
      tabUI.updateTabFavicon(sourceTab.id, newUrl);
    }
  }
}

function handleUrlChanged(tabManager, tabUI, findTabByWindow, event) {
  const sourceIframe = event.source;
  if (!sourceIframe) return;

  const sourceTab = findTabByWindow(sourceIframe);
  if (!sourceTab || sourceTab.isInternal || sourceTab.isNavigatingHistory) return;

  const newUrl = event.data.url;
  const oldUrl = sourceTab.url;

  if (oldUrl !== newUrl) {
    tabManager.updateTabUrl(sourceTab.id, newUrl);
    onTabUrlChanged(newUrl);
    if (event.data.title) tabManager.updateTabTitle(sourceTab.id, event.data.title);
    tabUI.updateTabFavicon(sourceTab.id, newUrl);
  }
}

function handleOpenNewTab(tabManager, data) {
  if (!data.url) return;
  try {
    const url = new URL(data.url);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      tabManager.createTab(data.url, true);
    } else {
      console.warn('[PeekPanel] Invalid protocol for new tab:', url.protocol);
    }
  } catch (e) {
    console.warn('[PeekPanel] Invalid URL for new tab:', data.url);
  }
}
