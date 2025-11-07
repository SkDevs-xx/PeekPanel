/**
 * DOM操作ヘルパークラス
 * tabUI.js と groupUI.js で共通利用
 */
export class DOMHelper {
  /**
   * 要素を作成
   * @param {string} tag - タグ名
   * @param {Object} options - オプション
   * @returns {HTMLElement}
   */
  static createElement(tag, options = {}) {
    const element = document.createElement(tag);

    if (options.className) {
      element.className = options.className;
    }

    if (options.id) {
      element.id = options.id;
    }

    if (options.textContent) {
      element.textContent = options.textContent;
    }

    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }

    if (options.styles) {
      Object.entries(options.styles).forEach(([key, value]) => {
        element.style[key] = value;
      });
    }

    if (options.children) {
      options.children.forEach(child => {
        if (child) {
          element.appendChild(child);
        }
      });
    }

    if (options.onclick) {
      element.onclick = options.onclick;
    }

    if (options.oncontextmenu) {
      element.oncontextmenu = options.oncontextmenu;
    }

    return element;
  }

  /**
   * 要素を検索
   * @param {string} selector - セレクタ
   * @param {Element} parent - 親要素
   * @returns {Element|null}
   */
  static querySelector(selector, parent = document) {
    return parent.querySelector(selector);
  }

  /**
   * 複数の要素を検索
   * @param {string} selector - セレクタ
   * @param {Element} parent - 親要素
   * @returns {Array<Element>}
   */
  static querySelectorAll(selector, parent = document) {
    return Array.from(parent.querySelectorAll(selector));
  }

  /**
   * クラスをトグル
   * @param {Element} element - 要素
   * @param {string} className - クラス名
   * @param {boolean} force - 強制的に追加/削除
   */
  static toggleClass(element, className, force) {
    element.classList.toggle(className, force);
  }

  /**
   * クラスを追加
   * @param {Element} element - 要素
   * @param {...string} classNames - クラス名
   */
  static addClass(element, ...classNames) {
    element.classList.add(...classNames);
  }

  /**
   * クラスを削除
   * @param {Element} element - 要素
   * @param {...string} classNames - クラス名
   */
  static removeClass(element, ...classNames) {
    element.classList.remove(...classNames);
  }

  /**
   * クラスの有無を確認
   * @param {Element} element - 要素
   * @param {string} className - クラス名
   * @returns {boolean}
   */
  static hasClass(element, className) {
    return element.classList.contains(className);
  }

  /**
   * 要素を削除
   * @param {Element} element - 要素
   */
  static remove(element) {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }

  /**
   * 要素の子要素をすべて削除
   * @param {Element} element - 要素
   */
  static removeChildren(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  /**
   * 要素の子要素を置き換え（replaceChildren互換）
   * @param {Element} element - 要素
   * @param {...Node} nodes - 新しい子要素
   */
  static replaceChildren(element, ...nodes) {
    this.removeChildren(element);
    nodes.forEach(node => {
      if (node) {
        element.appendChild(node);
      }
    });
  }

  /**
   * 要素を別の要素の後に挿入
   * @param {Element} newElement - 新しい要素
   * @param {Element} referenceElement - 参照要素
   */
  static insertAfter(newElement, referenceElement) {
    referenceElement.parentNode.insertBefore(newElement, referenceElement.nextSibling);
  }

  /**
   * 要素を別の要素の前に挿入
   * @param {Element} newElement - 新しい要素
   * @param {Element} referenceElement - 参照要素
   */
  static insertBefore(newElement, referenceElement) {
    referenceElement.parentNode.insertBefore(newElement, referenceElement);
  }

  /**
   * 属性を設定
   * @param {Element} element - 要素
   * @param {string} name - 属性名
   * @param {string} value - 属性値
   */
  static setAttribute(element, name, value) {
    element.setAttribute(name, value);
  }

  /**
   * 属性を取得
   * @param {Element} element - 要素
   * @param {string} name - 属性名
   * @returns {string|null}
   */
  static getAttribute(element, name) {
    return element.getAttribute(name);
  }

  /**
   * データ属性を設定
   * @param {Element} element - 要素
   * @param {string} key - データキー
   * @param {string} value - データ値
   */
  static setData(element, key, value) {
    element.dataset[key] = value;
  }

  /**
   * データ属性を取得
   * @param {Element} element - 要素
   * @param {string} key - データキー
   * @returns {string|undefined}
   */
  static getData(element, key) {
    return element.dataset[key];
  }

  /**
   * イベントリスナーを追加（一度だけ実行）
   * @param {Element} element - 要素
   * @param {string} eventType - イベントタイプ
   * @param {Function} handler - ハンドラー
   */
  static addEventListenerOnce(element, eventType, handler) {
    const onceHandler = (event) => {
      handler(event);
      element.removeEventListener(eventType, onceHandler);
    };
    element.addEventListener(eventType, onceHandler);
  }

  /**
   * 要素が表示されているか確認
   * @param {Element} element - 要素
   * @returns {boolean}
   */
  static isVisible(element) {
    return element.offsetParent !== null;
  }

  /**
   * 要素の位置を取得
   * @param {Element} element - 要素
   * @returns {DOMRect}
   */
  static getBoundingClientRect(element) {
    return element.getBoundingClientRect();
  }
}
