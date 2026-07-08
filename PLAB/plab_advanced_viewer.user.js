// ==UserScript==
// @name        [Pornolab] Advanced Viewer Experience
// @description Adds a Grid/List toggle, image previews pulled from inside each topic, download buttons, forum & uploader blacklist/favorites with glow highlighting, and a settings panel to Pornolab's tracker search results.
// @namespace   https://github.com/edstagdh/Userscripts
// @version     1.0
// @author      edstagdh
// @match       https://pornolab.net/forum/tracker.php*
// @require     https://code.jquery.com/jquery-2.1.1.js
// @grant       GM_addStyle
// @grant       GM_setValue
// @grant       GM_getValue
// ==/UserScript==

"use strict";

this.$ = this.jQuery = jQuery.noConflict(true);

const LOG_PREFIX = '[PL-VIEWER]';

// --------------------
// VERSION HISTORY (newest first — add an entry here with every release)
// --------------------
const SCRIPT_VERSION = '1.0';
const VERSION_HISTORY = [
    {
        version: '1.0',
        changes: [
            'Initial release: ported the [HF][EMP] Advanced Viewer Experience gallery/settings system to Pornolab.',
            'Grid/List toggle button next to "Опции показа".',
            'Preview images are pulled live from inside each topic page (first valid image found), lazy-loaded via IntersectionObserver.',
            'Download button added to both table and grid views.',
            'Forum Blacklist & Favorite Forums (with configurable glow color) — since Pornolab rows have one forum instead of tags.',
            'Uploader Blacklist with inline ⛔ block buttons in both views.',
            'Table view: category text trimmed to English only, Russian month abbreviations translated.',
        ],
    },
];

// --------------------
// CONFIG DEFAULTS
// --------------------
const DEFAULTS = {
    GRID_DARK_MODE:          true,
    GALLERY_VIEW_MODE:       false,
    GALLERY_CARD_MIN_WIDTH:  220,
    IMAGE_LOAD_MODE:         "near",   // "disabled" | "near" | "lazy"
    TABLE_THUMB_SIZE:        90,
};
const MIN_VALID_IMAGE_SIZE = 150; // px — reject tiny placeholder images found inside topics
const FALLBACK_IMG = '//static.pornolab.net/templates/default/images/icon_minipost.gif';

// --------------------
// LOAD SETTINGS
// --------------------
let GRID_DARK_MODE         = GM_getValue('GRID_DARK_MODE',         DEFAULTS.GRID_DARK_MODE);
let GALLERY_VIEW_MODE      = GM_getValue('GALLERY_VIEW_MODE',      DEFAULTS.GALLERY_VIEW_MODE);
let GALLERY_CARD_MIN_WIDTH = GM_getValue('GALLERY_CARD_MIN_WIDTH', DEFAULTS.GALLERY_CARD_MIN_WIDTH);
let IMAGE_LOAD_MODE        = GM_getValue('IMAGE_LOAD_MODE',        DEFAULTS.IMAGE_LOAD_MODE);
let TABLE_THUMB_SIZE       = GM_getValue('TABLE_THUMB_SIZE',       DEFAULTS.TABLE_THUMB_SIZE);

function loadListSetting(key) {
    try {
        const parsed = JSON.parse(GM_getValue(key, '[]'));
        return Array.isArray(parsed) ? parsed.map(v => String(v).toLowerCase().trim()).filter(Boolean) : [];
    } catch (e) { return []; }
}
let FORUM_BLACKLIST    = loadListSetting('FORUM_BLACKLIST');
let FORUM_FAVORITES    = loadListSetting('FORUM_FAVORITES');
let UPLOADER_BLACKLIST = loadListSetting('UPLOADER_BLACKLIST');
let FAVORITE_GLOW_COLOR = GM_getValue('FAVORITE_GLOW_COLOR', '#f5c518');

let galleryLazyObserver = null; // used only by the gallery/grid cards
let tableLazyObserver   = null; // used only by the table view's Preview column

// --------------------
// DARK-MODE-DEPENDENT CARD COLORS
// --------------------
const CARD_BG       = GRID_DARK_MODE ? '#161616' : '#d0d0d0';
const CARD_BORDER   = GRID_DARK_MODE ? '#2a2a2a' : '#d8d8d8';
const IMAGE_BG       = GRID_DARK_MODE ? '#0d0d0d' : '#c0c0c0';
const TITLE_COLOR    = GRID_DARK_MODE ? '#c8d8ec' : '#1d4f8f';
const TITLE_HOVER    = GRID_DARK_MODE ? '#90b8e0' : '#0f3e75';
const META_COLOR     = GRID_DARK_MODE ? '#585858' : '#666666';
const FOOTER_COLOR   = GRID_DARK_MODE ? '#484848' : '#555555';
const FOOTER_BORDER  = GRID_DARK_MODE ? '#1e1e1e' : '#e0e0e0';
const TIME_COLOR     = GRID_DARK_MODE ? '#404040' : '#777777';
const CAT_BADGE_BG   = GRID_DARK_MODE ? 'rgba(0,0,0,0.78)' : 'rgba(255,255,255,0.92)';
const CAT_BADGE_COLOR= GRID_DARK_MODE ? '#e0e0e0' : '#333333';

// --------------------
// CSS
// --------------------
GM_addStyle(`
.viewer-gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(${GALLERY_CARD_MIN_WIDTH}px, 1fr));
    gap: 14px;
    padding: 14px 0;
}
.vg-card {
    background: ${CARD_BG};
    border: 1px solid ${CARD_BORDER};
    border-radius: 7px;
    overflow: visible;
    display: flex;
    flex-direction: column;
    position: relative;
    z-index: 1;
    transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.15s ease;
}
.vg-card:hover { border-color: #505050; transform: translateY(-3px); }
.vg-card:hover:not(.vg-fav-match) { box-shadow: 0 8px 24px rgba(0,0,0,0.55); }
.vg-img-wrap {
    position: relative; overflow: hidden; background: ${IMAGE_BG};
    height: 210px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.vg-img-wrap > a.vg-img-link {
    display: flex; align-items: center; justify-content: center;
    width: 100%; height: 100%; text-decoration: none;
}
.vg-img {
    max-width: 100%; max-height: 210px; width: auto; height: auto;
    object-fit: contain; display: block; transition: transform 0.25s ease;
}
.vg-card:hover .vg-img { transform: scale(1.04); }
.vg-cat-badge { position: absolute; top: 7px; left: 7px; z-index: 3; pointer-events: auto; }
.vg-cat-badge a {
    display: inline-block; background: ${CAT_BADGE_BG}; color: ${CAT_BADGE_COLOR} !important;
    font-size: 9px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
    padding: 3px 7px; border-radius: 3px; text-decoration: none !important;
    border: 1px solid rgba(255,255,255,0.1); transition: background 0.15s; white-space: nowrap;
}
.vg-cat-badge a:hover { background: rgba(40,40,40,0.92); }
.vg-forum-fav-btn, .vg-forum-bl-btn {
    background: rgba(0,0,0,0.55); border: none; color: #ddd; cursor: pointer;
    font-size: 10px; line-height: 1; border-radius: 3px; padding: 3px 5px;
    opacity: 0.35; transition: opacity 0.15s;
}
.vg-cat-badge:hover .vg-forum-fav-btn, .vg-cat-badge:hover .vg-forum-bl-btn { opacity: 1; }
.vg-info { padding: 9px 11px 10px; display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; }
.vg-title { line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.vg-title a { color: ${TITLE_COLOR}; text-decoration: none; font-size: 10px; font-weight: 600; transition: color 0.12s; }
.vg-title a:hover { color: ${TITLE_HOVER}; text-decoration: underline; }
.vg-stats { display: flex; flex-wrap: wrap; gap: 4px; }
.vg-stat {
    display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 700;
    padding: 2px 6px; border-radius: 3px; white-space: nowrap; letter-spacing: 0.01em;
}
.vg-stat-seed   { background: #132213; color: #5dc85d; border: 1px solid #254825; }
.vg-stat-leech  { background: #221313; color: #c85d5d; border: 1px solid #482525; }
.vg-stat-snatch { background: #131c26; color: #5d9dc8; border: 1px solid #253648; }
.vg-footer {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
    font-size: 10px; color: ${FOOTER_COLOR}; margin-top: auto; padding-top: 2px;
    border-top: 1px solid ${FOOTER_BORDER}; flex-wrap: wrap;
}
.vg-footer a { color: #5a7a9a; text-decoration: none; font-weight: 600; }
.vg-footer a:hover { text-decoration: underline; color: #7aa0c8; }
.vg-time { font-size: 9px; color: ${TIME_COLOR}; white-space: nowrap; flex-shrink: 0; }
.vg-dl-row { display: flex; margin-top: 1px; }
.vg-download-btn {
    display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 700;
    color: #7dc4ff !important; text-decoration: none; white-space: nowrap; background: #0d1e2e;
    border: 1px solid #1e3a55; border-radius: 3px; padding: 2px 7px;
    transition: background 0.15s, border-color 0.15s;
}
.vg-download-btn:hover { background: #152840; border-color: #3a6a9a; text-decoration: none !important; }
.vg-uploader-block-btn {
    background: none; border: none; cursor: pointer; font-size: 10px; padding: 0 1px;
    margin-left: 5px; opacity: 0.25; transition: opacity 0.15s; vertical-align: middle; line-height: 1; color: inherit;
}
.vg-uploader-block-btn:hover { opacity: 1; }
.vg-uploader-bl { color: #c05050 !important; text-decoration: line-through !important; opacity: 0.7; }
.vg-footer-block-btn {
    background: none; border: none; cursor: pointer; font-size: 10px; padding: 0 1px;
    margin-left: 3px; opacity: 0.2; transition: opacity 0.15s; line-height: 1; color: inherit; vertical-align: middle;
}
.vg-footer:hover .vg-footer-block-btn { opacity: 0.6; }
.vg-footer-block-btn:hover { opacity: 1 !important; }
@keyframes vg-glow-pulse {
    0%, 100% { box-shadow: 0 0 7px 2px var(--vg-glow-c), 0 2px 8px rgba(0,0,0,0.5); }
    50%       { box-shadow: 0 0 20px 6px var(--vg-glow-c), 0 2px 8px rgba(0,0,0,0.5); }
}
.vg-fav-match { position: relative; background: ${CARD_BG} !important; }

/* ── Nav buttons ── */
#pl_viewer_nav_wrap a { cursor: pointer; text-decoration: none; }
#pl_viewer_nav_wrap a:hover { text-decoration: underline; }

/* ── Table view extras ── */
.pl-preview-cell img { cursor: zoom-in; display: block; }
.pl-download-btn {
    display: inline-block; padding: 3px 8px; background: #2d4a2d; border: 1px solid #4a7a4a;
    color: #8fc88f !important; text-decoration: none; border-radius: 4px; font-size: 11px; font-weight: 700;
}
.pl-download-btn:hover { background: #3a5e3a; color: #aedaae !important; }
tr.pl-bl-hidden { display: none !important; }
`);

// --------------------
// CSS — settings overlay + changelog
// --------------------
GM_addStyle(`
#viewer-settings-backdrop {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.72);
    z-index: 99998; backdrop-filter: blur(2px);
}
#viewer-settings-backdrop.active { display: flex; align-items: center; justify-content: center; }
#viewer-settings-modal {
    position: relative; background: #1e1e1e; border: 1px solid #444; border-radius: 6px;
    width: 520px; max-width: 95vw; max-height: 88vh; overflow-y: auto; color: #d0d0d0;
    font-family: inherit; font-size: 12px; box-shadow: 0 8px 40px rgba(0,0,0,0.7); z-index: 99999;
}
#viewer-settings-modal .vsm-header {
    display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 10px;
    border-bottom: 1px solid #3a3a3a; position: sticky; top: 0; background: #1e1e1e; z-index: 1;
}
#viewer-settings-modal .vsm-header h2 {
    margin: 0; font-size: 13px; font-weight: 700; color: #e8e8e8; letter-spacing: 0.03em; text-transform: uppercase;
}
#viewer-settings-modal .vsm-header .vsm-close {
    background: none; border: none; color: #888; font-size: 18px; line-height: 1; cursor: pointer;
    padding: 0 2px; transition: color 0.15s;
}
#viewer-settings-modal .vsm-header .vsm-close:hover { color: #e0e0e0; }
#viewer-settings-modal .vsm-body { padding: 14px 16px 8px; }
#viewer-settings-modal .vsm-section { margin-bottom: 16px; }
#viewer-settings-modal .vsm-section-title {
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #888;
    margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid #2e2e2e;
}
#viewer-settings-modal .vsm-row {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
    padding: 6px 0; border-bottom: 1px solid #272727;
}
#viewer-settings-modal .vsm-row:last-child { border-bottom: none; }
#viewer-settings-modal .vsm-label-wrap { flex: 1; min-width: 0; }
#viewer-settings-modal .vsm-label { display: block; font-weight: 600; color: #ccc; font-size: 12px; line-height: 1.4; }
#viewer-settings-modal .vsm-hint { display: block; font-size: 10px; color: #666; margin-top: 2px; line-height: 1.3; }
#viewer-settings-modal .vsm-control { flex-shrink: 0; display: flex; align-items: center; }
#viewer-settings-modal select, #viewer-settings-modal input[type="number"] {
    background: #2b2b2b; border: 1px solid #404040; color: #d0d0d0; padding: 3px 6px; border-radius: 3px;
    font-size: 11px; outline: none; transition: border-color 0.15s;
}
#viewer-settings-modal select:hover, #viewer-settings-modal input[type="number"]:hover { border-color: #666; }
#viewer-settings-modal select:focus, #viewer-settings-modal input[type="number"]:focus { border-color: #888; }
#viewer-settings-modal input[type="number"] { width: 66px; text-align: center; }
#viewer-settings-modal select { min-width: 160px; }
#viewer-settings-modal .vsm-toggle { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
#viewer-settings-modal .vsm-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
#viewer-settings-modal .vsm-toggle-slider {
    position: absolute; inset: 0; background: #3a3a3a; border-radius: 20px; cursor: pointer;
    transition: background 0.2s; border: 1px solid #505050;
}
#viewer-settings-modal .vsm-toggle-slider::before {
    content: ''; position: absolute; width: 14px; height: 14px; left: 2px; top: 2px;
    background: #888; border-radius: 50%; transition: transform 0.2s, background 0.2s;
}
#viewer-settings-modal .vsm-toggle input:checked + .vsm-toggle-slider { background: #3d6e3d; border-color: #5a9e5a; }
#viewer-settings-modal .vsm-toggle input:checked + .vsm-toggle-slider::before { transform: translateX(16px); background: #7ec87e; }
#viewer-settings-modal .vsm-footer {
    display: flex; align-items: center; justify-content: space-between; padding: 10px 16px 14px;
    border-top: 1px solid #3a3a3a; margin-top: 4px; position: sticky; bottom: 0; background: #1e1e1e;
}
#viewer-settings-modal .vsm-footer-note { font-size: 10px; color: #555; }
#viewer-settings-modal .vsm-footer-btns { display: flex; gap: 8px; }
#viewer-settings-modal .vsm-btn {
    padding: 5px 14px; font-size: 11px; font-weight: 600; border-radius: 3px; cursor: pointer;
    border: 1px solid; transition: background 0.15s, color 0.15s; letter-spacing: 0.02em;
}
#viewer-settings-modal .vsm-btn-reset { background: #2a2a2a; border-color: #444; color: #888; }
#viewer-settings-modal .vsm-btn-reset:hover { background: #333; color: #bbb; border-color: #666; }
#viewer-settings-modal .vsm-btn-save { background: #2d4a2d; border-color: #4a7a4a; color: #8fc88f; }
#viewer-settings-modal .vsm-btn-save:hover { background: #3a5e3a; color: #aedaae; border-color: #6aaa6a; }
#viewer-settings-modal .vsm-saved-msg { font-size: 10px; color: #7ec87e; opacity: 0; transition: opacity 0.3s; margin-right: 8px; }
#viewer-settings-modal .vsm-saved-msg.visible { opacity: 1; }
#vsm-forum-chips-container, #vsm-fav-chips-container, #vsm-uploader-chips-container {
    padding: 6px 0 4px; display: flex; flex-wrap: wrap; gap: 3px; min-height: 24px;
}
#vsm-forum-chips-container .vsm-bl-chip, #vsm-uploader-chips-container .vsm-bl-chip {
    display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 600;
    padding: 2px 4px 2px 7px; border-radius: 3px; background: #2e1010; color: #e06060; border: 1px solid #602020;
}
#vsm-forum-chips-container .vsm-bl-chip button, #vsm-uploader-chips-container .vsm-bl-chip button {
    background: none; border: none; color: #c05050; font-size: 13px; line-height: 1; cursor: pointer;
    padding: 0 1px; margin-left: 1px; transition: color 0.12s;
}
#vsm-forum-chips-container .vsm-bl-chip button:hover, #vsm-uploader-chips-container .vsm-bl-chip button:hover { color: #ff8888; }
#vsm-fav-chips-container .vsm-fav-chip {
    display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 600;
    padding: 2px 4px 2px 7px; border-radius: 3px; background: #2e2500; color: #f5c518; border: 1px solid #7a6000;
}
#vsm-fav-chips-container .vsm-fav-chip button {
    background: none; border: none; color: #b09000; font-size: 13px; line-height: 1; cursor: pointer;
    padding: 0 1px; margin-left: 1px; transition: color 0.12s;
}
#vsm-fav-chips-container .vsm-fav-chip button:hover { color: #ffd740; }
#vsm-forum-add-row, #vsm-fav-add-row, #vsm-uploader-add-row { display: flex; gap: 6px; align-items: center; padding: 6px 0; }
#vsm-forum-add-input, #vsm-fav-add-input, #vsm-uploader-add-input {
    flex: 1; background: #2b2b2b; border: 1px solid #404040; color: #d0d0d0; padding: 3px 7px;
    border-radius: 3px; font-size: 11px; outline: none; transition: border-color 0.15s;
}
#vsm-forum-add-input:focus, #vsm-fav-add-input:focus, #vsm-uploader-add-input:focus { border-color: #888; }
.vsm-glow-swatches { display: flex; flex-wrap: wrap; gap: 7px; padding: 6px 0 4px; }
.vsm-glow-swatch {
    width: 26px; height: 26px; border-radius: 50%; cursor: pointer; border: 2px solid transparent;
    transition: transform 0.12s, border-color 0.12s; position: relative; flex-shrink: 0;
}
.vsm-glow-swatch:hover { transform: scale(1.18); }
.vsm-glow-swatch.selected { border-color: #ffffff; box-shadow: 0 0 0 1px rgba(255,255,255,0.3); }
.vsm-glow-swatch.selected::after {
    content: '✓'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 900; color: #000; text-shadow: 0 0 3px #fff;
}
#vcl-backdrop {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.78); z-index: 999997; backdrop-filter: blur(2px);
}
#vcl-backdrop.active { display: flex; align-items: center; justify-content: center; }
#vcl-modal {
    position: relative; background: #1a1a1a; border: 1px solid #3a3a3a; border-radius: 8px;
    width: 560px; max-width: 96vw; max-height: 86vh; overflow-y: auto; color: #d0d0d0;
    font-family: inherit; font-size: 12px; box-shadow: 0 10px 50px rgba(0,0,0,0.8); z-index: 999998;
}
#vcl-modal .vcl-header {
    display: flex; align-items: center; justify-content: space-between; padding: 14px 18px 12px;
    border-bottom: 1px solid #2e2e2e; position: sticky; top: 0; background: #1a1a1a; z-index: 1; gap: 10px;
}
#vcl-modal .vcl-header-left { display: flex; flex-direction: column; gap: 2px; }
#vcl-modal .vcl-header h2 { margin: 0; font-size: 14px; font-weight: 800; color: #f0f0f0; letter-spacing: 0.04em; text-transform: uppercase; }
#vcl-modal .vcl-header .vcl-subtitle { font-size: 10px; color: #666; letter-spacing: 0.02em; }
#vcl-modal .vcl-body { padding: 14px 18px 6px; }
#vcl-modal .vcl-version-block { margin-bottom: 18px; }
#vcl-modal .vcl-version-block:last-child { margin-bottom: 0; }
#vcl-modal .vcl-version-label {
    display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
    color: #7ec87e; background: #1a2e1a; border: 1px solid #2e5e2e; padding: 2px 8px; border-radius: 3px; margin-bottom: 8px;
}
#vcl-modal .vcl-changes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
#vcl-modal .vcl-changes li { display: flex; gap: 8px; align-items: flex-start; font-size: 11px; color: #c0c0c0; line-height: 1.5; }
#vcl-modal .vcl-changes li::before { content: '→'; color: #5a8a5a; font-weight: 700; flex-shrink: 0; margin-top: 0px; }
#vcl-modal .vcl-footer {
    display: flex; align-items: center; justify-content: space-between; padding: 12px 18px 16px;
    border-top: 1px solid #2e2e2e; margin-top: 10px; position: sticky; bottom: 0; background: #1a1a1a; gap: 10px; flex-wrap: wrap;
}
#vcl-modal .vcl-github-link { font-size: 11px; color: #5a7a9a; text-decoration: none; font-weight: 600; }
#vcl-modal .vcl-github-link:hover { color: #7aa0c8; text-decoration: underline; }
#vcl-modal .vcl-ok-btn {
    padding: 6px 22px; font-size: 12px; font-weight: 700; border-radius: 4px; cursor: pointer;
    background: #2d4a2d; border: 1px solid #4a7a4a; color: #8fc88f; transition: background 0.15s, color 0.15s; letter-spacing: 0.03em;
}
#vcl-modal .vcl-ok-btn:hover { background: #3a5e3a; color: #aedaae; border-color: #6aaa6a; }
`);

// --------------------
// ROW PARSING HELPERS — Pornolab's #tor-tbl structure
// (selectors are used instead of fixed td indices wherever possible, since
//  optional columns like the private-torrent shield can be toggled on/off
//  per user preference and would otherwise shift offsets)
// --------------------
function getRows() {
    return jQuery('#tor-tbl > tbody > tr.tCenter');
}

function getTopicIdFromRow($row) {
    const $link = $row.find('a.tLink').first();
    if (!$link.length) return null;
    const m = ($link.attr('href') || '').match(/[?&]t=(\d+)/);
    return m ? m[1] : null;
}

function getForumFromRow($row) {
    const $a = $row.find('a.gen.f').first();
    let text = ($a.length ? $a.text() : '').trim();
    if (text.includes(' / ')) {
        const parts = text.split(' / ');
        text = parts[parts.length - 1].trim();
    }
    return text;
}
function getForumHrefFromRow($row) {
    const $a = $row.find('a.gen.f').first();
    return $a.length ? ($a.attr('href') || '#') : '#';
}

function getTitleFromRow($row) {
    const $a = $row.find('a.tLink').first();
    return {
        text: $a.length ? $a.text().trim() : '(unknown)',
        href: $a.length ? ($a.attr('href') || '#') : '#',
    };
}

function getAuthorFromRow($row) {
    const $a = $row.find('a[href*="tracker.php?pid="]').first();
    return {
        text: $a.length ? $a.text().trim() : '',
        href: $a.length ? ($a.attr('href') || '#') : '#',
    };
}

function getSizeAndDownloadFromRow($row) {
    const $dl = $row.find('a.tr-dl').first();
    return {
        sizeText: $dl.length ? $dl.text().trim() : '',
        downloadHref: $dl.length ? ($dl.attr('href') || '') : '',
    };
}

function getSeedersFromRow($row) {
    const $td = $row.find('> td.seedmed, > td[class*="seedmed"]').first();
    const $b = $td.find('b').first();
    return $b.length ? $b.text().trim() : (td => td.length ? td.text().trim() : '')($td);
}

function getLeechersFromRow($row) {
    const $td = $row.find('> td[title="Личи"], > td.leechmed').first();
    const $b = $td.find('b').first();
    return $b.length ? $b.text().trim() : (td => td.length ? td.text().trim() : '')($td);
}

// Completed/"snatched" count sits between the leech column and the private-torrent
// column; both are plain numeric small tds so we identify it positionally from the
// end of the row (last td = date, 2nd-to-last = private torrent indicator).
function getCompletedFromRow($row) {
    const $tds = $row.find('> td');
    if ($tds.length < 3) return '';
    const $candidate = $tds.eq($tds.length - 3);
    const text = $candidate.text().trim();
    return /^\d+$/.test(text) ? text : '';
}

function getDateFromRow($row) {
    const $dateTd = $row.find('> td').last();
    const $ps = $dateTd.find('p');
    const time = $ps.eq(0).length ? $ps.eq(0).text().trim() : '';
    const date = $ps.eq(1).length ? translateMonth($ps.eq(1).text().trim()) : '';
    return { time, date, combined: (date + ' ' + time).trim() };
}

const MONTH_MAP = {
    'Янв': 'Jan', 'Фев': 'Feb', 'Мар': 'Mar', 'Апр': 'Apr', 'Май': 'May', 'Июн': 'Jun',
    'Июл': 'Jul', 'Авг': 'Aug', 'Сен': 'Sep', 'Окт': 'Oct', 'Ноя': 'Nov', 'Дек': 'Dec',
};
function translateMonth(text) {
    let out = text;
    Object.keys(MONTH_MAP).forEach(ru => { out = out.replace(new RegExp(ru, 'g'), MONTH_MAP[ru]); });
    return out;
}

// --------------------
// PREVIEW IMAGE FETCH — pulls the first valid image out of the topic page
// (ported from the Pornolab preview script's var.postImg / size-validation logic)
// --------------------
const imagePreviewCache = {};     // topicId -> src string | null
const pendingImageFetches = {};   // topicId -> [callback, ...]

function fetchPreviewImageForTopic(topicId, topicHref, callback) {
    if (!topicId) { callback(null); return; }
    if (imagePreviewCache.hasOwnProperty(topicId)) { callback(imagePreviewCache[topicId]); return; }
    if (pendingImageFetches[topicId]) { pendingImageFetches[topicId].push(callback); return; }
    pendingImageFetches[topicId] = [callback];

    jQuery.ajax({
        url: topicHref,
        method: 'GET',
        success: function (html) {
            const $page = jQuery('<div>').html(html);
            const $imageTags = $page.find('var.postImg');
            tryTopicImage($imageTags, 0, null, function (finalSrc) {
                imagePreviewCache[topicId] = finalSrc;
                resolvePending(topicId, finalSrc);
            });
        },
        error: function () {
            imagePreviewCache[topicId] = null;
            resolvePending(topicId, null);
        },
    });
}

function resolvePending(topicId, src) {
    const cbs = pendingImageFetches[topicId] || [];
    delete pendingImageFetches[topicId];
    cbs.forEach(cb => cb(src));
}

// Walks the var.postImg tags found on a topic page, testing each image's real
// dimensions and skipping tiny placeholder/banner images until a valid one is found.
function tryTopicImage($imageTags, index, fallbackSrc, done) {
    if (index >= $imageTags.length) { done(fallbackSrc); return; }
    const tag = $imageTags.get(index);
    const imgSrc = tag ? tag.getAttribute('title') : null;
    if (!imgSrc) { tryTopicImage($imageTags, index + 1, fallbackSrc, done); return; }

    const testImg = new Image();
    testImg.onload = function () {
        if (this.width >= MIN_VALID_IMAGE_SIZE && this.height >= MIN_VALID_IMAGE_SIZE) {
            done(imgSrc);
        } else {
            tryTopicImage($imageTags, index + 1, fallbackSrc || imgSrc, done);
        }
    };
    testImg.onerror = function () { tryTopicImage($imageTags, index + 1, fallbackSrc, done); };
    testImg.src = imgSrc;
}

function loadImageForImgElement(imgEl, topicId, topicHref) {
    fetchPreviewImageForTopic(topicId, topicHref, function (src) {
        if (!imgEl) return;
        imgEl.src = src || FALLBACK_IMG;
    });
}

// --------------------
// FORUM BLACKLIST / FAVORITES — Pornolab has one forum per row instead of tags,
// so this replaces the HF/EMP script's Tag Blacklist / Favorite Tags feature.
// --------------------
function saveForumBlacklist()    { GM_setValue('FORUM_BLACKLIST', JSON.stringify(FORUM_BLACKLIST)); }
function saveForumFavorites()    { GM_setValue('FORUM_FAVORITES', JSON.stringify(FORUM_FAVORITES)); }
function saveUploaderBlacklist() { GM_setValue('UPLOADER_BLACKLIST', JSON.stringify(UPLOADER_BLACKLIST)); }

function rowMatchesForumBlacklist($row) {
    if (!FORUM_BLACKLIST.length) return false;
    const forum = getForumFromRow($row).toLowerCase();
    return forum && FORUM_BLACKLIST.indexOf(forum) !== -1;
}
function rowMatchesFavoriteForum($row) {
    if (!FORUM_FAVORITES.length) return false;
    const forum = getForumFromRow($row).toLowerCase();
    return forum && FORUM_FAVORITES.indexOf(forum) !== -1;
}
function rowMatchesUploaderBlacklist($row) {
    if (!UPLOADER_BLACKLIST.length) return false;
    const uploader = getAuthorFromRow($row).text.toLowerCase();
    return uploader && UPLOADER_BLACKLIST.indexOf(uploader) !== -1;
}

function toggleForumInBlacklist(forumName) {
    const key = forumName.toLowerCase().trim();
    if (!key) return;
    const favIdx = FORUM_FAVORITES.indexOf(key);
    if (favIdx !== -1) { FORUM_FAVORITES.splice(favIdx, 1); saveForumFavorites(); } // mutual exclusivity
    const idx = FORUM_BLACKLIST.indexOf(key);
    if (idx === -1) FORUM_BLACKLIST.push(key); else FORUM_BLACKLIST.splice(idx, 1);
    saveForumBlacklist();
    applyAllFiltersToPage();
    refreshForumSettingsPanel();
    refreshFavoriteForumsPanel();
}
function toggleForumInFavorites(forumName) {
    const key = forumName.toLowerCase().trim();
    if (!key) return;
    const blIdx = FORUM_BLACKLIST.indexOf(key);
    if (blIdx !== -1) { FORUM_BLACKLIST.splice(blIdx, 1); saveForumBlacklist(); } // mutual exclusivity
    const idx = FORUM_FAVORITES.indexOf(key);
    if (idx === -1) FORUM_FAVORITES.push(key); else FORUM_FAVORITES.splice(idx, 1);
    saveForumFavorites();
    applyAllFiltersToPage();
    refreshForumSettingsPanel();
    refreshFavoriteForumsPanel();
}
function toggleUploaderInBlacklist(name) {
    const key = String(name).toLowerCase().trim();
    if (!key) return;
    const idx = UPLOADER_BLACKLIST.indexOf(key);
    if (idx === -1) UPLOADER_BLACKLIST.push(key); else UPLOADER_BLACKLIST.splice(idx, 1);
    saveUploaderBlacklist();
    applyAllFiltersToPage();
    refreshUploaderSettingsPanel();
}

// Re-applies blacklist hide/show + favorite glow across whichever view is active.
function applyAllFiltersToPage() {
    if (GALLERY_VIEW_MODE && jQuery('.viewer-gallery-grid').length) {
        buildGalleryView();
        return;
    }
    getRows().each(function () {
        const $r = jQuery(this);
        const hide = rowMatchesForumBlacklist($r) || rowMatchesUploaderBlacklist($r);
        if (hide) {
            $r.addClass('pl-bl-hidden');
            removeGlowFromRow($r);
        } else {
            $r.removeClass('pl-bl-hidden');
            if (rowMatchesFavoriteForum($r)) applyGlowToRow($r); else removeGlowFromRow($r);
        }
    });
}

// --------------------
// GLOW HELPERS (favorite forum match)
// --------------------
const GLOW_COLORS = [
    { hex: '#f5c518', name: 'Gold'   }, { hex: '#00d4ff', name: 'Cyan'   },
    { hex: '#39ff14', name: 'Green'  }, { hex: '#ff69b4', name: 'Pink'   },
    { hex: '#bf5fff', name: 'Purple' }, { hex: '#ff8c00', name: 'Orange' },
    { hex: '#ff4444', name: 'Red'    }, { hex: '#00ffcc', name: 'Teal'   },
    { hex: '#ffffff', name: 'White'  },
];

function applyGlowToCard($card) {
    const c = FAVORITE_GLOW_COLOR || '#f5c518';
    $card.css({
        '--vg-glow-c': c,
        'border': `2px solid ${c}`,
        'box-shadow': `0 0 5px ${c}, 0 0 10px ${c}, 0 0 15px ${c}, 0 0 25px ${c}`,
    }).addClass('vg-fav-match');
}
function applyGlowToRow($row) {
    const c = FAVORITE_GLOW_COLOR;
    $row.css({
        'box-shadow': 'inset 3px 0 0 0 ' + c + ', 0 0 12px 3px ' + c + '55',
        'background-color': c + '33',
    }).addClass('vg-fav-match').css('--vg-glow-c', c);
}
function removeGlowFromRow($row) {
    $row.css({ 'box-shadow': '', 'background-color': '' }).removeClass('vg-fav-match');
}

// --------------------
// GALLERY — BUILD A SINGLE CARD FROM A TABLE ROW
// --------------------
function buildGalleryCard($row) {
    try {
        const topicId    = getTopicIdFromRow($row);
        const forumName  = getForumFromRow($row);
        const forumHref  = getForumHrefFromRow($row);
        const titleInfo  = getTitleFromRow($row);
        const authorInfo = getAuthorFromRow($row);
        const sizeInfo   = getSizeAndDownloadFromRow($row);
        const seeders    = getSeedersFromRow($row);
        const leechers   = getLeechersFromRow($row);
        const completed  = getCompletedFromRow($row);
        const dateInfo   = getDateFromRow($row);

        const $card    = jQuery('<div class="vg-card">');
        const $imgWrap = jQuery('<div class="vg-img-wrap">');

        if (forumName) {
            const $badgeWrap = jQuery('<div class="vg-cat-badge" style="display:flex;gap:3px;align-items:center;">');
            jQuery('<a>').attr('href', forumHref).text(forumName.toUpperCase()).appendTo($badgeWrap);

            const isFav = FORUM_FAVORITES.indexOf(forumName.toLowerCase()) !== -1;
            const isBl  = FORUM_BLACKLIST.indexOf(forumName.toLowerCase()) !== -1;
            const $favBtn = jQuery('<button type="button" class="vg-forum-fav-btn">').html(isFav ? '&#9733;' : '&#9734;')
                .attr('title', isFav ? 'Remove favorite forum' : 'Mark forum as favorite (glow)');
            const $blBtn  = jQuery('<button type="button" class="vg-forum-bl-btn">&#9940;</button>')
                .attr('title', isBl ? 'Un-blacklist this forum' : 'Blacklist this forum');
            $favBtn.on('click', function (e) { e.preventDefault(); e.stopPropagation(); toggleForumInFavorites(forumName); });
            $blBtn.on('click',  function (e) { e.preventDefault(); e.stopPropagation(); toggleForumInBlacklist(forumName); });
            $badgeWrap.append($favBtn, $blBtn);
            $imgWrap.append($badgeWrap);
        }

        const $img = jQuery('<img class="vg-img" alt="">');
        $img.one('error', function () { this.src = FALLBACK_IMG; });
        const $imgLink = jQuery('<a class="vg-img-link" target="_blank">').attr('href', titleInfo.href).append($img);
        $imgWrap.append($imgLink);

        if (topicId) {
            if (IMAGE_LOAD_MODE !== 'disabled' && galleryLazyObserver) {
                $img.attr('data-topic-id', topicId).attr('data-topic-href', titleInfo.href);
                setTimeout(() => { if ($img[0]) galleryLazyObserver.observe($img[0]); }, 0);
            } else {
                loadImageForImgElement($img[0], topicId, titleInfo.href);
            }
        } else {
            $img.attr('src', FALLBACK_IMG);
        }

        const $info = jQuery('<div class="vg-info">');
        const $titleDiv = jQuery('<div class="vg-title">');
        jQuery('<a target="_blank">').attr('href', titleInfo.href).text(titleInfo.text).appendTo($titleDiv);
        $info.append($titleDiv);

        if (sizeInfo.downloadHref) {
            const $btnRow = jQuery('<div class="vg-dl-row">');
            jQuery('<a>').attr('href', sizeInfo.downloadHref).addClass('vg-download-btn')
                .html('&#11015; ' + (sizeInfo.sizeText || 'Download')).appendTo($btnRow);
            $info.append($btnRow);
        }

        const $stats = jQuery('<div class="vg-stats">');
        if (seeders   !== '') $stats.append(jQuery('<span class="vg-stat vg-stat-seed"  title="Seeders">').text('▲ ' + seeders));
        if (leechers  !== '') $stats.append(jQuery('<span class="vg-stat vg-stat-leech" title="Leechers">').text('▼ ' + leechers));
        if (completed !== '') $stats.append(jQuery('<span class="vg-stat vg-stat-snatch" title="Completed">').text('⤓ ' + completed));
        if ($stats.children().length) $info.append($stats);

        const $footer = jQuery('<div class="vg-footer">');
        if (authorInfo.text) {
            const key = authorInfo.text.toLowerCase();
            const isUlBl = UPLOADER_BLACKLIST.indexOf(key) !== -1;
            const $ulWrap = jQuery('<span style="display:inline-flex;align-items:center;gap:1px;">');
            const $uploaderA = jQuery('<a>').attr('href', authorInfo.href).text('👤 ' + authorInfo.text)
                .toggleClass('vg-uploader-bl', isUlBl);
            $ulWrap.append($uploaderA);
            const $blockBtn = jQuery('<button class="vg-footer-block-btn" type="button">⛔</button>')
                .attr('title', isUlBl ? 'Blocked — click to unblock ' + authorInfo.text : 'Block uploader: ' + authorInfo.text);
            $blockBtn.on('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                toggleUploaderInBlacklist(key);
                const nowBl = UPLOADER_BLACKLIST.indexOf(key) !== -1;
                $uploaderA.toggleClass('vg-uploader-bl', nowBl);
                jQuery(this).attr('title', nowBl ? 'Blocked — click to unblock ' + authorInfo.text : 'Block uploader: ' + authorInfo.text);
            });
            $ulWrap.append($blockBtn);
            $footer.append($ulWrap);
        }
        if (dateInfo.combined) {
            jQuery('<span class="vg-time">').text(dateInfo.combined).appendTo($footer);
        }
        $info.append($footer);

        $card.append($imgWrap, $info);
        if (rowMatchesFavoriteForum($row)) applyGlowToCard($card);
        return $card;
    } catch (e) {
        console.error(`${LOG_PREFIX} buildGalleryCard error:`, e, $row);
        return null;
    }
}

// --------------------
// GALLERY — BUILD / DESTROY / TOGGLE
// --------------------
function buildGalleryView() {
    const $table = jQuery('#tor-tbl');
    if (!$table.length) { console.warn(`${LOG_PREFIX} buildGalleryView: #tor-tbl not found`); return; }

    jQuery('.viewer-gallery-grid').remove();

    if (galleryLazyObserver) galleryLazyObserver.disconnect();
    if (IMAGE_LOAD_MODE !== 'disabled') {
        const rootMargin = IMAGE_LOAD_MODE === 'lazy' ? '0px' : '150% 0px';
        const threshold  = IMAGE_LOAD_MODE === 'lazy' ? 0.1 : 0.01;
        galleryLazyObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const img = entry.target;
                const topicId   = img.getAttribute('data-topic-id');
                const topicHref = img.getAttribute('data-topic-href');
                galleryLazyObserver.unobserve(img);
                if (topicId) loadImageForImgElement(img, topicId, topicHref);
            });
        }, { root: null, rootMargin, threshold });
    } else {
        galleryLazyObserver = null;
    }

    const $grid = jQuery('<div class="viewer-gallery-grid">');
    getRows().each(function () {
        const $r = jQuery(this);
        if (rowMatchesForumBlacklist($r) || rowMatchesUploaderBlacklist($r)) return;
        const $card = buildGalleryCard($r);
        if ($card) $grid.append($card);
    });

    if ($grid.children().length) {
        $table.hide();
        $table.after($grid);
    }
    updateGalleryToggleLabel(true);
}

function destroyGalleryView() {
    jQuery('.viewer-gallery-grid').remove();
    jQuery('#tor-tbl').show();
    if (galleryLazyObserver) { galleryLazyObserver.disconnect(); galleryLazyObserver = null; }
    updateGalleryToggleLabel(false);
}

function toggleGalleryMode() {
    GALLERY_VIEW_MODE = !GALLERY_VIEW_MODE;
    GM_setValue('GALLERY_VIEW_MODE', GALLERY_VIEW_MODE);
    if (GALLERY_VIEW_MODE) buildGalleryView(); else destroyGalleryView();
}

function updateGalleryToggleLabel(isGrid) {
    const $btn = jQuery('#pl-gallery-toggle-btn');
    if ($btn.length) {
        $btn.html(isGrid ? '&#9776; List' : '&#10697; Grid');
        $btn.attr('title', isGrid ? 'Switch to table view' : 'Switch to grid view');
    }
    jQuery('#vsm-GALLERY_VIEW_MODE').prop('checked', isGrid);
}

// --------------------
// TABLE VIEW ENHANCEMENTS
// (English-only category text, translated dates, preview + download columns,
//  uploader block button, blacklist hide, favorite glow — applied once per row)
// --------------------
function injectTableHeaders() {
    const $headerRow = jQuery('#tor-tbl thead tr').first();
    if (!$headerRow.length) return;
    if ($headerRow.find('th.pl-preview-th').length) return; // already injected
    const $forumTh = $headerRow.children().eq(2); // "Форум" header — insert Preview/Download right after it, before "Тема"
    const $previewTh = jQuery('<th class="{sorter: false} pl-preview-th"><b class="tbs-text">Preview</b></th>');
    const $downloadTh = jQuery('<th class="{sorter: false} pl-download-th"><b class="tbs-text">DL</b></th>');
    $forumTh.after($previewTh);
    $previewTh.after($downloadTh);
}

function enhanceTableRow($row) {
    if ($row.data('pl-enhanced')) return;
    $row.data('pl-enhanced', true);

    // English-only forum text
    try {
        const $forumA = $row.find('a.gen.f').first();
        if ($forumA.length) {
            const original = $forumA.text();
            if (original.includes(' / ')) {
                const parts = original.split(' / ');
                $forumA.text(parts[parts.length - 1].trim());
            }
        }
    } catch (e) { console.error(`${LOG_PREFIX} forum text cleanup error:`, e); }

    // Translate Russian month abbreviation in the date column
    try {
        const $dateTd = $row.find('> td').last();
        const $dateP = $dateTd.find('p').eq(1);
        if ($dateP.length) $dateP.text(translateMonth($dateP.text()));
    } catch (e) { console.error(`${LOG_PREFIX} date translation error:`, e); }

    // Insert Preview + Download cells right after the forum (3rd) column, before the title —
    // keeping these columns on the left side of the row means the hover-zoom popup opens
    // with plenty of horizontal room before it would run off the right edge of the viewport.
    const $forumTd = $row.find('> td').eq(2);
    const $previewTd = jQuery('<td class="pl-preview-cell">');
    const $downloadTd = jQuery('<td class="pl-download-cell">');
    $forumTd.after($previewTd);
    $previewTd.after($downloadTd);

    const sizeInfo = getSizeAndDownloadFromRow($row);
    if (sizeInfo.downloadHref) {
        jQuery('<a class="pl-download-btn">').attr('href', sizeInfo.downloadHref).attr('target', '_blank')
            .html('&#11015;').appendTo($downloadTd);
    }

    const topicId = getTopicIdFromRow($row);
    const titleInfo = getTitleFromRow($row);
    if (topicId) {
        const $thumb = jQuery('<img>').css({
            'max-width': TABLE_THUMB_SIZE + 'px', 'max-height': TABLE_THUMB_SIZE + 'px', cursor: 'zoom-in',
        });
        $thumb.one('error', function () { this.src = FALLBACK_IMG; });
        $previewTd.append($thumb);

        const loadThisPreview = function () {
            fetchPreviewImageForTopic(topicId, titleInfo.href, function (src) {
                const finalSrc = src || FALLBACK_IMG;
                $thumb.attr('src', finalSrc);
                if (src) attachZoomPopup($thumb, finalSrc);
            });
        };

        if (IMAGE_LOAD_MODE === 'disabled') {
            loadThisPreview();
        } else if (tableLazyObserver) {
            $thumb.attr('data-pl-table-preview', '1');
            $thumb[0]._loadPreview = loadThisPreview;
            tableLazyObserver.observe($thumb[0]);
        } else {
            loadThisPreview();
        }
    }

    // Uploader block button next to author link
    const authorInfo = getAuthorFromRow($row);
    if (authorInfo.text) {
        const $authorA = $row.find('a[href*="tracker.php?pid="]').first();
        if ($authorA.length && !$row.data('pl-uploader-btn-added')) {
            $row.data('pl-uploader-btn-added', true);
            const key = authorInfo.text.toLowerCase();
            const $btn = jQuery('<button class="vg-uploader-block-btn" type="button">⛔</button>')
                .attr('title', 'Block uploader: ' + authorInfo.text);
            $btn.on('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                toggleUploaderInBlacklist(key);
            });
            $authorA.after($btn);
        }
    }

    // Blacklist hide / favorite glow
    if (rowMatchesForumBlacklist($row) || rowMatchesUploaderBlacklist($row)) {
        $row.addClass('pl-bl-hidden');
    } else if (rowMatchesFavoriteForum($row)) {
        applyGlowToRow($row);
    }
}

// Hover-zoom popup, ported from the original Pornolab preview script, with viewport
// clamping added: if the zoomed image would run off the right/bottom edge, it flips
// to the left/above the cursor instead of being cut off.
function attachZoomPopup($thumb, imgSrc) {
    const popup = document.createElement('div');
    Object.assign(popup.style, {
        position: 'fixed', display: 'none', zIndex: '9999', border: '2px solid #000',
        backgroundColor: '#000', padding: '1px', pointerEvents: 'none',
    });
    const popupImg = document.createElement('img');
    popupImg.src = imgSrc;
    Object.assign(popupImg.style, { maxWidth: '600px', maxHeight: '400px', display: 'block' });
    popup.appendChild(popupImg);
    document.body.appendChild(popup);

    function positionPopup(clientX, clientY) {
        const pad = 12;
        popup.style.display = 'block';
        const rect = popup.getBoundingClientRect();

        let left = clientX + 20;
        if (left + rect.width + pad > window.innerWidth) {
            left = clientX - rect.width - 20; // flip to the left of the cursor
        }
        left = Math.min(Math.max(left, pad), window.innerWidth - rect.width - pad);

        let top = clientY + 20;
        if (top + rect.height + pad > window.innerHeight) {
            top = clientY - rect.height - 20; // flip above the cursor
        }
        top = Math.min(Math.max(top, pad), window.innerHeight - rect.height - pad);

        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
    }

    $thumb.on('mouseenter', function (e) { positionPopup(e.clientX, e.clientY); });
    $thumb.on('mousemove', function (e) { positionPopup(e.clientX, e.clientY); });
    $thumb.on('mouseleave', function () { popup.style.display = 'none'; });
}

function enhanceAllTableRows() {
    // Dedicated observer for table-view lazy preview thumbnails. This is intentionally
    // separate from galleryLazyObserver: building/destroying the gallery grid disconnects
    // and replaces galleryLazyObserver, which previously wiped out any table thumbnails
    // still waiting to load whenever the grid was toggled on, even after switching back.
    if (!tableLazyObserver && IMAGE_LOAD_MODE !== 'disabled') {
        const rootMargin = IMAGE_LOAD_MODE === 'lazy' ? '0px' : '150% 0px';
        const threshold  = IMAGE_LOAD_MODE === 'lazy' ? 0.1 : 0.01;
        tableLazyObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                if (typeof el._loadPreview === 'function') { el._loadPreview(); el._loadPreview = null; }
                tableLazyObserver.unobserve(el);
            });
        }, { root: null, rootMargin, threshold });
    }
    injectTableHeaders();
    getRows().each(function () { enhanceTableRow(jQuery(this)); });
}

// --------------------
// SETTINGS OVERLAY
// --------------------
function buildSettingsOverlay() {
    function toggle(id, checked) {
        return `<label class="vsm-toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="vsm-toggle-slider"></span></label>`;
    }
    function select(id, options, value) {
        const opts = options.map(([v, label]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${label}</option>`).join('');
        return `<select id="${id}">${opts}</select>`;
    }
    function row(labelText, hint, controlHtml) {
        return `<div class="vsm-row"><div class="vsm-label-wrap"><span class="vsm-label">${labelText}</span>${hint ? `<span class="vsm-hint">${hint}</span>` : ''}</div><div class="vsm-control">${controlHtml}</div></div>`;
    }

    const html = `
    <div id="viewer-settings-backdrop">
        <div id="viewer-settings-modal">
            <div class="vsm-header">
                <h2>&#9881; Viewer Settings ${SCRIPT_VERSION}</h2>
                <button class="vsm-close" id="vsm-close-btn">&#x2715;</button>
            </div>
            <div class="vsm-body">
                <div class="vsm-section">
                    <p class="vsm-section-title">Table View</p>
                    ${row('Preview Thumbnail Size', 'Max width/height of the Preview column thumbnail (px)',
                          `<input type="number" id="vsm-TABLE_THUMB_SIZE" min="40" max="300" step="10" value="${TABLE_THUMB_SIZE}">`)}
                </div>
                <div class="vsm-section">
                    <p class="vsm-section-title">Gallery View</p>
                    ${row('Gallery Mode', 'Display results as an image card grid instead of the table.', toggle('vsm-GALLERY_VIEW_MODE', GALLERY_VIEW_MODE))}
                    ${row('Card Dark Mode', 'Dark styling for the gallery cards.', toggle('vsm-GRID_DARK_MODE', GRID_DARK_MODE))}
                    ${row('Min Card Width', 'Minimum card width in the grid (px).',
                          `<input type="number" id="vsm-GALLERY_CARD_MIN_WIDTH" min="140" max="480" step="10" value="${GALLERY_CARD_MIN_WIDTH}">`)}
                </div>
                <div class="vsm-section">
                    <p class="vsm-section-title">Performance</p>
                    ${row('Image Load Mode', 'When preview images are fetched from inside each topic, relative to the viewport.',
                          select('vsm-IMAGE_LOAD_MODE', [['disabled','Immediate (no lazy load)'],['near','Near (~1–2 screens away)'],['lazy','Lazy (only when visible)']], IMAGE_LOAD_MODE))}
                </div>
                <div class="vsm-section" id="vsm-forums-section">
                    <p class="vsm-section-title">Forum Blacklist</p>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Blacklisted Forums</span>
                        <span class="vsm-hint">Rows/cards from blacklisted forums are hidden immediately.</span>
                    </div>
                    <div id="vsm-forum-chips-container"></div>
                    <div id="vsm-forum-add-row">
                        <input type="text" id="vsm-forum-add-input" placeholder="e.g. Feature &amp; Vignettes" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-forum-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-forum-clear-btn" type="button">Clear all</button>
                    </div>
                </div>
                <div class="vsm-section" id="vsm-fav-forums-section">
                    <p class="vsm-section-title">Favorite Forums</p>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Glow Color</span>
                        <span class="vsm-hint">Color of the glow effect on rows/cards from a favorite forum.</span>
                    </div>
                    <div class="vsm-glow-swatches" id="vsm-glow-swatches"></div>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Favorited Forums</span>
                    </div>
                    <div id="vsm-fav-chips-container"></div>
                    <div id="vsm-fav-add-row">
                        <input type="text" id="vsm-fav-add-input" placeholder="e.g. SiteRip's 2026" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-fav-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-fav-clear-btn" type="button">Clear all</button>
                    </div>
                </div>
                <div class="vsm-section" id="vsm-uploaders-section">
                    <p class="vsm-section-title">Uploader Blacklist</p>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Blacklisted Uploaders</span>
                        <span class="vsm-hint">Click ⛔ next to an uploader name anywhere to block them instantly.</span>
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
                </div>
                <div class="vsm-footer-btns">
                    <button class="vsm-btn vsm-btn-reset" id="vsm-reset-btn">Reset defaults</button>
                    <button class="vsm-btn vsm-btn-save"  id="vsm-save-btn">Save &amp; close</button>
                </div>
            </div>
        </div>
    </div>`;

    jQuery('body').append(html);

    jQuery('#viewer-settings-backdrop').on('click', function (e) { if (e.target === this) closeOverlay(); });
    jQuery('#vsm-close-btn').on('click', closeOverlay);
    jQuery(document).on('keydown.vsm', function (e) { if (e.key === 'Escape') closeOverlay(); });

    // Forum blacklist handlers
    jQuery(document).on('click', '#vsm-forum-add-btn', function () {
        const val = jQuery('#vsm-forum-add-input').val().trim();
        if (!val) return;
        const key = val.toLowerCase();
        if (FORUM_BLACKLIST.indexOf(key) === -1) FORUM_BLACKLIST.push(key);
        saveForumBlacklist(); applyAllFiltersToPage();
        jQuery('#vsm-forum-add-input').val('');
        refreshForumSettingsPanel();
    });
    jQuery(document).on('keydown', '#vsm-forum-add-input', function (e) { if (e.key === 'Enter') jQuery('#vsm-forum-add-btn').trigger('click'); });
    jQuery(document).on('click', '#vsm-forum-clear-btn', function () {
        if (!FORUM_BLACKLIST.length) return;
        if (!confirm('Remove all ' + FORUM_BLACKLIST.length + ' blacklisted forum(s)?')) return;
        FORUM_BLACKLIST = []; saveForumBlacklist(); applyAllFiltersToPage(); refreshForumSettingsPanel();
    });

    // Favorite forums handlers
    jQuery(document).on('click', '#vsm-fav-add-btn', function () {
        const val = jQuery('#vsm-fav-add-input').val().trim();
        if (!val) return;
        toggleForumInFavoritesIfAbsent(val);
        jQuery('#vsm-fav-add-input').val('');
        refreshFavoriteForumsPanel();
    });
    jQuery(document).on('keydown', '#vsm-fav-add-input', function (e) { if (e.key === 'Enter') jQuery('#vsm-fav-add-btn').trigger('click'); });
    jQuery(document).on('click', '#vsm-fav-clear-btn', function () {
        if (!FORUM_FAVORITES.length) return;
        if (!confirm('Remove all ' + FORUM_FAVORITES.length + ' favorite forum(s)?')) return;
        FORUM_FAVORITES = []; saveForumFavorites(); applyAllFiltersToPage(); refreshFavoriteForumsPanel();
    });

    // Uploader blacklist handlers
    jQuery(document).on('click', '#vsm-uploader-add-btn', function () {
        const val = jQuery('#vsm-uploader-add-input').val().trim().toLowerCase();
        if (!val) return;
        if (UPLOADER_BLACKLIST.indexOf(val) === -1) UPLOADER_BLACKLIST.push(val);
        saveUploaderBlacklist(); applyAllFiltersToPage();
        jQuery('#vsm-uploader-add-input').val('');
        refreshUploaderSettingsPanel();
    });
    jQuery(document).on('keydown', '#vsm-uploader-add-input', function (e) { if (e.key === 'Enter') jQuery('#vsm-uploader-add-btn').trigger('click'); });
    jQuery(document).on('click', '#vsm-uploader-clear-btn', function () {
        if (!UPLOADER_BLACKLIST.length) return;
        if (!confirm('Remove all ' + UPLOADER_BLACKLIST.length + ' blacklisted uploader(s)?')) return;
        UPLOADER_BLACKLIST = []; saveUploaderBlacklist(); applyAllFiltersToPage(); refreshUploaderSettingsPanel();
    });

    jQuery('#vsm-save-btn').on('click', function () {
        const prevGallery = GALLERY_VIEW_MODE;
        saveSettings();
        GALLERY_VIEW_MODE = jQuery('#vsm-GALLERY_VIEW_MODE').is(':checked');
        if (GALLERY_VIEW_MODE !== prevGallery) { if (GALLERY_VIEW_MODE) buildGalleryView(); else destroyGalleryView(); }
        closeOverlay();
        if (confirm('Settings saved!\n\nReload the page now for all changes (thumbnail size, dark mode, card width, image load mode) to take effect?')) location.reload();
    });
    jQuery('#vsm-reset-btn').on('click', function () {
        if (!confirm('Reset all viewer settings to their defaults?')) return;
        applyDefaultsToForm(); saveSettings(); showSavedMsg();
    });
}

function toggleForumInFavoritesIfAbsent(forumName) {
    const key = forumName.toLowerCase().trim();
    if (!key) return;
    const blIdx = FORUM_BLACKLIST.indexOf(key);
    if (blIdx !== -1) { FORUM_BLACKLIST.splice(blIdx, 1); saveForumBlacklist(); }
    if (FORUM_FAVORITES.indexOf(key) === -1) FORUM_FAVORITES.push(key);
    saveForumFavorites();
    applyAllFiltersToPage();
}

function openOverlay() {
    jQuery('#viewer-settings-backdrop').addClass('active');
    refreshForumSettingsPanel();
    refreshFavoriteForumsPanel();
    refreshUploaderSettingsPanel();
    buildGlowSwatches();
}
function closeOverlay() { jQuery('#viewer-settings-backdrop').removeClass('active'); }
function showSavedMsg() {
    const $msg = jQuery('#vsm-saved-msg');
    $msg.addClass('visible');
    setTimeout(() => $msg.removeClass('visible'), 2500);
}
function applyDefaultsToForm() {
    jQuery('#vsm-TABLE_THUMB_SIZE').val(DEFAULTS.TABLE_THUMB_SIZE);
    jQuery('#vsm-GALLERY_VIEW_MODE').prop('checked', DEFAULTS.GALLERY_VIEW_MODE);
    jQuery('#vsm-GRID_DARK_MODE').prop('checked', DEFAULTS.GRID_DARK_MODE);
    jQuery('#vsm-GALLERY_CARD_MIN_WIDTH').val(DEFAULTS.GALLERY_CARD_MIN_WIDTH);
    jQuery('#vsm-IMAGE_LOAD_MODE').val(DEFAULTS.IMAGE_LOAD_MODE);
}
function saveSettings() {
    GM_setValue('TABLE_THUMB_SIZE', parseInt(jQuery('#vsm-TABLE_THUMB_SIZE').val(), 10) || DEFAULTS.TABLE_THUMB_SIZE);
    GM_setValue('GALLERY_VIEW_MODE', jQuery('#vsm-GALLERY_VIEW_MODE').is(':checked'));
    GM_setValue('GRID_DARK_MODE', jQuery('#vsm-GRID_DARK_MODE').is(':checked'));
    GM_setValue('GALLERY_CARD_MIN_WIDTH', parseInt(jQuery('#vsm-GALLERY_CARD_MIN_WIDTH').val(), 10) || DEFAULTS.GALLERY_CARD_MIN_WIDTH);
    GM_setValue('IMAGE_LOAD_MODE', jQuery('#vsm-IMAGE_LOAD_MODE').val());
}

function refreshForumSettingsPanel() {
    const $c = jQuery('#vsm-forum-chips-container');
    if (!$c.length) return;
    $c.empty();
    if (FORUM_BLACKLIST.length) {
        FORUM_BLACKLIST.forEach(function (name) {
            const $chip = jQuery('<span class="vsm-bl-chip">').text(name);
            jQuery('<button type="button" title="Remove">&times;</button>').on('click', function () { toggleForumInBlacklist(name); }).appendTo($chip);
            $c.append($chip);
        });
    } else {
        $c.append(jQuery('<span>').css({ color: '#555', fontSize: '11px' }).text('No forums blacklisted.'));
    }
}
function refreshFavoriteForumsPanel() {
    const $c = jQuery('#vsm-fav-chips-container');
    if (!$c.length) return;
    $c.empty();
    if (FORUM_FAVORITES.length) {
        FORUM_FAVORITES.forEach(function (name) {
            const $chip = jQuery('<span class="vsm-fav-chip">').text(name);
            jQuery('<button type="button" title="Remove">&times;</button>').on('click', function () { toggleForumInFavorites(name); }).appendTo($chip);
            $c.append($chip);
        });
    } else {
        $c.append(jQuery('<span>').css({ color: '#555', fontSize: '11px' }).text('No favorite forums.'));
    }
}
function refreshUploaderSettingsPanel() {
    const $c = jQuery('#vsm-uploader-chips-container');
    if (!$c.length) return;
    $c.empty();
    if (UPLOADER_BLACKLIST.length) {
        UPLOADER_BLACKLIST.forEach(function (name) {
            const $chip = jQuery('<span class="vsm-bl-chip">').text(name);
            jQuery('<button type="button" title="Remove">&times;</button>').on('click', function () { toggleUploaderInBlacklist(name); }).appendTo($chip);
            $c.append($chip);
        });
    } else {
        $c.append(jQuery('<span>').css({ color: '#555', fontSize: '11px' }).text('No uploaders blacklisted.'));
    }
}
function buildGlowSwatches() {
    const $wrap = jQuery('#vsm-glow-swatches');
    if (!$wrap.length) return;
    $wrap.empty();
    GLOW_COLORS.forEach(function (c) {
        const isSel = c.hex.toLowerCase() === FAVORITE_GLOW_COLOR.toLowerCase();
        jQuery('<div class="vsm-glow-swatch' + (isSel ? ' selected' : '') + '">')
            .css({ background: c.hex, 'box-shadow': '0 0 8px 2px ' + c.hex + '88' })
            .attr('title', c.name)
            .on('click', function () {
                FAVORITE_GLOW_COLOR = c.hex;
                GM_setValue('FAVORITE_GLOW_COLOR', c.hex);
                jQuery('.vsm-glow-swatch').removeClass('selected');
                jQuery(this).addClass('selected');
                applyAllFiltersToPage();
            })
            .appendTo($wrap);
    });
}

// --------------------
// NAV BUTTON INJECTION
// (Pornolab shows a "Опции показа" link above the results table — we hang our
//  Grid/List toggle and Settings gear right next to it)
// --------------------
function injectNavButtons() {
    const $anchor = jQuery('a.menu-root[href="#tr-options"]').first();
    if (!$anchor.length) { console.warn(`${LOG_PREFIX} nav anchor not found`); return; }

    const $wrap = jQuery('<span id="pl_viewer_nav_wrap" style="margin-left:10px;">');
    const $galleryBtn = jQuery('<a href="javascript:void(0)" id="pl-gallery-toggle-btn">')
        .html(GALLERY_VIEW_MODE ? '&#9776; List' : '&#10697; Grid')
        .attr('title', GALLERY_VIEW_MODE ? 'Switch to table view' : 'Switch to grid view');
    const $settingsBtn = jQuery('<a href="javascript:void(0)" id="pl-settings-open-btn">&#9881; Viewer</a>')
        .attr('title', 'Pornolab Viewer Settings');

    $wrap.append(' | ', $galleryBtn, ' | ', $settingsBtn);
    $anchor.after($wrap);

    jQuery('#pl-gallery-toggle-btn').on('click', toggleGalleryMode);
    jQuery('#pl-settings-open-btn').on('click', openOverlay);
}

// --------------------
// CHANGELOG POPUP
// --------------------
function buildChangelogPopup(versionsToShow) {
    const blocksHtml = versionsToShow.map(function (entry) {
        const items = entry.changes.map(c => `<li>${c}</li>`).join('');
        return `<div class="vcl-version-block"><span class="vcl-version-label">v${entry.version}</span><ul class="vcl-changes">${items}</ul></div>`;
    }).join('');

    const html = `
    <div id="vcl-backdrop">
        <div id="vcl-modal">
            <div class="vcl-header">
                <div class="vcl-header-left">
                    <h2>&#127381; What's New</h2>
                    <span class="vcl-subtitle">[Pornolab] Advanced Viewer Experience &mdash; updated to v${SCRIPT_VERSION}</span>
                </div>
            </div>
            <div class="vcl-body">${blocksHtml}</div>
            <div class="vcl-footer">
                <a class="vcl-github-link" href="https://github.com/edstagdh/Userscripts" target="_blank">&#128279; View on GitHub</a>
                <button class="vcl-ok-btn" id="vcl-ok-btn">OK, got it</button>
            </div>
        </div>
    </div>`;

    jQuery('body').append(html);
    jQuery('#vcl-backdrop').on('click', function (e) { if (e.target === this) dismissChangelog(); });
    jQuery('#vcl-ok-btn').on('click', dismissChangelog);
    jQuery(document).on('keydown.vcl', function (e) { if (e.key === 'Escape') dismissChangelog(); });
    jQuery('#vcl-backdrop').addClass('active');
}
function dismissChangelog() {
    jQuery('#vcl-backdrop').removeClass('active');
    GM_setValue('LAST_SEEN_VERSION', SCRIPT_VERSION);
    jQuery(document).off('keydown.vcl');
}
function checkVersionAndShowChangelog() {
    const lastSeen = GM_getValue('LAST_SEEN_VERSION', '');
    if (lastSeen === SCRIPT_VERSION) return;
    const toShow = [];
    for (let i = 0; i < VERSION_HISTORY.length; i++) {
        if (VERSION_HISTORY[i].version === lastSeen) break;
        toShow.push(VERSION_HISTORY[i]);
    }
    if (!lastSeen) { toShow.length = 0; toShow.push(VERSION_HISTORY[0]); }
    if (!toShow.length) { GM_setValue('LAST_SEEN_VERSION', SCRIPT_VERSION); return; }
    buildChangelogPopup(toShow);
}

// --------------------
// INIT
// --------------------
(function init() {
    if (!jQuery('#tor-tbl').length) return; // not a search-results page

    buildSettingsOverlay();

    jQuery(document).ready(function () {
        injectNavButtons();
        checkVersionAndShowChangelog();

        // Always enhance the underlying table (translations, Preview/Download columns,
        // blacklist hide, uploader block buttons) regardless of which view loads first —
        // otherwise switching from Grid back to List showed the raw, unmodified table.
        setTimeout(function () {
            enhanceAllTableRows();
            if (GALLERY_VIEW_MODE) buildGalleryView();
        }, 150);
    });
})();