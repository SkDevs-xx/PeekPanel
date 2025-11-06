import { EventEmitter } from '../utils/eventEmitter.js';
import { GROUP_COLORS } from '../config/constants.js';

/**
 * タブグループ管理クラス
 * タブのグループ化機能を提供
 */
export class TabGroupManager extends EventEmitter {
  constructor(storage, tabManager) {
    super();
    this.tabGroups = [];
    this.groupCounter = 0;
    this.storage = storage;
    this.tabManager = tabManager;
  }

  /**
   * 初期化 - ストレージからグループ情報を読み込み
   */
  async init() {
    this.tabGroups = await this.storage.loadTabGroups();

    if (this.tabGroups.length > 0) {
      this.groupCounter = Math.max(...this.tabGroups.map(g => parseInt(g.id.replace('group-', '')))) + 1;
    }
  }

  /**
   * タブグループを作成
   * @param {string} name - グループ名
   * @param {string} colorId - 色ID（GROUP_COLORSのid）
   * @param {boolean} collapsed - 折りたたみ状態（デフォルト: true）
   * @returns {string} 作成されたグループのID
   */
  createTabGroup(name, colorId, collapsed = true) {
    const groupId = `group-${this.groupCounter++}`;
    const color = GROUP_COLORS.find(c => c.id === colorId) || GROUP_COLORS[0];

    const groupData = {
      id: groupId,
      name: name || '新しいグループ',
      colorId: colorId || 'grey',
      color: color.color,
      isCollapsed: collapsed,
      createdAt: Date.now()
    };

    this.tabGroups.push(groupData);
    this.emit('groupCreated', groupData);
    this.storage.saveTabGroups(this.tabGroups);

    return groupId;
  }

  /**
   * タブグループを削除
   * @param {string} groupId - グループID
   */
  deleteTabGroup(groupId) {
    const index = this.tabGroups.findIndex(g => g.id === groupId);
    if (index === -1) return;

    // グループ内のタブをグループから解除
    const tabs = this.tabManager.getTabsByGroupId(groupId);
    tabs.forEach(tab => {
      tab.groupId = null;
    });

    this.tabGroups.splice(index, 1);
    this.emit('groupDeleted', groupId);

    this.storage.saveTabGroups(this.tabGroups);
    this.tabManager.save();
  }

  /**
   * タブグループの名前を変更
   * @param {string} groupId - グループID
   * @param {string} newName - 新しい名前
   */
  renameTabGroup(groupId, newName) {
    const group = this.tabGroups.find(g => g.id === groupId);
    if (!group) return;

    group.name = newName;
    this.emit('groupUpdated', group);
    this.storage.saveTabGroups(this.tabGroups);
  }

  /**
   * タブグループの色を変更
   * @param {string} groupId - グループID
   * @param {string} colorId - 新しい色ID
   */
  changeGroupColor(groupId, colorId) {
    const group = this.tabGroups.find(g => g.id === groupId);
    if (!group) return;

    const color = GROUP_COLORS.find(c => c.id === colorId);
    if (!color) return;

    group.colorId = colorId;
    group.color = color.color;
    this.emit('groupUpdated', group);
    this.storage.saveTabGroups(this.tabGroups);
  }

  /**
   * タブをグループに追加
   * @param {string} tabId - タブID
   * @param {string} groupId - グループID
   */
  addTabToGroup(tabId, groupId) {
    const tab = this.tabManager.getTab(tabId);
    const group = this.tabGroups.find(g => g.id === groupId);

    if (!tab || !group) return;

    // 内部タブはグループ化しない
    if (tab.isInternal) return;

    tab.groupId = groupId;
    this.emit('tabAddedToGroup', { tabId, groupId });

    this.tabManager.save();
  }

  /**
   * タブをグループから削除
   * @param {string} tabId - タブID
   */
  removeTabFromGroup(tabId) {
    const tab = this.tabManager.getTab(tabId);
    if (!tab) return;

    const oldGroupId = tab.groupId;
    tab.groupId = null;

    this.emit('tabRemovedFromGroup', { tabId, groupId: oldGroupId });

    // グループが空になった場合は削除
    if (oldGroupId) {
      const groupTabs = this.tabManager.getTabsByGroupId(oldGroupId);
      if (groupTabs.length === 0) {
        const groupIndex = this.tabGroups.findIndex(g => g.id === oldGroupId);
        if (groupIndex !== -1) {
          this.tabGroups.splice(groupIndex, 1);
          this.emit('groupDeleted', oldGroupId);
          this.storage.saveTabGroups(this.tabGroups);
        }
      }
    }

    this.tabManager.save();
  }

  /**
   * グループの折りたたみ/展開を切り替え
   * @param {string} groupId - グループID
   * @param {boolean} closeOthers - 他のグループを自動的に閉じるか（デフォルト: true）
   */
  toggleGroupCollapse(groupId, closeOthers = true) {
    const group = this.tabGroups.find(g => g.id === groupId);
    if (!group) return;

    // 他のグループを閉じる
    if (closeOthers) {
      this.tabGroups.forEach(g => {
        if (g.id !== groupId && !g.isCollapsed) {
          g.isCollapsed = true;
          this.emit('groupToggled', g);
        }
      });
    }

    // 対象グループの状態を切り替え
    group.isCollapsed = !group.isCollapsed;
    this.emit('groupToggled', group);
    this.storage.saveTabGroups(this.tabGroups);
  }

  /**
   * すべてのグループを折りたたむ
   */
  closeAllGroups() {
    this.tabGroups.forEach(group => {
      if (!group.isCollapsed) {
        group.isCollapsed = true;
        this.emit('groupToggled', group);
      }
    });
    this.storage.saveTabGroups(this.tabGroups);
  }

  /**
   * すべてのグループを展開
   */
  expandAllGroups() {
    this.tabGroups.forEach(group => {
      if (group.isCollapsed) {
        group.isCollapsed = false;
        this.emit('groupToggled', group);
      }
    });
    this.storage.saveTabGroups(this.tabGroups);
  }

  /**
   * グループ内のすべてのタブを閉じる
   * @param {string} groupId - グループID
   */
  closeGroupTabs(groupId) {
    const tabs = this.tabManager.getTabsByGroupId(groupId);
    tabs.forEach(tab => {
      this.tabManager.closeTab(tab.id);
    });

    // グループ自体を削除
    const groupIndex = this.tabGroups.findIndex(g => g.id === groupId);
    if (groupIndex !== -1) {
      this.tabGroups.splice(groupIndex, 1);
      this.emit('groupDeleted', groupId);
      this.storage.saveTabGroups(this.tabGroups);
    }
  }

  /**
   * 指定されたグループを取得
   * @param {string} groupId - グループID
   * @returns {Object|null} グループデータ
   */
  getGroup(groupId) {
    return this.tabGroups.find(g => g.id === groupId) || null;
  }

  /**
   * すべてのグループを取得
   * @returns {Array} グループ配列
   */
  getAllGroups() {
    return this.tabGroups;
  }

  /**
   * グループ内のタブを取得
   * @param {string} groupId - グループID
   * @returns {Array} タブ配列
   */
  getTabsByGroupId(groupId) {
    return this.tabManager.getTabsByGroupId(groupId);
  }

  /**
   * グループが存在するかチェック
   * @param {string} groupId - グループID
   * @returns {boolean}
   */
  hasGroup(groupId) {
    return this.tabGroups.some(g => g.id === groupId);
  }

  /**
   * グループの数を取得
   * @returns {number}
   */
  getGroupCount() {
    return this.tabGroups.length;
  }

  /**
   * グループが空かチェック
   * @param {string} groupId - グループID
   * @returns {boolean}
   */
  isGroupEmpty(groupId) {
    const tabs = this.tabManager.getTabsByGroupId(groupId);
    return tabs.length === 0;
  }

  /**
   * グループが折りたたまれているかチェック
   * @param {string} groupId - グループID
   * @returns {boolean}
   */
  isGroupCollapsed(groupId) {
    const group = this.tabGroups.find(g => g.id === groupId);
    return group ? group.isCollapsed : false;
  }
}
