# PeekPanel

Chrome拡張機能として動作するサイドパネルブラウザ。AIサービス（Claude、ChatGPT、Gemini）をiframe内で表示し、X-Frame-Options/Content-Security-Policyヘッダーを回避して埋め込みを実現します。

## 🚀 特徴

### コア機能
- **X-Frame-Options回避**: `declarativeNetRequest` APIでヘッダーを削除し、通常は埋め込み不可能なサイトをiframe表示
- **タブ管理**: 複数タブの作成・削除・切り替え、ドラッグ&ドロップ並び替え
- **タブグループ**: Chromeライクなタブグループ機能（色分け、折りたたみ、ドラッグ移動）
- **AI連携**: テキスト選択からAIへの自動入力（清書/要約/翻訳/ビジネス文書化）
- **メモリ管理**: タブ自動スリープ機能で省メモリ動作
- **履歴管理**: タブごとの履歴、最近閉じたタブの復元

### UI/UX
- ダークモード対応（システム設定に追従）
- Chrome DevToolsライクなデザイン
- ファビコン自動取得（3段階フォールバック）
- カスタムコンテキストメニュー
- ドラッグ&ドロップ対応

## 📦 インストール

### 開発環境でのセットアップ

1. リポジトリをクローン
```bash
git clone <repository-url>
cd subrowser/PeekPanel
```

2. Chromeで拡張機能をロード
   - `chrome://extensions/` を開く
   - 「デベロッパーモード」を有効化
   - 「パッケージ化されていない拡張機能を読み込む」をクリック
   - `PeekPanel` ディレクトリを選択

3. サイドパネルを開く
   - 拡張機能アイコンをクリック
   - または右クリックメニューから「サブパネルで開く」

### 必要な権限
```json
{
  "permissions": [
    "sidePanel",
    "declarativeNetRequestWithHostAccess",
    "contextMenus",
    "storage",
    "tabs"
  ],
  "host_permissions": ["<all_urls>"]
}
```

## 🏗️ アーキテクチャ

### ファイル構成
```
PeekPanel/
├── manifest.json              # 拡張機能の設定
├── js/
│   ├── panel.js               # メインロジック（タブ管理、グループ管理）
│   ├── background.js          # バックグラウンドスクリプト
│   └── content-script.js      # AIサービスへのテキスト挿入
├── pages/
│   └── panel.html             # サイドパネルUI
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

### 主要コンポーネント

#### 1. ヘッダー回避システム (`panel.js`)
```javascript
async function setupHeaderRemoval() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          { header: "x-frame-options", operation: "remove" },
          { header: "content-security-policy", operation: "remove" }
        ]
      },
      condition: {
        urlFilter: "*",
        resourceTypes: ["sub_frame"]
      }
    }]
  });
}
```

#### 2. タブ管理
- **データ構造**:
```javascript
{
  id: 'tab-1',
  url: 'https://example.com',
  title: 'Example',
  favicon: 'https://example.com/favicon.ico',
  groupId: null,  // タブグループID（未所属の場合null）
  history: [],
  historyIndex: 0,
  isSleeping: false
}
```

#### 3. タブグループ
- **データ構造**:
```javascript
{
  id: 'group-1',
  name: 'Work',
  colorId: 'blue',
  color: '#1A73E8',
  isCollapsed: true
}
```

- **グループカラー**: Chromeの標準10色に対応
  - グレー、ピンク、青、シアン、緑、黄色、オレンジ、赤、紫、ライトブルー

#### 4. ファビコン取得（3段階フォールバック）
```javascript
function getRealFavicon(url) {
  const domain = new URL(url).origin;

  // 1. /favicon.ico を試す
  // 2. Google Favicon API を使う
  // 3. 絵文字にフォールバック

  return faviconUrl;
}
```

## 🎨 UI設計

### タブバー
- 高さ: 可変（`padding: 2px 4px 2px 8px`）
- タブサイズ: 32px × 32px
- タブグループヘッダー: 24px高、可変幅（最大100px）

### タブグループツリー
- 高さ: 41px（ナビゲーションバーと同じ）
- 表示位置: タブバーの真下にオーバーレイ
- レイアウト: 横並び（`flex-direction: row`）
- スクロール: 横スクロール対応

### ブラウザコントロール
- 高さ: 41px
- 構成: 戻る/進む/リロードボタン、URLバー、設定ボタン

### カラーテーマ
- ダークモード: `--bg-primary: #202124`
- ライトモード: `--bg-primary: #ffffff`
- システム設定に自動追従（`prefers-color-scheme`）

## 🔧 開発ガイド

### タブの追加
```javascript
function createTab(url, options = {}) {
  const newTab = {
    id: `tab-${tabCounter++}`,
    url: url || 'about:blank',
    title: options.title || 'New Tab',
    favicon: options.favicon || '🌐',
    groupId: options.groupId || null,
    history: [url],
    historyIndex: 0,
    isSleeping: false,
    isInternal: options.isInternal || false
  };

  tabs.push(newTab);
  rebuildTabBar();
  switchTab(newTab.id);
  saveTabs();

  return newTab.id;
}
```

### タブグループの作成
```javascript
function createTabGroup(name, colorId) {
  const groupId = `group-${groupCounter++}`;
  const color = GROUP_COLORS.find(c => c.id === colorId) || GROUP_COLORS[0];

  tabGroups.push({
    id: groupId,
    name: name,
    colorId: colorId,
    color: color.color,
    isCollapsed: true
  });

  saveTabs();
  return groupId;
}
```

### タブをグループに追加
```javascript
function addTabToGroup(tabId, groupId) {
  const tab = tabs.find(t => t.id === tabId);
  if (tab && !tab.isInternal) {
    tab.groupId = groupId;
    rebuildTabBar();
    saveTabs();
  }
}
```

## 🐛 既知の問題

### 動作しないサイト
以下のサイトはJavaScriptベースのフレームバスティングを使用しているため、ヘッダー削除では回避できません：
- X.com (Twitter)
- Gmail
- 一部の金融サイト

### パフォーマンス
- **メモリ消費**: 多数のタブを開くとメモリ使用量が増加
  - 対策: タブスリープ機能を有効化（`checkAndSleepTabs()`）
- **iframe初期化**: タブ切り替え時に若干のラグが発生する可能性

## 📝 TODO

### 高優先度
- [ ] メインブラウザとのタブ送受信機能
- [ ] エラー表示の実装（ページ読み込み失敗時）
- [ ] タブ検索機能

### 中優先度
- [ ] タブグループの折りたたみアニメーション
- [ ] URLバーのオートコンプリート
- [ ] ピクチャーインピクチャー対応

### 低優先度
- [ ] タブのプリセット機能
- [ ] セッションのエクスポート/インポート
- [ ] 複数AIへの同時質問機能

## 🤝 コントリビューション

現在は個人開発プロジェクトですが、Issue報告や機能提案は歓迎します。

## 📄 ライセンス

MIT License

## 🔗 関連リンク

- [Chrome Extensions API ドキュメント](https://developer.chrome.com/docs/extensions/)
- [declarativeNetRequest API](https://developer.chrome.com/docs/extensions/reference/declarativeNetRequest/)
- [Side Panel API](https://developer.chrome.com/docs/extensions/reference/sidePanel/)

---

**作成日**: 2025-11-05
**最終更新**: 2025-11-05
