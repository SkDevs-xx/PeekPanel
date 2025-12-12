/**
 * 時間関連のユーティリティ関数
 */

/**
 * 時間の経過を表示する文字列を生成
 * @param {number} timestamp - タイムスタンプ（ミリ秒）
 * @returns {string} 「MM/DD HH:mm (N日/時間/分前)」形式の文字列
 */
export function getTimeAgo(timestamp) {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    // 日付の文字列を生成
    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    // 経過時間の文字列を生成
    let timeAgoStr;
    if (days > 0) {
        timeAgoStr = `${days}日前`;
    } else if (hours > 0) {
        timeAgoStr = `${hours}時間前`;
    } else if (minutes > 0) {
        timeAgoStr = `${minutes}分前`;
    } else {
        timeAgoStr = 'たった今';
    }

    return `${dateStr} (${timeAgoStr})`;
}

/**
 * 日付をフォーマット
 * @param {Date|number} date - Dateオブジェクトまたはタイムスタンプ
 * @param {string} format - フォーマット文字列（'YYYY-MM-DD', 'HH:mm' など）
 * @returns {string} フォーマットされた日付文字列
 */
export function formatDate(date, format = 'YYYY-MM-DD HH:mm') {
    const d = date instanceof Date ? date : new Date(date);

    const replacements = {
        'YYYY': d.getFullYear(),
        'MM': String(d.getMonth() + 1).padStart(2, '0'),
        'DD': String(d.getDate()).padStart(2, '0'),
        'HH': String(d.getHours()).padStart(2, '0'),
        'mm': String(d.getMinutes()).padStart(2, '0'),
        'ss': String(d.getSeconds()).padStart(2, '0')
    };

    let result = format;
    for (const [key, value] of Object.entries(replacements)) {
        result = result.replace(key, value);
    }

    return result;
}
