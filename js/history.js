// 共通モジュールから���ンポート
import { applyFaviconWithFallback } from './utils/favicon.js';
import { getTimeAgo } from './utils/timeHelper.js';
import { showToast, hideModal } from './utils/uiHelper.js';

// Extension origin for secure postMessage
const EXTENSION_ORIGIN = chrome.runtime?.getURL('').slice(0, -1) || '*';

// 履歴を表示
async function displayHistory() {
  const container = document.getElementById('historyContainer');
  const { closedTabsHistory } = await chrome.storage.local.get('closedTabsHistory');

  if (!closedTabsHistory || closedTabsHistory.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'empty-message';
    emptyMessage.textContent = '最近閉じたタブはありません';
    container.replaceChildren(emptyMessage);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'history-list';

  closedTabsHistory.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'history-item';

    const favicon = document.createElement('img');
    favicon.className = 'history-favicon';

    // ファビコンを設定（共通関数を使用）
    applyFaviconWithFallback(favicon, item.url, item.faviconUrl);

    const info = document.createElement('div');
    info.className = 'history-info';

    const title = document.createElement('div');
    title.className = 'history-title';
    title.textContent = item.title || item.url;

    const url = document.createElement('div');
    url.className = 'history-url';
    url.textContent = item.url;

    info.appendChild(title);
    info.appendChild(url);

    const time = document.createElement('div');
    time.className = 'history-time';
    time.textContent = getTimeAgo(item.timestamp);

    li.appendChild(favicon);
    li.appendChild(info);
    li.appendChild(time);

    li.addEventListener('click', () => {
      restoreTab(index);
    });

    list.appendChild(li);
  });

  container.appendChild(list);
}

// タブを復元
async function restoreTab(index) {
  const { closedTabsHistory } = await chrome.storage.local.get('closedTabsHistory');
  if (!closedTabsHistory || index >= closedTabsHistory.length) return;

  const closedTab = closedTabsHistory[index];

  // 親ウィンドウ（panel.js）にメッセージを送信
  window.parent.postMessage({
    type: 'restoreTab',
    tabData: closedTab,
    index: index
  }, EXTENSION_ORIGIN);
}

// 閉じるボタン
document.getElementById('closeButton').addEventListener('click', () => {
  window.parent.postMessage({
    type: 'closeHistory'
  }, EXTENSION_ORIGIN);
});

// 履歴クリア確認モーダルを閉じる
function closeClearConfirmModal() {
  hideModal('clearConfirmModal');
}

// 履歴クリアボタン
document.getElementById('clearButton').addEventListener('click', () => {
  // 履歴クリア確認モーダルを表示
  const modal = document.getElementById('clearConfirmModal');
  modal.style.display = 'flex';

  // クリアボタンのイベント
  const confirmBtn = document.getElementById('confirmClearButton');
  confirmBtn.onclick = async () => {
    await chrome.storage.local.set({ closedTabsHistory: [] });
    document.getElementById('historyContainer').replaceChildren();
    displayHistory();

    // モーダルを閉じる
    closeClearConfirmModal();

    // 成功メッセージを表示
    showToast('履歴をクリアしました');
  };
});

// 履歴クリア確認モーダル閉じるボタン
document.getElementById('clearModalCloseButton').addEventListener('click', closeClearConfirmModal);
document.getElementById('clearModalCancelButton').addEventListener('click', closeClearConfirmModal);

// 初期化
displayHistory();

// ストレージの変更を監視して自動更新
chrome.storage.onChanged.addListener((changes) => {
  if (changes.closedTabsHistory) {
    document.getElementById('historyContainer').replaceChildren();
    displayHistory();
  }
});
