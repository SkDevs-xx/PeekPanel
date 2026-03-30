/**
 * Dynamic CSP header rule manager
 * Only adds session rules for domains currently open in PeekPanel tabs.
 * Rules are added when tabs navigate and removed when tabs close.
 */

const activeRules = new Map(); // domain -> ruleId
let nextRuleId = 100; // Start high to avoid conflict with static rules
let _tabManager = null;

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function addRuleForDomain(domain) {
  if (!domain || activeRules.has(domain)) return;
  const ruleId = nextRuleId++;
  activeRules.set(domain, ruleId);
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [{
        id: ruleId,
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
          requestDomains: [domain],
          resourceTypes: ["sub_frame"]
        }
      }]
    });
  } catch (e) {
    console.error('[PeekPanel] Failed to add header rule for', domain, e);
    activeRules.delete(domain);
  }
}

async function removeRuleForDomain(domain) {
  if (!domain || !activeRules.has(domain)) return;
  const ruleId = activeRules.get(domain);
  activeRules.delete(domain);
  // Only remove if no other tab uses this domain
  const stillUsed = _tabManager?.getAllTabs().some(t => getDomain(t.url) === domain);
  if (stillUsed) {
    activeRules.set(domain, ruleId);
    return;
  }
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
  } catch (e) {
    console.error('[PeekPanel] Failed to remove header rule for', domain, e);
  }
}

/**
 * Sync rules with currently open tabs. Clears all session rules and re-adds.
 * @param {object} tabManager - TabManager instance
 */
export async function syncHeaderRules(tabManager) {
  _tabManager = tabManager;
  const existingRules = await chrome.declarativeNetRequest.getSessionRules();
  const existingIds = existingRules.map(r => r.id).filter(id => id >= 100);
  if (existingIds.length > 0) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: existingIds });
  }
  activeRules.clear();

  if (!tabManager) return;
  const domains = new Set();
  for (const tab of tabManager.getAllTabs()) {
    const domain = getDomain(tab.url);
    if (domain) domains.add(domain);
  }
  for (const domain of domains) {
    await addRuleForDomain(domain);
  }
}

/** Call when a tab navigates to a new URL */
export function onTabUrlChanged(url) {
  const domain = getDomain(url);
  if (domain) addRuleForDomain(domain);
}

/** Call when a tab is closed */
export function onTabRemoved(url) {
  const domain = getDomain(url);
  if (domain) removeRuleForDomain(domain);
}
