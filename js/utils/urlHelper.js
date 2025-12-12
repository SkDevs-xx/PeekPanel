/**
 * URLからタブタイトルを生成
 * @param {string} url - URL
 * @returns {string} タイトル（ホスト名）
 */
export function getTabTitle(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

/**
 * URLを正規化（プロトコルを自動補完）またはGoogle検索URLを生成
 * @param {string} input - 入力（URLまたは検索クエリ）
 * @returns {string} 正規化されたURLまたは検索URL
 */
export function normalizeUrl(input) {
  if (!input) return '';

  const trimmed = input.trim();

  // 既にプロトコルがある場合はそのまま返す
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') ||
    trimmed.startsWith('about:') || trimmed.startsWith('chrome:') ||
    trimmed.startsWith('chrome-extension://')) {
    return trimmed;
  }

  // URLパターンをチェック（ドメイン形式かどうか）
  // 例: google.com, sub.example.co.jp, localhost, 192.168.1.1
  const urlPattern = /^([\w-]+\.)+[\w-]+(:\d+)?(\/.*)?$|^localhost(:\d+)?(\/.*)?$|^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/.*)?$/;

  if (urlPattern.test(trimmed)) {
    // URLっぽい形式ならhttps://を追加
    return 'https://' + trimmed;
  }

  // それ以外はGoogle検索として扱う
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

/**
 * URLが内部ページ（拡張機能ページ）かチェック
 * @param {string} url - URL
 * @returns {boolean}
 */
export function isInternalPage(url) {
  if (!url) return false;
  return url.startsWith('chrome-extension://') || url.startsWith('about:') || url === '';
}

/**
 * URLからドメイン名を取得
 * @param {string} url - URL
 * @returns {string} ドメイン名
 */
export function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return '';
  }
}

/**
 * URLからプロトコルを取得
 * @param {string} url - URL
 * @returns {string} プロトコル（http, https, など）
 */
export function getProtocol(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol.replace(':', '');
  } catch {
    return '';
  }
}

/**
 * URLが有効かチェック
 * @param {string} url - URL
 * @returns {boolean}
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 検索クエリからGoogle検索URLを生成
 * @param {string} query - 検索クエリ
 * @returns {string} Google検索URL
 */
export function createSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/**
 * URLのパスパラメータを取得
 * @param {string} url - URL
 * @returns {Object} パスパラメータのオブジェクト
 */
export function getUrlParams(url) {
  try {
    const urlObj = new URL(url);
    const params = {};
    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  } catch {
    return {};
  }
}

/**
 * URLからファイル名を取得
 * @param {string} url - URL
 * @returns {string} ファイル名
 */
export function getFilename(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const parts = pathname.split('/');
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
}
