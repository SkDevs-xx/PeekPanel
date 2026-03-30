/**
 * CSP header rule manager
 * Uses a wildcard session rule for all sub_frame requests.
 * Static rules in rules.json handle site-specific header modifications
 * (X.com UA spoofing, Grok link removal, etc.)
 */

/**
 * Set up session rule to remove iframe-blocking headers for all sub_frame requests.
 * This is necessary because many sites return X-Frame-Options/CSP headers that
 * prevent embedding in iframes. The rule only targets sub_frame resource type.
 */
export async function setupHeaderRemoval() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          { header: "x-frame-options", operation: "remove" },
          { header: "content-security-policy", operation: "remove" },
          { header: "content-security-policy-report-only", operation: "remove" },
          { header: "permissions-policy", operation: "remove" }
        ]
      },
      condition: {
        urlFilter: "*",
        resourceTypes: ["sub_frame"]
      }
    }]
  });
}

// No-op functions kept for API compatibility with existing call sites
export function onTabUrlChanged(_url) {}
export function onTabRemoved(_url) {}
export async function syncHeaderRules(_tabManager) {
  await setupHeaderRemoval();
}
