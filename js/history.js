// 履歴を表示
async function displayHistory() {
  const container = document.getElementById('historyContainer');
  const { closedTabsHistory } = await chrome.storage.local.get('closedTabsHistory');

  if (!closedTabsHistory || closedTabsHistory.length === 0) {
    container.innerHTML = '<div class="empty-message">最近閉じたタブはありません</div>';
    return;
  }

  const list = document.createElement('ul');
  list.className = 'history-list';

  closedTabsHistory.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'history-item';

    const favicon = document.createElement('img');
    favicon.className = 'history-favicon';
    favicon.src = item.favicon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="20" font-size="20">🌐</text></svg>';
    favicon.onerror = () => {
      favicon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="20" font-size="20">🌐</text></svg>';
    };

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

// 時間の経過を表示
function getTimeAgo(timestamp) {
  const date = new Date(timestamp);
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  // 日付の文字列を生成
  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  // 経過時間の文字列を生成
  let timeAgoStr;
  if (days > 0) {
    timeAgoStr = `${days}日前`;
  } else if (hours > 0) {
    timeAgoStr = `${hours}時間前`;
  } else if (minutes > 0) {
    timeAgoStr = `${minutes}分前`;
  } else {
    timeAgoStr = 'たった今';
  }

  return `${dateStr} (${timeAgoStr})`;
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
  }, '*');
}

// 閉じるボタン
document.getElementById('closeButton').addEventListener('click', () => {
  window.parent.postMessage({
    type: 'closeHistoryPage'
  }, '*');
});

// トースト通知を表示
function showToast(message, type = 'success') {
  const statusMessage = document.getElementById('statusMessage');
  statusMessage.textContent = type === 'success' ? `✓ ${message}` : message;
  statusMessage.className = `status-message ${type} show`;

  // 2秒後にフェードアウト開始
  setTimeout(() => {
    statusMessage.style.animation = 'slideUp 0.3s ease-out forwards';
    setTimeout(() => {
      statusMessage.classList.remove('show');
      statusMessage.style.animation = '';
    }, 300);
  }, 2000);
}

// 履歴クリア確認モーダルを閉じる
function closeClearConfirmModal() {
  document.getElementById('clearConfirmModal').style.display = 'none';
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
    document.getElementById('historyContainer').innerHTML = '';
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
    document.getElementById('historyContainer').innerHTML = '';
    displayHistory();
  }
});
