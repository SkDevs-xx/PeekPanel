import { TIMINGS } from '../config/constants.js';

/**
 * トースト通知を表示
 * @param {string} message - 表示するメッセージ
 * @param {string} type - 通知タイプ ('success' | 'error' | 'warning')
 * @param {string} elementId - ステータスメッセージ要素のID（デフォルト: 'statusMessage'）
 */
export function showToast(message, type = 'success', elementId = 'statusMessage') {
    const statusMessage = document.getElementById(elementId);
    if (!statusMessage) {
        console.warn(`[PeekPanel] Toast element not found: ${elementId}`);
        return;
    }

    statusMessage.textContent = type === 'success' ? `✓ ${message}` : message;
    statusMessage.className = `status-message ${type} show`;

    // 指定時間後にフェードアウト開始
    setTimeout(() => {
        statusMessage.style.animation = 'slideUp 0.3s ease-out forwards';
        setTimeout(() => {
            statusMessage.classList.remove('show');
            statusMessage.style.animation = '';
        }, TIMINGS.TOAST_FADE_TIME);
    }, TIMINGS.TOAST_DISPLAY_TIME);
}

/**
 * モーダルを表示
 * @param {string} modalId - モーダル要素のID
 */
export function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

/**
 * モーダルを非表示
 * @param {string} modalId - モーダル要素のID
 */
export function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * 確認ダイアログ付きでモーダルを表示
 * @param {string} modalId - モーダル要素のID
 * @param {string} confirmButtonId - 確認ボタンのID
 * @param {Function} onConfirm - 確認時のコールバック
 */
export function showConfirmModal(modalId, confirmButtonId, onConfirm) {
    const modal = document.getElementById(modalId);
    const confirmBtn = document.getElementById(confirmButtonId);

    if (!modal || !confirmBtn) {
        console.warn(`[PeekPanel] Modal or confirm button not found: ${modalId}, ${confirmButtonId}`);
        return;
    }

    modal.style.display = 'flex';
    confirmBtn.onclick = async () => {
        await onConfirm();
        hideModal(modalId);
    };
}
