import { GROUP_COLORS } from '../config/constants.js';

/**
 * モーダル管理クラス
 * グループ作成・削除・解除のモーダルを管理
 */
export class ModalManager {
  constructor(groupManager, tabUI, groupUI) {
    this.groupManager = groupManager;
    this.tabUI = tabUI;
    this.groupUI = groupUI;
  }

  /**
   * グループ作成モーダルを表示
   * @param {string} tabId - グループに追加するタブID
   */
  showCreateGroupModal(tabId) {
    console.log('[ModalManager] showCreateGroupModal called with tabId:', tabId);

    const modal = document.createElement('div');
    modal.className = 'group-modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="group-modal-content">
        <div class="group-modal-header">
          <h2>新しいグループを作成</h2>
          <button class="group-modal-close">✕</button>
        </div>
        <div class="group-modal-body">
          <div class="group-form-field">
            <label>グループ名</label>
            <input type="text" id="groupNameInput" placeholder="グループ名" maxlength="30">
          </div>
          <div class="group-form-field">
            <label>グループの色</label>
            <div class="group-color-picker">
              ${GROUP_COLORS.map(color => `
                <div class="group-color-option" data-color-id="${color.id}" style="background: ${color.color};" title="${color.label}">
                  <span class="checkmark">✓</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="group-modal-footer">
          <button class="group-modal-button secondary cancel-button">キャンセル</button>
          <button class="group-modal-button primary create-button">作成</button>
        </div>
      </div>
    `;

    let selectedColorId = 'grey';

    // カラー選択
    modal.querySelectorAll('.group-color-option').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.group-color-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedColorId = btn.dataset.colorId;
      });
    });

    // デフォルトカラーを選択状態に
    modal.querySelector('.group-color-option[data-color-id="grey"]').classList.add('selected');

    // 作成ボタン
    modal.querySelector('.create-button').onclick = () => {
      const groupName = modal.querySelector('#groupNameInput').value.trim() || '新しいグループ';
      const groupId = this.groupManager.createTabGroup(groupName, selectedColorId);
      this.groupManager.addTabToGroup(tabId, groupId);
      this.tabUI.rebuildTabBar(this.groupUI);
      modal.remove();
    };

    // キャンセルボタン
    modal.querySelector('.cancel-button').onclick = () => modal.remove();
    modal.querySelector('.group-modal-close').onclick = () => modal.remove();

    document.body.appendChild(modal);
    setTimeout(() => modal.querySelector('#groupNameInput').focus(), 100);
  }

  /**
   * グループ削除確認ダイアログを表示
   * @param {string} groupId - 削除するグループID
   * @param {number} tabCount - グループ内のタブ数
   */
  showDeleteGroupDialog(groupId, tabCount) {
    const group = this.groupManager.getGroup(groupId);
    if (!group) return;

    const modal = document.createElement('div');
    modal.className = 'group-modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="group-modal-content">
        <div class="group-modal-header">
          <h2>グループを削除</h2>
          <button class="group-modal-close">✕</button>
        </div>
        <div class="group-modal-body">
          <p class="modal-confirm-text" style="color: var(--text-primary); font-size: 14px; line-height: 1.6; margin-bottom: 8px;"></p>
          <p style="color: var(--text-secondary); font-size: 13px;">この操作は取り消せません。</p>
        </div>
        <div class="group-modal-footer">
          <button class="group-modal-button secondary cancel-button">キャンセル</button>
          <button class="group-modal-button primary delete-button" style="background: #dc3545;">削除</button>
        </div>
      </div>
    `;
    // Set text content safely to prevent XSS via group name
    modal.querySelector('.modal-confirm-text').textContent = `グループ「${group.name}」とグループ内の${tabCount}個のタブを削除しますか？`;

    // 削除ボタン
    modal.querySelector('.delete-button').onclick = () => {
      this.groupManager.closeGroupTabs(groupId);
      this.tabUI.rebuildTabBar(this.groupUI);
      modal.remove();
    };

    // キャンセルボタン
    modal.querySelector('.cancel-button').onclick = () => modal.remove();
    modal.querySelector('.group-modal-close').onclick = () => modal.remove();

    document.body.appendChild(modal);
  }

  /**
   * グループ解除確認ダイアログを表示
   * @param {string} groupId - 解除するグループID
   * @param {number} tabCount - グループ内のタブ数
   */
  showUngroupDialog(groupId, tabCount) {
    const group = this.groupManager.getGroup(groupId);
    if (!group) return;

    const modal = document.createElement('div');
    modal.className = 'group-modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="group-modal-content">
        <div class="group-modal-header">
          <h2>グループを解除</h2>
          <button class="group-modal-close">✕</button>
        </div>
        <div class="group-modal-body">
          <p class="modal-confirm-text" style="color: var(--text-primary); font-size: 14px; line-height: 1.6; margin-bottom: 8px;"></p>
          <p class="modal-sub-text" style="color: var(--text-secondary); font-size: 13px;"></p>
        </div>
        <div class="group-modal-footer">
          <button class="group-modal-button secondary cancel-button">キャンセル</button>
          <button class="group-modal-button primary ungroup-button">解除</button>
        </div>
      </div>
    `;
    // Set text content safely to prevent XSS via group name
    modal.querySelector('.modal-confirm-text').textContent = `グループ「${group.name}」を解除しますか？`;
    modal.querySelector('.modal-sub-text').textContent = `グループ内の${tabCount}個のタブはグループから外されます。`;

    // 解除ボタン
    modal.querySelector('.ungroup-button').onclick = () => {
      this.groupManager.deleteTabGroup(groupId);
      this.tabUI.rebuildTabBar(this.groupUI);
      modal.remove();
    };

    // キャンセルボタン
    modal.querySelector('.cancel-button').onclick = () => modal.remove();
    modal.querySelector('.group-modal-close').onclick = () => modal.remove();

    document.body.appendChild(modal);
  }
}
