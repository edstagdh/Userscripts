// ==UserScript==
// @name        [Pornolab] Advanced Viewer Experience
// @description Adds a Grid/List toggle, image previews pulled from inside each topic, download buttons, forum & uploader blacklist/favorites with glow highlighting, and a settings panel to Pornolab's tracker search results.
// @namespace   https://github.com/edstagdh/Userscripts
// @version     1.5
// @author      edstagdh
// @match       https://pornolab.net/forum/tracker.php*
// @icon        https://www.google.com/s2/favicons?sz=64&domain=pornolab.net
// @updateURL   https://github.com/edstagdh/Userscripts/raw/refs/heads/master/PLAB/plab_advanced_viewer.user.js
// @installURL  https://github.com/edstagdh/Userscripts/raw/refs/heads/master/PLAB/plab_advanced_viewer.user.js
// @require     https://code.jquery.com/jquery-2.1.1.min.js
// @require     https://raw.githubusercontent.com/edstagdh/Userscripts/master/PLAB/plab_advanced_viewer.settings.js?v=1.5
// @require     https://raw.githubusercontent.com/edstagdh/Userscripts/master/PLAB/plab_advanced_viewer.gallery.js?v=1.5
// @require     https://raw.githubusercontent.com/edstagdh/Userscripts/master/PLAB/plab_advanced_viewer.changelog.js?v=1.5
// @resource    PLAB_STYLES https://raw.githubusercontent.com/edstagdh/Userscripts/master/PLAB/plab_advanced_viewer.styles.css?v=1.5
// @grant       GM_addStyle
// @grant       GM_getResourceText
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_registerMenuCommand
// @grant       GM_xmlhttpRequest
// @connect     raw.githubusercontent.com
// ==/UserScript==

"use strict";

// Code is split across files (all in PLAB/, cached by Tampermonkey, refreshed on each
// version bump through the ?v= on their URLs):
//   plab_advanced_viewer.settings.js    settings overlay + nav buttons
//   plab_advanced_viewer.gallery.js     gallery (grid) view
//   plab_advanced_viewer.changelog.js   "What's New" popup
//   plab_advanced_viewer.styles.css     all CSS
// When bumping @version, update the ?v= on those @require / @resource lines too.

this.$ = this.jQuery = jQuery.noConflict(true);

const LOG_PREFIX = '[PL-VIEWER]';

// --------------------
// VERSION
// --------------------
const SCRIPT_VERSION = '1.5';

// --------------------
// CONFIG DEFAULTS
// --------------------
const DEFAULTS = {
    GRID_DARK_MODE:          true,
    GALLERY_VIEW_MODE:       false,
    GALLERY_CARD_MIN_WIDTH:  220,
    IMAGE_LOAD_MODE:         "near",   // "disabled" | "near" | "lazy"
    TABLE_THUMB_SIZE:        90,
    FETCH_CONCURRENCY_LIMIT: 4,        // max simultaneous topic-page fetches
    FETCH_STAGGER_MS:        120,      // delay (ms) between dequeuing new requests
    FETCH_TIMEOUT_MS:        12000,    // per-request timeout (ms) so a hung request can't jam the queue forever
    REMEMBER_PREVIEWS:       true,     // keep found preview images between visits (no topic re-fetch)
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
let FETCH_CONCURRENCY_LIMIT = GM_getValue('FETCH_CONCURRENCY_LIMIT', DEFAULTS.FETCH_CONCURRENCY_LIMIT);
let FETCH_STAGGER_MS        = GM_getValue('FETCH_STAGGER_MS',        DEFAULTS.FETCH_STAGGER_MS);
let FETCH_TIMEOUT_MS        = GM_getValue('FETCH_TIMEOUT_MS',        DEFAULTS.FETCH_TIMEOUT_MS);
let REMEMBER_PREVIEWS       = GM_getValue('REMEMBER_PREVIEWS',       DEFAULTS.REMEMBER_PREVIEWS);

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
// CSS — stylesheet (plab_advanced_viewer.styles.css, via @resource PLAB_STYLES)
// Settings-dependent values are passed in as CSS variables.
// --------------------
(function loadStyles() {
    let css = '';
    try { css = GM_getResourceText('PLAB_STYLES') || ''; } catch (e) { /* handled below */ }
    if (!css) console.error(`${LOG_PREFIX} Stylesheet resource PLAB_STYLES is missing — check the @resource line / reinstall the script.`);
    GM_addStyle(`:root {
    --plab-card-min-width: ${GALLERY_CARD_MIN_WIDTH}px;
    --plab-card-bg: ${CARD_BG};
    --plab-card-border: ${CARD_BORDER};
    --plab-image-bg: ${IMAGE_BG};
    --plab-cat-badge-bg: ${CAT_BADGE_BG};
    --plab-cat-badge-color: ${CAT_BADGE_COLOR};
    --plab-title-color: ${TITLE_COLOR};
    --plab-title-hover: ${TITLE_HOVER};
    --plab-footer-color: ${FOOTER_COLOR};
    --plab-footer-border: ${FOOTER_BORDER};
    --plab-time-color: ${TIME_COLOR};
}
` + css);
})();

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

// Pornolab category text is usually "Russian Name / English Name" — we only ever
// want the English half. If there's no " / " separator, assume the text is
// already English-only and use it as-is.
function toEnglishCategoryText(rawText) {
    const text = (rawText || '').trim();
    if (text.includes(' / ')) {
        const parts = text.split(' / ');
        return parts[parts.length - 1].trim();
    }
    return text;
}

function getForumFromRow($row) {
    const $a = $row.find('a.gen.f').first();
    return toEnglishCategoryText($a.length ? $a.text() : '');
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
// TABLE HEADER TRANSLATION — Pornolab's tracker table headers are in Russian;
// translate the visible label text (and hover titles, where present) to English.
// --------------------
const HEADER_LABEL_TRANSLATIONS = {
    'Форум': 'Forum',
    'Тема': 'Topic',
    'Автор': 'Uploader',
    'Размер': 'Size',
    'Добавлен': 'Added',
};
const HEADER_TITLE_TRANSLATIONS = {
    'Сиды': 'Seeders',
    'Личи': 'Leechers',
    'Торрент скачан': 'Times completed',
    'Приватный торрент (отключён DHT)': 'Private torrent (DHT disabled)',
};
function translateTableHeaders() {
    const $headerRow = jQuery('#tor-tbl thead tr').first();
    if (!$headerRow.length) return;
    $headerRow.find('th').each(function () {
        const $th = jQuery(this);
        const $label = $th.find('b.tbs-text').first();
        if ($label.length) {
            const text = $label.text().trim();
            if (HEADER_LABEL_TRANSLATIONS.hasOwnProperty(text)) $label.text(HEADER_LABEL_TRANSLATIONS[text]);
        }
        const title = $th.attr('title');
        if (title && HEADER_TITLE_TRANSLATIONS.hasOwnProperty(title)) {
            $th.attr('title', HEADER_TITLE_TRANSLATIONS[title]);
        }
    });
}

// --------------------
// FETCH QUEUE — caps concurrent topic-page fetches and staggers new ones so we
// don't fire dozens of simultaneous requests at once (which can trip site-side
// rate limiting and, combined with a hung/no-timeout request, exhaust the
// browser's per-host connection pool and stall the whole page).
// --------------------
let activeFetchCount = 0;
const fetchQueue = [];

function enqueueFetch(taskFn) {
    // taskFn receives a `done` callback it MUST call exactly once when finished
    // (success, error, or timeout) so the queue can advance.
    fetchQueue.push(taskFn);
    drainFetchQueue();
}

function drainFetchQueue() {
    while (activeFetchCount < FETCH_CONCURRENCY_LIMIT && fetchQueue.length) {
        const task = fetchQueue.shift();
        activeFetchCount++;
        task(function done() {
            activeFetchCount--;
            // Stagger before pulling the next item so requests don't all
            // fire back-to-back the instant a slot frees up.
            setTimeout(drainFetchQueue, FETCH_STAGGER_MS);
        });
    }
}

// --------------------
// PREVIEW IMAGE FETCH — pulls the first valid image out of the topic page
// (ported from the Pornolab preview script's var.postImg / size-validation logic).
// - Topic pages go through the fetch queue above (with a timeout), and the queue slot
//   is freed as soon as the page's HTML has arrived.
// - The HTML is parsed with DOMParser: an inert document, so none of the topic's own
//   images (avatars, smilies, banners, signatures) are downloaded and no scripts run.
// - Checking the candidate images' sizes happens in its own small queue — those are
//   on image hosts, not on Pornolab, so they don't hold up the next topic fetch.
// - Results are remembered between visits (PREVIEW CACHE below).
// --------------------
const imagePreviewCache = {};     // topicId -> src string | null (this page view)
const pendingImageFetches = {};   // topicId -> [callback, ...]
const IMAGE_CHECK_LIMIT = 6;      // topics whose candidate images are being size-checked at once
let activeImageChecks = 0;
const imageCheckQueue = [];

function enqueueImageCheck(taskFn) {
    imageCheckQueue.push(taskFn);
    drainImageCheckQueue();
}

function drainImageCheckQueue() {
    while (activeImageChecks < IMAGE_CHECK_LIMIT && imageCheckQueue.length) {
        const task = imageCheckQueue.shift();
        activeImageChecks++;
        task(function done() { activeImageChecks--; drainImageCheckQueue(); });
    }
}

// The image links in a topic page, in page order (var.postImg title="…")
function extractPostImageUrls(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return Array.prototype.map.call(doc.querySelectorAll('var.postImg'), v => v.getAttribute('title')).filter(Boolean);
    } catch (e) {
        console.error(`${LOG_PREFIX} could not parse topic page:`, e);
        return [];
    }
}

function fetchPreviewImageForTopic(topicId, topicHref, callback) {
    if (!topicId) { callback(null); return; }
    if (imagePreviewCache.hasOwnProperty(topicId)) { callback(imagePreviewCache[topicId]); return; }
    const saved = previewCacheGet(topicId);
    if (saved !== undefined) { imagePreviewCache[topicId] = saved; callback(saved, true); return; }
    if (pendingImageFetches[topicId]) { pendingImageFetches[topicId].push(callback); return; }
    pendingImageFetches[topicId] = [callback];

    enqueueFetch(function (done) {
        jQuery.ajax({
            url: topicHref,
            method: 'GET',
            dataType: 'text',
            timeout: FETCH_TIMEOUT_MS,
            success: function (html) {
                done();   // the rest doesn't touch Pornolab: let the next topic fetch start
                const urls = extractPostImageUrls(html);
                enqueueImageCheck(function (checkDone) {
                    tryTopicImage(urls, 0, null, function (finalSrc) {
                        checkDone();
                        imagePreviewCache[topicId] = finalSrc;
                        previewCachePut(topicId, finalSrc);
                        resolvePending(topicId, finalSrc);
                    });
                });
            },
            error: function () {
                // Covers real HTTP errors AND $.ajax timeouts (jQuery calls `error`
                // with textStatus === 'timeout' when the `timeout` option elapses),
                // so a stalled/rate-limited request still frees its queue slot.
                // Not remembered between visits: it's retried next time.
                imagePreviewCache[topicId] = null;
                resolvePending(topicId, null);
                done();
            },
        });
    });
}

function resolvePending(topicId, src) {
    const cbs = pendingImageFetches[topicId] || [];
    delete pendingImageFetches[topicId];
    cbs.forEach(cb => cb(src));
}

// Walks the image links found on a topic page, testing each image's real dimensions
// and skipping tiny placeholder/banner images until a valid one is found.
function tryTopicImage(urls, index, fallbackSrc, done) {
    if (index >= urls.length) { done(fallbackSrc); return; }
    const imgSrc = urls[index];
    if (!imgSrc) { tryTopicImage(urls, index + 1, fallbackSrc, done); return; }

    const testImg = new Image();
    testImg.onload = function () {
        if (this.width >= MIN_VALID_IMAGE_SIZE && this.height >= MIN_VALID_IMAGE_SIZE) {
            done(imgSrc);
        } else {
            tryTopicImage(urls, index + 1, fallbackSrc || imgSrc, done);
        }
    };
    testImg.onerror = function () { tryTopicImage(urls, index + 1, fallbackSrc, done); };
    testImg.src = imgSrc;
}

// Show a topic's preview in an <img>. A remembered image that no longer loads (taken
// down by its host) is forgotten, so the topic page is checked again next time.
function showPreviewInImg(imgEl, $imgJQ, topicId, src, fromSaved) {
    if (!imgEl) return;
    if (src && fromSaved) {
        imgEl.addEventListener('error', function () {
            previewCacheForget(topicId);
            delete imagePreviewCache[topicId];
        }, { once: true });
    }
    const finalSrc = src || FALLBACK_IMG;
    imgEl.src = finalSrc;
    if (src && $imgJQ) attachScaledHoverPreview($imgJQ, finalSrc);
}

function loadImageForImgElement(imgEl, topicId, topicHref, $imgJQ) {
    fetchPreviewImageForTopic(topicId, topicHref, function (src, fromSaved) {
        showPreviewInImg(imgEl, $imgJQ, topicId, src, fromSaved);
    });
}

// --------------------
// PREVIEW CACHE — remembers which image each topic uses between visits (Tampermonkey
// storage), so returning to a list, or paging back, doesn't fetch the topic pages again.
// Entry: topicId -> [src, savedAtHour]; '' means "no usable image" (re-checked sooner).
// --------------------
const PREVIEW_CACHE_KEY       = 'PREVIEW_CACHE';
const PREVIEW_CACHE_MAX       = 4000;   // topics remembered; the oldest are dropped
const PREVIEW_CACHE_DAYS      = 30;     // a found image is re-checked after this long
const PREVIEW_CACHE_NONE_DAYS = 3;      // "no image" is re-checked sooner (topic may get one)
let previewStore = null;
const previewStoreDeleted = new Set();
let previewStoreDirty = false;
let previewStoreTimer = 0;

function previewNowHours() { return Math.floor(Date.now() / 36e5); }

function previewStoreRead() {
    try {
        const v = JSON.parse(GM_getValue(PREVIEW_CACHE_KEY, '{}'));
        return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch (e) { return {}; }
}

function previewStoreLoad() {
    if (!previewStore) previewStore = previewStoreRead();
    return previewStore;
}

// undefined = not remembered, null = remembered "no image", string = image link
function previewCacheGet(topicId) {
    if (!REMEMBER_PREVIEWS) return undefined;
    const e = previewStoreLoad()[topicId];
    if (!Array.isArray(e)) return undefined;
    const maxHours = (e[0] ? PREVIEW_CACHE_DAYS : PREVIEW_CACHE_NONE_DAYS) * 24;
    if (previewNowHours() - e[1] > maxHours) { previewCacheForget(topicId); return undefined; }
    return e[0] || null;
}

function previewCachePut(topicId, src) {
    if (!REMEMBER_PREVIEWS) return;
    previewStoreLoad()[topicId] = [src || '', previewNowHours()];
    previewStoreDeleted.delete(topicId);
    previewStoreSchedule();
}

function previewCacheForget(topicId) {
    delete previewStoreLoad()[topicId];
    previewStoreDeleted.add(topicId);
    previewStoreSchedule();
}

function previewStoreSchedule() {
    previewStoreDirty = true;
    clearTimeout(previewStoreTimer);
    previewStoreTimer = setTimeout(previewStoreFlush, 2000);
}

// Write back, merged with what other tabs may have saved meanwhile
function previewStoreFlush() {
    clearTimeout(previewStoreTimer);
    if (!previewStoreDirty || !previewStore) return;
    previewStoreDirty = false;
    const merged = Object.assign(previewStoreRead(), previewStore);
    previewStoreDeleted.forEach(id => { delete merged[id]; });
    const ids = Object.keys(merged);
    if (ids.length > PREVIEW_CACHE_MAX) {
        ids.sort((x, y) => merged[x][1] - merged[y][1]);
        ids.slice(0, ids.length - PREVIEW_CACHE_MAX).forEach(id => { delete merged[id]; });
    }
    previewStore = merged;
    GM_setValue(PREVIEW_CACHE_KEY, JSON.stringify(merged));
}

function previewCacheCount() { return Object.keys(previewStoreLoad()).length; }

function previewCacheClear() {
    clearTimeout(previewStoreTimer);
    previewStore = {};
    previewStoreDeleted.clear();
    previewStoreDirty = false;
    GM_setValue(PREVIEW_CACHE_KEY, '{}');
}

window.addEventListener('pagehide', previewStoreFlush);

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
// TABLE VIEW ENHANCEMENTS
// (English-only category text, translated headers/dates, preview column,
//  uploader block button, blacklist hide, favorite glow — applied once per row)
// --------------------
function injectTableHeaders() {
    const $headerRow = jQuery('#tor-tbl thead tr').first();
    if (!$headerRow.length) return;
    if ($headerRow.find('th.pl-preview-th').length) return; // already injected
    const $forumTh = $headerRow.children().eq(2); // "Форум" header — insert Preview right after it, before "Тема"
    const $previewTh = jQuery('<th class="{sorter: false} pl-preview-th"><b class="tbs-text">Preview</b></th>');
    $forumTh.after($previewTh);
    translateTableHeaders();
}

function enhanceTableRow($row) {
    if ($row.data('pl-enhanced')) return;
    $row.data('pl-enhanced', true);

    // English-only forum text
    try {
        const $forumA = $row.find('a.gen.f').first();
        if ($forumA.length) $forumA.text(toEnglishCategoryText($forumA.text()));
    } catch (e) { console.error(`${LOG_PREFIX} forum text cleanup error:`, e); }

    // Translate Russian month abbreviation in the date column
    try {
        const $dateTd = $row.find('> td').last();
        const $dateP = $dateTd.find('p').eq(1);
        if ($dateP.length) $dateP.text(translateMonth($dateP.text()));
    } catch (e) { console.error(`${LOG_PREFIX} date translation error:`, e); }

    // Insert Preview cell right after the forum (3rd) column, before the title —
    // keeping it on the left side of the row means the hover-zoom popup opens
    // with plenty of horizontal room before it would run off the right edge of the viewport.
    const $forumTd = $row.find('> td').eq(2);
    const $previewTd = jQuery('<td class="pl-preview-cell">');
    $forumTd.after($previewTd);

    // No dedicated download column: the Size column's link (a.tr-dl) already
    // downloads the torrent, so we just style that existing link as a button
    // instead of duplicating it in a separate cell.
    const $sizeLink = $row.find('a.tr-dl').first();
    if ($sizeLink.length) $sizeLink.addClass('pl-download-btn');

    const topicId = getTopicIdFromRow($row);
    const titleInfo = getTitleFromRow($row);
    if (topicId) {
        const $thumb = jQuery('<img>').css({
            'max-width': TABLE_THUMB_SIZE + 'px', 'max-height': TABLE_THUMB_SIZE + 'px', cursor: 'zoom-in',
        });
        $thumb.one('error', function () { this.src = FALLBACK_IMG; });
        $previewTd.append($thumb);

        const loadThisPreview = function () {
            fetchPreviewImageForTopic(topicId, titleInfo.href, function (src, fromSaved) {
                showPreviewInImg($thumb[0], $thumb, topicId, src, fromSaved);
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

const PREVIEW_HOVER_SCALE = 1.8; // 150% of the image's on-page rendered size

// One popup element shared by every thumbnail (created on first hover)
let hoverPopup = null, hoverPopupImg = null;

function ensureHoverPopup() {
    if (hoverPopup) return;
    hoverPopup = document.createElement('div');
    Object.assign(hoverPopup.style, {
        position: 'fixed', display: 'none', zIndex: '9999',
        border: '2px solid #000', backgroundColor: '#000',
        padding: '2px', pointerEvents: 'none',
    });
    hoverPopupImg = document.createElement('img');
    hoverPopupImg.style.display = 'block';
    hoverPopup.appendChild(hoverPopupImg);
    document.body.appendChild(hoverPopup);
}

function positionHoverPopup(clientX, clientY) {
    const pad = 12;
    const rect = hoverPopup.getBoundingClientRect();

    let left = clientX + 20;
    if (left + rect.width + pad > window.innerWidth) left = clientX - rect.width - 20;
    left = Math.min(Math.max(left, pad), window.innerWidth - rect.width - pad);

    let top = clientY + 20;
    if (top + rect.height + pad > window.innerHeight) top = clientY - rect.height - 20;
    top = Math.min(Math.max(top, pad), window.innerHeight - rect.height - pad);

    hoverPopup.style.left = left + 'px';
    hoverPopup.style.top = top + 'px';
}

function attachScaledHoverPreview($el, imgSrc) {
    $el.off('.scaledPreview');
    $el.on('mouseenter.scaledPreview', function (e) {
        ensureHoverPopup();
        const el = $el[0];
        const renderedW = el.offsetWidth  || el.getBoundingClientRect().width;
        const renderedH = el.offsetHeight || el.getBoundingClientRect().height;
        if (!renderedW || !renderedH) return; // element not laid out yet — skip rather than show a bad popup

        const maxW = window.innerWidth - 24;
        const maxH = window.innerHeight - 24;
        let w = renderedW * PREVIEW_HOVER_SCALE;
        let h = renderedH * PREVIEW_HOVER_SCALE;
        // If 150% of the card's size would overflow the viewport, shrink just enough
        // to fit (keeping aspect ratio) rather than letting the popup get clipped.
        if (w > maxW || h > maxH) {
            const shrink = Math.min(maxW / w, maxH / h);
            w *= shrink; h *= shrink;
        }

        hoverPopupImg.style.width = w + 'px';
        hoverPopupImg.style.height = h + 'px';
        hoverPopupImg.src = imgSrc;
        hoverPopup.style.display = 'block';
        positionHoverPopup(e.clientX, e.clientY);
    });
    $el.on('mousemove.scaledPreview', function (e) {
        if (hoverPopup && hoverPopup.style.display === 'block') positionHoverPopup(e.clientX, e.clientY);
    });
    $el.on('mouseleave.scaledPreview', function () {
        if (hoverPopup) hoverPopup.style.display = 'none';
    });
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
// INIT
// --------------------
(function init() {
    if (!jQuery('#tor-tbl').length) return; // not a search-results page

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('📋 Show Changelog', showFullChangelog);
    }

    jQuery(document).ready(function () {
        injectNavButtons();
        checkVersionAndShowChangelog();

        setTimeout(function () {
            enhanceAllTableRows();
            if (GALLERY_VIEW_MODE) buildGalleryView();
        }, 150);
    });
})();