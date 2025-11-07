# PeekPanel - 開発者向けドキュメント

## プロジェクト概要

**PeekPanel（旧名：SuBrowser）** は、AIサービスをChrome側パネル内で利用できる Chrome Manifest V3 拡張機能です。X-Frame-Options や Content-Security-Policy ヘッダーをバイパスして、通常は iframe に埋め込めないサイト（Gemini、Claude、ChatGPTなど）をタブ形式で表示できます。

### 主要機能

- **マルチタブブラウジング**: 複数のWebページを側パネル内でタブ切り替え
- **タブグループ機能**: タブをグループ化して整理
- **履歴管理**: 各タブの閲覧履歴を保存・復元
- **コンテキストメニュー統合**: 右クリックからサブパネルに送る、選択テキストをAIに送信
- **カスタムプロンプト**: ユーザー定義のプロンプトで選択テキストを処理
- **メディアミュート**: タブ単位で音声をミュート
- **タブの固定・複製**: よく使うタブを固定、タブを複製
- **自動スリープ**: 未使用タブを自動的にスリープ状態にしてメモリ節約

### 技術スタック

- **Chrome Extension Manifest V3**
- **Vanilla JavaScript (ES6 Modules)** - ビルドツール不使用
- **Chrome APIs**: `sidePanel`, `declarativeNetRequest`, `contextMenus`, `storage`, `scripting`, `tabs`
- **イベント駆動アーキテクチャ**: EventEmitterパターンによる疎結合設計

---

## アーキテクチャ

### 全体構成

```
PeekPanel/
├── manifest.json              # 拡張機能の設定ファイル
├── pages/                     # HTMLページ
│   ├── main.html             # メインのサイドパネルUI
│   ├── settings.html         # 設定画面
│   └── history.html          # 履歴画面
├── js/                       # JavaScript モジュール
│   ├── browser-core.js       # エントリーポイント（メイン制御）
│   ├── background.js         # Service Worker（バックグラウンド処理）
│   ├── content-script.js     # Content Script（全ページに注入）
│   ├── ai-auto-input.js      # AIサービスへの自動入力
│   ├── settings.js           # 設定画面のロジック
│   ├── history.js            # 履歴画面のロジック
│   ├── config/               # 設定・定数
│   │   └── constants.js      # デフォルトAI、グループカラー等
│   ├── storage/              # ストレージ管理
│   │   └── storageManager.js # Chrome Storage API のラッパー
│   ├── tabs/                 # タブ管理
│   │   ├── tabManager.js     # タブのライフサイクル管理
│   │   ├── tabGroups.js      # タブグループ管理
│   │   └── tabHistory.js     # 閉じたタブの履歴管理
│   ├── ui/                   # UI関連
│   │   ├── tabUI.js          # タブUIのレンダリング
│   │   ├── groupUI.js        # グループUIのレンダリング
│   │   ├── navigationUI.js   # ナビゲーションバー（戻る/進む/URL入力）
│   │   ├── contextMenu.js    # カスタムコンテキストメニュー
│   │   ├── dragDrop.js       # タブ/グループのドラッグ&ドロップ
│   │   ├── modalManager.js   # モーダルダイアログ管理
│   │   ├── errorManager.js   # エラー表示・リトライ処理
│   │   └── iframeManager.js  # iframe のライフサイクル管理
│   └── utils/                # ユーティリティ
│       ├── eventEmitter.js   # イベント発行・購読の基底クラス
│       ├── favicon.js        # ファビコン取得ロジック
│       └── urlHelper.js      # URL正規化・タイトル取得
└── icons/                    # 拡張機能アイコン
```

### コアコンセプト

#### 1. **ヘッダーバイパス機構**

通常、iframe内に埋め込めないサイトは以下のヘッダーで保護されています：

- `X-Frame-Options: DENY` / `SAMEORIGIN`
- `Content-Security-Policy: frame-ancestors 'none'`

PeekPanel は `declarativeNetRequest` API を使ってこれらのヘッダーを削除します：

```javascript
// browser-core.js:31-50
chrome.declarativeNetRequest.updateSessionRules({
  addRules: [{
    action: {
      type: "modifyHeaders",
      responseHeaders: [
        { header: "x-frame-options", operation: "remove" },
        { header: "content-security-policy", operation: "remove" }
      ]
    },
    condition: {
      urlFilter: "*",
      resourceTypes: ["sub_frame"]  // iframeのみ対象
    }
  }]
});
```

**制約**: JavaScript による frame-busting（`if (window.top !== window.self)`）は回避できません。X.com、Gmailなどは表示できません。

#### 2. **イベント駆動アーキテクチャ**

各コンポーネントは `EventEmitter` を継承し、イベントベースで通信します：

```javascript
// タブ作成イベントの発行（tabManager.js）
this.emit('tabCreated', { tabId, tabData, isActive, isInternal });

// イベントの購読（browser-core.js）
tabManager.on('tabCreated', ({ tabId, tabData, isActive, isInternal }) => {
  iframeManager.createIframeForTab(tabId, tabData.url, isActive, isInternal);
});
```

**主要イベント**:
- `tabCreated` - 新しいタブが作成された
- `tabClosed` - タブが閉じられた
- `tabSwitched` - アクティブタブが切り替わった
- `tabUpdated` - タブ情報（URL、タイトル等）が更新された
- `tabSlept` / `tabWoke` - タブがスリープ/復帰した

#### 3. **モジュール構成**

**責務の分離**:
- **Manager層** (`tabManager`, `groupManager`, `storageManager`): ビジネスロジック、状態管理
- **UI層** (`tabUI`, `groupUI`, `navigationUI`): DOM操作、レンダリング
- **Core層** (`browser-core.js`): 各モジュールの初期化と統合

---

## js/ 配下のファイル詳細

### エントリーポイント

#### `browser-core.js` (568行)

**役割**: サイドパネルのメインエントリーポイント。全モジュールを初期化し、統合します。

**主要責務**:
- 全マネージャーの初期化と依存関係の解決
- ヘッダー除去設定の適用
- イベントリスナーの登録（タブ作成/削除/切り替え時のiframe操作）
- グローバルなpostMessageハンドリング（内部ページとの通信）
- カスタムコンテキストメニュー（Google検索）の制御
- AI選択設定の読み込み・保存
- 自動スリープのタイマー起動

**主要な関数**:
- `setupHeaderRemoval()`: X-Frame-Options等のヘッダーを削除
- `navigateToUrl(url)`: 現在のタブでURLに遷移
- `reload()`: 現在のタブをリロード
- `sendTabToMainBrowser(tabId)`: タブをメインブラウザに送信（サブパネルから削除）
- `init()`: 全モジュールの初期化と設定

**依存関係**:
- すべてのマネージャークラス（Storage, Tab, Group, History, UI系）
- イベント購読により各マネージャーと連携

**イベント購読**:
- `tabCreated` → iframeを作成
- `tabSwitched` → iframe表示切り替え、エラーオーバーレイ表示制御
- `tabClosed` → iframeを削除
- `tabSlept` / `tabWoke` → iframeのアンロード/リロード

---

#### `background.js` (173行)

**役割**: Service Worker（バックグラウンドスクリプト）。拡張機能のライフサイクル全体で動作します。

**主要責務**:
- 拡張機能アイコンクリック時にサイドパネルを開く
- コンテキストメニューの作成と管理
  - 「サブパネルで開く」（ページ右クリック）
  - カスタムプロンプト（選択テキスト右クリック）
- コンテキストメニュークリック時の処理
  - サブパネルを開く
  - タブを移動（元のタブを閉じる）
  - 選択テキストをAIに送信
- iframe内からのコンテキストメニュークリックを無視（frameId チェック）
- カスタムプロンプトの変更を監視してメニューを動的に更新

**主要な関数**:
- `createPromptMenus()`: カスタムプロンプトのコンテキストメニューを生成
- デフォルトプロンプト定義（`DEFAULT_PROMPTS`）:
  - 清書する
  - 要約する
  - 英語に翻訳
  - ビジネス文書化

**イベントハンドラー**:
- `chrome.action.onClicked`: 拡張機能アイコンクリック
- `chrome.runtime.onInstalled`: インストール時、メニュー作成
- `chrome.contextMenus.onClicked`: コンテキストメニュークリック処理
- `chrome.storage.onChanged`: カスタムプロンプト変更時、メニュー再生成

**重要**: frameId をチェックして、サイドパネル内のiframeからのコンテキストメニュークリックを無視します（`info.frameId !== 0`）。

---

#### `content-script.js` (73行)

**役割**: すべてのページに注入されるContent Script。iframe内とメインページ両方で動作します。

**主要責務**:
- カスタムコンテキストメニューの表示制御（選択テキスト右クリック）
- デフォルトのコンテキストメニューを特定条件で無効化
- 親ウィンドウへのページ情報送信（タイトル、URL変更通知）
- メディア要素（audio/video）のミュート制御（postMessageで受信）
- 動的に追加されるメディア要素の監視（MutationObserver）

**postMessageハンドリング**:
- `muteMedia` / `unmuteMedia`: 親パネルからの指示でメディアをミュート/解除
- `showCustomContextMenu` / `hideCustomContextMenu`: カスタムメニュー表示制御

**通知メッセージ**:
- `updatePageTitle`: ページのタイトルとURLが変わったときに親パネルに通知

**重要**: CORS制約により、親パネルは直接iframe内のDOMにアクセスできないため、postMessageを使った双方向通信が必要です。

---

#### `ai-auto-input.js` (154行)

**役割**: AIサービス（Claude、ChatGPT、Gemini）ページ内で自動入力を実行します。

**主要責務**:
- `chrome.storage.local.pendingCleanupText` を監視
- AIサービスごとに異なる入力フィールドセレクターを使用
- テキスト入力後、設定に応じて自動送信
- 入力後に待機中フラグをクリア

**サポートサービス**:
- **Claude**: `div[contenteditable="true"][enterkeyhint="enter"]`
- **ChatGPT**: `#prompt-textarea`
- **Gemini**: `.ql-editor.textarea`

**送信トリガー**:
- `pendingAutoSubmit` フラグがtrueの場合、Enterキーイベントを発火して自動送信

**動作フロー**:
1. storage変更を検知
2. 現在のサイトに対応するセレクターで入力欄を探す
3. MutationObserverで入力欄が現れるまで待機
4. テキストを入力
5. （オプション）Enter キーイベントを発火して送信
6. storage をクリア

---

#### `settings.js` (247行)

**役割**: 設定ページ（settings.html）のロジック。

**主要責務**:
- カスタムプロンプトの追加・編集・削除・並び替え
- デフォルトプロンプトの有効/無効切り替え
- AI選択（Claude / ChatGPT / Gemini）
- 自動送信オン/オフ
- タブ自動スリープ時間の設定
- すべての履歴を削除
- 設定の保存・読み込み（chrome.storage.sync）

**UI要素**:
- カスタムプロンプトリスト（ドラッグ&ドロップで並び替え）
- プロンプト追加モーダル
- プロンプト編集モーダル
- AI選択ラジオボタン
- 自動送信チェックボックス
- スリープ時間ドロップダウン

**イベント**:
- プロンプトの追加・編集・削除・並び替えをリアルタイムで保存
- 親パネル（main.html）に `closeSettings` メッセージで閉じるよう通知

---

#### `history.js` (136行)

**役割**: 履歴ページ（history.html）のロジック。最近閉じたタブを表示・復元します。

**主要責務**:
- 閉じたタブの履歴を表示（最大50件）
- タブの復元（親パネルに `restoreTab` メッセージを送信）
- ファビコンの取得・表示
- 履歴の削除

**UI要素**:
- 履歴リスト（閉じた順）
- 各履歴項目（ファビコン、タイトル、URL、閉じた時刻）
- 削除ボタン（×）

**イベント**:
- 履歴クリック → 親パネルに `restoreTab` メッセージを送信してタブを復元
- 削除ボタンクリック → 履歴から削除
- 閉じるボタンクリック → 親パネルに `closeHistory` メッセージを送信

---

### config/

#### `constants.js` (27行)

**役割**: アプリ全体で使用する定数定義。

**定義内容**:
- `DEFAULT_AIS`: デフォルトで開くAIサービスのリスト
  ```javascript
  [
    { id: 'gemini', url: 'https://gemini.google.com/app' },
    { id: 'claude', url: 'https://claude.ai/new' },
    { id: 'chatgpt', url: 'https://chatgpt.com' }
  ]
  ```
- `GROUP_COLORS`: タブグループのカラーパレット（20色）
- `DEFAULT_FAVICON`: デフォルトのファビコン絵文字（🌐）

**使用箇所**:
- `browser-core.js`: 初期タブ作成時
- `groupUI.js`: グループカラー表示
- `tabUI.js`: ファビコン表示のフォールバック

---

### storage/

#### `storageManager.js` (165行)

**役割**: Chrome Storage API のラッパー。データの保存・読み込みを一元管理します。

**主要責務**:
- タブ情報の保存・読み込み（`chrome.storage.local`）
- タブグループ情報の保存・読み込み
- 閉じたタブの履歴の保存・読み込み（最大50件）
- AI選択情報の保存・読み込み（`chrome.storage.sync`）
- 設定の保存・読み込み

**主要メソッド**:
- `saveTabs(tabs, currentTabId)`: タブ配列を保存（内部ページは除外）
- `loadTabs()`: タブ配列と現在のタブインデックスを読み込み
- `saveTabGroups(tabGroups)`: グループ配列を保存
- `loadTabGroups()`: グループ配列を読み込み
- `saveClosedTabsHistory(history)`: 閉じたタブの履歴を保存
- `loadClosedTabsHistory()`: 閉じたタブの履歴を読み込み
- `saveAll(tabs, currentTabId, tabGroups)`: タブとグループを一括保存
- `loadAll()`: タブとグループを一括読み込み

**保存データ構造**:
```javascript
{
  savedTabs: [
    {
      url: string,
      title: string,
      history: string[],
      historyIndex: number,
      isPinned: boolean,
      isMuted: boolean,
      groupId: string | null
    }
  ],
  currentTabIndex: number,
  tabGroups: [
    {
      id: string,
      name: string,
      colorId: string,
      isCollapsed: boolean
    }
  ],
  closedTabsHistory: [
    {
      url: string,
      title: string,
      history: string[],
      historyIndex: number,
      closedAt: number (timestamp)
    }
  ]
}
```

---

### tabs/

#### `tabManager.js` (341行)

**役割**: タブのライフサイクル管理。アプリのコアロジックです。

**継承**: `EventEmitter` を継承し、タブイベントを発行

**主要責務**:
- タブの作成・削除・切り替え
- タブの状態管理（URL、タイトル、履歴、ピン、ミュート等）
- タブの履歴管理（戻る/進む）
- タブの自動スリープ（未使用タブのメモリ解放）
- タブの複製
- 全タブ状態の保存（StorageManager経由）

**データ構造**:
```javascript
{
  id: string,              // 'tab-1', 'tab-2'...
  url: string,
  title: string,
  history: string[],       // 閲覧履歴
  historyIndex: number,    // 現在位置
  isPinned: boolean,
  isMuted: boolean,
  groupId: string | null,
  isInternal: boolean,     // settings.html / history.html
  needsLoad: boolean,      // 遅延ロードフラグ
  isLoaded: boolean,       // 読み込み完了フラグ
  hasError: boolean,       // エラー発生フラグ
  lastAccessTime: number,  // 最終アクセス時刻
  isNavigatingHistory: boolean  // 履歴ナビゲーション中フラグ
}
```

**主要メソッド**:
- `createTab(url, isActive, isInternal)`: 新しいタブを作成（`tabCreated` イベント発行）
- `closeTab(tabId)`: タブを閉じる（履歴に保存、`tabClosed` イベント発行）
- `switchTab(tabId)`: アクティブタブを切り替え（`tabSwitched` イベント発行）
- `duplicateTab(tabId)`: タブを複製
- `updateTabUrl(tabId, url)`: URL変更と履歴追加
- `updateTabTitle(tabId, title)`: タイトルを更新（`tabUpdated` イベント発行）
- `goBack(tabId)` / `goForward(tabId)`: 履歴ナビゲーション
- `togglePinTab(tabId)`: タブの固定/解除
- `toggleMuteTab(tabId)`: タブのミュート/解除
- `checkAndSleepTabs()`: 自動スリープチェック（1分ごとに呼ばれる）
- `sleepTab(tabId)`: タブをスリープ状態にする（`tabSlept` イベント発行）
- `wakeTab(tabId)`: タブをスリープから復帰（`tabWoke` イベント発行）

**イベント発行**:
- `tabCreated`: 新しいタブが作成された
- `tabClosed`: タブが閉じられた
- `tabSwitched`: アクティブタブが切り替わった
- `tabUpdated`: タブ情報（URL、タイトル等）が更新された
- `tabSlept`: タブがスリープ状態になった
- `tabWoke`: タブがスリープから復帰した

**自動スリープ**:
- 設定された時間（デフォルト30分）以上アクセスがないタブを自動的にスリープ
- スリープ状態のタブは iframe の src を `about:blank` にしてメモリを解放
- タブに切り替えると自動的に復帰

---

#### `tabGroups.js` (211行)

**役割**: タブグループの管理。タブをグループ化して整理します。

**主要責務**:
- タブグループの作成・削除・名前変更
- タブのグループへの追加・削除
- グループの折りたたみ/展開
- グループカラーの変更
- グループ全体の削除（タブも一緒に削除）
- グループ解除（タブは残す）

**データ構造**:
```javascript
{
  id: string,            // 'group-1', 'group-2'...
  name: string,
  colorId: string,       // GROUP_COLORS のID
  tabIds: string[],      // このグループに属するタブID
  isCollapsed: boolean
}
```

**主要メソッド**:
- `createTabGroup(name, colorId, tabIds)`: 新しいグループを作成
- `addTabToGroup(tabId, groupId)`: タブをグループに追加
- `removeTabFromGroup(tabId)`: タブをグループから削除
- `renameTabGroup(groupId, newName)`: グループ名を変更
- `changeGroupColor(groupId, colorId)`: グループカラーを変更
- `toggleGroupCollapse(groupId)`: グループの折りたたみ/展開
- `deleteTabGroup(groupId)`: グループとタブを削除
- `ungroupTabs(groupId)`: グループを解除（タブは残す）
- `getGroupTabs(groupId)`: グループ内のタブを取得

**保存**:
- タブグループ情報を `StorageManager` 経由で `chrome.storage.local` に保存

---

#### `tabHistory.js` (85行)

**役割**: 閉じたタブの履歴管理。最近閉じたタブを復元できます。

**主要責務**:
- 閉じたタブの履歴に追加（最大50件）
- 履歴の読み込み
- 履歴の削除
- 履歴のクリア

**データ構造**:
```javascript
{
  url: string,
  title: string,
  history: string[],      // タブの閲覧履歴
  historyIndex: number,
  closedAt: number        // タイムスタンプ
}
```

**主要メソッド**:
- `init()`: 履歴を読み込み
- `addToHistory(tabData)`: 閉じたタブを履歴に追加
- `removeFromHistory(index)`: 履歴から削除
- `clearHistory()`: 履歴をすべて削除
- `getHistory()`: 履歴を取得

**制約**:
- 内部ページ（settings.html / history.html）は履歴に保存されません
- 最大50件まで保存、古いものから削除されます

---

### ui/

#### `tabUI.js` (339行)

**役割**: タブUIのレンダリングとイベントハンドリング。

**主要責務**:
- タブ要素の作成・レンダリング
- タブのアクティブ状態表示
- タブのファビコン取得・表示
- タブのタイトル更新
- タブバーの再構築（グループを含む）
- タブのピン表示
- タブのミュート表示
- タブのクリック/中クリックイベント
- タブの右クリックメニュー

**主要メソッド**:
- `renderTab(tab)`: タブ要素をDOM に追加
- `removeTabElement(tabId)`: タブ要素をDOM から削除
- `setActiveTab(tabId)`: アクティブなタブを視覚的に強調
- `updateTabFavicon(tabId)`: ファビコンを取得して表示
- `updateTabTitle(tabId)`: タブのタイトルを更新
- `rebuildTabBar(groupUI)`: タブバー全体を再構築（グループ化対応）
- `createTabElement(tab)`: タブHTML要素を生成

**イベントリスナー**:
- タブクリック → `eventHandlers.onTabClick(tabId)`
- タブ中クリック → `eventHandlers.onTabMiddleClick(tabId)` （タブを閉じる）
- タブ右クリック → `eventHandlers.onTabContextMenu(tabId, x, y)`
- タブ閉じるボタン → `tabManager.closeTab(tabId)`

**TabManager イベント購読**:
- `tabCreated` → `renderTab()`
- `tabClosed` → `removeTabElement()`
- `tabSwitched` → `setActiveTab()`
- `tabUpdated` → `updateTabTitle()` / `updateTabFavicon()`

**ファビコン取得**:
1. 直接URL（`${origin}/favicon.ico`）
2. Google Favicon API（`https://www.google.com/s2/favicons?domain=...`）
3. フォールバック（デフォルト絵文字 🌐）

---

#### `groupUI.js` (191行)

**役割**: タブグループUIのレンダリング。

**主要責務**:
- グループ要素の作成・レンダリング
- グループヘッダーの表示（名前、カラー、折りたたみ状態）
- グループ内タブの配置
- グループの右クリックメニュー

**主要メソッド**:
- `createGroupElement(group, tabs)`: グループHTML要素を生成
- `createGroupHeader(group)`: グループヘッダー要素を生成
- `setCollapsedState(groupId, isCollapsed)`: 折りたたみ状態を設定

**イベントリスナー**:
- グループヘッダークリック → `eventHandlers.onGroupHeaderClick(groupId)` （折りたたみ切り替え）
- グループ右クリック → `eventHandlers.onGroupContextMenu(groupId, x, y)`

**グループヘッダー構成**:
```html
<div class="group-header">
  <span class="collapse-icon">▼/▶</span>
  <span class="group-color" style="background: ..."></span>
  <span class="group-name">グループ名</span>
  <span class="group-tab-count">(3)</span>
</div>
```

---

#### `navigationUI.js` (119行)

**役割**: ナビゲーションバーの制御（戻る/進む/リロード/URL入力）。

**主要責務**:
- 戻る/進むボタンの有効/無効状態管理
- URL入力欄の表示・更新
- リロードボタン
- 新しいタブボタン（+）

**主要メソッド**:
- `updateNavigationState(tab)`: 現在のタブに応じてボタン状態を更新
- `updateUrlBar(url)`: URL入力欄を更新

**イベントリスナー**:
- 戻るボタン → `eventHandlers.onBackClick()`
- 進むボタン → `eventHandlers.onForwardClick()`
- リロードボタン → `eventHandlers.onReloadClick()`
- URL入力欄でEnter → `eventHandlers.onNavigateToUrl(url)`
- 新しいタブボタン → `eventHandlers.onNewTabClick()`

**TabManager イベント購読**:
- `tabSwitched` → `updateNavigationState()` / `updateUrlBar()`
- `tabUpdated` → `updateUrlBar()`

---

#### `contextMenu.js` (396行)

**役割**: カスタムコンテキストメニューの表示と処理。

**主要責務**:
- タブ右クリックメニュー
  - タブの固定/固定解除
  - ミュート/ミュート解除
  - タブを複製
  - メインブラウザで開く
  - タブを閉じる
  - グループに追加/グループから削除
- グループ右クリックメニュー
  - グループ名を変更
  - グループカラーを変更
  - グループを折りたたむ/展開
  - グループを解除
  - グループを削除

**主要メソッド**:
- `showTabContextMenu(tabId, x, y)`: タブ右クリックメニューを表示
- `showGroupManagementMenu(groupId, x, y)`: グループ右クリックメニューを表示
- `hideMenu()`: メニューを非表示

**メニュー構成**:
- ピン/ピン解除
- ミュート/ミュート解除
- タブを複製
- メインブラウザで開く
- タブを閉じる
- 区切り線
- 既存グループに追加（サブメニュー）
- 新しいグループを作成
- グループから削除（グループに属する場合のみ）

**グループメニュー**:
- グループ名を変更
- グループカラーを変更（サブメニュー）
- グループを折りたたむ/展開
- グループを解除（タブは残す）
- グループを削除（タブも削除）

---

#### `dragDrop.js` (323行)

**役割**: タブとグループのドラッグ&ドロップ機能。

**主要責務**:
- タブの並び替え
- タブのグループ間移動
- グループヘッダーの並び替え

**主要メソッド**:
- `setupTabDragDrop(tabElement)`: タブ要素にドラッグ機能を設定
- `setupGroupHeaderDragDrop(groupHeaderElement)`: グループヘッダーにドラッグ機能を設定
- `setupGroupContainerDragDrop(groupContainerElement)`: グループコンテナにドロップ機能を設定
- `getDragAfterElement(container, x)`: ドロップ位置を計算

**ドラッグ&ドロップの挙動**:
1. **タブのドラッグ**:
   - タブバー上で並び替え
   - グループコンテナにドロップでグループに追加
   - グループ外にドロップでグループから削除

2. **グループヘッダーのドラッグ**:
   - グループ全体の並び替え

**イベント**:
- `dragstart`: ドラッグ開始、データ転送設定
- `dragover`: ドラッグ中、ドロップ可能位置を計算
- `drop`: ドロップ、並び替え処理
- `dragend`: ドラッグ終了、スタイルをリセット

---

#### `modalManager.js` (176行)

**役割**: モーダルダイアログの表示と処理。

**主要責務**:
- グループ作成モーダル
- グループ削除確認ダイアログ
- グループ解除確認ダイアログ

**主要メソッド**:
- `showCreateGroupModal(tabId)`: グループ作成モーダルを表示
- `showDeleteGroupDialog(groupId, tabCount)`: グループ削除確認ダイアログを表示
- `showUngroupDialog(groupId, tabCount)`: グループ解除確認ダイアログを表示

**モーダル構成**:
- **グループ作成モーダル**:
  - グループ名入力欄
  - カラー選択（20色のパレット）
  - 作成ボタン / キャンセルボタン

- **削除/解除確認ダイアログ**:
  - 確認メッセージ
  - OKボタン / キャンセルボタン

---

#### `errorManager.js` (129行)

**役割**: iframe読み込みエラーの処理と表示。

**主要責務**:
- iframe読み込みタイムアウト検出
- エラーオーバーレイ表示
- リトライ機能

**主要メソッド**:
- `handleIframeError(tabId, errorType)`: エラーを処理してオーバーレイを表示
- `showErrorOverlay(tabId)`: エラーオーバーレイを表示
- `retryLoadTab(tabId)`: タブを再読み込み
- `hideErrorOverlay()`: エラーオーバーレイを非表示

**エラーオーバーレイ構成**:
```html
<div class="error-overlay">
  <div class="error-content">
    <div class="error-icon">⚠️</div>
    <div class="error-message">読み込みに失敗しました</div>
    <button class="error-retry-button">再試行</button>
  </div>
</div>
```

**エラー検出**:
- 15秒以内にiframeが読み込まれない場合、タイムアウトエラー
- エラー発生時、タブに `hasError` フラグを設定

---

#### `iframeManager.js` (113行)

**役割**: iframe のライフサイクル管理。

**主要責務**:
- 新しいタブに対応するiframeを作成
- iframeの読み込み完了検出
- iframeの読み込みタイムアウト検出
- 内部ページ（settings.html / history.html）の特別処理
- ファビコン更新トリガー

**主要メソッド**:
- `createIframeForTab(tabId, url, isActive, isInternal)`: タブに対応するiframeを作成

**iframe作成フロー**:
1. iframe要素を生成
2. `id`、`src`、`sandbox` 属性を設定
3. 読み込み完了イベント（`load`）をリスン
4. タイムアウト監視（15秒）を開始
5. DOM に追加
6. アクティブでない場合は非表示
7. 読み込み完了 or タイムアウト → ファビコン更新 or エラー表示

**sandbox属性**:
```javascript
sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
```

**内部ページ判定**:
- URL に `/pages/main.html` が含まれる場合、内部ページとして扱う

---

### utils/

#### `eventEmitter.js` (43行)

**役割**: イベント発行・購読のための基底クラス。

**主要責務**:
- イベントリスナーの登録
- イベントの発行
- イベントリスナーの削除

**主要メソッド**:
- `on(event, listener)`: イベントリスナーを登録
- `off(event, listener)`: イベントリスナーを削除
- `emit(event, data)`: イベントを発行、全リスナーを実行

**使用例**:
```javascript
class TabManager extends EventEmitter {
  createTab(url) {
    const tab = { id: 'tab-1', url };
    this.emit('tabCreated', { tabId: tab.id, tabData: tab });
  }
}

const tabManager = new TabManager();
tabManager.on('tabCreated', ({ tabId, tabData }) => {
  console.log('Tab created:', tabId);
});
```

---

#### `favicon.js` (77行)

**役割**: ファビコンの取得ロジック。

**主要責務**:
- URLからファビコンを取得
- 複数のフォールバック戦略
- デフォルト絵文字の返却

**主要関数**:
- `getRealFavicon(url)`: ファビコンURLを取得（Promiseを返す）

**フォールバック戦略**:
1. 直接URL: `https://example.com/favicon.ico`
2. Google Favicon API: `https://www.google.com/s2/favicons?domain=example.com&sz=32`
3. デフォルト絵文字: 🌐

**実装詳細**:
```javascript
async function getRealFavicon(url) {
  try {
    const urlObj = new URL(url);
    const faviconUrl = `${urlObj.origin}/favicon.ico`;

    // 直接URLを試す
    const response = await fetch(faviconUrl, { method: 'HEAD' });
    if (response.ok) return faviconUrl;

    // Google Favicon API を試す
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
  } catch {
    return DEFAULT_FAVICON;
  }
}
```

---

#### `urlHelper.js` (66行)

**役割**: URL関連のユーティリティ関数。

**主要関数**:
- `normalizeUrl(url)`: URLを正規化（http/https補完、末尾スラッシュ削除等）
- `getTabTitle(url)`: URLからタイトルを生成（ホスト名抽出）

**URL正規化**:
```javascript
normalizeUrl('google.com')        → 'https://google.com'
normalizeUrl('http://google.com') → 'http://google.com'
normalizeUrl('google.com/')       → 'https://google.com'
```

**タイトル生成**:
```javascript
getTabTitle('https://google.com') → 'google.com'
getTabTitle('chrome://newtab')    → '新しいタブ'
getTabTitle('about:blank')        → '空白ページ'
```

---

## 開発セットアップ

### 必要な環境

- **Chrome**: バージョン 114 以上（Side Panel API対応）
- **エディタ**: VS Code推奨（JavaScript対応）

### ローカルでの実行

1. **リポジトリをクローン**:
   ```bash
   git clone <repository-url>
   cd PeekPanel
   ```

2. **Chrome拡張機能として読み込み**:
   - Chrome で `chrome://extensions/` を開く
   - 「デベロッパーモード」を有効化
   - 「パッケージ化されていない拡張機能を読み込む」をクリック
   - `PeekPanel/` ディレクトリを選択

3. **変更をテスト**:
   - コードを編集
   - `chrome://extensions/` で拡張機能のリロードボタンをクリック
   - サイドパネルを再度開いて変更を確認

**重要**: ビルドプロセスは不要です。すべてバニラJavaScriptで書かれています。

---

## デバッグ方法

### サイドパネルのデバッグ

1. サイドパネルを開く
2. サイドパネル内で右クリック → 「検証」
3. DevToolsが開き、console.log やエラーを確認できます

### Service Worker（background.js）のデバッグ

1. `chrome://extensions/` を開く
2. PeekPanel の「サービスワーカー」をクリック
3. DevToolsが開き、background.js のログを確認できます

### Content Script（content-script.js / ai-auto-input.js）のデバッグ

1. iframe内のページで右クリック → 「検証」
2. Consoleタブでcontent-script.jsのログを確認
3. 「Sources」タブで `content-script.js` にブレークポイントを設定

### Storage の確認

1. サイドパネルのDevToolsを開く
2. 「Application」タブ → 「Storage」 → 「Local Storage」または「Sync Storage」
3. `chrome-extension://...` を展開して保存データを確認

---

## コーディング規約

### スタイル

- **ES6 Modules**: `import` / `export` を使用
- **クラスベース**: マネージャー層はすべてクラス
- **イベント駆動**: `EventEmitter` を継承してイベント発行
- **日本語コメント**: コード内のコメントは日本語
- **日本語UI**: すべてのUI文字列は日本語

### ファイル命名規則

- **エントリーポイント**: `browser-core.js`, `background.js`, `content-script.js`
- **マネージャー**: `tabManager.js`, `groupManager.js`, `storageManager.js`
- **UI**: `tabUI.js`, `groupUI.js`, `navigationUI.js`
- **ユーティリティ**: `urlHelper.js`, `favicon.js`, `eventEmitter.js`

### モジュール構成原則

- **単一責任**: 各モジュールは1つの責務のみ
- **疎結合**: イベントベースで通信、直接依存を避ける
- **高凝集**: 関連する機能は同じモジュールにまとめる

### イベント命名規則

- **過去形**: `tabCreated`, `tabClosed`, `tabSwitched`
- **データ構造**: `{ tabId, tabData, isActive, isInternal }`

---

## トラブルシューティング

### iframe が表示されない

- **原因**: JavaScript frame-busting（`if (window.top !== window.self)`）
- **対策**: このサイトは表示できません（X.com、Gmailなど）

### コンテキストメニューが iframe 内で表示される

- **原因**: `frameId` チェックが機能していない
- **対策**: `background.js:127` の `if (info.frameId && info.frameId !== 0)` を確認

### タブが保存されない

- **原因**: `StorageManager.saveTabs()` が呼ばれていない
- **対策**: `TabManager.save()` が各変更後に呼ばれているか確認

### メディアがミュートされない

- **原因**: CORS制約、postMessageが届いていない
- **対策**: `content-script.js` の postMessage ハンドラーを確認

---

## パフォーマンス最適化

### タブの遅延読み込み

- アクティブでないタブは `needsLoad` フラグを立て、切り替え時に読み込み
- メモリ使用量を削減

### 自動スリープ

- 設定時間以上アクセスがないタブを `about:blank` にしてメモリを解放
- `TabManager.checkAndSleepTabs()` が1分ごとに実行

### ファビコンキャッシュ

- 一度取得したファビコンはDOM内に保持、再取得不要

---

## 今後の拡張案

- **ブックマーク機能**: よく使うサイトをブックマーク
- **タブ検索**: 開いているタブをキーワードで検索
- **タブ履歴の永続化**: 閉じたタブの履歴を無制限に保存
- **タブのエクスポート**: タブ状態をファイルに保存
- **マルチウィンドウ対応**: 複数のChromeウィンドウで独立したタブ管理
- **キーボードショートカット**: タブ切り替え、グループ操作のショートカット

---

## ライセンス

（ライセンス情報をここに記載）

---

## 貢献

バグ報告や機能提案は Issue でお願いします。Pull Request も歓迎です。

---

## 連絡先

（連絡先情報をここに記載）
