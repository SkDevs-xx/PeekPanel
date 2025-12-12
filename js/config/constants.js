// 初期AI設定
export const DEFAULT_AIS = [
  { id: 'gemini', url: 'https://gemini.google.com/app' },
  { id: 'claude', url: 'https://claude.ai/new' },
  { id: 'chatgpt', url: 'https://chatgpt.com' },
  { id: 'grok', url: 'https://grok.com/' }
];

// AI URLマップ（バックグラウンドスクリプト用）
export const AI_URLS = {
  'claude': 'https://claude.ai',
  'chatgpt': 'https://chatgpt.com',
  'gemini': 'https://gemini.google.com/app',
  'grok': 'https://grok.com/'
};

// デフォルトプロンプト定義
export const DEFAULT_PROMPTS = [
  {
    id: 'default-cleanup',
    name: '清書する',
    prompt: '次の文章を読みやすく清書してください:\n\n{text}',
    enabled: true,
    isDefault: true
  },
  {
    id: 'default-summary',
    name: '要約する',
    prompt: '次の文章を簡潔に要約してください:\n\n{text}',
    enabled: true,
    isDefault: true
  },
  {
    id: 'default-translate',
    name: '英語に翻訳',
    prompt: '次の文章を英語に翻訳してください:\n\n{text}',
    enabled: true,
    isDefault: true
  },
  {
    id: 'default-professional',
    name: 'ビジネス文書化',
    prompt: '次の文章をビジネス文書として整形してください:\n\n{text}',
    enabled: true,
    isDefault: true
  }
];

// AI設定オブジェクト (Strategy パターン) - ai-auto-input.js用
export const AI_CONFIGS = {
  claude: {
    name: 'Claude',
    urlPattern: 'claude.ai',
    selectors: [
      '.ProseMirror',
      'div[contenteditable="true"]',
      'div[role="textbox"]',
      'textarea',
      'div[data-placeholder]'
    ],
    timeout: 15000, // Claudeは重いので15秒
    submitSelectors: [
      'button[aria-label="Send Message"]',
      'button[aria-label^="Send"]'
    ],
    submitMethod: 'keyboard', // Cmd+Enter送信
    waitAfterInput: 500,
    insertMethod: 'prosemirror' // ProseMirror用メソッドを使用
  },
  chatgpt: {
    name: 'ChatGPT',
    urlPattern: 'chatgpt.com',
    selectors: [
      '#prompt-textarea',
      'textarea[placeholder*="Message"]',
      'div[contenteditable="true"]',
      'textarea',
      'div[role="textbox"]'
    ],
    timeout: 10000,
    submitSelectors: [
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'button[type="submit"]',
      'button:has(svg)',
      '[data-testid="fruitjuice-send-button"]'
    ],
    submitMethod: 'button',
    waitAfterInput: 300,
    insertMethod: 'value' // value/textContentを使用
  },
  gemini: {
    name: 'Gemini',
    urlPattern: 'gemini.google.com',
    selectors: [
      'rich-textarea .ql-editor[contenteditable="true"]',  // 最優先: 実際のDOM構造
      '.ql-editor[contenteditable="true"]',                // フォールバック
      'div[aria-label*="プロンプト"][contenteditable="true"]', // 日本語UI
      'div[contenteditable="true"][role="textbox"]'        // 一般的なパターン
    ],
    timeout: 10000,
    submitSelectors: [
      'button[aria-label*="送信"]',
      'button[aria-label*="Send"]',
      'button.send-button',
      'button[type="submit"]',
      'button:has(svg)',
      '[mattooltip*="送信"]'
    ],
    submitMethod: 'button',
    waitAfterInput: 300,
    insertMethod: 'innerHTML' // innerHTMLを使用
  },
  grok: {
    name: 'Grok',
    urlPattern: 'grok.com',
    selectors: [
      'textarea',                           // 最優先: 最も確実
      'textarea[aria-label*="Grok"]',      // aria-label
      'div[contenteditable="true"]',
      'input[type="text"]'
    ],
    timeout: 8000,  // 3秒→8秒に延長（ページ読み込みを考慮）
    submitSelectors: [
      'button[type="submit"]',
      'button[aria-label*="Send"]',
      'button:has(svg)',
      'button.send-button'
    ],
    submitMethod: 'button',
    waitAfterInput: 300,
    insertMethod: 'value'
  }
};

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
  DEBOUNCE_DELAY: 300,               // デバウンス遅延（0.3秒）
  TOAST_DISPLAY_TIME: 2000,          // トースト表示時間（2秒）
  TOAST_FADE_TIME: 300,              // トーストフェード時間（0.3秒）
  TITLE_CHECK_INTERVAL: 5000,        // タイトルチェック間隔（5秒）
  RETRY_INTERVAL: 100,               // リトライ間隔（100ms）
  MAX_RETRY_COUNT: 10                // 最大リトライ回数
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
