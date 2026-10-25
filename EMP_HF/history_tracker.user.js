// ==UserScript==
// @name         [HF][EMP] History Tracker
// @version      3.4
// @description  Remembers the torrent pages you open and the searches you run (stored locally in Tampermonkey), marks torrents you've already visited, keeps a searchable search history and, optionally, each torrent's presentation as BBCode
// @author       edstagdh
// @namespace    https://github.com/edstagdh/Userscripts
// @match        https://www.happyfappy.net/*
// @match        https://www.empornium.sx/*
// @match        https://emparadise.rs/*
// @match        https://edstagdh.github.io/Userscripts/history_tracker_viewer/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @grant        GM_getResourceText
// @connect      raw.githubusercontent.com
// @require      https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/history_tracker.presentation.js?v=3.4
// @require      https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/history_tracker.window.js?v=3.4
// @require      https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/history_tracker.changelog.js?v=3.4
// @resource     HT_STYLES https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/history_tracker.styles.css?v=3.4
// @run-at       document-end
// @installURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/history_tracker.user.js
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/history_tracker.user.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=www.happyfappy.net
// @icon         https://www.google.com/s2/favicons?sz=64&domain=www.empornium.sx
// @icon         https://www.google.com/s2/favicons?sz=64&domain=emparadise.rs
// ==/UserScript==

/*
 * [HF][EMP] History Tracker: everything is kept in this script's Tampermonkey storage; nothing leaves the browser.
 *
 *  • Torrent pages (torrents.php?id=N): each visit is recorded (time, title, cover URL, active time on the page and,
 *    optionally, the presentation as BBCode). A 👁 button next to the title shows your earlier visits.
 *  • Searches (torrents.php with search text / tags / title / file list): each run is recorded. "The same search"
 *    = same text, tags, title and file list, whatever the sort order, page or size filters.
 *  • Torrent links you've opened get a 👁 badge; hovering it shows when you last visited.
 *  • Optionally hides torrents you've opened from the site's lists (rows and Advanced Viewer Experience grid cards),
 *    with a "🙈 N visited hidden · show" switch at the bottom left to bring them back on the current page.
 *    Items another script already hides (Advanced Viewer Experience's blacklists) aren't counted.
 *  • "🕘 History" at the end of the site menu: past searches (filter, run again, or search for something new),
 *    torrents you've opened (hover a cover to enlarge it, copy a saved presentation), and Settings & data.
 *
 * Sites: HappyFappy keeps its own history; empornium.sx and emparadise.rs (same tracker, two domains) share one.
 * The History window, search hint and repeat-search notice can show both sites together (setting "crossSite"),
 * with an HF / EMP tag on each entry. 👁 badges stay per site: torrent ids aren't shared between the trackers.
 *
 * Storage (per site group G = hf | emp), kept small so page loads stay fast:
 *   ht_G_tor_0 … ht_G_tor_15  torrents, split by id % 16: { id: { c: visits, f: first, l: last, t: title,
 *                             cv: cover url, v: [[time, seconds on page], …] (last 200) } }
 *   ht_G_searches             { key: { c, f, l, lb: label, tx: search text, u: last url, v: [time, …] (last 200) } }
 *   ht_G_log_YYYY-MM          every visit of that month: [visitId, time, 't'|'s', torrent id | search key, seconds]
 *   ht_G_pres_<id>            saved presentations: [{ t: first seen, l: last seen, h: hash, n: chars, z: 1 = gzip, d: data }]
 *   ht_last                   last page recorded (reloads within a few seconds aren't counted twice)
 */

"use strict";

// Code is split across files (all in EMP_HF/, cached by Tampermonkey, refreshed on each
// version bump through the ?v= on their URLs). The @require files run before this one, in the same scope:
//   docs/history_tracker_viewer/index.html   offline viewer page (GitHub Pages), see VIEWER_URL
//   history_tracker.presentation.js   presentation → BBCode, saved presentations, BBCode preview
//   history_tracker.window.js         History window (tabs, settings & data, torrent details), cover zoom
//   history_tracker.changelog.js      "What's New" window
//   history_tracker.styles.css        all CSS (@resource HT_STYLES)
// When bumping @version, update the ?v= on those @require / @resource lines and SCRIPT_VERSION too.


// ── Settings ─────────────────────────────────────────────────────────────

var DEFAULT_SETTINGS = {
    trackTorrents: true,          // record torrent page visits
    trackSearches: true,          // record searches
    markVisited: true,            // mark links to torrents you've opened
    markStyle: 'badge',           // 'badge' | 'dim' | 'both'
    torrentButton: true,          // 👁 visit history button on torrent pages
    searchToast: true,            // small notice when you run a search you've run before
    searchBoxHint: true,          // "searched N× before" next to the site's search box while typing
    timeOnPage: true,             // record active (visible) time on torrent pages
    saveCover: true,              // remember the torrent's cover image URL (shown in History → Torrents)
    coverZoom: true,              // hovering a cover in the History window shows it enlarged
    hideVisited: false,           // hide torrents you've already opened from the site's lists (rows and grid cards)
    crossSite: true,              // History window, search hint and notices include the other site (HappyFappy ↔ Empornium)
    historySite: 'all',           // History window site filter last used: 'all' | 'hf' | 'emp'
    savePresentation: true,       // save the torrent's presentation as BBCode
    presentationMode: 'latest',   // 'latest' = only from your latest visit | 'every' = a new copy whenever it changed
    presentationVersions: 10,     // 'every' mode: copies kept per torrent
    presentationMaxTorrents: 300, // presentations kept for this many most recently visited torrents (0 = no limit)
    dedupeSeconds: 30,            // a reload of the same page within this many seconds isn't counted again
    logLevel: 'warn',             // console output: 'off' | 'error' | 'warn' | 'info' | 'debug'
};
var SETTINGS_KEY_PREFIX = 'ht_setting_';

function getSetting(name) {
    if (typeof GM_getValue === 'undefined') return DEFAULT_SETTINGS[name];
    return GM_getValue(SETTINGS_KEY_PREFIX + name, DEFAULT_SETTINGS[name]);
}

function setSetting(name, value) {
    if (typeof GM_setValue === 'undefined') return;
    GM_setValue(SETTINGS_KEY_PREFIX + name, value);
}

// ── Logging ──────────────────────────────────────────────────────────────
// Same prefix as Advanced Viewer Experience, so all of these scripts' console output can be filtered on "[TM]".
// Level is set in 🕘 History → Settings & data; messages above it are dropped.

const LOG_PREFIX = '[TM]';
var LOG_SOURCE = 'History Tracker:';
var LOG_LEVELS = { off: 0, error: 1, warn: 2, info: 3, debug: 4 };
var logLevelNow = LOG_LEVELS[getSetting('logLevel')];
if (logLevelNow === undefined) logLevelNow = LOG_LEVELS.warn;

function logAt(level, method, args) {
    if (logLevelNow < level) return;
    console[method].apply(console, [LOG_PREFIX, LOG_SOURCE].concat(Array.prototype.slice.call(args)));
}
var log = {
    error: function () { logAt(1, 'error', arguments); },
    warn: function () { logAt(2, 'warn', arguments); },
    info: function () { logAt(3, 'info', arguments); },
    debug: function () { logAt(4, 'debug', arguments); },
};

// ── Sites ────────────────────────────────────────────────────────────────

var SITE_GROUPS = {
    'www.happyfappy.net': 'hf', 'happyfappy.net': 'hf',
    'www.empornium.sx': 'emp', 'empornium.sx': 'emp',
    'emparadise.rs': 'emp', 'www.emparadise.rs': 'emp',
};
var GROUPS = ['hf', 'emp'];
var GROUP_NAMES = { hf: 'HappyFappy', emp: 'Empornium' };
var GROUP_SHORT = { hf: 'HF', emp: 'EMP' };
var GROUP_DEFAULT_ORIGIN = { hf: 'https://www.happyfappy.net', emp: 'https://www.empornium.sx' };
var HOST = location.hostname.toLowerCase();
var GROUP = SITE_GROUPS[HOST] || 'hf';

// Offline viewer: a blank page on GitHub Pages (docs/history_tracker_viewer/index.html in the repo) where the
// History window opens full-screen, so the saved history can be browsed while both sites are down.
// Tampermonkey storage belongs to the script, not to a website, so everything saved is readable there too.
var VIEWER_URL = 'https://edstagdh.github.io/Userscripts/history_tracker_viewer/';
var IS_VIEWER = location.origin === 'https://edstagdh.github.io' && location.pathname.indexOf('/Userscripts/history_tracker_viewer') === 0;

var KEY = {
    shard: 'ht_' + GROUP + '_tor_',
    searches: 'ht_' + GROUP + '_searches',
    log: 'ht_' + GROUP + '_log_',
    pres: 'ht_' + GROUP + '_pres_',
    last: 'ht_last',
};
var DATA_KEY_RE = /^ht_(hf|emp)_(tor_\d+|searches|log_\d{4}-\d{2}|pres_\d+)$/;
var SHARDS = 16;
var MAX_ITEM_VISITS = 200;
var LIST_PAGE = 150;
var CURRENT_TORRENT = 0;
var ZOOM_DELAY_MS = 150;
var ZOOM_MARGIN = 16;

var SCRIPT_NAME = 'History Tracker';
var SCRIPT_VERSION = (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script.version : '3.4';

// ── Small helpers ────────────────────────────────────────────────────────

function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function pad(n) { return String(n).padStart(2, '0'); }
function monthKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
function cleanText(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

function fmtDate(ts) {
    return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(ts) {
    return new Date(ts).toLocaleString([], {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function ago(ts) {
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    var units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (var i = 0; i < units.length; i++) {
        var n = Math.floor(s / units[i][1]);
        if (n >= 1) return n + ' ' + units[i][0] + (n > 1 ? 's' : '') + ' ago';
    }
    return 'just now';
}

function fmtDur(sec) {
    if (!sec) return '';
    if (sec < 60) return sec + 's';
    var m = Math.floor(sec / 60);
    if (m < 60) return m + 'm ' + pad(sec % 60) + 's';
    return Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm';
}

function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
}

/** FNV-1a 32-bit, to spot unchanged presentations */
function hashText(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36) + '.' + s.length;
}

function el(tag, props, kids) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') e.textContent = v;
        else if (k === 'className') e.className = v;
        else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
}

/** an element of History Tracker's own interface (not a site element we've only added a class to) */
function isOurs(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.classList.contains('ht-badge') || node.classList.contains('ht-stats-added')) return true;
    return !!node.closest('[data-ht-ui]');
}

// ── Sites shown together ─────────────────────────────────────────────────
// Tampermonkey storage belongs to the script, not to a website, so every site's history is readable from any of them.

function crossSite() { return IS_VIEWER || !!getSetting('crossSite'); }
function viewGroups() { return crossSite() ? GROUPS : [GROUP]; }

/** the domain you last used for a site group (so links to the other site go where you browse it) */
function originOf(g) {
    g = g || GROUP;
    if (g === GROUP && !IS_VIEWER) return location.origin;
    var o = GM_getValue('ht_origin_' + g, null);
    return typeof o === 'string' && /^https:\/\/[a-z0-9.-]+$/i.test(o) ? o : GROUP_DEFAULT_ORIGIN[g];
}

/** a stored URL moved onto the domain used for its site group */
function onDomainOf(g, url) {
    try { var u = new URL(url); return originOf(g) + u.pathname + u.search + u.hash; } catch (e) { return url; }
}

function torrentUrl(g, id) { return originOf(g) + '/torrents.php?id=' + id; }

/** link attributes; links to the other site open in a new tab */
function linkProps(g, href, extra) {
    var p = Object.assign({ href: href }, extra || {});
    if (IS_VIEWER || (g && g !== GROUP)) { p.target = '_blank'; p.rel = 'noopener'; }
    return p;
}

function siteTag(g) { return el('span', { className: 'ht-site ht-site-' + g, title: GROUP_NAMES[g], text: GROUP_SHORT[g] }); }
function normTitle(t) { return cleanText(t).toLowerCase(); }

// ── Page classification ──────────────────────────────────────────────────

// Fields that make a torrents.php listing a "search"; their values decide which searches count as the same one.
var SEARCH_FIELDS = [['searchtext', ''], ['taglist', 'tags'], ['title', 'title'], ['filelist', 'files']];
var LIST_ACTIONS = ['', 'basic', 'advanced'];

/** torrent id if this URL is a torrent page (torrents.php?id=N, no action) on this site group, else 0 */
function torrentIdFromUrl(u) {
    if (SITE_GROUPS[u.hostname.toLowerCase()] !== GROUP) return 0;
    if (u.pathname.toLowerCase() !== '/torrents.php') return 0;
    if (u.searchParams.get('action')) return 0;
    var id = u.searchParams.get('id');
    return id && /^\d{1,10}$/.test(id) ? parseInt(id, 10) : 0;
}

/** URL with empty parameters dropped and the rest sorted, so equal pages get equal URLs */
function normalizeUrl(u) {
    var keys = [];
    u.searchParams.forEach(function (v, k) {
        if (String(v).trim() !== '' && keys.indexOf(k) === -1) keys.push(k);
    });
    keys.sort();
    var p = new URLSearchParams();
    keys.forEach(function (k) { p.set(k, u.searchParams.get(k).trim()); });
    var qs = p.toString();
    return GROUP + ':' + u.pathname + (qs ? '?' + qs : '');
}

function classify(u) {
    if (u.pathname.toLowerCase() !== '/torrents.php') return { type: 'other' };
    var tid = torrentIdFromUrl(u);
    if (tid) return { type: 'torrent', torrent_id: tid };
    var action = (u.searchParams.get('action') || '').toLowerCase();
    if (u.searchParams.get('id') || LIST_ACTIONS.indexOf(action) === -1) return { type: 'other' };
    var keyParts = [];
    var labelParts = [];
    var firstText = '';
    SEARCH_FIELDS.forEach(function (f) {
        var v = cleanText(u.searchParams.get(f[0]));
        if (!v) return;
        if (!firstText) firstText = v;
        keyParts.push((f[1] || 'text') + ':' + v.toLowerCase());
        labelParts.push(f[1] ? f[1] + ': ' + v : v);
    });
    if (!keyParts.length) return { type: 'browse' };
    return { type: 'search', key: keyParts.join(' | '), text: firstText, label: labelParts.join(' · ') };
}

function linkTorrentId(a) {
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || href.indexOf('torrents.php') === -1) return 0;
    try { return torrentIdFromUrl(new URL(href, location.href)); } catch (e) { return 0; }
}

function pageTitle() {
    var t = cleanText(document.title);
    var cut = t.split(/\s+::\s+/);              // "Name :: HappyFappy" → "Name"
    if (cut.length > 1) t = cut.slice(0, -1).join(' :: ');
    if (!t) {
        var h2 = document.querySelector('#content h2, h2');
        if (h2) t = cleanText(h2.textContent);
    }
    return t.slice(0, 300);
}

function coverUrl() {
    var img = document.querySelector('#coverimage img');
    var src = img && (img.getAttribute('src') || img.getAttribute('data-src'));
    if (!src) return '';
    try { src = new URL(src, location.href).href; } catch (e) { return ''; }
    return /^https?:/i.test(src) ? src : '';
}

// Thumbnail URL -> full-size URL for known image hosts (same rules as Advanced Better filelist), or null.
var PIXHOST_THUMB_HOST_RE = /^t(\d+)\.(pixhost\.to|pixhost\.cc|pixho\.st)$/i;
function thumbToFullUrl(url) {
    try {
        var u = new URL(url, location.href);
        if (u.hostname.endsWith('hamsterimg.net') && /\.(th|md)\.[a-z0-9]+$/i.test(u.pathname)) {
            u.pathname = u.pathname.replace(/\.(th|md)\.([a-z0-9]+)$/i, '.$2');
            return u.toString();
        }
        if (u.hostname.endsWith('imgbox.com') && /^thumbs/.test(u.hostname) && /_t\.[a-z0-9]+$/i.test(u.pathname)) {
            u.hostname = u.hostname.replace(/^thumbs/, 'images');
            u.pathname = u.pathname.replace(/_t\.([a-z0-9]+)$/i, '_o.$1');
            return u.toString();
        }
        var pm = u.hostname.match(PIXHOST_THUMB_HOST_RE);
        if (pm && u.pathname.startsWith('/thumbs/')) {
            u.hostname = 'img' + pm[1] + '.' + pm[2].toLowerCase();
            u.pathname = u.pathname.replace(/^\/thumbs\//, '/images/');
            return u.toString();
        }
    } catch (e) { /* not a valid URL */ }
    return null;
}

// ── Storage ──────────────────────────────────────────────────────────────

function readObj(key) {
    var v = GM_getValue(key, null);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/** storage keys of a site group (default: the site being viewed) */
function keysOf(g) {
    g = g || GROUP;
    return { shard: 'ht_' + g + '_tor_', searches: 'ht_' + g + '_searches', log: 'ht_' + g + '_log_', pres: 'ht_' + g + '_pres_' };
}

// torrents: one in-memory Map per site group, filled from its 16 shards on first use
var torrentCaches = {};

/** Map torrent id -> entry for a site group (default: the site being viewed) */
function torrents(g) {
    g = g || GROUP;
    if (!torrentCaches[g]) {
        torrentCaches[g] = new Map();
        for (var i = 0; i < SHARDS; i++) loadShardInto(g, i);
    }
    return torrentCaches[g];
}

function loadShardInto(g, i) {
    var s = readObj(keysOf(g).shard + i);
    Object.keys(s).forEach(function (k) { torrentCaches[g].set(parseInt(k, 10), s[k]); });
}

function refreshShard(i) {
    var cache = torrentCaches[GROUP];
    if (!cache) return;
    cache.forEach(function (v, k) { if (k % SHARDS === i) cache.delete(k); });
    loadShardInto(GROUP, i);
}

/** read-modify-write one torrent; fn(entry|null) returns the new entry, or null to delete it */
function updateTorrent(id, fn, g) {
    g = g || GROUP;
    var key = keysOf(g).shard + (id % SHARDS);
    var s = readObj(key);
    var next = fn(s[id] || null);
    if (next) s[id] = next; else delete s[id];
    GM_setValue(key, s);
    var cache = torrentCaches[g];
    if (cache) { if (next) cache.set(id, next); else cache.delete(id); }
    return next;
}

function readSearches(g) { return readObj(keysOf(g).searches); }

function updateSearch(key, fn, g) {
    var all = readSearches(g);
    var next = fn(all[key] || null);
    if (next) all[key] = next; else delete all[key];
    GM_setValue(keysOf(g).searches, all);
    return next;
}

function appendLog(row) {
    var k = KEY.log + monthKey(row[1]);
    var arr = GM_getValue(k, null);
    if (!Array.isArray(arr)) arr = [];
    arr.push(row);
    GM_setValue(k, arr);
}

function updateLog(visitId, ts, fn) {
    var k = KEY.log + monthKey(ts);
    var arr = GM_getValue(k, null);
    if (!Array.isArray(arr)) return;
    for (var i = arr.length - 1; i >= 0; i--) {
        if (arr[i][0] === visitId) { fn(arr[i]); GM_setValue(k, arr); return; }
    }
}

function removeFromLog(kind, ref, g) {
    logKeys(g).forEach(function (k) {
        var arr = GM_getValue(k, []);
        var kept = arr.filter(function (r) { return !(r[2] === kind && r[3] === ref); });
        if (kept.length !== arr.length) {
            if (kept.length) GM_setValue(k, kept); else GM_deleteValue(k);
        }
    });
}

function forgetTorrent(tid, g) {
    updateTorrent(tid, function () { return null; }, g);
    removeFromLog('t', tid, g);
    GM_deleteValue(keysOf(g).pres + tid);
}

function forgetSearch(key, g) {
    updateSearch(key, function () { return null; }, g);
    removeFromLog('s', key, g);
}

function isDataKey(k) { return k === KEY.last || DATA_KEY_RE.test(k); }
function groupKeys(g) {
    var prefix = 'ht_' + (g || GROUP) + '_';
    return GM_listValues().filter(function (k) { return k.indexOf(prefix) === 0 && DATA_KEY_RE.test(k); });
}
function logKeys(g) { var p = keysOf(g).log; return GM_listValues().filter(function (k) { return k.indexOf(p) === 0; }).sort(); }
function presKeys(g) { var p = keysOf(g).pres; return GM_listValues().filter(function (k) { return k.indexOf(p) === 0; }); }

// ── Recording visits ─────────────────────────────────────────────────────

function pushCapped(arr, item) {
    arr.push(item);
    return arr.length > MAX_ITEM_VISITS ? arr.slice(-MAX_ITEM_VISITS) : arr;
}

function recordTorrentVisit(tid, now) {
    var title = pageTitle();
    var cover = getSetting('saveCover') ? coverUrl() : '';
    var visit = { id: uuid(), ts: now };
    updateTorrent(tid, function (e) {
        e = e || { c: 0, f: now, l: now, t: '', v: [] };
        e.c = (e.c || 0) + 1;
        e.l = Math.max(e.l || 0, now);
        e.f = Math.min(e.f || now, now);
        if (title) e.t = title;
        if (cover) e.cv = cover;
        e.v = pushCapped(Array.isArray(e.v) ? e.v : [], [now, 0]);
        return e;
    });
    appendLog([visit.id, now, 't', tid, 0]);
    var e = torrents().get(tid);
    log.info('Recorded torrent visit #' + tid + ' "' + title + '" (visit ' + (e ? e.c : 1) + ')' + (cover ? '' : ' — no cover found'));
    return visit;
}

function recordSearchVisit(info, now) {
    var visit = { id: uuid(), ts: now, prev: null };
    updateSearch(info.key, function (e) {
        if (e) visit.prev = { c: e.c, l: e.l, f: e.f };
        e = e || { c: 0, f: now, l: now, v: [] };
        e.c = (e.c || 0) + 1;
        e.l = Math.max(e.l || 0, now);
        e.f = Math.min(e.f || now, now);
        e.lb = info.label;
        e.tx = info.text;
        e.u = location.href;
        e.v = pushCapped(Array.isArray(e.v) ? e.v : [], now);
        return e;
    });
    appendLog([visit.id, now, 's', info.key, 0]);
    log.info('Recorded search "' + info.label + '"' + (visit.prev ? ' (run ' + (visit.prev.c + 1) + ')' : ' (first time)'), info.key);
    return visit;
}

/** active (visible) time on a torrent page, saved when the tab is hidden or the page is left */
function trackTimeOnPage(visit, tid) {
    var activeMs = 0;
    var since = document.visibilityState === 'visible' ? Date.now() : null;
    var savedSec = 0;
    function save() {
        if (since !== null) { activeMs += Date.now() - since; since = null; }
        var sec = Math.round(activeMs / 1000);
        if (sec < 1 || sec === savedSec) return;
        savedSec = sec;
        updateTorrent(tid, function (e) {
            if (!e) return null;
            for (var i = e.v.length - 1; i >= 0; i--) {
                if (e.v[i][0] === visit.ts) { e.v[i][1] = sec; break; }
            }
            return e;
        });
        updateLog(visit.id, visit.ts, function (row) { row[4] = sec; });
        log.debug('Time on page for #' + tid + ': ' + fmtDur(sec));
    }
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') save();
        else if (since === null) since = Date.now();
    });
    window.addEventListener('pagehide', save);
}

// ── Styles ───────────────────────────────────────────────────────────────
// All CSS lives in history_tracker.styles.css (palette of Advanced Better filelist), loaded as a @resource.

function injectStyle() {
    var css = '';
    try { css = GM_getResourceText('HT_STYLES') || ''; } catch (e) { log.error('Couldn\'t read the styles resource', e); }
    if (!css) { log.error('Styles resource is empty — reinstall the script so Tampermonkey downloads history_tracker.styles.css'); return; }
    var style = document.createElement('style');
    style.id = 'ht-style';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
}

// ── Marking visited torrent links ────────────────────────────────────────

var linkBadges = new WeakMap();   // link -> its badge (the badge may sit before or after the link)

/**
 * True when the link sits in a container that cuts its text short — a line clamp ("…" after N lines, like the
 * grid cards of Advanced Viewer Experience) or a single line with an ellipsis. A badge after such a title is
 * cut off together with the end of the title, so it goes in front of the title instead.
 */
function titleGetsClipped(a) {
    var node = a;
    for (var i = 0; i < 4 && node && node !== document.body; i++) {
        if (i > 0 && /^(TD|TH|TR|TABLE|LI|UL|OL|BODY)$/.test(node.tagName)) break;
        var cs = getComputedStyle(node);
        var clamp = cs.webkitLineClamp || cs.getPropertyValue('-webkit-line-clamp');
        if (clamp && clamp !== 'none') return true;
        var hidden = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
        if (hidden && (cs.textOverflow === 'ellipsis' || cs.whiteSpace === 'nowrap')) return true;
        node = node.parentElement;
    }
    return false;
}

/**
 * Grid view of Advanced Viewer Experience: the card's row of stats chips (▲ seeders ▼ leechers ⤓ snatched size),
 * so the 👁 badge sits with the item's other badges. Cards without stats get a row of their own under the title.
 */
function cardChipRow(a) {
    var card = a.closest('.vg-card');
    if (!card || !a.closest('.vg-title')) return null;
    var row = card.querySelector('.vg-stats');
    if (row) return row;
    row = el('div', { className: 'vg-stats ht-stats-added' });
    var anchor = card.querySelector('.vg-dl-row') || card.querySelector('.vg-title');
    if (anchor) anchor.insertAdjacentElement('afterend', row);
    else (card.querySelector('.vg-info') || card).appendChild(row);
    return row;
}

function removeBadge(a, badge) {
    var host = badge.parentElement;
    badge.remove();
    linkBadges.delete(a);
    if (host && host.classList.contains('ht-stats-added') && !host.children.length) host.remove();
}

function markLink(a, id) {
    var e = torrents().get(id);
    var style = getSetting('markStyle');
    var badge = linkBadges.get(a) || null;
    if (badge && !badge.isConnected) { linkBadges.delete(a); badge = null; }
    if (!e) {
        a.classList.remove('ht-dim', 'ht-seen-img');
        a.removeAttribute('data-ht-tip');
        if (badge) removeBadge(a, badge);
        return;
    }
    var imageOnly = !!a.querySelector('img') && !cleanText(a.textContent);
    if (imageOnly) {
        a.classList.add('ht-seen-img');
        if (a.classList.contains('vw-cell')) a.removeAttribute('data-ht-tip');   // Poster Wall: it has its own info pane
        else a.setAttribute('data-ht-tip', id);
        return;
    }
    var wantBadge = style === 'badge' || style === 'both';
    a.classList.toggle('ht-dim', style === 'dim' || style === 'both');
    if (wantBadge) {
        a.removeAttribute('data-ht-tip');
        if (!badge) badge = el('span', { className: 'ht-badge' });
        var chipRow = cardChipRow(a);
        var before = false;
        if (chipRow) {
            if (badge.parentElement !== chipRow) chipRow.appendChild(badge);   // grid card: with the other badges
        } else {
            before = titleGetsClipped(a);                                       // list: after the title, unless it would be cut off
            var inPlace = before ? a.previousElementSibling === badge : a.nextElementSibling === badge;
            if (!inPlace) a.insertAdjacentElement(before ? 'beforebegin' : 'afterend', badge);
        }
        badge.classList.toggle('ht-badge-chip', !!chipRow);
        badge.classList.toggle('ht-badge-before', before);
        linkBadges.set(a, badge);
        var text = '👁 ' + e.c;
        if (badge.textContent !== text) badge.textContent = text;
        badge.setAttribute('data-ht-tip', id);
        badge.classList.toggle('ht-old', Date.now() - e.l > 30 * 86400000);
    } else {
        if (badge) removeBadge(a, badge);
        a.setAttribute('data-ht-tip', id);   // dim only: hover the link itself
    }
}

function markLinks() {
    if (!getSetting('markVisited')) return;
    var seen = 0;
    var total = 0;
    document.querySelectorAll('a[href*="torrents.php"]').forEach(function (a) {
        if (isOurs(a)) return;
        var id = linkTorrentId(a);
        if (!id || id === CURRENT_TORRENT) return;
        total++;
        if (torrents().has(id)) seen++;
        markLink(a, id);
    });
    log.debug('Marked ' + seen + ' of ' + total + ' torrent links as visited');
}

// ── Hiding visited torrents from lists ───────────────────────────────────
// An "item" is one entry of a list: a table row (search results, notifications, top 10, user history, collages),
// a card of Advanced Viewer Experience's grid view, or a card of the site's collage grid. Hiding is a CSS class
// with display:none !important, so it survives Advanced Viewer Experience showing / hiding tables and rows when
// you switch list ↔ grid, and grid cards are hidden as soon as they're built (the observer runs before the
// browser paints them). Torrents you open from the page you're on stay visible until the next page load, so
// the list doesn't shift under your mouse while you middle-click through it.

var ITEM_SELECTOR = 'tr.torrent, .vg-card, .torrent_grid__torrent';
var PAGE_LOADED_AT = Date.now();
var showVisitedThisPage = false;
var itemIds = new WeakMap();
var hidePill = null;

function hidingActive() { return !!getSetting('hideVisited') && !CURRENT_TORRENT; }

/**
 * Hidden by someone else — Advanced Viewer Experience's blacklists (tags, uploaders, uploader + tag rules) mark
 * rows with "vg-bl-hidden" and hide them; the site and other scripts hide rows with an inline display:none.
 * Those aren't counted as "visited hidden": you wouldn't see them anyway. (Userscripts can't read each other's
 * storage, so the page is the only place to learn what another script decided.)
 */
function hiddenByOthers(item) {
    return item.classList.contains('vg-bl-hidden') || item.style.display === 'none';
}

function itemTorrentId(item) {
    if (itemIds.has(item)) return itemIds.get(item);
    var id = 0;
    var links = item.querySelectorAll('a[href*="torrents.php"]');
    for (var i = 0; i < links.length && !id; i++) id = linkTorrentId(links[i]);
    itemIds.set(item, id);
    return id;
}

/** hide (or show again) every list item whose torrent you'd opened before this page loaded */
function applyHiding() {
    if (!hidingActive()) return;
    var hiddenIds = new Set();
    document.querySelectorAll(ITEM_SELECTOR).forEach(function (item) {
        if (isOurs(item)) return;
        var id = itemTorrentId(item);
        var e = id ? torrents().get(id) : null;
        var visited = !!(e && e.f < PAGE_LOADED_AT);
        if (visited && !hiddenByOthers(item)) hiddenIds.add(id);
        var hide = visited && !showVisitedThisPage;
        if (item.classList.contains('ht-hidden-visited') !== hide) item.classList.toggle('ht-hidden-visited', hide);
    });
    if (hiddenIds.size !== lastHiddenCount) {
        lastHiddenCount = hiddenIds.size;
        log.debug((showVisitedThisPage ? 'Showing ' : 'Hiding ') + hiddenIds.size + ' visited torrent(s) in lists');
    }
    updateHidePill(hiddenIds.size);
}
var lastHiddenCount = -1;

/** small switch at the bottom left: how many are hidden, and show / hide them on this page */
function updateHidePill(n) {
    if (!hidePill) {
        hidePill = el('button', { type: 'button', className: 'ht-hidepill', 'data-ht-ui': '' });
        hidePill.addEventListener('click', function () {
            showVisitedThisPage = !showVisitedThisPage;
            log.info(showVisitedThisPage ? 'Showing visited torrents on this page' : 'Hiding visited torrents again');
            applyHiding();
        });
        document.body.appendChild(hidePill);
        if (document.querySelector('.ht-navfloat')) hidePill.style.left = '130px';
    }
    hidePill.classList.toggle('ht-hidden', !n);
    hidePill.classList.toggle('ht-active', showVisitedThisPage);
    hidePill.textContent = showVisitedThisPage
        ? '👁 Showing ' + n + ' visited · hide them'
        : '🙈 ' + n + ' visited hidden · show';
    hidePill.title = showVisitedThisPage
        ? 'Hide the torrents you\'ve opened before (History Tracker)'
        : 'Show them on this page (History Tracker). To stop hiding: 🕘 History → Settings & data.';
}

function refreshMarks() {
    markLinks();
    applyHiding();
}

var remarkTimer = null;
function remarkSoon() {
    clearTimeout(remarkTimer);
    remarkTimer = setTimeout(refreshMarks, 200);
}

var rehideTimer = null;
function rehideSoon() {
    clearTimeout(rehideTimer);
    rehideTimer = setTimeout(applyHiding, 30);
}

// ── Poster Wall (Advanced Viewer Experience) ─────────────────────────────
// The wall reuses a small pool of poster cells (a.vw-cell) and only changes their href as you glide, so each
// href change re-marks that one cell. Its info pane (.vw-info-meta) is emptied and refilled for the poster in
// focus (the cell with .vw-focus); a "👁 Visited" chip is added to it then, like the badge in list / grid view.

function markWallCell(a) {
    if (!getSetting('markVisited')) return;
    var id = linkTorrentId(a);
    if (id) markLink(a, id);
    else a.classList.remove('ht-seen-img');
}

function decorateWallInfo(meta) {
    if (!getSetting('markVisited') || meta.querySelector('.ht-wall-chip')) return;
    var cell = document.querySelector('#vw-wall .vw-cell.vw-focus');
    var id = cell ? linkTorrentId(cell) : 0;
    var e = id ? torrents().get(id) : null;
    if (!e) return;
    var chip = el('span', {
        className: 'vw-chip ht-wall-chip' + (Date.now() - e.l > 30 * 86400000 ? ' ht-old' : ''),
        title: 'History Tracker — last visit ' + fmtDateTime(e.l) + (e.c > 1 ? ' · first ' + fmtDate(e.f) : ''),
        text: '👁 Visited ' + e.c + '× · last ' + ago(e.l),
    });
    meta.appendChild(chip);
    log.debug('Poster Wall: #' + id + ' visited ' + e.c + '×');
}

/** a list item was hidden / shown by someone else (e.g. a blacklist applied while the page is open) */
function othersVisibilityChanged(m) {
    var t = m.target;
    if (t.nodeType !== 1 || !t.matches(ITEM_SELECTOR) || isOurs(t)) return false;
    if (m.attributeName === 'style') return true;
    return /(^|\s)vg-bl-hidden(\s|$)/.test(m.oldValue || '') !== t.classList.contains('vg-bl-hidden');
}

function watchDom() {
    new MutationObserver(function (mutations) {
        var added = false;
        var visibility = false;
        for (var i = 0; i < mutations.length; i++) {
            var m = mutations[i];
            var t = m.target;
            if (m.type === 'attributes') {
                if (m.attributeName === 'href') {
                    if (t.classList && t.classList.contains('vw-cell')) markWallCell(t);   // a recycled wall poster
                    continue;
                }
                if (!visibility && hidingActive() && othersVisibilityChanged(m)) visibility = true;
                continue;
            }
            if (t.nodeType === 1 && t.classList.contains('vw-info-meta')) {          // wall info pane refilled
                for (var k = 0; k < m.addedNodes.length; k++) {
                    if (!isOurs(m.addedNodes[k])) { decorateWallInfo(t); break; }
                }
                continue;
            }
            if (added) continue;
            for (var j = 0; j < m.addedNodes.length; j++) {
                var n = m.addedNodes[j];
                if (n.nodeType !== 1 || isOurs(n)) continue;
                if (n.classList.contains('vw-cell')) { markWallCell(n); continue; }  // new wall poster: just this one
                if (n.querySelector('.vw-cell')) n.querySelectorAll('.vw-cell').forEach(markWallCell);  // the wall itself opening
                if (n.matches('a[href*="torrents.php"]') || n.querySelector('a[href*="torrents.php"]')) { added = true; break; }
            }
        }
        if (added) {
            applyHiding();   // right away, so new grid cards of visited torrents never flash on screen
            remarkSoon();
        } else if (visibility) {
            log.debug('A list item was hidden / shown by another script — recounting');
            rehideSoon();
        }
    }).observe(document.body, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['class', 'style', 'href'], attributeOldValue: true,
    });
}

/** another tab recorded a visit → update this tab's marks right away */
function watchOtherTabs() {
    if (typeof GM_addValueChangeListener !== 'function') return;
    for (var i = 0; i < SHARDS; i++) {
        (function (shard) {
            GM_addValueChangeListener(KEY.shard + shard, function (name, oldV, newV, remote) {
                if (!remote) return;
                log.debug('Another tab recorded a visit (shard ' + shard + ') — updating marks');
                refreshShard(shard);
                remarkSoon();
            });
        })(i);
    }
}

// ── Hover card for badges ────────────────────────────────────────────────

function setupTooltip() {
    var tip = el('div', { className: 'ht-tip', 'data-ht-ui': '', role: 'tooltip' });
    document.body.appendChild(tip);

    function show(target) {
        var id = parseInt(target.getAttribute('data-ht-tip'), 10);
        var e = torrents().get(id);
        if (!e) return;
        var lastDur = e.v && e.v.length ? e.v[e.v.length - 1][1] : 0;
        tip.replaceChildren(
            el('div', {}, [el('b', { text: 'Last visit: ' }), fmtDateTime(e.l)]),
            el('div', { className: 'ht-tip-sub', text: ago(e.l) + (lastDur ? ' · ' + fmtDur(lastDur) + ' on page' : '') }),
            el('div', { className: 'ht-tip-sub', text: e.c + ' visit' + (e.c === 1 ? '' : 's') + (e.c > 1 ? ' · first ' + fmtDate(e.f) : '') })
        );
        tip.style.display = 'block';
        var r = target.getBoundingClientRect();
        var w = tip.offsetWidth;
        var h = tip.offsetHeight;
        var top = r.bottom + 6;
        if (top + h > window.innerHeight - 8) top = r.top - h - 6;
        tip.style.left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8) + 'px';
        tip.style.top = top + 'px';
    }

    document.addEventListener('mouseover', function (ev) {
        var t = ev.target.closest && ev.target.closest('[data-ht-tip]');
        if (t) show(t);
    });
    document.addEventListener('mouseout', function (ev) {
        var t = ev.target.closest && ev.target.closest('[data-ht-tip]');
        if (t && !t.contains(ev.relatedTarget)) tip.style.display = 'none';
    });
    window.addEventListener('scroll', function () { tip.style.display = 'none'; }, { passive: true });
}

// ── Toast ────────────────────────────────────────────────────────────────

function showToast(text, sub, onClick) {
    document.querySelectorAll('.ht-toast').forEach(function (t) { t.remove(); });
    var t = el('div', { className: 'ht-toast', 'data-ht-ui': '', role: 'status' }, [el('b', { text: text }), sub ? el('small', { text: sub }) : null]);
    t.addEventListener('click', function () { t.remove(); if (onClick) onClick(); });
    document.body.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; }, 6000);
    setTimeout(function () { t.remove(); }, 6400);
}

// ── Torrent page: visit history button ───────────────────────────────────

function addTorrentButton(tid, visit) {
    var btn = el('button', { type: 'button', className: 'ht-tbtn', 'data-ht-ui': '', title: 'History Tracker: your visits to this torrent' });

    function render() {
        var e = torrents().get(tid);
        var prevCount = 0;
        var prevLast = 0;
        if (e) {
            var others = (e.v || []).filter(function (x) { return !visit || x[0] !== visit.ts; });
            prevCount = visit ? e.c - 1 : e.c;
            prevLast = others.length ? others[others.length - 1][0] : (visit ? 0 : e.l);
        }
        btn.classList.toggle('ht-first', prevCount < 1);
        btn.textContent = prevCount > 0 ? '👁 Seen ' + prevCount + '× before · last ' + ago(prevLast) : '👁 First visit';
    }
    render();
    btn.addEventListener('click', function () { openTorrentHistory(tid, GROUP, render); });

    var h2 = document.querySelector('#content h2') || document.querySelector('.thin h2') || document.querySelector('h2');
    if (h2) h2.appendChild(btn);
    else { btn.classList.add('ht-float'); document.body.appendChild(btn); }

    // the same title opened on the other site(s)
    if (!crossSite()) return;
    var own = torrents().get(tid);
    var title = normTitle((own && own.t) || pageTitle());
    if (!title) return;
    GROUPS.forEach(function (g) {
        if (g === GROUP) return;
        var best = null;
        torrents(g).forEach(function (e, id) {
            if (normTitle(e.t) === title && (!best || e.l > best.e.l)) best = { id: id, e: e };
        });
        if (!best) return;
        var also = el('button', {
            type: 'button', className: 'ht-tbtn ht-tbtn-other', 'data-ht-ui': '',
            title: 'A torrent with the same title on ' + GROUP_NAMES[g] + ' (#' + best.id + ') — click for its history',
            text: '↔ Seen on ' + GROUP_SHORT[g] + ' ' + best.e.c + '× · last ' + ago(best.e.l),
        });
        also.addEventListener('click', function () { openTorrentHistory(best.id, g, null); });
        btn.insertAdjacentElement('afterend', also);
    });
}

// ── Site menu item + search box hint ─────────────────────────────────────

function addMenuButton() {
    var a = el('a', { href: '#', title: 'Your search & torrent history (History Tracker)', text: '🕘 History' });
    a.addEventListener('click', function (ev) { ev.preventDefault(); openHistory('searches'); });
    var uls = document.querySelectorAll('#menu ul');
    if (uls.length) {
        uls[uls.length - 1].appendChild(el('li', { id: 'nav_ht', 'data-ht-ui': '' }, [a]));
    } else {
        log.info('No #menu on this page — showing the History button at the bottom left instead');
        var b = el('button', { type: 'button', className: 'ht-navfloat', 'data-ht-ui': '', text: '🕘 History' });
        b.addEventListener('click', function () { openHistory('searches'); });
        document.body.appendChild(b);
    }
}

function attachSearchHints() {
    var inputs = document.querySelectorAll('input[name="searchtext"]');
    if (!inputs.length) return;
    var cache = null;
    function searches() {
        if (!cache) cache = viewGroups().map(function (g) { return { g: g, all: readSearches(g) }; });
        return cache;
    }
    inputs.forEach(function (input) {
        var hint = el('span', { className: 'ht-hint ht-hidden', 'data-ht-ui': '', role: 'status' });
        input.insertAdjacentElement('afterend', hint);
        var text = '';
        function update() {
            text = cleanText(input.value);
            var q = text.toLowerCase();
            if (!q) { hint.classList.add('ht-hidden'); return; }
            var found = [];
            var similar = 0;
            searches().forEach(function (x) {
                var s = x.all['text:' + q];
                if (s) found.push({ g: x.g, c: s.c, l: s.l });
                similar += Object.keys(x.all).filter(function (k) { return k.indexOf(q) !== -1; }).length;
            });
            if (found.length) {
                var last = Math.max.apply(null, found.map(function (f) { return f.l; }));
                var onlyHere = found.length === 1 && found[0].g === GROUP;
                hint.textContent = '🕘 searched ' + (onlyHere ? found[0].c + '×' : perSiteCounts(found)) + ' · last ' + ago(last);
                hint.title = 'Last: ' + fmtDateTime(last) + ' — click to see your searches';
            } else if (similar) {
                hint.textContent = '🕘 ' + similar + ' past search' + (similar === 1 ? '' : 'es') + ' with “' + text + '”';
                hint.title = 'Click to see them';
            } else {
                hint.classList.add('ht-hidden');
                return;
            }
            hint.classList.remove('ht-hidden');
        }
        var t;
        input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(update, 150); });
        input.addEventListener('focus', function () { cache = null; update(); });
        hint.addEventListener('click', function () { openHistory('searches', text); });
        update();
    });
}

// ── Menu commands ────────────────────────────────────────────────────────

if (typeof GM_registerMenuCommand !== 'undefined') {
    GM_registerMenuCommand('🕘 Search history', function () { openHistory('searches'); });
    GM_registerMenuCommand('👁 Torrent history', function () { openHistory('torrents'); });
    GM_registerMenuCommand('⚙️ Settings & data', function () { openHistory('settings'); });
    GM_registerMenuCommand('📜 Show Changelog', function () { showChangelogModal(); });
    var markOn = getSetting('markVisited');
    GM_registerMenuCommand(
        (markOn ? '✅' : '⬜') + ' Mark Visited Torrent Links (click to ' + (markOn ? 'disable' : 'enable') + ', reloads page)',
        function () { setSetting('markVisited', !markOn); location.reload(); }
    );
    var hideOn = getSetting('hideVisited');
    GM_registerMenuCommand(
        (hideOn ? '✅' : '⬜') + ' Hide Visited Torrents in Lists (click to ' + (hideOn ? 'disable' : 'enable') + ', reloads page)',
        function () { setSetting('hideVisited', !hideOn); location.reload(); }
    );
}

// ── Start ────────────────────────────────────────────────────────────────

/** the offline viewer page: only the History window, full-screen, both sites */
function startViewer() {
    injectStyle();
    hideZoom = setupCoverZoom();
    document.title = 'History — [HF][EMP] History Tracker';
    var fallback = document.getElementById('ht-viewer-fallback');
    if (fallback) fallback.remove();
    log.info('Offline viewer — showing the saved history of both sites');
    openHistory('searches');
    checkVersionUpdate();
}

function start() {
    if (IS_VIEWER) { startViewer(); return; }
    injectStyle();
    setupTooltip();
    hideZoom = setupCoverZoom();
    addMenuButton();

    if (GM_getValue('ht_origin_' + GROUP, null) !== location.origin) GM_setValue('ht_origin_' + GROUP, location.origin);

    var u = new URL(location.href);
    var info = classify(u);
    var norm = normalizeUrl(u);
    var now = Date.now();
    var last = GM_getValue(KEY.last, null);
    var dedupeMs = (parseInt(getSetting('dedupeSeconds'), 10) || 0) * 1000;
    var isReload = !!(last && last.u === norm && now - last.ts < dedupeMs);
    if (info.type === 'torrent' || info.type === 'search') GM_setValue(KEY.last, { u: norm, ts: now });
    log.debug('v' + SCRIPT_VERSION + ' on ' + GROUP_NAMES[GROUP] + ' (' + HOST + ') — page type: ' + info.type +
        (info.torrent_id ? ' #' + info.torrent_id : '') + (info.key ? ' "' + info.key + '"' : ''));
    if (isReload) log.debug('Reload of the same page within ' + (dedupeMs / 1000) + 's — not counted as a new visit');

    if (info.type === 'torrent') {
        var tid = info.torrent_id;
        CURRENT_TORRENT = tid;
        var visit = null;
        if (getSetting('trackTorrents') && !isReload) {
            visit = recordTorrentVisit(tid, now);
            if (getSetting('timeOnPage')) trackTimeOnPage(visit, tid);
        }
        if (!visit && isReload) {
            // a quick reload isn't a new visit: treat the latest recorded one as "this" visit
            var ex = torrents().get(tid);
            if (ex && ex.v && ex.v.length) visit = { ts: ex.v[ex.v.length - 1][0] };
        }
        if (getSetting('savePresentation') && getSetting('trackTorrents') && torrents().has(tid)) savePresentation(tid, now);
        if (getSetting('torrentButton')) addTorrentButton(tid, visit);
    } else if (info.type === 'search' && getSetting('trackSearches') && !isReload) {
        var sv = recordSearchVisit(info, now);
        var elsewhere = viewGroups().filter(function (g) { return g !== GROUP; }).map(function (g) {
            var s = readSearches(g)[info.key];
            return s ? { g: g, c: s.c, l: s.l } : null;
        }).filter(Boolean);
        if ((sv.prev || elsewhere.length) && getSetting('searchToast')) {
            var subParts = [];
            if (sv.prev) subParts.push('last ' + ago(sv.prev.l) + ' · first ' + fmtDate(sv.prev.f));
            elsewhere.forEach(function (x) { subParts.push(x.c + '× on ' + GROUP_NAMES[x.g] + ' (last ' + ago(x.l) + ')'); });
            subParts.push('click for your searches');
            showToast(sv.prev
                ? '🔎 You ran this search ' + sv.prev.c + '× before'
                : '🔎 You ran this search on ' + elsewhere.map(function (x) { return GROUP_NAMES[x.g]; }).join(' and '),
                subParts.join(' · '),
                function () { openHistory('searches', info.text); });
        }
    }

    if (getSetting('markVisited') || hidingActive()) {
        refreshMarks();
        watchDom();
        watchOtherTabs();
    }
    if (getSetting('searchBoxHint')) attachSearchHints();
    checkVersionUpdate();
}

start();
