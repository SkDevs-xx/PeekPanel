import { GROUP_COLORS } from '../config/constants.js';
import {
  ICON_PIN,
  ICON_VOLUME_X,
  ICON_VOLUME_2,
  ICON_COPY,
  ICON_STAR,
  ICON_PALETTE,
  ICON_EXTERNAL_LINK,
  ICON_X,
  ICON_PLUS,
  ICON_TRASH_2,
  ICON_FOLDER,
} from '../config/icons.js';

/**
 * コンテキストメニュー管理クラス
 * タブとグループの右クリックメニューを管理
 */
export class ContextMenu {
  constructor(tabManager, groupManager, eventHandlers = {}) {
    this.tabManager = tabManager;
    this.groupManager = groupManager;
    this.eventHandlers = eventHandlers;
    this.currentMenu = null;
  }

  /**
   * タブのコンテキストメニューを表示
   * @param {string} tabId - タブID
   * @param {number} x - X座標
   * @param {number} y - Y座標
   */
  showTabContextMenu(tabId, x, y) {
    const tab = this.tabManager.getTab(tabId);
    if (!tab) return;

    // 既存のメニューを削除
    this.closeMenu();

    // メニュー要素を作成
    const menu = document.createElement('div');
    menu.className = 'tab-context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // メニュー項目
    const menuItems = [
      {
        label: tab.isPinned ? 'ピン留めを解除' : 'タブをピン留め',
        icon: ICON_PIN,
        action: () => this.eventHandlers.onTogglePin?.(tabId),
        hide: tab.isInternal
      },
      {
        label: tab.isMuted ? 'ミュートを解除' : 'タブをミュート',
        icon: tab.isMuted ? ICON_VOLUME_2 : ICON_VOLUME_X,
        action: () => this.eventHandlers.onToggleMute?.(tabId),
        hide: tab.isInternal
      },
      {
        label: 'タブを複製',
        icon: ICON_COPY,
        action: () => this.eventHandlers.onDuplicateTab?.(tabId),
        hide: tab.isInternal
      },
      {
        label: 'ブックマークに追加',
        icon: ICON_STAR,
        action: () => this.eventHandlers.onAddToBookmark?.(tabId),
        hide: tab.isInternal
      },
      {
        label: 'グループに追加',
        icon: ICON_PALETTE,
        action: () => {
          // setTimeoutを使って非同期に新しいメニューを開く
          // renderMenuItems()のcloseMenu()が実行された後に開く
          setTimeout(() => {
            this.showTabGroupMenu(tabId, x, y);
          }, 0);
        },
        hide: tab.isInternal
      },
      { separator: true },
      {
        label: 'Switch to Main Browser',
        icon: ICON_EXTERNAL_LINK,
        action: () => this.eventHandlers.onSendToMainBrowser?.(tabId),
        hide: tab.isInternal
      },
      { separator: true },
      {
        label: 'タブを閉じる',
        icon: ICON_X,
        action: () => this.eventHandlers.onCloseTab?.(tabId)
      }
    ];

    // メニューアイテムを生成
    this.renderMenuItems(menu, menuItems);

    // メニューを追加
    document.body.appendChild(menu);
    this.currentMenu = menu;

    // 外側をクリックしたら閉じる
    this.setupMenuCloseHandler(menu);
  }

  /**
   * タブグループメニューを表示（グループに追加）
   * @param {string} tabId - タブID
   * @param {number} x - X座標
   * @param {number} y - Y座標
   */
  showTabGroupMenu(tabId, x, y) {
    const tab = this.tabManager.getTab(tabId);
    if (!tab || tab.isInternal) return;

    // 既存のメニューを削除
    this.closeMenu();

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
    header.innerHTML = `<span style="display:flex;align-items:center;gap:6px;">${ICON_PALETTE} グループに追加</span>`;
    menu.appendChild(header);

    // セパレーター
    const separator1 = document.createElement('div');
    separator1.className = 'context-menu-separator';
    menu.appendChild(separator1);

    // 新しいグループを作成
    const createNewGroup = document.createElement('div');
    createNewGroup.className = 'context-menu-item';
    createNewGroup.innerHTML = `<span style="display:flex;align-items:center;gap:6px;">${ICON_PLUS} 新しいグループ</span>`;
    createNewGroup.onclick = () => {
      console.log('[ContextMenu] Create new group clicked for tabId:', tabId);
      this.closeMenu();
      if (this.eventHandlers.onCreateNewGroup) {
        console.log('[ContextMenu] Calling onCreateNewGroup handler');
        this.eventHandlers.onCreateNewGroup(tabId);
      } else {
        console.error('[ContextMenu] onCreateNewGroup handler not found!');
      }
    };
    menu.appendChild(createNewGroup);

    // 既存のグループ
    const groups = this.groupManager.getAllGroups();
    if (groups.length > 0) {
      const separator2 = document.createElement('div');
      separator2.className = 'context-menu-separator';
      menu.appendChild(separator2);

      groups.forEach(group => {
        const groupItem = document.createElement('div');
        groupItem.className = 'context-menu-item';

        // XSS対策: DOM要素を構築
        const colorDot = document.createElement('span');
        colorDot.style.color = group.color;
        colorDot.textContent = '●';
        groupItem.appendChild(colorDot);
        groupItem.appendChild(document.createTextNode(' ' + group.name));

        groupItem.onclick = () => {
          this.eventHandlers.onAddTabToGroup?.(tabId, group.id);
          this.closeMenu();
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
      removeFromGroup.innerHTML = `<span style="display:flex;align-items:center;gap:6px;">${ICON_TRASH_2} グループから削除</span>`;
      removeFromGroup.onclick = () => {
        this.eventHandlers.onRemoveTabFromGroup?.(tabId);
        this.closeMenu();
      };
      menu.appendChild(removeFromGroup);
    }

    // メニューを追加
    document.body.appendChild(menu);
    this.currentMenu = menu;

    // 外側をクリックしたら閉じる
    this.setupMenuCloseHandler(menu);
  }

  /**
   * グループ管理メニューを表示
   * @param {string} groupId - グループID
   * @param {number} x - X座標
   * @param {number} y - Y座標
   */
  showGroupManagementMenu(groupId, x, y) {
    const group = this.groupManager.getGroup(groupId);
    if (!group) return;

    // 既存のメニューを削除
    this.closeMenu();

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
        this.eventHandlers.onRenameGroup?.(groupId, newName);
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
        this.eventHandlers.onChangeGroupColor?.(groupId, color.id);
        this.closeMenu();
      };

      colorPaletteWrapper.appendChild(colorButton);
    });

    menu.appendChild(colorPaletteWrapper);

    // セパレーター
    const separator1 = document.createElement('div');
    separator1.className = 'context-menu-separator';
    menu.appendChild(separator1);

    // メニュー項目
    const groupTabs = this.tabManager.getTabsByGroupId(groupId);
    const menuItems = [
      {
        label: 'グループにタブを追加',
        icon: ICON_PLUS,
        action: () => {
          const currentTabId = this.tabManager.currentTabId;
          if (currentTabId) {
            const tab = this.tabManager.getTab(currentTabId);
            if (tab && !tab.isInternal && tab.groupId !== groupId) {
              this.eventHandlers.onAddTabToGroup?.(currentTabId, groupId);
            }
          }
          this.closeMenu();
        }
      },
      {
        label: 'グループを閉じる',
        icon: ICON_FOLDER,
        action: () => {
          if (!group.isCollapsed) {
            this.eventHandlers.onToggleGroupCollapse?.(groupId);
          }
          this.closeMenu();
        }
      },
      { separator: true },
      {
        label: 'グループを解除',
        icon: ICON_X,
        action: () => {
          this.eventHandlers.onUngroupTabs?.(groupId, groupTabs.length);
          this.closeMenu();
        }
      },
      {
        label: 'グループを削除',
        icon: ICON_TRASH_2,
        action: () => {
          this.eventHandlers.onDeleteGroup?.(groupId, groupTabs.length);
          this.closeMenu();
        }
      }
    ];

    // メニューアイテムを生成
    this.renderMenuItems(menu, menuItems);

    // メニューを追加
    document.body.appendChild(menu);
    this.currentMenu = menu;

    // 外側をクリックしたら閉じる
    this.setupMenuCloseHandler(menu);

    // 入力欄にフォーカス
    setTimeout(() => nameInput.focus(), 0);
  }

  /**
   * メニューアイテムをレンダリング
   * @param {HTMLElement} menu - メニュー要素
   * @param {Array} items - メニューアイテム配列
   */
  renderMenuItems(menu, items) {
    items.forEach(item => {
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
        const span = document.createElement('span');
        span.style.cssText = 'display:flex;align-items:center;gap:6px;';
        span.innerHTML = item.icon; // SVG icon (trusted)
        span.appendChild(document.createTextNode(' ' + item.label));
        menuItem.appendChild(span);
        menuItem.onclick = () => {
          if (!item.disabled && item.action) {
            item.action();
            this.closeMenu();
          }
        };
        menu.appendChild(menuItem);
      }
    });
  }

  /**
   * メニュー外クリックで閉じる処理を設定
   * @param {HTMLElement} menu - メニュー要素
   */
  setupMenuCloseHandler(menu) {
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        this.closeMenu();
        document.removeEventListener('click', closeMenu);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }

  /**
   * 現在開いているメニューを閉じる
   */
  closeMenu() {
    if (this.currentMenu && this.currentMenu.parentNode) {
      this.currentMenu.parentNode.removeChild(this.currentMenu);
      this.currentMenu = null;
    }

    // 既存のメニューをすべて削除（念のため）
    document.querySelectorAll('.tab-context-menu, .tab-group-menu, .group-management-menu').forEach(el => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  }
}
