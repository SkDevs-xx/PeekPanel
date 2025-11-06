import { DEFAULT_FAVICON } from '../config/constants.js';

/**
 * URLからファビコンURLを取得
 * @param {string} url - ページURL
 * @returns {string} ファビコンURL
 */
export function getRealFavicon(url) {
  try {
    const urlObj = new URL(url);
    // サイトのfavicon.icoを直接指定
    return `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
  } catch {
    return DEFAULT_FAVICON;
  }
}

/**
 * ファビコンURLを取得（フォールバック付き）
 * @param {string} url - ページURL
 * @param {Function} onLoad - 読み込み成功時のコールバック
 * @param {Function} onError - 読み込み失敗時のコールバック
 * @returns {Promise<string>} 有効なファビコンURL
 */
export async function getFaviconWithFallback(url) {
  return new Promise((resolve) => {
    const directFavicon = getRealFavicon(url);

    const img = new Image();

    img.onload = () => {
      resolve(directFavicon);
    };

    img.onerror = () => {
      // フォールバック: Google Favicon API
      try {
        const hostname = new URL(url).hostname;
        const fallbackUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;

        const fallbackImg = new Image();

        fallbackImg.onload = () => {
          resolve(fallbackUrl);
        };

        fallbackImg.onerror = () => {
          // 最終フォールバック: デフォルトアイコン
          resolve(DEFAULT_FAVICON);
        };

        fallbackImg.src = fallbackUrl;
      } catch {
        resolve(DEFAULT_FAVICON);
      }
    };

    img.src = directFavicon;
  });
}

/**
 * 複数のURLに対してファビコンを一括取得
 * @param {Array<string>} urls - URL配列
 * @returns {Promise<Array<{url: string, favicon: string}>>}
 */
export async function getBatchFavicons(urls) {
  const results = await Promise.all(
    urls.map(async (url) => ({
      url,
      favicon: await getFaviconWithFallback(url)
    }))
  );
  return results;
}

/**
 * ファビコンURLが有効かチェック
 * @param {string} faviconUrl - ファビコンURL
 * @returns {Promise<boolean>}
 */
export async function isFaviconValid(faviconUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = faviconUrl;

    // 3秒でタイムアウト
    setTimeout(() => resolve(false), 3000);
  });
}
