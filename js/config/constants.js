// 初期AI設定
export const DEFAULT_AIS = [
  { id: 'gemini', url: 'https://gemini.google.com/app' },
  { id: 'claude', url: 'https://claude.ai/new' },
  { id: 'chatgpt', url: 'https://chatgpt.com' },
  { id: 'genspark', url: 'https://www.genspark.ai/' },
  { id: 'grok', url: 'https://grok.com/' },
  { id: 'manus', url: 'https://manus.im/app' }
];

// グループの色定義（Chromeの標準カラーに合わせた10色）
export const GROUP_COLORS = [
  { id: 'grey', color: '#5F6368', label: 'グレー', emoji: '⚪' },
  { id: 'pink', color: '#D93B93', label: 'ピンク', emoji: '🟣' },
  { id: 'blue', color: '#1A73E8', label: '青', emoji: '🔵' },
  { id: 'cyan', color: '#007B83', label: 'シアン', emoji: '🔷' },
  { id: 'green', color: '#188038', label: '緑', emoji: '🟢' },
  { id: 'yellow', color: '#E37400', label: '黄色', emoji: '🟡' },
  { id: 'orange', color: '#E8710A', label: 'オレンジ', emoji: '🟠' },
  { id: 'red', color: '#C5221F', label: '赤', emoji: '🔴' },
  { id: 'purple', color: '#A142F4', label: '紫', emoji: '🟣' },
  { id: 'lightblue', color: '#8AB4F8', label: 'ライトブルー', emoji: '🔵' }
];

// タイミング定数
export const TIMINGS = {
  AUTO_SLEEP_CHECK_INTERVAL: 60000,  // タブスリープチェック間隔（60秒）
  NOTIFICATION_DISPLAY_TIME: 3000,   // 通知表示時間（3秒）
  NOTIFICATION_FADE_TIME: 300,       // 通知フェード時間（0.3秒）
  ANIMATION_DURATION: 150,           // アニメーション時間（0.15秒）
  DEBOUNCE_DELAY: 300                // デバウンス遅延（0.3秒）
};

// UI定数
export const UI_CONSTANTS = {
  TAB_HEIGHT: 32,
  TAB_WIDTH: 32,
  GROUP_HEADER_HEIGHT: 24,
  TREE_HEIGHT: 41,
  BROWSER_CONTROLS_HEIGHT: 41,
  TAB_CONTAINER_PADDING_LEFT: 8,
  MAX_HISTORY_SIZE: 50               // 履歴の最大保存数
};

// エラーメッセージ
export const ERROR_MESSAGES = {
  LOAD_FAILED: '読み込みに失敗しました',
  NETWORK_ERROR: 'ネットワークエラーが発生しました',
  TIMEOUT: 'タイムアウトしました',
  UNKNOWN: '不明なエラーが発生しました'
};

// デフォルトファビコン
export const DEFAULT_FAVICON = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="20" font-size="20">🌐</text></svg>';
