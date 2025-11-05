// 初期AI設定
const DEFAULT_AIS = [
  { id: 'gemini', url: 'https://gemini.google.com/app' },
  { id: 'claude', url: 'https://claude.ai/new' },
  { id: 'chatgpt', url: 'https://chatgpt.com' }
];

// タブ管理
let tabs = [];
let currentTabId = null;
let tabCounter = 0;
let draggedTabElement = null;

// 閉じたタブの履歴
let closedTabsHistory = [];

// タブグループ管理
let tabGroups = [];
let groupCounter = 0;

// グループの色定義（Chromeの標準カラーに合わせた10色）
const GROUP_COLORS = [
  { id: 'grey', color: '#5F6368', label: 'グレー', emoji: '⚪' },
  { id: 'pink', color: '#D93B93', label: 'ピンク', emoji: '🟣' },
  { id: 'blue', color: '#1A73E8', label: '青', emoji: '🔵' },
  { id: 'cyan', color: '#007B83', label: 'シアン', emoji: '🔷' },
  { id: 'green', color: '#188038', label: '緑', emoji: '🟢' },
  { id: 'yellow', color: '#E37400', label: '黄色', emoji: '🟡' },
  { id: 'orange', color: '#E8710A', label: 'オレンジ', emoji: '🟠' },
  { id: 'red', color: '#C5221F', label: '赤', emoji: '🔴' },
  { id: 'purple', color: '#A142F4', label: '紫', emoji: '🟣' },
  { id: 'lightblue', color: '#8AB4F8', label: 'ライトブルー', emoji: '🔵' }
];

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

// 本物のファビコンを取得
function getRealFavicon(url) {
  try {
    const urlObj = new URL(url);
    // サイトのfavicon.icoを直接指定
    return `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
  } catch {
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="20" font-size="20">🌐</text></svg>';
  }
}

// タブを作成
function createTab(url, isActive = false, isInternal = false) {
  const tabId = `tab-${tabCounter++}`;

  // タブデータ
  const tabData = {
    id: tabId,
    url: url || 'about:blank',
    title: url ? getTabTitle(url) : '新しいタブ',
    history: [],
    historyIndex: -1,
    isInternal: isInternal,
    lastActiveTime: Date.now(),
    isLoaded: false,
    faviconUrl: null,
    isSleeping: false,
    needsLoad: !isActive && url && url !== 'about:blank', // アクティブでない場合は遅延読み込み
    hasError: false,           // エラー状態フラグ
    errorType: null,           // エラー種類
    errorMessage: null,        // エラーメッセージ
    lastErrorTime: null,       // エラー発生時刻
    groupId: null,             // タブグループID（null = グループなし）
    isPinned: false,           // ピン留めフラグ
    isMuted: false             // ミュートフラグ
  };

  tabs.push(tabData);

  // 内部ページの場合はタブ要素を作成しない
  if (!isInternal) {
    // タブ要素を作成
    const tabElement = document.createElement('button');
    tabElement.className = 'tab';
    tabElement.draggable = true;
    tabElement.dataset.tabId = tabId;

    // ファビコン表示
    const img = document.createElement('img');
    img.className = 'tab-favicon';
    img.src = url ? getRealFavicon(url) : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="20" font-size="20">🌐</text></svg>';
    img.onerror = () => {
      // フォールバック：Google Favicon API
      img.src = `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
      img.onerror = () => {
        // 最終フォールバック
        img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="20" font-size="20">🌐</text></svg>';
      };
    };
    tabElement.appendChild(img);

    // タブタイトル（グループ内でのみ表示）
    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-title';
    titleSpan.textContent = tabData.title;
    tabElement.appendChild(titleSpan);

    // ピン留めインジケーター
    const pinIndicator = document.createElement('span');
    pinIndicator.className = 'pin-indicator';
    pinIndicator.textContent = '📌';
    pinIndicator.style.display = 'none';
    tabElement.appendChild(pinIndicator);

    // ミュートインジケーター
    const muteIndicator = document.createElement('span');
    muteIndicator.className = 'mute-indicator';
    muteIndicator.textContent = '🔇';
    muteIndicator.style.display = 'none';
    tabElement.appendChild(muteIndicator);

    // クリックイベント
    tabElement.onclick = () => switchTab(tabId);

    // 中クリック（ホイールクリック）でタブを閉じる
    tabElement.onmousedown = (e) => {
      if (e.button === 1) { // 中クリック
        e.preventDefault();
        closeTab(tabId);
      }
    };

    // ドラッグイベント
    setupDragAndDrop(tabElement);

    // 右クリックメニュー
    tabElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTabContextMenu(tabId, e.clientX, e.clientY);
    });

    // タブを追加
    document.getElementById('tabs').appendChild(tabElement);
  }

  // iframeを作成
  const iframe = document.createElement('iframe');
  iframe.id = tabId;
  iframe.allow = 'camera; clipboard-write; fullscreen; microphone; geolocation';

  // タイムアウト検知（60秒）- 内部ページは除外
  let loadTimeout = setTimeout(() => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab && !tab.isInternal && !tab.isLoaded && !tab.hasError && iframe.src && iframe.src !== 'about:blank') {
      handleIframeError(tabId, 'timeout');
    }
  }, 60000);

  // エラー検知 - 内部ページは除外
  iframe.addEventListener('error', (e) => {
    clearTimeout(loadTimeout);
    const tab = tabs.find(t => t.id === tabId);
    if (tab && !tab.isInternal) {
      console.error('[PeekPanel] iframe error:', e);
      handleIframeError(tabId, 'network');
    }
  });

  // iframeのロード完了時にファビコンとタイトルを更新
  iframe.addEventListener('load', () => {
    clearTimeout(loadTimeout); // 成功時はタイムアウトをクリア
    try {
      const currentUrl = iframe.src;
      const tab = tabs.find(t => t.id === tabId);

      // スリープ中のタブはファビコン更新をスキップ
      if (!tab || !tab.isSleeping) {
        updateTabFavicon(tabId, currentUrl);
      }
      updateTabTitle(tabId, iframe);

      // iframe内での遷移を検出（内部ページのみ履歴を管理）

      // 読み込み完了をマーク（空のURL、about:blank、panel.html自体は除外）
      const isPanelPage = currentUrl && currentUrl.includes('/pages/panel.html');
      if (tab && currentUrl && currentUrl !== 'about:blank' && currentUrl !== '' && !isPanelPage) {
        tab.isLoaded = true;
      }

      if (tab && currentUrl && currentUrl !== 'about:blank') {
        // 内部ページ（settings.html, history.htmlなど）の場合のみloadイベントで履歴を管理
        if (tab.isInternal) {
          if (tab.history.length === 0) {
            tab.history.push(currentUrl);
            tab.historyIndex = 0;
            tab.url = currentUrl;

            if (tabId === currentTabId) {
              updateUrlBar();
              updateNavButtons();
            }
            saveTabs();
          }
        }
        // 通常のページはpostMessage（content-script）で履歴を管理するため、ここでは何もしない
      }
    } catch (e) {
      // クロスオリジンの場合はエラーを無視
      console.log('Cannot access iframe URL (cross-origin)');
    }
  });

  document.getElementById('iframeContainer').appendChild(iframe);

  // chrome://やchrome-extension://などの特殊URLをチェック（内部ページは除外）
  const isRestrictedUrl = !isInternal && url && (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') && url !== 'about:blank'
  );

  // 制限されたURLの場合はエラー状態にする
  if (isRestrictedUrl) {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      tab.hasError = true;
      tab.errorType = 'blocked';
      tab.errorMessage = 'このページは埋め込みで表示できません';
      tab.lastErrorTime = Date.now();

      // ファビコンをエラー表示に
      if (isActive) {
        updateTabFaviconToError(tabId);
      }
    }
  }
  // アクティブなタブのみURLを読み込む（非アクティブは遅延読み込み）
  else if (url && isActive) {
    iframe.src = url;
  }

  if (isActive) {
    switchTab(tabId);
  }

  // 状態を保存
  saveTabs();

  return tabId;
}

// タブを閉じる
function closeTab(tabId) {
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;

  const tab = tabs[tabIndex];

  // 通常のタブが1つしかない場合は閉じない（内部ページは除く）
  const normalTabs = tabs.filter(t => !t.isInternal);
  if (!tab.isInternal && normalTabs.length <= 1) return;

  // 履歴に追加（履歴ページ自体は除外）
  const historyUrl = chrome.runtime.getURL('pages/history.html');
  if (tab.url && tab.url !== 'about:blank' && tab.url !== historyUrl) {
    const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
    const favicon = tabElement?.querySelector('.tab-favicon')?.src || '';

    // 同じURLが既に存在する場合は削除（重複防止）
    const existingIndex = closedTabsHistory.findIndex(item => item.url === tab.url);
    if (existingIndex !== -1) {
      closedTabsHistory.splice(existingIndex, 1);
    }

    closedTabsHistory.unshift({
      url: tab.url,
      title: tab.title || getTabTitle(tab.url),
      favicon: favicon,
      timestamp: Date.now(),
      history: [...tab.history],
      historyIndex: tab.historyIndex
    });

    saveClosedTabsHistory();
  }

  // グループIDを保存
  const oldGroupId = tab.groupId;

  // タブとiframeを削除
  document.querySelector(`.tab[data-tab-id="${tabId}"]`)?.remove();
  document.getElementById(tabId)?.remove();
  tabs.splice(tabIndex, 1);

  // グループが空になった場合は削除
  if (oldGroupId && !tab.isInternal) {
    const groupTabs = tabs.filter(t => t.groupId === oldGroupId && !t.isInternal);
    if (groupTabs.length === 0) {
      const groupIndex = tabGroups.findIndex(g => g.id === oldGroupId);
      if (groupIndex !== -1) {
        tabGroups.splice(groupIndex, 1);
      }
    }
  }

  // アクティブなタブが閉じられた場合
  if (currentTabId === tabId) {
    // 内部ページが閉じられた場合は、最初の通常タブに切り替え
    if (tab.isInternal) {
      const firstNormalTab = tabs.find(t => !t.isInternal);
      if (firstNormalTab) {
        switchTab(firstNormalTab.id);
      }
    } else {
      const newActiveTab = tabs[Math.max(0, tabIndex - 1)];
      if (newActiveTab) {
        switchTab(newActiveTab.id);
      }
    }
  }

  // 状態を保存
  saveTabs();
}

// URLからタイトルを取得
function getTabTitle(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

// 閉じたタブの履歴を保存
async function saveClosedTabsHistory() {
  await chrome.storage.local.set({ closedTabsHistory });
}

// 閉じたタブの履歴を復元
async function restoreClosedTabsHistory() {
  const { closedTabsHistory: saved } = await chrome.storage.local.get('closedTabsHistory');
  if (saved) {
    closedTabsHistory = saved;
  }
}

// 閉じたタブを復元
function restoreClosedTab(index) {
  if (index < 0 || index >= closedTabsHistory.length) return;

  const closedTab = closedTabsHistory[index];
  const tabId = createTab(closedTab.url, true);

  // 履歴を復元
  const tab = tabs.find(t => t.id === tabId);
  if (tab && closedTab.history) {
    tab.history = [...closedTab.history];
    tab.historyIndex = closedTab.historyIndex;
  }

  // 履歴から削除
  closedTabsHistory.splice(index, 1);
  saveClosedTabsHistory();
}

// タブを切り替え
function switchTab(tabId) {
  currentTabId = tabId;

  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.lastActiveTime = Date.now();

    // スリープ状態のタブを復帰
    if (tab.isSleeping) {
      wakeTab(tabId);
    }

    // 初回アクティブ時に遅延読み込み
    if (tab.needsLoad) {
      const iframe = document.getElementById(tabId);
      if (iframe && tab.url) {
        // chrome://やchrome-extension://などの特殊URLをチェック（内部ページは除外）
        const isRestrictedUrl = !tab.isInternal && (
          tab.url.startsWith('chrome://') ||
          tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('edge://') ||
          (tab.url.startsWith('about:') && tab.url !== 'about:blank')
        );

        if (isRestrictedUrl) {
          // エラー状態にする
          tab.hasError = true;
          tab.errorType = 'blocked';
          tab.errorMessage = 'このページは埋め込みで表示できません';
          tab.lastErrorTime = Date.now();
          updateTabFaviconToError(tabId);
        } else {
          iframe.src = tab.url;
        }
        tab.needsLoad = false;
      }
    }

    // エラー状態のタブはオーバーレイを表示、そうでない場合は削除
    if (tab.hasError) {
      showErrorOverlay(tabId);
    } else {
      const iframeContainer = document.getElementById('iframeContainer');
      const existingOverlay = iframeContainer.querySelector('.error-overlay');
      if (existingOverlay) {
        existingOverlay.remove();
      }
    }
  }

  // タブの見た目を更新
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tabId === tabId);
  });

  // iframeの表示を切り替え
  document.querySelectorAll('#iframeContainer iframe').forEach(f => {
    f.classList.toggle('active', f.id === tabId);
  });

  // URLバーとナビゲーションボタンを更新
  updateUrlBar();
  updateNavButtons();

  // 状態を保存
  saveTabs();
}

// URLバーを更新
function updateUrlBar() {
  const tab = tabs.find(t => t.id === currentTabId);
  if (tab) {
    document.getElementById('urlBar').value = tab.url;
  }
}

// ナビゲーションボタンの状態を更新
function updateNavButtons() {
  const tab = tabs.find(t => t.id === currentTabId);
  if (tab) {
    document.getElementById('back').disabled = tab.historyIndex <= 0;
    document.getElementById('forward').disabled = tab.historyIndex >= tab.history.length - 1;
  }
}

// URLを遷移
function navigateToUrl(url) {
  const tab = tabs.find(t => t.id === currentTabId);
  if (!tab) return;

  try {
    // URLの正規化
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const iframe = document.getElementById(currentTabId);
    iframe.src = url;

    // 履歴を更新
    tab.historyIndex++;
    tab.history = tab.history.slice(0, tab.historyIndex);
    tab.history.push(url);
    tab.url = url;
    tab.title = getTabTitle(url); // タイトルも更新

    // ファビコンを更新
    updateTabFavicon(currentTabId, url);
    updateUrlBar();
    updateNavButtons();

    // 状態を保存
    saveTabs();
  } catch (e) {
    console.error('Navigation error:', e);
  }
}

// タブのファビコンを更新
function updateTabFavicon(tabId, url) {
  const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
  if (!tabElement) return;

  const tab = tabs.find(t => t.id === tabId);

  // スリープ中のタブはファビコンを更新しない
  if (tab && tab.isSleeping && tab.faviconUrl) {
    return;
  }

  const img = tabElement.querySelector('.tab-favicon');
  if (img && url) {
    const favicon = getRealFavicon(url);
    img.src = favicon;

    // ファビコンURLを即座に保存
    if (tab) {
      tab.faviconUrl = favicon;
    }

    img.onerror = () => {
      // スリープ中のタブはエラーハンドリングをスキップ
      if (tab && tab.isSleeping && tab.faviconUrl) {
        img.src = tab.faviconUrl;
        return;
      }

      // フォールバック
      const fallbackUrl = `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
      img.src = fallbackUrl;
      if (tab) {
        tab.faviconUrl = fallbackUrl;
      }

      img.onerror = () => {
        const defaultIcon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="20" font-size="20">🌐</text></svg>';
        img.src = defaultIcon;
        if (tab) {
          tab.faviconUrl = defaultIcon;
        }
      };
    };
  }
}

// タブのタイトルを更新
function updateTabTitle(tabId, iframe) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  let newTitle = null;

  try {
    // 同一オリジンの場合のみアクセス可能
    const title = iframe.contentDocument?.title;
    if (title) {
      newTitle = title;
      tab.title = title;
      saveTabs();
    }
  } catch (e) {
    // CORS エラー - URLからタイトルを推測
    if (iframe.src) {
      newTitle = getTabTitle(iframe.src);
      tab.title = newTitle;
      saveTabs();
    }
  }

  // DOM要素のタイトルテキストも更新
  if (newTitle) {
    const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
    if (tabElement) {
      const titleSpan = tabElement.querySelector('.tab-title');
      if (titleSpan) {
        titleSpan.textContent = newTitle;
      }
    }
  }
}

// 戻る
function goBack() {
  const tab = tabs.find(t => t.id === currentTabId);
  if (!tab || tab.historyIndex <= 0) return;

  // 履歴ナビゲーション中フラグを立てる
  tab.isNavigatingHistory = true;

  tab.historyIndex--;
  const url = tab.history[tab.historyIndex];
  tab.url = url;
  tab.title = getTabTitle(url);

  const iframe = document.getElementById(currentTabId);
  iframe.src = url;

  updateUrlBar();
  updateNavButtons();
  saveTabs();

  // フラグをクリア（次のpostMessageを受け取るまで少し待つ）
  setTimeout(() => {
    tab.isNavigatingHistory = false;
  }, 1000);
}

// 進む
function goForward() {
  const tab = tabs.find(t => t.id === currentTabId);
  if (!tab || tab.historyIndex >= tab.history.length - 1) return;

  // 履歴ナビゲーション中フラグを立てる
  tab.isNavigatingHistory = true;

  tab.historyIndex++;
  const url = tab.history[tab.historyIndex];
  tab.url = url;
  tab.title = getTabTitle(url);

  const iframe = document.getElementById(currentTabId);
  iframe.src = url;

  updateUrlBar();
  updateNavButtons();
  saveTabs();

  // フラグをクリア（次のpostMessageを受け取るまで少し待つ）
  setTimeout(() => {
    tab.isNavigatingHistory = false;
  }, 1000);
}

// リロード
function reload() {
  const iframe = document.getElementById(currentTabId);
  if (iframe) {
    iframe.src = iframe.src;
  }
}

// タブの状態を保存
async function saveTabs() {
  const tabsData = tabs
    .filter(tab => !tab.isInternal) // 内部ページは保存しない
    .map(tab => ({
      url: tab.url,
      title: tab.title,
      history: tab.history,
      historyIndex: tab.historyIndex,
      isPinned: tab.isPinned || false,
      isMuted: tab.isMuted || false,
      groupId: tab.groupId || null
    }));

  await chrome.storage.local.set({
    savedTabs: tabsData,
    currentTabIndex: tabs.findIndex(t => t.id === currentTabId && !t.isInternal),
    tabGroups: tabGroups
  });
}

// タブの状態を復元
async function restoreTabs() {
  const { savedTabs, currentTabIndex, tabGroups: savedGroups } = await chrome.storage.local.get(['savedTabs', 'currentTabIndex', 'tabGroups']);

  // タブグループを復元
  if (savedGroups && savedGroups.length > 0) {
    tabGroups = savedGroups.map(g => ({
      ...g,
      isCollapsed: g.isCollapsed || false
    }));
    groupCounter = Math.max(...savedGroups.map(g => parseInt(g.id.replace('group-', '')))) + 1;
  }

  if (savedTabs && savedTabs.length > 0) {
    // 保存されたタブを復元
    savedTabs.forEach((tabData, index) => {
      const tabId = createTab(tabData.url, false);
      const tab = tabs.find(t => t.id === tabId);
      if (tab) {
        tab.title = tabData.title || getTabTitle(tabData.url);
        tab.history = tabData.history || [tabData.url];
        tab.historyIndex = tabData.historyIndex || 0;
        tab.isPinned = tabData.isPinned || false;
        tab.isMuted = tabData.isMuted || false;
        tab.groupId = tabData.groupId || null;

        // タブ要素の更新
        const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
        if (tabElement) {
          // ピン留めインジケーターの表示
          if (tab.isPinned) {
            const pinIndicator = tabElement.querySelector('.pin-indicator');
            if (pinIndicator) {
              pinIndicator.style.display = 'block';
            }
          }

          // ミュートインジケーターの表示
          if (tab.isMuted) {
            const muteIndicator = tabElement.querySelector('.mute-indicator');
            if (muteIndicator) {
              muteIndicator.style.display = 'block';
            }
          }

          // グループカラーの適用
          if (tab.groupId) {
            const group = tabGroups.find(g => g.id === tab.groupId);
            if (group) {
              tabElement.style.borderBottom = `3px solid ${group.color}`;
            }
          }
        }
      }
    });

    // アクティブなタブを復元
    const activeTabIndex = currentTabIndex >= 0 ? currentTabIndex : 0;
    if (tabs[activeTabIndex]) {
      switchTab(tabs[activeTabIndex].id);
    }

    // タブバーを再構築
    rebuildTabBar();

    return true;
  }

  return false;
}

// ドラッグ&ドロップ設定
function setupDragAndDrop(tabElement) {
  tabElement.addEventListener('dragstart', (e) => {
    draggedTabElement = tabElement;
    tabElement.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  tabElement.addEventListener('dragend', (e) => {
    tabElement.classList.remove('dragging');

    // DOM上のタブの順序に合わせてtabs配列を並び替え
    updateTabsOrder();

    // タブバーを再構築
    rebuildTabBar();

    saveTabs();

    draggedTabElement = null;

    // ドラッグ後、開いているグループのタブラッパー位置を更新
    setTimeout(() => {
      tabGroups.forEach(group => {
        if (!group.isCollapsed) {
          const groupContainer = document.querySelector(`.group-container[data-group-id="${group.id}"]`);
          if (groupContainer) {
            const tabsWrapper = groupContainer.querySelector('.group-tabs-wrapper');
            const header = groupContainer.querySelector('.tab-group-header');
            if (tabsWrapper && header && !tabsWrapper.classList.contains('collapsed')) {
              const headerRect = header.getBoundingClientRect();
              const wrapperRect = tabsWrapper.getBoundingClientRect();
              const wrapperWidth = wrapperRect.width;

              // ヘッダーの中央に配置
              const centerLeft = headerRect.left + (headerRect.width / 2) - (wrapperWidth / 2);

              tabsWrapper.style.top = '41px';
              tabsWrapper.style.left = `${centerLeft}px`;
            }
          }
        }
      });
    }, 50);
  });

  tabElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedTabElement || draggedTabElement === tabElement) {
      return;
    }

    const tabsContainer = document.getElementById('tabs');
    const afterElement = getDragAfterElement(tabsContainer, e.clientX);

    if (afterElement == null) {
      tabsContainer.appendChild(draggedTabElement);
    } else {
      tabsContainer.insertBefore(draggedTabElement, afterElement);
    }
  });

  tabElement.addEventListener('drop', (e) => {
    e.preventDefault();
  });
}

// DOM上のタブの順序に合わせてtabs配列を並び替え
function updateTabsOrder() {
  const tabElements = document.querySelectorAll('.tab');
  const newTabsOrder = [];
  const internalTabs = tabs.filter(t => t.isInternal);

  tabElements.forEach(tabElement => {
    const tabId = tabElement.dataset.tabId;
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      newTabsOrder.push(tab);
    }
  });

  // 内部タブを最後に追加
  tabs = [...newTabsOrder, ...internalTabs];
}

// ドラッグ位置を計算
function getDragAfterElement(container, x) {
  // タブコンテナの直接の子要素のみを対象にする（グループコンテナとグループ外のタブ）
  const draggableElements = [...container.children].filter(el =>
    (el.classList.contains('tab') || el.classList.contains('group-container')) &&
    !el.classList.contains('dragging')
  );

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;

    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}


// イベントリスナー設定
document.getElementById('back').addEventListener('click', goBack);
document.getElementById('forward').addEventListener('click', goForward);
document.getElementById('reload').addEventListener('click', reload);

// URLバーでEnterキー
document.getElementById('urlBar').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const url = e.target.value.trim();
    if (url) {
      navigateToUrl(url);
    }
  }
});

// 新しいタブボタン
document.getElementById('newTab').addEventListener('click', () => {
  createTab('https://www.google.com', true);
});

// 閉じたタブボタン
document.getElementById('settingsButton').addEventListener('click', () => {
  const settingsUrl = chrome.runtime.getURL('pages/settings.html');
  createTab(settingsUrl, true, true); // 内部ページとして開く
});

// 右クリックメニューから開いたURL
chrome.storage.onChanged.addListener((changes) => {
  if (changes.pendingUrl) {
    const url = changes.pendingUrl.newValue;
    if (url) {
      createTab(url, true);
      chrome.storage.local.remove('pendingUrl');
    }
  }

  // 履歴が変更されたらメモリ上の変数も更新
  if (changes.closedTabsHistory) {
    closedTabsHistory = changes.closedTabsHistory.newValue || [];
  }
});

// カスタムコンテキストメニュー関連
let selectedTextForSearch = '';

// history.htmlからのメッセージを受信
window.addEventListener('message', async (event) => {
  if (event.data.type === 'restoreTab') {
    const { tabData, index } = event.data;

    // タブを復元
    const tabId = createTab(tabData.url, true);

    // 履歴を復元
    const tab = tabs.find(t => t.id === tabId);
    if (tab && tabData.history) {
      tab.history = [...tabData.history];
      tab.historyIndex = tabData.historyIndex;
    }

    // 履歴から削除
    const { closedTabsHistory } = await chrome.storage.local.get('closedTabsHistory');
    if (closedTabsHistory && index < closedTabsHistory.length) {
      closedTabsHistory.splice(index, 1);
      await chrome.storage.local.set({ closedTabsHistory });
    }
  } else if (event.data.type === 'closeHistoryPage') {
    // 履歴ページを閉じる
    const historyTab = tabs.find(t => t.isInternal && t.url.includes('history.html'));
    if (historyTab) {
      closeTab(historyTab.id);
    }
  } else if (event.data.type === 'closeSettingsPage') {
    // 設定ページを閉じる
    const settingsTab = tabs.find(t => t.isInternal && t.url.includes('settings.html'));
    if (settingsTab) {
      closeTab(settingsTab.id);
    }
  } else if (event.data.type === 'openHistoryPage') {
    // 履歴ページを開く
    const historyUrl = chrome.runtime.getURL('pages/history.html');
    createTab(historyUrl, true, true); // 内部ページとして開く
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
  } else if (event.data.type === 'updatePageTitle') {
    // ページタイトルとURLを更新
    if (event.data.url && event.data.title) {
      // メッセージを送信したiframeを特定
      const sourceIframe = event.source;
      if (!sourceIframe) return;

      // 送信元iframeに対応するタブを見つける
      const sourceTab = tabs.find(t => {
        const iframe = document.getElementById(t.id);
        return iframe && iframe.contentWindow === sourceIframe;
      });

      if (!sourceTab || sourceTab.isInternal) return;

      const tab = sourceTab;
      const newUrl = event.data.url;

      // 履歴ナビゲーション中（戻る・進む操作中）は履歴更新をスキップ
      if (tab.isNavigatingHistory) {
        // タイトルだけ更新
        tab.title = event.data.title;

        // DOM要素も更新
        const tabElement = document.querySelector(`.tab[data-tab-id="${tab.id}"]`);
        if (tabElement) {
          const titleSpan = tabElement.querySelector('.tab-title');
          if (titleSpan) {
            titleSpan.textContent = event.data.title;
          }
        }

        saveTabs();
        return;
      }

      // URLを正規化して比較
      const normalizeUrl = (url) => {
        try {
          const u = new URL(url);
          return u.href;
        } catch {
          return url;
        }
      };

      // 履歴が空の場合は必ず初期URLを追加
      if (tab.history.length === 0) {
        tab.history.push(newUrl);
        tab.historyIndex = 0;
        tab.url = newUrl;

        // 送信元タブがアクティブな場合のみUIを更新
        if (tab.id === currentTabId) {
          updateUrlBar();
          updateNavButtons();
        }
      }
      // URLが変わった場合は履歴に追加
      else if (tab.url !== newUrl) {
        const lastUrl = tab.history[tab.historyIndex];
        if (normalizeUrl(lastUrl) !== normalizeUrl(newUrl)) {
          // 現在の位置より後ろの履歴を削除
          tab.history = tab.history.slice(0, tab.historyIndex + 1);
          // 新しいURLを追加
          tab.history.push(newUrl);
          tab.historyIndex++;
          tab.url = newUrl;

          // 送信元タブがアクティブな場合のみUIを更新
          if (tab.id === currentTabId) {
            updateUrlBar();
            updateNavButtons();
          }
        }
      }

      // タイトルを更新（URLが変わらなくても）
      tab.title = event.data.title;

      // DOM要素も更新
      const tabElement = document.querySelector(`.tab[data-tab-id="${tab.id}"]`);
      if (tabElement) {
        const titleSpan = tabElement.querySelector('.tab-title');
        if (titleSpan) {
          titleSpan.textContent = event.data.title;
        }
      }

      saveTabs();
    }
  }
});

// カスタムコンテキストメニューのGoogle検索
document.getElementById('searchGoogleItem').addEventListener('click', () => {
  if (selectedTextForSearch) {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(selectedTextForSearch)}`;
    createTab(searchUrl, true);
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

// タブスリープ機能
// タブをスリープさせる
function sleepTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || tab.isInternal || tab.isSleeping) return;

  // スリープフラグを設定
  tab.isSleeping = true;

  // iframeをabout:blankにしてメモリ解放
  const iframe = document.getElementById(tabId);
  if (iframe) {
    iframe.src = 'about:blank';
  }

  // タブ要素にスリープクラスを追加
  const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
  if (tabElement) {
    tabElement.classList.add('sleeping');
  }
}

// スリープタブを復帰させる
function wakeTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || tab.isInternal || !tab.isSleeping) return;

  // スリープフラグを解除
  tab.isSleeping = false;

  // タブ要素からスリープクラスを削除
  const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
  if (tabElement) {
    tabElement.classList.remove('sleeping');
  }

  // iframeに保存済みURLを読み込む
  const iframe = document.getElementById(tabId);
  if (iframe && tab.url) {
    // chrome://やchrome-extension://などの特殊URLをチェック（内部ページは除外）
    const isRestrictedUrl = !tab.isInternal && (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('edge://') ||
      (tab.url.startsWith('about:') && tab.url !== 'about:blank')
    );

    if (isRestrictedUrl) {
      // エラー状態にする
      tab.hasError = true;
      tab.errorType = 'blocked';
      tab.errorMessage = 'このページは埋め込みで表示できません';
      tab.lastErrorTime = Date.now();
      updateTabFaviconToError(tabId);
      if (tabId === currentTabId) {
        showErrorOverlay(tabId);
      }
    } else {
      iframe.src = tab.url;
    }
  }

  // アクティブタブの場合はUIを更新
  if (tabId === currentTabId) {
    updateUrlBar();
    updateNavButtons();
  }
}

// 全タブをチェックして条件に合うタブをスリープ
async function checkAndSleepTabs() {
  try {
    // 設定を読み込み
    if (!chrome.runtime?.id) return;

    const { autoSleepEnabled, autoSleepMinutes, noSleepDomains } = await chrome.storage.sync.get({
      autoSleepEnabled: true,
      autoSleepMinutes: 5,
      noSleepDomains: ['youtube.com', 'youtu.be', 'twitch.tv']
    });

    if (!autoSleepEnabled) return;

    const now = Date.now();
    const sleepThreshold = autoSleepMinutes * 60 * 1000; // 分をミリ秒に変換

    tabs.forEach(tab => {
      // 現在アクティブなタブはスキップ
      if (tab.id === currentTabId) return;

      // 内部ページはスキップ
      if (tab.isInternal) return;

      // 既にスリープ中はスキップ
      if (tab.isSleeping) return;

      // エラー中のタブはスキップ
      if (tab.hasError) return;

      // スリープ禁止URLのチェック（設定から読み込み）
      const shouldNotSleep = noSleepDomains.some(domain => {
        try {
          const url = new URL(tab.url);
          return url.hostname.includes(domain);
        } catch (e) {
          return false;
        }
      });

      if (shouldNotSleep) return;

      // 最終アクティブから閾値を超えたらスリープ
      const inactiveDuration = now - tab.lastActiveTime;
      if (inactiveDuration > sleepThreshold) {
        sleepTab(tab.id);
      }
    });
  } catch (error) {
    if (!error.message?.includes('Extension context invalidated')) {
      console.error('[PeekPanel] Error in checkAndSleepTabs:', error);
    }
  }
}

// AI選択を読み込み
async function loadAISelection() {
  try {
    // 拡張機能のコンテキストが有効かチェック
    if (!chrome.runtime?.id) {
      return;
    }

    const { cleanupAI } = await chrome.storage.sync.get({
      cleanupAI: 'claude'
    });

    // ラジオボタンを選択
    const aiRadio = document.querySelector(`input[name="cleanupAI-footer"][value="${cleanupAI}"]`);
    if (aiRadio) {
      aiRadio.checked = true;
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
    // 拡張機能のコンテキストが有効かチェック
    if (!chrome.runtime?.id) {
      return;
    }

    await chrome.storage.sync.set({
      cleanupAI: selectedAI
    });
  } catch (error) {
    if (!error.message?.includes('Extension context invalidated')) {
      console.error('[PeekPanel] Error saving AI selection:', error);
    }
  }
}

// AI選択のイベントリスナー
document.querySelectorAll('input[name="cleanupAI-footer"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      saveAISelection(e.target.value);
    }
  });
});

// ========================================
// エラーハンドリング
// ========================================

/**
 * iframeのエラーをハンドリング
 * @param {string} tabId - タブID
 * @param {string} errorType - エラー種類
 */
function handleIframeError(tabId, errorType) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  // エラー状態を記録
  tab.hasError = true;
  tab.errorType = errorType;
  tab.lastErrorTime = Date.now();

  // エラーメッセージを生成
  const errorMessages = {
    'network': 'このページへの接続に失敗しました',
    '404': 'ページが見つかりません',
    '403': 'アクセスが拒否されました',
    'timeout': '読み込みがタイムアウトしました（60秒）',
    'blocked': 'このページは埋め込みで表示できません'
  };

  tab.errorMessage = errorMessages[errorType] || '不明なエラーが発生しました';

  // エラーUIを表示
  if (tabId === currentTabId) {
    showErrorOverlay(tabId);
  }

  // タブファビコンをエラー表示に
  updateTabFaviconToError(tabId);

  console.error(`[PeekPanel] Tab ${tabId} error:`, errorType, tab.errorMessage);
}

/**
 * エラーオーバーレイを表示
 * @param {string} tabId - タブID
 */
function showErrorOverlay(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || !tab.hasError) return;

  const iframe = document.getElementById(tabId);
  if (!iframe) return;

  // 既存のエラーオーバーレイを削除
  const iframeContainer = document.getElementById('iframeContainer');
  const existingOverlay = iframeContainer.querySelector('.error-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // テンプレートからクローン
  const template = document.getElementById('errorOverlayTemplate');
  if (!template) {
    console.error('[PeekPanel] Error overlay template not found');
    return;
  }

  const overlay = template.content.firstElementChild.cloneNode(true);

  // エラーメッセージを設定
  overlay.querySelector('.error-message').textContent = tab.errorMessage;

  // 再読み込みボタンのイベント
  overlay.querySelector('[data-action="retry"]').onclick = () => {
    retryLoadTab(tabId);
  };

  // 閉じるボタンのイベント
  overlay.querySelector('[data-action="close"]').onclick = () => {
    closeTab(tabId);
  };

  // iframeContainerに追加
  iframeContainer.appendChild(overlay);
}

/**
 * タブの再読み込みを試行
 * @param {string} tabId - タブID
 */
function retryLoadTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  // エラー状態をリセット
  tab.hasError = false;
  tab.errorType = null;
  tab.errorMessage = null;
  tab.lastErrorTime = null;

  // エラーオーバーレイを削除
  const iframeContainer = document.getElementById('iframeContainer');
  const overlay = iframeContainer.querySelector('.error-overlay');
  if (overlay) {
    overlay.remove();
  }

  // iframeを再読み込み
  const iframe = document.getElementById(tabId);
  if (iframe) {
    iframe.src = tab.url;
  }

  // ファビコンを通常に戻す
  updateTabFavicon(tabId, tab.url);

  // タブエラークラスを削除
  const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
  if (tabElement) {
    tabElement.classList.remove('tab-error');
  }
}

/**
 * タブのファビコンをエラー表示に変更
 * @param {string} tabId - タブID
 */
function updateTabFaviconToError(tabId) {
  const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
  if (!tabElement) return;

  const img = tabElement.querySelector('.tab-favicon');
  if (img) {
    // エラーアイコンに変更
    img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="20" font-size="20">⚠️</text></svg>';

    // タブにエラークラスを追加
    tabElement.classList.add('tab-error');
  }
}

/**
 * タブをピン留め/解除
 * @param {string} tabId - タブID
 */
function togglePinTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || tab.isInternal) return;

  tab.isPinned = !tab.isPinned;

  // タブ要素の更新
  const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
  if (tabElement) {
    const pinIndicator = tabElement.querySelector('.pin-indicator');
    if (pinIndicator) {
      pinIndicator.style.display = tab.isPinned ? 'block' : 'none';
    }

    // ピン留めされたタブは先頭に移動
    if (tab.isPinned) {
      const tabsContainer = document.getElementById('tabs');
      const pinnedTabs = Array.from(tabsContainer.children).filter(el => {
        const t = tabs.find(t => t.id === el.dataset.tabId);
        return t && t.isPinned;
      });

      if (pinnedTabs.length > 0) {
        // 最後のピン留めタブの後ろに挿入
        const lastPinnedTab = pinnedTabs[pinnedTabs.length - 1];
        lastPinnedTab.after(tabElement);
      } else {
        // 最初に挿入
        tabsContainer.prepend(tabElement);
      }
    }

    updateTabsOrder();
  }

  saveTabs();
}

/**
 * タブをミュート/解除
 * @param {string} tabId - タブID
 */
function toggleMuteTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || tab.isInternal) return;

  tab.isMuted = !tab.isMuted;

  // タブ要素の更新
  const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
  if (tabElement) {
    const muteIndicator = tabElement.querySelector('.mute-indicator');
    if (muteIndicator) {
      muteIndicator.style.display = tab.isMuted ? 'block' : 'none';
    }
  }

  // iframeのミュート状態を適用（可能な範囲で）
  const iframe = document.getElementById(tabId);
  if (iframe && iframe.contentWindow) {
    try {
      // クロスオリジンの場合は動作しない可能性がある
      iframe.contentWindow.postMessage({
        type: 'muteAudio',
        muted: tab.isMuted
      }, '*');
    } catch (e) {
      console.log('Cannot mute iframe (cross-origin)');
    }
  }

  saveTabs();
}

/**
 * タブを複製
 * @param {string} tabId - タブID
 */
function duplicateTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || tab.isInternal) return;

  // 新しいタブを作成
  const newTabId = createTab(tab.url, false);
  const newTab = tabs.find(t => t.id === newTabId);

  if (newTab) {
    // 履歴をコピー
    newTab.history = [...tab.history];
    newTab.historyIndex = tab.historyIndex;
    newTab.title = tab.title;

    // 元のタブの後ろに配置
    const tabsContainer = document.getElementById('tabs');
    const originalTabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
    const newTabElement = document.querySelector(`.tab[data-tab-id="${newTabId}"]`);

    if (originalTabElement && newTabElement) {
      originalTabElement.after(newTabElement);
      updateTabsOrder();
    }

    saveTabs();
  }
}

/**
 * 右側のタブをすべて閉じる
 * @param {string} tabId - 基準となるタブID
 */
function closeTabsToRight(tabId) {
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;

  // 基準タブより右側のタブを取得（内部ページは除く）
  const tabsToClose = tabs.slice(tabIndex + 1).filter(t => !t.isInternal);

  // すべて閉じる
  tabsToClose.forEach(tab => {
    closeTab(tab.id);
  });
}

/**
 * すべてのタブを閉じる（内部ページ以外）
 */
function closeAllTabs() {
  const normalTabs = tabs.filter(t => !t.isInternal);

  // 最後の1つは残す
  if (normalTabs.length <= 1) return;

  // 現在のタブ以外をすべて閉じる
  normalTabs.forEach(tab => {
    if (tab.id !== currentTabId) {
      closeTab(tab.id);
    }
  });
}

/**
 * タブグループを作成
 * @param {string} name - グループ名
 * @param {string} colorId - 色ID
 * @returns {string} グループID
 */
function createTabGroup(name, colorId) {
  const groupId = `group-${groupCounter++}`;
  const color = GROUP_COLORS.find(c => c.id === colorId) || GROUP_COLORS[0];

  tabGroups.push({
    id: groupId,
    name: name,
    colorId: colorId,
    color: color.color,
    isCollapsed: true  // 初期状態は閉じている
  });

  return groupId;
}

/**
 * グループヘッダー要素を作成
 * @param {object} group - グループオブジェクト
 * @returns {HTMLElement} グループヘッダー要素
 */
function createGroupHeader(group) {
  const header = document.createElement('div');
  header.className = 'tab-group-header';
  header.dataset.groupId = group.id;
  header.style.backgroundColor = group.color;
  header.draggable = true;
  header.title = group.name; // ツールチップでグループ名を表示

  // 展開状態のクラスを追加
  if (!group.isCollapsed) {
    header.classList.add('expanded');
  }

  const arrow = document.createElement('span');
  arrow.className = 'group-arrow';
  arrow.textContent = group.isCollapsed ? '▶' : '▼';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'group-name';
  nameSpan.textContent = group.name;

  header.appendChild(arrow);
  header.appendChild(nameSpan);

  // クリックで折りたたみ/展開
  header.onclick = (e) => {
    e.stopPropagation();
    toggleGroupCollapse(group.id);
  };

  // 右クリックでグループ管理メニュー
  header.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showGroupManagementMenu(group.id, e.clientX, e.clientY);
  });

  // ドラッグ&ドロップ設定
  setupGroupDragAndDrop(header);

  return header;
}

/**
 * グループコンテナを作成（ヘッダー + タブリスト）
 * @param {Object} group - グループオブジェクト
 * @returns {HTMLElement} グループコンテナ要素
 */
function createGroupContainer(group) {
  const container = document.createElement('div');
  container.className = 'group-container';
  container.dataset.groupId = group.id;
  container.draggable = true;

  // グループヘッダーを作成
  const header = createGroupHeader(group);
  container.appendChild(header);

  // タブラッパーを作成
  const tabsWrapper = document.createElement('div');
  tabsWrapper.className = 'group-tabs-wrapper';
  if (group.isCollapsed) {
    tabsWrapper.classList.add('collapsed');
  }
  tabsWrapper.dataset.groupId = group.id;
  container.appendChild(tabsWrapper);

  // グループコンテナのドラッグ&ドロップを設定
  setupGroupContainerDragAndDrop(container);

  return container;
}

/**
 * グループコンテナのドラッグ&ドロップを設定
 * @param {HTMLElement} containerElement - グループコンテナ要素
 */
function setupGroupContainerDragAndDrop(containerElement) {
  containerElement.addEventListener('dragstart', (e) => {
    // ヘッダー部分をドラッグした場合のみグループ全体を移動
    if (e.target.closest('.tab-group-header')) {
      draggedTabElement = containerElement;
      containerElement.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', containerElement.dataset.groupId);
    } else {
      e.stopPropagation();
    }
  });

  containerElement.addEventListener('dragend', (e) => {
    containerElement.classList.remove('dragging');
    draggedTabElement = null;
    saveTabs();

    // ドラッグ後、グループが開いている場合はタブラッパーの位置を更新
    setTimeout(() => {
      const groupId = containerElement.dataset.groupId;
      const group = tabGroups.find(g => g.id === groupId);
      if (group && !group.isCollapsed) {
        const tabsWrapper = containerElement.querySelector('.group-tabs-wrapper');
        const header = containerElement.querySelector('.tab-group-header');
        if (tabsWrapper && header && !tabsWrapper.classList.contains('collapsed')) {
          const headerRect = header.getBoundingClientRect();
          const wrapperRect = tabsWrapper.getBoundingClientRect();
          const wrapperWidth = wrapperRect.width;

          // ヘッダーの中央に配置
          const centerLeft = headerRect.left + (headerRect.width / 2) - (wrapperWidth / 2);

          tabsWrapper.style.top = '41px';
          tabsWrapper.style.left = `${centerLeft}px`;
        }
      }
    }, 50);
  });

  containerElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedTabElement || draggedTabElement === containerElement) {
      return;
    }

    const tabsContainer = document.getElementById('tabs');
    const afterElement = getDragAfterElement(tabsContainer, e.clientX);

    if (afterElement == null) {
      tabsContainer.appendChild(draggedTabElement);
    } else {
      tabsContainer.insertBefore(draggedTabElement, afterElement);
    }
  });

  containerElement.addEventListener('drop', (e) => {
    e.preventDefault();
  });
}

/**
 * グループヘッダーのドラッグ&ドロップを設定
 * @param {HTMLElement} headerElement - グループヘッダー要素
 */
function setupGroupDragAndDrop(headerElement) {
  headerElement.addEventListener('dragstart', (e) => {
    draggedTabElement = headerElement;
    headerElement.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', headerElement.dataset.groupId);
  });

  headerElement.addEventListener('dragend', (e) => {
    headerElement.classList.remove('dragging');
    draggedTabElement = null;
    saveTabs();

    // ドラッグ後、グループが開いている場合はタブラッパーの位置を更新
    setTimeout(() => {
      const groupId = headerElement.dataset.groupId;
      const group = tabGroups.find(g => g.id === groupId);
      if (group && !group.isCollapsed) {
        const groupContainer = headerElement.closest('.group-container');
        if (groupContainer) {
          const tabsWrapper = groupContainer.querySelector('.group-tabs-wrapper');
          if (tabsWrapper && !tabsWrapper.classList.contains('collapsed')) {
            const headerRect = headerElement.getBoundingClientRect();
            const wrapperRect = tabsWrapper.getBoundingClientRect();
            const wrapperWidth = wrapperRect.width;

            // ヘッダーの中央に配置
            const centerLeft = headerRect.left + (headerRect.width / 2) - (wrapperWidth / 2);

            tabsWrapper.style.top = '41px';
            tabsWrapper.style.left = `${centerLeft}px`;
          }
        }
      }
    }, 50);
  });

  headerElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedTabElement || draggedTabElement === headerElement) {
      return;
    }

    const tabsContainer = document.getElementById('tabs');
    const afterElement = getDragAfterElement(tabsContainer, e.clientX);

    if (afterElement == null) {
      tabsContainer.appendChild(draggedTabElement);
    } else {
      tabsContainer.insertBefore(draggedTabElement, afterElement);
    }
  });

  headerElement.addEventListener('drop', (e) => {
    e.preventDefault();
  });
}

/**
 * すべてのグループを閉じる
 */
function closeAllGroups() {
  tabGroups.forEach(group => {
    if (!group.isCollapsed) {
      group.isCollapsed = true;

      const groupContainer = document.querySelector(`.group-container[data-group-id="${group.id}"]`);
      if (groupContainer) {
        const header = groupContainer.querySelector('.tab-group-header');
        if (header) {
          header.classList.remove('expanded');
        }

        const tabsWrapper = groupContainer.querySelector('.group-tabs-wrapper');
        if (tabsWrapper) {
          tabsWrapper.classList.add('collapsed');
        }
      }
    }
  });
  saveTabs();
}

/**
 * グループの折りたたみ/展開を切り替え
 * @param {string} groupId - グループID
 */
function toggleGroupCollapse(groupId) {
  const group = tabGroups.find(g => g.id === groupId);
  if (!group) return;

  // 他のグループを閉じる
  tabGroups.forEach(g => {
    if (g.id !== groupId && !g.isCollapsed) {
      g.isCollapsed = true;
      const otherContainer = document.querySelector(`.group-container[data-group-id="${g.id}"]`);
      if (otherContainer) {
        const otherHeader = otherContainer.querySelector('.tab-group-header');
        if (otherHeader) {
          otherHeader.classList.remove('expanded');
        }
        const otherWrapper = otherContainer.querySelector('.group-tabs-wrapper');
        if (otherWrapper) {
          otherWrapper.classList.add('collapsed');
        }
      }
    }
  });

  group.isCollapsed = !group.isCollapsed;

  // グループヘッダーの矢印を更新
  const groupContainer = document.querySelector(`.group-container[data-group-id="${groupId}"]`);
  if (groupContainer) {
    const header = groupContainer.querySelector('.tab-group-header');

    // ヘッダーにexpandedクラスを追加/削除
    if (header) {
      if (group.isCollapsed) {
        header.classList.remove('expanded');
      } else {
        header.classList.add('expanded');
      }
    }

    // タブラッパーの表示/非表示を切り替え
    const tabsWrapper = groupContainer.querySelector('.group-tabs-wrapper');
    if (tabsWrapper) {
      if (group.isCollapsed) {
        tabsWrapper.classList.add('collapsed');
      } else {
        tabsWrapper.classList.remove('collapsed');

        // position: fixed なので、ヘッダーの位置を計算して設定
        const header = groupContainer.querySelector('.tab-group-header');
        if (header) {
          const headerRect = header.getBoundingClientRect();

          // タブラッパーの幅を取得（まだレンダリングされていない場合は一時的に表示）
          const wasHidden = tabsWrapper.classList.contains('collapsed');
          if (wasHidden) {
            tabsWrapper.style.visibility = 'hidden';
            tabsWrapper.classList.remove('collapsed');
          }

          const wrapperRect = tabsWrapper.getBoundingClientRect();
          const wrapperWidth = wrapperRect.width;

          if (wasHidden) {
            tabsWrapper.classList.add('collapsed');
            tabsWrapper.style.visibility = '';
          }

          // ヘッダーの中央に配置
          const centerLeft = headerRect.left + (headerRect.width / 2) - (wrapperWidth / 2);

          tabsWrapper.style.top = '41px';
          tabsWrapper.style.left = `${centerLeft}px`;
        }
      }
    }
  }

  saveTabs();
}

/**
 * 展開されているグループの位置を更新
 */
function updateExpandedGroupPositions() {
  tabGroups.forEach(group => {
    if (!group.isCollapsed) {
      const groupContainer = document.querySelector(`.group-container[data-group-id="${group.id}"]`);
      if (groupContainer) {
        const tabsWrapper = groupContainer.querySelector('.group-tabs-wrapper');
        const header = groupContainer.querySelector('.tab-group-header');

        if (tabsWrapper && header && !tabsWrapper.classList.contains('collapsed')) {
          const headerRect = header.getBoundingClientRect();
          const wrapperRect = tabsWrapper.getBoundingClientRect();
          const wrapperWidth = wrapperRect.width;

          // ヘッダーの中央に配置
          const centerLeft = headerRect.left + (headerRect.width / 2) - (wrapperWidth / 2);

          tabsWrapper.style.top = '41px';
          tabsWrapper.style.left = `${centerLeft}px`;
        }
      }
    }
  });
}

/**
 * タブバーを再構築（グループ化を反映）
 */
function rebuildTabBar() {
  const tabsContainer = document.getElementById('tabs');

  // 既存のタブ要素を保持
  const existingTabElements = new Map();
  Array.from(tabsContainer.querySelectorAll('.tab')).forEach(el => {
    existingTabElements.set(el.dataset.tabId, el);
  });

  // 既存のグループコンテナとヘッダーを削除
  tabsContainer.querySelectorAll('.group-container, .tab-group-header').forEach(el => el.remove());

  // グループごとにタブを分類
  const groupedTabs = new Map();
  const ungroupedTabs = [];

  tabs.forEach(tab => {
    if (tab.isInternal) return; // 内部ページは除外

    if (tab.groupId) {
      if (!groupedTabs.has(tab.groupId)) {
        groupedTabs.set(tab.groupId, []);
      }
      groupedTabs.get(tab.groupId).push(tab);
    } else {
      ungroupedTabs.push(tab);
    }
  });

  // グループコンテナを作成して配置
  tabGroups.forEach(group => {
    const groupTabs = groupedTabs.get(group.id);
    if (!groupTabs || groupTabs.length === 0) return;

    // グループコンテナを作成
    const groupContainer = createGroupContainer(group);
    const tabsWrapper = groupContainer.querySelector('.group-tabs-wrapper');

    // グループ内のタブを配置
    groupTabs.forEach(tab => {
      const tabElement = existingTabElements.get(tab.id);
      if (tabElement) {
        tabElement.classList.add('grouped');
        tabsWrapper.appendChild(tabElement);
      }
    });

    tabsContainer.appendChild(groupContainer);
  });

  // グループ化されていないタブを配置
  ungroupedTabs.forEach(tab => {
    const tabElement = existingTabElements.get(tab.id);
    if (tabElement) {
      tabElement.classList.remove('grouped');
      tabsContainer.appendChild(tabElement);
    }
  });
}

/**
 * タブをグループに追加
 * @param {string} tabId - タブID
 * @param {string} groupId - グループID
 */
function addTabToGroup(tabId, groupId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || tab.isInternal) return;

  const group = tabGroups.find(g => g.id === groupId);
  if (!group) return;

  tab.groupId = groupId;

  // タブバーを再構築してグループ化を反映
  rebuildTabBar();

  saveTabs();
}

/**
 * タブをグループから削除
 * @param {string} tabId - タブID
 */
function removeTabFromGroup(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  const oldGroupId = tab.groupId;
  tab.groupId = null;

  // グループが空になった場合は削除
  if (oldGroupId) {
    const groupTabs = tabs.filter(t => t.groupId === oldGroupId && !t.isInternal);
    if (groupTabs.length === 0) {
      // グループをリストから削除
      const groupIndex = tabGroups.findIndex(g => g.id === oldGroupId);
      if (groupIndex !== -1) {
        tabGroups.splice(groupIndex, 1);
      }
    }
  }

  // タブバーを再構築してグループ化を反映
  rebuildTabBar();

  saveTabs();
}

/**
 * グループ削除確認ダイアログを表示
 * @param {string} message - 確認メッセージ
 * @param {Function} onConfirm - 削除確認時のコールバック
 */
function showDeleteGroupDialog(message, onConfirm) {
  const modal = document.getElementById('deleteGroupModal');
  const messageElement = document.getElementById('deleteGroupMessage');
  const confirmButton = document.getElementById('confirmDelete');
  const cancelButton = document.getElementById('cancelDelete');
  const closeButton = document.getElementById('closeDeleteModal');

  messageElement.textContent = message;
  modal.style.display = 'flex';

  const closeModal = () => {
    modal.style.display = 'none';
    confirmButton.onclick = null;
    cancelButton.onclick = null;
    closeButton.onclick = null;
  };

  confirmButton.onclick = () => {
    onConfirm();
    closeModal();
  };

  cancelButton.onclick = closeModal;
  closeButton.onclick = closeModal;

  // 外側をクリックしたら閉じる
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeModal();
    }
  };
}

/**
 * グループ管理メニューを表示
 * @param {string} groupId - グループID
 * @param {number} x - マウスX座標
 * @param {number} y - マウスY座標
 */
function showGroupManagementMenu(groupId, x, y) {
  const group = tabGroups.find(g => g.id === groupId);
  if (!group) return;

  // 既存のメニューを削除
  const existingMenu = document.querySelector('.group-management-menu');
  if (existingMenu) {
    existingMenu.remove();
  }

  // メニュー要素を作成
  const menu = document.createElement('div');
  menu.className = 'tab-context-menu group-management-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.minWidth = '240px';

  // グループ名入力欄
  const nameInputWrapper = document.createElement('div');
  nameInputWrapper.style.padding = '8px';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = group.name;
  nameInput.placeholder = 'グループ名';
  nameInput.style.width = '100%';
  nameInput.style.padding = '6px 8px';
  nameInput.style.background = 'var(--bg-tertiary)';
  nameInput.style.border = '1px solid var(--border-color)';
  nameInput.style.borderRadius = '4px';
  nameInput.style.color = 'var(--text-primary)';
  nameInput.style.fontSize = '13px';
  nameInput.style.outline = 'none';

  nameInput.onblur = () => {
    const newName = nameInput.value.trim();
    if (newName && newName !== group.name) {
      group.name = newName;
      const header = document.querySelector(`.tab-group-header[data-group-id="${groupId}"] .group-name`);
      if (header) {
        header.textContent = newName;
      }
      saveTabs();
    }
  };

  nameInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      nameInput.blur();
    }
  };

  nameInputWrapper.appendChild(nameInput);
  menu.appendChild(nameInputWrapper);

  // カラーパレット
  const colorPaletteWrapper = document.createElement('div');
  colorPaletteWrapper.style.padding = '8px';
  colorPaletteWrapper.style.display = 'flex';
  colorPaletteWrapper.style.gap = '6px';
  colorPaletteWrapper.style.flexWrap = 'wrap';

  GROUP_COLORS.forEach(color => {
    const colorButton = document.createElement('button');
    colorButton.style.width = '20px';
    colorButton.style.height = '20px';
    colorButton.style.borderRadius = '50%';
    colorButton.style.border = group.colorId === color.id ? '2px solid white' : '1px solid var(--border-color)';
    colorButton.style.background = color.color;
    colorButton.style.cursor = 'pointer';
    colorButton.style.padding = '0';
    colorButton.style.outline = 'none';

    colorButton.onclick = () => {
      group.colorId = color.id;
      group.color = color.color;
      const header = document.querySelector(`.tab-group-header[data-group-id="${groupId}"]`);
      if (header) {
        header.style.backgroundColor = color.color;
      }
      saveTabs();
      menu.remove();
    };

    colorPaletteWrapper.appendChild(colorButton);
  });

  menu.appendChild(colorPaletteWrapper);

  // セパレーター
  const separator1 = document.createElement('div');
  separator1.className = 'context-menu-separator';
  menu.appendChild(separator1);

  // メニュー項目
  const menuItems = [
    {
      label: 'グループにタブを追加',
      icon: '➕',
      shortcut: 'Alt+Shift+C',
      action: () => {
        // 現在選択されているタブをグループに追加
        if (currentTabId) {
          const tab = tabs.find(t => t.id === currentTabId);
          if (tab && !tab.isInternal && tab.groupId !== groupId) {
            addTabToGroup(currentTabId, groupId);
          }
        }
        menu.remove();
      }
    },
    {
      label: 'グループを閉じる',
      icon: '📁',
      shortcut: 'Alt+Shift+W',
      action: () => {
        if (!group.isCollapsed) {
          toggleGroupCollapse(groupId);
        }
        menu.remove();
      }
    },
    { separator: true },
    {
      label: 'グループを解除',
      icon: '🔓',
      action: () => {
        const groupTabs = tabs.filter(t => t.groupId === groupId && !t.isInternal);
        showDeleteGroupDialog(
          `グループ「${group.name}」を解除しますか？\nグループ内の${groupTabs.length}個のタブはグループから外されます。`,
          () => {
            tabs.forEach(tab => {
              if (tab.groupId === groupId) {
                tab.groupId = null;
              }
            });

            const groupIndex = tabGroups.findIndex(g => g.id === groupId);
            if (groupIndex !== -1) {
              tabGroups.splice(groupIndex, 1);
            }

            rebuildTabBar();
            saveTabs();
          }
        );
        menu.remove();
      }
    },
    {
      label: 'グループを削除',
      icon: '🗑️',
      action: () => {
        const groupTabs = tabs.filter(t => t.groupId === groupId && !t.isInternal);
        showDeleteGroupDialog(
          `グループ「${group.name}」を削除しますか？\nグループ内の${groupTabs.length}個のタブも閉じられます。`,
          () => {
            groupTabs.forEach(tab => {
              closeTab(tab.id);
            });

            const groupIndex = tabGroups.findIndex(g => g.id === groupId);
            if (groupIndex !== -1) {
              tabGroups.splice(groupIndex, 1);
            }

            rebuildTabBar();
          }
        );
        menu.remove();
      }
    }
  ];

  // メニューアイテムを生成
  menuItems.forEach(item => {
    if (item.separator) {
      const separator = document.createElement('div');
      separator.className = 'context-menu-separator';
      menu.appendChild(separator);
    } else {
      const menuItem = document.createElement('div');
      menuItem.className = 'context-menu-item';

      const content = document.createElement('div');
      content.style.display = 'flex';
      content.style.alignItems = 'center';
      content.style.gap = '8px';
      content.innerHTML = `<span>${item.icon}</span><span style="flex: 1;">${item.label}</span>`;

      if (item.shortcut) {
        const shortcutSpan = document.createElement('span');
        shortcutSpan.textContent = item.shortcut;
        shortcutSpan.style.fontSize = '11px';
        shortcutSpan.style.color = 'var(--text-secondary)';
        content.appendChild(shortcutSpan);
      }

      menuItem.appendChild(content);
      menuItem.onclick = () => {
        item.action();
      };
      menu.appendChild(menuItem);
    }
  });

  // メニューを追加
  document.body.appendChild(menu);

  // 入力欄にフォーカス
  setTimeout(() => {
    nameInput.focus();
    nameInput.select();
  }, 0);

  // 外側をクリックしたら閉じる
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
      // タブグループヘッダーのクリックリスナーを削除
      document.querySelectorAll('.tab-group-header').forEach(header => {
        header.removeEventListener('click', headerClickHandler, true);
      });
    }
  };

  // タブグループヘッダーがクリックされたらメニューを閉じる（キャプチャフェーズ）
  const headerClickHandler = (e) => {
    e.stopPropagation();
    e.preventDefault();
    menu.remove();
    document.removeEventListener('click', closeMenu);
    // 自分自身も削除
    document.querySelectorAll('.tab-group-header').forEach(header => {
      header.removeEventListener('click', headerClickHandler, true);
    });
  };

  // 全てのタブグループヘッダーにキャプチャフェーズのクリックリスナーを追加
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
    document.querySelectorAll('.tab-group-header').forEach(header => {
      header.addEventListener('click', headerClickHandler, true);
    });
  }, 0);
}

/**
 * グループの色選択メニューを表示
 * @param {string} groupId - グループID
 * @param {number} x - マウスX座標
 * @param {number} y - マウスY座標
 */
function showGroupColorMenu(groupId, x, y) {
  const group = tabGroups.find(g => g.id === groupId);
  if (!group) return;

  // 既存のメニューを削除
  const existingMenu = document.querySelector('.group-color-menu');
  if (existingMenu) {
    existingMenu.remove();
  }

  // メニュー要素を作成
  const menu = document.createElement('div');
  menu.className = 'tab-context-menu group-color-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // ヘッダー
  const header = document.createElement('div');
  header.className = 'context-menu-item';
  header.style.fontWeight = 'bold';
  header.style.cursor = 'default';
  header.innerHTML = '🎨 色を選択';
  menu.appendChild(header);

  // セパレーター
  const separator = document.createElement('div');
  separator.className = 'context-menu-separator';
  menu.appendChild(separator);

  // 各色のオプション
  GROUP_COLORS.forEach(colorOption => {
    const colorItem = document.createElement('div');
    colorItem.className = 'context-menu-item';

    const isCurrentColor = group.colorId === colorOption.id;
    const checkmark = isCurrentColor ? '✓ ' : '';

    colorItem.innerHTML = `${checkmark}<span style="color: ${colorOption.color}">●</span> ${colorOption.label}`;

    colorItem.onclick = () => {
      // グループの色を変更
      group.colorId = colorOption.id;
      group.color = colorOption.color;

      // グループヘッダーの色を更新
      const header = document.querySelector(`.tab-group-header[data-group-id="${groupId}"]`);
      if (header) {
        header.style.backgroundColor = colorOption.color;
      }

      // グループ内のすべてのタブの色を更新
      tabs.forEach(tab => {
        if (tab.groupId === groupId) {
          const tabElement = document.querySelector(`.tab[data-tab-id="${tab.id}"]`);
          if (tabElement) {
            tabElement.style.borderBottom = `3px solid ${colorOption.color}`;
          }
        }
      });

      saveTabs();
      menu.remove();
    };

    menu.appendChild(colorItem);
  });

  // メニューを追加
  document.body.appendChild(menu);

  // 外側をクリックしたら閉じる
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);
}

/**
 * タブグループメニューを表示
 * @param {string} tabId - タブID
 * @param {number} x - マウスX座標
 * @param {number} y - マウスY座標
 */
function showTabGroupMenu(tabId, x, y) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || tab.isInternal) return;

  // 既存のメニューを削除
  const existingMenu = document.querySelector('.tab-group-menu');
  if (existingMenu) {
    existingMenu.remove();
  }

  // メニュー要素を作成
  const menu = document.createElement('div');
  menu.className = 'tab-context-menu tab-group-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // ヘッダー
  const header = document.createElement('div');
  header.className = 'context-menu-item';
  header.style.fontWeight = 'bold';
  header.style.cursor = 'default';
  header.innerHTML = '🎨 グループに追加';
  menu.appendChild(header);

  // セパレーター
  const separator1 = document.createElement('div');
  separator1.className = 'context-menu-separator';
  menu.appendChild(separator1);

  // 新しいグループを作成
  const createNewGroup = document.createElement('div');
  createNewGroup.className = 'context-menu-item';
  createNewGroup.innerHTML = '➕ 新しいグループ';
  createNewGroup.onclick = () => {
    menu.remove();
    showCreateGroupModal(tabId);
  };
  menu.appendChild(createNewGroup);

  // 既存のグループ
  if (tabGroups.length > 0) {
    const separator2 = document.createElement('div');
    separator2.className = 'context-menu-separator';
    menu.appendChild(separator2);

    tabGroups.forEach(group => {
      const groupItem = document.createElement('div');
      groupItem.className = 'context-menu-item';
      groupItem.innerHTML = `<span style="color: ${group.color}">●</span> ${group.name}`;
      groupItem.onclick = () => {
        addTabToGroup(tabId, group.id);
        menu.remove();
      };
      menu.appendChild(groupItem);
    });
  }

  // グループから削除（既にグループに属している場合）
  if (tab.groupId) {
    const separator3 = document.createElement('div');
    separator3.className = 'context-menu-separator';
    menu.appendChild(separator3);

    const removeFromGroup = document.createElement('div');
    removeFromGroup.className = 'context-menu-item';
    removeFromGroup.innerHTML = '🗑️ グループから削除';
    removeFromGroup.onclick = () => {
      removeTabFromGroup(tabId);
      menu.remove();
    };
    menu.appendChild(removeFromGroup);
  }

  // メニューを追加
  document.body.appendChild(menu);

  // 外側をクリックしたら閉じる
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);
}

/**
 * タブをメインブラウザに送信
 * @param {string} tabId - タブID
 */
async function sendTabToMainBrowser(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  // 内部ページは送信できない
  if (tab.isInternal) {
    console.warn('[PeekPanel] Cannot send internal pages to main browser');
    showErrorNotification('内部ページはメインブラウザに送信できません');
    return;
  }

  // chrome:// などの特殊URLも送信できない
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url === 'about:blank') {
    console.warn('[PeekPanel] Cannot send chrome:// URLs to main browser');
    showErrorNotification('この種類のページは送信できません');
    return;
  }

  try {
    // 通常タブの残数を確認
    const normalTabs = tabs.filter(t => !t.isInternal);

    if (normalTabs.length === 1 && normalTabs[0].id === tabId) {
      // 最後の1つなので、デフォルトAIを開く
      createTab(DEFAULT_AIS[0].url, true);
    }

    // メインブラウザで新しいタブとして開く
    await chrome.tabs.create({
      url: tab.url,
      active: true
    });

    // サブパネルの元のタブを閉じる（移動）
    closeTab(tabId);

    console.log('[PeekPanel] Tab sent to main browser:', tab.url);
  } catch (error) {
    console.error('[PeekPanel] Error sending tab to main browser:', error);
    showErrorNotification('タブの送信に失敗しました');
  }
}

/**
 * タブの右クリックメニューを表示
 * @param {string} tabId - タブID
 * @param {number} x - マウスX座標
 * @param {number} y - マウスY座標
 */
function showTabContextMenu(tabId, x, y) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  // 既存のメニューを削除
  const existingMenu = document.querySelector('.tab-context-menu');
  if (existingMenu) {
    existingMenu.remove();
  }

  // メニュー要素を作成
  const menu = document.createElement('div');
  menu.className = 'tab-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // タブの位置を取得
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  const normalTabs = tabs.filter(t => !t.isInternal);
  const hasTabsToRight = tabs.slice(tabIndex + 1).filter(t => !t.isInternal).length > 0;

  // メニュー項目
  const menuItems = [
    {
      label: tab.isPinned ? 'ピン留めを解除' : 'タブをピン留め',
      icon: '📌',
      action: () => togglePinTab(tabId),
      hide: tab.isInternal
    },
    {
      label: tab.isMuted ? 'ミュートを解除' : 'タブをミュート',
      icon: tab.isMuted ? '🔊' : '🔇',
      action: () => toggleMuteTab(tabId),
      hide: tab.isInternal
    },
    {
      label: 'タブを複製',
      icon: '📋',
      action: () => duplicateTab(tabId),
      hide: tab.isInternal
    },
    {
      label: 'グループに追加',
      icon: '🎨',
      action: () => {
        menu.remove();
        showTabGroupMenu(tabId, x, y);
      },
      hide: tab.isInternal
    },
    { separator: true },
    {
      label: 'メインブラウザで開く',
      icon: '🔗',
      action: () => sendTabToMainBrowser(tabId),
      hide: tab.isInternal
    },
    { separator: true, hide: tab.isInternal },
    {
      label: 'タブを閉じる',
      icon: '✕',
      action: () => closeTab(tabId)
    }
  ];

  // メニューアイテムを生成
  menuItems.forEach(item => {
    // hideフラグがtrueの場合はスキップ
    if (item.hide) return;

    if (item.separator) {
      const separator = document.createElement('div');
      separator.className = 'context-menu-separator';
      menu.appendChild(separator);
    } else {
      const menuItem = document.createElement('div');
      menuItem.className = 'context-menu-item';
      if (item.disabled) {
        menuItem.classList.add('disabled');
      }
      menuItem.innerHTML = `${item.icon} ${item.label}`;
      menuItem.onclick = () => {
        if (!item.disabled) {
          item.action();
          menu.remove();
        }
      };
      menu.appendChild(menuItem);
    }
  });

  // メニューを追加
  document.body.appendChild(menu);

  // 外側をクリックしたら閉じる
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);
}

/**
 * 指定したタブ以外をすべて閉じる
 * @param {string} excludeTabId - 残すタブのID
 */
function closeOtherTabs(excludeTabId) {
  // 内部ページ以外のタブを取得
  const tabsToClose = tabs.filter(t => !t.isInternal && t.id !== excludeTabId);

  // すべて閉じる
  tabsToClose.forEach(tab => {
    closeTab(tab.id);
  });
}

/**
 * エラー通知を表示
 * @param {string} message - エラーメッセージ
 */
function showErrorNotification(message) {
  // 簡易的なトースト通知
  const notification = document.createElement('div');
  notification.className = 'toast-notification error';
  notification.textContent = message;
  document.body.appendChild(notification);

  // 3秒後に消す
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * グループ名変更モーダルを表示
 * @param {string} groupId - グループID
 */
function showRenameGroupModal(groupId) {
  const group = tabGroups.find(g => g.id === groupId);
  if (!group) return;

  const modal = document.getElementById('renameGroupModal');
  const nameInput = document.getElementById('renameGroupInput');
  const confirmButton = document.getElementById('confirmRenameModal');

  // 現在の名前を設定
  nameInput.value = group.name;

  // モーダルを表示
  modal.style.display = 'flex';
  nameInput.focus();
  nameInput.select();

  // 確認ボタンのクリックハンドラー
  const handleConfirm = () => {
    const newName = nameInput.value.trim();
    if (newName) {
      group.name = newName;

      // グループヘッダーの名前を更新
      const groupHeader = document.querySelector(`.tab-group-header[data-group-id="${groupId}"]`);
      if (groupHeader) {
        const nameSpan = groupHeader.querySelector('.group-name');
        if (nameSpan) {
          nameSpan.textContent = newName;
        }
      }

      saveTabs();
      modal.style.display = 'none';
      cleanup();
    }
  };

  // キャンセルハンドラー
  const handleCancel = () => {
    modal.style.display = 'none';
    cleanup();
  };

  // クリーンアップ
  const cleanup = () => {
    confirmButton.removeEventListener('click', handleConfirm);
    document.getElementById('cancelRenameModal').removeEventListener('click', handleCancel);
    document.getElementById('closeRenameModal').removeEventListener('click', handleCancel);
    nameInput.removeEventListener('keydown', handleKeyDown);
  };

  // Enterキーで確認
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  confirmButton.addEventListener('click', handleConfirm);
  document.getElementById('cancelRenameModal').addEventListener('click', handleCancel);
  document.getElementById('closeRenameModal').addEventListener('click', handleCancel);
  nameInput.addEventListener('keydown', handleKeyDown);
}

/**
 * グループ作成モーダルを表示
 * @param {string} tabId - タブID
 */
function showCreateGroupModal(tabId) {
  const modal = document.getElementById('createGroupModal');
  const nameInput = document.getElementById('groupNameInput');
  const colorPicker = document.getElementById('groupColorPicker');
  const confirmButton = document.getElementById('confirmGroupModal');

  // 入力をリセット
  nameInput.value = '';

  // カラーピッカーを生成
  colorPicker.innerHTML = '';
  let selectedColorId = GROUP_COLORS[0].id; // デフォルトは最初の色

  GROUP_COLORS.forEach((colorOption, index) => {
    const colorDiv = document.createElement('div');
    colorDiv.className = 'group-color-option';
    colorDiv.style.backgroundColor = colorOption.color;
    colorDiv.style.color = colorOption.color;
    if (index === 0) {
      colorDiv.classList.add('selected');
    }

    const checkmark = document.createElement('span');
    checkmark.className = 'checkmark';
    checkmark.textContent = '✓';
    colorDiv.appendChild(checkmark);

    colorDiv.onclick = () => {
      // すべての選択を解除
      colorPicker.querySelectorAll('.group-color-option').forEach(el => {
        el.classList.remove('selected');
      });
      // 選択状態にする
      colorDiv.classList.add('selected');
      selectedColorId = colorOption.id;
    };

    colorPicker.appendChild(colorDiv);
  });

  // モーダルを表示
  modal.style.display = 'flex';
  nameInput.focus();

  // 確認ボタンのクリックハンドラー
  const handleConfirm = () => {
    const groupName = nameInput.value.trim();
    if (groupName) {
      const groupId = createTabGroup(groupName, selectedColorId);
      addTabToGroup(tabId, groupId);
      modal.style.display = 'none';
      cleanup();
    }
  };

  // キャンセルハンドラー
  const handleCancel = () => {
    modal.style.display = 'none';
    cleanup();
  };

  // クリーンアップ
  const cleanup = () => {
    confirmButton.removeEventListener('click', handleConfirm);
    document.getElementById('cancelGroupModal').removeEventListener('click', handleCancel);
    document.getElementById('closeGroupModal').removeEventListener('click', handleCancel);
    nameInput.removeEventListener('keydown', handleKeyDown);
  };

  // Enterキーで確認
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  confirmButton.addEventListener('click', handleConfirm);
  document.getElementById('cancelGroupModal').addEventListener('click', handleCancel);
  document.getElementById('closeGroupModal').addEventListener('click', handleCancel);
  nameInput.addEventListener('keydown', handleKeyDown);
}

// 初期化
(async function init() {
  await setupHeaderRemoval();

  // 閉じたタブの履歴を復元
  await restoreClosedTabsHistory();

  // 保存されたタブを復元
  const restored = await restoreTabs();

  // 復元できなかった場合はデフォルトのタブを作成
  if (!restored) {
    DEFAULT_AIS.forEach((ai, index) => {
      createTab(ai.url, index === 0);
    });
  }

  // 右クリックメニューからのURL確認
  const { pendingUrl } = await chrome.storage.local.get('pendingUrl');
  if (pendingUrl) {
    createTab(pendingUrl, true);
    chrome.storage.local.remove('pendingUrl');
  }

  // AI選択を読み込み
  await loadAISelection();

  // パネルを開く時は全てのグループを閉じた状態でスタート
  tabGroups.forEach(group => {
    group.isCollapsed = true;
  });

  // タブバーを再構築してグループ化を反映
  rebuildTabBar();

  // 送信ボタンのイベントリスナー
  document.getElementById('sendToMainBrowser').addEventListener('click', () => {
    if (currentTabId) {
      sendTabToMainBrowser(currentTabId);
    }
  });

  // タブスリープチェッカーを1分ごとに実行
  setInterval(checkAndSleepTabs, 60 * 1000);

  // パネルを閉じる時にすべてのグループを閉じる
  window.addEventListener('beforeunload', () => {
    closeAllGroups();
  });

  // パネルが非表示になる時にすべてのグループを閉じる
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      closeAllGroups();
    }
  });

  // iframeクリック時にグループを閉じる
  const iframeContainer = document.getElementById('iframeContainer');
  if (iframeContainer) {
    iframeContainer.addEventListener('click', () => {
      closeAllGroups();
    }, true); // キャプチャフェーズで検知
  }

  // キーボードショートカット
  document.addEventListener('keydown', (e) => {
    // Alt+Shift+C: 現在のタブを最初の開いているグループに追加
    if (e.altKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      const openGroup = tabGroups.find(g => !g.isCollapsed);
      if (openGroup && currentTabId) {
        const tab = tabs.find(t => t.id === currentTabId);
        if (tab && !tab.isInternal && tab.groupId !== openGroup.id) {
          addTabToGroup(currentTabId, openGroup.id);
        }
      }
    }

    // Alt+Shift+W: 開いているグループを閉じる
    if (e.altKey && e.shiftKey && e.key === 'W') {
      e.preventDefault();
      const openGroup = tabGroups.find(g => !g.isCollapsed);
      if (openGroup) {
        toggleGroupCollapse(openGroup.id);
      }
    }
  });
})();