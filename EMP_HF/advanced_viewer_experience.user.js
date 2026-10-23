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
// @version     3.17
// @author      edstagdh
// @icon        https://www.google.com/s2/favicons?sz=64&domain=www.happyfappy.net
// @icon        https://www.google.com/s2/favicons?sz=64&domain=www.empornium.sx
// @icon        https://www.google.com/s2/favicons?sz=64&domain=emparadise.rs
// @require     https://code.jquery.com/jquery-2.1.1.min.js
// @require     https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/advanced_viewer_experience.settings.js?v=3.17
// @require     https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/advanced_viewer_experience.gallery.js?v=3.17
// @require     https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/advanced_viewer_experience.poster_wall.js?v=3.17
// @resource    AVE_STYLES https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/advanced_viewer_experience.styles.css?v=3.17
// @updateURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/advanced_viewer_experience.user.js
// @installURL  https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/advanced_viewer_experience.user.js
// @grant       GM_addStyle
// @grant       GM_getResourceText
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

// Code is split across files (all in EMP_HF/, cached by Tampermonkey, refreshed on each
// version bump through the ?v= on their URLs):
//   advanced_viewer_experience.settings.js     settings overlay + nav buttons
//   advanced_viewer_experience.gallery.js      gallery (grid) view
//   advanced_viewer_experience.poster_wall.js  Poster Wall
//   advanced_viewer_experience.styles.css      all CSS
// When bumping @version, update the ?v= on those @require / @resource lines too.

this.$ = this.jQuery = jQuery.noConflict(true);

const LOG_PREFIX = '[TM]';
const USER_SEARCH_COOLDOWN_MS = 30 * 1000;
let lastUserSearchTimestamp = 0;
// --------------------
// VERSION HISTORY
// --------------------
const SCRIPT_VERSION = '3.17';
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
// CSS — stylesheet (advanced_viewer_experience.styles.css, via @resource AVE_STYLES)
// Settings-dependent values are passed in as CSS variables.
// --------------------
(function loadStyles() {
    let css = '';
    try { css = GM_getResourceText('AVE_STYLES') || ''; } catch (e) { /* handled below */ }
    if (!css) console.error(`${LOG_PREFIX} Stylesheet resource AVE_STYLES is missing — check the @resource line / reinstall the script.`);
    GM_addStyle(`:root {
    --ave-card-min-width: ${GALLERY_CARD_MIN_WIDTH}px;
    --ave-card-bg: ${CARD_BG};
    --ave-card-border: ${CARD_BORDER};
    --ave-image-bg: ${IMAGE_BG};
    --ave-cat-badge-bg: ${CAT_BADGE_BG};
    --ave-cat-badge-color: ${CAT_BADGE_COLOR};
    --ave-title-color: ${TITLE_COLOR};
    --ave-title-hover: ${TITLE_HOVER};
    --ave-meta-color: ${META_COLOR};
    --ave-footer-color: ${FOOTER_COLOR};
    --ave-footer-border: ${FOOTER_BORDER};
    --ave-time-color: ${TIME_COLOR};
}
` + css);
})();

if (ENABLE_WIDER_TABLE_VIEW) {
    GM_addStyle(`#content { width: 99%; max-width: 1500px; }`);
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