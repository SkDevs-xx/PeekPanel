/**
 * ドラッグ&ドロップハンドラークラス
 * タブとグループのドラッグ&ドロップ処理を管理
 */
export class DragDropHandler {
  constructor(tabManager, groupUI, eventHandlers = {}) {
    this.tabManager = tabManager;
    this.groupUI = groupUI;
    this.eventHandlers = eventHandlers;
    this.draggedElement = null;
    this.tabsContainer = document.getElementById('tabs');
  }

  /**
   * ドラッグ中の要素の挿入位置を計算
   * @param {HTMLElement} container - コンテナ要素
   * @param {number} x - マウスのX座標
   * @returns {HTMLElement|null} 挿入位置の次の要素
   */
  getDragAfterElement(container, x) {
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

  /**
   * タブ要素のドラッグ&ドロップを設定
   * @param {HTMLElement} tabElement - タブ要素
   */
  setupTabDragDrop(tabElement) {
    tabElement.addEventListener('dragstart', (e) => {
      this.draggedElement = tabElement;
      tabElement.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    tabElement.addEventListener('dragend', (e) => {
      tabElement.classList.remove('dragging');

      // DOM上のタブの順序に合わせてtabs配列を並び替え
      this.updateTabsOrder();

      // タブバーを再構築
      if (this.eventHandlers.onRebuildTabBar) {
        this.eventHandlers.onRebuildTabBar();
      }

      // 保存
      if (this.eventHandlers.onSave) {
        this.eventHandlers.onSave();
      }

      this.draggedElement = null;

      // ドラッグ後、開いているグループのタブラッパー位置を更新
      setTimeout(() => {
        if (this.groupUI) {
          this.groupUI.updateExpandedGroupPositions();
        }
      }, 50);
    });

    tabElement.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (!this.draggedElement || this.draggedElement === tabElement) {
        return;
      }

      // ドラッグ中のタブの親要素をチェック
      const draggedParent = this.draggedElement.parentElement;
      const isInGroupWrapper = draggedParent && draggedParent.classList.contains('group-tabs-wrapper');

      // グループ内タブの場合、通常タブエリアへの移動を防ぐ
      if (isInGroupWrapper) {
        // 同じgroup-tabs-wrapper内でのみドラッグ可能
        if (tabElement.parentElement === draggedParent) {
          const afterElement = this.getDragAfterElementInGroup(draggedParent, e.clientX);
          if (afterElement == null) {
            draggedParent.appendChild(this.draggedElement);
          } else {
            draggedParent.insertBefore(this.draggedElement, afterElement);
          }
        }
        return; // グループ内タブは通常タブエリアに移動させない
      }

      // 通常タブのドラッグ処理
      const afterElement = this.getDragAfterElement(this.tabsContainer, e.clientX);

      if (afterElement == null) {
        this.tabsContainer.appendChild(this.draggedElement);
      } else {
        this.tabsContainer.insertBefore(this.draggedElement, afterElement);
      }
    });

    tabElement.addEventListener('drop', (e) => {
      e.preventDefault();
    });
  }

  /**
   * グループコンテナのドラッグ&ドロップを設定
   * @param {HTMLElement} containerElement - グループコンテナ要素
   */
  setupGroupContainerDragDrop(containerElement) {
    containerElement.addEventListener('dragstart', (e) => {
      // ヘッダー部分をドラッグした場合のみグループ全体を移動
      if (e.target.closest('.tab-group-header')) {
        this.draggedElement = containerElement;
        containerElement.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', containerElement.dataset.groupId);
      } else {
        e.stopPropagation();
      }
    });

    containerElement.addEventListener('dragend', (e) => {
      containerElement.classList.remove('dragging');
      this.draggedElement = null;

      // 保存
      if (this.eventHandlers.onSave) {
        this.eventHandlers.onSave();
      }

      // ドラッグ後、開いているグループのタブラッパー位置を更新
      setTimeout(() => {
        if (this.groupUI) {
          this.groupUI.updateExpandedGroupPositions();
        }
      }, 50);
    });

    containerElement.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (!this.draggedElement || this.draggedElement === containerElement) {
        return;
      }

      const afterElement = this.getDragAfterElement(this.tabsContainer, e.clientX);

      if (afterElement == null) {
        this.tabsContainer.appendChild(this.draggedElement);
      } else {
        this.tabsContainer.insertBefore(this.draggedElement, afterElement);
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
  setupGroupHeaderDragDrop(headerElement) {
    headerElement.addEventListener('dragstart', (e) => {
      this.draggedElement = headerElement;
      headerElement.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', headerElement.dataset.groupId);
    });

    headerElement.addEventListener('dragend', (e) => {
      headerElement.classList.remove('dragging');
      this.draggedElement = null;

      // 保存
      if (this.eventHandlers.onSave) {
        this.eventHandlers.onSave();
      }

      // ドラッグ後、開いているグループのタブラッパー位置を更新
      setTimeout(() => {
        if (this.groupUI) {
          this.groupUI.updateExpandedGroupPositions();
        }
      }, 50);
    });

    headerElement.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (!this.draggedElement || this.draggedElement === headerElement) {
        return;
      }

      const afterElement = this.getDragAfterElement(this.tabsContainer, e.clientX);

      if (afterElement == null) {
        this.tabsContainer.appendChild(this.draggedElement);
      } else {
        this.tabsContainer.insertBefore(this.draggedElement, afterElement);
      }
    });

    headerElement.addEventListener('drop', (e) => {
      e.preventDefault();
    });
  }

  /**
   * DOM上のタブの順序に合わせてtabs配列を並び替え
   */
  updateTabsOrder() {
    const tabElements = document.querySelectorAll('.tab');
    const newTabsOrder = [];
    const allTabs = this.tabManager.getAllTabs();
    const internalTabs = allTabs.filter(t => t.isInternal);

    tabElements.forEach(tabElement => {
      const tabId = tabElement.dataset.tabId;
      const tab = allTabs.find(t => t.id === tabId);
      if (tab) {
        newTabsOrder.push(tab);
      }
    });

    // 内部タブを最後に追加
    const reorderedTabs = [...newTabsOrder, ...internalTabs];

    // TabManagerの配列を更新
    if (this.eventHandlers.onUpdateTabsOrder) {
      this.eventHandlers.onUpdateTabsOrder(reorderedTabs);
    }
  }

  /**
   * ドラッグ中の要素を取得
   * @returns {HTMLElement|null}
   */
  getDraggedElement() {
    return this.draggedElement;
  }

  /**
   * ドラッグ中かチェック
   * @returns {boolean}
   */
  isDragging() {
    return this.draggedElement !== null;
  }

  /**
   * ドラッグをキャンセル
   */
  cancelDrag() {
    if (this.draggedElement) {
      this.draggedElement.classList.remove('dragging');
      this.draggedElement = null;
    }
  }
}
