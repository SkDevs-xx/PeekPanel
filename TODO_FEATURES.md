# PeekPanel - 追加機能案

レビューで指摘された改善案と、将来的に検討すべき機能のメモ。

---

## Architecture / Code Quality

- [ ] **browser-core.js の分割**: 848行の God Object を MessageHandler, NavigationManager, AIManager 等に分割
- [ ] **未使用ユーティリティの削除**: `domHelper.js` の DOMHelper クラスは実際のUIコードでほぼ未使用。削除を検討
- [ ] **PriorityQueue の簡素化**: タブ数は通常数十個程度なので `Array.sort()` で代替可能
- [ ] **constants.js の整理**: `DEFAULT_AIS` と `AI_URLS` の重複データを `DEFAULT_AIS` から `AI_URLS` を生成する形に統合

## Performance

- [ ] **content-script.js のポーリング最適化**: 5秒間隔のタイトルチェック + 1秒間隔のURLチェックが全タブで動作。アクティブタブのみに限定するか、間隔を延長
- [ ] **Tab lookup の O(1) 化**: `Map<Window, tabId>` のルックアップテーブルを導入し、メッセージ受信時の `getAllTabs().find()` を高速化
- [ ] **iframeManager のタイムアウト短縮**: 60秒 → 15-20秒に短縮（ユーザーは60秒待たない）

## Security

- [ ] **CSP動的ルールの改善**: 現在の実装はタブのドメインごとにルールを追加。タブ内のナビゲーション（リダイレクト等）で新しいドメインに遷移した場合にルールが追加されない可能性。iframe の `load` イベント監視で補完を検討
- [ ] **modalManager.js showCreateGroupModal() の DOM化**: GROUP_COLORS のテンプレートリテラル使用を DOM API に統一（現状はハードコード定数なので低リスクだが、一貫性のため）

## Features

- [ ] **簡易アドブロック**: declarativeNetRequest ルールで主要な広告ドメインをブロック（Chrome拡張の仕様でサイドパネル内のiframeには他の拡張のアドブロッカーが効かないため）
- [ ] **タブ検索**: タブが増えた時にタイトル/URLで検索できる機能
- [ ] **キーボードショートカット**: Ctrl+T (新規タブ), Ctrl+W (タブ閉じ), Ctrl+Tab (タブ切替) 等
- [ ] **i18n 対応**: 現在は日本語ハードコード。Chrome i18n API (`chrome.i18n`) で多言語化
- [ ] **タブのエクスポート/インポート**: 開いているタブ一覧をJSON/テキストで保存・復元
- [ ] **ピクチャーインピクチャー連携**: 動画サイトのPiPモードとの連携

## Testing

- [ ] **ユニットテスト導入**: EventEmitter, PriorityQueue, urlHelper, timeHelper 等のピュアロジックのテスト
- [ ] **E2Eテスト**: Puppeteer/Playwright でChrome拡張のE2Eテスト環境構築
