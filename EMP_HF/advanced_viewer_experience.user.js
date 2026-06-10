// ==UserScript==
// @name        [HF][EMP] Advanced Viewer Experience
// @description This script provides better browsing experience using images from torrents/requests in various pages.
// @namespace   https://github.com/edstagdh/Userscripts
// @include     /https?://www\.empornium\.(sx)/torrents\.php.*/
// @exclude     /https?://www\.empornium\.(sx)/torrents\.php\?id.*/
// @include     /https?://www\.empornium\.(sx)/user\.php.*/
// @include     /https?://www\.empornium\.(sx)/top10\.php.*/
// @include     /https?://www\.empornium\.(sx)/collage*/
// @include     /https?://www\.empornium\.(sx)/requests*/
// @exclude     /https?://www\.empornium\.(sx)/requests\.php\?id.*/
// @include     /https?://www\.empornium\.(sx)/userhistory\.php.*/
// @include     /https?://emparadise\.(rs)/torrents\.php.*/
// @exclude     /https?://emparadise\.(rs)/torrents\.php\?id.*/
// @include     /https?://emparadise\.(rs)/user\.php.*/
// @include     /https?://emparadise\.(rs)/top10\.php.*/
// @include     /https?://emparadise\.(rs)/collage*/
// @include     /https?://emparadise\.(rs)/requests*/
// @exclude     /https?://emparadise\.(rs)/requests\.php\?id.*/
// @include     /https?://emparadise\.(rs)/userhistory\.php.*/
// @include     /https?://www\.happyfappy\.(net)/torrents\.php.*/
// @exclude     /https?://www\.happyfappy\.(net)/torrents\.php\?id.*/
// @include     /https?://www\.happyfappy\.(net)/user\.php.*/
// @include     /https?://www\.happyfappy\.(net)/top10\.php.*/
// @include     /https?://www\.happyfappy\.(net)/collage*/
// @include     /https?://www\.happyfappy\.(net)/requests*/
// @exclude     /https?://www\.happyfappy\.(net)/requests\.php\?id.*/
// @include     /https?://www\.happyfappy\.(net)/userhistory\.php.*/
// @version     2.9
// @author      edstagdh
// @icon        https://www.google.com/s2/favicons?sz=64&domain=www.happyfappy.net
// @icon        https://www.google.com/s2/favicons?sz=64&domain=www.empornium.sx
// @icon        https://www.google.com/s2/favicons?sz=64&domain=emparadise.rs
// @require     https://code.jquery.com/jquery-2.1.1.js
// @updateURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/advanced_viewer_experience.user.js
// @installURL  https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/advanced_viewer_experience.user.js
// @grant       GM_addStyle
// @grant       GM_setValue
// @grant       GM_getValue
// ==/UserScript==


"use strict";

this.$ = this.jQuery = jQuery.noConflict(true);

const LOG_PREFIX = '[TM]';
const USER_SEARCH_COOLDOWN_MS = 30 * 1000;
let lastUserSearchTimestamp = 0;
// --------------------
// VERSION HISTORY
// Entries are newest-first. Add a new entry here with every release.
// --------------------
const SCRIPT_VERSION = '2.8';
const VERSION_HISTORY = [
    {
        version: '2.9',
        changes: [
            'Added version number to settings menu header.',
        ],
    },
        {
        version: '2.8',
        changes: [
            'Changed font size of title in cards in Gallery View.',
            'Added Dark Mode toggle to Gallery View cards, Enabled by default.',
        ],
    },
        {
        version: '2.7',
        changes: [
            'Added Favorite Tags list: rows/cards whose tags include any favorite tag glow in a custom color.',
            'Glow color is configurable from a palette of 9 glow-friendly colors (gold, cyan, green, pink, purple, orange, red, teal, white) in Viewer Settings.',
            'New setting: Tag Click Action — choose whether clicking a tag chip in the Tags popup blacklists it(default behavior) or adds it to favorites. The popup shows a hint and three chip states: red=blacklisted, gold=favorite, grey=neutral.',
            'Tags are mutually exclusive between blacklist and favorites — adding to one removes from the other.',
            'Gallery cards now always show the uploader name, even on pages with no dedicated uploader column (collage, notifications), extracted from the torrent overlay data.',
            'Added guard: "anon" can never be blacklisted or blocked as an uploader.',
            'Username Link: in pages where no uploader name is displayed, the hyperlink to the uploader profile page will have cooldown.',
        ],
    },
    {
        version: '2.6',
        changes: [
            'Added Uploader Blacklist: uploads from blacklisted uploaders will be hidden in both list and grid view.',
            'Gallery grid card footer: uploader name shows a ⛔ block button on hover. Click it to instantly blacklist that uploader.',
            'Table list view (pages with an uploader column): a ⛔ block button appears next to each uploader name.',
            'Uploader names extracted from the overlay script on pages without a dedicated uploader column (collage, notifications) so blocking works everywhere.',
            'New Uploader Blacklist section in Viewer Settings: manually add usernames, remove via chips, or clear all.',
        ],
    },
    {
        version: '2.5',
        changes: [
            'Added Tag Blacklist feature: rows whose tags match any blacklisted tag are hidden in both list and grid view. Blacklist data is stored persistently via GM_setValue and is saved across configured domains.',
            'Added Tags hover button in gallery cards: hovering shows a popup of all tags for that torrent. Clicking a tag name chip in the popup toggles its blacklist state and refreshes the results for that page.',
            'Added Tag Blacklist section in Viewer Settings: add/remove tags, clear all, live chip editor. Controls are disabled with a note on pages with no tags, meaning this feature requires tags to be enabled in settings.',
            'Download and Tags buttons now share the same button row in gallery cards.',
            'Added change log notice on updates.',
        ],
    },
    {
        version: '2.4',
        changes: [
            'Fixed missing/invalid categories on items in userhistory.php (subscribed collages) for both list and grid mode.',
            'Added blue Download button in gallery cards (separate from the icon that can be obscured by the thumbnail).',
            'Fixed top10.php grid view which showed incorrect data values in cards.',
        ],
    },
    {
        version: '2.3',
        changes: [
            'Fixed gallery column mapping for torrents.php?action=notify (leading checkbox column was shifting cat/title offsets).',
            'Fixed gallery showing only the first filter group on the notify page (now renders one grid per filter group).',
            'Fixed gallery column mapping for requests.php (votes, bounty, filled status now display correctly).',
            'Gallery grid container changed from ID to class so multiple grids can coexist on one page.',
        ],
    },
    {
        version: '2.2',
        changes: [
            'Added quick-edit Viewer Settings button next to username in the nav bar.',
            'Renamed script, updated namespace, added installURL, updated domain URLs.',
        ],
    },
];

// --------------------
// CONFIG DEFAULTS
// --------------------
const DEFAULTS = {
    TABLE_MAX_IMAGE_SIZE:            250,
    REMOVE_CATEGORIES:               false,
    SMALL_THUMBNAILS:                true,
    GRID_DARK_MODE:                  true,
    ENABLE_WIDER_TABLE_VIEW:         true,
    TRIM_TEXT_COLLAGE_PAGE_MODE:     "smaller_text_wrap",
    REMOVE_MAIN_IMAGES_COLLAGE_PAGE: false,
    FIT_VERTICAL_IMAGES_GRID_BETTER: "half",
    IMAGE_LOAD_MODE:                 "near",
    GALLERY_VIEW_MODE:               false,
    GALLERY_CARD_MIN_WIDTH:          220,
};

// --------------------
// LOAD SETTINGS FROM PERSISTENT STORAGE
// --------------------
let TABLE_MAX_IMAGE_SIZE            = GM_getValue('TABLE_MAX_IMAGE_SIZE',            DEFAULTS.TABLE_MAX_IMAGE_SIZE);
let REMOVE_CATEGORIES               = GM_getValue('REMOVE_CATEGORIES',               DEFAULTS.REMOVE_CATEGORIES);
let SMALL_THUMBNAILS                = GM_getValue('SMALL_THUMBNAILS',                DEFAULTS.SMALL_THUMBNAILS);
let GRID_DARK_MODE                  = GM_getValue('GRID_DARK_MODE',                  DEFAULTS.GRID_DARK_MODE);
let ENABLE_WIDER_TABLE_VIEW         = GM_getValue('ENABLE_WIDER_TABLE_VIEW',         DEFAULTS.ENABLE_WIDER_TABLE_VIEW);
let TRIM_TEXT_COLLAGE_PAGE_MODE     = GM_getValue('TRIM_TEXT_COLLAGE_PAGE_MODE',     DEFAULTS.TRIM_TEXT_COLLAGE_PAGE_MODE);
let REMOVE_MAIN_IMAGES_COLLAGE_PAGE = GM_getValue('REMOVE_MAIN_IMAGES_COLLAGE_PAGE', DEFAULTS.REMOVE_MAIN_IMAGES_COLLAGE_PAGE);
let FIT_VERTICAL_IMAGES_GRID_BETTER = GM_getValue('FIT_VERTICAL_IMAGES_GRID_BETTER', DEFAULTS.FIT_VERTICAL_IMAGES_GRID_BETTER);
let IMAGE_LOAD_MODE                 = GM_getValue('IMAGE_LOAD_MODE',                 DEFAULTS.IMAGE_LOAD_MODE);
let GALLERY_VIEW_MODE               = GM_getValue('GALLERY_VIEW_MODE',               DEFAULTS.GALLERY_VIEW_MODE);
let GALLERY_CARD_MIN_WIDTH          = GM_getValue('GALLERY_CARD_MIN_WIDTH',          DEFAULTS.GALLERY_CARD_MIN_WIDTH);

// --------------------
// TAG BLACKLIST — persisted as a JSON array via GM_setValue
// --------------------
let TAG_BLACKLIST = [];
(function () {
    try {
        const stored = GM_getValue('TAG_BLACKLIST', '[]');
        const parsed = JSON.parse(stored);
        TAG_BLACKLIST = Array.isArray(parsed)
            ? parsed.map(t => String(t).toLowerCase().trim()).filter(Boolean)
        : [];
    } catch (e) { TAG_BLACKLIST = []; }
})();

// --------------------
// UPLOADER BLACKLIST — persisted as a JSON array via GM_setValue
// --------------------
let UPLOADER_BLACKLIST = [];
(function () {
    try {
        const stored = GM_getValue('UPLOADER_BLACKLIST', '[]');
        const parsed = JSON.parse(stored);
        UPLOADER_BLACKLIST = Array.isArray(parsed)
            ? parsed.map(u => String(u).toLowerCase().trim()).filter(Boolean)
        : [];
    } catch (e) { UPLOADER_BLACKLIST = []; }
})();

// --------------------
// TAG FAVORITES — persisted as a JSON array via GM_setValue
// --------------------
let TAG_FAVORITES = [];
(function () {
    try {
        const stored = GM_getValue('TAG_FAVORITES', '[]');
        const parsed = JSON.parse(stored);
        TAG_FAVORITES = Array.isArray(parsed)
            ? parsed.map(t => String(t).toLowerCase().trim()).filter(Boolean)
        : [];
    } catch (e) { TAG_FAVORITES = []; }
})();

// Glow color for favorite-tag matches (one of the GLOW_COLORS palette)
let FAVORITE_GLOW_COLOR = GM_getValue('FAVORITE_GLOW_COLOR', '#f5c518');

// What clicking a tag chip in the Tags popup does: 'blacklist' or 'favorite'
let TAG_CLICK_ACTION = GM_getValue('TAG_CLICK_ACTION', 'blacklist');

// Global backend reference (assigned in init, used by gallery card builder)
let globalBackend = null;

// Gallery lazy-load observer (separate from table observer)
let galleryLazyObserver = null;

// Cache for categories fetched from individual torrent pages (subscribed collages page)
const subCollagesCatCache = {};

// Dark Mode Cards Settings

const CARD_BG = GRID_DARK_MODE ? '#161616' : '#d0d0d0';
const CARD_BORDER      = GRID_DARK_MODE ? '#2a2a2a' : '#d8d8d8';
const IMAGE_BG         = GRID_DARK_MODE ? '#0d0d0d' : '#c0c0c0';
const TITLE_COLOR      = GRID_DARK_MODE ? '#c8d8ec' : '#1d4f8f';
const TITLE_HOVER      = GRID_DARK_MODE ? '#90b8e0' : '#0f3e75';
const META_COLOR       = GRID_DARK_MODE ? '#585858' : '#666666';
const FOOTER_COLOR     = GRID_DARK_MODE ? '#484848' : '#555555';
const FOOTER_BORDER    = GRID_DARK_MODE ? '#1e1e1e' : '#e0e0e0';
const TIME_COLOR       = GRID_DARK_MODE ? '#404040' : '#777777';
const CAT_BADGE_BG     = GRID_DARK_MODE ? 'rgba(0,0,0,0.78)' : 'rgba(255,255,255,0.92)';
const CAT_BADGE_COLOR  = GRID_DARK_MODE ? '#e0e0e0' : '#333333';

// --------------------
// CSS — base
// --------------------
GM_addStyle(`
.small-category { vertical-align: top !important; }
.overlay-category td > div[title],
.overlay-category .cats_col > div,
.overlay-category .cats_cols > div { position: absolute; overflow: hidden; }
.overlay-category-small td > div[title],
.overlay-category-small .cats_col > div,
.overlay-category-small .cats_cols > div { width: 11px; }
.remove-category td > div[title],
.remove-category .cats_col > div,
.remove-category .cats_cols > div { display: none; }
.category-overlay-wrapper {
    position: absolute; left: 0; top: 0;
    width: 50px; height: 100%; overflow: hidden; z-index: 2;
}
.category-overlay-wrapper img { display: block; max-width: none !important; max-height: none !important; }
.center, .cats_col { position: relative; }
`);

if (ENABLE_WIDER_TABLE_VIEW) {
    GM_addStyle(`#content { width: 99%; max-width: 1500px; }`);
}

// --------------------
// CSS — gallery grid & cards
// NOTE: uses class .viewer-gallery-grid (not ID) so multiple grids can exist
//       on pages that render one table per filter group (e.g. notify page).
// --------------------
GM_addStyle(`
/* ── GALLERY GRID CONTAINER ── */
.viewer-gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(${GALLERY_CARD_MIN_WIDTH}px, 1fr));
    gap: 14px;
    padding: 14px 0;
}

/* ── CARD ── */
.vg-card {
    background: ${CARD_BG};
    border: 1px solid ${CARD_BORDER};
    border-radius: 7px;

    overflow: visible;

    display: flex;
    flex-direction: column;

    position: relative;
    z-index: 1;

    transition:
        border-color 0.18s ease,
        box-shadow 0.18s ease,
        transform 0.15s ease;
}
.vg-card:hover {
    border-color: #505050;
    transform: translateY(-3px);
}

.vg-card:hover:not(.vg-fav-match) {
    box-shadow: 0 8px 24px rgba(0,0,0,0.55);
}

/* ── IMAGE AREA ── */
.vg-img-wrap {
    position: relative;
    overflow: hidden;
    background: ${IMAGE_BG};
    height: 210px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.vg-img-wrap > a.vg-img-link {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    text-decoration: none;
}
.vg-img {
    max-width: 100%;
    max-height: 210px;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
    transition: transform 0.25s ease;
}
.vg-card:hover .vg-img { transform: scale(1.04); }

/* ── CATEGORY BADGE (top-left of image) ── */
.vg-cat-badge {
    position: absolute; top: 7px; left: 7px; z-index: 3; pointer-events: auto;
}
.vg-cat-badge a {
    display: inline-block;
    background: ${CAT_BADGE_BG};
    color: ${CAT_BADGE_COLOR} !important;
    font-size: 9px; font-weight: 800;
    letter-spacing: 0.08em; text-transform: uppercase;
    padding: 3px 7px; border-radius: 3px;
    text-decoration: none !important;
    border: 1px solid rgba(255,255,255,0.1);
    transition: background 0.15s; white-space: nowrap;
}
.vg-cat-badge a:hover { background: rgba(40,40,40,0.92); }

/* ── ICONS OVERLAY (bottom-right of image) ── */
.vg-icons-overlay {
    position: absolute; bottom: 6px; right: 6px; z-index: 3;
    display: flex; align-items: center; gap: 3px; pointer-events: none;
}
.vg-icons-overlay .torrent_icon_container { pointer-events: auto; }

/* ── INFO AREA ── */
.vg-info {
    padding: 9px 11px 10px;
    display: flex; flex-direction: column; gap: 6px;
    flex: 1; min-height: 0;
}

/* ── TITLE ── */
.vg-title {
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.vg-title a {
    color: ${TITLE_COLOR}; text-decoration: none;
    font-size: 10px; font-weight: 600;
    transition: color 0.12s;
}
.vg-title a:hover {
    color: ${TITLE_HOVER}; text-decoration: underline;
}

/* ── STATS CHIPS ── */
.vg-stats { display: flex; flex-wrap: wrap; gap: 4px; }
.vg-stat {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10px; font-weight: 700;
    padding: 2px 6px; border-radius: 3px;
    white-space: nowrap; letter-spacing: 0.01em;
}
.vg-stat-seed   { background: #132213; color: #5dc85d; border: 1px solid #254825; }
.vg-stat-leech  { background: #221313; color: #c85d5d; border: 1px solid #482525; }
.vg-stat-snatch { background: #131c26; color: #5d9dc8; border: 1px solid #253648; }
.vg-stat-size   { background: #1e1e10; color: #b0a84a; border: 1px solid #3c3820; }
/* requests-specific: votes reuses snatch style; bounty reuses size style */
/* filled/unfilled reuse seed/leech */

/* ── META ROW ── */
.vg-meta {
    display: flex; gap: 10px; font-size: 10px; color: ${META_COLOR}; flex-wrap: wrap;
}
.vg-meta span { white-space: nowrap; }

/* ── FOOTER ROW (uploader + time) ── */
.vg-footer {
    display: flex; align-items: center; justify-content: space-between;
    gap: 6px; font-size: 10px; color: ${FOOTER_COLOR};
    margin-top: auto; padding-top: 2px;
    border-top: 1px solid ${FOOTER_BORDER}; flex-wrap: wrap;
}
.vg-footer a { color: #5a7a9a; text-decoration: none; font-weight: 600; }
.vg-footer a:hover { text-decoration: underline; color: #7aa0c8; }
.vg-time { font-size: 9px; color: ${TIME_COLOR}; white-space: nowrap; flex-shrink: 0; }

/* ── GALLERY TOGGLE BUTTON IN NAV ── */
#nav_gallery_toggle a {
    cursor: pointer; display: flex !important;
    align-items: center; gap: 3px;
    text-decoration: none; white-space: nowrap;
}
#nav_gallery_toggle a:hover { text-decoration: underline; }
`);

// --------------------
// CSS — settings overlay + nav buttons
// --------------------
GM_addStyle(`
#viewer_settings_nav_wrap {
    float: right; padding-top: 3px;
    align-items: center; margin-right: 4px;
}
#viewer_settings_nav_wrap > ul {
    list-style: none; margin: 0; padding: 0;
    display: flex; align-items: center; gap: 4px;
}
#nav_viewer_settings a {
    cursor: pointer; display: flex !important;
    align-items: center; gap: 3px;
    text-decoration: none; white-space: nowrap;
}
#nav_viewer_settings a:hover { text-decoration: underline; }
#nav_viewer_settings .viewer-gear-icon,
#nav_gallery_toggle  .viewer-gear-icon {
    display: inline-block; font-size: 11px; line-height: 1;
    margin-right: 1px; opacity: 0.9;
}
#viewer-settings-backdrop {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.72); z-index: 99998; backdrop-filter: blur(2px);
}
#viewer-settings-backdrop.active { display: flex; align-items: center; justify-content: center; }
#viewer-settings-modal {
    position: relative; background: #1e1e1e;
    border: 1px solid #444; border-radius: 6px;
    width: 520px; max-width: 95vw; max-height: 88vh;
    overflow-y: auto; color: #d0d0d0;
    font-family: inherit; font-size: 12px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.7); z-index: 99999;
}
#viewer-settings-modal .vsm-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px 10px; border-bottom: 1px solid #3a3a3a;
    position: sticky; top: 0; background: #1e1e1e; z-index: 1;
}
#viewer-settings-modal .vsm-header h2 {
    margin: 0; font-size: 13px; font-weight: 700;
    color: #e8e8e8; letter-spacing: 0.03em; text-transform: uppercase;
}
#viewer-settings-modal .vsm-header .vsm-close {
    background: none; border: none; color: #888;
    font-size: 18px; line-height: 1; cursor: pointer;
    padding: 0 2px; transition: color 0.15s;
}
#viewer-settings-modal .vsm-header .vsm-close:hover { color: #e0e0e0; }
#viewer-settings-modal .vsm-body { padding: 14px 16px 8px; }
#viewer-settings-modal .vsm-section { margin-bottom: 16px; }
#viewer-settings-modal .vsm-section-title {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #888; margin: 0 0 8px;
    padding-bottom: 4px; border-bottom: 1px solid #2e2e2e;
}
#viewer-settings-modal .vsm-row {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 12px; padding: 6px 0; border-bottom: 1px solid #272727;
}
#viewer-settings-modal .vsm-row:last-child { border-bottom: none; }
#viewer-settings-modal .vsm-label-wrap { flex: 1; min-width: 0; }
#viewer-settings-modal .vsm-label {
    display: block; font-weight: 600; color: #ccc;
    font-size: 12px; line-height: 1.4;
}
#viewer-settings-modal .vsm-hint {
    display: block; font-size: 10px; color: #666; margin-top: 2px; line-height: 1.3;
}
#viewer-settings-modal .vsm-control { flex-shrink: 0; display: flex; align-items: center; }
#viewer-settings-modal select,
#viewer-settings-modal input[type="number"] {
    background: #2b2b2b; border: 1px solid #404040; color: #d0d0d0;
    padding: 3px 6px; border-radius: 3px; font-size: 11px;
    outline: none; transition: border-color 0.15s;
}
#viewer-settings-modal select:hover,
#viewer-settings-modal input[type="number"]:hover { border-color: #666; }
#viewer-settings-modal select:focus,
#viewer-settings-modal input[type="number"]:focus { border-color: #888; }
#viewer-settings-modal input[type="number"] { width: 66px; text-align: center; }
#viewer-settings-modal select { min-width: 160px; }
#viewer-settings-modal .vsm-toggle {
    position: relative; display: inline-block;
    width: 36px; height: 20px; flex-shrink: 0;
}
#viewer-settings-modal .vsm-toggle input {
    opacity: 0; width: 0; height: 0; position: absolute;
}
#viewer-settings-modal .vsm-toggle-slider {
    position: absolute; inset: 0; background: #3a3a3a;
    border-radius: 20px; cursor: pointer;
    transition: background 0.2s; border: 1px solid #505050;
}
#viewer-settings-modal .vsm-toggle-slider::before {
    content: ''; position: absolute;
    width: 14px; height: 14px; left: 2px; top: 2px;
    background: #888; border-radius: 50%;
    transition: transform 0.2s, background 0.2s;
}
#viewer-settings-modal .vsm-toggle input:checked + .vsm-toggle-slider {
    background: #3d6e3d; border-color: #5a9e5a;
}
#viewer-settings-modal .vsm-toggle input:checked + .vsm-toggle-slider::before {
    transform: translateX(16px); background: #7ec87e;
}
#viewer-settings-modal .vsm-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px 14px; border-top: 1px solid #3a3a3a; margin-top: 4px;
    position: sticky; bottom: 0; background: #1e1e1e;
}
#viewer-settings-modal .vsm-footer-note { font-size: 10px; color: #555; }
#viewer-settings-modal .vsm-footer-btns { display: flex; gap: 8px; }
#viewer-settings-modal .vsm-btn {
    padding: 5px 14px; font-size: 11px; font-weight: 600;
    border-radius: 3px; cursor: pointer; border: 1px solid;
    transition: background 0.15s, color 0.15s; letter-spacing: 0.02em;
}
#viewer-settings-modal .vsm-btn-reset { background: #2a2a2a; border-color: #444; color: #888; }
#viewer-settings-modal .vsm-btn-reset:hover { background: #333; color: #bbb; border-color: #666; }
#viewer-settings-modal .vsm-btn-save { background: #2d4a2d; border-color: #4a7a4a; color: #8fc88f; }
#viewer-settings-modal .vsm-btn-save:hover { background: #3a5e3a; color: #aedaae; border-color: #6aaa6a; }
#viewer-settings-modal .vsm-saved-msg {
    font-size: 10px; color: #7ec87e; opacity: 0;
    transition: opacity 0.3s; margin-right: 8px;
}
#viewer-settings-modal .vsm-saved-msg.visible { opacity: 1; }
.vg-dl-row {
    display: flex;
    margin-top: 1px;
}
.vg-download-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 700;
    color: #7dc4ff !important;
    text-decoration: none;
    white-space: nowrap;
    background: #0d1e2e;
    border: 1px solid #1e3a55;
    border-radius: 3px;
    padding: 2px 7px;
    transition: background 0.15s, border-color 0.15s;
}
.vg-download-btn:hover {
    background: #152840;
    border-color: #3a6a9a;
    text-decoration: none !important;
}
.vg-tags-btn {
    background: #1a1a2e;
    border-color: #2e2e55;
    color: #9a9aff !important;
    cursor: pointer;
    font-family: inherit;
}
.vg-tags-btn:hover {
    background: #222244;
    border-color: #5555aa;
    text-decoration: none !important;
}
/* ── TAGS POPUP (body-appended singleton) ── */
#vg-tags-popup {
    display: none;
    position: absolute;
    z-index: 999999;
    background: #191919;
    border: 1px solid #383838;
    border-radius: 5px;
    padding: 8px 10px;
    max-width: 340px;
    box-shadow: 0 6px 22px rgba(0,0,0,0.65);
}
.vg-tag-chip {
    display: inline-block;
    font-size: 10px; font-weight: 600;
    padding: 2px 7px; margin: 2px 3px 2px 0;
    border-radius: 3px; cursor: pointer;
    background: #242424; color: #aaa;
    border: 1px solid #333;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
    user-select: none;
}
.vg-tag-chip:hover { background: #2e2e2e; color: #ddd; border-color: #555; }
.vg-tag-chip.vg-tag-bl {
    background: #2e1010; color: #e06060;
    border-color: #602020;
}
.vg-tag-chip.vg-tag-bl:hover { background: #3a1414; color: #f07070; border-color: #883030; }
/* ── FAVORITE TAG CHIP ── */
.vg-tag-chip.vg-tag-fav {
    background: #2e2500; color: #f5c518;
    border-color: #7a6000;
}
.vg-tag-chip.vg-tag-fav:hover { background: #3a3000; color: #ffd740; border-color: #aa8800; }
/* ── GLOW ANIMATION for favorite-matched rows/cards ── */
@keyframes vg-glow-pulse {
    0%, 100% { box-shadow: 0 0 7px 2px var(--vg-glow-c), 0 2px 8px rgba(0,0,0,0.5); }
    50%       { box-shadow: 0 0 20px 6px var(--vg-glow-c), 0 2px 8px rgba(0,0,0,0.5); }
}
.vg-fav-match {
    position: relative;
    background: ${CARD_BG} !important;
}
/* ── FAVORITE TAGS SETTINGS PANEL ── */
#vsm-fav-chips-container {
    padding: 6px 0 4px; display: flex; flex-wrap: wrap; gap: 3px; min-height: 24px;
}
#vsm-fav-chips-container .vsm-fav-chip {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10px; font-weight: 600;
    padding: 2px 4px 2px 7px; border-radius: 3px;
    background: #2e2500; color: #f5c518; border: 1px solid #7a6000;
}
#vsm-fav-chips-container .vsm-fav-chip button {
    background: none; border: none; color: #b09000;
    font-size: 13px; line-height: 1; cursor: pointer;
    padding: 0 1px; margin-left: 1px; transition: color 0.12s;
}
#vsm-fav-chips-container .vsm-fav-chip button:hover { color: #ffd740; }
#vsm-fav-add-row {
    display: flex; gap: 6px; align-items: center; padding: 6px 0;
}
#vsm-fav-add-input {
    flex: 1; background: #2b2b2b; border: 1px solid #404040; color: #d0d0d0;
    padding: 3px 7px; border-radius: 3px; font-size: 11px; outline: none;
    transition: border-color 0.15s;
}
#vsm-fav-add-input:focus { border-color: #888; }
#vsm-fav-add-input:disabled { opacity: 0.4; cursor: not-allowed; }
#vsm-fav-add-btn, #vsm-fav-clear-btn { padding: 4px 10px; font-size: 10px; }
/* ── GLOW COLOR SWATCHES ── */
.vsm-glow-swatches {
    display: flex; flex-wrap: wrap; gap: 7px; padding: 6px 0 4px;
}
.vsm-glow-swatch {
    width: 26px; height: 26px; border-radius: 50%; cursor: pointer;
    border: 2px solid transparent; transition: transform 0.12s, border-color 0.12s;
    position: relative; flex-shrink: 0;
}
.vsm-glow-swatch:hover { transform: scale(1.18); }
.vsm-glow-swatch.selected {
    border-color: #ffffff;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.3);
}
.vsm-glow-swatch.selected::after {
    content: '✓'; position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 900; color: #000; text-shadow: 0 0 3px #fff;
}
/* ── TAGS POPUP MODE HINT ── */
#vg-tags-popup .vg-popup-hint {
    font-size: 9px; color: #666; text-transform: uppercase;
    letter-spacing: 0.08em; margin-bottom: 6px; padding-bottom: 5px;
    border-bottom: 1px solid #2a2a2a; display: block;
}
/* ── UPLOADER BLOCK BUTTON (table view, next to uploader name) ── */
.vg-uploader-block-btn {
    background: none; border: none; cursor: pointer;
    font-size: 10px; padding: 0 1px; margin-left: 5px;
    opacity: 0.25; transition: opacity 0.15s;
    vertical-align: middle; line-height: 1; color: inherit;
}
.vg-uploader-block-btn:hover { opacity: 1; }
/* In gallery card footer — uploader name when blacklisted */
.vg-uploader-bl {
    color: #c05050 !important;
    text-decoration: line-through !important;
    opacity: 0.7;
}
/* Uploader block button inside gallery card footer */
.vg-footer-block-btn {
    background: none; border: none; cursor: pointer;
    font-size: 10px; padding: 0 1px; margin-left: 3px;
    opacity: 0.2; transition: opacity 0.15s; line-height: 1;
    color: inherit; vertical-align: middle;
}
.vg-footer:hover .vg-footer-block-btn { opacity: 0.6; }
.vg-footer-block-btn:hover { opacity: 1 !important; }
/* Uploader blacklist section in settings — reuses vsm-bl-chip from tags */
#vsm-uploader-chips-container {
    padding: 6px 0 4px; display: flex; flex-wrap: wrap; gap: 3px; min-height: 24px;
}
#vsm-uploader-chips-container .vsm-bl-chip {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10px; font-weight: 600;
    padding: 2px 4px 2px 7px; border-radius: 3px;
    background: #1a1020; color: #b070e0; border: 1px solid #5a2090;
}
#vsm-uploader-chips-container .vsm-bl-chip button {
    background: none; border: none; color: #9050c0;
    font-size: 13px; line-height: 1; cursor: pointer;
    padding: 0 1px; margin-left: 1px; transition: color 0.12s;
}
#vsm-uploader-chips-container .vsm-bl-chip button:hover { color: #cc88ff; }
#vsm-uploader-add-row {
    display: flex; gap: 6px; align-items: center; padding: 6px 0;
}
#vsm-uploader-add-input {
    flex: 1; background: #2b2b2b; border: 1px solid #404040; color: #d0d0d0;
    padding: 3px 7px; border-radius: 3px; font-size: 11px; outline: none;
    transition: border-color 0.15s;
}
#vsm-uploader-add-input:focus { border-color: #888; }
#vsm-uploader-add-btn, #vsm-uploader-clear-btn { padding: 4px 10px; font-size: 10px; }
#vsm-tag-chips-container {
    padding: 6px 0 4px; display: flex; flex-wrap: wrap; gap: 3px; min-height: 24px;
}
#vsm-tag-chips-container .vsm-bl-chip {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10px; font-weight: 600;
    padding: 2px 4px 2px 7px; border-radius: 3px;
    background: #2e1010; color: #e06060; border: 1px solid #602020;
}
#vsm-tag-chips-container .vsm-bl-chip button {
    background: none; border: none; color: #c05050;
    font-size: 13px; line-height: 1; cursor: pointer;
    padding: 0 1px; margin-left: 1px; transition: color 0.12s;
}
#vsm-tag-chips-container .vsm-bl-chip button:hover { color: #ff8888; }
#vsm-tag-add-row {
    display: flex; gap: 6px; align-items: center; padding: 6px 0;
}
#vsm-tag-add-input {
    flex: 1; background: #2b2b2b; border: 1px solid #404040; color: #d0d0d0;
    padding: 3px 7px; border-radius: 3px; font-size: 11px; outline: none;
    transition: border-color 0.15s;
}
#vsm-tag-add-input:focus { border-color: #888; }
#vsm-tag-add-input:disabled { opacity: 0.4; cursor: not-allowed; }
#vsm-tag-add-btn { padding: 4px 10px; }
#vsm-tag-clear-btn { padding: 4px 10px; font-size: 10px; }
.vsm-tags-disabled-note {
    font-size: 10px; color: #555; font-style: italic; padding: 2px 0;
}
`);



// --------------------
// CSS — changelog popup
// --------------------
GM_addStyle(`
#vcl-backdrop {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.78); z-index: 999997; backdrop-filter: blur(2px);
}
#vcl-backdrop.active { display: flex; align-items: center; justify-content: center; }
#vcl-modal {
    position: relative; background: #1a1a1a;
    border: 1px solid #3a3a3a; border-radius: 8px;
    width: 560px; max-width: 96vw; max-height: 86vh;
    overflow-y: auto; color: #d0d0d0;
    font-family: inherit; font-size: 12px;
    box-shadow: 0 10px 50px rgba(0,0,0,0.8); z-index: 999998;
}
#vcl-modal .vcl-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px 12px; border-bottom: 1px solid #2e2e2e;
    position: sticky; top: 0; background: #1a1a1a; z-index: 1;
    gap: 10px;
}
#vcl-modal .vcl-header-left { display: flex; flex-direction: column; gap: 2px; }
#vcl-modal .vcl-header h2 {
    margin: 0; font-size: 14px; font-weight: 800;
    color: #f0f0f0; letter-spacing: 0.04em; text-transform: uppercase;
}
#vcl-modal .vcl-header .vcl-subtitle {
    font-size: 10px; color: #666; letter-spacing: 0.02em;
}
#vcl-modal .vcl-body { padding: 14px 18px 6px; }
#vcl-modal .vcl-version-block { margin-bottom: 18px; }
#vcl-modal .vcl-version-block:last-child { margin-bottom: 0; }
#vcl-modal .vcl-version-label {
    display: inline-block;
    font-size: 10px; font-weight: 800; letter-spacing: 0.08em;
    text-transform: uppercase; color: #7ec87e;
    background: #1a2e1a; border: 1px solid #2e5e2e;
    padding: 2px 8px; border-radius: 3px; margin-bottom: 8px;
}
#vcl-modal .vcl-changes {
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column; gap: 5px;
}
#vcl-modal .vcl-changes li {
    display: flex; gap: 8px; align-items: flex-start;
    font-size: 11px; color: #c0c0c0; line-height: 1.5;
}
#vcl-modal .vcl-changes li::before {
    content: '→'; color: #5a8a5a; font-weight: 700;
    flex-shrink: 0; margin-top: 0px;
}
#vcl-modal .vcl-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 18px 16px; border-top: 1px solid #2e2e2e; margin-top: 10px;
    position: sticky; bottom: 0; background: #1a1a1a; gap: 10px;
    flex-wrap: wrap;
}
#vcl-modal .vcl-github-link {
    font-size: 11px; color: #5a7a9a; text-decoration: none; font-weight: 600;
}
#vcl-modal .vcl-github-link:hover { color: #7aa0c8; text-decoration: underline; }
#vcl-modal .vcl-ok-btn {
    padding: 6px 22px; font-size: 12px; font-weight: 700;
    border-radius: 4px; cursor: pointer;
    background: #2d4a2d; border: 1px solid #4a7a4a; color: #8fc88f;
    transition: background 0.15s, color 0.15s; letter-spacing: 0.03em;
}
#vcl-modal .vcl-ok-btn:hover { background: #3a5e3a; color: #aedaae; border-color: #6aaa6a; }
`);

// --------------------
// SETTINGS OVERLAY — BUILD & INJECT
// --------------------
function buildSettingsOverlay() {

    function toggle(id, checked, hint) {
        return `
        <label class="vsm-toggle" title="${hint || ''}">
            <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
            <span class="vsm-toggle-slider"></span>
        </label>`;
    }

    function select(id, options, value) {
        const opts = options.map(([v, label]) =>
                                 `<option value="${v}" ${v === value ? 'selected' : ''}>${label}</option>`
        ).join('');
        return `<select id="${id}">${opts}</select>`;
    }

    function row(labelText, hint, controlHtml) {
        return `
        <div class="vsm-row">
            <div class="vsm-label-wrap">
                <span class="vsm-label">${labelText}</span>
                ${hint ? `<span class="vsm-hint">${hint}</span>` : ''}
            </div>
            <div class="vsm-control">${controlHtml}</div>
        </div>`;
    }

    const html = `
    <div id="viewer-settings-backdrop">
        <div id="viewer-settings-modal">
            <div class="vsm-header">
                <h2>&#9881; Viewer Settings ${SCRIPT_VERSION}</h2>
                <button class="vsm-close" id="vsm-close-btn" title="Close">&#x2715;</button>
            </div>
            <div class="vsm-body">

                <div class="vsm-section">
                    <p class="vsm-section-title">Table / Torrent List</p>
                    ${row('Max Thumbnail Size',
                          'Maximum width &amp; height of thumbnails in the torrent table (px)',
                          `<input type="number" id="vsm-TABLE_MAX_IMAGE_SIZE" min="50" max="600" step="10" value="${TABLE_MAX_IMAGE_SIZE}">`)}
                    ${row('Small Thumbnails',
                          'Use compact thumbnail size (50×50 placeholder before load)',
                          toggle('vsm-SMALL_THUMBNAILS', SMALL_THUMBNAILS))}
                    ${row('Wider Table View',
                          'Expands #content to 99% width, up to 1500px',
                          toggle('vsm-ENABLE_WIDER_TABLE_VIEW', ENABLE_WIDER_TABLE_VIEW))}
                    ${row('Remove Category Labels',
                          'Hides the category div/icon overlay on each row',
                          toggle('vsm-REMOVE_CATEGORIES', REMOVE_CATEGORIES))}
                </div>

                <div class="vsm-section">
                    <p class="vsm-section-title">Gallery View</p>
                    ${row('Gallery Mode',
                          'Display results as an image card grid instead of the table. Toggle instantly with the Grid/List button in the nav bar.',
                          toggle('vsm-GALLERY_VIEW_MODE', GALLERY_VIEW_MODE))}
                    ${row('Card Dark Mode',
                          'Display Toggle Dark Mode for the cards in grid view.',
                          toggle('vsm-GRID_DARK_MODE', GRID_DARK_MODE))}
                    ${row('Min Card Width',
                          'Minimum card width in the gallery grid (px). Affects how many columns fit.',
                          `<input type="number" id="vsm-GALLERY_CARD_MIN_WIDTH" min="140" max="480" step="10" value="${GALLERY_CARD_MIN_WIDTH}">`)}
                </div>

                <div class="vsm-section">
                    <p class="vsm-section-title">Collage Page</p>
                    ${row('Text Trim Mode',
                          'Controls how torrent titles are displayed in the collage grid',
                          select('vsm-TRIM_TEXT_COLLAGE_PAGE_MODE',
                                 [['nothing','Nothing (default)'],['small_text','Small text'],
                                  ['smaller_text','Smaller text'],['small_text_wrap','Small text + wrap'],
                                  ['smaller_text_wrap','Smaller text + wrap']],
                                 TRIM_TEXT_COLLAGE_PAGE_MODE))}
                    ${row('Fit Vertical Images',
                          'Adjusts the SVG viewBox to better fill tall/portrait cover images',
                          select('vsm-FIT_VERTICAL_IMAGES_GRID_BETTER',
                                 [['nothing','Nothing (default)'],['half','Half width'],['full','Full width']],
                                 FIT_VERTICAL_IMAGES_GRID_BETTER))}
                    ${row('Remove Cover Images',
                          'Hides the .torrent__cover background image on collage pages',
                          toggle('vsm-REMOVE_MAIN_IMAGES_COLLAGE_PAGE', REMOVE_MAIN_IMAGES_COLLAGE_PAGE))}
                </div>

                <div class="vsm-section">
                    <p class="vsm-section-title">Performance</p>
                    ${row('Image Load Mode',
                          'When thumbnail images are fetched relative to the viewport',
                          select('vsm-IMAGE_LOAD_MODE',
                                 [['disabled','Immediate (no lazy load)'],
                                  ['near','Near (~1–2 screens away)'],
                                  ['lazy','Lazy (only when visible)']],
                                 IMAGE_LOAD_MODE))}
                </div>

                <div class="vsm-section" id="vsm-tags-section">
                    <p class="vsm-section-title">Tag Blacklist</p>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Blacklisted Tags</span>
                        <span class="vsm-hint">Rows/cards containing ANY blacklisted tag are hidden immediately. Changes apply instantly without saving.</span>
                    </div>
                    <div id="vsm-tag-chips-container"></div>
                    <div id="vsm-tag-add-row">
                        <input type="text" id="vsm-tag-add-input" placeholder="e.g. scat  or  natural.tits" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-tag-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-tag-clear-btn" type="button">Clear all</button>
                    </div>
                    <div id="vsm-tags-disabled-msg" class="vsm-tags-disabled-note" style="display:none;">
                        No tags found on this page — add/remove is disabled until you visit a page with tags.
                    </div>
                </div>

                <div class="vsm-section" id="vsm-fav-tags-section">
                    <p class="vsm-section-title">Favorite Tags</p>
                    ${row('Tag Popup Click Action',
                          'What clicking a tag chip in the Tags popup does. Popup shows current mode. Tags are mutually exclusive between lists.',
                          select('vsm-TAG_CLICK_ACTION',
                                 [['blacklist','Blacklist tag'],['favorite','Add to favorites']],
                                 TAG_CLICK_ACTION))}
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Glow Color</span>
                        <span class="vsm-hint">Color of the glow effect on rows/cards that match a favorite tag.</span>
                    </div>
                    <div class="vsm-glow-swatches" id="vsm-glow-swatches"></div>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Favorited Tags</span>
                        <span class="vsm-hint">Rows/cards containing ANY favorite tag glow in the chosen color. Changes apply instantly.</span>
                    </div>
                    <div id="vsm-fav-chips-container"></div>
                    <div id="vsm-fav-add-row">
                        <input type="text" id="vsm-fav-add-input" placeholder="e.g. lesbian  or  big.tits" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-fav-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-fav-clear-btn" type="button">Clear all</button>
                    </div>
                    <div id="vsm-fav-disabled-msg" class="vsm-tags-disabled-note" style="display:none;">
                        No tags found on this page — add is disabled until you visit a page with tags.
                    </div>
                </div>

                <div class="vsm-section" id="vsm-uploaders-section">
                    <p class="vsm-section-title">Uploader Blacklist</p>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Blacklisted Uploaders</span>
                        <span class="vsm-hint">Rows/cards from blacklisted uploaders are hidden. In gallery view, click ⛔ next to an uploader name to block them instantly. Changes apply without saving.</span>
                    </div>
                    <div id="vsm-uploader-chips-container"></div>
                    <div id="vsm-uploader-add-row">
                        <input type="text" id="vsm-uploader-add-input" placeholder="e.g. username123" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-uploader-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-uploader-clear-btn" type="button">Clear all</button>
                    </div>
                </div>

            </div>
            <div class="vsm-footer">
                <div style="display:flex;align-items:center">
                    <span class="vsm-saved-msg" id="vsm-saved-msg">&#x2713; Saved &mdash; reload to apply</span>
                    <span class="vsm-footer-note">Settings are shared across all supported domains.</span>
                </div>
                <div class="vsm-footer-btns">
                    <button class="vsm-btn vsm-btn-reset" id="vsm-reset-btn">Reset defaults</button>
                    <button class="vsm-btn vsm-btn-save"  id="vsm-save-btn">Save &amp; close</button>
                </div>
            </div>
        </div>
    </div>`;

    jQuery('body').append(html);

    jQuery('#viewer-settings-backdrop').on('click', function(e) { if (e.target === this) closeOverlay(); });
    jQuery('#vsm-close-btn').on('click', closeOverlay);

    jQuery(document).on('click', '#vsm-tag-add-btn', function() {
        const val = jQuery('#vsm-tag-add-input').val().trim().toLowerCase();
        if (!val) return;
        val.split(/[\s,]+/).forEach(function(t) {
            t = t.trim();
            if (t && TAG_BLACKLIST.indexOf(t) === -1) TAG_BLACKLIST.push(t);
        });
        saveTagBlacklist();
        applyBlacklistsToPage();
        jQuery('#vsm-tag-add-input').val('');
        refreshTagSettingsPanel();
    });
    jQuery(document).on('keydown', '#vsm-tag-add-input', function(e) {
        if (e.key === 'Enter') jQuery('#vsm-tag-add-btn').trigger('click');
    });
    jQuery(document).on('click', '#vsm-tag-clear-btn', function() {
        if (!TAG_BLACKLIST.length) return;
        if (!confirm('Remove all ' + TAG_BLACKLIST.length + ' blacklisted tag(s)?')) return;
        TAG_BLACKLIST = [];
        saveTagBlacklist();
        applyBlacklistsToPage();
        refreshTagSettingsPanel();
    });

    // Uploader blacklist handlers
    jQuery(document).on('click', '#vsm-uploader-add-btn', function() {
        const val = jQuery('#vsm-uploader-add-input').val().trim().toLowerCase();
        if (!val) return;
        val.split(/[\s,]+/).forEach(function(u) {
            u = u.trim();
            if (u && UPLOADER_BLACKLIST.indexOf(u) === -1) UPLOADER_BLACKLIST.push(u);
        });
        saveUploaderBlacklist();
        applyBlacklistsToPage();
        jQuery('#vsm-uploader-add-input').val('');
        refreshUploaderSettingsPanel();
    });
    jQuery(document).on('keydown', '#vsm-uploader-add-input', function(e) {
        if (e.key === 'Enter') jQuery('#vsm-uploader-add-btn').trigger('click');
    });
    jQuery(document).on('click', '#vsm-uploader-clear-btn', function() {
        if (!UPLOADER_BLACKLIST.length) return;
        if (!confirm('Remove all ' + UPLOADER_BLACKLIST.length + ' blacklisted uploader(s)?')) return;
        UPLOADER_BLACKLIST = [];
        saveUploaderBlacklist();
        applyBlacklistsToPage();
        refreshUploaderSettingsPanel();
    });

    // Favorite tags handlers
    jQuery(document).on('click', '#vsm-fav-add-btn', function() {
        const val = jQuery('#vsm-fav-add-input').val().trim().toLowerCase();
        if (!val) return;
        val.split(/[\s,]+/).forEach(function(t) {
            t = t.trim();
            if (t) addTagToFavorites(t);
        });
        jQuery('#vsm-fav-add-input').val('');
        refreshFavoriteTagsPanel();
    });
    jQuery(document).on('keydown', '#vsm-fav-add-input', function(e) {
        if (e.key === 'Enter') jQuery('#vsm-fav-add-btn').trigger('click');
    });
    jQuery(document).on('click', '#vsm-fav-clear-btn', function() {
        if (!TAG_FAVORITES.length) return;
        if (!confirm('Remove all ' + TAG_FAVORITES.length + ' favorite tag(s)?')) return;
        TAG_FAVORITES = [];
        saveFavoriteTags();
        applyFavoriteGlowToPage();
        refreshFavoriteTagsPanel();
    });

    jQuery('#vsm-save-btn').on('click', function() {
        const prevGallery = GALLERY_VIEW_MODE;
        saveSettings();
        GALLERY_VIEW_MODE = jQuery('#vsm-GALLERY_VIEW_MODE').is(':checked');
        if (GALLERY_VIEW_MODE !== prevGallery) {
            if (GALLERY_VIEW_MODE) buildGalleryView();
            else destroyGalleryView();
        }
        closeOverlay();
        if (confirm('Settings saved!\n\nReload the page now for all changes to take effect?')) {
            location.reload();
        }
    });

    jQuery('#vsm-reset-btn').on('click', function() {
        if (!confirm('Reset all viewer settings to their defaults?')) return;
        applyDefaultsToForm();
        saveSettings();
        showSavedMsg();
    });

    jQuery(document).on('keydown.vsm', function(e) { if (e.key === 'Escape') closeOverlay(); });
}

function openOverlay()  {
    jQuery('#viewer-settings-backdrop').addClass('active');
    refreshTagSettingsPanel();
    refreshUploaderSettingsPanel();
    refreshFavoriteTagsPanel();
    buildGlowSwatches();
}
function closeOverlay() { jQuery('#viewer-settings-backdrop').removeClass('active'); }

function showSavedMsg() {
    const $msg = jQuery('#vsm-saved-msg');
    $msg.addClass('visible');
    setTimeout(() => $msg.removeClass('visible'), 2500);
}

function applyDefaultsToForm() {
    jQuery('#vsm-TABLE_MAX_IMAGE_SIZE').val(DEFAULTS.TABLE_MAX_IMAGE_SIZE);
    jQuery('#vsm-SMALL_THUMBNAILS').prop('checked', DEFAULTS.SMALL_THUMBNAILS);
    jQuery('#vsm-ENABLE_WIDER_TABLE_VIEW').prop('checked', DEFAULTS.ENABLE_WIDER_TABLE_VIEW);
    jQuery('#vsm-REMOVE_CATEGORIES').prop('checked', DEFAULTS.REMOVE_CATEGORIES);
    jQuery('#vsm-TRIM_TEXT_COLLAGE_PAGE_MODE').val(DEFAULTS.TRIM_TEXT_COLLAGE_PAGE_MODE);
    jQuery('#vsm-FIT_VERTICAL_IMAGES_GRID_BETTER').val(DEFAULTS.FIT_VERTICAL_IMAGES_GRID_BETTER);
    jQuery('#vsm-REMOVE_MAIN_IMAGES_COLLAGE_PAGE').prop('checked', DEFAULTS.REMOVE_MAIN_IMAGES_COLLAGE_PAGE);
    jQuery('#vsm-IMAGE_LOAD_MODE').val(DEFAULTS.IMAGE_LOAD_MODE);
    jQuery('#vsm-GALLERY_VIEW_MODE').prop('checked', DEFAULTS.GALLERY_VIEW_MODE);
    jQuery('#vsm-GRID_DARK_MODE').prop('checked', DEFAULTS.GRID_DARK_MODE);
    jQuery('#vsm-GALLERY_CARD_MIN_WIDTH').val(DEFAULTS.GALLERY_CARD_MIN_WIDTH);
}

function saveSettings() {
    GM_setValue('TABLE_MAX_IMAGE_SIZE',            parseInt(jQuery('#vsm-TABLE_MAX_IMAGE_SIZE').val(), 10) || DEFAULTS.TABLE_MAX_IMAGE_SIZE);
    GM_setValue('SMALL_THUMBNAILS',                jQuery('#vsm-SMALL_THUMBNAILS').is(':checked'));
    GM_setValue('ENABLE_WIDER_TABLE_VIEW',         jQuery('#vsm-ENABLE_WIDER_TABLE_VIEW').is(':checked'));
    GM_setValue('REMOVE_CATEGORIES',               jQuery('#vsm-REMOVE_CATEGORIES').is(':checked'));
    GM_setValue('TRIM_TEXT_COLLAGE_PAGE_MODE',     jQuery('#vsm-TRIM_TEXT_COLLAGE_PAGE_MODE').val());
    GM_setValue('FIT_VERTICAL_IMAGES_GRID_BETTER', jQuery('#vsm-FIT_VERTICAL_IMAGES_GRID_BETTER').val());
    GM_setValue('REMOVE_MAIN_IMAGES_COLLAGE_PAGE', jQuery('#vsm-REMOVE_MAIN_IMAGES_COLLAGE_PAGE').is(':checked'));
    GM_setValue('IMAGE_LOAD_MODE',                 jQuery('#vsm-IMAGE_LOAD_MODE').val());
    GM_setValue('GALLERY_VIEW_MODE',               jQuery('#vsm-GALLERY_VIEW_MODE').is(':checked'));
    GM_setValue('GRID_DARK_MODE',                  jQuery('#vsm-GRID_DARK_MODE').is(':checked'));
    GM_setValue('GALLERY_CARD_MIN_WIDTH',          parseInt(jQuery('#vsm-GALLERY_CARD_MIN_WIDTH').val(), 10) || DEFAULTS.GALLERY_CARD_MIN_WIDTH);
    // Tag click action — saved immediately on change but also here for consistency
    TAG_CLICK_ACTION = jQuery('#vsm-TAG_CLICK_ACTION').val() || 'blacklist';
    GM_setValue('TAG_CLICK_ACTION', TAG_CLICK_ACTION);
}

// --------------------
// NAV BUTTON INJECTION
// --------------------
function injectNavButton() {
    const $majorStats = jQuery('#major_stats');
    if (!$majorStats.length) return;

    const isCollagePage = location.pathname.includes('/collage');

    const $settingsLi = jQuery(`
        <li id="nav_viewer_settings" class="brackets">
            <a href="javascript:void(0)" id="viewer-settings-open-btn" title="EMP/HF Viewer Settings">
                <span class="viewer-gear-icon">&#9881;</span>Viewer
            </a>
        </li>
    `);

    const $ul  = jQuery('<ul>').append($settingsLi);
    const $div = jQuery('<div id="viewer_settings_nav_wrap">').append($ul);

    if (!isCollagePage) {
        const $galleryLi = jQuery(`
            <li id="nav_gallery_toggle" class="brackets">
                <a href="javascript:void(0)" id="gallery-toggle-btn"
                   title="${GALLERY_VIEW_MODE ? 'Switch to table view' : 'Switch to grid view'}">
                    <span class="viewer-gear-icon">${GALLERY_VIEW_MODE ? '&#9776;' : '&#10697;'}</span>${GALLERY_VIEW_MODE ? 'List' : 'Grid'}
                </a>
            </li>
        `);
        $ul.prepend($galleryLi);
        jQuery(document).on('click', '#gallery-toggle-btn', toggleGalleryMode);
    }

    $majorStats.before($div);
    jQuery('#viewer-settings-open-btn').on('click', openOverlay);
}

// --------------------
// GALLERY — TOGGLE
// --------------------
function toggleGalleryMode() {
    GALLERY_VIEW_MODE = !GALLERY_VIEW_MODE;
    GM_setValue('GALLERY_VIEW_MODE', GALLERY_VIEW_MODE);
    if (GALLERY_VIEW_MODE) buildGalleryView();
    else destroyGalleryView();
}

// --------------------
// GALLERY — UPDATE NAV BUTTON LABEL
// --------------------
function updateGalleryToggleLabel(isGrid) {
    const $btn = jQuery('#gallery-toggle-btn');
    if ($btn.length) {
        $btn.html(`<span class="viewer-gear-icon">${isGrid ? '&#9776;' : '&#10697;'}</span>${isGrid ? 'List' : 'Grid'}`);
        $btn.attr('title', isGrid ? 'Switch to table view' : 'Switch to grid view');
    }
    jQuery('#vsm-GALLERY_VIEW_MODE').prop('checked', isGrid);
}

// --------------------
// GALLERY — COLUMN OFFSETS PER PAGE TYPE
//
// Each page type has its own table layout. We return an object describing
// which td() index holds each field, plus a pageType string used for
// conditional rendering inside buildGalleryCard.
//
// Standard torrents.php layout (no extra leading columns):
//   [0]=cat  [1]=title  [2]=files  [3]=comments  [4]=time  [5]=size
//   [6]=snatched  [7]=seeders  [8]=leechers  [9]=uploader
//
// Notify page (torrents.php?action=notify) layout — EXTRA leading checkbox col:
//   [0]=checkbox  [1]=cat  [2]=title  [3]=files  [4]=time  [5]=size
//   [6]=snatched  [7]=seeders  [8]=leechers
//   Note: no comments column, no uploader column.
//
// Top10 / userhistory / subscribed_collages — EXTRA leading column (rank/date):
//   [0]=extra  [1]=cat  [2]=title  [3]=files  [4]=comments  [5]=time  [6]=size
//   [7]=snatched  [8]=seeders  [9]=leechers  [10]=uploader
//
// Requests page:
//   [0]=cat  [1]=title  [2]=votes  [3]=bounty  [4]=filled  [5]=filled_by
//   [6]=requester  [7]=created  [8]=last_vote
// --------------------
function getGalleryColOffsets() {
    const params        = new URLSearchParams(location.search);
    const isTop10       = location.pathname.includes('/top10');
    const isNotify      = location.pathname === '/torrents.php' && params.get('action') === 'notify';
    const isSubCollages = location.pathname.includes('/userhistory') && params.get('action') === 'subscribed_collages';
    const isUserHistory = location.pathname.includes('/userhistory') && !isSubCollages;
    const isRequests    = location.pathname.includes('/requests.php');

    // ── Notify: leading checkbox col shifts cat to [1], no comments/uploader ──
    if (isNotify) {
        return {
            pageType: 'notify',
            cat: 1, title: 2,
            files: 3, comments: -1,
            time: 4, size: 5,
            snatches: 6, seeders: 7, leechers: 8,
            uploader: -1,
            extra: -1,
        };
    }

    // ── Subscribed collages ──
    if (isSubCollages) {
        return {
            pageType: 'torrents',
            cat: 1,
            title: 2,

            files: -1,
            comments: -1,
            time: -1,

            size: 3,
            snatches: 4,
            seeders: 5,
            leechers: 6,

            uploader: -1,
            extra: -1,
        };
    }

    // ── Top10: rank | cat | title | data | size | snatches | seeders | leechers | peers | uploader ──
    if (isTop10) {
        return {
            pageType: 'torrents',
            cat: 1, title: 2,
            files: -1, comments: -1,
            time: -1, size: 4,
            snatches: 5, seeders: 6, leechers: 7,
            uploader: 9,
            extra: 8,   // Peers — shown as a meta chip
        };
    }

    // ── Userhistory: date | cat | title | files | comments | time | size | snatches | seeders | leechers | uploader ──
    if (isUserHistory) {
        return {
            pageType: 'torrents',
            cat: 1, title: 2,
            files: 3, comments: 4,
            time: 5, size: 6,
            snatches: 7, seeders: 8, leechers: 9,
            uploader: 10,
            extra: -1,
        };
    }

    // ── Requests: completely different column set ──
    if (isRequests) {
        return {
            pageType: 'requests',
            cat: 0, title: 1,
            files: -1, comments: -1,
            time: 7,      // "created" date — most useful for display
            size: 3,      // "bounty"
            snatches: 2,  // "votes"
            seeders: -1, leechers: -1,
            uploader: 6,  // "requested by"
            extra: 4,     // "filled" status (td text is a date link or "No")
        };
    }

    // ── Standard torrents listing ──
    return {
        pageType: 'torrents',
        cat: 0, title: 1,
        files: 2, comments: 3,
        time: 4, size: 5,
        snatches: 6, seeders: 7, leechers: 8,
        uploader: 9,
        extra: -1,
    };
}

// --------------------
// GALLERY — BUILD A SINGLE CARD FROM A TABLE ROW
// --------------------
function buildGalleryCard($row) {
    try {
        const cols = getGalleryColOffsets();
        const $tds = $row.find('> td');

        // Helper: safe text from a td by index (-1 → empty string)
        function tdText(idx) {
            if (idx < 0) return '';
            const $td = $tds.eq(idx);
            return $td.length ? $td.text().trim() : '';
        }

        // ── Image src ──
        const imgSrc = globalBackend
        ? globalBackend.get_image_src($row)
        : '/static/common/noartwork/noimage.png';

        // ── Category ──
        let catName = '';
        let catHref = '#';
        if (cols.cat >= 0) {
            const $catTd  = $tds.eq(cols.cat);
            const $catDiv = $catTd.find('div[title]').first();
            if ($catDiv.length) {
                catName = $catDiv.attr('title') || '';
                // Prefer the anchor href from the DOM (preserves site-specific filter URLs)
                const $catLink = $catDiv.find('a[href]').first();
                if ($catLink.length) catHref = $catLink.attr('href');
            }
            // Fallback after attach_image has already processed the row:
            // the original div[title] is removed and replaced by an injected
            // position:absolute overlay div containing an <a> with the category.
            if (!catName) {
                const $overlayBadge = $catTd.find('div[style*="position: absolute"]').first();
                if ($overlayBadge.length) {
                    catName = $overlayBadge.text().trim();
                    const $ol = $overlayBadge.find('a[href]').first();
                    if ($ol.length) catHref = $ol.attr('href');
                }
            }
            // If we have a name but still no valid href, derive one from the category map
            if (catName && (catHref === '#' || !catHref)) {
                catHref = getCategoryLink(catName, currentCategoryMap);
            }
            // Subscribed collages: override with the real category from the pre-fetched cache
            if (location.pathname.includes('/userhistory') &&
                new URLSearchParams(location.search).get('action') === 'subscribed_collages') {
                const tid = getTorrentIdFromRow($row);
                if (tid && subCollagesCatCache[tid]) {
                    catName = subCollagesCatCache[tid];
                    catHref = getCategoryLink(catName, currentCategoryMap);
                }
            }
        }

        // ── Title + torrent/request link ──
        const $titleTd = cols.title >= 0 ? $tds.eq(cols.title) : jQuery();
        let $titleLink = jQuery();
        if ($titleTd.length) {
            if (cols.pageType === 'requests') {
                $titleLink = $titleTd.find('a[href*="requests.php?action=view&id="]').first();
            } else {
                $titleLink = $titleTd.find('a[href*="torrents.php?id="]').first();
            }
        }
        const title      = $titleLink.length ? $titleLink.text().trim() : '(unknown)';
        const titleHref  = $titleLink.length ? ($titleLink.attr('href') || '#') : '#';
        const onmouseover = $titleLink.length ? ($titleLink.attr('onmouseover') || '') : '';
        const onmouseout  = $titleLink.length ? ($titleLink.attr('onmouseout')  || '') : '';

        // ── Download link ──
        const $downloadLink = $row.find('a[href*="action=download"]').first();

        const downloadHref = $downloadLink.length
        ? ($downloadLink.attr('href') || '')
        : '';
        // ── Torrent icons (freeleech, staff-ok, etc.) — not present on requests ──
        const $iconsClone = $titleTd.find('.torrent_icon_container').clone();

        // ── Stats ──
        const files    = tdText(cols.files);
        const comments = tdText(cols.comments);
        const size     = tdText(cols.size);
        const snatches = tdText(cols.snatches);
        const seeders  = tdText(cols.seeders);
        const leechers = tdText(cols.leechers);

        // Time: prefer the relative string from the .time span's alt/title attribute
        let timeDisplay  = '';
        let timeRelative = '';
        if (cols.time >= 0) {
            const $timeTd   = $tds.eq(cols.time);
            const $timeSpan = $timeTd.find('.time, .nobr').first();
            // For requests "filled" td, the link wraps the span; handle both cases
            const $spanActual = $timeTd.find('span.time').first();
            if ($spanActual.length) {
                timeDisplay  = $spanActual.text().trim();
                timeRelative = $spanActual.attr('title') || $spanActual.attr('alt') || '';
            } else if ($timeSpan.length) {
                timeDisplay  = $timeSpan.text().trim();
                timeRelative = $timeSpan.attr('title') || $timeSpan.attr('alt') || '';
            } else {
                timeDisplay = $timeTd.text().trim();
            }
        }

        // Uploader / requester — use column when available, fall back to overlay script
        let uploaderText = '';
        let uploaderHref = '#';
        if (cols.uploader >= 0) {
            const $uploaderTd   = $tds.eq(cols.uploader);
            const $uploaderLink = $uploaderTd.find('a').first();

            uploaderText = $uploaderLink.length
                ? $uploaderLink.text().trim()
            : $uploaderTd.text().trim();

            uploaderHref = $uploaderLink.length
                ? ($uploaderLink.attr('href') || '#')
            : '#';

        } else {
            // pages without uploader column
            const fallbackName = getUploaderFromRow($row);

            if (fallbackName) {
                uploaderText = fallbackName;

                const token =
                      document.querySelector('#searchbar_users input[name="token"]')?.value ||
                      '';

                uploaderHref =
                    '/user.php?action=search&search=' +
                    encodeURIComponent(fallbackName) +
                    '&token=' +
                    encodeURIComponent(token);
            }
        }

        const rowTags = getTagsFromRow($row);

        // ── Build the card ──
        const $card = jQuery('<div class="vg-card">');

        // Image wrap
        const $imgWrap = jQuery('<div class="vg-img-wrap">');

        if (catName) {
            const $catBadge = jQuery('<div class="vg-cat-badge">');
            jQuery('<a>')
                .attr('href', catHref)
                .text(catName.replace(/\./g, ' ').toUpperCase().trim())
                .appendTo($catBadge);
            $imgWrap.append($catBadge);
        }

        if ($iconsClone.length) {
            $imgWrap.append(jQuery('<div class="vg-icons-overlay">').append($iconsClone));
        }

        const $img = jQuery('<img class="vg-img" alt="">').attr('data-src', imgSrc);
        $img.one('error', function() { this.src = '/static/common/noartwork/noimage.png'; });

        if (IMAGE_LOAD_MODE === 'disabled') {
            $img.attr('src', imgSrc).removeAttr('data-src');
        } else if (galleryLazyObserver) {
            setTimeout(() => { if ($img[0]) galleryLazyObserver.observe($img[0]); }, 0);
        }

        const $imgLink = jQuery('<a class="vg-img-link">').attr('href', titleHref).attr('target', '_blank');
        if (onmouseover) $imgLink.attr('onmouseover', onmouseover);
        if (onmouseout)  $imgLink.attr('onmouseout',  onmouseout);
        $imgLink.append($img);
        $imgWrap.append($imgLink);

        // Info section
        const $info = jQuery('<div class="vg-info">');

        const $titleDiv = jQuery('<div class="vg-title">');

        const $titleA = jQuery('<a>')
        .attr('href', titleHref)
        .text(title);

        if (onmouseover) $titleA.attr('onmouseover', onmouseover);
        if (onmouseout)  $titleA.attr('onmouseout',  onmouseout);

        $titleDiv.append($titleA);
        $info.append($titleDiv);

        // ── Button row: Download + Tags ──
        if (downloadHref || rowTags.length) {
            const $btnRow = jQuery('<div class="vg-dl-row">');
            if (downloadHref) {
                jQuery('<a>')
                    .attr('href', downloadHref)
                    .attr('title', 'Download torrent')
                    .addClass('vg-download-btn')
                    .html('&#11015; Download')
                    .appendTo($btnRow);
            }
            if (rowTags.length) {
                const $tagsBtn = jQuery('<button class="vg-download-btn vg-tags-btn" type="button">').html('🏷 Tags');
                $tagsBtn.on('mouseenter', function () { showTagsPopup(jQuery(this), rowTags); });
                $tagsBtn.on('mouseleave', scheduleHideTagsPopup);
                $btnRow.append($tagsBtn);
            }
            $info.append($btnRow);
        }

        // Stats chips — layout differs between requests and torrents
        const $stats = jQuery('<div class="vg-stats">');
        if (cols.pageType === 'requests') {
            // Filled status from the "extra" column
            let isFilled = false;

            if (cols.extra >= 0) {
                const $filledTd  = $tds.eq(cols.extra);
                const filledText = $filledTd.text().trim();

                // Filled if there's a link inside the td (links to the torrent); "No" or "--" means unfilled
                isFilled = $filledTd.find('a').length > 0 && filledText !== 'No';
            }

            // Remove " (+)" from votes when request is unfilled
            let displaySnatches = snatches;

            if (!isFilled && typeof displaySnatches === 'string') {
                displaySnatches = displaySnatches.replace(/\s*\(\+\)\s*$/, '');
            }

            // requests: votes | bounty | filled status
            if (displaySnatches !== '')
                $stats.append(
                    jQuery('<span class="vg-stat vg-stat-snatch" title="Votes">')
                    .text('Votes: ' + displaySnatches)
                );

            if (size !== '')
                $stats.append(
                    jQuery('<span class="vg-stat vg-stat-size" title="Bounty">')
                    .text('Bounty: ' + size)
                );

            if (cols.extra >= 0) {
                const cls   = isFilled ? 'vg-stat-seed' : 'vg-stat-leech';
                const label = isFilled ? '&#x2713; Filled' : '&#x2717; Unfilled';

                $stats.append(
                    jQuery(`<span class="vg-stat ${cls}" title="Fill status">`).html(label)
                );
            }
        } else {
            // torrents/notify: seeders | leechers | snatched | size
            if (seeders  !== '') $stats.append(jQuery('<span class="vg-stat vg-stat-seed"  title="Seeders">').text('▲ '  + seeders));
            if (leechers !== '') $stats.append(jQuery('<span class="vg-stat vg-stat-leech" title="Leechers">').text('▼ ' + leechers));
            if (snatches !== '') $stats.append(jQuery('<span class="vg-stat vg-stat-snatch" title="Snatched">').text('⤓ ' + snatches));
            if (size     !== '') $stats.append(jQuery('<span class="vg-stat vg-stat-size"  title="Size">').text(size));
        }
        if ($stats.children().length) $info.append($stats);

        // Meta (files, comments)
        const $meta = jQuery('<div class="vg-meta">');
        if (files    !== '') $meta.append(jQuery('<span>').attr('title', 'Files').text('📄 ' + files));
        if (comments !== '') $meta.append(jQuery('<span>').attr('title', 'Comments').text('💬 ' + comments));
        if ($meta.children().length) $info.append($meta);

        // Footer: uploader + time
        if (uploaderText || timeDisplay) {
            const $footer = jQuery('<div class="vg-footer">');
            if (uploaderText) {
                const uploaderKey = uploaderText.toLowerCase();
                const isUlBl = UPLOADER_BLACKLIST.indexOf(uploaderKey) !== -1;
                const $ulWrap = jQuery('<span style="display:inline-flex;align-items:center;gap:1px;">');
                const $uploaderAnchor = jQuery('<a>')
                .attr('href', uploaderHref)
                .text('👤 ' + uploaderText)
                .toggleClass('vg-uploader-bl', isUlBl);

                if (cols.uploader < 0) {
                    // fallback uploader search links are rate limited
                    $uploaderAnchor.on('click', function (e) {
                        e.preventDefault();

                        const now = Date.now();
                        const elapsed = now - lastUserSearchTimestamp;

                        if (elapsed < USER_SEARCH_COOLDOWN_MS) {
                            const remaining = Math.ceil(
                                (USER_SEARCH_COOLDOWN_MS - elapsed) / 1000
                            );

                            alert(
                                'User search cooldown active.\n\n' +
                                'Please wait ' + remaining + ' more seconds.'
                            );

                            return;
                        }

                        lastUserSearchTimestamp = now;

                        window.location.href = uploaderHref;
                    });
                }

                $uploaderAnchor.appendTo($ulWrap);
                const $blockBtn = jQuery('<button class="vg-footer-block-btn" type="button">')
                .attr('title', isUlBl ? 'Blocked — click to unblock ' + uploaderText : 'Block uploader: ' + uploaderText)
                .text('⛔');
                $blockBtn.on('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleUploaderInBlacklist(uploaderKey);
                    const nowBl = UPLOADER_BLACKLIST.indexOf(uploaderKey) !== -1;
                    $ulWrap.find('a').toggleClass('vg-uploader-bl', nowBl);
                    jQuery(this).attr('title', nowBl ? 'Blocked — click to unblock ' + uploaderText : 'Block uploader: ' + uploaderText);
                });
                $ulWrap.append($blockBtn);
                $footer.append($ulWrap);
            }
            if (timeDisplay) {
                jQuery('<span class="vg-time">')
                    .text(timeRelative || timeDisplay)
                    .attr('title', timeDisplay)
                    .appendTo($footer);
            }
            $info.append($footer);
        }

        $card.append($imgWrap, $info);

        // Apply favorite glow if any tag matches
        if (rowMatchesFavorites($row)) applyGlowToCard($card);

        return $card;

    } catch (e) {
        console.error(`${LOG_PREFIX} buildGalleryCard error:`, e, $row);
        return null;
    }
}

// --------------------
// GALLERY — BUILD GRIDS FROM ALL MATCHING TABLES
//
// On most pages there is a single table, but on torrents.php?action=notify
// the page renders one .torrent_table per notification filter group.
// We iterate every table and insert an independent grid after each one.
// --------------------
function buildGalleryView() {
    // Subscribed collages: pre-fetch all categories into cache before building cards.
    // If any are missing we fire the requests and return; the last callback re-calls
    // this function, at which point the cache is full and we fall through normally.
    if (location.pathname.includes('/userhistory') &&
        new URLSearchParams(location.search).get('action') === 'subscribed_collages') {
        const $scRows = jQuery('.torrent_table').find('tr.torrent');
        let pending = 0;
        $scRows.each(function () {
            const tid = getTorrentIdFromRow(jQuery(this));
            if (tid && !subCollagesCatCache.hasOwnProperty(tid)) pending++;
        });
        if (pending > 0) {
            $scRows.each(function () {
                const tid = getTorrentIdFromRow(jQuery(this));
                if (tid && !subCollagesCatCache.hasOwnProperty(tid)) {
                    fetchCategoryForTorrent(tid, function () {
                        if (--pending === 0) buildGalleryView(); // recurse once cache is full
                    });
                }
            });
            return; // wait for all fetches to complete
        }
        // pending === 0 means everything is already cached — fall through and build
    }
    let $tables, rowSelector;
    if (location.pathname.includes('requests.php')) {
        $tables      = jQuery('#request_table, .request_table');
        rowSelector  = 'tr.rowa, tr.rowb';
    } else {
        $tables      = jQuery('.torrent_table');
        rowSelector  = 'tr.torrent';
    }

    if (!$tables.length) {
        console.warn(`${LOG_PREFIX} buildGalleryView: no table found`);
        return;
    }

    // Remove any stale grids from a previous call
    jQuery('.viewer-gallery-grid').remove();

    // Create a fresh IntersectionObserver shared across all grids on this page
    if (galleryLazyObserver) galleryLazyObserver.disconnect();
    if (IMAGE_LOAD_MODE !== 'disabled') {
        const rootMargin = IMAGE_LOAD_MODE === 'lazy' ? '0px' : '150% 0px';
        const threshold  = IMAGE_LOAD_MODE === 'lazy' ? 0.1 : 0.01;
        galleryLazyObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const img = entry.target;
                const src = img.getAttribute('data-src');
                if (src) { img.src = src; img.removeAttribute('data-src'); }
                galleryLazyObserver.unobserve(img);
            });
        }, { root: null, rootMargin, threshold });
    } else {
        galleryLazyObserver = null;
    }

    let totalCards = 0;

    $tables.each(function () {
        const $table = jQuery(this);
        const $rows  = $table.find(rowSelector);
        if (!$rows.length) return; // skip header-only tables

        const $grid = jQuery('<div class="viewer-gallery-grid">');

        $rows.each(function () {
            const $r = jQuery(this);
            if (rowMatchesBlacklist($r) || rowMatchesUploaderBlacklist($r)) return; // hidden by blacklist
            const $card = buildGalleryCard($r);
            if ($card) $grid.append($card);
        });

        if ($grid.children().length) {
            $table.hide();
            $table.after($grid);
            totalCards += $grid.children().length;
        }
    });

    // If no rows were found yet (table is still loading), retry
    if (!totalCards) {
        console.log(`${LOG_PREFIX} buildGalleryView: no rows yet — retrying`);
        $tables.show();
        const retryInterval = setInterval(() => {
            const hasRows = $tables.toArray().some(t => jQuery(t).find(rowSelector).length > 0);
            if (hasRows) { clearInterval(retryInterval); buildGalleryView(); }
        }, 300);
        return;
    }

    updateGalleryToggleLabel(true);
}

// --------------------
// GALLERY — DESTROY ALL GRIDS, RESTORE ALL TABLES
// --------------------
function destroyGalleryView() {
    jQuery('.viewer-gallery-grid').remove();
    if (location.pathname.includes('requests.php')) {
        jQuery('#request_table, .request_table').show();
    } else {
        jQuery('.torrent_table').show();
    }
    if (galleryLazyObserver) {
        galleryLazyObserver.disconnect();
        galleryLazyObserver = null;
    }
    updateGalleryToggleLabel(false);
}


// --------------------
// HELPERS
// --------------------
function disable_images(html) { return html.replace(/ src=/g, ' data-src='); }

function get_collage_category($row) { return $row.find('td.center'); }
function get_collage_title($row)    { return $row.find('td').eq(1); }
function get_torrent_category($row) { return $row.find('td').eq(0); }
function get_torrent_title($row)    { return $row.find('td').eq(1); }

// --------------------
// CATEGORY MAPPING
// --------------------
const EMPcategoryMap = {
    1: ["amateur"], 2: ["anal"], 5: ["asian"], 6: ["bbw"], 30: ["bdsm"],
    36: ["big.ass","big-ass"], 8: ["big.tits","big-tits"], 7: ["black"],
    9: ["classic"], 37: ["creampie"], 10: ["cumshot"], 11: ["dvdr"],
    12: ["fetish"], 14: ["orgy","gangbang"], 39: ["gay"], 56: ["hairy"],
    35: ["hardcore"], 44: ["hd"], 3: ["hentai"], 25: ["homemade"],
    43: ["interracial"], 16: ["latina"], 23: ["lesbian"], 52: ["lingerie"],
    27: ["magazines"], 53: ["comic"], 18: ["masturbation"], 26: ["mature"],
    40: ["mega.pack","megapack"], 41: ["natural.tits","natural-tits"],
    17: ["oral"], 29: ["other"], 47: ["parody"], 24: ["paysite"],
    21: ["images","pictures"], 50: ["piss"], 55: ["porn.music.video","music-video"],
    46: ["pregnant"], 51: ["scat"], 22: ["siterip"], 20: ["softcore"],
    49: ["squirting"], 34: ["straight"], 19: ["teen"],
    15: ["transgender","shemale"], 45: ["voyeur"],
    13: ["games.apps","xxx_games","xxx-games"]
};
const HFcategoryMap = {
    15: ["ai"], 11: ["asian"], 6: ["fansite"], 13: ["games"], 3: ["gay"],
    4: ["interracial"], 5: ["lesbian"], 9: ["packs"], 10: ["pics"],
    1: ["pron"], 8: ["retro"], 14: ["scat"], 12: ["transexual","trans"], 7: ["vr"]
};

let currentCategoryMap = EMPcategoryMap;
if (location.href.includes("emparadise") || location.href.includes("empornium")) {
    currentCategoryMap = EMPcategoryMap;
} else if (location.href.includes("happyfappy")) {
    currentCategoryMap = HFcategoryMap;
}

function getCategoryLink(catName, categoryMap = currentCategoryMap) {
    catName = catName.toLowerCase().trim();
    for (const catID in categoryMap) {
        if (categoryMap[catID].some(n => n.toLowerCase() === catName)) {
            return `/torrents.php?filter_cat[${catID}]=1`;
        }
    }
    return '/torrents.php';
}

// --------------------
// TAG BLACKLIST — HELPERS
// --------------------
function saveTagBlacklist() {
    GM_setValue('TAG_BLACKLIST', JSON.stringify(TAG_BLACKLIST));
}

function getTagsFromRow($row) {
    const tags = [];
    $row.find('div.tags a').each(function () {
        const t = jQuery(this).text().trim().toLowerCase();
        if (t) tags.push(t);
    });
    return tags;
}

function rowMatchesBlacklist($row) {
    if (!TAG_BLACKLIST.length) return false;
    const tags = getTagsFromRow($row);
    return tags.some(t => TAG_BLACKLIST.indexOf(t) !== -1);
}

function toggleTagInBlacklist(tag) {
    tag = tag.toLowerCase().trim();
    const idx = TAG_BLACKLIST.indexOf(tag);
    if (idx === -1) TAG_BLACKLIST.push(tag);
    else TAG_BLACKLIST.splice(idx, 1);
    saveTagBlacklist();
    applyBlacklistsToPage();
    refreshTagSettingsPanel();
}

function applyTagBlacklistToPage() { applyBlacklistsToPage(); } // kept for internal callers

function applyBlacklistsToPage() {
    // Table view: show/hide rows based on BOTH blacklists
    const rowSel = location.pathname.includes('requests.php')
    ? 'tr.rowa, tr.rowb'
    : 'tr.torrent';
    jQuery(rowSel).each(function () {
        const $r = jQuery(this);
        const hide = rowMatchesBlacklist($r) || rowMatchesUploaderBlacklist($r);
        if (hide) {
            $r.addClass('vg-bl-hidden').hide();
            removeGlowFromRow($r);
        } else if ($r.hasClass('vg-bl-hidden')) {
            $r.removeClass('vg-bl-hidden').show();
            if (rowMatchesFavorites($r)) applyGlowToRow($r);
        } else {
            // Row was already visible — still refresh glow state
            if (rowMatchesFavorites($r)) applyGlowToRow($r);
            else removeGlowFromRow($r);
        }
    });
    // Gallery view: rebuild if active
    if (GALLERY_VIEW_MODE && jQuery('.viewer-gallery-grid').length) {
        buildGalleryView();
    }
}

function pageHasTags() {
    return jQuery('div.tags').length > 0;
}

// Refresh the blacklist chip list inside the settings panel
function refreshTagSettingsPanel() {
    const $container = jQuery('#vsm-tag-chips-container');
    if (!$container.length) return;
    $container.empty();
    if (TAG_BLACKLIST.length) {
        TAG_BLACKLIST.forEach(function (tag) {
            const $chip = jQuery('<span class="vsm-bl-chip">').text(tag);
            const $rm   = jQuery('<button type="button" title="Remove">').html('&times;');
            $rm.on('click', function () {
                toggleTagInBlacklist(tag);
            });
            $chip.append($rm);
            $container.append($chip);
        });
    } else {
        $container.append(
            jQuery('<span>').css({ color: '#555', fontSize: '11px' }).text('No tags blacklisted.')
        );
    }
    // Enable/disable add input based on whether the current page has tags
    const hasTags = pageHasTags();
    jQuery('#vsm-tag-add-input, #vsm-tag-add-btn').prop('disabled', !hasTags);
    jQuery('#vsm-tags-disabled-msg').toggle(!hasTags);
}

// --------------------
// UPLOADER BLACKLIST — HELPERS
// --------------------
function saveUploaderBlacklist() {
    GM_setValue('UPLOADER_BLACKLIST', JSON.stringify(UPLOADER_BLACKLIST));
}

// Extract uploader name from a row — column first, overlay script as fallback.
// Returns a lowercase trimmed string, or null if not found / anonymous.
function getUploaderFromRow($row) {
    const ANON = ['anon', 'anonymous', ''];

    // Strategy 1: dedicated uploader column (most pages)
    const cols = getGalleryColOffsets();
    if (cols.uploader >= 0) {
        const $td   = $row.find('> td').eq(cols.uploader);
        // Skip anonymous-upload spans
        if ($td.find('.anon_name').length) return null;
        const $link = $td.find('a').first();
        const name  = ($link.length ? $link.text() : $td.text()).trim().toLowerCase();
        if (name && ANON.indexOf(name) === -1) return name;
    }

    // Strategy 2: parse the overlay var script (collage, notify, subscribed collages)
    // Overlay string contains literal:  Uploader:<\/strong> Username<br \/>
    // The raw script text has the backslash literally, so we match <\/strong>
    const scriptText = $row.find('script').text();
    if (scriptText) {
        const m = scriptText.match(/(?:Uploader|Requester):<\\\/strong>\s*([^<\\]+)/);
        if (m) {
            const name = m[1].trim().toLowerCase();
            if (name && ANON.indexOf(name) === -1) return name;
        }
    }
    return null;
}

function rowMatchesUploaderBlacklist($row) {
    if (!UPLOADER_BLACKLIST.length) return false;
    const uploader = getUploaderFromRow($row);
    return uploader !== null && UPLOADER_BLACKLIST.indexOf(uploader) !== -1;
}

function toggleUploaderInBlacklist(name) {
    name = String(name).toLowerCase().trim();
    if (!name || name === 'anon' || name === 'anonymous') return; // never block anon
    const idx = UPLOADER_BLACKLIST.indexOf(name);
    if (idx === -1) UPLOADER_BLACKLIST.push(name);
    else UPLOADER_BLACKLIST.splice(idx, 1);
    saveUploaderBlacklist();
    applyBlacklistsToPage();
    refreshUploaderSettingsPanel();
}

function refreshUploaderSettingsPanel() {
    const $container = jQuery('#vsm-uploader-chips-container');
    if (!$container.length) return;
    $container.empty();
    if (UPLOADER_BLACKLIST.length) {
        UPLOADER_BLACKLIST.forEach(function (name) {
            const $chip = jQuery('<span class="vsm-bl-chip">').text(name);
            const $rm   = jQuery('<button type="button" title="Remove">').html('&times;');
            $rm.on('click', function () { toggleUploaderInBlacklist(name); });
            $chip.append($rm);
            $container.append($chip);
        });
    } else {
        $container.append(
            jQuery('<span>').css({ color: '#555', fontSize: '11px' }).text('No uploaders blacklisted.')
        );
    }
}

// Adds a ⛔ block button next to the uploader name in the uploader column (table view).
function addUploaderBlockBtnToRow($row) {
    const cols = getGalleryColOffsets();
    if (cols.uploader < 0) return; // page has no uploader column
    const $td = $row.find('> td').eq(cols.uploader);
    if ($td.data('vg-uploader-btn-added')) return;
    $td.data('vg-uploader-btn-added', true);

    const uploader = getUploaderFromRow($row);
    if (!uploader) return;

    const $btn = jQuery('<button class="vg-uploader-block-btn" type="button" title="Block uploader: ' + uploader + '">⛔</button>');
    $btn.on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleUploaderInBlacklist(uploader);
    });
    // Append after the link (or at end of cell)
    const $link = $td.find('a').first();
    if ($link.length) $link.after($btn);
    else $td.append($btn);
}

// --------------------
// FAVORITE TAGS — HELPERS
// --------------------
const GLOW_COLORS = [
    { hex: '#f5c518', name: 'Gold'   },
    { hex: '#00d4ff', name: 'Cyan'   },
    { hex: '#39ff14', name: 'Green'  },
    { hex: '#ff69b4', name: 'Pink'   },
    { hex: '#bf5fff', name: 'Purple' },
    { hex: '#ff8c00', name: 'Orange' },
    { hex: '#ff4444', name: 'Red'    },
    { hex: '#00ffcc', name: 'Teal'   },
    { hex: '#ffffff', name: 'White'  },
];

function saveFavoriteTags() {
    GM_setValue('TAG_FAVORITES', JSON.stringify(TAG_FAVORITES));
}

// Add a tag to favorites, removing from blacklist if present (mutual exclusivity).
function addTagToFavorites(tag) {
    tag = tag.toLowerCase().trim();
    if (!tag) return;
    // Remove from blacklist if present
    const blIdx = TAG_BLACKLIST.indexOf(tag);
    if (blIdx !== -1) { TAG_BLACKLIST.splice(blIdx, 1); saveTagBlacklist(); }
    // Add to favorites if not already there
    if (TAG_FAVORITES.indexOf(tag) === -1) TAG_FAVORITES.push(tag);
    saveFavoriteTags();
    applyBlacklistsToPage();
    applyFavoriteGlowToPage();
}

// Remove a tag from favorites.
function removeTagFromFavorites(tag) {
    tag = tag.toLowerCase().trim();
    const idx = TAG_FAVORITES.indexOf(tag);
    if (idx !== -1) { TAG_FAVORITES.splice(idx, 1); saveFavoriteTags(); }
    applyFavoriteGlowToPage();
}

// Toggle a tag in the favorites list (mutual exclusivity with blacklist).
function toggleTagInFavorites(tag) {
    tag = tag.toLowerCase().trim();
    if (!tag) return;
    if (TAG_FAVORITES.indexOf(tag) !== -1) removeTagFromFavorites(tag);
    else addTagToFavorites(tag);
    refreshFavoriteTagsPanel();
    refreshTagSettingsPanel();
}

function rowMatchesFavorites($row) {
    if (!TAG_FAVORITES.length) return false;
    const tags = getTagsFromRow($row);
    return tags.some(t => TAG_FAVORITES.indexOf(t) !== -1);
}

// Apply glow inline style to a gallery card element.
function applyGlowToCard($card) {
    let c = FAVORITE_GLOW_COLOR || '#ffd700';

    // ensure valid css hex color
    if (typeof c === 'string' && c && !c.startsWith('#')) {
        c = '#' + c;
    }

    $card.css({
        '--vg-glow-c': c,
        'border': `2px solid ${c}`,
        'box-shadow': `
            0 0 5px ${c},
            0 0 10px ${c},
            0 0 15px ${c},
            0 0 25px ${c}
        `
    });

    $card.addClass('vg-fav-match');
}

// Apply glow inline style to a table row.
function applyGlowToRow($row) {
    const c = FAVORITE_GLOW_COLOR;
    const alpha33 = c + '33', alpha66 = c + '55';
    $row.css({
        'box-shadow': 'inset 3px 0 0 0 ' + c + ', 0 0 12px 3px ' + alpha66,
        'background-color': alpha33,
    }).addClass('vg-fav-match').css('--vg-glow-c', c);
}

// Remove glow from a table row.
function removeGlowFromRow($row) {
    $row.css({ 'box-shadow': '', 'background-color': '' }).removeClass('vg-fav-match');
}

// Re-check all visible rows and cards, adding/removing glow.
function applyFavoriteGlowToPage() {
    if (GALLERY_VIEW_MODE && jQuery('.viewer-gallery-grid').length) {
        // Rebuild gallery (it skips blacklisted rows and applies glow via buildGalleryCard)
        buildGalleryView();
        return;
    }
    // Table view
    const rowSel = location.pathname.includes('requests.php') ? 'tr.rowa, tr.rowb' : 'tr.torrent';
    jQuery(rowSel).each(function () {
        const $r = jQuery(this);
        if ($r.hasClass('vg-bl-hidden')) return;
        if (rowMatchesFavorites($r)) applyGlowToRow($r);
        else removeGlowFromRow($r);
    });
}

function refreshFavoriteTagsPanel() {
    const $container = jQuery('#vsm-fav-chips-container');
    if (!$container.length) return;
    $container.empty();
    if (TAG_FAVORITES.length) {
        TAG_FAVORITES.forEach(function (tag) {
            const $chip = jQuery('<span class="vsm-fav-chip">').text(tag);
            const $rm   = jQuery('<button type="button" title="Remove">').html('&times;');
            $rm.on('click', function () { toggleTagInFavorites(tag); });
            $chip.append($rm);
            $container.append($chip);
        });
    } else {
        $container.append(jQuery('<span>').css({ color: '#555', fontSize: '11px' }).text('No favorite tags.'));
    }
    const hasTags = pageHasTags();
    jQuery('#vsm-fav-add-input, #vsm-fav-add-btn').prop('disabled', !hasTags);
    jQuery('#vsm-fav-disabled-msg').toggle(!hasTags);
}

// Build the color swatch grid in the settings panel.
function buildGlowSwatches() {
    const $wrap = jQuery('#vsm-glow-swatches');
    if (!$wrap.length) return;
    $wrap.empty();
    GLOW_COLORS.forEach(function (c) {
        const isSel = c.hex.toLowerCase() === FAVORITE_GLOW_COLOR.toLowerCase();
        const $sw = jQuery('<div class="vsm-glow-swatch' + (isSel ? ' selected' : '') + '">')
        .css({ background: c.hex, 'box-shadow': '0 0 8px 2px ' + c.hex + '88' })
        .attr('title', c.name)
        .on('click', function () {
            FAVORITE_GLOW_COLOR = c.hex;
            GM_setValue('FAVORITE_GLOW_COLOR', c.hex);
            jQuery('.vsm-glow-swatch').removeClass('selected');
            jQuery(this).addClass('selected');
            applyFavoriteGlowToPage();
        });
        $wrap.append($sw);
    });
}
let $tagsPopupEl   = null;
let tagsHideTimer  = null;

function ensureTagsPopup() {
    if ($tagsPopupEl) return;
    $tagsPopupEl = jQuery('<div id="vg-tags-popup">').appendTo('body');
    $tagsPopupEl.on('mouseenter', function () {
        if (tagsHideTimer) { clearTimeout(tagsHideTimer); tagsHideTimer = null; }
    });
    $tagsPopupEl.on('mouseleave', scheduleHideTagsPopup);
}

function scheduleHideTagsPopup() {
    tagsHideTimer = setTimeout(function () {
        if ($tagsPopupEl) $tagsPopupEl.hide();
    }, 200);
}

function showTagsPopup($btn, tags) {
    ensureTagsPopup();
    if (tagsHideTimer) { clearTimeout(tagsHideTimer); tagsHideTimer = null; }

    $tagsPopupEl.empty();

    // Mode hint line
    const modeLabel = TAG_CLICK_ACTION === 'favorite' ? '★ Click to favorite / unfavorite' : '✖ Click to blacklist / unblacklist';
    jQuery('<span class="vg-popup-hint">').text(modeLabel).appendTo($tagsPopupEl);

    tags.forEach(function (tag) {
        const isBl  = TAG_BLACKLIST.indexOf(tag)  !== -1;
        const isFav = TAG_FAVORITES.indexOf(tag)  !== -1;

        let chipClass = 'vg-tag-chip';
        let tipText;
        if (isBl)       { chipClass += ' vg-tag-bl';  tipText = 'Blacklisted — click to remove'; }
        else if (isFav) { chipClass += ' vg-tag-fav'; tipText = 'Favorite — click to remove'; }
        else {
            tipText = TAG_CLICK_ACTION === 'favorite' ? 'Click to add to favorites' : 'Click to blacklist';
        }

        const $chip = jQuery('<span>').addClass(chipClass).text(tag).attr('title', tipText)
        .on('click', function (e) {
            e.stopPropagation();
            if (TAG_CLICK_ACTION === 'favorite') {
                toggleTagInFavorites(tag);
            } else {
                // Blacklist action — also removes from favorites (mutual exclusivity)
                const favIdx = TAG_FAVORITES.indexOf(tag);
                if (favIdx !== -1) { TAG_FAVORITES.splice(favIdx, 1); saveFavoriteTags(); }
                toggleTagInBlacklist(tag);
            }
            // Refresh chip appearance
            const nowBl  = TAG_BLACKLIST.indexOf(tag)  !== -1;
            const nowFav = TAG_FAVORITES.indexOf(tag)  !== -1;
            jQuery(this).removeClass('vg-tag-bl vg-tag-fav');
            if (nowBl)       { jQuery(this).addClass('vg-tag-bl');  jQuery(this).attr('title', 'Blacklisted — click to remove'); }
            else if (nowFav) { jQuery(this).addClass('vg-tag-fav'); jQuery(this).attr('title', 'Favorite — click to remove'); }
            else {
                jQuery(this).attr('title', TAG_CLICK_ACTION === 'favorite' ? 'Click to add to favorites' : 'Click to blacklist');
            }
        });
        $tagsPopupEl.append($chip);
    });

    // Position below the button
    const rect      = $btn[0].getBoundingClientRect();
    const scrollTop = window.pageYOffset  || document.documentElement.scrollTop;
    const scrollLeft= window.pageXOffset  || document.documentElement.scrollLeft;
    $tagsPopupEl.css({ display: 'block', top: (rect.bottom + scrollTop + 4) + 'px', left: (rect.left + scrollLeft) + 'px' });

    // Clamp right edge
    const pr = $tagsPopupEl[0].getBoundingClientRect();
    if (pr.right > window.innerWidth - 10) {
        $tagsPopupEl.css('left', (Math.max(10, window.innerWidth - pr.width - 10) + scrollLeft) + 'px');
    }
}

// --------------------
// CHANGELOG POPUP
// --------------------
function buildChangelogPopup(versionsToShow) {
    // Build version blocks HTML
    const blocksHtml = versionsToShow.map(function (entry) {
        const items = entry.changes.map(c => `<li>${c}</li>`).join('');
        return `
        <div class="vcl-version-block">
            <span class="vcl-version-label">v${entry.version}</span>
            <ul class="vcl-changes">${items}</ul>
        </div>`;
    }).join('');

    const html = `
    <div id="vcl-backdrop">
        <div id="vcl-modal">
            <div class="vcl-header">
                <div class="vcl-header-left">
                    <h2>&#127381; What's New</h2>
                    <span class="vcl-subtitle">[HF][EMP] Advanced Viewer Experience &mdash; updated to v${SCRIPT_VERSION}</span>
                </div>
            </div>
            <div class="vcl-body">${blocksHtml}</div>
            <div class="vcl-footer">
                <a class="vcl-github-link" href="https://github.com/edstagdh/Userscripts" target="_blank">
                    &#128279; View on GitHub
                </a>
                <button class="vcl-ok-btn" id="vcl-ok-btn">OK, got it</button>
            </div>
        </div>
    </div>`;

    jQuery('body').append(html);

    jQuery('#vcl-backdrop').on('click', function (e) { if (e.target === this) dismissChangelog(); });
    jQuery('#vcl-ok-btn').on('click', dismissChangelog);
    jQuery(document).on('keydown.vcl', function (e) { if (e.key === 'Escape') dismissChangelog(); });

    // Show
    jQuery('#vcl-backdrop').addClass('active');
}

function dismissChangelog() {
    jQuery('#vcl-backdrop').removeClass('active');
    GM_setValue('LAST_SEEN_VERSION', SCRIPT_VERSION);
    jQuery(document).off('keydown.vcl');
}

function checkVersionAndShowChangelog() {
    const lastSeen = GM_getValue('LAST_SEEN_VERSION', '');
    if (lastSeen === SCRIPT_VERSION) return; // already seen this version

    // Collect all versions newer than lastSeen (VERSION_HISTORY is newest-first)
    const toShow = [];
    for (let i = 0; i < VERSION_HISTORY.length; i++) {
        if (VERSION_HISTORY[i].version === lastSeen) break; // stop at last seen
        toShow.push(VERSION_HISTORY[i]);
    }

    // First-ever install (lastSeen === '') — only show the current version
    if (!lastSeen) {
        toShow.length = 0;
        toShow.push(VERSION_HISTORY[0]);
    }

    if (!toShow.length) {
        GM_setValue('LAST_SEEN_VERSION', SCRIPT_VERSION);
        return;
    }

    buildChangelogPopup(toShow);
}

// --------------------
// SUBSCRIBED COLLAGES — CATEGORY FETCH HELPERS
// --------------------
function getTorrentIdFromRow($row) {
    const dlHref = $row.find('a[href*="action=download"]').attr('href') || '';
    const m = dlHref.match(/[?&]id=(\d+)/);
    return m ? m[1] : null;
}

function fetchCategoryForTorrent(torrentId, callback) {
    if (subCollagesCatCache.hasOwnProperty(torrentId)) {
        callback(subCollagesCatCache[torrentId]);
        return;
    }
    jQuery.ajax({
        url: '/torrents.php?id=' + torrentId,
        method: 'GET',
        success: function (html) {
            const $page = jQuery(html);
            let catName = '';
            const $catDiv = $page.find('td.cats_col div[title]').first();
            if ($catDiv.length) catName = $catDiv.attr('title') || '';
            if (!catName) {
                const $ci = $page.find('div.cats_icon[title]').first();
                if ($ci.length) catName = $ci.attr('title') || '';
            }
            subCollagesCatCache[torrentId] = catName;
            callback(catName);
        },
        error: function () {
            subCollagesCatCache[torrentId] = '';
            callback('');
        }
    });
}
// --------------------
// BACKEND (table thumbnails only)
// --------------------
function TableThumbnailBackend(isCollage, remove_categories) {
    this.isCollage         = isCollage;
    this.remove_categories = remove_categories;

    this.get_image_src = function ($row) {
        try {
            const scriptText = $row.find('script').text().trim();
            if (!scriptText) return "/static/common/noartwork/noimage.png";
            const match = scriptText.match(/var\s+overlay\d+\s*=\s*"(.*)"/);
            if (!match || match.length < 2) return "/static/common/noartwork/noimage.png";
            let html = match[1].replace(/\\\//g, '/').replace(/\\"/g, '"');
            const safe_html = disable_images(html);
            let src = jQuery('img', safe_html).data('src');
            return src || "/static/common/noartwork/noimage.png";
        } catch (e) {
            console.error(`${LOG_PREFIX} get_image_src error:`, e, $row);
            return "/static/common/noartwork/noimage.png";
        }
    };

    this.attach_image = function ($row, $img) {
        try {
            const $category = $row.find('td.center, td.cats_col').first();
            if (!$category.length) {
                console.error(`${LOG_PREFIX} category row is missing`, $row);
                return;
            }

            if (!isCollage) {
                $category.removeClass('cats_col overlay-category overlay-category-small');
                $category.css({ 'overflow': 'visible', 'white-space': 'normal', 'padding-left': '', 'position': 'relative' });
            }

            let catName = '';
            if (this.remove_categories) {
                $category.find('img[src*="cat_"]').remove();
                $category.find('div[title]').remove();
            } else {
                if (!(location.pathname === "/userhistory.php" && new URLSearchParams(location.search).get("action") === "subscribed_collages")) {
                    let $div = $category.find('div[title]').first();
                    if ($div.length) {
                        catName = $div.attr('title') || '';
                        $div.find('img').remove();
                        if ($div.children().length === 0) $div.remove();
                    }
                    if (isCollage || (location.pathname === "/torrents.php" && new URLSearchParams(location.search).get("action") === "notify")) {
                        let $catImg = $category.children('img').filter((i, el) => /cat_.*\.png$/.test(el.src));
                        if ($catImg.length) {
                            const m = $catImg.attr('src').match(/cat_(.+)\.png$/);
                            if (m) catName = m[1];
                            $catImg.remove();
                        }
                    }
                }
            }

            let $titleLink = '';
            if (location.pathname.includes("requests.php")) {
                $titleLink = $row.find('td').eq(1).find('a[href*="requests.php?action=view&id="]').first();
            } else if (isCollage) {
                $titleLink = $row.find('td').eq(1).find('a[href*="torrents.php?id="]').first();
            } else if (location.pathname === "/userhistory.php" && new URLSearchParams(location.search).get("action") === "subscribed_collages") {
                $titleLink = $row.find('td').eq(2).find('a[href*="torrents.php?id="]').first();
            } else if (location.pathname === "/torrents.php" && new URLSearchParams(location.search).get("action") === "notify") {
                $titleLink = $row.find('td').eq(2).find('a[href*="torrents.php?id="]').first();
            } else {
                $titleLink = $row.find('td').eq(1).find('a[href*="torrents.php?id="]').first();
            }

            let $thumbnail = $img;
            if ($titleLink.length) {
                const $a = jQuery('<a>').attr('href', $titleLink.attr('href')).attr('target', '_blank');
                $a.append($img);
                $thumbnail = $a;
            }

            $category.prepend($thumbnail);
            $thumbnail.css({
                'display': 'block', 'margin': '0 auto 5px',
                'max-width': TABLE_MAX_IMAGE_SIZE + 'px',
                'max-height': TABLE_MAX_IMAGE_SIZE + 'px',
                'position': 'relative', 'z-index': 1
            });

            let $textLink = null;
            if (isCollage) {
                $textLink = $row.find('td').eq(1).find('a[onmouseover]').first();
            } else if (location.pathname === "/torrents.php" && new URLSearchParams(location.search).get("action") === "notify") {
                $textLink = $row.find('td').eq(2).find('a[onmouseover]').first();
            } else if (location.pathname.includes("/top10")) {
                $textLink = $row.find('td').eq(2).find('a[onmouseover]').first();
            } else if (location.pathname.includes("/requests.php")) {
                $textLink = $row.find('td').eq(1).find('a[onmouseover]').first();
            } else if (location.pathname.includes("/userhistory.php")) {
                $textLink = $row.find('td').eq(2).find('a[onmouseover]').first();
            } else {
                $textLink = $row.find('td').eq(1).find('a[onmouseover]').first();
            }
            if ($textLink && $textLink.length) {
                const mo = $textLink.attr('onmouseover');
                const mu = $textLink.attr('onmouseout');
                if (mo) $thumbnail.attr('onmouseover', mo);
                if (mu) $thumbnail.attr('onmouseout',  mu);
            }

            if (catName) {
                const overlayText = String(catName).replace(/\./g, ' ').toUpperCase().trim();
                let catHref = '#';
                const $catDiv = $category.find('div[title]').first();
                if ($catDiv.length) {
                    const $cl = $catDiv.find('a[href]').first();
                    if ($cl.length) catHref = $cl.attr('href');
                }
                const path = location.pathname;
                if (path.includes('/collage') || path.includes('/top10') || path.includes('/userhistory') ||
                    (location.pathname === "/torrents.php" && new URLSearchParams(location.search).get("action") === "notify")) {
                    catHref = getCategoryLink(catName, currentCategoryMap);
                }
                const $link    = jQuery('<a>').text(overlayText).attr('href', catHref).css({ 'color': 'white', 'text-decoration': 'none' });
                const $overlay = jQuery('<div>').css({
                    'position': 'absolute', 'top': '5px', 'left': '5px',
                    'padding': '2px 6px', 'background': 'rgba(0,0,0,0.65)',
                    'color': 'white', 'font-size': '12px', 'font-weight': '700',
                    'line-height': '1.1', 'border-radius': '3px',
                    'z-index': 9999, 'pointer-events': 'auto', 'white-space': 'normal',
                    'max-width': (TABLE_MAX_IMAGE_SIZE - 20) + 'px', 'box-sizing': 'border-box'
                }).append($link);
                $category.css('position', $category.css('position') === 'static' ? 'relative' : $category.css('position'));
                $category.append($overlay);
            }

            if (isCollage) {
                const $title = get_collage_title($row);
                if ($title.length) $title.css({ 'vertical-align': 'top' });
            }
            // Async overlay for subscribed collages (category must be fetched from torrent page)
            if (location.pathname === "/userhistory.php" &&
                new URLSearchParams(location.search).get("action") === "subscribed_collages" &&
                !this.remove_categories) {
                const $catCell   = $category;
                const torrentId  = getTorrentIdFromRow($row);
                if (torrentId) {
                    fetchCategoryForTorrent(torrentId, function (fetchedCatName) {
                        if (!fetchedCatName) return;
                        const overlayText = fetchedCatName.replace(/\./g, ' ').toUpperCase().trim();
                        const catHref = getCategoryLink(fetchedCatName, currentCategoryMap);
                        const $link = jQuery('<a>').text(overlayText).attr('href', catHref)
                        .css({ 'color': 'white', 'text-decoration': 'none' });
                        const $ov = jQuery('<div>').css({
                            'position': 'absolute', 'top': '5px', 'left': '5px',
                            'padding': '2px 6px', 'background': 'rgba(0,0,0,0.65)',
                            'color': 'white', 'font-size': '12px', 'font-weight': '700',
                            'line-height': '1.1', 'border-radius': '3px',
                            'z-index': 9999, 'pointer-events': 'auto', 'white-space': 'normal',
                            'max-width': (TABLE_MAX_IMAGE_SIZE - 20) + 'px', 'box-sizing': 'border-box'
                        }).append($link);
                        $catCell.css('position',
                                     $catCell.css('position') === 'static' ? 'relative' : $catCell.css('position')
                                    );
                        $catCell.append($ov);
                    });
                }
            }
        } catch (e) {
            console.error(`${LOG_PREFIX} attach_image error:`, e, $row, $img);
        }
    };
}

// --------------------
// LAZY THUMBNAILS (table view)
// --------------------
function LazyThumbnails(progress, backend, small_thumbnails, remove_categories, max_image_size) {
    const self = this;
    this.$torrent_table    = null;
    this.attach_image      = backend.attach_image;
    this.get_image_src     = backend.get_image_src;
    this.isCollage         = backend.isCollage;
    this.remove_categories = backend.remove_categories;

    this.create_img = function (src, small) {
        if (!src) return null;
        return jQuery('<img>').data('src', src).css({
            'min-width':  small ? '50px' : max_image_size + 'px',
            'min-height': small ? '50px' : max_image_size + 'px',
            'max-width':  max_image_size + 'px',
            'max-height': max_image_size + 'px',
        });
    };

    this.show_img = function ($img) {
        const src = $img.data('src');
        if (!src) return;
        $img.one('error', function() { this.src = '/static/common/noartwork/noimage.png'; })
            .prop('src', src).css({ 'min-width': '', 'min-height': '' });
    };

    this.fix_title = function ($row) {
        const $title = self.isCollage ? get_collage_title($row) : get_torrent_title($row);
        $title.css({ 'vertical-align': 'top' });
    };

    let observerOptions = null;
    if (IMAGE_LOAD_MODE === "lazy") {
        observerOptions = { root: null, rootMargin: '0px', threshold: 0.1 };
    } else if (IMAGE_LOAD_MODE === "near") {
        observerOptions = { root: null, rootMargin: '150% 0px', threshold: 0.01 };
    }

    this.lazyObserver = observerOptions
        ? new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                self.show_img(jQuery(entry.target));
                self.lazyObserver.unobserve(entry.target);
            }
        });
    }, observerOptions)
    : null;

    this.attach_thumbnails_init = function () {
        try {
            if (location.pathname.includes("requests.php")) {
                self.$torrent_table = jQuery('#request_table, .request_table');
                self.row_selector   = 'tr.rowa, tr.rowb';
            } else {
                self.$torrent_table = jQuery('.torrent_table');
                self.row_selector   = 'tr.torrent';
            }
            if (!self.$torrent_table.length) return;

            const interval = setInterval(() => {
                self.$torrent_table.find(self.row_selector).each(function () {
                    const $row = jQuery(this);
                    if ($row.data('thumbnail-attached')) return;
                    const src  = self.get_image_src($row);
                    if (!src)  return;
                    const $img = self.create_img(src, small_thumbnails);
                    if ($img) {
                        self.attach_image($row, $img);
                        if (IMAGE_LOAD_MODE === "disabled") self.show_img($img);
                        else self.lazyObserver.observe($img[0]);
                    }
                    self.fix_title($row);
                    // Hide row if tags or uploader are blacklisted
                    if (rowMatchesBlacklist($row) || rowMatchesUploaderBlacklist($row)) {
                        $row.addClass('vg-bl-hidden').hide();
                    } else if (rowMatchesFavorites($row)) {
                        applyGlowToRow($row);
                    }
                    // Add ⛔ block button next to uploader name (where column exists)
                    addUploaderBlockBtnToRow($row);
                    $row.data('thumbnail-attached', true);
                });
                if (!self.$torrent_table.find(self.row_selector + ':not([data-thumbnail-attached])').length) {
                    clearInterval(interval);
                }
            }, 200);
        } catch (e) { console.error(`${LOG_PREFIX} attach_thumbnails_init error:`, e); }
    };

    this.attach_thumbnails_init();
}

// --------------------
// INIT
// --------------------
(function init() {
    buildSettingsOverlay();

    jQuery(document).ready(function () {
        injectNavButton();
        checkVersionAndShowChangelog();

        if (GALLERY_VIEW_MODE && !location.pathname.includes('/collage')) {
            setTimeout(buildGalleryView, 150);
        }
    });

    const isCollage = location.pathname.includes("/collage");
    const backend   = new TableThumbnailBackend(isCollage, REMOVE_CATEGORIES);
    globalBackend   = backend;

    if (isCollage) {
        jQuery('.torrent_grid__torrent').each(function() {
            const $torrentDiv = jQuery(this);

            if (REMOVE_MAIN_IMAGES_COLLAGE_PAGE) {
                $torrentDiv.find('.torrent__cover').remove();
                setTimeout(() => {
                    $torrentDiv.find('svg').each(function() { this.setAttribute('viewBox', '0 0 1.5 1'); });
                }, 0);
            } else {
                GM_addStyle(`.torrent__cover {
                    background-size: contain !important;
                    background-repeat: no-repeat !important;
                    background-position: center 30px !important;
                }`);
                if (FIT_VERTICAL_IMAGES_GRID_BETTER === "half") {
                    setTimeout(() => {
                        $torrentDiv.find('svg').each(function() { this.setAttribute('viewBox', '0 0 0.75 1'); });
                    }, 0);
                } else if (FIT_VERTICAL_IMAGES_GRID_BETTER === "full") {
                    setTimeout(() => {
                        $torrentDiv.find('svg').each(function() { this.setAttribute('viewBox', '0 0 0.5 1'); });
                    }, 0);
                }
            }

            if (TRIM_TEXT_COLLAGE_PAGE_MODE === "small_text_wrap") {
                $torrentDiv.find('h3.trim').each(function() {
                    jQuery(this).removeClass('trim').css({ 'white-space': 'normal', 'overflow': 'visible', 'text-overflow': 'clip', 'font-size': '13px', 'line-height': '1.2', 'word-break': 'break-word' });
                });
            } else if (TRIM_TEXT_COLLAGE_PAGE_MODE === "smaller_text_wrap") {
                $torrentDiv.find('h3.trim').each(function() {
                    jQuery(this).removeClass('trim').css({ 'white-space': 'normal', 'overflow': 'visible', 'text-overflow': 'clip', 'font-size': '10px', 'line-height': '1.0', 'word-break': 'break-word' });
                });
            } else if (TRIM_TEXT_COLLAGE_PAGE_MODE === "small_text") {
                $torrentDiv.find('h3.trim').each(function() {
                    jQuery(this).css({ 'font-size': '13px', 'line-height': '1.2' });
                });
            } else if (TRIM_TEXT_COLLAGE_PAGE_MODE === "smaller_text") {
                $torrentDiv.find('h3.trim').each(function() {
                    jQuery(this).css({ 'font-size': '10px', 'line-height': '1.0' });
                });
            }
        });
    }

    window.lazyThumbsInstance = new LazyThumbnails(null, backend, SMALL_THUMBNAILS, REMOVE_CATEGORIES, TABLE_MAX_IMAGE_SIZE);
})();

// --------------------
// OVERLIB POPUP FIX WITH MAX HEIGHT
// --------------------
(function() {
    let mouseX = 0, mouseY = 0;
    document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

    function clampPopup() {
        const outer = document.getElementById('overDiv');
        if (!outer) return;
        const rect = outer.getBoundingClientRect();
        const pad  = 10;
        let left = mouseX + 10, top = mouseY + 10;
        if (left + rect.width  + pad > window.innerWidth)  left = Math.max(pad, window.innerWidth  - rect.width  - pad);
        if (left < pad) left = pad;
        if (top  + rect.height + pad > window.innerHeight) top  = Math.max(pad, window.innerHeight - rect.height - pad);
        if (top  < pad) top  = pad;
        outer.style.position = 'fixed';
        outer.style.left = left + 'px';
        outer.style.top  = top  + 'px';
        const img = outer.querySelector('img');
        if (img) {
            img.style.setProperty('max-width',  '500px', 'important');
            img.style.setProperty('max-height', '500px', 'important');
            img.style.width  = 'auto';
            img.style.height = 'auto';
        }
    }

    const obs = new MutationObserver(() => { requestAnimationFrame(clampPopup); });
    function waitForOverDiv() {
        const outer = document.getElementById('overDiv');
        if (!outer) return requestAnimationFrame(waitForOverDiv);
        obs.observe(outer, { childList: true, subtree: true, attributes: true });
    }
    waitForOverDiv();
})();