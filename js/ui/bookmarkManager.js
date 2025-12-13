import { getRealFavicon, applyFaviconWithFallback } from '../utils/favicon.js';

/**
 * ブックマーク管理クラス
 * ブックマークの追加、削除、編集、フォルダ管理を提供
 */
export class BookmarkManager {
  constructor(storage, tabManager, eventHandlers = {}) {
    this.storage = storage;
    this.tabManager = tabManager;
    this.eventHandlers = eventHandlers;
    this.bookmarks = [];
    this.folders = [];
    this.dropdownVisible = false;
    this.editingId = null; // 現在編集中のID
    this.moveMenuOpen = false; // 移動メニューが開いているか
    this.draggedItem = null; // ドラッグ中のアイテム

    // DOM要素
    this.bookmarkButton = null;
    this.bookmarkDropdown = null;
    this.bookmarkList = null;
    this.bookmarkEmpty = null;
    this.addBookmarkBtn = null;
    this.addFolderBtn = null;
  }

  /**
   * 初期化
   */
  async init() {
    // DOM要素を取得
    this.bookmarkButton = document.getElementById('bookmarkButton');
    this.bookmarkDropdown = document.getElementById('bookmarkDropdown');
    this.bookmarkList = document.getElementById('bookmarkList');
    this.bookmarkEmpty = document.getElementById('bookmarkEmpty');
    this.addBookmarkBtn = document.getElementById('addBookmarkBtn');
    this.addFolderBtn = document.getElementById('addFolderBtn');

    // ブックマークとフォルダを読み込み
    await this.loadBookmarks();

    // イベントリスナーを設定
    this.setupEventListeners();

    // 現在のタブがブックマーク済みか確認
    this.updateBookmarkButtonState();
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // ブックマークボタンクリック
    this.bookmarkButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // 追加ボタンクリック
    this.addBookmarkBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.addCurrentTabToBookmark();
    });

    // フォルダ追加ボタンクリック
    if (this.addFolderBtn) {
      this.addFolderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.createNewFolder();
      });
    }

    // ドロップダウン外をクリックで閉じる
    document.addEventListener('click', (e) => {
      // 移動メニューが開いている場合は閉じない
      if (this.moveMenuOpen) return;

      if (this.dropdownVisible &&
        !this.bookmarkDropdown.contains(e.target) &&
        e.target !== this.bookmarkButton) {
        this.hideDropdown();
      }
    });

    // TabManagerのタブ切り替えイベントをリスニング
    this.tabManager.on('tabSwitched', () => {
      this.updateBookmarkButtonState();
      this.updateAddButtonState();
    });
  }

  /**
   * ブックマークを読み込み
   */
  async loadBookmarks() {
    const data = await this.storage.loadBookmarks();
    // 新しいデータ構造に対応（後方互換性）
    if (Array.isArray(data)) {
      this.bookmarks = data;
      this.folders = [];
    } else if (data && typeof data === 'object') {
      this.bookmarks = data.bookmarks || [];
      this.folders = data.folders || [];
    } else {
      this.bookmarks = [];
      this.folders = [];
    }
  }

  /**
   * ブックマークを保存
   */
  async saveBookmarks() {
    await this.storage.saveBookmarks({
      bookmarks: this.bookmarks,
      folders: this.folders
    });
  }

  /**
   * 現在のタブをブックマークに追加
   * @param {string|null} folderId - 追加先フォルダID（nullでルート）
   */
  async addCurrentTabToBookmark(folderId = null) {
    const currentTab = this.tabManager.getCurrentTab();
    if (!currentTab || currentTab.isInternal) {
      console.warn('[BookmarkManager] Cannot bookmark internal pages');
      return false;
    }

    // 重複チェック
    if (this.isBookmarked(currentTab.url)) {
      console.log('[BookmarkManager] URL already bookmarked:', currentTab.url);
      return false;
    }

    const bookmark = {
      id: `bookmark-${Date.now()}`,
      url: currentTab.url,
      title: currentTab.title || currentTab.url,
      favicon: getRealFavicon(currentTab.url),
      folderId: folderId,
      createdAt: Date.now()
    };

    this.bookmarks.unshift(bookmark);
    await this.saveBookmarks();

    // UIを更新
    this.updateBookmarkButtonState();
    this.updateAddButtonState();
    this.renderBookmarkList();

    // イベント発火
    if (this.eventHandlers.onBookmarkAdded) {
      this.eventHandlers.onBookmarkAdded(bookmark);
    }

    return true;
  }

  /**
   * 指定したタブをブックマークに追加
   * @param {string} tabId - タブID
   * @param {string|null} folderId - 追加先フォルダID
   */
  async addTabToBookmark(tabId, folderId = null) {
    const tab = this.tabManager.getTab(tabId);
    if (!tab || tab.isInternal) {
      console.warn('[BookmarkManager] Cannot bookmark internal pages');
      return false;
    }

    // 重複チェック
    if (this.isBookmarked(tab.url)) {
      console.log('[BookmarkManager] URL already bookmarked:', tab.url);
      return false;
    }

    const bookmark = {
      id: `bookmark-${Date.now()}`,
      url: tab.url,
      title: tab.title || tab.url,
      favicon: getRealFavicon(tab.url),
      folderId: folderId,
      createdAt: Date.now()
    };

    this.bookmarks.unshift(bookmark);
    await this.saveBookmarks();

    // UIを更新
    this.updateBookmarkButtonState();
    this.updateAddButtonState();
    this.renderBookmarkList();

    return true;
  }

  /**
   * ブックマークを削除
   * @param {string} bookmarkId - ブックマークID
   */
  async removeBookmark(bookmarkId) {
    const index = this.bookmarks.findIndex(b => b.id === bookmarkId);
    if (index === -1) return;

    this.bookmarks.splice(index, 1);
    await this.saveBookmarks();

    // UIを更新
    this.updateBookmarkButtonState();
    this.updateAddButtonState();
    this.renderBookmarkList();
  }

  /**
   * ブックマークを編集
   * @param {string} bookmarkId - ブックマークID
   * @param {Object} updates - 更新内容
   */
  async updateBookmark(bookmarkId, updates) {
    const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
    if (!bookmark) return;

    Object.assign(bookmark, updates);
    await this.saveBookmarks();
    this.renderBookmarkList();
  }

  /**
   * 新しいフォルダを作成
   */
  async createNewFolder() {
    const folder = {
      id: `folder-${Date.now()}`,
      name: '新しいフォルダ',
      isCollapsed: false,
      createdAt: Date.now()
    };

    this.folders.push(folder);
    await this.saveBookmarks();
    this.renderBookmarkList();

    // 作成後すぐに編集モードにする
    setTimeout(() => {
      this.startEditFolder(folder.id);
    }, 50);
  }

  /**
   * フォルダを削除（中のブックマークはルートに移動）
   * @param {string} folderId - フォルダID
   */
  async removeFolder(folderId) {
    // フォルダ内のブックマークをルートに移動
    this.bookmarks.forEach(b => {
      if (b.folderId === folderId) {
        b.folderId = null;
      }
    });

    // フォルダを削除
    const index = this.folders.findIndex(f => f.id === folderId);
    if (index !== -1) {
      this.folders.splice(index, 1);
    }

    await this.saveBookmarks();
    this.renderBookmarkList();
  }

  /**
   * フォルダを更新
   * @param {string} folderId - フォルダID
   * @param {Object} updates - 更新内容
   */
  async updateFolder(folderId, updates) {
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return;

    Object.assign(folder, updates);
    await this.saveBookmarks();
    this.renderBookmarkList();
  }

  /**
   * フォルダの折りたたみをトグル
   * @param {string} folderId - フォルダID
   */
  async toggleFolderCollapse(folderId) {
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return;

    folder.isCollapsed = !folder.isCollapsed;

    // UIを先に更新（レスポンス向上）
    this.renderBookmarkList();

    // バックグラウンドで保存
    this.saveBookmarks();
  }

  /**
   * ブックマークをフォルダに移動
   * @param {string} bookmarkId - ブックマークID
   * @param {string|null} folderId - 移動先フォルダID
   */
  async moveBookmarkToFolder(bookmarkId, folderId) {
    const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
    if (!bookmark) return;

    bookmark.folderId = folderId;
    await this.saveBookmarks();
    this.renderBookmarkList();
  }

  /**
   * URLがブックマーク済みかチェック
   * @param {string} url - URL
   * @returns {boolean}
   */
  isBookmarked(url) {
    return this.bookmarks.some(b => b.url === url);
  }

  /**
   * ブックマークボタンの状態を更新
   */
  updateBookmarkButtonState() {
    const currentTab = this.tabManager.getCurrentTab();
    if (!currentTab || currentTab.isInternal) {
      this.bookmarkButton.classList.remove('bookmarked');
      return;
    }

    if (this.isBookmarked(currentTab.url)) {
      this.bookmarkButton.classList.add('bookmarked');
    } else {
      this.bookmarkButton.classList.remove('bookmarked');
    }
  }

  /**
   * 追加ボタンの状態を更新
   */
  updateAddButtonState() {
    const currentTab = this.tabManager.getCurrentTab();
    if (!currentTab || currentTab.isInternal || this.isBookmarked(currentTab.url)) {
      this.addBookmarkBtn.disabled = true;
      this.addBookmarkBtn.title = currentTab?.isInternal
        ? '内部ページはブックマークできません'
        : 'ブックマーク済み';
    } else {
      this.addBookmarkBtn.disabled = false;
      this.addBookmarkBtn.title = '現在のページを追加';
    }
  }

  /**
   * ドロップダウンを切り替え
   */
  toggleDropdown() {
    if (this.dropdownVisible) {
      this.hideDropdown();
    } else {
      this.showDropdown();
    }
  }

  /**
   * ドロップダウンを表示
   */
  showDropdown() {
    this.editingId = null;
    this.renderBookmarkList();
    this.updateAddButtonState();
    this.bookmarkDropdown.style.display = 'block';
    this.dropdownVisible = true;
  }

  /**
   * ドロップダウンを非表示
   */
  hideDropdown() {
    this.bookmarkDropdown.style.display = 'none';
    this.dropdownVisible = false;
    this.editingId = null;
    this.moveMenuOpen = false;
  }

  /**
   * ブックマークリストをレンダリング
   */
  renderBookmarkList() {
    // 現在のスクロール位置を保存
    const scrollTop = this.bookmarkList.scrollTop;

    // リストをクリア
    this.bookmarkList.innerHTML = '';

    const hasContent = this.bookmarks.length > 0 || this.folders.length > 0;

    if (!hasContent) {
      this.bookmarkEmpty.style.display = 'block';
      this.bookmarkList.style.display = 'none';
      return;
    }

    this.bookmarkEmpty.style.display = 'none';
    this.bookmarkList.style.display = 'block';

    // ルートレベルのブックマーク
    const rootBookmarks = this.bookmarks.filter(b => !b.folderId);

    // フォルダをレンダリング
    this.folders.forEach(folder => {
      const folderEl = this.createFolderElement(folder);
      this.bookmarkList.appendChild(folderEl);
    });

    // ルートレベルのブックマークをレンダリング
    rootBookmarks.forEach(bookmark => {
      const item = this.createBookmarkItem(bookmark);
      this.bookmarkList.appendChild(item);
    });

    // ルートドロップゾーンを追加
    this.setupRootDropZone();

    // スクロール位置を復元
    this.bookmarkList.scrollTop = scrollTop;
  }

  /**
   * ルートドロップゾーンを設定
   */
  setupRootDropZone() {
    // リスト全体をドロップゾーンとして設定
    this.bookmarkList.addEventListener('dragover', (e) => {
      e.preventDefault();
      // フォルダ内でない場合のみドロップを許可
      const target = e.target.closest('.bookmark-folder-content');
      if (!target && this.draggedItem) {
        e.dataTransfer.dropEffect = 'move';
      }
    });

    this.bookmarkList.addEventListener('drop', (e) => {
      e.preventDefault();
      // フォルダ内でない場合のみ処理
      const target = e.target.closest('.bookmark-folder-content');
      const folderHeader = e.target.closest('.bookmark-folder-header');
      if (!target && !folderHeader && this.draggedItem) {
        this.moveBookmarkToFolder(this.draggedItem, null);
      }
      this.draggedItem = null;
      this.clearDragStyles();
    });
  }

  /**
   * ドラッグスタイルをクリア
   */
  clearDragStyles() {
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
  }

  /**
   * フォルダ要素を作成
   * @param {Object} folder - フォルダデータ
   * @returns {HTMLElement}
   */
  createFolderElement(folder) {
    const container = document.createElement('div');
    container.className = 'bookmark-folder';
    container.dataset.folderId = folder.id;

    // フォルダヘッダー
    const header = document.createElement('div');
    header.className = 'bookmark-folder-header';

    // ドロップゾーンとして設定
    header.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.draggedItem) {
        header.classList.add('drag-over');
        e.dataTransfer.dropEffect = 'move';
      }
    });

    header.addEventListener('dragleave', (e) => {
      e.preventDefault();
      header.classList.remove('drag-over');
    });

    header.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      header.classList.remove('drag-over');
      if (this.draggedItem) {
        this.moveBookmarkToFolder(this.draggedItem, folder.id);
        this.draggedItem = null;
      }
    });

    // 折りたたみアイコン
    const collapseIcon = document.createElement('span');
    collapseIcon.className = 'folder-collapse-icon';
    collapseIcon.textContent = folder.isCollapsed ? '▶' : '▼';
    collapseIcon.onclick = (e) => {
      e.stopPropagation();
      this.toggleFolderCollapse(folder.id);
    };

    // フォルダアイコン
    const folderIcon = document.createElement('span');
    folderIcon.className = 'folder-icon';
    folderIcon.textContent = '📁';

    // フォルダ名
    if (this.editingId === folder.id) {
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'bookmark-edit-input';
      nameInput.value = folder.name;
      nameInput.onclick = (e) => e.stopPropagation();
      nameInput.onblur = () => {
        const newName = nameInput.value.trim();
        if (newName) {
          this.updateFolder(folder.id, { name: newName });
        }
        this.editingId = null;
        this.renderBookmarkList();
      };
      nameInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          nameInput.blur();
        } else if (e.key === 'Escape') {
          this.editingId = null;
          this.renderBookmarkList();
        }
      };
      header.appendChild(collapseIcon);
      header.appendChild(folderIcon);
      header.appendChild(nameInput);
      setTimeout(() => nameInput.focus(), 0);
    } else {
      const folderName = document.createElement('span');
      folderName.className = 'folder-name';
      folderName.textContent = folder.name;

      // ブックマーク数
      const count = this.bookmarks.filter(b => b.folderId === folder.id).length;
      const countBadge = document.createElement('span');
      countBadge.className = 'folder-count';
      countBadge.textContent = `(${count})`;

      // アクションボタン
      const actions = document.createElement('div');
      actions.className = 'bookmark-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'bookmark-action-btn';
      editBtn.textContent = '✏️';
      editBtn.title = '編集';
      editBtn.onclick = (e) => {
        e.stopPropagation();
        this.startEditFolder(folder.id);
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'bookmark-action-btn';
      deleteBtn.textContent = '🗑️';
      deleteBtn.title = '削除';
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        this.removeFolder(folder.id);
      };

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      header.appendChild(collapseIcon);
      header.appendChild(folderIcon);
      header.appendChild(folderName);
      header.appendChild(countBadge);
      header.appendChild(actions);

      // クリックで折りたたみトグル
      header.onclick = (e) => {
        e.stopPropagation();
        this.toggleFolderCollapse(folder.id);
      };
    }

    container.appendChild(header);

    // フォルダ内容
    if (!folder.isCollapsed) {
      const content = document.createElement('div');
      content.className = 'bookmark-folder-content';
      content.dataset.folderId = folder.id;

      // フォルダ内容もドロップゾーンとして設定
      content.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.draggedItem) {
          content.classList.add('drag-over');
          e.dataTransfer.dropEffect = 'move';
        }
      });

      content.addEventListener('dragleave', (e) => {
        // 子要素への移動時は無視
        if (e.target === content) {
          content.classList.remove('drag-over');
        }
      });

      content.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        content.classList.remove('drag-over');
        if (this.draggedItem) {
          this.moveBookmarkToFolder(this.draggedItem, folder.id);
          this.draggedItem = null;
        }
      });

      const folderBookmarks = this.bookmarks.filter(b => b.folderId === folder.id);
      folderBookmarks.forEach(bookmark => {
        const item = this.createBookmarkItem(bookmark);
        content.appendChild(item);
      });

      container.appendChild(content);
    }

    return container;
  }

  /**
   * フォルダ編集モードを開始
   * @param {string} folderId - フォルダID
   */
  startEditFolder(folderId) {
    this.editingId = folderId;
    this.renderBookmarkList();
  }

  /**
   * ブックマーク編集モードを開始
   * @param {string} bookmarkId - ブックマークID
   */
  startEditBookmark(bookmarkId) {
    this.editingId = bookmarkId;
    this.renderBookmarkList();
  }

  /**
   * ブックマーク項目要素を作成
   * @param {Object} bookmark - ブックマークデータ
   * @returns {HTMLElement}
   */
  createBookmarkItem(bookmark) {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.dataset.bookmarkId = bookmark.id;
    item.draggable = true;

    // ドラッグイベント
    item.addEventListener('dragstart', (e) => {
      this.draggedItem = bookmark.id;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', bookmark.id);
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      this.draggedItem = null;
      this.clearDragStyles();
    });

    // ファビコン
    const favicon = document.createElement('img');
    favicon.className = 'bookmark-favicon';
    favicon.draggable = false;
    applyFaviconWithFallback(favicon, bookmark.url, bookmark.favicon);

    // 編集モード
    if (this.editingId === bookmark.id) {
      const editInput = document.createElement('input');
      editInput.type = 'text';
      editInput.className = 'bookmark-edit-input';
      editInput.value = bookmark.title;
      editInput.onclick = (e) => e.stopPropagation();
      editInput.onblur = () => {
        const newTitle = editInput.value.trim();
        if (newTitle) {
          this.updateBookmark(bookmark.id, { title: newTitle });
        }
        this.editingId = null;
        this.renderBookmarkList();
      };
      editInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          editInput.blur();
        } else if (e.key === 'Escape') {
          this.editingId = null;
          this.renderBookmarkList();
        }
      };

      item.appendChild(favicon);
      item.appendChild(editInput);
      item.draggable = false;
      setTimeout(() => editInput.focus(), 0);
      return item;
    }

    // 通常表示
    const title = document.createElement('span');
    title.className = 'bookmark-title';
    title.textContent = bookmark.title;
    title.title = bookmark.url;

    // アクションボタン
    const actions = document.createElement('div');
    actions.className = 'bookmark-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'bookmark-action-btn';
    editBtn.textContent = '✏️';
    editBtn.title = '編集';
    editBtn.onclick = (e) => {
      e.stopPropagation();
      this.startEditBookmark(bookmark.id);
    };

    // フォルダ移動ボタン
    const moveBtn = document.createElement('button');
    moveBtn.className = 'bookmark-action-btn';
    moveBtn.textContent = '📂';
    moveBtn.title = 'フォルダに移動';
    moveBtn.onclick = (e) => {
      e.stopPropagation();
      this.showMoveMenu(bookmark.id, e.target);
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'bookmark-action-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.title = '削除';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      this.removeBookmark(bookmark.id);
    };

    actions.appendChild(editBtn);
    actions.appendChild(moveBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(favicon);
    item.appendChild(title);
    item.appendChild(actions);

    // クリックでそのURLで新規タブを開く
    item.onclick = () => {
      this.hideDropdown();
      if (this.eventHandlers.onBookmarkClick) {
        this.eventHandlers.onBookmarkClick(bookmark);
      }
    };

    return item;
  }

  /**
   * 移動先メニューを表示
   * @param {string} bookmarkId - ブックマークID
   * @param {HTMLElement} target - ターゲット要素
   */
  showMoveMenu(bookmarkId, target) {
    // 既存のメニューを削除
    const existingMenu = document.querySelector('.bookmark-move-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
    if (!bookmark) return;

    this.moveMenuOpen = true;

    const menu = document.createElement('div');
    menu.className = 'bookmark-move-menu';

    // ルートに移動オプション
    if (bookmark.folderId) {
      const rootItem = document.createElement('div');
      rootItem.className = 'move-menu-item';
      rootItem.textContent = '📄 ルートに移動';
      rootItem.onclick = (e) => {
        e.stopPropagation();
        this.moveBookmarkToFolder(bookmarkId, null);
        menu.remove();
        this.moveMenuOpen = false;
      };
      menu.appendChild(rootItem);
    }

    // フォルダ一覧
    this.folders.forEach(folder => {
      if (folder.id !== bookmark.folderId) {
        const folderItem = document.createElement('div');
        folderItem.className = 'move-menu-item';
        folderItem.textContent = `📁 ${folder.name}`;
        folderItem.onclick = (e) => {
          e.stopPropagation();
          this.moveBookmarkToFolder(bookmarkId, folder.id);
          menu.remove();
          this.moveMenuOpen = false;
        };
        menu.appendChild(folderItem);
      }
    });

    if (menu.children.length === 0) {
      const noFolder = document.createElement('div');
      noFolder.className = 'move-menu-item disabled';
      noFolder.textContent = 'フォルダがありません';
      menu.appendChild(noFolder);
    }

    // 位置調整
    const rect = target.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 4}px`;

    document.body.appendChild(menu);

    // 外側クリックで閉じる
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        this.moveMenuOpen = false;
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }
}
