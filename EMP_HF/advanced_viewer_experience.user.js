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
// @version     3.13
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
// @grant       GM_xmlhttpRequest
// @grant       GM_registerMenuCommand
// @connect     raw.githubusercontent.com
// @connect     imgbox.com
// @connect     imagebam.com
// @connect     *
// ==/UserScript==


"use strict";

this.$ = this.jQuery = jQuery.noConflict(true);

const LOG_PREFIX = '[TM]';
const USER_SEARCH_COOLDOWN_MS = 30 * 1000;
let lastUserSearchTimestamp = 0;
// --------------------
// VERSION HISTORY
// --------------------
const SCRIPT_VERSION = '3.13';
const CHANGELOG_URL = 'https://raw.githubusercontent.com/edstagdh/Userscripts/refs/heads/master/EMP_HF/AVE_Changelog.md';
let changelogCache = null;
const CHANGELOG_HISTORY_DEPTH = 3; // how many versions to show in the manual "Show Changelog" view

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

// Expiry timestamps (ms since epoch) for timed uploader blocks.
// Names in UPLOADER_BLACKLIST with no entry here are permanent.
const DAY_MS = 24 * 60 * 60 * 1000;
let UPLOADER_BLACKLIST_EXPIRY = {};
(function () {
    try {
        const parsed = JSON.parse(GM_getValue('UPLOADER_BLACKLIST_EXPIRY', '{}'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            Object.keys(parsed).forEach(function (k) {
                const v = Number(parsed[k]);
                if (isFinite(v) && v > 0) UPLOADER_BLACKLIST_EXPIRY[String(k).toLowerCase().trim()] = v;
            });
        }
    } catch (e) { UPLOADER_BLACKLIST_EXPIRY = {}; }
})();

// Per-uploader tag rules: { "<uploader>": { "<tag>": expiryMs | 0 } }  (0 = permanent).
// A tag listed under an uploader only hides items uploaded by THAT uploader.
let UPLOADER_TAG_RULES = {};
(function () {
    try {
        const parsed = JSON.parse(GM_getValue('UPLOADER_TAG_RULES', '{}'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            Object.keys(parsed).forEach(function (u) {
                const uk   = String(u).toLowerCase().trim();
                const tags = parsed[u];
                if (!uk || !tags || typeof tags !== 'object' || Array.isArray(tags)) return;
                Object.keys(tags).forEach(function (t) {
                    const tk  = String(t).toLowerCase().trim();
                    if (!tk) return;
                    const exp = Number(tags[t]);
                    if (!UPLOADER_TAG_RULES[uk]) UPLOADER_TAG_RULES[uk] = {};
                    UPLOADER_TAG_RULES[uk][tk] = (isFinite(exp) && exp > 0) ? exp : 0;
                });
            });
        }
    } catch (e) { UPLOADER_TAG_RULES = {}; }
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
#vsm-uploader-chips-container .vsm-bl-time {
    font-size: 9px; font-weight: 500; opacity: 0.75; margin-left: 2px;
}
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
#vsm-unavail-container {
    padding: 6px 0 4px; display: flex; flex-wrap: wrap; gap: 3px; min-height: 24px;
}
#vsm-unavail-container .vsm-bl-chip {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 10px; font-weight: 600;
    padding: 2px 4px 2px 7px; border-radius: 3px;
    background: #20242c; color: #b8c2d4; border: 1px solid #3a4250;
}
#vsm-unavail-container .vsm-bl-chip a { color: inherit; text-decoration: none; }
#vsm-unavail-container .vsm-bl-chip a:hover { text-decoration: underline; }
#vsm-unavail-container .vsm-bl-time { font-weight: 400; color: #7d8696; }
#vsm-unavail-container .vsm-bl-chip button {
    background: none; border: none; color: #8a93a3;
    font-size: 13px; line-height: 1; cursor: pointer; padding: 0 1px;
}
#vsm-unavail-container .vsm-bl-chip button:hover { color: #fff; }
#vsm-unavail-add-row { display: flex; gap: 6px; align-items: center; padding: 6px 0; }
#vsm-unavail-add-input {
    flex: 1; background: #2b2b2b; border: 1px solid #404040; color: #d0d0d0;
    padding: 3px 7px; border-radius: 3px; font-size: 11px; outline: none;
}
#vsm-unavail-add-input:focus { border-color: #888; }
#vsm-unavail-add-btn, #vsm-unavail-reset-btn { padding: 4px 10px; font-size: 10px; }
.vsm-tags-disabled-note {
    font-size: 10px; color: #555; font-style: italic; padding: 2px 0;
}
`);

// --------------------
// CSS — block duration dialog
// --------------------
GM_addStyle(`
#vbd-backdrop {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.6); z-index: 1000000; backdrop-filter: blur(2px);
}
#vbd-backdrop.active { display: flex; align-items: center; justify-content: center; }
#vbd-modal {
    background: #1e1e1e; border: 1px solid #444; border-radius: 6px;
    width: 320px; max-width: 94vw; color: #d0d0d0; font-size: 12px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.7);
}
#vbd-modal .vbd-header {
    padding: 11px 16px 9px; border-bottom: 1px solid #3a3a3a;
    font-size: 13px; font-weight: 700; color: #e8e8e8;
    text-transform: uppercase; letter-spacing: 0.03em;
}
#vbd-modal .vbd-body { padding: 14px 16px 6px; }
#vbd-modal .vbd-target {
    font-weight: 700; color: #b070e0; margin-bottom: 12px;
    word-break: break-word;
}
#vbd-modal .vbd-label { display: block; color: #999; font-size: 11px; margin-bottom: 5px; }
#vbd-modal select, #vbd-modal input[type="number"] {
    background: #2b2b2b; border: 1px solid #404040; color: #d0d0d0;
    padding: 5px 7px; border-radius: 3px; font-size: 12px; outline: none;
}
#vbd-modal select { width: 100%; }
#vbd-modal select:focus, #vbd-modal input[type="number"]:focus { border-color: #888; }
#vbd-custom-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
#vbd-custom-row input { width: 90px; text-align: center; }
#vbd-modal .vbd-error { min-height: 14px; color: #e06060; font-size: 10px; margin-top: 6px; }
#vbd-modal .vbd-footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 8px 16px 14px;
}
#vbd-modal .vbd-btn {
    padding: 5px 16px; font-size: 11px; font-weight: 600;
    border-radius: 3px; cursor: pointer; border: 1px solid;
}
#vbd-modal .vbd-btn-cancel { background: #2a2a2a; border-color: #444; color: #888; }
#vbd-modal .vbd-btn-cancel:hover { background: #333; color: #bbb; }
#vbd-modal .vbd-btn-ok { background: #3a1f4a; border-color: #7a40a0; color: #c898e8; }
#vbd-modal .vbd-btn-ok:hover { background: #4a2a5e; color: #e0b8ff; }
`);

// --------------------
// CSS — uploader + tag rules
// --------------------
GM_addStyle(`
.vg-tag-chip.vg-tag-ubl {
    background: #102a2e; color: #4fd0e0; border-color: #1f6068;
}
.vg-tag-chip.vg-tag-ubl:hover { background: #143640; color: #7fe6f2; border-color: #2f8a96; }
#vsm-utr-container {
    padding: 6px 0 4px; display: flex; flex-direction: column; gap: 6px; min-height: 24px;
}
#vsm-utr-container .vsm-utr-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
#vsm-utr-container .vsm-utr-user { font-size: 11px; font-weight: 700; color: #b070e0; margin-right: 2px; }
#vsm-utr-container .vsm-utr-chip {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10px; font-weight: 600;
    padding: 2px 4px 2px 7px; border-radius: 3px;
    background: #102a2e; color: #4fd0e0; border: 1px solid #1f6068;
}
#vsm-utr-container .vsm-utr-chip.vsm-utr-shadowed { opacity: 0.55; }
#vsm-utr-container .vsm-utr-chip button {
    background: none; border: none; color: #3fa8b6;
    font-size: 13px; line-height: 1; cursor: pointer;
    padding: 0 1px; margin-left: 1px; transition: color 0.12s;
}
#vsm-utr-container .vsm-utr-chip button:hover { color: #7fe6f2; }
#vsm-utr-container .vsm-bl-time { font-size: 9px; font-weight: 500; opacity: 0.75; margin-left: 2px; }
#vsm-utr-add-row { display: flex; gap: 6px; align-items: center; padding: 6px 0; }
#vsm-utr-add-row input {
    background: #2b2b2b; border: 1px solid #404040; color: #d0d0d0;
    padding: 3px 7px; border-radius: 3px; font-size: 11px; outline: none;
    transition: border-color 0.15s;
}
#vsm-utr-add-row input:focus { border-color: #888; }
#vsm-utr-user-input { width: 120px; }
#vsm-utr-tags-input { flex: 1; min-width: 0; }
#vsm-utr-add-btn, #vsm-utr-clear-btn { padding: 4px 10px; font-size: 10px; }
`);

// --------------------
// CSS — uploader tag-block icon + popup
// --------------------
GM_addStyle(`
.vg-uname, .vg-footer-block-btn, .vg-uploader-block-btn,
.vg-footer-utag-btn, .vg-uploader-utag-btn {
    box-sizing: border-box; height: 18px; margin: 0;
    font-family: Arial, sans-serif; font-size: 11px; font-weight: 700;
    border-radius: 3px; cursor: pointer; opacity: 1 !important;
    vertical-align: middle; white-space: nowrap; text-decoration: none !important;
    transition: background 0.15s, box-shadow 0.15s;
}
.vg-footer-block-btn, .vg-uploader-block-btn,
.vg-footer-utag-btn, .vg-uploader-utag-btn {
    display: inline-flex !important; align-items: center; justify-content: center;
    width: 22px; padding: 0; line-height: 1;
}
.vg-uname {
    display: inline-block !important; max-width: 140px; padding: 0 7px;
    line-height: 16px; overflow: hidden; text-overflow: ellipsis;
}
/* teal: uploader name + tag-block button (muted, brightens on hover) */
.vg-uname, .vg-footer-utag-btn, .vg-uploader-utag-btn {
    color: #6fd6e6 !important; background: #12323a !important;
    border: 1px solid #1f5560 !important; box-shadow: none;
}
.vg-uname:hover, .vg-footer-utag-btn:hover, .vg-uploader-utag-btn:hover {
    color: #9be8f5 !important; background: #174250 !important;
    border-color: #2b7a8a !important;
}
/* red: block-uploader button */
.vg-footer-block-btn, .vg-uploader-block-btn {
    color: #f08080 !important; background: #3a1a1a !important;
    border: 1px solid #6a2a2a !important; box-shadow: none;
}
.vg-footer-block-btn:hover, .vg-uploader-block-btn:hover {
    color: #ff9a9a !important; background: #4a2020 !important;
    border-color: #8a3636 !important;
}
/* blocked uploader (gallery card) */
.vg-uname.vg-uploader-bl {
    background: #3a1414 !important; color: #ff8a8a !important;
    border-color: #883030 !important; box-shadow: none;
    text-decoration: line-through !important;
}
/* list view: the two buttons sit together after the name */
.vg-uploader-btn-group {
    display: inline-flex; align-items: center; gap: 4px;
    margin-left: 6px; vertical-align: middle;
}
#vg-utag-popup {
    display: none; position: absolute; z-index: 999999;
    background: #191919; border: 1px solid #383838; border-radius: 5px;
    padding: 10px 12px; width: 270px; color: #d0d0d0; font-size: 11px;
    box-shadow: 0 6px 22px rgba(0,0,0,0.65);
}
#vg-utag-popup .vut-title {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; color: #888; margin-bottom: 8px;
    padding-bottom: 5px; border-bottom: 1px solid #2a2a2a;
}
#vg-utag-popup .vut-title b { color: #b070e0; text-transform: none; letter-spacing: 0; }
#vg-utag-popup label { display: block; color: #999; font-size: 10px; margin: 6px 0 3px; }
#vg-utag-popup select, #vg-utag-popup input[type="text"] {
    width: 100%; box-sizing: border-box;
    background: #2b2b2b; border: 1px solid #404040; color: #d0d0d0;
    padding: 4px 6px; border-radius: 3px; font-size: 11px; outline: none;
}
#vg-utag-popup select:focus, #vg-utag-popup input[type="text"]:focus { border-color: #888; }
#vg-utag-popup .vut-error { min-height: 13px; color: #e06060; font-size: 10px; margin-top: 4px; }
#vg-utag-popup .vut-btns { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
#vg-utag-popup .vut-btn {
    padding: 4px 12px; font-size: 11px; font-weight: 600;
    border-radius: 3px; cursor: pointer; border: 1px solid;
}
#vg-utag-popup .vut-btn-cancel { background: #2a2a2a; border-color: #444; color: #888; }
#vg-utag-popup .vut-btn-cancel:hover { background: #333; color: #bbb; }
#vg-utag-popup .vut-btn-ok { background: #3a1f4a; border-color: #7a40a0; color: #c898e8; }
#vg-utag-popup .vut-btn-ok:hover { background: #4a2a5e; color: #e0b8ff; }
#vg-utag-popup .vut-existing {
    display: flex; flex-wrap: wrap; align-items: center; gap: 3px;
    margin-top: 8px; padding-top: 6px; border-top: 1px solid #2a2a2a;
}
#vg-utag-popup .vut-existing-label { font-size: 9px; color: #777; text-transform: uppercase; letter-spacing: 0.06em; margin-right: 3px; }
#vg-utag-popup .vut-chip {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10px; font-weight: 600;
    padding: 2px 4px 2px 7px; border-radius: 3px;
    background: #102a2e; color: #4fd0e0; border: 1px solid #1f6068;
}
#vg-utag-popup .vut-chip button {
    background: none; border: none; color: #3fa8b6;
    font-size: 13px; line-height: 1; cursor: pointer; padding: 0 1px;
}
#vg-utag-popup .vut-chip button:hover { color: #7fe6f2; }
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

#vcl-modal .vcl-update-banner {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; color: #f0d080;
    background: #2e2810; border: 1px solid #6a5a1a;
    border-radius: 8px; padding: 8px 10px; margin-bottom: 14px;
}
#vcl-modal .vcl-changelog-loading, #vcl-modal .vcl-changelog-error {
    font-size: 12px; color: #999; padding: 4px 0;
}
#vcl-modal .vcl-changelog-error { color: #d09090; }
#vcl-modal .vcl-version-date { font-size: 10px; color: #777; margin-left: 8px; }
#vcl-modal .vcl-changelog-more {
    font-size: 11px; color: #777; padding: 10px 0 2px;
    border-top: 1px solid #2a2a2a; margin-top: 4px;
}
#vcl-modal .vcl-changelog-more a { color: #5a7a9a; text-decoration: none; }
#vcl-modal .vcl-changelog-more a:hover { color: #7aa0c8; text-decoration: underline; }
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

                <div class="vsm-section" id="vsm-wall-section">
                    <p class="vsm-section-title">Poster Wall</p>
                    ${row('Group Duplicate Images',
                          'Torrents that use the same image link (usually different resolutions) appear as one poster; clicking it lets you pick which torrent to open. Also switchable on the wall with D.',
                          toggle('vsm-WALL_GROUP_DUP_IMAGES', WALL_GROUP_DUP_IMAGES))}
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">"Image unavailable" examples</span>
                        <span class="vsm-hint">Links to images the host has replaced with an "image unavailable" template. Each one is downloaded once to learn the template; posters showing the same template are left out of the wall. Press U on the wall to add the highlighted poster. Changes apply without saving.</span>
                    </div>
                    <div id="vsm-unavail-container"></div>
                    <div id="vsm-unavail-add-row">
                        <input type="text" id="vsm-unavail-add-input" placeholder="https://… (several separated by spaces)" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-unavail-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-unavail-reset-btn" type="button">Defaults</button>
                    </div>
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
                          'What clicking a tag chip in the Tags popup does. Popup shows current mode. Shift+click in blacklist mode blocks the tag for just that uploader. Tags are mutually exclusive between the global lists.',
                          select('vsm-TAG_CLICK_ACTION',
                                 [['blacklist','Blacklist tag (everyone)'],['uploader_tag','Blacklist tag for this uploader only'],['favorite','Add to favorites']],
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
                        <span class="vsm-hint">Rows/cards from blacklisted uploaders are hidden. Click the red ✕ next to an uploader name to block them — you'll be asked for a duration (permanent by default). Timed blocks show their remaining time and expire automatically. Changes apply without saving.</span>
                    </div>
                    <div id="vsm-uploader-chips-container"></div>
                    <div id="vsm-uploader-add-row">
                        <input type="text" id="vsm-uploader-add-input" placeholder="e.g. username123" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-uploader-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-uploader-clear-btn" type="button">Clear all</button>
                    </div>
                </div>

                <div class="vsm-section" id="vsm-utr-section">
                    <p class="vsm-section-title">Uploader + Tag Rules</p>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Tags blocked per uploader</span>
                        <span class="vsm-hint">A tag listed under an uploader hides only items uploaded by that uploader. These rules are checked after the global Tag Blacklist and the Uploader Blacklist, so a tag on the global list always applies to everyone. Separate several tags with spaces or commas. In gallery view you can also Shift+click a tag in the Tags popup.</span>
                    </div>
                    <div id="vsm-utr-container"></div>
                    <div id="vsm-utr-add-row">
                        <input type="text" id="vsm-utr-user-input" placeholder="uploader" autocomplete="off">
                        <input type="text" id="vsm-utr-tags-input" placeholder="e.g. oral  or  big.tits scat" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-utr-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-utr-clear-btn" type="button">Clear all</button>
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

    // Poster Wall settings apply immediately
    jQuery(document).on('change', '#vsm-WALL_GROUP_DUP_IMAGES', function () {
        WALL_GROUP_DUP_IMAGES = this.checked;
        GM_setValue('WALL_GROUP_DUP_IMAGES', WALL_GROUP_DUP_IMAGES);
    });
    const addUnavail = function () {
        const urls = (jQuery('#vsm-unavail-add-input').val() || '').split(/\s+/).filter(u => /^https?:\/\//i.test(u));
        if (!urls.length) return;
        urls.forEach(u => { u = wallAbsUrl(u); if (WALL_UNAVAIL_URLS.indexOf(u) === -1) WALL_UNAVAIL_URLS.push(u); });
        jQuery('#vsm-unavail-add-input').val('');
        wallSaveUnavail();
        refreshUnavailSettingsPanel();
        wallLearnUnavail();
    };
    jQuery(document).on('click', '#vsm-unavail-add-btn', addUnavail);
    jQuery(document).on('keydown', '#vsm-unavail-add-input', function (e) { if (e.key === 'Enter') { e.preventDefault(); addUnavail(); } });
    jQuery(document).on('click', '#vsm-unavail-reset-btn', function () {
        if (!confirm('Replace the "image unavailable" examples with the built-in defaults?')) return;
        WALL_UNAVAIL_URLS = WALL_UNAVAIL_DEFAULT_URLS.slice();
        Object.keys(WALL_UNAVAIL_SIGS).forEach(u => { if (WALL_UNAVAIL_URLS.indexOf(u) === -1) delete WALL_UNAVAIL_SIGS[u]; });
        wallSaveUnavail();
        refreshUnavailSettingsPanel();
        wallLearnUnavail();
    });
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
    // Adding opens the duration dialog; the chosen duration applies to every name entered.
    jQuery(document).on('click', '#vsm-uploader-add-btn', function() {
        const val = jQuery('#vsm-uploader-add-input').val().trim().toLowerCase();
        if (!val) return;
        const names = [];
        val.split(/[\s,]+/).forEach(function(u) {
            u = u.trim();
            if (u && u !== 'anon' && u !== 'anonymous' &&
                names.indexOf(u) === -1 && !isUploaderBlacklisted(u)) names.push(u);
        });
        if (!names.length) { jQuery('#vsm-uploader-add-input').val(''); return; }
        showBlockDurationDialog(names, function (durationMs) {
            names.forEach(n => addUploaderToBlacklist(n, durationMs));
            applyBlacklistsToPage();
            jQuery('#vsm-uploader-add-input').val('');
            refreshUploaderSettingsPanel();
        });
    });
    jQuery(document).on('keydown', '#vsm-uploader-add-input', function(e) {
        if (e.key === 'Enter') jQuery('#vsm-uploader-add-btn').trigger('click');
    });
    jQuery(document).on('click', '#vsm-uploader-clear-btn', function() {
        if (!UPLOADER_BLACKLIST.length) return;
        if (!confirm('Remove all ' + UPLOADER_BLACKLIST.length + ' blacklisted uploader(s)?')) return;
        UPLOADER_BLACKLIST = [];
        UPLOADER_BLACKLIST_EXPIRY = {};
        saveUploaderBlacklist();
        applyBlacklistsToPage();
        refreshUploaderSettingsPanel();
    });

    // Uploader + tag rule handlers
    jQuery(document).on('click', '#vsm-utr-add-btn', function() {
        const uploader = jQuery('#vsm-utr-user-input').val().trim().toLowerCase();
        const raw      = jQuery('#vsm-utr-tags-input').val().trim().toLowerCase();
        if (!uploader || !raw || uploader === 'anon' || uploader === 'anonymous') return;
        const tags = [];
        raw.split(/[\s,]+/).forEach(function (t) {
            t = t.trim();
            if (t && tags.indexOf(t) === -1) tags.push(t);
        });
        if (!tags.length) return;
        showBlockDurationDialog(tags, function (durationMs) {
            tags.forEach(t => addUploaderTagRule(uploader, t, durationMs));
            applyBlacklistsToPage();
            jQuery('#vsm-utr-tags-input').val('');
            refreshUploaderTagRulesPanel();
        }, { title: '\u26D4 Block tags for uploader', target: uploader + ': ' + tags.join(', ') });
    });
    jQuery(document).on('keydown', '#vsm-utr-user-input, #vsm-utr-tags-input', function(e) {
        if (e.key === 'Enter') jQuery('#vsm-utr-add-btn').trigger('click');
    });
    jQuery(document).on('click', '#vsm-utr-clear-btn', function() {
        const n = countUploaderTagRules();
        if (!n) return;
        if (!confirm('Remove all ' + n + ' uploader + tag rule(s)?')) return;
        UPLOADER_TAG_RULES = {};
        saveUploaderTagRules();
        applyBlacklistsToPage();
        refreshUploaderTagRulesPanel();
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
    refreshUploaderTagRulesPanel();
    refreshFavoriteTagsPanel();
    refreshUnavailSettingsPanel();
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

    // Poster Wall: torrent listings only (not collages / requests)
    if (!isCollagePage && !location.pathname.includes('/requests')) {
        const $wallLi = jQuery(`
            <li id="nav_poster_wall" class="brackets">
                <a href="javascript:void(0)" id="poster-wall-open-btn" title="Full-screen endless poster wall">
                    <span class="viewer-gear-icon">&#9638;</span>Wall
                </a>
            </li>
        `);
        $settingsLi.before($wallLi);
        jQuery(document).on('click', '#poster-wall-open-btn', openPosterWall);
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
                const rowUploader = getUploaderFromRow($row);
                $tagsBtn.on('mouseenter', function () { showTagsPopup(jQuery(this), rowTags, rowUploader); });
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
                const isUlBl = isUploaderBlacklisted(uploaderKey);
                const $ulWrap = jQuery('<span style="display:inline-flex;align-items:center;gap:5px;">');
                const $uploaderAnchor = jQuery('<a class="vg-uname">')
                .attr('href', uploaderHref)
                .attr('title', uploaderText)
                .text(uploaderText)
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
                .text('✕');
                $blockBtn.on('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const $btn = jQuery(this);
                    // Opens the duration dialog when blocking; unblocks immediately otherwise
                    toggleUploaderInBlacklist(uploaderKey, function () {
                        const nowBl = isUploaderBlacklisted(uploaderKey);
                        $ulWrap.find('a').toggleClass('vg-uploader-bl', nowBl);
                        $btn.attr('title', nowBl ? 'Blocked — click to unblock ' + uploaderText : 'Block uploader: ' + uploaderText);
                    });
                });
                $ulWrap.append($blockBtn);
                if (uploaderKey !== 'anon' && uploaderKey !== 'anonymous') {
                    const $utagBtn = jQuery('<button class="vg-footer-utag-btn" type="button">')
                    .attr('title', 'Block a tag for ' + uploaderText + ' only')
                    .text('#');
                    $utagBtn.on('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        showUploaderTagPopup(jQuery(this), uploaderKey, rowTags);
                    });
                    $ulWrap.append($utagBtn);
                }
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
            if (rowIsBlacklisted($r)) return; // hidden by a blacklist rule
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
// POSTER WALL — endless 2D grid (Kaleidescape-style)
//
// Full-screen overlay that tiles every torrent image on the page across an
// endless plane. Drag / wheel to glide in any direction, arrows to step,
// click or Enter to open. Rows without an image, or whose image fails to
// load (or is a tiny placeholder), are left out.
//
// Layout: cell (i, j) shows item  (i + j * S) mod N.
// Moving right walks the list in order and wraps around; each row down
// starts S items further on, so neighbours never repeat on screen for a
// normal 100-item page.
// --------------------
const WALL_INVALID_SRC_RE  = /noartwork|noimage/i;
const WALL_MIN_IMG_PX      = 40;      // smaller than this = tracking pixel / placeholder
const WALL_LOAD_GRACE_MS   = 3000;    // open the wall after this even if some images are still downloading
const WALL_MIN_COLS        = 3;
const WALL_MAX_COLS        = 14;
const WALL_ASPECT_ORDER    = ['auto', 'portrait', 'square', 'landscape'];
const WALL_ASPECTS         = { portrait: 2 / 3, square: 1, landscape: 16 / 9 };
const WALL_ASPECT_LABELS   = { auto: 'Auto', portrait: 'Poster', square: 'Square', landscape: 'Wide' };

let WALL_ASPECT       = GM_getValue('WALL_ASPECT', 'auto');
let WALL_FIT          = GM_getValue('WALL_FIT', 'cover');           // 'cover' | 'contain'
let WALL_COLS_VISIBLE = GM_getValue('WALL_COLS_VISIBLE', 7);        // zoom: columns across the screen
let WALL_EDGE_PAN     = GM_getValue('WALL_EDGE_PAN', false);        // glide when the mouse nears an edge
// Torrents sharing one image link become one poster with a picker (usually different resolutions)
let WALL_GROUP_DUP_IMAGES = GM_getValue('WALL_GROUP_DUP_IMAGES', GM_getValue('WALL_SKIP_DUP_IMAGES', true));

// "Image unavailable" placeholders: hosts like imgbox / imagebam keep the original
// link but serve a generic template once an image is removed. We learn what those
// templates look like from example links (size + content fingerprint) and leave out
// any poster that matches. Example links themselves are also blocked outright.
const WALL_UNAVAIL_DEFAULT_URLS = [
    'https://images2.imgbox.com/9c/11/qvDFcYsq_o.jpg',
    'https://images2.imgbox.com/dd/c9/488NiWBY_o.jpg',
    'https://thumbs4.imagebam.com/bc/03/2f/MEOMWT2_t.jpg',
    'https://thumbs4.imagebam.com/8f/59/df/ME1AM82Z_t.jpg',
];
const WALL_DHASH_MAX_DIFF = 5;     // of 64 bits — near-identical structure
const WALL_PX_MEAN_DIFF   = 8;     // 8×8 colour thumbnail: average per-channel difference (0–255)
const WALL_PX_MAX_DIFF    = 48;    // ...and no single cell may differ more than this
let WALL_UNAVAIL_URLS = [];
let WALL_UNAVAIL_SIGS = {};        // url -> { w, h, sha, dh, px }
try { WALL_UNAVAIL_URLS = JSON.parse(GM_getValue('WALL_UNAVAIL_URLS', JSON.stringify(WALL_UNAVAIL_DEFAULT_URLS))) || []; } catch (e) { WALL_UNAVAIL_URLS = WALL_UNAVAIL_DEFAULT_URLS.slice(); }
try { WALL_UNAVAIL_SIGS = JSON.parse(GM_getValue('WALL_UNAVAIL_SIGS', '{}')) || {}; } catch (e) { WALL_UNAVAIL_SIGS = {}; }
Object.keys(WALL_UNAVAIL_SIGS).forEach(u => { if (WALL_UNAVAIL_SIGS[u].px === undefined) delete WALL_UNAVAIL_SIGS[u]; });
const wallUnavailStatus = {};      // url -> 'learning' | 'failed' (this page load only)
const wallFpCache = {};            // src -> Promise<{ w, h, sha, dh } | null>

const wallImageCache = {};   // src -> Promise<{ ok, w, h }>
let wall = null;             // live state while the wall is open
let wallSession = 0;         // bumps on every open/close so late image loads are ignored

GM_addStyle(`
#nav_poster_wall a {
    cursor: pointer; display: flex !important;
    align-items: center; gap: 3px;
    text-decoration: none; white-space: nowrap;
}
#nav_poster_wall a:hover { text-decoration: underline; }
#nav_poster_wall .viewer-gear-icon {
    display: inline-block; font-size: 11px; line-height: 1;
    margin-right: 1px; opacity: 0.9;
}
#vw-wall {
    position: fixed; inset: 0; z-index: 100000;
    background: radial-gradient(ellipse at center, #15171c 0%, #08090b 75%);
    color: #ddd; font-family: inherit; font-size: 13px;
    overflow: hidden; user-select: none; outline: none;
    opacity: 0; transition: opacity .25s ease;
}
#vw-wall.vw-open { opacity: 1; }
#vw-wall .vw-stage { position: absolute; inset: 0; cursor: grab; touch-action: none; overflow: hidden; }
#vw-wall .vw-layer { position: absolute; left: 0; top: 0; will-change: transform; }
#vw-wall.vw-dragging .vw-stage { cursor: grabbing; }
#vw-wall .vw-cell {
    position: absolute; left: 0; top: 0; display: block;
    text-decoration: none !important;
    -webkit-user-drag: none;
}
#vw-wall .vw-poster {
    position: absolute; overflow: hidden; border-radius: 6px;
    background: #1b1d22;
    box-shadow: 0 5px 12px rgba(0,0,0,.5);
    transition: transform .22s cubic-bezier(.2,.8,.3,1), box-shadow .22s ease;
}
/* Dim non-focused posters with a cheap overlay instead of a per-poster CSS filter */
#vw-wall .vw-poster::after {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background: #000; opacity: .18; transition: opacity .22s ease;
}
#vw-wall .vw-cell.vw-focus .vw-poster::after { opacity: 0; }
#vw-wall .vw-poster img {
    width: 100%; height: 100%; display: block;
    object-fit: cover; pointer-events: none;
    transition: opacity .3s ease;
}
#vw-wall.vw-fit-contain .vw-poster img { object-fit: contain; }
#vw-wall .vw-cell.vw-fav .vw-poster { outline: 2px solid var(--vw-fav, #f5c518); outline-offset: -2px; }
#vw-wall .vw-cell.vw-focus { z-index: 2; }
#vw-wall .vw-cell.vw-focus .vw-poster {
    transform: scale(1.09);
    box-shadow: 0 0 0 2px rgba(255,255,255,.85), 0 18px 45px rgba(0,0,0,.8);
}
#vw-wall.vw-dragging .vw-cell.vw-focus .vw-poster { transform: scale(1.03); }
#vw-wall .vw-vignette {
    position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,.8) 100%);
}
#vw-wall .vw-topbar {
    position: absolute; left: 0; right: 0; top: 0; z-index: 5;
    display: flex; align-items: center; gap: 14px;
    padding: 12px 18px 26px;
    background: linear-gradient(to bottom, rgba(0,0,0,.85), rgba(0,0,0,0));
    pointer-events: none;
}
#vw-wall .vw-topbar > * { pointer-events: auto; }
#vw-wall .vw-brand { font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: 12px; color: #f0f0f0; }
#vw-wall .vw-count { color: #8a8f99; font-size: 12px; }
#vw-wall .vw-controls { margin-left: auto; display: flex; align-items: center; gap: 6px; }
#vw-wall .vw-btn {
    background: rgba(255,255,255,.08); color: #ddd;
    border: 1px solid rgba(255,255,255,.14); border-radius: 4px;
    padding: 4px 9px; font: inherit; font-size: 12px; line-height: 1.2;
    cursor: pointer; transition: background .15s, color .15s;
}
#vw-wall .vw-btn:hover { background: rgba(255,255,255,.18); color: #fff; }
#vw-wall .vw-btn.vw-on { background: rgba(120,190,255,.25); border-color: rgba(120,190,255,.55); color: #fff; }
#vw-wall .vw-btn.vw-close { font-size: 15px; padding: 2px 9px; margin-left: 6px; }
#vw-wall .vw-sep { width: 1px; height: 18px; background: rgba(255,255,255,.15); margin: 0 4px; }
#vw-wall .vw-info {
    position: absolute; left: 0; right: 0; bottom: 0; z-index: 5;
    padding: 46px 22px 16px; pointer-events: none;
    background: linear-gradient(to top, rgba(0,0,0,.92), rgba(0,0,0,0));
    opacity: 0; transition: opacity .2s ease;
}
#vw-wall .vw-info.vw-show { opacity: 1; }
#vw-wall .vw-info-title {
    font-size: 17px; font-weight: 600; color: #fff;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    text-shadow: 0 2px 6px rgba(0,0,0,.8);
}
#vw-wall .vw-info-meta { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; }
#vw-wall .vw-chip {
    font-size: 11px; padding: 2px 7px; border-radius: 3px;
    background: rgba(255,255,255,.1); color: #c8ccd4;
}
#vw-wall .vw-chip.vw-seed  { color: #7fd88f; }
#vw-wall .vw-chip.vw-leech { color: #e89a7f; }
#vw-wall .vw-help {
    position: absolute; right: 18px; bottom: 14px; z-index: 6;
    font-size: 11px; color: #6d727c; pointer-events: none;
}
#vw-wall .vw-loading, #vw-wall .vw-empty {
    position: absolute; inset: 0; z-index: 4;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
    color: #aab; font-size: 14px;
}
#vw-wall .vw-bar { width: 260px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.1); overflow: hidden; }
#vw-wall .vw-brand, #vw-wall .vw-btn { white-space: nowrap; flex: none; }
#vw-wall .vw-count { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#vw-wall .vw-controls { flex: none; }
#vw-wall .vw-kbd-hint { font-size: 11px; color: #9aa1ad; white-space: nowrap; cursor: help; }
#vw-wall kbd {
    display: inline-block; min-width: 16px; padding: 1px 5px; margin-right: 3px;
    border: 1px solid rgba(255,255,255,.3); border-bottom-width: 2px; border-radius: 3px;
    background: rgba(255,255,255,.08); color: #fff; font: 600 11px/1.3 inherit; text-align: center;
}
#vw-wall .vw-dup-badge {
    position: absolute; top: 6px; right: 6px; z-index: 1; display: none;
    padding: 1px 6px; border-radius: 10px; font-size: 11px; font-weight: 700;
    background: rgba(0,0,0,.75); color: #fff; border: 1px solid rgba(255,255,255,.35);
}
#vw-wall .vw-cell.vw-has-dups .vw-dup-badge { display: block; }
#vw-wall .vw-chip.vw-dupchip { color: #9fd0ff; }
#vw-wall .vw-chip.vw-res { color: #fff; background: rgba(124,184,255,.3); font-weight: 700; }
#vw-wall .vw-picker-back {
    position: absolute; inset: 0; z-index: 8; background: rgba(0,0,0,.6);
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity .15s ease;
}
#vw-wall .vw-picker-back.vw-show { opacity: 1; }
#vw-wall .vw-picker {
    width: 640px; max-width: calc(100vw - 32px); max-height: 80vh;
    display: flex; flex-direction: column;
    background: #17191e; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
    box-shadow: 0 20px 60px rgba(0,0,0,.7); overflow: hidden;
}
#vw-wall .vw-picker-head {
    display: flex; align-items: center; gap: 14px; padding: 14px 16px;
    border-bottom: 1px solid rgba(255,255,255,.1);
}
#vw-wall .vw-picker-img { width: 72px; height: 72px; object-fit: cover; border-radius: 4px; flex: none; background: #222; }
#vw-wall .vw-picker-heading { flex: 1; min-width: 0; }
#vw-wall .vw-picker-title { font-size: 15px; font-weight: 600; color: #fff; }
#vw-wall .vw-picker-sub { margin-top: 4px; font-size: 11px; color: #8a8f99; }
#vw-wall .vw-picker-list { overflow-y: auto; padding: 6px; }
#vw-wall .vw-pick-row {
    display: block; padding: 9px 11px; border-radius: 5px;
    color: #ddd !important; text-decoration: none !important; border: 1px solid transparent;
}
#vw-wall .vw-pick-row.vw-sel { background: rgba(124,184,255,.14); border-color: rgba(124,184,255,.45); }
#vw-wall .vw-pick-title { font-size: 13px; color: #f0f0f0; word-break: break-word; }
#vw-wall .vw-pick-meta { margin-top: 5px; display: flex; flex-wrap: wrap; gap: 5px; }
#vw-wall .vw-toast {
    position: absolute; left: 50%; top: 62px; z-index: 7; transform: translateX(-50%);
    background: rgba(20,22,27,.95); border: 1px solid rgba(255,255,255,.15); border-radius: 5px;
    padding: 7px 14px; font-size: 12px; color: #e6e6e6; pointer-events: none;
    opacity: 0; transition: opacity .2s ease;
}
#vw-wall .vw-toast.vw-show { opacity: 1; }
/* Page content is hidden (and its images unloaded) while the wall is open */
html.vw-page-suspended body > *:not(#vw-wall) { display: none !important; }
#vw-wall .vw-bar > div { height: 100%; width: 0; background: #7cb8ff; transition: width .15s linear; }
`);

// ── Image probing (cached across opens; timeouts are retried next time) ──
function wallProbeImage(src) {
    if (wallImageCache[src]) return wallImageCache[src];
    wallImageCache[src] = new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            if (img.naturalWidth >= WALL_MIN_IMG_PX && img.naturalHeight >= WALL_MIN_IMG_PX) {
                resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight });
            } else {
                resolve({ ok: false, reason: 'placeholder' });
            }
        };
        img.onerror = () => {
            delete wallImageCache[src];   // could be a network hiccup — retry on next open
            resolve({ ok: false, reason: 'broken' });
        };
        img.src = src;
    });
    return wallImageCache[src];
}

// ── "Image unavailable" placeholder detection ──
function wallAbsUrl(src) {
    try { return new URL(src, location.href).href; } catch (e) { return src; }
}

function wallSaveUnavail() {
    GM_setValue('WALL_UNAVAIL_URLS', JSON.stringify(WALL_UNAVAIL_URLS));
    GM_setValue('WALL_UNAVAIL_SIGS', JSON.stringify(WALL_UNAVAIL_SIGS));
}

function wallIsBlockedUrl(src) {
    return WALL_UNAVAIL_URLS.indexOf(wallAbsUrl(src)) !== -1;
}

function wallBytesToBase64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
}

function wallHamming(a, b) {
    if (!a || !b || a.length !== b.length) return 64;
    let d = 0;
    for (let i = 0; i < a.length; i++) {
        let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
        while (x) { d += x & 1; x >>= 1; }
    }
    return d;
}

// Download an image's bytes (cross-origin, via Tampermonkey) and return its size,
// a SHA-256 of the file and a 64-bit difference hash of a 9×8 grayscale copy.
// Resolves null when it can't be fetched or decoded.
function wallFingerprint(src) {
    const url = wallAbsUrl(src);
    if (wallFpCache[url]) return wallFpCache[url];
    const p = new Promise(resolve => {
        GM_xmlhttpRequest({
            method: 'GET', url, responseType: 'arraybuffer', timeout: 20000,
            headers: { Referer: location.origin + '/' },
            onerror: () => resolve(null),
            ontimeout: () => resolve(null),
            onload: (r) => {
                if (r.status < 200 || r.status >= 400 || !r.response) { resolve(null); return; }
                const bytes = new Uint8Array(r.response);
                const type  = ((r.responseHeaders || '').match(/content-type:\s*([^;\r\n]+)/i) || [])[1] || 'image/jpeg';
                const shaP  = (window.crypto && crypto.subtle)
                    ? crypto.subtle.digest('SHA-256', bytes).then(buf =>
                        Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''))
                        .catch(() => '')
                    : Promise.resolve('');
                const img = new Image();
                img.onerror = () => resolve(null);
                img.onload  = () => {
                    let dh = '', px = '';
                    try {
                        const c = document.createElement('canvas');
                        c.width = 9; c.height = 8;
                        const ctx = c.getContext('2d');
                        ctx.drawImage(img, 0, 0, 9, 8);
                        const d = ctx.getImageData(0, 0, 9, 8).data;
                        const L = (x, y) => { const o = (y * 9 + x) * 4; return d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114; };
                        let bits = '';
                        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += L(x, y) > L(x + 1, y) ? '1' : '0';
                        for (let i = 0; i < 64; i += 4) dh += parseInt(bits.substr(i, 4), 2).toString(16);
                        // 8×8 colour thumbnail: separates pictures whose structure is similar
                        // (e.g. mostly flat) but whose colours / layout differ
                        const c2 = document.createElement('canvas');
                        c2.width = 8; c2.height = 8;
                        const ctx2 = c2.getContext('2d');
                        ctx2.drawImage(img, 0, 0, 8, 8);
                        const d2 = ctx2.getImageData(0, 0, 8, 8).data;
                        for (let i = 0; i < d2.length; i += 4) {
                            for (let ch = 0; ch < 3; ch++) px += d2[i + ch].toString(16).padStart(2, '0');
                        }
                    } catch (e) { dh = ''; px = ''; }   // canvas unavailable: fall back to the file hash alone
                    shaP.then(sha => resolve({ w: img.naturalWidth, h: img.naturalHeight, sha, dh, px }));
                };
                // data: URL keeps the canvas readable (no cross-origin taint)
                img.src = 'data:' + type.trim() + ';base64,' + wallBytesToBase64(bytes);
            },
        });
    });
    wallFpCache[url] = p;
    p.then(v => { if (!v) delete wallFpCache[url]; });   // retry failures later
    return p;
}

// Learn the signature of every example link we haven't fingerprinted yet.
function wallLearnUnavail() {
    const todo = WALL_UNAVAIL_URLS.filter(u => !WALL_UNAVAIL_SIGS[u] && wallUnavailStatus[u] !== 'learning');
    return Promise.all(todo.map(u => {
        wallUnavailStatus[u] = 'learning';
        return wallFingerprint(u).then(fp => {
            if (fp && WALL_UNAVAIL_URLS.indexOf(u) !== -1) {
                WALL_UNAVAIL_SIGS[u] = fp;
                delete wallUnavailStatus[u];
            } else {
                wallUnavailStatus[u] = 'failed';
            }
        });
    })).then(() => { wallSaveUnavail(); refreshUnavailSettingsPanel(); });
}

// Is this (already loaded, w×h) image one of the known placeholders?
// Only images with exactly a placeholder's size are downloaded and compared.
function wallLooksUnavailable(src, w, h) {
    const sigs = Object.keys(WALL_UNAVAIL_SIGS).map(k => WALL_UNAVAIL_SIGS[k]).filter(s => s.w === w && s.h === h);
    if (!sigs.length) return Promise.resolve(false);
    return wallFingerprint(src).then(fp => {
        // The script's download must be the same picture the page shows; if the host
        // served something else (e.g. a hotlink notice), don't guess — keep the poster.
        if (!fp || fp.w !== w || fp.h !== h) return false;
        return sigs.some(sg => wallSigMatches(sg, fp));
    });
}

// Same file, or visually the same picture (structure AND colours) after re-encoding.
function wallSigMatches(sg, fp) {
    if (sg.sha && fp.sha && sg.sha === fp.sha) return true;
    if (!sg.dh || !fp.dh || !sg.px || !fp.px || sg.px.length !== fp.px.length) return false;
    if (wallHamming(sg.dh, fp.dh) > WALL_DHASH_MAX_DIFF) return false;
    let sum = 0, max = 0;
    for (let i = 0; i < sg.px.length; i += 2) {
        const diff = Math.abs(parseInt(sg.px.substr(i, 2), 16) - parseInt(fp.px.substr(i, 2), 16));
        sum += diff;
        if (diff > max) max = diff;
    }
    return sum / (sg.px.length / 2) <= WALL_PX_MEAN_DIFF && max <= WALL_PX_MAX_DIFF;
}

function wallAddUnavailUrl(src) {
    const u = wallAbsUrl(src);
    if (WALL_UNAVAIL_URLS.indexOf(u) === -1) WALL_UNAVAIL_URLS.push(u);
    wallSaveUnavail();
    refreshUnavailSettingsPanel();
    return wallLearnUnavail().then(() => WALL_UNAVAIL_SIGS[u] || null);
}

function wallRemoveUnavailUrl(u) {
    WALL_UNAVAIL_URLS = WALL_UNAVAIL_URLS.filter(x => x !== u);
    delete WALL_UNAVAIL_SIGS[u];
    delete wallUnavailStatus[u];
    wallSaveUnavail();
    refreshUnavailSettingsPanel();
}

function refreshUnavailSettingsPanel() {
    const $c = jQuery('#vsm-unavail-container');
    if (!$c.length) return;
    $c.empty();
    if (!WALL_UNAVAIL_URLS.length) {
        $c.append(jQuery('<span>').css({ color: '#555', fontSize: '11px' }).text('No example images.'));
        return;
    }
    WALL_UNAVAIL_URLS.forEach(u => {
        const sig = WALL_UNAVAIL_SIGS[u];
        const st  = wallUnavailStatus[u];
        let short = u;
        try { const x = new URL(u); short = x.hostname.replace(/^www\./, '') + '/…/' + x.pathname.split('/').pop(); } catch (e) {}
        const $chip = jQuery('<span class="vsm-bl-chip">');
        jQuery('<a target="_blank" rel="noopener">').attr('href', u).attr('title', u).text(short).appendTo($chip);
        const status = sig ? `${sig.w}×${sig.h}` : (st === 'failed' ? 'could not fetch' : 'learning…');
        jQuery('<span class="vsm-bl-time">').text('· ' + status)
            .attr('title', sig ? 'Learned — matching images are left out of the wall'
                               : (st === 'failed' ? 'Only this exact link is blocked until it can be fetched (retried on next wall open)' : ''))
            .appendTo($chip);
        jQuery('<button type="button" title="Remove">').html('&times;')
            .on('click', () => wallRemoveUnavailUrl(u)).appendTo($chip);
        $c.append($chip);
    });
}

// ── Gather torrents from every table on the page (respects blacklists) ──
function wallCollectItems() {
    const cols  = getGalleryColOffsets();
    const items = [];
    const seen  = new Set();
    const stats = { rows: 0, blacklisted: 0, noImage: 0, noLink: 0, duplicate: 0, blockedUrl: 0 };

    jQuery('.torrent_table tr.torrent').each(function () {
        const $row = jQuery(this);
        stats.rows++;
        if (rowIsBlacklisted($row)) { stats.blacklisted++; return; }

        const src = globalBackend ? globalBackend.get_image_src($row) : '';
        if (!src || WALL_INVALID_SRC_RE.test(src)) { stats.noImage++; return; }

        const $tds  = $row.find('> td');
        let $link = $tds.eq(cols.title).find('a[href*="torrents.php?id="]').first();
        if (!$link.length) $link = $row.find('a[href*="torrents.php?id="]').not('[href*="action="]').first();
        if (!$link.length) { stats.noLink++; return; }
        const href = $link.attr('href');
        if (seen.has(href)) { stats.duplicate++; return; }
        seen.add(href);

        if (wallIsBlockedUrl(src)) { stats.blockedUrl++; return; }
        const absSrc = wallAbsUrl(src);

        const td = (i) => (i >= 0 ? $tds.eq(i).text().replace(/\s+/g, ' ').trim() : '');

        let cat = '';
        if (cols.cat >= 0) {
            const $catTd = $tds.eq(cols.cat);
            cat = $catTd.find('div[title]').first().attr('title') || '';
            if (!cat) cat = $catTd.find('div[style*="position: absolute"]').first().text().trim();
        }

        let fav = false;
        try { fav = rowMatchesFavorites($row); } catch (e) { /* favorites optional */ }

        items.push({
            src, href, cat, fav,
            title:    $link.text().trim(),
            size:     td(cols.size),
            seeders:  td(cols.seeders),
            leechers: td(cols.leechers),
            time:     td(cols.time),
            absSrc,
            state:    'loading',   // 'loading' | 'ok' | 'failed'
            group:    null,        // display leader: every torrent sharing this image
        });
    });
    return { items, stats };
}

// ── Page suspend / restore ──
// While the wall is open, every page image is swapped for a 1x1 blank (freeing its
// decoded pixels) and the page content is hidden (no layout / paint / observers).
// Everything is put back on close; the images come straight from the browser cache.
const WALL_BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function wallSuspendPage() {
    const saved = { scrollX: window.scrollX, scrollY: window.scrollY, imgs: [] };
    document.querySelectorAll('body img').forEach(img => {
        if (img.closest('#vw-wall')) return;
        const src = img.getAttribute('src');
        if (!src || src === WALL_BLANK_IMG) return;
        saved.imgs.push([img, src, img.getAttribute('srcset')]);
        if (img.hasAttribute('srcset')) img.removeAttribute('srcset');
        img.setAttribute('src', WALL_BLANK_IMG);
    });
    document.documentElement.classList.add('vw-page-suspended');
    return saved;
}

function wallRestorePage(saved) {
    document.documentElement.classList.remove('vw-page-suspended');
    if (!saved) return;
    saved.imgs.forEach(([img, src, srcset]) => {
        if (img.getAttribute('src') !== WALL_BLANK_IMG) return;   // changed by the page meanwhile
        if (srcset) img.setAttribute('srcset', srcset);
        img.setAttribute('src', src);
    });
    window.scrollTo(saved.scrollX, saved.scrollY);
}

// ── Open / close ──
function openPosterWall() {
    if (wall) return;
    const session = ++wallSession;
    const collected  = wallCollectItems();
    const candidates = collected.items;

    const $root = jQuery(`
        <div id="vw-wall" tabindex="-1">
            <div class="vw-stage"><div class="vw-layer"></div></div>
            <div class="vw-vignette"></div>
            <div class="vw-topbar">
                <span class="vw-brand">&#9638; Poster Wall</span>
                <span class="vw-count"></span>
                <div class="vw-controls">
                    <button class="vw-btn" data-act="zoom-out" title="Smaller (−)">&minus;</button>
                    <button class="vw-btn" data-act="zoom-in"  title="Larger (+)">+</button>
                    <span class="vw-sep"></span>
                    <button class="vw-btn" data-act="aspect" title="Cell shape (A)"></button>
                    <button class="vw-btn" data-act="fit"    title="Fill or fit images (F)"></button>
                    <button class="vw-btn" data-act="edge"   title="Glide when the mouse nears an edge (E)">Edge glide</button>
                    <button class="vw-btn" data-act="dups"   title="Group torrents that share an image into one poster (D)"></button>
                    <span class="vw-sep"></span>
                    <span class="vw-kbd-hint" title="Hover a poster showing an 'image unavailable' template and press U. No clicking needed, so the highlight stays on that poster."><kbd>U</kbd> mark hovered as unavailable</span>
                    <button class="vw-btn vw-close" data-act="close" title="Close (Esc)">&times;</button>
                </div>
            </div>
            <div class="vw-info"><div class="vw-info-title"></div><div class="vw-info-meta"></div></div>
            <div class="vw-help">Drag or scroll to glide &middot; Shift+wheel sideways &middot; Ctrl+wheel to resize &middot; Arrows step &middot; Enter opens &middot; D groups duplicates &middot; Esc closes</div>
            <div class="vw-loading"><div class="vw-loading-text">Loading posters&hellip;</div><div class="vw-bar"><div></div></div></div>
        </div>
    `);
    jQuery('body').append($root);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const pageState = wallSuspendPage();
    requestAnimationFrame(() => $root.addClass('vw-open'));
    $root[0].focus();

    wall = {
        session, $root, prevOverflow, pageState,
        root:  $root[0],
        stage: $root.find('.vw-stage')[0],
        layer: $root.find('.vw-layer')[0],
        oi: 0, oj: 0,             // layer origin cell (cells are placed relative to it)
        relayout: false,          // cell size changed: reposition every live cell
        focusEl: null,
        items: [], N: 0, S: 1,
        cu: 0, cv: 0,             // camera centre, in cell units
        pw: 1, ph: 1, gap: 8,     // cell pitch / gap, in px
        vx: 0, vy: 0,             // inertia, in px per frame
        wheelX: 0, wheelY: 0,     // pending smooth-wheel distance, in px
        tween: null,              // { u, v } camera target for keyboard steps
        cells: new Map(), pool: [],
        focusI: 0, focusJ: 0, focusKey: '',
        mouseX: -1, mouseY: -1, mouseIn: false, overUi: false, keyboardMode: false,
        drag: null, suppressClick: false,
        dirty: true, raf: 0, ready: false, autoAspect: 2 / 3,
        stats: collected.stats, broken: 0, placeholder: 0, unavailable: 0, loading: candidates.length,
        all: candidates, dupGrouped: 0, picker: null,
    };
    // Learn any example placeholder links not fingerprinted yet (bounded wait)
    const sigsReady = Promise.race([wallLearnUnavail(), new Promise(r => setTimeout(r, 8000))]);

    wallBindEvents();
    wallUpdateToolbar();

    if (!candidates.length) { wallLogStats(); wallShowEmpty('No torrents with images on this page.'); return; }

    // Probe every image. Only real failures (broken link / tiny placeholder) are dropped;
    // slow images are never dropped — after a short grace period the wall opens and
    // those posters simply fill in as they finish downloading.
    let settled = 0;
    let started = false;
    const $txt = $root.find('.vw-loading-text');
    const $bar = $root.find('.vw-bar > div');
    const update = () => {
        $txt.text(`Loading posters… ${settled} / ${candidates.length}`);
        $bar.css('width', (settled / candidates.length * 100) + '%');
    };
    update();

    const startNow = () => {
        if (started || !wall || wall.session !== session) return;
        started = true;
        clearTimeout(graceTimer);
        $root.find('.vw-loading').remove();
        if (!candidates.some(it => it.state !== 'failed')) { wallLogStats(); wallShowEmpty('None of the torrents on this page have a loadable image.'); return; }
        wallStart();
    };
    const graceTimer = setTimeout(startNow, WALL_LOAD_GRACE_MS);

    // Request the posters that will be on screen first: the browser only opens a few
    // connections per image host, so issue order decides what appears first.
    const firstView = [];
    const S0 = wallRowShift(candidates.length);
    for (let j = -1; j <= 4; j++) for (let i = -1; i <= WALL_COLS_VISIBLE + 1; i++) {
        const k = (((i + j * S0) % candidates.length) + candidates.length) % candidates.length;
        if (firstView.indexOf(k) < 0) firstView.push(k);
    }
    const order = firstView.concat(candidates.map((_, k) => k).filter(k => firstView.indexOf(k) < 0));

    order.map(k => candidates[k]).forEach(item => {
        wallProbeImage(item.src).then(res => !res.ok ? res : sigsReady
            .then(() => wallLooksUnavailable(item.src, res.w, res.h))
            .then(un => (un ? { ok: false, reason: 'unavailable' } : res))
        ).then(res => {
            if (!wall || wall.session !== session) return;
            settled++;
            wall.loading--;
            if (res.ok) {
                item.state = 'ok'; item.w = res.w; item.h = res.h;
            } else {
                item.state = 'failed';
                wall[res.reason === 'placeholder' ? 'placeholder' : res.reason === 'unavailable' ? 'unavailable' : 'broken']++;
                if (started) wallRebuild();
            }
            if (!started) {
                update();
                if (settled === candidates.length) startNow();
            } else {
                wallUpdateCount();
                if (!wall.loading) wallLogStats();
            }
        });
    });
}

function closePosterWall() {
    if (!wall) return;
    wallSession++;
    cancelAnimationFrame(wall.raf);
    jQuery(window).off('.vwall');
    document.removeEventListener('keydown', wallOnKey, true);
    wallRestorePage(wall.pageState);
    document.documentElement.style.overflow = wall.prevOverflow;
    const $root = wall.$root;
    wall = null;
    $root.removeClass('vw-open');
    setTimeout(() => $root.remove(), 250);
}

function wallShowEmpty(msg) {
    wall.$root.find('.vw-loading').remove();
    wall.$root.append(jQuery('<div class="vw-empty">').text(msg));
}

// Work out what's on the wall from every collected torrent: failed images out,
// and (when grouping) torrents sharing an image link folded into one poster.
function wallBuildDisplay() {
    const live = wall.all.filter(it => it.state !== 'failed');
    live.forEach(it => { it.group = null; });
    let display = live;
    if (WALL_GROUP_DUP_IMAGES) {
        const leaders = new Map();
        display = [];
        live.forEach(it => {
            const lead = leaders.get(it.absSrc);
            if (lead) { lead.group.push(it); return; }
            it.group = [it];
            leaders.set(it.absSrc, it);
            display.push(it);
        });
    } else {
        live.forEach(it => { it.group = [it]; });
    }
    wall.items = display;
    wall.N     = display.length;
    wall.S     = wallRowShift(display.length);
    wall.dupGrouped = live.length - display.length;
}

// Re-flow after the set of posters changed (late failure, marked unavailable, grouping toggled)
function wallRebuild() {
    if (!wall || !wall.ready) return;
    wallBuildDisplay();
    wallUpdateCount();
    if (!wall.N) { wall.ready = false; wallClosePicker(); wallShowEmpty('None of the torrents on this page have a loadable image.'); return; }
    // Every cell's item may have shifted: recycle them all so they rebind
    wall.cells.forEach(el => {
        el.style.display = 'none';
        el.dataset.idx = '';
        el.classList.remove('vw-focus');
        wall.pool.push(el);
    });
    wall.cells.clear();
    wall.focusEl = null;
    wall.focusKey = '';
    wall.dirty = true;
    wallKick();
}

function wallStart() {
    wallBuildDisplay();
    const items = wall.items;

    // Auto cell shape: closest preset to the median ratio of the images loaded so far
    const ratios = items.filter(it => it.w && it.h).map(it => it.w / it.h).sort((a, b) => a - b);
    let best = 'portrait';
    if (ratios.length) {
        const median = ratios[Math.floor(ratios.length / 2)];
        Object.keys(WALL_ASPECTS).forEach(k => {
            if (Math.abs(Math.log(WALL_ASPECTS[k] / median)) < Math.abs(Math.log(WALL_ASPECTS[best] / median))) best = k;
        });
    }
    wall.autoAspect = WALL_ASPECTS[best];

    wallUpdateCount();
    if (!wall.loading) wallLogStats();

    wallLayout();
    // Start with item 0 near the top-left, with the wrapped neighbours peeking in at the edges
    wall.cu = window.innerWidth  / 2 / wall.pw - 0.35;
    wall.cv = window.innerHeight / 2 / wall.ph - 0.25;
    wall.focusI = 0; wall.focusJ = 0;
    wall.ready = true;
    wall.dirty = true;
    wallUpdateToolbar();
    wallKick();
}

function wallRowShift(n) {
    return Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * 1.6))));
}

function wallUpdateCount() {
    const parts = [wall.dupGrouped
        ? `${wall.N} posters (${wall.N + wall.dupGrouped} torrents, ${wall.dupGrouped} sharing an image)`
        : `${wall.N} torrents`];
    if (wall.loading)     parts.push(`${wall.loading} still loading`);
    if (wall.broken)      parts.push(`${wall.broken} broken image${wall.broken > 1 ? 's' : ''} skipped`);
    if (wall.placeholder) parts.push(`${wall.placeholder} placeholder${wall.placeholder > 1 ? 's' : ''} skipped`);
    const unav = wall.unavailable + wall.stats.blockedUrl;
    if (unav)             parts.push(`${unav} "unavailable" image${unav > 1 ? 's' : ''} skipped`);
    const noImg = wall.stats.noImage;
    if (noImg)            parts.push(`${noImg} without an image`);
    wall.$root.find('.vw-count').text(parts.join(' · ')).attr('title', parts.join('\n'));
}

function wallLogStats() {
    const st = wall.stats;
    console.log(`${LOG_PREFIX} Poster Wall: ${st.rows} rows → ${wall.N} shown | ` +
        `blacklisted ${st.blacklisted}, no image ${st.noImage}, no title link ${st.noLink}, duplicates ${st.duplicate}, ` +
        `grouped under a shared image ${wall.dupGrouped}, blocked links ${st.blockedUrl}, ` +
        `broken ${wall.broken}, placeholder ${wall.placeholder}, unavailable ${wall.unavailable}, still loading ${wall.loading}`);
}

// ── Geometry ──
function wallAspect() {
    return WALL_ASPECT === 'auto' ? wall.autoAspect : (WALL_ASPECTS[WALL_ASPECT] || 2 / 3);
}

function wallLayout() {
    const W = window.innerWidth;
    wall.pw  = W / WALL_COLS_VISIBLE;
    wall.gap = Math.max(6, Math.round(wall.pw * 0.045));
    wall.ph  = (wall.pw - wall.gap) / wallAspect() + wall.gap;
    // Cell sizes changed: resize every live cell
    wall.cells.forEach(el => wallSizeCell(el));
    wall.pool.forEach(el => wallSizeCell(el));
    wall.relayout = true;
    wall.dirty = true;
    wallKick();
}

function wallSizeCell(el) {
    const p = el.firstChild;
    const half = wall.gap / 2;
    p.style.left   = half + 'px';
    p.style.top    = half + 'px';
    p.style.width  = (wall.pw - wall.gap) + 'px';
    p.style.height = (wall.ph - wall.gap) + 'px';
}

function wallIndex(i, j) {
    const n = wall.N;
    return (((i + j * wall.S) % n) + n) % n;
}

function wallMakeCell() {
    const a = document.createElement('a');
    a.className = 'vw-cell';
    a.target = '_blank';
    a.draggable = false;
    const p = document.createElement('div');
    p.className = 'vw-poster';
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.onload = () => { img.style.opacity = ''; };
    p.appendChild(img);
    const badge = document.createElement('span');
    badge.className = 'vw-dup-badge';
    p.appendChild(badge);
    a.appendChild(p);
    wallSizeCell(a);
    return a;
}

// ── Render: place only the cells that intersect the viewport ──
// Cells sit at fixed positions inside one layer; moving the camera only changes
// that layer's transform (a single compositor update per frame). Cells are only
// touched when they scroll into view.
function wallPlaceCell(el, i, j) {
    el.style.transform = `translate(${((i - wall.oi) * wall.pw).toFixed(2)}px, ${((j - wall.oj) * wall.ph).toFixed(2)}px)`;
}

function wallRender() {
    const W = window.innerWidth, H = window.innerHeight;
    const pw = wall.pw, ph = wall.ph;
    const left = wall.cu * pw - W / 2;
    const top  = wall.cv * ph - H / 2;
    const i0 = Math.floor(left / pw) - 1, i1 = Math.floor((left + W) / pw) + 1;
    const j0 = Math.floor(top  / ph) - 1, j1 = Math.floor((top  + H) / ph) + 1;

    // Re-anchor the layer if we've travelled far, so pixel offsets stay small
    if (Math.abs(i0 - wall.oi) > 500 || Math.abs(j0 - wall.oj) > 500) {
        wall.oi = i0; wall.oj = j0; wall.relayout = true;
    }
    if (wall.relayout) {
        wall.relayout = false;
        wall.cells.forEach(el => wallPlaceCell(el, +el.dataset.i, +el.dataset.j));
    }

    const wanted = new Set();
    for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
            const key = i + ',' + j;
            wanted.add(key);
            if (wall.cells.has(key)) continue;
            const el   = wall.pool.pop() || wallMakeCell();
            const idx  = wallIndex(i, j);
            const item = wall.items[idx];
            if (el.dataset.idx !== String(idx)) {
                el.dataset.idx = idx;
                el.href = item.href;
                const img = el.firstChild.firstChild;
                img.src = item.src;
                // Hide until this poster's own image is ready (never flash the previous one)
                img.style.opacity = (img.complete && img.naturalWidth) ? '' : '0';
                el.classList.toggle('vw-fav', !!item.fav);
                const n = item.group ? item.group.length : 1;
                el.classList.toggle('vw-has-dups', n > 1);
                img.nextSibling.textContent = n > 1 ? '×' + n : '';
                if (item.fav) el.style.setProperty('--vw-fav', FAVORITE_GLOW_COLOR || '#f5c518');
            }
            el.dataset.i = i;
            el.dataset.j = j;
            el.style.display = '';
            wallPlaceCell(el, i, j);
            if (!el.parentNode) wall.layer.appendChild(el);
            wall.cells.set(key, el);
        }
    }
    // Recycle cells that scrolled out of view
    wall.cells.forEach((el, key) => {
        if (wanted.has(key)) return;
        wall.cells.delete(key);
        el.style.display = 'none';
        if (el === wall.focusEl) { el.classList.remove('vw-focus'); wall.focusEl = null; }
        wall.pool.push(el);
    });

    wall.layer.style.transform = `translate3d(${(wall.oi * pw - left).toFixed(2)}px, ${(wall.oj * ph - top).toFixed(2)}px, 0)`;

    // Focus highlight — only touch the two cells that change
    const fKey = wall.focusI + ',' + wall.focusJ;
    const fEl  = wall.cells.get(fKey) || null;
    if (fEl !== wall.focusEl) {
        if (wall.focusEl) wall.focusEl.classList.remove('vw-focus');
        if (fEl) fEl.classList.add('vw-focus');
        wall.focusEl = fEl;
    }
    if (fKey !== wall.focusKey) {
        wall.focusKey = fKey;
        wallUpdateInfo();
    }
}

function wallUpdateInfo() {
    const $info = wall.$root.find('.vw-info');
    if (!wall.ready) { $info.removeClass('vw-show'); return; }
    const item = wall.items[wallIndex(wall.focusI, wall.focusJ)];
    $info.find('.vw-info-title').text(item.title);
    const $meta = $info.find('.vw-info-meta').empty();
    const chip = (text, cls) => { if (text) $meta.append(jQuery('<span class="vw-chip">').addClass(cls || '').text(text)); };
    chip(item.cat);
    chip(item.size);
    chip(item.time);
    if (item.seeders)  chip('▲ ' + item.seeders,  'vw-seed');
    if (item.leechers) chip('▼ ' + item.leechers, 'vw-leech');
    if (item.fav)      chip('★ favorite tag');
    if (item.group && item.group.length > 1) chip(`⧉ ${item.group.length} torrents share this image — click to choose`, 'vw-dupchip');
    $info.addClass('vw-show');
}

// ── Animation loop: inertia, smooth wheel, keyboard tween, edge glide ──
// Runs only while something moves; input handlers restart it with wallKick().
function wallKick() {
    if (wall && wall.ready && !wall.raf) wall.raf = requestAnimationFrame(wallTick);
}

function wallTick() {
    if (!wall) return;
    wall.raf = 0;
    if (!wall.ready) return;

    let moved = false;

    if (!wall.drag) {
        // Inertia after a fling
        if (Math.abs(wall.vx) > 0.05 || Math.abs(wall.vy) > 0.05) {
            wall.cu -= wall.vx / wall.pw;
            wall.cv -= wall.vy / wall.ph;
            wall.vx *= 0.94;
            wall.vy *= 0.94;
            moved = true;
        } else { wall.vx = wall.vy = 0; }

        // Smooth wheel: consume a fraction of the pending distance each frame
        if (Math.abs(wall.wheelX) > 0.3 || Math.abs(wall.wheelY) > 0.3) {
            const sx = wall.wheelX * 0.22, sy = wall.wheelY * 0.22;
            wall.cu += sx / wall.pw;
            wall.cv += sy / wall.ph;
            wall.wheelX -= sx;
            wall.wheelY -= sy;
            moved = true;
        } else { wall.wheelX = wall.wheelY = 0; }

        // Keyboard step tween
        if (wall.tween) {
            const du = wall.tween.u - wall.cu, dv = wall.tween.v - wall.cv;
            if (Math.abs(du) < 0.002 && Math.abs(dv) < 0.002) {
                wall.cu = wall.tween.u; wall.cv = wall.tween.v; wall.tween = null;
            } else {
                wall.cu += du * 0.18; wall.cv += dv * 0.18;
            }
            moved = true;
        }

        // Edge glide
        if (WALL_EDGE_PAN && wall.mouseIn && !wall.overUi) {
            const W = window.innerWidth, H = window.innerHeight;
            const zx = W * 0.09, zy = H * 0.11;
            const ramp = (d, z) => (d < z ? (1 - d / z) : 0);
            const gx = ramp(wall.mouseX, zx) * -1 + ramp(W - wall.mouseX, zx);
            const gy = ramp(wall.mouseY, zy) * -1 + ramp(H - wall.mouseY, zy);
            if (gx || gy) {
                const speed = 14;   // px per frame at the very edge
                wall.cu += gx * Math.abs(gx) * speed / wall.pw;
                wall.cv += gy * Math.abs(gy) * speed / wall.ph;
                moved = true;
            }
        }
    }

    if (moved) {
        wall.dirty = true;
        // Hover focus follows the content moving under a still mouse
        if (!wall.drag && !wall.tween && wall.mouseIn && !wall.keyboardMode) wallFocusAtMouse();
    }
    if (wall.dirty) { wall.dirty = false; wallRender(); }
    if (moved) wallKick();   // keep going until everything settles
}

function wallCellAt(x, y) {
    const W = window.innerWidth, H = window.innerHeight;
    const wx = wall.cu * wall.pw - W / 2 + x;
    const wy = wall.cv * wall.ph - H / 2 + y;
    return { i: Math.floor(wx / wall.pw), j: Math.floor(wy / wall.ph) };
}

function wallFocusAtMouse() {
    if (wall.mouseY < 0) return;
    const c = wallCellAt(wall.mouseX, wall.mouseY);
    if (c.i !== wall.focusI || c.j !== wall.focusJ) {
        wall.focusI = c.i; wall.focusJ = c.j; wall.dirty = true;
    }
}

function wallZoom(dir, anchorX, anchorY) {
    const next = Math.max(WALL_MIN_COLS, Math.min(WALL_MAX_COLS, WALL_COLS_VISIBLE + (dir > 0 ? -1 : 1)));
    if (next === WALL_COLS_VISIBLE) return;
    // Keep the point under the anchor (mouse or centre) fixed while resizing
    const W = window.innerWidth, H = window.innerHeight;
    const ax = anchorX == null ? W / 2 : anchorX, ay = anchorY == null ? H / 2 : anchorY;
    const au = wall.cu + (ax - W / 2) / wall.pw;
    const av = wall.cv + (ay - H / 2) / wall.ph;
    WALL_COLS_VISIBLE = next;
    GM_setValue('WALL_COLS_VISIBLE', next);
    wallLayout();
    wall.cu = au - (ax - W / 2) / wall.pw;
    wall.cv = av - (ay - H / 2) / wall.ph;
    wall.tween = null; wall.wheelX = wall.wheelY = 0;
}

function wallStepFocus(di, dj) {
    wall.focusI += di;
    wall.focusJ += dj;
    wall.keyboardMode = true;
    wall.vx = wall.vy = 0;
    wall.wheelX = wall.wheelY = 0;
    // Glide so the focused poster sits in the middle of the screen
    wall.tween = { u: wall.focusI + 0.5, v: wall.focusJ + 0.5 };
    wall.dirty = true;
}

function wallUpdateToolbar() {
    const $r = wall.$root;
    const autoKey = Object.keys(WALL_ASPECTS).find(k => WALL_ASPECTS[k] === wall.autoAspect) || 'portrait';
    const label = WALL_ASPECT === 'auto' && wall.ready
        ? `Shape: Auto (${WALL_ASPECT_LABELS[autoKey]})`
        : `Shape: ${WALL_ASPECT_LABELS[WALL_ASPECT] || 'Auto'}`;
    $r.find('[data-act="aspect"]').text(label);
    $r.find('[data-act="fit"]').text(WALL_FIT === 'cover' ? 'Fill' : 'Fit');
    $r.find('[data-act="edge"]').toggleClass('vw-on', !!WALL_EDGE_PAN);
    $r.find('[data-act="dups"]').text(WALL_GROUP_DUP_IMAGES ? 'Duplicates: Grouped' : 'Duplicates: Separate')
        .toggleClass('vw-on', !!WALL_GROUP_DUP_IMAGES);
    $r.toggleClass('vw-fit-contain', WALL_FIT === 'contain');
}

function wallCycleAspect() {
    const k = WALL_ASPECT_ORDER[(WALL_ASPECT_ORDER.indexOf(WALL_ASPECT) + 1) % WALL_ASPECT_ORDER.length];
    WALL_ASPECT = k;
    GM_setValue('WALL_ASPECT', k);
    if (wall.ready) {
        const v = wall.cv;   // keep the same rows in view
        wallLayout();
        wall.cv = v;
    }
    wallUpdateToolbar();
}

function wallToggleFit() {
    WALL_FIT = WALL_FIT === 'cover' ? 'contain' : 'cover';
    GM_setValue('WALL_FIT', WALL_FIT);
    wallUpdateToolbar();
}

function wallToast(msg) {
    if (!wall) return;
    let $t = wall.$root.find('.vw-toast');
    if (!$t.length) $t = jQuery('<div class="vw-toast">').appendTo(wall.$root);
    $t.text(msg).addClass('vw-show');
    clearTimeout(wallToast.t);
    wallToast.t = setTimeout(() => $t.removeClass('vw-show'), 4500);
}

function wallMarkUnavailable() {
    if (!wall || !wall.ready) return;
    const item = wall.items[wallIndex(wall.focusI, wall.focusJ)];
    if (!item) return;
    if (!confirm(`Mark this image as an "image unavailable" placeholder?\n\n${item.title}\n${item.src}\n\n` +
                 `It, and any other poster showing the same placeholder, will be left out of the wall. ` +
                 `You can undo this in Viewer Settings.`)) return;
    const session = wall.session;
    const w = item.w, h = item.h;
    wall.all.forEach(it => {
        if (it.absSrc === item.absSrc && it.state !== 'failed') { it.state = 'failed'; wall.unavailable++; }
    });
    wallRebuild();
    wallToast('Learning this placeholder…');
    wallAddUnavailUrl(item.src).then(sig => {
        if (!wall || wall.session !== session) return;
        if (!sig || (w && h && (sig.w !== w || sig.h !== h))) {
            wallToast('Blocked this exact link. Could not fingerprint the image, so look-alikes are not detected.');
            return;
        }
        const same = wall.all.filter(it => it.state === 'ok' && it.w === w && it.h === h);
        Promise.all(same.map(it => wallLooksUnavailable(it.src, it.w, it.h).then(un => un && it))).then(hits => {
            if (!wall || wall.session !== session) return;
            const found = hits.filter(Boolean);
            found.forEach(it => { if (it.state !== 'failed') { it.state = 'failed'; wall.unavailable++; } });
            if (found.length) wallRebuild();
            const n = found.length;
            wallToast(n ? `Placeholder learned — ${n} more matching poster${n > 1 ? 's' : ''} removed.` : 'Placeholder learned.');
        });
    });
}

function wallToggleGroupDups() {
    WALL_GROUP_DUP_IMAGES = !WALL_GROUP_DUP_IMAGES;
    GM_setValue('WALL_GROUP_DUP_IMAGES', WALL_GROUP_DUP_IMAGES);
    jQuery('#vsm-WALL_GROUP_DUP_IMAGES').prop('checked', WALL_GROUP_DUP_IMAGES);
    wallUpdateToolbar();
    wallRebuild();
}

function wallResolution(title) {
    const m = (title || '').match(/\b(4320p|2160p|1440p|1080p|1080i|720p|576p|540p|480p|360p|8k|4k|uhd)\b/i);
    if (!m) return '';
    const r = m[1].toLowerCase();
    return r === 'uhd' ? '4K' : (/k$/.test(r) ? r.toUpperCase() : r);
}

// Popup listing every torrent that uses this poster's image
function wallOpenPicker(item) {
    if (!wall || !item || !item.group || item.group.length < 2) return;
    wallClosePicker();
    const $back = jQuery(`
        <div class="vw-picker-back">
            <div class="vw-picker" role="dialog">
                <div class="vw-picker-head">
                    <img class="vw-picker-img" alt="">
                    <div class="vw-picker-heading">
                        <div class="vw-picker-title"></div>
                        <div class="vw-picker-sub">Choose the torrent to open &middot; &uarr;&darr; to move &middot; Enter opens &middot; Esc closes</div>
                    </div>
                    <button class="vw-btn vw-close" type="button" title="Close (Esc)">&times;</button>
                </div>
                <div class="vw-picker-list"></div>
            </div>
        </div>`);
    $back.find('.vw-picker-img').attr('src', item.src);
    $back.find('.vw-picker-title').text(`${item.group.length} torrents share this image`);
    const $list = $back.find('.vw-picker-list');
    item.group.forEach((it, k) => {
        const $row = jQuery('<a class="vw-pick-row" target="_blank" rel="noopener">').attr('href', it.href).attr('data-k', k);
        jQuery('<div class="vw-pick-title">').text(it.title).appendTo($row);
        const $meta = jQuery('<div class="vw-pick-meta">').appendTo($row);
        const chip = (text, cls) => { if (text) jQuery('<span class="vw-chip">').addClass(cls || '').text(text).appendTo($meta); };
        chip(wallResolution(it.title), 'vw-res');
        chip(it.size);
        chip(it.cat);
        chip(it.time);
        if (it.seeders)  chip('▲ ' + it.seeders,  'vw-seed');
        if (it.leechers) chip('▼ ' + it.leechers, 'vw-leech');
        $list.append($row);
    });
    $back.on('click', function (e) { if (e.target === this) wallClosePicker(); });
    $back.find('.vw-close').on('click', function (e) { e.preventDefault(); wallClosePicker(); });
    $back.on('mouseenter', '.vw-pick-row', function () { wallPickerSelect(+this.getAttribute('data-k')); });
    // A plain click opens the torrent (new tab) and closes the picker; middle-click keeps it open
    $back.on('click', '.vw-pick-row', function () { setTimeout(wallClosePicker, 0); });
    wall.$root.append($back);
    wall.picker = { $back, sel: 0, n: item.group.length };
    wallPickerSelect(0);
    requestAnimationFrame(() => $back.addClass('vw-show'));
}

function wallPickerSelect(k) {
    const pk = wall && wall.picker;
    if (!pk) return;
    pk.sel = (k + pk.n) % pk.n;
    const $rows = pk.$back.find('.vw-pick-row').removeClass('vw-sel');
    const row = $rows.eq(pk.sel).addClass('vw-sel')[0];
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
}

function wallClosePicker() {
    if (!wall || !wall.picker) return;
    wall.picker.$back.remove();
    wall.picker = null;
}

function wallOpenFocused() {
    const item = wall.items[wallIndex(wall.focusI, wall.focusJ)];
    if (!item) return;
    if (item.group && item.group.length > 1) wallOpenPicker(item);
    else window.open(item.href, '_blank');
}

function wallToggleEdge() {
    WALL_EDGE_PAN = !WALL_EDGE_PAN;
    GM_setValue('WALL_EDGE_PAN', WALL_EDGE_PAN);
    wallUpdateToolbar();
}

// ── Input ──
function wallOnKey(e) {
    if (!wall) return;
    // Keep keys from reaching the page underneath
    e.stopPropagation();
    const k = e.key;
    if (wall.picker) {   // picker open: its own keys only
        const pk = wall.picker;
        if (k === 'Escape')         { e.preventDefault(); wallClosePicker(); }
        else if (k === 'ArrowDown') { e.preventDefault(); wallPickerSelect(pk.sel + 1); }
        else if (k === 'ArrowUp')   { e.preventDefault(); wallPickerSelect(pk.sel - 1); }
        else if (k === 'Enter') {
            e.preventDefault();
            const row = pk.$back.find('.vw-pick-row')[pk.sel];
            if (row) window.open(row.getAttribute('href'), '_blank');
            wallClosePicker();
        }
        return;
    }
    if (k === 'Escape') { e.preventDefault(); closePosterWall(); return; }
    if (!wall.ready) return;
    if      (k === 'ArrowLeft')  { e.preventDefault(); wallStepFocus(-1, 0); }
    else if (k === 'ArrowRight') { e.preventDefault(); wallStepFocus(1, 0); }
    else if (k === 'ArrowUp')    { e.preventDefault(); wallStepFocus(0, -1); }
    else if (k === 'ArrowDown')  { e.preventDefault(); wallStepFocus(0, 1); }
    else if (k === 'PageDown')   { e.preventDefault(); wall.wheelY += window.innerHeight * 0.8; }
    else if (k === 'PageUp')     { e.preventDefault(); wall.wheelY -= window.innerHeight * 0.8; }
    else if (k === 'Enter') { e.preventDefault(); wallOpenFocused(); }
    else if (k === '+' || k === '=') { e.preventDefault(); wallZoom(1); }
    else if (k === '-' || k === '_') { e.preventDefault(); wallZoom(-1); }
    else if (k === 'a' || k === 'A') { wallCycleAspect(); }
    else if (k === 'f' || k === 'F') { wallToggleFit(); }
    else if (k === 'e' || k === 'E') { wallToggleEdge(); }
    else if (k === 'u' || k === 'U') { wallMarkUnavailable(); }
    else if (k === 'd' || k === 'D') { wallToggleGroupDups(); }
    wallKick();
}

function wallBindEvents() {
    const $r = wall.$root;
    const stage = wall.stage;

    document.addEventListener('keydown', wallOnKey, true);

    $r.on('click', '.vw-btn', function (e) {
        e.preventDefault();
        const act = this.getAttribute('data-act');
        if      (act === 'close')    closePosterWall();
        else if (!wall.ready && act !== 'fit' && act !== 'edge' && act !== 'aspect') return;
        else if (act === 'zoom-in')  wallZoom(1);
        else if (act === 'zoom-out') wallZoom(-1);
        else if (act === 'aspect')   wallCycleAspect();
        else if (act === 'fit')      wallToggleFit();
        else if (act === 'edge')     wallToggleEdge();
        else if (act === 'dups')     wallToggleGroupDups();
    });

    // Wheel: smooth glide; Shift = sideways; Ctrl = resize
    $r[0].addEventListener('wheel', function (e) {
        if (wall && wall.picker) {   // let the picker list scroll natively, nothing else
            if (!(e.target.closest && e.target.closest('.vw-picker-list'))) e.preventDefault();
            return;
        }
        e.preventDefault();
        if (!wall || !wall.ready) return;
        if (e.ctrlKey) { wallZoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY); return; }
        const unit = e.deltaMode === 1 ? 40 : (e.deltaMode === 2 ? window.innerHeight : 1);
        let dx = e.deltaX * unit, dy = e.deltaY * unit;
        if (e.shiftKey && !dx) { dx = dy; dy = 0; }
        wall.vx = wall.vy = 0;
        wall.tween = null;
        wall.wheelX += dx;
        wall.wheelY += dy;
        wallKick();
    }, { passive: false });

    // Drag to pan (window-level move/up so links still receive their click)
    stage.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || !wall.ready) return;
        const wasMoving = Math.abs(wall.vx) > 1 || Math.abs(wall.vy) > 1 || wall.tween;
        wall.vx = wall.vy = 0;
        wall.wheelX = wall.wheelY = 0;
        wall.tween = null;
        wall.suppressClick = !!wasMoving;   // a tap that stops a fling shouldn't open anything
        wall.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, samples: [] };
    });

    jQuery(window).on('pointermove.vwall', function (ev) {
        const e = ev.originalEvent;
        if (e.clientX !== wall.mouseX || e.clientY !== wall.mouseY) wall.keyboardMode = false;
        wall.mouseX = e.clientX; wall.mouseY = e.clientY; wall.mouseIn = true;
        wall.overUi = !!(e.target && e.target.closest && e.target.closest('.vw-topbar, .vw-picker-back'));
        if (!wall.ready) return;
        const d = wall.drag;
        if (!d) { if (!wall.keyboardMode && !wall.overUi) wallFocusAtMouse(); wallKick(); return; }
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) {
            d.moved = true;
            wall.$root.addClass('vw-dragging');
        }
        if (d.moved) {
            wall.cu -= dx / wall.pw;
            wall.cv -= dy / wall.ph;
            wall.dirty = true;
            wallKick();
        }
        const now = performance.now();
        d.samples.push({ dx, dy, dt: Math.max(1, now - d.t) });
        if (d.samples.length > 5) d.samples.shift();
        d.x = e.clientX; d.y = e.clientY; d.t = now;
    });

    jQuery(window).on('pointerup.vwall pointercancel.vwall', function () {
        const d = wall && wall.drag;
        if (!d) return;
        wall.drag = null;
        wall.$root.removeClass('vw-dragging');
        if (d.moved) {
            wall.suppressClick = true;
            // Fling velocity from the last few samples, scaled to px per 16ms frame
            let sx = 0, sy = 0, st = 0;
            d.samples.forEach(s => { sx += s.dx; sy += s.dy; st += s.dt; });
            if (st > 0 && performance.now() - d.t < 80) {
                wall.vx = Math.max(-80, Math.min(80, sx / st * 16));
                wall.vy = Math.max(-80, Math.min(80, sy / st * 16));
            }
            wallKick();
        }
    });

    // Block the link click that ends a drag (capture phase, before the <a> acts)
    stage.addEventListener('click', function (e) {
        if (!wall) return;
        if (wall.suppressClick) {
            e.preventDefault();
            e.stopPropagation();
            wall.suppressClick = false;
            return;
        }
        const cell = e.target.closest && e.target.closest('.vw-cell');
        const item = cell && wall.items[+cell.dataset.idx];
        if (item && item.group && item.group.length > 1) {
            e.preventDefault();
            e.stopPropagation();
            wallOpenPicker(item);
        }
    }, true);
    stage.addEventListener('dragstart', e => e.preventDefault());

    $r.on('mouseleave', function () { if (wall) wall.mouseIn = false; });
    jQuery(window).on('blur.vwall', function () { if (wall) { wall.mouseIn = false; wall.drag = null; wall.$root.removeClass('vw-dragging'); } });
    jQuery(window).on('resize.vwall', function () { if (wall && wall.ready) wallLayout(); });
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
        const hide = rowIsBlacklisted($r);
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
// UPLOADER BLACKLIST — HELPERS (with optional expiry)
// --------------------
function saveUploaderBlacklist() {
    GM_setValue('UPLOADER_BLACKLIST', JSON.stringify(UPLOADER_BLACKLIST));
    GM_setValue('UPLOADER_BLACKLIST_EXPIRY', JSON.stringify(UPLOADER_BLACKLIST_EXPIRY));
}

function isUploaderExpired(name) {
    const exp = UPLOADER_BLACKLIST_EXPIRY[name];
    return !!exp && exp <= Date.now();
}

// True only if the name is on the list AND has not expired.
function isUploaderBlacklisted(name) {
    name = String(name || '').toLowerCase().trim();
    return UPLOADER_BLACKLIST.indexOf(name) !== -1 && !isUploaderExpired(name);
}

// Drops expired entries. Returns true if anything was removed.
function purgeExpiredUploaders() {
    const before = UPLOADER_BLACKLIST.length;
    UPLOADER_BLACKLIST = UPLOADER_BLACKLIST.filter(n => !isUploaderExpired(n));
    Object.keys(UPLOADER_BLACKLIST_EXPIRY).forEach(function (k) {
        if (UPLOADER_BLACKLIST.indexOf(k) === -1) delete UPLOADER_BLACKLIST_EXPIRY[k];
    });
    const changed = UPLOADER_BLACKLIST.length !== before;
    if (changed) saveUploaderBlacklist();
    return changed;
}

// durationMs falsy/0 => permanent
function addUploaderToBlacklist(name, durationMs) {
    name = String(name).toLowerCase().trim();
    if (!name || name === 'anon' || name === 'anonymous') return;
    if (UPLOADER_BLACKLIST.indexOf(name) === -1) UPLOADER_BLACKLIST.push(name);
    if (durationMs && durationMs > 0) UPLOADER_BLACKLIST_EXPIRY[name] = Date.now() + durationMs;
    else delete UPLOADER_BLACKLIST_EXPIRY[name];
    saveUploaderBlacklist();
}

function removeUploaderFromBlacklist(name) {
    name = String(name).toLowerCase().trim();
    const idx = UPLOADER_BLACKLIST.indexOf(name);
    if (idx !== -1) UPLOADER_BLACKLIST.splice(idx, 1);
    delete UPLOADER_BLACKLIST_EXPIRY[name];
    saveUploaderBlacklist();
}

// --------------------
// UPLOADER + TAG RULES — HELPERS
// Evaluation order (see getRowHideReason):
//   1. global Tag Blacklist  -> hides for everyone
//   2. Uploader Blacklist    -> hides everything from that uploader
//   3. Uploader + Tag rules  -> hides an item only if ITS uploader has that tag listed
// --------------------
function saveUploaderTagRules() {
    GM_setValue('UPLOADER_TAG_RULES', JSON.stringify(UPLOADER_TAG_RULES));
}

function isUploaderTagRuleActive(uploader, tag) {
    uploader = String(uploader || '').toLowerCase().trim();
    tag      = String(tag || '').toLowerCase().trim();
    const rules = UPLOADER_TAG_RULES[uploader];
    if (!rules || !Object.prototype.hasOwnProperty.call(rules, tag)) return false;
    const exp = rules[tag];
    return !exp || exp > Date.now();
}

// durationMs falsy/0 => permanent
function addUploaderTagRule(uploader, tag, durationMs) {
    uploader = String(uploader || '').toLowerCase().trim();
    tag      = String(tag || '').toLowerCase().trim();
    if (!uploader || !tag || uploader === 'anon' || uploader === 'anonymous') return;
    if (!UPLOADER_TAG_RULES[uploader]) UPLOADER_TAG_RULES[uploader] = {};
    UPLOADER_TAG_RULES[uploader][tag] = (durationMs && durationMs > 0) ? Date.now() + durationMs : 0;
    saveUploaderTagRules();
}

function removeUploaderTagRule(uploader, tag) {
    uploader = String(uploader || '').toLowerCase().trim();
    tag      = String(tag || '').toLowerCase().trim();
    if (UPLOADER_TAG_RULES[uploader]) {
        delete UPLOADER_TAG_RULES[uploader][tag];
        if (!Object.keys(UPLOADER_TAG_RULES[uploader]).length) delete UPLOADER_TAG_RULES[uploader];
    }
    saveUploaderTagRules();
}

function countUploaderTagRules() {
    let n = 0;
    Object.keys(UPLOADER_TAG_RULES).forEach(function (u) {
        Object.keys(UPLOADER_TAG_RULES[u]).forEach(function (t) {
            if (isUploaderTagRuleActive(u, t)) n++;
        });
    });
    return n;
}

// Drops expired rules. Returns true if anything was removed.
function purgeExpiredUploaderTagRules() {
    let changed = false;
    Object.keys(UPLOADER_TAG_RULES).forEach(function (u) {
        Object.keys(UPLOADER_TAG_RULES[u]).forEach(function (t) {
            const exp = UPLOADER_TAG_RULES[u][t];
            if (exp && exp <= Date.now()) { delete UPLOADER_TAG_RULES[u][t]; changed = true; }
        });
        if (!Object.keys(UPLOADER_TAG_RULES[u]).length) { delete UPLOADER_TAG_RULES[u]; changed = true; }
    });
    if (changed) saveUploaderTagRules();
    return changed;
}

// Purges both timed uploader blocks and timed uploader+tag rules. Returns true if anything changed.
function purgeAllExpired() {
    const a = purgeExpiredUploaders();
    const b = purgeExpiredUploaderTagRules();
    return a || b;
}

function rowMatchesUploaderTagRules($row) {
    if (!Object.keys(UPLOADER_TAG_RULES).length) return false;
    const uploader = getUploaderFromRow($row);
    if (!uploader || !UPLOADER_TAG_RULES[uploader]) return false;
    return getTagsFromRow($row).some(t => isUploaderTagRuleActive(uploader, t));
}

// Returns 'tag' | 'uploader' | 'uploader-tag' | null, checked in that order.
function getRowHideReason($row) {
    if (rowMatchesBlacklist($row))            return 'tag';
    if (rowMatchesUploaderBlacklist($row))    return 'uploader';
    if (rowMatchesUploaderTagRules($row))     return 'uploader-tag';
    return null;
}

function rowIsBlacklisted($row) {
    return getRowHideReason($row) !== null;
}

// Remove the rule if it exists, otherwise ask for a duration and add it.
function toggleUploaderTagRule(uploader, tag, onDone) {
    uploader = String(uploader || '').toLowerCase().trim();
    tag      = String(tag || '').toLowerCase().trim();
    if (!uploader || !tag || uploader === 'anon' || uploader === 'anonymous') return;

    function finish() {
        applyBlacklistsToPage();
        refreshUploaderTagRulesPanel();
        if (onDone) onDone();
    }

    if (isUploaderTagRuleActive(uploader, tag)) {
        removeUploaderTagRule(uploader, tag);
        finish();
    } else {
        showBlockDurationDialog([tag], function (durationMs) {
            addUploaderTagRule(uploader, tag, durationMs);
            finish();
        }, { title: '\u26D4 Block tag for uploader', target: uploader + ': ' + tag });
    }
}

// --------------------
// UPLOADER TAG-BLOCK POPUP (icon next to an uploader name)
// Dropdown is filled from the item's tags; free text is also accepted.
// --------------------
let $utagPopupEl = null;

function hideUploaderTagPopup() {
    if ($utagPopupEl) $utagPopupEl.hide().removeData('anchor');
    jQuery(document).off('mousedown.vut keydown.vut');
}

function showUploaderTagPopup($anchor, uploader, rowTags) {
    uploader = String(uploader || '').toLowerCase().trim();
    if (!uploader || uploader === 'anon' || uploader === 'anonymous') return;

    if (!$utagPopupEl) $utagPopupEl = jQuery('<div id="vg-utag-popup">').appendTo('body');

    // Clicking the same icon again closes the popup
    if ($utagPopupEl.is(':visible') && $utagPopupEl.data('anchor') === $anchor[0]) {
        hideUploaderTagPopup();
        return;
    }
    hideUploaderTagPopup();

    const tags = (rowTags || []).filter((t, i, a) => a.indexOf(t) === i);
    const $p   = $utagPopupEl.empty().data('anchor', $anchor[0]);

    jQuery('<div class="vut-title">').text('Block tag for ').append(jQuery('<b>').text(uploader)).appendTo($p);

    jQuery('<label for="vut-select">').text(tags.length ? 'Pick from this item\u2019s tags' : 'This item has no tags').appendTo($p);
    const $sel = jQuery('<select id="vut-select">');
    $sel.append(jQuery('<option value="">').text('\u2014 choose a tag \u2014'));
    tags.forEach(function (t) {
        const globalBl = TAG_BLACKLIST.indexOf(t) !== -1;
        const ruled    = isUploaderTagRuleActive(uploader, t);
        const $o = jQuery('<option>').val(t).text(t + (globalBl ? '  (blocked for everyone)' : ruled ? '  (already blocked)' : ''));
        if (globalBl || ruled) $o.prop('disabled', true);
        $sel.append($o);
    });
    if (!tags.length) $sel.prop('disabled', true);
    $p.append($sel);

    jQuery('<label for="vut-text">').text('Or type a tag (several: space or comma)').appendTo($p);
    const $txt = jQuery('<input type="text" id="vut-text" placeholder="e.g. oral" autocomplete="off">');
    $p.append($txt);

    const $err = jQuery('<div class="vut-error">').appendTo($p);

    const $btns   = jQuery('<div class="vut-btns">').appendTo($p);
    const $cancel = jQuery('<button type="button" class="vut-btn vut-btn-cancel">').text('Cancel').appendTo($btns);
    const $ok     = jQuery('<button type="button" class="vut-btn vut-btn-ok">').text('Block\u2026').appendTo($btns);

    function submit() {
        const list = [];
        const picked = $sel.val();
        if (picked) list.push(picked);
        $txt.val().trim().toLowerCase().split(/[\s,]+/).forEach(function (t) {
            t = t.trim();
            if (t && list.indexOf(t) === -1) list.push(t);
        });
        if (!list.length) { $err.text('Pick a tag or type one.'); return; }
        const fresh = list.filter(t => TAG_BLACKLIST.indexOf(t) === -1 && !isUploaderTagRuleActive(uploader, t));
        if (!fresh.length) { $err.text('Already blocked for this uploader.'); return; }
        hideUploaderTagPopup();
        showBlockDurationDialog(fresh, function (durationMs) {
            fresh.forEach(t => addUploaderTagRule(uploader, t, durationMs));
            applyBlacklistsToPage();
            refreshUploaderTagRulesPanel();
        }, { title: '\u26D4 Block tags for uploader', target: uploader + ': ' + fresh.join(', ') });
    }
    $ok.on('click', submit);
    $cancel.on('click', hideUploaderTagPopup);
    $txt.on('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

    // Existing rules for this uploader, removable in place
    const active = Object.keys(UPLOADER_TAG_RULES[uploader] || {}).filter(t => isUploaderTagRuleActive(uploader, t)).sort();
    if (active.length) {
        const $ex = jQuery('<div class="vut-existing">').appendTo($p);
        jQuery('<span class="vut-existing-label">').text('Blocked:').appendTo($ex);
        active.forEach(function (t) {
            const $chip = jQuery('<span class="vut-chip">').text(t);
            const $rm   = jQuery('<button type="button" title="Remove">').html('&times;');
            $rm.on('click', function () {
                removeUploaderTagRule(uploader, t);
                $chip.remove();
                if (!$ex.find('.vut-chip').length) $ex.remove();
                $sel.find('option').filter(function () { return this.value === t; })
                    .prop('disabled', TAG_BLACKLIST.indexOf(t) !== -1).text(t + (TAG_BLACKLIST.indexOf(t) !== -1 ? '  (blocked for everyone)' : ''));
                applyBlacklistsToPage();
                refreshUploaderTagRulesPanel();
            });
            $chip.append($rm);
            $ex.append($chip);
        });
    }

    // Position below the icon, clamped to the viewport's right edge
    const rect       = $anchor[0].getBoundingClientRect();
    const scrollTop  = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    $p.css({ display: 'block', top: (rect.bottom + scrollTop + 4) + 'px', left: (rect.left + scrollLeft) + 'px' });
    const pr = $p[0].getBoundingClientRect();
    if (pr.right > window.innerWidth - 10) {
        $p.css('left', (Math.max(10, window.innerWidth - pr.width - 10) + scrollLeft) + 'px');
    }

    // Dismiss on outside click or Escape
    jQuery(document).on('mousedown.vut', function (e) {
        if ($p[0].contains(e.target) || $anchor[0].contains(e.target)) return;
        hideUploaderTagPopup();
    });
    jQuery(document).on('keydown.vut', function (e) {
        if (e.key === 'Escape') hideUploaderTagPopup();
    });

    setTimeout(() => (tags.length ? $sel : $txt).trigger('focus'), 0);
}

function refreshUploaderTagRulesPanel() {
    const $container = jQuery('#vsm-utr-container');
    if (!$container.length) return;
    $container.empty();
    let shown = 0;
    Object.keys(UPLOADER_TAG_RULES).sort().forEach(function (u) {
        const tags = Object.keys(UPLOADER_TAG_RULES[u]).filter(t => isUploaderTagRuleActive(u, t)).sort();
        if (!tags.length) return;
        shown++;
        const $row = jQuery('<div class="vsm-utr-row">');
        jQuery('<span class="vsm-utr-user">').text(u + ':').appendTo($row);
        tags.forEach(function (t) {
            const exp = UPLOADER_TAG_RULES[u][t];
            const $chip = jQuery('<span class="vsm-utr-chip">').text(t);
            if (exp) {
                jQuery('<span class="vsm-bl-time">')
                    .text('\u00B7 ' + formatRemaining(exp - Date.now()))
                    .attr('title', 'Expires ' + new Date(exp).toLocaleString())
                    .appendTo($chip);
            }
            if (TAG_BLACKLIST.indexOf(t) !== -1) {
                $chip.addClass('vsm-utr-shadowed').attr('title', 'Also covered by the global tag blacklist');
            } else if (isUploaderBlacklisted(u)) {
                $chip.addClass('vsm-utr-shadowed').attr('title', 'Also covered by the uploader blacklist');
            }
            const $rm = jQuery('<button type="button" title="Remove">').html('&times;');
            $rm.on('click', function () {
                removeUploaderTagRule(u, t);
                applyBlacklistsToPage();
                refreshUploaderTagRulesPanel();
            });
            $chip.append($rm);
            $row.append($chip);
        });
        $container.append($row);
    });
    if (!shown) {
        $container.append(
            jQuery('<span>').css({ color: '#555', fontSize: '11px' }).text('No uploader + tag rules.')
        );
    }
}

function formatRemaining(ms) {
    const mins = Math.max(1, Math.ceil(ms / 60000));
    if (mins < 60) return mins + 'm';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ' + (mins % 60) + 'm';
    return Math.floor(hours / 24) + 'd ' + (hours % 24) + 'h';
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
    // Strategy 3: first user-profile link inside the title cell (inline "uploaded by"
    // link on pages without an uploader column, e.g. torrents.php?action=notify)
    if (cols.title >= 0) {
        const $a   = $row.find('> td').eq(cols.title).find('a[href*="user.php?id="]').first();
        const name = $a.text().trim().toLowerCase();
        if (name && ANON.indexOf(name) === -1) return name;
    }
    return null;
}

function rowMatchesUploaderBlacklist($row) {
    if (!UPLOADER_BLACKLIST.length) return false;
    const uploader = getUploaderFromRow($row);
    return uploader !== null && isUploaderBlacklisted(uploader);
}

// Blocked -> unblock immediately. Not blocked -> ask for a duration first.
// onDone (optional) runs after the change has been applied.
function toggleUploaderInBlacklist(name, onDone) {
    name = String(name).toLowerCase().trim();
    if (!name || name === 'anon' || name === 'anonymous') return; // never block anon

    function finish() {
        applyBlacklistsToPage();
        refreshUploaderSettingsPanel();
        if (onDone) onDone();
    }

    if (isUploaderBlacklisted(name)) {
        removeUploaderFromBlacklist(name);
        finish();
    } else {
        showBlockDurationDialog([name], function (durationMs) {
            addUploaderToBlacklist(name, durationMs);
            finish();
        });
    }
}

function refreshUploaderSettingsPanel() {
    const $container = jQuery('#vsm-uploader-chips-container');
    if (!$container.length) return;
    $container.empty();
    const active = UPLOADER_BLACKLIST.filter(isUploaderBlacklisted);
    if (active.length) {
        active.forEach(function (name) {
            const $chip = jQuery('<span class="vsm-bl-chip">').text(name);
            const exp = UPLOADER_BLACKLIST_EXPIRY[name];
            if (exp) {
                jQuery('<span class="vsm-bl-time">')
                    .text('· ' + formatRemaining(exp - Date.now()))
                    .attr('title', 'Expires ' + new Date(exp).toLocaleString())
                    .appendTo($chip);
            }
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

// --------------------
// BLOCK DURATION DIALOG
// --------------------
let blockDialogBuilt = false;

function ensureBlockDialog() {
    if (blockDialogBuilt) return;
    blockDialogBuilt = true;
    jQuery('body').append(`
    <div id="vbd-backdrop">
        <div id="vbd-modal" role="dialog" aria-modal="true">
            <div class="vbd-header">&#9940; Block uploader</div>
            <div class="vbd-body">
                <div class="vbd-target" id="vbd-target"></div>
                <label class="vbd-label" for="vbd-duration">Block duration</label>
                <select id="vbd-duration">
                    <option value="permanent" selected>Permanent</option>
                    <option value="1">1 day</option>
                    <option value="3">3 days</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="custom">Custom (days)&hellip;</option>
                </select>
                <div id="vbd-custom-row" style="display:none">
                    <input type="number" id="vbd-custom-days" min="1" max="3650" step="1" value="14">
                    <span>days</span>
                </div>
                <div class="vbd-error" id="vbd-error"></div>
            </div>
            <div class="vbd-footer">
                <button type="button" class="vbd-btn vbd-btn-cancel" id="vbd-cancel">Cancel</button>
                <button type="button" class="vbd-btn vbd-btn-ok" id="vbd-ok">Block</button>
            </div>
        </div>
    </div>`);
}

// names: array of uploader names; onConfirm(durationMs) — 0 means permanent.
function showBlockDurationDialog(names, onConfirm, opts) {
    opts = opts || {};
    ensureBlockDialog();
    const $bd = jQuery('#vbd-backdrop');

    jQuery('#vbd-modal .vbd-header').text(opts.title || '\u26D4 Block uploader');
    jQuery('#vbd-target').text(opts.target || names.join(', '));
    jQuery('#vbd-duration').val('permanent');
    jQuery('#vbd-custom-days').val(14);
    jQuery('#vbd-custom-row').hide();
    jQuery('#vbd-error').text('');

    // Capture-phase key handler so Escape doesn't also close the settings modal underneath
    function onKey(e) {
        if (e.key === 'Escape') {
            e.stopPropagation(); e.preventDefault(); close();
        } else if (e.key === 'Enter' && e.target.id !== 'vbd-cancel') {
            e.stopPropagation(); e.preventDefault(); confirmBlock();
        }
    }
    function close() {
        $bd.removeClass('active').off('.vbd');
        jQuery('#vbd-duration, #vbd-ok, #vbd-cancel').off('.vbd');
        window.removeEventListener('keydown', onKey, true);
    }
    function confirmBlock() {
        const v = jQuery('#vbd-duration').val();
        let ms = 0;
        if (v === 'custom') {
            const days = parseFloat(jQuery('#vbd-custom-days').val());
            if (!isFinite(days) || days <= 0 || days > 3650) {
                jQuery('#vbd-error').text('Enter a number of days between 1 and 3650.');
                return;
            }
            ms = Math.round(days * DAY_MS);
        } else if (v !== 'permanent') {
            ms = parseInt(v, 10) * DAY_MS;
        }
        close();
        onConfirm(ms);
    }

    jQuery('#vbd-duration').off('.vbd').on('change.vbd', function () {
        const isCustom = jQuery(this).val() === 'custom';
        jQuery('#vbd-custom-row').toggle(isCustom);
        jQuery('#vbd-error').text('');
        if (isCustom) jQuery('#vbd-custom-days').trigger('focus').trigger('select');
    });
    jQuery('#vbd-ok').off('.vbd').on('click.vbd', confirmBlock);
    jQuery('#vbd-cancel').off('.vbd').on('click.vbd', close);
    $bd.off('.vbd').on('click.vbd', function (e) { if (e.target === this) close(); });
    window.addEventListener('keydown', onKey, true);

    $bd.addClass('active');
    setTimeout(() => jQuery('#vbd-duration').trigger('focus'), 0);
}

// Adds a ⛔ block button next to the uploader name in the uploader column (table view).
function addUploaderBlockBtnToRow($row) {
    const cols = getGalleryColOffsets();
    if (cols.uploader < 0) { addUploaderTagBtnFallback($row, cols); return; } // no uploader column
    const $td = $row.find('> td').eq(cols.uploader);
    if ($td.data('vg-uploader-btn-added')) return;
    $td.data('vg-uploader-btn-added', true);

    const uploader = getUploaderFromRow($row);
    if (!uploader) return;

    const $btn = jQuery('<button class="vg-uploader-block-btn" type="button" title="Block uploader: ' + uploader + '">✕</button>');
    $btn.on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleUploaderInBlacklist(uploader);
    });
    const $utagBtn = jQuery('<button class="vg-uploader-utag-btn" type="button">')
        .attr('title', 'Block a tag for ' + uploader + ' only')
        .text('#');
    $utagBtn.on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        showUploaderTagPopup(jQuery(this), uploader, getTagsFromRow($row));
    });
    // Append after the link (or at end of cell)
    const $group = jQuery('<span class="vg-uploader-btn-group">').append($btn, $utagBtn);
    const $link = $td.find('a').first();
    if ($link.length) { $link.addClass('vg-uname'); $link.after($group); }
    else $td.append($group);
}

// Pages without an uploader column (e.g. notify): put the tag-block icon after the
// uploader's profile link inside the title cell, when there is one.
function addUploaderTagBtnFallback($row, cols) {
    if (cols.title < 0 || $row.data('vg-utag-fallback-added')) return;
    const $a = $row.find('> td').eq(cols.title).find('a[href*="user.php?id="]').first();
    if (!$a.length) return;
    $row.data('vg-utag-fallback-added', true);
    const uploader = getUploaderFromRow($row);
    if (!uploader) return;
    const $utagBtn = jQuery('<button class="vg-uploader-utag-btn" type="button">')
        .attr('title', 'Block a tag for ' + uploader + ' only')
        .text('#');
    $utagBtn.on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        showUploaderTagPopup(jQuery(this), uploader, getTagsFromRow($row));
    });
    $a.addClass('vg-uname');
    $a.after(jQuery('<span class="vg-uploader-btn-group">').append($utagBtn));
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

function showTagsPopup($btn, tags, rowUploader) {
    ensureTagsPopup();
    if (tagsHideTimer) { clearTimeout(tagsHideTimer); tagsHideTimer = null; }

    $tagsPopupEl.empty();

    const canScope = !!rowUploader;

    // Mode hint line
    let modeLabel;
    if (TAG_CLICK_ACTION === 'favorite') {
        modeLabel = '\u2605 Click to favorite / unfavorite';
    } else if (TAG_CLICK_ACTION === 'uploader_tag') {
        modeLabel = canScope
            ? '\u2716 Click to blacklist for ' + rowUploader + ' only'
            : '\u26A0 Uploader unknown \u2014 cannot scope to an uploader';
    } else {
        modeLabel = '\u2716 Click to blacklist / unblacklist' + (canScope ? ' \u00B7 Shift+click: ' + rowUploader + ' only' : '');
    }
    jQuery('<span class="vg-popup-hint">').text(modeLabel).appendTo($tagsPopupEl);

    // Paint a chip according to its current state. Priority: global blacklist > uploader rule > favorite.
    function paint($chip, tag) {
        $chip.removeClass('vg-tag-bl vg-tag-ubl vg-tag-fav');
        if (TAG_BLACKLIST.indexOf(tag) !== -1) {
            $chip.addClass('vg-tag-bl').attr('title', 'Blacklisted for everyone \u2014 click to remove');
        } else if (canScope && isUploaderTagRuleActive(rowUploader, tag)) {
            $chip.addClass('vg-tag-ubl').attr('title', 'Blacklisted for ' + rowUploader + ' only \u2014 click to remove');
        } else if (TAG_FAVORITES.indexOf(tag) !== -1) {
            $chip.addClass('vg-tag-fav').attr('title', 'Favorite \u2014 click to remove');
        } else if (TAG_CLICK_ACTION === 'favorite') {
            $chip.attr('title', 'Click to add to favorites');
        } else if (TAG_CLICK_ACTION === 'uploader_tag') {
            $chip.attr('title', canScope ? 'Click to blacklist for ' + rowUploader + ' only' : 'Uploader unknown');
        } else {
            $chip.attr('title', 'Click to blacklist' + (canScope ? ' (Shift+click: ' + rowUploader + ' only)' : ''));
        }
    }

    tags.forEach(function (tag) {
        const $chip = jQuery('<span>').addClass('vg-tag-chip').text(tag);
        paint($chip, tag);

        $chip.on('click', function (e) {
            e.stopPropagation();
            const refresh = function () { paint($chip, tag); };

            if (TAG_CLICK_ACTION === 'favorite') {
                toggleTagInFavorites(tag);
                refresh();
                return;
            }

            const scopedIntent = TAG_CLICK_ACTION === 'uploader_tag' || e.shiftKey;
            const globallyBl   = TAG_BLACKLIST.indexOf(tag) !== -1;

            if (globallyBl) {
                // Already blocked for everyone: a scoped click has nothing to add, a plain click removes it
                if (!scopedIntent) { toggleTagInBlacklist(tag); refresh(); }
                return;
            }
            if (canScope && isUploaderTagRuleActive(rowUploader, tag)) {
                toggleUploaderTagRule(rowUploader, tag, refresh); // removes the rule
                return;
            }
            if (scopedIntent) {
                if (canScope) toggleUploaderTagRule(rowUploader, tag, refresh); // opens the duration dialog
                return;
            }
            // Global blacklist — also removes from favorites (mutual exclusivity)
            const favIdx = TAG_FAVORITES.indexOf(tag);
            if (favIdx !== -1) { TAG_FAVORITES.splice(favIdx, 1); saveFavoriteTags(); }
            toggleTagInBlacklist(tag);
            refresh();
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
let changelogModalBuilt = false;

function ensureChangelogModal() {
    if (changelogModalBuilt) return;
    changelogModalBuilt = true;

    const html = `
    <div id="vcl-backdrop">
        <div id="vcl-modal">
            <div class="vcl-header">
                <div class="vcl-header-left">
                    <h2>&#127381; What's New</h2>
                    <span class="vcl-subtitle">[HF][EMP] Advanced Viewer Experience &mdash; currently v${SCRIPT_VERSION}</span>
                </div>
            </div>
            <div class="vcl-body" id="vcl-body-content"></div>
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
}

function renderChangelogBody(versionsToShow, errorMsg, updateAvailableVersion, hasMore) {
    let html = '';
    if (updateAvailableVersion) {
        html += `<div class="vcl-update-banner">&#128276; A newer version (v${updateAvailableVersion}) is available on GitHub — you're currently on v${SCRIPT_VERSION}.</div>`;
    }
    if (errorMsg) {
        html += `<div class="vcl-changelog-error">Couldn't load the changelog (${errorMsg}). Check the GitHub repo directly for the latest version history.</div>`;
    } else if (!versionsToShow || !versionsToShow.length) {
        html += `<div class="vcl-changelog-error">No changelog entries found.</div>`;
    } else {
        html += versionsToShow.map((entry) => {
            const items = entry.changes.map(c => `<li>${c}</li>`).join('');
            return `
            <div class="vcl-version-block">
                <span class="vcl-version-label">v${entry.version}</span>
                ${entry.date ? `<span class="vcl-version-date">${entry.date}</span>` : ''}
                <ul class="vcl-changes">${items}</ul>
            </div>`;
        }).join('');

        if (hasMore) {
            html += `<div class="vcl-changelog-more">Showing the ${versionsToShow.length} most recent versions &mdash; <a href="${CHANGELOG_URL}" target="_blank">see full version history on GitHub</a>.</div>`;
        }
    }
    jQuery('#vcl-body-content').html(html);
}

function dismissChangelog() {
    jQuery('#vcl-backdrop').removeClass('active');
    jQuery(document).off('keydown.vcl');
}
function showChangelogModal() {
    ensureChangelogModal();
    jQuery('#vcl-backdrop').addClass('active');
    jQuery('#vcl-body-content').html('<div class="vcl-changelog-loading">Loading changelog&hellip;</div>');

    fetchChangelog((entries, err) => {
        if (err) { renderChangelogBody(null, err, null); return; }

        const currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
        const updateAvailableVersion = currentIdx > 0 ? entries[0].version : null;

        // Start from the installed version if we can find it, otherwise from the top
        const startIdx = currentIdx === -1 ? 0 : currentIdx;
        const toShow = entries.slice(startIdx, startIdx + CHANGELOG_HISTORY_DEPTH);
        const hasMore = entries.length > startIdx + CHANGELOG_HISTORY_DEPTH;

        renderChangelogBody(toShow, null, updateAvailableVersion, hasMore);
    });
}

function checkVersionAndShowChangelog() {
    const lastSeen = GM_getValue('LAST_SEEN_VERSION', '');
    if (lastSeen === SCRIPT_VERSION) return;
    GM_setValue('LAST_SEEN_VERSION', SCRIPT_VERSION);

    fetchChangelog((entries, err) => {
        if (err) return; // stay quiet on auto-check failures; menu command still works

        const currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
        const availableEntries = currentIdx === -1 ? entries : entries.slice(currentIdx);

        let toShow;
        if (!lastSeen) {
            toShow = availableEntries.length ? [availableEntries[0]] : [];
        } else {
            toShow = [];
            for (let i = 0; i < availableEntries.length; i++) {
                if (availableEntries[i].version === lastSeen) break;
                toShow.push(availableEntries[i]);
            }
            if (!toShow.length && availableEntries.length) toShow = [availableEntries[0]];
        }
        if (!toShow.length) return;

        const updateAvailableVersion = currentIdx > 0 ? entries[0].version : null;

        ensureChangelogModal();
        jQuery('#vcl-backdrop').addClass('active');
        renderChangelogBody(toShow, null, updateAvailableVersion);
    });
}

function parseChangelogMarkdown(md) {
    const lines = md.split(/\r?\n/);
    const entries = [];
    let current = null;
    lines.forEach((line) => {
        const headerMatch = line.match(/^##\s*v?([0-9][0-9.]*)\s*(?:-\s*(.+))?\s*$/i);
        if (headerMatch) {
            current = { version: headerMatch[1], date: (headerMatch[2] || '').trim(), changes: [] };
            entries.push(current);
            return;
        }
        const itemMatch = line.match(/^\s*[-*]\s+(.*\S)\s*$/);
        if (itemMatch && current) current.changes.push(itemMatch[1]);
    });
    return entries.filter((e) => e.changes.length);
}

function findChangelogIndexForVersion(entries, version) {
    for (let i = 0; i < entries.length; i++) {
        if (entries[i].version === version) return i;
    }
    return -1;
}

function fetchChangelog(callback) {
    if (changelogCache) { callback(changelogCache, null); return; }
    if (typeof GM_xmlhttpRequest !== 'function') { callback(null, 'GM_xmlhttpRequest not available'); return; }
    GM_xmlhttpRequest({
        method: 'GET',
        url: CHANGELOG_URL,
        onload: (res) => {
            if (res.status < 200 || res.status >= 300) { callback(null, 'HTTP ' + res.status); return; }
            try {
                const parsed = parseChangelogMarkdown(res.responseText);
                changelogCache = parsed;
                callback(parsed, null);
            } catch (e) {
                callback(null, 'Parse error: ' + e.message);
            }
        },
        onerror: () => callback(null, 'Network error fetching changelog'),
        ontimeout: () => callback(null, 'Timed out fetching changelog'),
        timeout: 10000,
    });
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
                    if (rowIsBlacklisted($row)) {
                        $row.addClass('vg-bl-hidden').hide();
                    } else if (rowMatchesFavorites($row)) {
                        applyGlowToRow($row);
                    }
                    // Add ⛔ block button next to uploader name (where column exists)
                    addUploaderBlockBtnToRow($row);
                    $row.data('thumbnail-attached', true).attr('data-thumbnail-attached', '1');
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
    // Drop expired timed uploader blocks before anything reads the blacklist,
    // then keep checking so rows/cards reappear without a reload.
    purgeAllExpired();
    setInterval(function () {
        if (purgeAllExpired()) {
            applyBlacklistsToPage();
            refreshUploaderSettingsPanel();
            refreshUploaderTagRulesPanel();
        }
    }, 30 * 1000);

    buildSettingsOverlay();

    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('📋 Show Changelog', () => showChangelogModal());
    }

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
        outer.style.pointerEvents = 'none'; // ← add this
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