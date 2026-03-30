/**
 * AI service selector dropdown management.
 */
import { DEFAULT_AIS } from '../config/constants.js';

/** Create dropdown options from DEFAULT_AIS */
function initDropdown() {
  const dropdown = document.getElementById('ai-selector-dropdown');
  if (!dropdown) return;

  DEFAULT_AIS.forEach(ai => {
    const option = document.createElement('option');
    option.value = ai.id;
    option.textContent = ai.id.charAt(0).toUpperCase() + ai.id.slice(1);
    dropdown.appendChild(option);
  });
}

/** Load saved AI selection from storage */
async function loadSelection() {
  try {
    if (!chrome.runtime?.id) return;
    const { cleanupAI } = await chrome.storage.sync.get({ cleanupAI: 'claude' });
    const dropdown = document.getElementById('ai-selector-dropdown');
    if (dropdown) dropdown.value = cleanupAI;
  } catch (error) {
    if (!error.message?.includes('Extension context invalidated')) {
      console.error('[PeekPanel] Error loading AI selection:', error);
    }
  }
}

/** Save AI selection to storage */
async function saveSelection(selectedAI) {
  try {
    if (!chrome.runtime?.id) return;
    await chrome.storage.sync.set({ cleanupAI: selectedAI });
  } catch (error) {
    if (!error.message?.includes('Extension context invalidated')) {
      console.error('[PeekPanel] Error saving AI selection:', error);
    }
  }
}

/** Set up the AI dropdown (init, load, events) */
export function setupAIDropdown() {
  initDropdown();

  const dropdown = document.getElementById('ai-selector-dropdown');
  if (dropdown) {
    dropdown.addEventListener('change', (e) => saveSelection(e.target.value));
  }

  loadSelection();
}
