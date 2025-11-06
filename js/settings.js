// デフォルトプロンプト定義
const DEFAULT_PROMPTS = [
  {
    id: 'default-cleanup',
    name: '清書する',
    prompt: '次の文章を読みやすく清書してください:\n\n{text}',
    enabled: true,
    isDefault: true
  },
  {
    id: 'default-summary',
    name: '要約する',
    prompt: '次の文章を簡潔に要約してください:\n\n{text}',
    enabled: true,
    isDefault: true
  },
  {
    id: 'default-translate',
    name: '英語に翻訳',
    prompt: '次の文章を英語に翻訳してください:\n\n{text}',
    enabled: true,
    isDefault: true
  },
  {
    id: 'default-professional',
    name: 'ビジネス文書化',
    prompt: '次の文章をビジネス文書として整形してください:\n\n{text}',
    enabled: true,
    isDefault: true
  }
];

// 設定を読み込み
async function loadSettings() {
  const { autoSubmit, autoSleepEnabled, autoSleepMinutes, noSleepDomains } = await chrome.storage.sync.get({
    autoSubmit: false,
    autoSleepEnabled: true,
    autoSleepMinutes: 5,
    noSleepDomains: ['youtube.com', 'youtu.be', 'music.youtube.com', 'twitch.tv']
  });

  // 自動送信のチェックボックスを設定
  const autoSubmitCheckbox = document.getElementById('auto-submit');
  if (autoSubmitCheckbox) {
    autoSubmitCheckbox.checked = autoSubmit;
  }

  // タブの自動スリープのチェックボックスを設定
  const autoSleepCheckbox = document.getElementById('auto-sleep-enabled');
  if (autoSleepCheckbox) {
    autoSleepCheckbox.checked = autoSleepEnabled;
  }

  // スリープまでの時間を設定
  const autoSleepMinutesInput = document.getElementById('auto-sleep-minutes');
  if (autoSleepMinutesInput) {
    autoSleepMinutesInput.value = autoSleepMinutes;
  }

  // スリープ禁止ドメインを設定
  const noSleepDomainsTextarea = document.getElementById('no-sleep-domains');
  if (noSleepDomainsTextarea) {
    noSleepDomainsTextarea.value = noSleepDomains.join('\n');
  }
}

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

// 設定を保存
async function saveSettings() {
  const autoSubmit = document.getElementById('auto-submit')?.checked || false;
  const autoSleepEnabled = document.getElementById('auto-sleep-enabled')?.checked || false;
  const autoSleepMinutes = parseInt(document.getElementById('auto-sleep-minutes')?.value || '5', 10);

  // スリープ禁止ドメインを取得（改行で分割し、空行を除外）
  const noSleepDomainsText = document.getElementById('no-sleep-domains')?.value || '';
  const noSleepDomains = noSleepDomainsText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // 設定を保存
  await chrome.storage.sync.set({
    autoSubmit: autoSubmit,
    autoSleepEnabled: autoSleepEnabled,
    autoSleepMinutes: autoSleepMinutes,
    noSleepDomains: noSleepDomains
  });

  // 保存成功メッセージを表示
  showToast('設定を保存しました');
}

// 保存ボタンのイベントリスナー
document.getElementById('saveButton').addEventListener('click', saveSettings);

// 閉じるボタンのイベントリスナー
document.getElementById('closeButton').addEventListener('click', () => {
  window.parent.postMessage({
    type: 'closeSettingsPage'
  }, '*');
});

// 履歴ボタンのイベントリスナー
document.getElementById('historyButton').addEventListener('click', () => {
  window.parent.postMessage({
    type: 'openHistoryPage'
  }, '*');
});

// カスタムプロンプトを読み込み
async function loadCustomPrompts() {
  const { customPrompts, disabledDefaultPrompts } = await chrome.storage.sync.get({
    customPrompts: [],
    disabledDefaultPrompts: []
  });

  const container = document.getElementById('customPromptsContainer');
  if (!container) return;

  // 既存の表示をクリア
  container.innerHTML = '';

  // デフォルトプロンプトの有効/無効を設定
  const defaultPrompts = DEFAULT_PROMPTS.map(p => ({
    ...p,
    enabled: !disabledDefaultPrompts.includes(p.id)
  }));

  // デフォルトプロンプトとカスタムプロンプトを結合
  const allPrompts = [...defaultPrompts, ...customPrompts];

  // プロンプトカードを表示
  allPrompts.forEach(prompt => {
    const card = createPromptCard(prompt);
    container.appendChild(card);
  });
}

// プロンプトカードを作成
function createPromptCard(prompt) {
  const card = document.createElement('div');
  card.className = 'prompt-card';
  card.dataset.promptId = prompt.id;

  // 有効/無効のクラス
  if (!prompt.enabled) {
    card.classList.add('disabled');
  }

  card.innerHTML = `
    <div class="prompt-header">
      <div class="prompt-icon">📝</div>
      <div class="prompt-name">${prompt.name}</div>
      ${prompt.isDefault ? '<span class="default-badge">デフォルト</span>' : ''}
    </div>
    <div class="prompt-text">${prompt.prompt.replace(/{text}/g, '{選択テキスト}')}</div>
    <div class="prompt-actions">
      <label class="toggle-label">
        <input type="checkbox" ${prompt.enabled ? 'checked' : ''} data-prompt-id="${prompt.id}">
        有効
      </label>
      <button class="button button-small button-normal edit-prompt-btn" data-prompt-id="${prompt.id}">編集</button>
      ${!prompt.isDefault ? `<button class="button button-small button-danger delete-prompt-btn" data-prompt-id="${prompt.id}">削除</button>` : ''}
    </div>
  `;

  // イベントリスナーを追加
  const checkbox = card.querySelector('input[type="checkbox"]');
  checkbox.addEventListener('change', (e) => {
    togglePrompt(prompt.id, e.target.checked);
  });

  const editBtn = card.querySelector('.edit-prompt-btn');
  editBtn.addEventListener('click', () => {
    editPrompt(prompt.id);
  });

  if (!prompt.isDefault) {
    const deleteBtn = card.querySelector('.delete-prompt-btn');
    deleteBtn.addEventListener('click', () => {
      deletePrompt(prompt.id);
    });
  }

  return card;
}

// カスタムプロンプトを保存
async function saveCustomPrompts(prompts) {
  await chrome.storage.sync.set({ customPrompts: prompts });
  console.log('[PeekPanel] Custom prompts saved:', prompts);
}

// 新しいプロンプトを追加
function addNewPrompt() {
  // モーダルを開く
  document.getElementById('modalTitle').textContent = 'プロンプトを追加';
  document.getElementById('promptName').value = '';
  document.getElementById('promptText').value = '';
  document.getElementById('promptModal').style.display = 'flex';

  // 保存ボタンのイベント
  document.getElementById('savePromptButton').onclick = async () => {
    const name = document.getElementById('promptName').value.trim();
    const prompt = document.getElementById('promptText').value.trim();

    if (!name || !prompt) {
      alert('プロンプト名とプロンプト文を入力してください');
      return;
    }

    // 新しいプロンプトを作成
    const { customPrompts } = await chrome.storage.sync.get({ customPrompts: [] });
    const newPrompt = {
      id: `custom-${Date.now()}`,
      name: name,
      prompt: prompt,
      enabled: true,
      isDefault: false,
      createdAt: Date.now()
    };

    customPrompts.push(newPrompt);
    await saveCustomPrompts(customPrompts);

    // UIを更新
    closePromptModal();
    loadCustomPrompts();

    // 成功メッセージを表示
    showToast('プロンプトを追加しました');
  };
}

// プロンプトを編集
async function editPrompt(promptId) {
  const { customPrompts, disabledDefaultPrompts } = await chrome.storage.sync.get({
    customPrompts: [],
    disabledDefaultPrompts: []
  });

  const defaultPrompts = DEFAULT_PROMPTS.map(p => ({
    ...p,
    enabled: !disabledDefaultPrompts.includes(p.id)
  }));
  const allPrompts = [...defaultPrompts, ...customPrompts];
  const prompt = allPrompts.find(p => p.id === promptId);

  if (!prompt) return;

  // モーダルを開く
  document.getElementById('modalTitle').textContent = 'プロンプトを編集';
  document.getElementById('promptName').value = prompt.name;
  document.getElementById('promptText').value = prompt.prompt;
  document.getElementById('promptModal').style.display = 'flex';

  // 保存ボタンのイベント
  document.getElementById('savePromptButton').onclick = async () => {
    const name = document.getElementById('promptName').value.trim();
    const promptText = document.getElementById('promptText').value.trim();

    if (!name || !promptText) {
      alert('プロンプト名とプロンプト文を入力してください');
      return;
    }

    // デフォルトプロンプトの場合はカスタムプロンプトとして保存
    if (prompt.isDefault) {
      // デフォルトを無効化
      if (!disabledDefaultPrompts.includes(promptId)) {
        disabledDefaultPrompts.push(promptId);
        await chrome.storage.sync.set({ disabledDefaultPrompts });
      }

      // デフォルトをコピーしてカスタムに
      const newCustomPrompt = {
        id: `custom-${Date.now()}`,
        name: name,
        prompt: promptText,
        enabled: true,
        isDefault: false,
        createdAt: Date.now()
      };
      customPrompts.push(newCustomPrompt);
    } else {
      // カスタムプロンプトを更新
      const index = customPrompts.findIndex(p => p.id === promptId);
      if (index !== -1) {
        customPrompts[index].name = name;
        customPrompts[index].prompt = promptText;
      }
    }

    await saveCustomPrompts(customPrompts);

    // UIを更新
    closePromptModal();
    loadCustomPrompts();

    // 成功メッセージを表示
    showToast('プロンプトを保存しました');
  };
}

// プロンプトを削除
function deletePrompt(promptId) {
  // 削除確認モーダルを表示
  const modal = document.getElementById('deleteConfirmModal');
  modal.style.display = 'flex';

  // 削除ボタンのイベント（一度だけ実行）
  const confirmBtn = document.getElementById('confirmDeleteButton');
  confirmBtn.onclick = async () => {
    const { customPrompts } = await chrome.storage.sync.get({ customPrompts: [] });
    const filtered = customPrompts.filter(p => p.id !== promptId);

    await saveCustomPrompts(filtered);
    loadCustomPrompts();

    // モーダルを閉じる
    closeDeleteConfirmModal();

    // 削除成功メッセージを表示
    showToast('プロンプトを削除しました');
  };
}

// プロンプトの有効/無効を切り替え
async function togglePrompt(promptId, enabled) {
  const { customPrompts, disabledDefaultPrompts } = await chrome.storage.sync.get({
    customPrompts: [],
    disabledDefaultPrompts: []
  });

  // カスタムプロンプトの場合
  const prompt = customPrompts.find(p => p.id === promptId);
  if (prompt) {
    prompt.enabled = enabled;
    await saveCustomPrompts(customPrompts);
  }

  // デフォルトプロンプトの場合
  if (promptId.startsWith('default-')) {
    if (enabled) {
      // 有効化：リストから削除
      const filtered = disabledDefaultPrompts.filter(id => id !== promptId);
      await chrome.storage.sync.set({ disabledDefaultPrompts: filtered });
    } else {
      // 無効化：リストに追加
      if (!disabledDefaultPrompts.includes(promptId)) {
        disabledDefaultPrompts.push(promptId);
        await chrome.storage.sync.set({ disabledDefaultPrompts });
      }
    }
  }
}

// プロンプトモーダルを閉じる
function closePromptModal() {
  document.getElementById('promptModal').style.display = 'none';
}

// 削除確認モーダルを閉じる
function closeDeleteConfirmModal() {
  document.getElementById('deleteConfirmModal').style.display = 'none';
}

// 初期化
loadSettings();
loadCustomPrompts();

// 新規追加ボタン
document.getElementById('addPromptButton').addEventListener('click', addNewPrompt);

// プロンプト編集モーダル閉じるボタン
document.getElementById('modalCloseButton').addEventListener('click', closePromptModal);
document.getElementById('modalCancelButton').addEventListener('click', closePromptModal);

// 削除確認モーダル閉じるボタン
document.getElementById('deleteModalCloseButton').addEventListener('click', closeDeleteConfirmModal);
document.getElementById('deleteModalCancelButton').addEventListener('click', closeDeleteConfirmModal);
