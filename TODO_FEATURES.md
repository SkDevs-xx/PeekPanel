# PeekPanel - 追加機能案

レビューで指摘された改善案と、将来的に検討すべき機能のメモ。

---

## Architecture / Code Quality

- [x] ~~**constants.js の整理**: `DEFAULT_AIS` と `AI_URLS` の重複データを統合~~ (baseUrl フィールド追加、AI_URLS を自動生成)
- [x] ~~**未使用ユーティリティの削除**: `domHelper.js` の DOMHelper クラス削除~~ (未使用確認済み)
- [x] ~~**PriorityQueue の簡素化**: Array.sort() ベースに置き換え~~ (138行 → 38行)
- [ ] **browser-core.js の分割**: God Object を MessageHandler, NavigationManager, AIManager 等に分割

## Performance

- [x] ~~**content-script.js のポーリング最適化**: document.hidden チェック追加、URL チェック間隔 1s→3s~~
- [x] ~~**Tab lookup の O(1) 化**: `Map<Window, tabId>` ルックアップテーブル導入~~
- [x] ~~**iframeManager のタイムアウト短縮**: 60秒 → 20秒~~
- [x] ~~**タブ切替の O(1) 化**: 全 iframe 走査 → 前アクティブのみ hide~~

## Security

- [x] ~~**CSP動的ルールの改善**: iframe load イベント監視で、リダイレクト後のドメインもルール追加~~
- [x] ~~**modalManager.js showCreateGroupModal() の DOM化**: GROUP_COLORS を DOM API で構築~~

## Features

- [ ] **簡易アドブロック**: declarativeNetRequest ルールで主要な広告ドメインをブロック
- [ ] **タブ検索**: タブが増えた時にタイトル/URLで検索できる機能
- [ ] **キーボードショートカット**: Ctrl+T (新規タブ), Ctrl+W (タブ閉じ), Ctrl+Tab (タブ切替) 等
- [ ] **i18n 対応**: Chrome i18n API (`chrome.i18n`) で多言語化
- [ ] **タブのエクスポート/インポート**: 開いているタブ一覧をJSON/テキストで保存・復元
- [ ] **ピクチャーインピクチャー連携**: 動画サイトのPiPモードとの連携

## Testing

- [ ] **ユニットテスト導入**: EventEmitter, PriorityQueue, urlHelper, timeHelper 等のピュアロジックのテスト
- [ ] **E2Eテスト**: Puppeteer/Playwright でChrome拡張のE2Eテスト環境構築
