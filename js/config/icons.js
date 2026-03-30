// PeekPanel Icon Set
// Style: 16x16 viewBox, 1.5px stroke, round linecap/linejoin, outline only, currentColor
// Consistent with Lucide/Feather icon style

const SVG_OPEN = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';
const SVG_CLOSE = '</svg>';

// ─── Navigation ──────────────────────────────────────────────────────────────

/** Back button (replaces ◀) */
export const ICON_CHEVRON_LEFT =
  SVG_OPEN +
  '<polyline points="10 3 5 8 10 13"/>' +
  SVG_CLOSE;

/** Forward button (replaces ▶) */
export const ICON_CHEVRON_RIGHT =
  SVG_OPEN +
  '<polyline points="6 3 11 8 6 13"/>' +
  SVG_CLOSE;

/** Reload (replaces ↻) */
export const ICON_REFRESH_CW =
  SVG_OPEN +
  '<path d="M13 2v4h-4"/>' +
  '<path d="M13 6A6 6 0 1 1 9.5 2.5"/>' +
  SVG_CLOSE;

/** Open in main browser (replaces 🔗) */
export const ICON_EXTERNAL_LINK =
  SVG_OPEN +
  '<path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9"/>' +
  '<polyline points="10 2 14 2 14 6"/>' +
  '<line x1="14" y1="2" x2="7" y2="9"/>' +
  SVG_CLOSE;

/** Search (replaces 🔍) */
export const ICON_SEARCH =
  SVG_OPEN +
  '<circle cx="7" cy="7" r="4.5"/>' +
  '<line x1="10.5" y1="10.5" x2="14" y2="14"/>' +
  SVG_CLOSE;

/** Dropdown/expand (replaces ▼) */
export const ICON_CHEVRON_DOWN =
  SVG_OPEN +
  '<polyline points="3 6 8 11 13 6"/>' +
  SVG_CLOSE;

// ─── Tab Management ───────────────────────────────────────────────────────────

/** New tab / add (replaces ➕/＋) */
export const ICON_PLUS =
  SVG_OPEN +
  '<line x1="8" y1="2" x2="8" y2="14"/>' +
  '<line x1="2" y1="8" x2="14" y2="8"/>' +
  SVG_CLOSE;

/** Close (replaces ✕) */
export const ICON_X =
  SVG_OPEN +
  '<line x1="3" y1="3" x2="13" y2="13"/>' +
  '<line x1="13" y1="3" x2="3" y2="13"/>' +
  SVG_CLOSE;

/** Pinned tab (replaces 📌) */
export const ICON_PIN =
  SVG_OPEN +
  '<path d="M9.5 2.5 13.5 6.5 10 9l-1 4-3-3-3.5 3.5L2 13l3.5-3.5-3-3 4-1z"/>' +
  SVG_CLOSE;

/** Muted (replaces 🔇) */
export const ICON_VOLUME_X =
  SVG_OPEN +
  '<polygon points="2 6 6 6 10 2 10 14 6 10 2 10"/>' +
  '<line x1="13" y1="6" x2="16" y2="9"/>' +
  '<line x1="16" y1="6" x2="13" y2="9"/>' +
  SVG_CLOSE;

/** Unmuted (replaces 🔊) */
export const ICON_VOLUME_2 =
  SVG_OPEN +
  '<polygon points="2 6 6 6 10 2 10 14 6 10 2 10"/>' +
  '<path d="M12 5a4 4 0 0 1 0 6"/>' +
  '<path d="M13.5 3a6.5 6.5 0 0 1 0 10"/>' +
  SVG_CLOSE;

/** Sleeping tab (replaces 💤) */
export const ICON_MOON =
  SVG_OPEN +
  '<path d="M13 10A6 6 0 0 1 6 3a6 6 0 1 0 7 7z"/>' +
  SVG_CLOSE;

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Bookmark (replaces ⭐) */
export const ICON_STAR =
  SVG_OPEN +
  '<polygon points="8 2 10 6.5 15 7.3 11.5 10.7 12.4 15.6 8 13.1 3.6 15.6 4.5 10.7 1 7.3 6 6.5"/>' +
  SVG_CLOSE;

/** Bookmarked state (filled star) */
export const ICON_STAR_FILLED =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
  '<polygon points="8 2 10 6.5 15 7.3 11.5 10.7 12.4 15.6 8 13.1 3.6 15.6 4.5 10.7 1 7.3 6 6.5"/>' +
  SVG_CLOSE;

/** Settings / gear (replaces ⚙️) */
export const ICON_SETTINGS =
  SVG_OPEN +
  '<path d="M6.6 2h2.8l.4 1.7a5 5 0 0 1 1.2.7l1.6-.6 1.4 2.4-1.2 1.1a5 5 0 0 1 0 1.4l1.2 1.1-1.4 2.4-1.6-.6a5 5 0 0 1-1.2.7L9.4 14H6.6l-.4-1.7a5 5 0 0 1-1.2-.7l-1.6.6-1.4-2.4 1.2-1.1a5 5 0 0 1 0-1.4L2 6.2l1.4-2.4 1.6.6a5 5 0 0 1 1.2-.7z"/>' +
  '<circle cx="8" cy="8" r="2"/>' +
  SVG_CLOSE;

/** Duplicate / copy (replaces 📋) */
export const ICON_COPY =
  SVG_OPEN +
  '<rect x="5" y="4" width="8" height="10" rx="1"/>' +
  '<path d="M3 11V3a1 1 0 0 1 1-1h7"/>' +
  SVG_CLOSE;

/** Edit / pencil (replaces ✏️) */
export const ICON_EDIT_2 =
  SVG_OPEN +
  '<path d="M11 2.5a1.5 1.5 0 0 1 2.1 2.1L5 13l-3 1 1-3z"/>' +
  SVG_CLOSE;

/** Delete (replaces 🗑️) */
export const ICON_TRASH_2 =
  SVG_OPEN +
  '<polyline points="2 5 4 5 14 5"/>' +
  '<path d="M5 5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>' +
  '<path d="M13 5l-.8 8.5A1 1 0 0 1 11.2 14H4.8a1 1 0 0 1-1-.5L3 5"/>' +
  SVG_CLOSE;

// ─── Organization ────────────────────────────────────────────────────────────

/** Folder (replaces 📁) */
export const ICON_FOLDER =
  SVG_OPEN +
  '<path d="M2 4a1 1 0 0 1 1-1h3.6l1.4 2H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/>' +
  SVG_CLOSE;

/** Open folder (replaces 📂) */
export const ICON_FOLDER_OPEN =
  SVG_OPEN +
  '<path d="M2 5a1 1 0 0 1 1-1h3.6l1.4 2H13a1 1 0 0 1 1 1v1H2z"/>' +
  '<path d="M2 8l1.5 5.5A1 1 0 0 0 4.5 14h7a1 1 0 0 0 1-.7L14 8z"/>' +
  SVG_CLOSE;

/** Document / file (replaces 📄) */
export const ICON_FILE =
  SVG_OPEN +
  '<path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6z"/>' +
  '<polyline points="9 2 9 6 13 6"/>' +
  SVG_CLOSE;

/** Group color / palette (replaces 🎨) */
export const ICON_PALETTE =
  SVG_OPEN +
  '<circle cx="8" cy="8" r="6"/>' +
  '<circle cx="5.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>' +
  '<circle cx="10.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>' +
  '<circle cx="8" cy="10.5" r="1" fill="currentColor" stroke="none"/>' +
  '<path d="M12 12.5a2 2 0 0 0 2-1.5 2 2 0 0 0-2-2"/>' +
  SVG_CLOSE;

/** Default favicon / globe (replaces 🌐) */
export const ICON_GLOBE =
  SVG_OPEN +
  '<circle cx="8" cy="8" r="6"/>' +
  '<path d="M2 8h12"/>' +
  '<path d="M8 2a8 8 0 0 1 2 6 8 8 0 0 1-2 6"/>' +
  '<path d="M8 2a8 8 0 0 0-2 6 8 8 0 0 0 2 6"/>' +
  SVG_CLOSE;

// ─── Settings Page ────────────────────────────────────────────────────────────

/** Light theme (replaces ☀️) */
export const ICON_SUN =
  SVG_OPEN +
  '<circle cx="8" cy="8" r="3"/>' +
  '<line x1="8" y1="1" x2="8" y2="3"/>' +
  '<line x1="8" y1="13" x2="8" y2="15"/>' +
  '<line x1="1" y1="8" x2="3" y2="8"/>' +
  '<line x1="13" y1="8" x2="15" y2="8"/>' +
  '<line x1="3.1" y1="3.1" x2="4.5" y2="4.5"/>' +
  '<line x1="11.5" y1="11.5" x2="12.9" y2="12.9"/>' +
  '<line x1="12.9" y1="3.1" x2="11.5" y2="4.5"/>' +
  '<line x1="4.5" y1="11.5" x2="3.1" y2="12.9"/>' +
  SVG_CLOSE;

/** Dark theme (replaces 🌙) — moon with small star */
export const ICON_MOON_STAR =
  SVG_OPEN +
  '<path d="M12 10A5 5 0 0 1 7 5a5 5 0 0 0 6 6z"/>' +
  '<path d="M13 2l.5 1.5L15 4l-1.5.5L13 6l-.5-1.5L11 4l1.5-.5z" fill="currentColor" stroke="none"/>' +
  SVG_CLOSE;

/** System theme (replaces 💻) */
export const ICON_MONITOR =
  SVG_OPEN +
  '<rect x="1" y="2" width="14" height="10" rx="1"/>' +
  '<line x1="5" y1="14" x2="11" y2="14"/>' +
  '<line x1="8" y1="12" x2="8" y2="14"/>' +
  SVG_CLOSE;

/** History (replaces 🕐) */
export const ICON_CLOCK =
  SVG_OPEN +
  '<circle cx="8" cy="8" r="6"/>' +
  '<polyline points="8 5 8 8 10.5 8"/>' +
  SVG_CLOSE;

/** Prompts / message (replaces 📝) */
export const ICON_MESSAGE_SQUARE =
  SVG_OPEN +
  '<path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5l-3 2V3z"/>' +
  SVG_CLOSE;

// ─── Misc ─────────────────────────────────────────────────────────────────────

/** Warning / error (replaces ⚠️) */
export const ICON_ALERT_TRIANGLE =
  SVG_OPEN +
  '<path d="M7.1 2.5a1 1 0 0 1 1.8 0l6 10.5A1 1 0 0 1 14 14.5H2a1 1 0 0 1-.9-1.5z"/>' +
  '<line x1="8" y1="7" x2="8" y2="10"/>' +
  '<line x1="8" y1="12" x2="8.01" y2="12"/>' +
  SVG_CLOSE;

/** Checkmark (replaces ✓) */
export const ICON_CHECK =
  SVG_OPEN +
  '<polyline points="2 8 6 12 14 4"/>' +
  SVG_CLOSE;

/** Drag handle */
export const ICON_GRIP_VERTICAL =
  SVG_OPEN +
  '<circle cx="6" cy="4" r="1" fill="currentColor" stroke="none"/>' +
  '<circle cx="10" cy="4" r="1" fill="currentColor" stroke="none"/>' +
  '<circle cx="6" cy="8" r="1" fill="currentColor" stroke="none"/>' +
  '<circle cx="10" cy="8" r="1" fill="currentColor" stroke="none"/>' +
  '<circle cx="6" cy="12" r="1" fill="currentColor" stroke="none"/>' +
  '<circle cx="10" cy="12" r="1" fill="currentColor" stroke="none"/>' +
  SVG_CLOSE;

// ─── Named export map (for programmatic lookup) ───────────────────────────────

export const ICONS = {
  // Navigation
  'chevron-left':    ICON_CHEVRON_LEFT,
  'chevron-right':   ICON_CHEVRON_RIGHT,
  'refresh-cw':      ICON_REFRESH_CW,
  'external-link':   ICON_EXTERNAL_LINK,
  'search':          ICON_SEARCH,
  'chevron-down':    ICON_CHEVRON_DOWN,
  // Tab management
  'plus':            ICON_PLUS,
  'x':               ICON_X,
  'pin':             ICON_PIN,
  'volume-x':        ICON_VOLUME_X,
  'volume-2':        ICON_VOLUME_2,
  'moon':            ICON_MOON,
  // Actions
  'star':            ICON_STAR,
  'star-filled':     ICON_STAR_FILLED,
  'settings':        ICON_SETTINGS,
  'copy':            ICON_COPY,
  'edit-2':          ICON_EDIT_2,
  'trash-2':         ICON_TRASH_2,
  // Organization
  'folder':          ICON_FOLDER,
  'folder-open':     ICON_FOLDER_OPEN,
  'file':            ICON_FILE,
  'palette':         ICON_PALETTE,
  'globe':           ICON_GLOBE,
  // Settings page
  'sun':             ICON_SUN,
  'moon-star':       ICON_MOON_STAR,
  'monitor':         ICON_MONITOR,
  'clock':           ICON_CLOCK,
  'message-square':  ICON_MESSAGE_SQUARE,
  // Misc
  'alert-triangle':  ICON_ALERT_TRIANGLE,
  'check':           ICON_CHECK,
  'grip-vertical':   ICON_GRIP_VERTICAL,
};
