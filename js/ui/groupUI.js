/**
 * グループUI管理クラス
 * グループ要素のレンダリングとイベントハンドリングを担当
 */
export class GroupUI {
  constructor(groupManager, eventHandlers = {}) {
    this.groupManager = groupManager;
    this.eventHandlers = eventHandlers;
    this.tabsContainer = document.getElementById('tabs');

    // GroupManagerのイベントをリスニング
    this.setupEventListeners();
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    this.groupManager.on('groupCreated', (groupData) => {
      // グループ作成時は何もしない（rebuildTabBarで処理される）
    });

    this.groupManager.on('groupDeleted', (groupId) => {
      this.removeGroupContainer(groupId);
    });

    this.groupManager.on('groupUpdated', (groupData) => {
      this.updateGroupElement(groupData);
    });

    this.groupManager.on('groupToggled', (groupData) => {
      this.toggleGroupCollapseUI(groupData);
    });

    this.groupManager.on('tabAddedToGroup', () => {
      // rebuildTabBarで処理される
    });

    this.groupManager.on('tabRemovedFromGroup', () => {
      // rebuildTabBarで処理される
    });
  }

  /**
   * グループヘッダー要素を作成
   * @param {Object} group - グループデータ
   * @returns {HTMLElement} グループヘッダー要素
   */
  createGroupHeader(group) {
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
      if (this.eventHandlers.onGroupHeaderClick) {
        this.eventHandlers.onGroupHeaderClick(group.id);
      }
    };

    // 右クリックでグループ管理メニュー
    header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.eventHandlers.onGroupContextMenu) {
        this.eventHandlers.onGroupContextMenu(group.id, e.clientX, e.clientY);
      }
    });

    // ドラッグ&ドロップ設定
    if (this.eventHandlers.onSetupGroupHeaderDragDrop) {
      this.eventHandlers.onSetupGroupHeaderDragDrop(header);
    }

    return header;
  }

  /**
   * グループコンテナを作成（ヘッダー + タブリスト）
   * @param {Object} group - グループデータ
   * @returns {HTMLElement} グループコンテナ要素
   */
  createGroupContainer(group) {
    const container = document.createElement('div');
    container.className = 'group-container';
    container.dataset.groupId = group.id;
    container.draggable = true;

    // グループヘッダーを作成
    const header = this.createGroupHeader(group);
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
    if (this.eventHandlers.onSetupGroupContainerDragDrop) {
      this.eventHandlers.onSetupGroupContainerDragDrop(container);
    }

    return container;
  }

  /**
   * すべてのグループをレンダリング
   * @param {Map} groupedTabs - グループIDをキーとしたタブ配列のマップ
   * @param {Map} existingTabElements - タブIDをキーとしたタブ要素のマップ
   */
  renderAllGroups(groupedTabs, existingTabElements) {
    this.groupManager.getAllGroups().forEach(group => {
      const groupTabs = groupedTabs.get(group.id);
      if (!groupTabs || groupTabs.length === 0) return;

      // グループコンテナを作成
      const groupContainer = this.createGroupContainer(group);
      const tabsWrapper = groupContainer.querySelector('.group-tabs-wrapper');

      // グループ内のタブを配置
      groupTabs.forEach(tab => {
        const tabElement = existingTabElements.get(tab.id);
        if (tabElement) {
          tabElement.classList.add('grouped');
          tabsWrapper.appendChild(tabElement);
        }
      });

      this.tabsContainer.appendChild(groupContainer);

      // グループが展開されている場合、position: fixed のスタイルを適用
      if (!group.isCollapsed) {
        const tabsContainer = document.querySelector('.tabs-container');
        if (tabsContainer) {
          const containerRect = tabsContainer.getBoundingClientRect();
          tabsWrapper.style.top = `${containerRect.bottom}px`;
          tabsWrapper.style.left = '0';
          tabsWrapper.style.width = '100vw';
          tabsWrapper.style.borderBottom = `3px solid ${group.color}`;
        }
      }
    });
  }

  /**
   * グループ要素を更新
   * @param {Object} groupData - グループデータ
   */
  updateGroupElement(groupData) {
    const container = this.getGroupContainer(groupData.id);
    if (!container) return;

    const header = container.querySelector('.tab-group-header');
    if (!header) return;

    // グループ名を更新
    const nameSpan = header.querySelector('.group-name');
    if (nameSpan && groupData.name) {
      nameSpan.textContent = groupData.name;
      header.title = groupData.name;
    }

    // グループ色を更新
    if (groupData.color) {
      header.style.backgroundColor = groupData.color;

      // 展開されている場合はタブラッパーのボーダーも更新
      const tabsWrapper = container.querySelector('.group-tabs-wrapper');
      if (tabsWrapper && !tabsWrapper.classList.contains('collapsed')) {
        tabsWrapper.style.borderBottom = `3px solid ${groupData.color}`;
      }
    }
  }

  /**
   * グループコンテナを削除
   * @param {string} groupId - グループID
   */
  removeGroupContainer(groupId) {
    const container = this.getGroupContainer(groupId);
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }

  /**
   * グループの折りたたみ/展開UIを更新
   * @param {Object} groupData - グループデータ
   */
  toggleGroupCollapseUI(groupData) {
    const groupContainer = this.getGroupContainer(groupData.id);
    if (!groupContainer) return;

    const header = groupContainer.querySelector('.tab-group-header');
    const tabsWrapper = groupContainer.querySelector('.group-tabs-wrapper');
    const arrow = header?.querySelector('.group-arrow');

    if (groupData.isCollapsed) {
      // 閉じる
      if (header) {
        header.classList.remove('expanded');
      }
      if (tabsWrapper) {
        tabsWrapper.classList.add('collapsed');
      }
      if (arrow) {
        arrow.textContent = '▶';
      }
    } else {
      // 開く
      if (header) {
        header.classList.add('expanded');
      }
      if (tabsWrapper) {
        tabsWrapper.classList.remove('collapsed');

        // position: fixed なので、タブバー全体の位置を基準に設定
        const tabsContainer = document.querySelector('.tabs-container');
        if (tabsContainer) {
          const containerRect = tabsContainer.getBoundingClientRect();

          // タブバーの下に、左端から表示
          tabsWrapper.style.top = `${containerRect.bottom}px`;
          tabsWrapper.style.left = '0';
          tabsWrapper.style.width = '100vw';

          // グループカラーのラインを下部に追加
          tabsWrapper.style.borderBottom = `3px solid ${groupData.color}`;
        }
      }
      if (arrow) {
        arrow.textContent = '▼';
      }
    }
  }

  /**
   * すべてのグループを閉じる
   */
  closeAllGroups() {
    this.groupManager.getAllGroups().forEach(group => {
      if (!group.isCollapsed) {
        this.toggleGroupCollapseUI({ ...group, isCollapsed: true });
      }
    });
  }

  /**
   * 展開されているグループの位置を更新
   */
  updateExpandedGroupPositions() {
    this.groupManager.getAllGroups().forEach(group => {
      if (!group.isCollapsed) {
        const groupContainer = this.getGroupContainer(group.id);
        if (groupContainer) {
          const tabsWrapper = groupContainer.querySelector('.group-tabs-wrapper');

          if (tabsWrapper && !tabsWrapper.classList.contains('collapsed')) {
            const tabsContainer = document.querySelector('.tabs-container');
            if (tabsContainer) {
              const containerRect = tabsContainer.getBoundingClientRect();

              // タブバーの下に、左端から表示
              tabsWrapper.style.top = `${containerRect.bottom}px`;
              tabsWrapper.style.left = '0';
              tabsWrapper.style.width = '100vw';

              // グループカラーのラインを維持
              tabsWrapper.style.borderBottom = `3px solid ${group.color}`;
            }
          }
        }
      }
    });
  }

  /**
   * グループコンテナ要素を取得
   * @param {string} groupId - グループID
   * @returns {HTMLElement|null}
   */
  getGroupContainer(groupId) {
    return this.tabsContainer.querySelector(`.group-container[data-group-id="${groupId}"]`);
  }

  /**
   * すべてのグループコンテナを取得
   * @returns {NodeList}
   */
  getAllGroupContainers() {
    return this.tabsContainer.querySelectorAll('.group-container');
  }

  /**
   * グループヘッダー要素を取得
   * @param {string} groupId - グループID
   * @returns {HTMLElement|null}
   */
  getGroupHeader(groupId) {
    const container = this.getGroupContainer(groupId);
    return container ? container.querySelector('.tab-group-header') : null;
  }

  /**
   * グループのタブラッパーを取得
   * @param {string} groupId - グループID
   * @returns {HTMLElement|null}
   */
  getGroupTabsWrapper(groupId) {
    const container = this.getGroupContainer(groupId);
    return container ? container.querySelector('.group-tabs-wrapper') : null;
  }
}
