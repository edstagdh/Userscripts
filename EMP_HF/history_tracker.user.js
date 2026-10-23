// ==UserScript==
// @name         History Tracker
// @version      2.9
// @description  Remembers the torrent pages you open and the searches you run (stored locally in Tampermonkey), marks torrents you've already visited, keeps a searchable search history and, optionally, each torrent's presentation as BBCode
// @author       edstagdh
// @namespace    https://github.com/edstagdh/Userscripts
// @match        https://www.happyfappy.net/*
// @match        https://www.empornium.sx/*
// @match        https://emparadise.rs/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_info
// @connect      raw.githubusercontent.com
// @run-at       document-end
// @installURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/history_tracker.user.js
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/history_tracker.user.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=www.happyfappy.net
// @icon         https://www.google.com/s2/favicons?sz=64&domain=www.empornium.sx
// @icon         https://www.google.com/s2/favicons?sz=64&domain=emparadise.rs
// ==/UserScript==

/*
 * History Tracker: everything is kept in this script's Tampermonkey storage; nothing leaves the browser.
 *
 *  • Torrent pages (torrents.php?id=N): each visit is recorded (time, title, cover URL, active time on the page and,
 *    optionally, the presentation as BBCode). A 👁 button next to the title shows your earlier visits.
 *  • Searches (torrents.php with search text / tags / title / file list): each run is recorded. "The same search"
 *    = same text, tags, title and file list, whatever the sort order, page or size filters.
 *  • Torrent links you've opened get a 👁 badge; hovering it shows when you last visited.
 *  • Optionally hides torrents you've opened from the site's lists (rows and Advanced Viewer Experience grid cards),
 *    with a "🙈 N visited hidden · show" switch at the bottom left to bring them back on the current page.
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

(function () {
    'use strict';

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
    var SCRIPT_VERSION = (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script.version : '2.9';

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

    function crossSite() { return !!getSetting('crossSite'); }
    function viewGroups() { return crossSite() ? GROUPS : [GROUP]; }

    /** the domain you last used for a site group (so links to the other site go where you browse it) */
    function originOf(g) {
        if (!g || g === GROUP) return location.origin;
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
        if (g && g !== GROUP) { p.target = '_blank'; p.rel = 'noopener'; }
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
    function groupKeys() {
        var prefix = 'ht_' + GROUP + '_';
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

    // ── Presentation → BBCode ────────────────────────────────────────────────
    // Ported from [HF][EMP] Copy BBCode Button: walks #descbox and rebuilds the BBCode it was rendered from.

    function presentationToBBCode(root) {
        var spoilerMap = new Map();
        var torrentMap = new Map();
        var userMap = new Map();

        function Node() { this.type = null; this.value = null; this.text = null; this.children = []; }
        function isElement(n) { return n && n.nodeType === 1; }

        function filterFooterNodes(nodes) {
            for (var i = nodes.length - 1; i >= 0; i--) {
                if (isElement(nodes[i]) && nodes[i].id === 'torrentsigbox') nodes.splice(i, 1);
            }
            return nodes;
        }

        function filterSpoilerNodes(nodes) {
            for (var i = nodes.length - 1; i >= 0; i--) {
                var n = nodes[i];
                if (isElement(n) && n.nodeName.toLowerCase() === 'blockquote' && n.className && n.className.includes('spoiler')) {
                    var label = null;
                    for (var j = i - 1; j >= Math.max(0, i - 5); j--) {
                        var prev = nodes[j];
                        if (isElement(prev) && prev.innerText && prev.innerText.trim()) {
                            label = prev.innerText.trim();
                            nodes.splice(j, 1);
                            i -= 1;
                            break;
                        }
                    }
                    spoilerMap.set(n, label);
                }
            }
            return nodes;
        }

        function filterTorrentNodes(nodes) {
            for (var i = nodes.length - 1; i >= 1; i--) {
                var prev = nodes[i - 1];
                var cur = nodes[i];
                if (isElement(prev) && prev.nodeName.toLowerCase() === 'script' && isElement(cur) && cur.nodeName.toLowerCase() === 'a') {
                    var m = (cur.getAttribute('href') || '').match(/(\d+)/);
                    if (m) { torrentMap.set(cur, m[1]); nodes.splice(i - 1, 1); }
                }
            }
            return nodes;
        }

        function filterUserNodes(nodes) {
            nodes.forEach(function (n) {
                if (isElement(n) && n.nodeName.toLowerCase() === 'a') {
                    var href = n.getAttribute('href') || '';
                    var fc = n.firstChild;
                    if (/user.php\?/.test(href) && fc && fc.className === 'taglabel') {
                        var m = href.match(/(\d+)/);
                        if (m) userMap.set(n, m[1]);
                    }
                }
            });
            return nodes;
        }

        function filterNodes(nodes) {
            nodes = filterFooterNodes(nodes);
            nodes = filterSpoilerNodes(nodes);
            nodes = filterTorrentNodes(nodes);
            nodes = filterUserNodes(nodes);
            // remove the filename link right before a mediainfo block
            for (var i = nodes.length - 2; i >= 0; i--) {
                var cur = nodes[i];
                var next = nodes[i + 1];
                if (isElement(cur) && isElement(next) && cur.nodeName.toLowerCase() === 'a' && next.classList && next.classList.contains('mediainfo')) {
                    nodes.splice(i, 1);
                }
            }
            return nodes;
        }

        function normalizeHex(hex) {
            hex = hex.replace('#', '');
            if (hex.length === 3) return '#' + hex.split('').map(function (c) { return c + c; }).join('').toUpperCase();
            if (hex.length === 6 || hex.length === 8) return '#' + hex.toUpperCase();
            return null;
        }

        function rgbaToHex(r, g, b, a) {
            var out = '#' + [r, g, b].map(function (x) { return Number(x).toString(16).padStart(2, '0'); }).join('');
            if (a !== undefined && a !== null) out += Math.round(Number(a) * 255).toString(16).padStart(2, '0');
            return out.toUpperCase();
        }

        function getColorValue(style) {
            if (!style) return null;
            var m = style.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)/i);
            if (m) return rgbaToHex(m[1], m[2], m[3], m[4]);
            m = style.match(/(?:^|;)\s*(?:background-)?color\s*:\s*(#[A-Fa-f0-9]{3,8})\b/);
            if (m) { var hex = normalizeHex(m[1]); if (hex) return hex; }
            m = style.match(/(?:^|;)\s*(?:background-)?color\s*:\s*([a-zA-Z]+)\b/);
            if (m) return m[1];
            m = style.match(/(?:^|;)\s*(?:background-)?color\s*:\s*([^;!]+)/);
            if (m) return m[1].trim();
            return null;
        }

        function getGradientValue(style) {
            if (!style) return null;
            var match = style.match(/gradient\(([^)]+)\)\s*;/i) || style.match(/gradient\(([^)]+)\)/i);
            if (!match) return null;
            var arr = match[1].split(',');
            for (var i = 0; i <= arr.length - 4; i++) {
                if (/rgba?\(/.test(arr[i])) arr.splice(i, 4, arr.slice(i, i + 4).join(','));
            }
            var values = arr.map(function (part, idx) {
                if (idx === 0) return part.trim();
                var color = getColorValue('color:' + part);
                var pct = part.match(/(\d+%)/g);
                return pct ? color + ' ' + pct.join(' ') : color;
            });
            return 'gradient:' + values.join(';');
        }

        function getTableValue(n, style) {
            var values = [];
            if (style) {
                if (/width:\s*/.test(style)) { var w = style.match(/width:\s*(\d+px|\d+%)/); if (w) values.push(w[1]); }
                if (/border:\s*none/.test(style)) values.push('nball');
                if (/(?:^|;)\s*(?:background-)?color\s*:/.test(style)) { var c = getColorValue(style); if (c) values.push(c); }
                if (/url\(/.test(style)) { var u = style.match(/url\(([^)]+)\)/); if (u) values.push(u[1]); }
                if (/gradient\(/.test(style)) { var g = getGradientValue(style); if (g) values.push(g); }
                if (/margin:\s*0px\s+auto\s+0px\s+0px/.test(style)) values.push('left');
                else if (/margin:\s*0px\s+0px\s+0px\s+auto/.test(style)) values.push('right');
                else if (/margin:\s*0px\s+auto/.test(style)) values.push('center');
            }
            if (isElement(n) && n.className && n.className.includes('nopad')) values.push('nopad');
            if (isElement(n) && n.className) {
                if (n.className.includes('vat')) values.push('vat');
                else if (n.className.includes('vam')) values.push('vam');
                else if (n.className.includes('vab')) values.push('vab');
            }
            return values.length ? values.join(',') : null;
        }

        function parseText(n) {
            var node = new Node();
            var text = (n.textContent || '').trim();
            text = text.replace(/\[n\]/g, '[n[n]]');
            var regex = /\[(b|i|u|s|color|font|size|tip|url|anchor|#|\*|img|hr|br|quote|code|pre|plain|cast|info|plot|screens|user|torrent|article|mediainfo|table|tr|td|bg|tex)(?:=[^\]]+)?\]/g;
            var match = text.match(regex);
            if (match) match.forEach(function (tag) { text = text.replace(tag, tag.replace(/\]$/, '[n]]')); });
            node.text = text;
            return node;
        }

        function typed(type) { var node = new Node(); node.type = type; return node; }

        function parseBlockquote(n) {
            var node = new Node();
            if (n.className && n.className.includes && n.className.includes('spoiler')) {
                node.type = 'spoiler';
                node.value = spoilerMap.get(n) || null;
            } else {
                node.type = 'quote';
            }
            return node;
        }

        function parseA(n) {
            var node = new Node();
            var href = n.getAttribute('href') || '';
            if (torrentMap.has(n)) { node.type = 'torrent'; node.text = torrentMap.get(n); }
            else if (userMap.has(n)) { node.type = 'user'; node.text = userMap.get(n); }
            else if (n.className && n.className.includes('article')) {
                var m = href.match(/articles\.php\?topic=(.+)/);
                if (m) { node.type = 'article'; node.value = m[1]; }
            }
            else if (n.className === 'anchor') { node.type = '#'; node.value = n.getAttribute('id'); }
            else { node.type = 'url'; node.value = href.replace(/^https?:\/\/anonym\.es\/?\?/, ''); }
            return node;
        }

        function parseDiv(n) {
            var node = new Node();
            if (n.classList && n.classList.contains('mediainfo')) {
                node.type = 'mediainfo';
                node.text = n.textContent.replace(/\r\n/g, '\n');
                return node;
            }
            var style = n.getAttribute('style') || '';
            if (n.className === 'bbcode') { node.type = 'bg'; node.value = getTableValue(n, style); }
            else if (/text-align:\s*/.test(style)) {
                var m = style.match(/text-align:\s*([a-zA-Z]+)/);
                node.type = 'align';
                node.value = m ? m[1] : null;
            }
            return node;
        }

        function parseSpan(n) {
            var node = new Node();
            var c = n.getAttribute('class') || '';
            var style = n.getAttribute('style') || '';
            if (c) {
                if (/size/.test(c)) { node.type = 'size'; var m = c.match(/size(\d*)/); node.value = m ? m[1] : null; }
                else if (/tooltip/.test(c)) { node.type = 'tip'; node.value = n.getAttribute('title'); }
            } else if (/color:\s*/.test(style)) {
                node.type = 'color';
                node.value = getColorValue(style);
            } else if (/font-family:\s*/.test(style)) {
                node.type = 'font';
                var mm = style.match(/font-family:\s*(['"]?)([^,'"]+)\1/);
                var font = mm ? mm[2] : null;
                if (font === 'Helvetica Neue') font = 'Helvetica';
                else if (font === 'Palatino') font = 'Palatino Linotype';
                else if (font === 'TimesNewRoman') font = 'Times New Roman';
                node.value = font;
            } else if (/text-decoration:\s*/.test(style)) {
                var deco = style.match(/text-decoration:\s*([a-zA-Z-]+)/);
                node.type = deco && deco[1] === 'line-through' ? 's' : 'u';
            }
            return node;
        }

        function parseImg(n) {
            var node = new Node();
            var alt = n.getAttribute('alt') || '';
            if (n.className && n.className.includes('image')) {
                var src = n.hasAttribute('src') ? n.getAttribute('src') : n.getAttribute('data-src');
                if (n.className.includes('nopad')) { node.type = 'imgnm'; node.value = (alt && alt !== src) ? alt : null; }
                else if (n.className.includes('thumb')) node.type = 'thumb';
                else if (alt && alt !== src) { node.type = 'imgalt'; node.value = alt; }
                else {
                    var w = n.getAttribute('width');
                    var h = n.getAttribute('height');
                    node.type = 'img';
                    node.value = (w || h) ? [w, h].join(',') : null;
                }
                node.text = src;
            } else {
                node.type = alt || null;
            }
            return node;
        }

        function parseTableLike(n, type) {
            var node = new Node();
            node.type = type;
            node.value = getTableValue(n, n.getAttribute('style') || '');
            return node;
        }

        function parseDOM(n) {
            var node;
            switch (n.nodeName ? n.nodeName.toLowerCase() : '') {
                case '#text': node = parseText(n); break;
                case 'br': node = new Node(); node.text = '\n'; break;
                case 'hr': node = typed('hr'); break;
                case 'strong': node = typed('b'); break;
                case 'em': node = typed('i'); break;
                case 'code': node = typed('code'); break;
                case 'blockquote': node = parseBlockquote(n); break;
                case 'pre': node = typed('pre'); break;
                case 'li': node = typed('*'); break;
                case 'a': node = parseA(n); break;
                case 'div': node = parseDiv(n); break;
                case 'span': node = parseSpan(n); break;
                case 'img': node = parseImg(n); break;
                case 'table': node = parseTableLike(n, 'table'); break;
                case 'tr': node = parseTableLike(n, 'tr'); break;
                case 'td': node = parseTableLike(n, 'td'); break;
                default: node = new Node(); break;
            }
            if (node.type === 'mediainfo') return node;
            if (n.childNodes && n.childNodes.length) {
                var children = Array.from(n.childNodes);
                var mi = children.findIndex(function (c) { return isElement(c) && c.classList && c.classList.contains('mediainfo'); });
                if (mi !== -1) children = children.slice(0, mi + 1);
                node.children = filterNodes(children).map(parseDOM);
            }
            return node;
        }

        function build(node) {
            var out = '';
            if (node.type) {
                switch (node.type) {
                    case 'img': case 'imgalt': case 'imgnm': case 'thumb': case 'torrent': case 'user': case 'mediainfo': case 'plain':
                        out += node.value ? '[' + node.type + '=' + node.value + ']' : '[' + node.type + ']';
                        out += node.text || '';
                        out += '[/' + node.type + ']';
                        break;
                    case 'hr': case '*': case 'cast': case 'details': case 'info': case 'plot': case 'screens':
                        out += '[' + node.type + ']';
                        out += (node.children || []).map(build).join('');
                        break;
                    default:
                        out += node.value ? '[' + node.type + '=' + node.value + ']' : '[' + node.type + ']';
                        out += (node.children || []).map(build).join('');
                        out += '[/' + node.type + ']';
                }
            } else if (node.text) {
                out += node.text;
            } else if (node.children) {
                out += node.children.map(build).join('');
            }
            return out;
        }

        return filterNodes(Array.from(root.childNodes)).map(parseDOM).map(build).join('');
    }

    // ── Saved presentations ──────────────────────────────────────────────────
    // Stored gzip-compressed (base64) where the browser supports it: BBCode shrinks to roughly a quarter.

    function bytesToB64(bytes) {
        var s = '';
        for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s);
    }

    function encodeText(text) {
        if (typeof CompressionStream !== 'function') return Promise.resolve({ z: 0, d: text });
        try {
            var stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
            return new Response(stream).arrayBuffer()
                .then(function (buf) { return { z: 1, d: bytesToB64(new Uint8Array(buf)) }; })
                .catch(function () { return { z: 0, d: text }; });
        } catch (e) {
            return Promise.resolve({ z: 0, d: text });
        }
    }

    function decodeVersion(v) {
        if (!v.z) return Promise.resolve(v.d);
        var bin = atob(v.d);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).text();
    }

    function readPresentations(tid, g) {
        var arr = GM_getValue(keysOf(g).pres + tid, null);
        return Array.isArray(arr) ? arr : [];
    }

    function savePresentation(tid, now) {
        var box = document.getElementById('descbox');
        if (!box) { log.debug('No #descbox on this page — presentation not saved'); return; }
        var text;
        try { text = presentationToBBCode(box); } catch (e) { log.warn('Presentation → BBCode failed for #' + tid, e); return; }
        if (!text || !text.trim()) { log.debug('Presentation of #' + tid + ' is empty — not saved'); return; }
        var h = hashText(text);
        var key = KEY.pres + tid;
        var arr = readPresentations(tid);
        var lastV = arr[arr.length - 1];
        if (lastV && lastV.h === h) {           // unchanged since the last saved copy: just note we saw it again
            lastV.l = now;
            GM_setValue(key, arr);
            log.debug('Presentation of #' + tid + ' unchanged since ' + fmtDateTime(lastV.t));
            return;
        }
        encodeText(text).then(function (enc) {
            var v = { t: now, l: now, h: h, n: text.length, z: enc.z, d: enc.d };
            var list = readPresentations(tid);
            if (getSetting('presentationMode') === 'every') {
                list.push(v);
                var max = Math.max(1, parseInt(getSetting('presentationVersions'), 10) || 1);
                if (list.length > max) list = list.slice(-max);
            } else {
                list = [v];
            }
            GM_setValue(key, list);
            log.info('Saved presentation of #' + tid + ': ' + fmtBytes(text.length) + ' of BBCode, stored as ' +
                fmtBytes(enc.d.length) + (enc.z ? ' (gzip)' : ' (uncompressed)') + ' · ' + list.length + ' cop' + (list.length === 1 ? 'y' : 'ies') + ' kept');
            prunePresentations(tid);
        }).catch(function (e) { log.error('Saving the presentation of #' + tid + ' failed', e); });
    }

    /** keep presentations only for the N most recently seen torrents */
    function prunePresentations(keepId) {
        var max = parseInt(getSetting('presentationMaxTorrents'), 10) || 0;
        if (max <= 0) return;
        var keys = presKeys();
        if (keys.length <= max) return;
        var dated = keys.map(function (k) {
            var arr = GM_getValue(k, []);
            var last = arr.length ? arr[arr.length - 1].l || arr[arr.length - 1].t : 0;
            return [k, last];
        }).filter(function (x) { return x[0] !== KEY.pres + keepId; });
        dated.sort(function (a, b) { return a[1] - b[1]; });
        var drop = dated.slice(0, keys.length - max);
        drop.forEach(function (x) { GM_deleteValue(x[0]); });
        log.info('Removed ' + drop.length + ' old saved presentation(s) (keeping the ' + max + ' most recent torrents)');
    }

    function copyText(text, what) {
        try {
            GM_setClipboard(text, 'text');
            showToast('📋 ' + (what || 'BBCode') + ' copied', fmtBytes(text.length) + ' of text');
            log.info('Copied ' + (what || 'BBCode') + ' (' + fmtBytes(text.length) + ')');
        } catch (e) {
            log.error('Copy to clipboard failed', e);
            showToast('Copy failed', e.message);
        }
    }

    function copyLatestPresentation(tid, g) {
        var arr = readPresentations(tid, g);
        if (!arr.length) { showToast('No presentation saved for this torrent'); return; }
        decodeVersion(arr[arr.length - 1]).then(function (t) { copyText(t, 'Presentation BBCode'); })
            .catch(function (e) { log.error('Reading the saved presentation of #' + tid + ' failed', e); showToast('Couldn\'t read the saved presentation'); });
    }

    // ── BBCode → preview ─────────────────────────────────────────────────────
    // Renders the tags the converter above produces. Builds DOM nodes directly (never innerHTML), only http(s)
    // links / images and plain colour / font values get through, so a presentation can't run anything.

    var BB_TAGS = {
        b: 1, i: 1, u: 1, s: 1, color: 1, size: 1, font: 1, align: 1, url: 1, quote: 1, spoiler: 1, table: 1, tr: 1, td: 1,
        bg: 1, tip: 1, '#': 1, article: 1, cast: 1, details: 1, info: 1, plot: 1, screens: 1,
        img: 2, imgnm: 2, imgalt: 2, thumb: 2, code: 2, pre: 2, mediainfo: 2, plain: 2, torrent: 2, user: 2,   // raw content
        hr: 0, '*': 0, n: 0,                                                                                  // no closing tag
    };
    var BB_SIZES = { 0: '0.6em', 1: '0.7em', 2: '0.85em', 3: '1em', 4: '1.15em', 5: '1.4em', 6: '1.7em', 7: '2em', 8: '2.4em', 9: '2.8em', 10: '3.2em' };

    function bbParse(src) {
        var root = { tag: null, kids: [] };
        var stack = [root];
        var re = /\[(\/?)([a-z]+|\*|#)(?:=([^\]]*))?\]/gi;
        var last = 0;
        var m;
        function top() { return stack[stack.length - 1]; }
        function text(t) { if (t) top().kids.push(t); }
        while ((m = re.exec(src))) {
            var close = m[1] === '/';
            var tag = m[2].toLowerCase();
            var kind = BB_TAGS[tag];
            if (kind === undefined) continue;                 // unknown tag: stays as text
            text(src.slice(last, m.index));
            last = re.lastIndex;
            if (tag === 'n') continue;                        // [n] = "don't parse" marker
            if (kind === 0) { if (!close) top().kids.push({ tag: tag, val: m[3], kids: [] }); continue; }
            if (close) {
                for (var j = stack.length - 1; j > 0; j--) {
                    if (stack[j].tag === tag) { stack.length = j; break; }
                }
                continue;
            }
            var node = { tag: tag, val: m[3], kids: [] };
            top().kids.push(node);
            if (kind === 2) {
                var rest = src.slice(last);
                var end = rest.toLowerCase().indexOf('[/' + tag + ']');
                node.kids = [end === -1 ? rest : rest.slice(0, end)];
                last += end === -1 ? rest.length : end + tag.length + 3;
                re.lastIndex = last;
            } else {
                stack.push(node);
            }
        }
        text(src.slice(last));
        return root.kids;
    }

    function bbUrl(u) {
        u = String(u || '').trim();
        if (/^https?:\/\//i.test(u)) return u;
        if (/^\/[^/]/.test(u)) return location.origin + u;
        return null;
    }
    function bbColor(v) { v = String(v || '').trim(); return /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,%]+\))$/i.test(v) ? v : null; }
    function bbRaw(n) { return n.kids.map(function (k) { return typeof k === 'string' ? k : bbRaw(k); }).join(''); }

    /** table / tr / td / bg values, e.g. "80%,#222222,nball,center,vat" */
    function bbBoxStyle(e, val) {
        String(val || '').split(',').forEach(function (p) {
            p = p.trim();
            if (/^\d+(px|%)$/.test(p)) e.style.width = p;
            else if (p === 'nball') e.style.border = 'none';
            else if (p === 'center') { e.style.marginLeft = 'auto'; e.style.marginRight = 'auto'; }
            else if (p === 'right') e.style.marginLeft = 'auto';
            else if (p === 'vat') e.style.verticalAlign = 'top';
            else if (p === 'vam') e.style.verticalAlign = 'middle';
            else if (p === 'vab') e.style.verticalAlign = 'bottom';
            else if (bbColor(p) && /^#|^rgb/i.test(p)) e.style.backgroundColor = p;
        });
    }

    function bbAppendText(parent, t) {
        t.split('\n').forEach(function (line, i) {
            if (i) parent.appendChild(document.createElement('br'));
            if (line) parent.appendChild(document.createTextNode(line));
        });
    }

    function bbBuild(kids, parent) {
        kids.forEach(function (k) {
            if (typeof k === 'string') bbAppendText(parent, k);
            else parent.appendChild(bbNode(k));
        });
        return parent;
    }

    function bbImage(n) {
        var src = bbUrl(bbRaw(n));
        if (!src) return document.createTextNode('');
        var img = el('img', { src: src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', 'data-ht-zoom': src });
        if (n.tag === 'img' && n.val) {
            var wh = n.val.split(',');
            if (/^\d+$/.test(wh[0] || '')) img.width = parseInt(wh[0], 10);
            if (/^\d+$/.test(wh[1] || '')) img.height = parseInt(wh[1], 10);
        }
        if (n.tag === 'imgalt' && n.val) img.alt = n.val;
        if (n.tag === 'thumb') img.className = 'ht-bb-thumb';
        if (n.tag === 'imgnm') img.className = 'ht-bb-nm';
        return img;
    }

    function bbNode(n) {
        var e;
        switch (n.tag) {
            case 'b': return bbBuild(n.kids, el('strong'));
            case 'i': return bbBuild(n.kids, el('em'));
            case 'u': e = el('span'); e.style.textDecoration = 'underline'; return bbBuild(n.kids, e);
            case 's': e = el('span'); e.style.textDecoration = 'line-through'; return bbBuild(n.kids, e);
            case 'color': e = el('span'); if (bbColor(n.val)) e.style.color = n.val; return bbBuild(n.kids, e);
            case 'size': e = el('span'); if (BB_SIZES[n.val]) e.style.fontSize = BB_SIZES[n.val]; return bbBuild(n.kids, e);
            case 'font': e = el('span'); if (/^[\w\s-]{1,40}$/.test(n.val || '')) e.style.fontFamily = '"' + n.val + '", sans-serif'; return bbBuild(n.kids, e);
            case 'align':
                e = el('div');
                if (/^(left|center|right|justify)$/i.test(n.val || '')) e.style.textAlign = n.val.toLowerCase();
                return bbBuild(n.kids, e);
            case 'url':
                var href = bbUrl(n.val || bbRaw(n));
                e = href ? el('a', { href: href, target: '_blank', rel: 'noopener noreferrer' }) : el('span');
                return bbBuild(n.kids, e);
            case 'img': case 'imgnm': case 'imgalt': case 'thumb': return bbImage(n);
            case 'quote': return bbBuild(n.kids, el('blockquote', { className: 'ht-bb-quote' }));
            case 'spoiler':
                e = el('details', { className: 'ht-bb-spoiler' }, [el('summary', { text: n.val || 'Spoiler' })]);
                return bbBuild(n.kids, e);
            case 'code': case 'pre': case 'mediainfo': return el('pre', { className: 'ht-bb-pre', text: bbRaw(n) });
            case 'plain': return document.createTextNode(bbRaw(n));
            case 'hr': return el('hr');
            case '*': return el('span', { className: 'ht-bb-bullet', text: '• ' });
            case 'table': e = el('table', { className: 'ht-bb-table' }); bbBoxStyle(e, n.val); return bbBuild(n.kids.filter(function (k) { return typeof k !== 'string' || k.trim(); }), e);
            case 'tr': e = el('tr'); bbBoxStyle(e, n.val); return bbBuild(n.kids.filter(function (k) { return typeof k !== 'string' || k.trim(); }), e);
            case 'td': e = el('td'); bbBoxStyle(e, n.val); return bbBuild(n.kids, e);
            case 'bg': e = el('div', { className: 'ht-bb-bg' }); bbBoxStyle(e, n.val); return bbBuild(n.kids, e);
            case 'tip': e = el('span', { title: n.val || '' }); e.style.borderBottom = '1px dotted'; return bbBuild(n.kids, e);
            case 'torrent':
                var tid = bbRaw(n).trim();
                return /^\d+$/.test(tid) ? el('a', { href: location.origin + '/torrents.php?id=' + tid, target: '_blank', rel: 'noopener', text: 'Torrent #' + tid }) : document.createTextNode('');
            case 'user':
                var uid = bbRaw(n).trim();
                return /^\d+$/.test(uid) ? el('a', { href: location.origin + '/user.php?id=' + uid, target: '_blank', rel: 'noopener', text: 'User #' + uid }) : document.createTextNode('');
            default: return bbBuild(n.kids, el('span'));
        }
    }

    function renderBBCode(text) {
        return bbBuild(bbParse(text), document.createDocumentFragment());
    }

    // ── Styles (palette of Advanced Better filelist) ─────────────────────────

    function injectStyle() {
        var style = document.createElement('style');
        style.id = 'ht-style';
        style.textContent = `
.ht-badge {
    display: inline-block; margin-left: 5px; padding: 0 5px; vertical-align: middle;
    border: 1px solid #4a9fd4; border-radius: 4px; background: #1a4a7a; color: #7ecfff !important;
    font-size: 8pt; font-weight: 700; line-height: 14px; white-space: nowrap; text-decoration: none !important; cursor: help;
}
.ht-badge.ht-old { background: #29374F; color: #89a0b8 !important; border-color: #4a6080; }
.ht-hidden-visited { display: none !important; }
.ht-hidepill {
    position: fixed; left: 14px; bottom: 14px; z-index: 2147483000; padding: 4px 12px;
    border: 1px solid #4a6080; border-radius: 4px; background: #29374F; color: #bcd;
    font-family: inherit; font-size: 9pt; font-weight: 700; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.5);
    transition: background 0.15s, color 0.15s;
}
.ht-hidepill:hover { background: #354a68; color: #e0ecf8; }
.ht-hidepill.ht-active { background: #1a4a7a; color: #7ecfff; border-color: #4a9fd4; }
.ht-badge.ht-badge-before { margin-left: 0; margin-right: 5px; }
.ht-badge.ht-badge-chip {
    display: inline-flex; align-items: center; gap: 3px; margin: 0; padding: 2px 6px; border-radius: 3px;
    font-size: 10px; font-weight: 700; line-height: normal; letter-spacing: 0.01em;
}
a.ht-dim { opacity: .5; }
a.ht-dim:hover { opacity: 1; }
a.ht-seen-img img { outline: 2px solid #4a9fd4; outline-offset: -2px; }

.ht-tip {
    position: fixed; z-index: 2147483004; pointer-events: none; display: none;
    background: #1a1a1a; color: #c0c0c0; border: 1px solid #3a3a3a; border-radius: 6px;
    box-shadow: 0 6px 24px rgba(0,0,0,.7); padding: 7px 10px; font-size: 11px; line-height: 1.5; max-width: 320px; text-align: left;
}
.ht-tip b { color: #7ecfff; }
.ht-tip .ht-tip-sub { color: #888; }

.ht-tbtn {
    display: inline-block; margin-left: 10px; vertical-align: middle; padding: 2px 9px;
    border: 1px solid #4a9fd4; border-radius: 4px; background: #1a4a7a; color: #7ecfff;
    font-family: inherit; font-size: 9pt; font-weight: 700; line-height: 1.5; cursor: pointer; white-space: nowrap;
    transition: background 0.15s, color 0.15s;
}
.ht-tbtn:hover { background: #22609c; color: #bfe8ff; }
.ht-tbtn.ht-first { border-color: #4a6080; background: #29374F; color: #89a0b8; }
.ht-tbtn.ht-first:hover { background: #354a68; color: #bcd; }
.ht-tbtn.ht-tbtn-other { border-color: #2a7a70; background: #10302c; color: #70e0d0; }
.ht-tbtn.ht-tbtn-other:hover { background: #164540; color: #a0f0e4; }
.ht-site {
    display: inline-block; flex-shrink: 0; padding: 0 5px; border: 1px solid; border-radius: 3px;
    font-size: 9px; font-weight: 800; letter-spacing: 0.06em; line-height: 14px; vertical-align: middle;
}
.ht-site-hf { color: #e8a0ff; background: #2e1a3a; border-color: #6a3a8a; }
.ht-site-emp { color: #70e0d0; background: #10302c; border-color: #2a7a70; }
.ht-tbtn.ht-float { position: fixed; left: 14px; bottom: 14px; z-index: 2147483000; margin: 0; }

.ht-hint { display: inline-block; margin-left: 8px; font-size: 9pt; color: #7ecfff; cursor: pointer; white-space: nowrap; }
.ht-hint:hover { text-decoration: underline; }

.ht-toast {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483005; max-width: 400px; padding: 10px 14px;
    background: #1a1a1a; color: #c0c0c0; border: 1px solid #3a3a3a; border-left: 3px solid #4a9fd4; border-radius: 8px;
    box-shadow: 0 10px 50px rgba(0,0,0,.8); font-size: 12px; line-height: 1.45; cursor: pointer; transition: opacity .3s; text-align: left;
}
.ht-toast b { color: #f0f0f0; }
.ht-toast small { display: block; color: #888; margin-top: 2px; font-size: 11px; }

#nav_ht a, #nav_ht a:visited { color: #7ecfff !important; font-weight: bold; cursor: pointer; }
#nav_ht a:hover { color: #bfe8ff !important; }
.ht-navfloat {
    position: fixed; left: 14px; bottom: 14px; z-index: 2147483000; padding: 4px 12px;
    border: 1px solid #4a9fd4; border-radius: 4px; background: #1a4a7a; color: #7ecfff; font-weight: 700; cursor: pointer;
}

.ht-zoom {
    position: fixed; z-index: 2147483004; display: none; pointer-events: none; padding: 4px;
    background: #111; border: 1px solid #444; border-radius: 6px; box-shadow: 0 6px 24px rgba(0,0,0,.6);
}
.ht-zoom img { display: block; max-width: none; max-height: none; border-radius: 3px; }
.ht-zoom .ht-zoom-status { color: #ddd; font-size: 12px; padding: 6px 10px; white-space: nowrap; }

#ht-backdrop {
    position: fixed; inset: 0; z-index: 2147483001; background: rgba(0,0,0,0.78); backdrop-filter: blur(2px);
    display: flex; align-items: center; justify-content: center;
}
#ht-modal {
    position: relative; background: #1a1a1a; border: 1px solid #3a3a3a; border-radius: 8px;
    width: 860px; max-width: 96vw; max-height: 86vh; display: flex; flex-direction: column;
    color: #d0d0d0; font-family: inherit; font-size: 12px; text-align: left; box-shadow: 0 10px 50px rgba(0,0,0,0.8);
}
#ht-modal * { box-sizing: border-box; }
#ht-modal a { color: #d0d0d0; text-decoration: none; }
#ht-modal a:hover { color: #7ecfff; }
#ht-modal .ht-header {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 14px 18px 12px; border-bottom: 1px solid #2e2e2e;
}
#ht-modal .ht-header-left { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; text-align: left; }
/* the site styles its own h2 headings (centered, floats, widths…): reset all of that so the title sits flush left */
#ht-modal .ht-header h2 {
    margin: 0; padding: 0; border: none; background: none; font-size: 14px; font-weight: 800;
    color: #f0f0f0; letter-spacing: 0.04em; text-transform: uppercase;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    text-align: left !important; float: none; width: auto; max-width: 100%; display: block;
    font-family: inherit; line-height: 1.3; text-shadow: none; box-shadow: none;
}
#ht-modal .ht-subtitle { display: block; font-size: 10px; color: #666; letter-spacing: 0.02em; text-align: left; }
#ht-modal .ht-header-right { display: flex; gap: 6px; flex-shrink: 0; }
#ht-modal .ht-tabs { display: flex; gap: 6px; padding: 10px 18px 0; flex-wrap: wrap; }
#ht-modal .ht-body { padding: 12px 18px; overflow-y: auto; flex: 1; }
#ht-modal .ht-footer {
    display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
    padding: 12px 18px 16px; border-top: 1px solid #2e2e2e;
}
#ht-modal .ht-github-link { font-size: 11px; color: #5a7a9a; font-weight: 600; }
#ht-modal .ht-github-link:hover { color: #7aa0c8; text-decoration: underline; }

#ht-modal .ht-btn {
    border: 1px solid #4a6080; border-radius: 4px; background: #29374F; color: #89a0b8;
    font-family: inherit; font-size: 9pt; padding: 3px 9px; cursor: pointer; white-space: nowrap;
    transition: background 0.15s, color 0.15s; text-decoration: none; display: inline-block; line-height: 1.5;
}
#ht-modal .ht-btn:hover { background: #354a68; color: #bcd; }
#ht-modal .ht-btn.ht-active, #ht-modal .ht-btn[aria-selected=true] { background: #1a4a7a; color: #7ecfff; border-color: #4a9fd4; }
#ht-modal .ht-btn.ht-icon { border-color: transparent; background: none; padding: 2px 6px; }
#ht-modal .ht-btn.ht-icon:hover { border-color: #4a6080; background: #29374F; }
#ht-modal .ht-btn.ht-back { background: #2e2810; border-color: #6a5a1a; color: #f0d080; font-weight: 700; }
#ht-modal .ht-btn.ht-back:hover { background: #3d3515; border-color: #8a7a2a; color: #ffe6a0; }
#ht-modal .ht-btn.ht-danger:hover { border-color: #8a4a4a; background: #3a2222; color: #d09090; }
#ht-modal .ht-ok {
    padding: 6px 22px; font-family: inherit; font-size: 12px; font-weight: 700; border-radius: 4px; cursor: pointer;
    background: #2d4a2d; border: 1px solid #4a7a4a; color: #8fc88f; letter-spacing: 0.03em; text-decoration: none; display: inline-block;
    transition: background 0.15s, color 0.15s;
}
#ht-modal .ht-ok:hover { background: #3a5e3a; color: #aedaae; border-color: #6aaa6a; }
#ht-modal input[type=search], #ht-modal input[type=number], #ht-modal select {
    border: none; border-radius: 5px; background: #29374F; color: #bcd; padding: 5px 8px; font-family: inherit; font-size: 12px;
}
#ht-modal input:focus, #ht-modal select:focus { outline: 1px solid #4a9fd4; }
#ht-modal input[type=search]::placeholder { color: #6a7d94; }
#ht-modal .ht-toolbar { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
#ht-modal .ht-toolbar input[type=search] { flex: 1; min-width: 200px; }

#ht-modal .ht-action {
    display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
    padding: 8px 10px; margin-bottom: 10px; border-radius: 6px; background: #1e2b3e; border: 1px solid #3a5070; color: #bcd;
}
#ht-modal .ht-action b { color: #7ecfff; }
#ht-modal .ht-action.ht-new { background: #202020; border-color: #2e2e2e; color: #999; }
#ht-modal .ht-action.ht-new b { color: #d0d0d0; }

#ht-modal .ht-rows { border: 1px solid #2e2e2e; border-radius: 6px; overflow: hidden; }
#ht-modal .ht-row { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; padding: 7px 10px; border-top: 1px solid #2a2a2a; }
#ht-modal .ht-row:first-child { border-top: 0; }
#ht-modal .ht-row:hover { background-color: #6baad01a; }
#ht-modal .ht-main { min-width: 0; }
#ht-modal .ht-titleline { display: flex; align-items: center; gap: 6px; min-width: 0; }
#ht-modal a.ht-title { display: block; min-width: 0; font-weight: 600; color: #e0e0e0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#ht-modal a.ht-title:hover { color: #7ecfff; }
#ht-modal .ht-chips { display: flex; gap: 4px; }
#ht-modal .ht-sub { color: #777; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#ht-modal .ht-side { display: flex; align-items: center; gap: 2px; }
#ht-modal .ht-count {
    display: inline-block; min-width: 42px; text-align: center; padding: 1px 6px; border-radius: 3px;
    font-size: 10px; font-weight: 800; letter-spacing: 0.04em;
    background: #29374F; border: 1px solid #4a6080; color: #89a0b8;
}
#ht-modal .ht-count.ht-hot { background: #1a4a7a; border-color: #4a9fd4; color: #7ecfff; }
#ht-modal .ht-cover { width: 46px; height: 46px; border-radius: 4px; object-fit: cover; background: #29374F; display: block; cursor: zoom-in; }
#ht-modal .ht-cover.ht-blank { display: grid; place-items: center; color: #4a6080; cursor: default; }
#ht-modal .ht-times { grid-column: 1 / -1; margin: 2px 0; padding: 8px 10px; border-radius: 6px; background: #202020; }
#ht-modal .ht-list { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 28px; }
#ht-modal .ht-list li { display: flex; gap: 8px; break-inside: avoid; font-size: 11px; color: #c0c0c0; line-height: 1.7; }
#ht-modal .ht-list li::before { content: '→'; color: #5a8a5a; font-weight: 700; flex-shrink: 0; }
#ht-modal .ht-list .ht-sub { display: inline; white-space: normal; }
#ht-modal .ht-empty { padding: 28px; text-align: center; color: #777; }
#ht-modal .ht-more { display: flex; justify-content: center; margin-top: 10px; }
#ht-modal .ht-label {
    display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
    color: #7ec87e; background: #1a2e1a; border: 1px solid #2e5e2e; padding: 2px 8px; border-radius: 3px; margin: 16px 0 8px;
}
#ht-modal .ht-label:first-child { margin-top: 0; }
#ht-modal .ht-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; }
#ht-modal .ht-check { display: flex; gap: 7px; align-items: flex-start; cursor: pointer; color: #bcd; font-size: 11px; }
#ht-modal .ht-check input { margin-top: 2px; cursor: pointer; }
#ht-modal .ht-field { display: grid; gap: 4px; }
#ht-modal .ht-field > span { color: #89a0b8; font-size: 11px; }
#ht-modal .ht-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
#ht-modal .ht-stat { background: #202020; border: 1px solid #2e2e2e; border-radius: 6px; padding: 7px 10px; }
#ht-modal .ht-stat b { display: block; font-size: 15px; color: #f0f0f0; }
#ht-modal .ht-stat span { color: #777; font-size: 10px; }
#ht-modal .ht-buttons { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
#ht-modal .ht-note { color: #777; font-size: 11px; margin: 8px 0 0; }
#ht-modal .ht-torrent-head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
#ht-modal .ht-torrent-head .ht-cover { width: 90px; height: 90px; }
#ht-modal .ht-torrent-head .ht-stats { flex: 1; }
#ht-modal .ht-pres { border: 1px solid #2e2e2e; border-radius: 6px; overflow: hidden; }
#ht-modal .ht-pres .ht-row { grid-template-columns: 1fr auto; }
#ht-modal textarea.ht-code {
    grid-column: 1 / -1; width: 100%; height: 240px; resize: vertical; background: #111; color: #c0c0c0;
    border: 1px solid #2e2e2e; border-radius: 4px; padding: 8px; font: 11px/1.45 ui-monospace, Consolas, monospace;
}
#ht-modal .ht-render {
    grid-column: 1 / -1; max-height: 560px; overflow: auto; padding: 12px; border-radius: 4px;
    background: #222; border: 1px solid #2e2e2e; color: #ddd; font-size: 12px; line-height: 1.5; word-wrap: break-word;
}
#ht-modal .ht-render a { color: #7ecfff; }
#ht-modal .ht-render a:hover { text-decoration: underline; }
#ht-modal .ht-render img { max-width: 100%; height: auto; vertical-align: middle; margin: 2px; cursor: zoom-in; }
#ht-modal .ht-render img.ht-bb-thumb { max-width: 250px; }
#ht-modal .ht-render img.ht-bb-nm { margin: 0; }
#ht-modal .ht-render hr { border: 0; border-top: 1px solid #444; margin: 8px 0; }
#ht-modal .ht-render .ht-bb-quote { margin: 6px 0; padding: 6px 10px; border-left: 3px solid #4a6080; background: #1c1c1c; }
#ht-modal .ht-render .ht-bb-spoiler { margin: 6px 0; padding: 4px 10px; border: 1px solid #3a3a3a; border-radius: 4px; background: #1c1c1c; }
#ht-modal .ht-render .ht-bb-spoiler summary { cursor: pointer; color: #89a0b8; font-weight: 700; }
#ht-modal .ht-render .ht-bb-pre { white-space: pre-wrap; margin: 6px 0; padding: 8px; background: #111; border: 1px solid #2e2e2e; border-radius: 4px; font: 11px/1.4 ui-monospace, Consolas, monospace; }
#ht-modal .ht-render .ht-bb-table { border-collapse: collapse; max-width: 100%; }
#ht-modal .ht-render .ht-bb-table td { padding: 4px 6px; border: 1px solid #333; }
#ht-modal .ht-render .ht-bb-bg { padding: 6px; border-radius: 4px; max-width: 100%; }
#ht-modal .ht-backbar {
    display: flex; align-items: center; gap: 10px; margin: -12px -18px 12px; padding: 10px 18px;
    position: sticky; top: -12px; z-index: 2; background: #1a1a1a; border-bottom: 1px solid #2a2a2a;
}
#ht-modal .ht-detail-title { margin-bottom: 12px; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
#ht-modal .ht-detail-title a { color: #f0f0f0; }
#ht-modal .ht-detail-title a:hover { color: #7ecfff; }
#ht-modal .ht-hidden, .ht-hidden { display: none !important; }
@media (max-width: 640px) {
    #ht-modal .ht-grid, #ht-modal .ht-stats { grid-template-columns: 1fr 1fr; }
    #ht-modal .ht-list { columns: 1; }
    #ht-modal .ht-torrent-head .ht-cover { display: none; }
}
`;
        document.head.appendChild(style);
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
            a.setAttribute('data-ht-tip', id);
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
            if (visited) hiddenIds.add(id);
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

    function watchDom() {
        new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var nodes = mutations[i].addedNodes;
                for (var j = 0; j < nodes.length; j++) {
                    var n = nodes[j];
                    if (n.nodeType !== 1 || isOurs(n)) continue;
                    if (n.matches('a[href*="torrents.php"]') || n.querySelector('a[href*="torrents.php"]')) {
                        applyHiding();   // right away, so new grid cards of visited torrents never flash on screen
                        remarkSoon();
                        return;
                    }
                }
            }
        }).observe(document.body, { childList: true, subtree: true });
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

    // ── Cover zoom (History window) ──────────────────────────────────────────
    // Same behaviour as the thumbnail hover preview in Advanced Better filelist.

    function setupCoverZoom() {
        var popup = el('div', { className: 'ht-zoom', 'data-ht-ui': '' });
        var status = el('div', { className: 'ht-zoom-status', text: 'Loading…' });
        var img = el('img', { alt: '', referrerpolicy: 'no-referrer' });
        popup.append(status, img);
        document.body.appendChild(popup);
        var timer = null;
        var current = null;
        var mouse = { x: 0, y: 0 };

        function position() {
            if (popup.style.display !== 'block') return;
            var vw = window.innerWidth;
            var vh = window.innerHeight;
            var maxW = Math.max(100, Math.max(mouse.x, vw - mouse.x) - ZOOM_MARGIN * 3);
            var maxH = vh - ZOOM_MARGIN * 2;
            if (img.naturalWidth) {
                var scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
                img.style.width = Math.round(img.naturalWidth * scale) + 'px';
                img.style.height = Math.round(img.naturalHeight * scale) + 'px';
            }
            var w = popup.offsetWidth;
            var h = popup.offsetHeight;
            var left = mouse.x + ZOOM_MARGIN;
            if (left + w > vw - ZOOM_MARGIN) left = mouse.x - w - ZOOM_MARGIN;
            var top = Math.min(Math.max(ZOOM_MARGIN, mouse.y - h / 2), vh - h - ZOOM_MARGIN);
            popup.style.left = Math.max(ZOOM_MARGIN, left) + 'px';
            popup.style.top = Math.max(ZOOM_MARGIN, top) + 'px';
        }

        function hide() {
            clearTimeout(timer);
            current = null;
            popup.style.display = 'none';
            img.removeAttribute('src');
        }

        function show(src) {
            var full = thumbToFullUrl(src) || src;
            status.textContent = 'Loading…';
            status.style.display = 'block';
            img.style.display = 'none';
            img.onload = function () { status.style.display = 'none'; img.style.display = 'block'; position(); };
            img.onerror = function () {
                if (img.src !== src && full !== src) { img.src = src; return; }   // full-size guess failed: show the original
                status.textContent = 'Couldn\'t load the image';
                position();
            };
            img.src = full;
            popup.style.display = 'block';
            position();
        }

        document.addEventListener('mouseover', function (ev) {
            var t = ev.target.closest && ev.target.closest('[data-ht-zoom]');
            if (!t || t === current || !getSetting('coverZoom')) return;
            hide();
            current = t;
            timer = setTimeout(function () { show(t.getAttribute('data-ht-zoom')); }, ZOOM_DELAY_MS);
        });
        document.addEventListener('mousemove', function (ev) {
            mouse.x = ev.clientX;
            mouse.y = ev.clientY;
            if (current) position();
        });
        document.addEventListener('mouseout', function (ev) {
            var t = ev.target.closest && ev.target.closest('[data-ht-zoom]');
            if (t && !t.contains(ev.relatedTarget)) hide();
        });
        return hide;
    }
    var hideZoom = function () {};

    // ── Toast ────────────────────────────────────────────────────────────────

    function showToast(text, sub, onClick) {
        document.querySelectorAll('.ht-toast').forEach(function (t) { t.remove(); });
        var t = el('div', { className: 'ht-toast', 'data-ht-ui': '', role: 'status' }, [el('b', { text: text }), sub ? el('small', { text: sub }) : null]);
        t.addEventListener('click', function () { t.remove(); if (onClick) onClick(); });
        document.body.appendChild(t);
        setTimeout(function () { t.style.opacity = '0'; }, 6000);
        setTimeout(function () { t.remove(); }, 6400);
    }

    // ── Modal shell ──────────────────────────────────────────────────────────

    var modalKeyHandler = null;
    var modalEscHook = null;   // set while a sub-view (torrent details) is open: Esc goes back instead of closing

    function closeModal() {
        var bg = document.getElementById('ht-backdrop');
        if (bg) bg.remove();
        hideZoom();
        if (modalKeyHandler) document.removeEventListener('keydown', modalKeyHandler, true);
        modalKeyHandler = null;
        modalEscHook = null;
    }

    /** opts: { title, subtitle, tabs (element), headerButtons: [el] } → { body } */
    function openModal(opts) {
        closeModal();
        var bg = el('div', { id: 'ht-backdrop', 'data-ht-ui': '' });
        var closeBtn = el('button', { type: 'button', className: 'ht-btn ht-icon', title: 'Close (Esc)', 'aria-label': 'Close', text: '✕' });
        var header = el('div', { className: 'ht-header' }, [
            el('div', { className: 'ht-header-left' }, [
                el('h2', { text: opts.title }),
                el('span', { className: 'ht-subtitle', text: opts.subtitle || (SCRIPT_NAME + ' — ' + GROUP_NAMES[GROUP] + ' — v' + SCRIPT_VERSION) }),
            ]),
            el('div', { className: 'ht-header-right' }, (opts.headerButtons || []).concat([closeBtn])),
        ]);
        var body = el('div', { className: 'ht-body' });
        var okBtn = el('button', { type: 'button', className: 'ht-ok', text: 'Close' });
        var footer = el('div', { className: 'ht-footer' }, [
            el('a', { className: 'ht-github-link', href: 'https://github.com/edstagdh/Userscripts', target: '_blank', rel: 'noopener noreferrer', text: '🔗 View on GitHub' }),
            okBtn,
        ]);
        var modal = el('div', { id: 'ht-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
            [header, opts.tabs || null, body, footer]);
        bg.appendChild(modal);
        closeBtn.addEventListener('click', closeModal);
        okBtn.addEventListener('click', closeModal);
        bg.addEventListener('mousedown', function (ev) { if (ev.target === bg) closeModal(); });
        modalKeyHandler = function (ev) {
            if (ev.key !== 'Escape' || document.querySelector('#ht-cl-backdrop.active')) return;
            ev.stopPropagation();
            if (modalEscHook) modalEscHook(); else closeModal();
        };
        document.addEventListener('keydown', modalKeyHandler, true);
        document.body.appendChild(bg);
        return { body: body };
    }

    // ── Shared list pieces ───────────────────────────────────────────────────

    function countPill(n) {
        return el('span', { className: 'ht-count' + (n > 1 ? ' ht-hot' : ''), title: n + ' visit' + (n === 1 ? '' : 's'), text: n + '×' });
    }

    function coverEl(src, cls) {
        if (!src) return el('div', { className: 'ht-cover ht-blank ' + (cls || ''), text: '–' });
        var img = el('img', { className: 'ht-cover ' + (cls || ''), src: src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', 'data-ht-zoom': src });
        img.addEventListener('error', function () { img.replaceWith(el('div', { className: 'ht-cover ht-blank', text: '–' })); });
        return img;
    }

    /** visits list: items = [[ts, seconds], …] or [ts, …], shown newest first */
    function timesBox(items) {
        var list = items.map(function (x) { return Array.isArray(x) ? x : [x, 0]; }).sort(function (a, b) { return b[0] - a[0]; });
        var shown = list.slice(0, 100);
        var box = el('div', { className: 'ht-times' }, [
            el('ul', { className: 'ht-list' }, shown.map(function (x) {
                return el('li', {}, [el('span', {}, [fmtDateTime(x[0]), el('span', { className: 'ht-sub', text: ' · ' + ago(x[0]) + (x[1] ? ' · ' + fmtDur(x[1]) : '') })])]);
            })),
        ]);
        if (list.length > shown.length) box.appendChild(el('div', { className: 'ht-sub', text: '…and ' + (list.length - shown.length) + ' older' }));
        return box;
    }

    function toggleTimes(row, items, btn) {
        var open = row.querySelector('.ht-times');
        btn.classList.toggle('ht-active', !open);
        if (open) { open.remove(); return; }
        row.appendChild(timesBox(items));
    }

    function searchUrl(text, g) {
        return originOf(g) + '/torrents.php?searchtext=' + encodeURIComponent(text);
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

    function presentationSection(tid, g) {
        var arr = readPresentations(tid, g);
        var wrap = el('div');
        wrap.appendChild(el('div', { className: 'ht-label', text: 'Saved presentation' + (arr.length > 1 ? 's (' + arr.length + ')' : '') }));
        if (!arr.length) {
            wrap.appendChild(el('p', { className: 'ht-note', text: getSetting('savePresentation')
                ? 'None saved yet — it\'s saved the next time you open this torrent\'s page.'
                : 'Saving presentations is off (Settings & data).' }));
            return wrap;
        }
        var box = el('div', { className: 'ht-pres' });
        arr.slice().reverse().forEach(function (v, i) {
            var renderBtn = el('button', { type: 'button', className: 'ht-btn', text: '🖼 Render' });
            var viewBtn = el('button', { type: 'button', className: 'ht-btn', text: '</> BBCode' });
            var copyBtn = el('button', { type: 'button', className: 'ht-btn', text: '📋 Copy' });
            var seen = v.l && v.l !== v.t ? ' · last seen ' + fmtDate(v.l) : '';
            var row = el('div', { className: 'ht-row' }, [
                el('div', { className: 'ht-main' }, [
                    el('div', { style: 'color:#e0e0e0;font-weight:600', text: (i === 0 ? 'Latest · ' : '') + fmtDateTime(v.t) }),
                    el('div', { className: 'ht-sub', text: fmtBytes(v.n) + ' of BBCode' + seen }),
                ]),
                el('div', { className: 'ht-side' }, [renderBtn, viewBtn, copyBtn]),
            ]);
            var out = null;
            var mode = null;
            function showOut(next) {
                if (out) { out.remove(); out = null; }
                hideZoom();
                mode = mode === next ? null : next;
                renderBtn.classList.toggle('ht-active', mode === 'render');
                viewBtn.classList.toggle('ht-active', mode === 'code');
                if (!mode) return;
                if (mode === 'code') {
                    out = el('textarea', { className: 'ht-code', readonly: true, spellcheck: 'false' });
                    out.value = 'Loading…';
                } else {
                    out = el('div', { className: 'ht-render', text: 'Loading…' });
                }
                row.appendChild(out);
                var target = out;
                var wanted = mode;
                decodeVersion(v).then(function (t) {
                    if (out !== target) return;
                    if (wanted === 'code') target.value = t;
                    else target.replaceChildren(renderBBCode(t));
                }).catch(function () {
                    if (wanted === 'code') target.value = 'Couldn\'t read the saved presentation.';
                    else target.textContent = 'Couldn\'t read the saved presentation.';
                });
            }
            renderBtn.addEventListener('click', function () { showOut('render'); });
            viewBtn.addEventListener('click', function () { showOut('code'); });
            copyBtn.addEventListener('click', function () {
                decodeVersion(v).then(function (t) { copyText(t, 'Presentation BBCode'); }).catch(function () { showToast('Couldn\'t read the saved presentation'); });
            });
            box.appendChild(row);
        });
        wrap.appendChild(box);
        return wrap;
    }

    /** torrent details (stats, visits, saved presentations); onForgotten() runs after "Forget this torrent" */
    function buildTorrentDetails(tid, g, onForgotten, showTitle) {
        g = g || GROUP;
        var e = torrents(g).get(tid);
        var title = e && e.t ? e.t : 'Torrent #' + tid;
        var body = el('div');
        if (showTitle) {
            body.appendChild(el('div', { className: 'ht-detail-title' }, [
                crossSite() || g !== GROUP ? siteTag(g) : null,
                el('a', linkProps(g, torrentUrl(g, tid), { title: 'Open the torrent page', text: title })),
                el('span', { className: 'ht-sub', text: ' #' + tid }),
            ]));
        }
        if (!e) {
            body.appendChild(el('div', { className: 'ht-empty', text: 'No visits recorded for this torrent.' }));
            return body;
        }
        body.appendChild(el('div', { className: 'ht-torrent-head' }, [
            e.cv ? coverEl(e.cv) : null,
            el('div', { className: 'ht-stats' }, [
                el('div', { className: 'ht-stat' }, [el('b', { text: String(e.c) }), el('span', { text: 'visits' + (g !== GROUP ? ' on ' + GROUP_NAMES[g] : '') })]),
                el('div', { className: 'ht-stat' }, [el('b', { text: fmtDate(e.f) }), el('span', { text: 'first visit' })]),
                el('div', { className: 'ht-stat' }, [el('b', { text: fmtDate(e.l) }), el('span', { text: 'last visit' })]),
                el('div', { className: 'ht-stat' }, [el('b', { text: fmtDur(totalSeconds(e)) || '–' }), el('span', { text: 'time on page, total' })]),
            ]),
        ]));
        body.appendChild(el('div', { className: 'ht-label', text: 'Visits' }));
        body.appendChild(timesBox(e.v || []));
        if (e.c > (e.v || []).length) body.appendChild(el('p', { className: 'ht-note', text: 'Only the last ' + MAX_ITEM_VISITS + ' visit times are kept; the count includes older ones.' }));
        body.appendChild(presentationSection(tid, g));
        var forget = el('button', { type: 'button', className: 'ht-btn ht-danger', text: 'Forget this torrent' });
        forget.addEventListener('click', function () {
            if (!confirm('Forget all ' + e.c + ' visits of "' + title + '" (and its saved presentation)?')) return;
            forgetTorrent(tid, g);
            if (onForgotten) onForgotten();
        });
        body.appendChild(el('div', { className: 'ht-buttons' }, [forget]));
        return body;
    }

    /** details on their own (buttons on a torrent page) */
    function openTorrentHistory(tid, g, onChange) {
        g = g || GROUP;
        var e = torrents(g).get(tid);
        var m = openModal({ title: '👁 ' + (e && e.t ? e.t : 'Torrent #' + tid), subtitle: g !== GROUP ? 'Seen on ' + GROUP_NAMES[g] + ' — #' + tid : null });
        m.body.appendChild(buildTorrentDetails(tid, g, function () {
            closeModal();
            if (onChange) onChange();
            markLinks();
        }, g !== GROUP));
    }

    function totalSeconds(e) {
        return (e.v || []).reduce(function (a, x) { return a + (x[1] || 0); }, 0);
    }

    // ── History window (site menu) ───────────────────────────────────────────

    function openHistory(tab, filter) {
        var tabsEl = el('div', { className: 'ht-tabs', role: 'tablist' });
        var clBtn = el('button', { type: 'button', className: 'ht-btn', title: 'What\'s new in History Tracker', text: '📜 Changelog' });
        clBtn.addEventListener('click', showChangelogModal);
        var m = openModal({
            title: '🕘 History', tabs: tabsEl, headerButtons: [clBtn],
            subtitle: SCRIPT_NAME + ' — ' + (crossSite() ? GROUPS.map(function (g) { return GROUP_NAMES[g]; }).join(' + ') : GROUP_NAMES[GROUP]) + ' — v' + SCRIPT_VERSION,
        });
        var TABS = [['searches', 'Searches'], ['torrents', 'Torrents'], ['settings', 'Settings & data']];
        var buttons = {};
        // the tab's list stays in `pane` while a torrent's details are shown in `detail`,
        // so "Back" returns to exactly the same filter, sort, loaded rows and scroll position
        var pane = el('div');
        var detail = el('div', { className: 'ht-hidden' });
        m.body.append(pane, detail);
        var listScroll = 0;

        function counts() {
            var nS = 0;
            var nT = 0;
            viewGroups().forEach(function (g) { nS += Object.keys(readSearches(g)).length; nT += torrents(g).size; });
            buttons.searches.textContent = '🔎 Searches (' + nS + ')';
            buttons.torrents.textContent = '👁 Torrents (' + nT + ')';
        }

        function closeDetails() {
            if (detail.classList.contains('ht-hidden')) return;
            hideZoom();
            detail.replaceChildren();
            detail.classList.add('ht-hidden');
            pane.classList.remove('ht-hidden');
            m.body.scrollTop = listScroll;
            modalEscHook = null;
        }

        function openDetails(tid, g, afterForget) {
            listScroll = m.body.scrollTop;
            hideZoom();
            var back = el('button', { type: 'button', className: 'ht-btn ht-back', text: '← Back to the list' });
            back.addEventListener('click', closeDetails);
            detail.replaceChildren(
                el('div', { className: 'ht-backbar' }, [back, el('span', { className: 'ht-sub', text: 'or press Esc' })]),
                buildTorrentDetails(tid, g, function () { closeDetails(); if (afterForget) afterForget(); }, true)
            );
            pane.classList.add('ht-hidden');
            detail.classList.remove('ht-hidden');
            m.body.scrollTop = 0;
            modalEscHook = closeDetails;
        }

        function show(name, f) {
            closeDetails();
            Object.keys(buttons).forEach(function (k) { buttons[k].setAttribute('aria-selected', String(k === name)); });
            hideZoom();
            pane.replaceChildren();
            m.body.scrollTop = 0;
            if (name === 'searches') renderSearchesTab(pane, f || '', counts);
            else if (name === 'torrents') renderTorrentsTab(pane, f || '', counts, openDetails);
            else renderSettingsTab(pane);
        }

        TABS.forEach(function (t) {
            var b = el('button', { type: 'button', role: 'tab', className: 'ht-btn', text: t[1] });
            b.addEventListener('click', function () { show(t[0]); });
            buttons[t[0]] = b;
            tabsEl.appendChild(b);
        });
        buttons.settings.textContent = '⚙️ Settings & data';
        counts();
        show(tab || 'searches', filter);
    }

    /** generic filter + sort (+ site chips) + list used by the Searches and Torrents tabs */
    function renderListTab(body, opts) {
        var input = el('input', { type: 'search', placeholder: opts.placeholder, autocomplete: 'off', spellcheck: 'false' });
        input.value = opts.filter || '';
        var sortSel = el('select', { 'aria-label': 'Sort' });
        opts.sorts.forEach(function (s) { sortSel.appendChild(el('option', { value: s[0], text: s[1] })); });
        var chipsEl = crossSite() ? el('div', { className: 'ht-chips', role: 'group', 'aria-label': 'Site' }) : null;
        var top = el('div');
        var list = el('div', { className: 'ht-rows' });
        var more = el('div', { className: 'ht-more' });
        body.append(el('div', { className: 'ht-toolbar' }, [input, chipsEl, sortSel]), top, list, more);

        var items = [];
        var shown = 0;
        var matches = [];
        var site = crossSite() ? (getSetting('historySite') || 'all') : GROUP;
        if (site !== 'all' && GROUPS.indexOf(site) === -1) site = 'all';

        function drawChips() {
            if (!chipsEl) return;
            chipsEl.replaceChildren();
            [['all', 'All']].concat(GROUPS.map(function (g) { return [g, GROUP_SHORT[g]]; })).forEach(function (c) {
                var n = c[0] === 'all' ? items.length : items.filter(function (it) { return it.g === c[0]; }).length;
                var b = el('button', {
                    type: 'button', className: 'ht-btn' + (site === c[0] ? ' ht-active' : ''),
                    title: c[0] === 'all' ? 'Both sites' : GROUP_NAMES[c[0]] + ' only', text: c[1] + ' (' + n + ')',
                });
                b.addEventListener('click', function () { site = c[0]; setSetting('historySite', site); drawChips(); draw(); });
                chipsEl.appendChild(b);
            });
        }

        function reload() { items = opts.items(); drawChips(); draw(); }

        function draw() {
            var q = cleanText(input.value).toLowerCase();
            matches = items.filter(function (it) { return (site === 'all' || it.g === site) && (!q || opts.match(it, q)); });
            matches.sort(opts.sortFns[sortSel.value]);
            top.replaceChildren();
            if (opts.top) { var t = opts.top(cleanText(input.value), items); if (t) top.appendChild(t); }
            list.replaceChildren();
            shown = 0;
            if (!matches.length) {
                list.appendChild(el('div', { className: 'ht-empty', text: items.length ? 'Nothing matches.' : opts.emptyText }));
                more.replaceChildren();
                return;
            }
            page();
        }

        function page() {
            matches.slice(shown, shown + LIST_PAGE).forEach(function (it) { list.appendChild(opts.row(it, reload)); });
            shown = Math.min(matches.length, shown + LIST_PAGE);
            more.replaceChildren();
            if (shown < matches.length) {
                var b = el('button', { type: 'button', className: 'ht-btn', text: 'Show more (' + (matches.length - shown) + ' left)' });
                b.addEventListener('click', page);
                more.appendChild(b);
            }
        }

        var t;
        input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(draw, 120); });
        input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && opts.onEnter) opts.onEnter(cleanText(input.value)); });
        sortSel.addEventListener('change', draw);
        reload();
        setTimeout(function () { input.focus(); }, 0);
    }

    var SORTS = {
        last: function (a, b) { return b.l - a.l; },
        count: function (a, b) { return b.c - a.c || b.l - a.l; },
        first: function (a, b) { return a.f - b.f; },
    };

    /** "12× on HF, 3× on EMP" (or just "12×" when only this site is shown) */
    function perSiteCounts(found) {
        if (!crossSite()) return found.map(function (x) { return x.c + '×'; }).join(', ');
        return found.map(function (x) { return x.c + '× on ' + GROUP_SHORT[x.g]; }).join(', ');
    }

    function renderSearchesTab(body, filter, onChange) {
        renderListTab(body, {
            filter: filter,
            placeholder: 'Find a past search… (Enter searches this site)',
            emptyText: 'No searches recorded yet.',
            sorts: [['last', 'Most recent'], ['count', 'Most repeated'], ['first', 'Oldest first'], ['az', 'A → Z']],
            sortFns: {
                last: SORTS.last, count: SORTS.count, first: SORTS.first,
                az: function (a, b) { return (a.lb || '').localeCompare(b.lb || '', undefined, { sensitivity: 'base' }); },
            },
            items: function () {
                var out = [];
                viewGroups().forEach(function (g) {
                    var all = readSearches(g);
                    Object.keys(all).forEach(function (k) { var s = all[k]; s.key = k; s.g = g; out.push(s); });
                });
                return out;
            },
            match: function (s, q) {
                return (s.lb || '').toLowerCase().indexOf(q) !== -1 || s.key.indexOf(q) !== -1;
            },
            top: function (text, items) {
                if (!text) return null;
                var key = 'text:' + text.toLowerCase();
                var found = items.filter(function (s) { return s.key === key; });
                var last = Math.max.apply(null, [0].concat(found.map(function (s) { return s.l; })));
                return el('div', { className: 'ht-action' + (found.length ? '' : ' ht-new') }, [
                    el('span', {}, found.length
                        ? ['You searched “', el('b', { text: text }), '” ' + perSiteCounts(found) + ' · last ' + ago(last)]
                        : ['You never searched exactly “', el('b', { text: text }), '”' + (crossSite() ? ' on either site' : '')]),
                    el('a', { className: 'ht-ok', href: searchUrl(text), text: '🔎 Search ' + GROUP_NAMES[GROUP] }),
                ]);
            },
            onEnter: function (text) { if (text) location.href = searchUrl(text); },
            row: function (s, reload) {
                var timesBtn = el('button', { type: 'button', className: 'ht-btn ht-icon', title: 'When you ran it', text: '🕘' });
                var del = el('button', { type: 'button', className: 'ht-btn ht-icon ht-danger', title: 'Forget this search', text: '✕' });
                var href = s.u ? onDomainOf(s.g, s.u) : searchUrl(s.tx || '', s.g);
                var row = el('div', { className: 'ht-row' }, [
                    countPill(s.c),
                    el('div', { className: 'ht-main' }, [
                        el('div', { className: 'ht-titleline' }, [
                            crossSite() ? siteTag(s.g) : null,
                            el('a', linkProps(s.g, href, { className: 'ht-title', title: 'Run again on ' + GROUP_NAMES[s.g] + ' · last ' + fmtDateTime(s.l), text: s.lb || s.tx || s.key })),
                        ]),
                        el('div', { className: 'ht-sub', text: 'last ' + ago(s.l) + (s.c > 1 ? ' · first ' + fmtDate(s.f) : '') }),
                    ]),
                    el('div', { className: 'ht-side' }, [timesBtn, del]),
                ]);
                timesBtn.addEventListener('click', function () { toggleTimes(row, s.v || [], timesBtn); });
                del.addEventListener('click', function () {
                    if (!confirm('Forget the search “' + (s.lb || s.key) + '” on ' + GROUP_NAMES[s.g] + ' (' + s.c + ' runs)?')) return;
                    forgetSearch(s.key, s.g);
                    reload();
                    onChange();
                });
                return row;
            },
        });
    }

    function renderTorrentsTab(body, filter, onChange, openDetails) {
        var withPres = null;
        renderListTab(body, {
            filter: filter,
            placeholder: 'Title or torrent id…',
            emptyText: 'No torrent pages recorded yet.',
            sorts: [['last', 'Most recent'], ['count', 'Most visited'], ['first', 'Oldest first'], ['az', 'A → Z'], ['id', 'Torrent id']],
            sortFns: {
                last: SORTS.last, count: SORTS.count, first: SORTS.first,
                az: function (a, b) { return (a.t || '').localeCompare(b.t || '', undefined, { sensitivity: 'base' }); },
                id: function (a, b) { return b.id - a.id; },
            },
            items: function () {
                withPres = new Set();
                var out = [];
                viewGroups().forEach(function (g) {
                    presKeys(g).forEach(function (k) { withPres.add(k); });
                    torrents(g).forEach(function (e, id) { out.push(Object.assign({ id: id, g: g }, e)); });
                });
                return out;
            },
            match: function (t, q) {
                if (/^\d+$/.test(q)) return String(t.id).indexOf(q) === 0;
                return (t.t || '').toLowerCase().indexOf(q) !== -1;
            },
            row: function (t, reload) {
                var timesBtn = el('button', { type: 'button', className: 'ht-btn ht-icon', title: 'When you opened it', text: '🕘' });
                var copyBtn = withPres.has(keysOf(t.g).pres + t.id)
                    ? el('button', { type: 'button', className: 'ht-btn ht-icon', title: 'Copy the saved presentation (BBCode)', text: '📋' })
                    : null;
                var infoBtn = el('button', { type: 'button', className: 'ht-btn ht-icon', title: 'Details & saved presentation', text: 'ℹ️' });
                var del = el('button', { type: 'button', className: 'ht-btn ht-icon ht-danger', title: 'Forget this torrent', text: '✕' });
                var row = el('div', { className: 'ht-row' }, [
                    coverEl(t.cv),
                    el('div', { className: 'ht-main' }, [
                        el('div', { className: 'ht-titleline' }, [
                            crossSite() ? siteTag(t.g) : null,
                            el('a', linkProps(t.g, torrentUrl(t.g, t.id), { className: 'ht-title', text: t.t || 'Torrent #' + t.id })),
                        ]),
                        el('div', { className: 'ht-sub', text: '#' + t.id + ' · last ' + ago(t.l) + (t.c > 1 ? ' · first ' + fmtDate(t.f) : '') }),
                    ]),
                    el('div', { className: 'ht-side' }, [countPill(t.c), timesBtn, copyBtn, infoBtn, del]),
                ]);
                timesBtn.addEventListener('click', function () { toggleTimes(row, t.v || [], timesBtn); });
                if (copyBtn) copyBtn.addEventListener('click', function () { copyLatestPresentation(t.id, t.g); });
                function afterForget() { reload(); onChange(); markLinks(); }
                infoBtn.addEventListener('click', function () { openDetails(t.id, t.g, afterForget); });
                del.addEventListener('click', function () {
                    if (!confirm('Forget all ' + t.c + ' visits of "' + (t.t || '#' + t.id) + '" on ' + GROUP_NAMES[t.g] + ' (and its saved presentation)?')) return;
                    forgetTorrent(t.id, t.g);
                    afterForget();
                });
                return row;
            },
        });
    }

    // ── Settings & data tab ──────────────────────────────────────────────────

    var CHECKS = [
        ['Record', [
            ['trackTorrents', 'Torrent page visits'],
            ['trackSearches', 'Searches'],
            ['timeOnPage', 'Time spent on torrent pages'],
            ['saveCover', 'Torrent cover image URL'],
        ]],
        ['Show', [
            ['markVisited', 'Mark torrent links I\'ve opened'],
            ['hideVisited', 'Hide torrents I\'ve opened from lists (results, top 10, collages, user pages)'],
            ['torrentButton', '👁 history button on torrent pages'],
            ['searchToast', 'Notice when I repeat a search'],
            ['searchBoxHint', '"Searched before" hint by the search box'],
            ['coverZoom', 'Enlarge covers on hover (History window)'],
            ['crossSite', 'Show both sites\' history (HappyFappy + Empornium)'],
        ]],
    ];

    function numberField(label, name, min, max) {
        var input = el('input', { type: 'number', min: String(min), max: String(max), step: '1' });
        input.value = getSetting(name);
        return { input: input, field: el('label', { className: 'ht-field' }, [el('span', { text: label }), input]) };
    }

    function renderSettingsTab(body) {
        var boxes = {};
        function checks(group) {
            body.appendChild(el('div', { className: 'ht-label', text: group[0] }));
            var grid = el('div', { className: 'ht-grid' });
            group[1].forEach(function (c) {
                var cb = el('input', { type: 'checkbox' });
                cb.checked = !!getSetting(c[0]);
                boxes[c[0]] = cb;
                grid.appendChild(el('label', { className: 'ht-check' }, [cb, el('span', { text: c[1] })]));
            });
            body.appendChild(grid);
        }
        CHECKS.forEach(checks);

        var styleSel = el('select');
        [['badge', '👁 badge after the link'], ['dim', 'Dim the link'], ['both', 'Badge + dim']].forEach(function (o) {
            var opt = el('option', { value: o[0], text: o[1] });
            if (getSetting('markStyle') === o[0]) opt.selected = true;
            styleSel.appendChild(opt);
        });
        var dedupe = numberField('Don\'t count a reload within (seconds)', 'dedupeSeconds', 0, 3600);
        body.appendChild(el('div', { className: 'ht-grid', style: 'margin-top:10px' }, [
            el('label', { className: 'ht-field' }, [el('span', { text: 'How visited links look' }), styleSel]),
            dedupe.field,
        ]));

        // presentation
        checks(['Presentation (BBCode)', [['savePresentation', 'Save each torrent\'s presentation as BBCode']]]);
        var modeSel = el('select');
        [['latest', 'Only from my latest visit'], ['every', 'Every visit (a new copy when it changed)']].forEach(function (o) {
            var opt = el('option', { value: o[0], text: o[1] });
            if (getSetting('presentationMode') === o[0]) opt.selected = true;
            modeSel.appendChild(opt);
        });
        var versions = numberField('Copies kept per torrent ("every visit")', 'presentationVersions', 1, 100);
        var maxT = numberField('Keep presentations for this many recent torrents (0 = all)', 'presentationMaxTorrents', 0, 100000);
        body.appendChild(el('div', { className: 'ht-grid', style: 'margin-top:10px;gap:10px 18px' }, [
            el('label', { className: 'ht-field' }, [el('span', { text: 'Keep' }), modeSel]),
            versions.field,
            maxT.field,
        ]));
        body.appendChild(el('p', { className: 'ht-note', text:
            'Presentations are stored compressed (about a quarter of their size). Tampermonkey loads all of this script\'s storage on every page, ' +
            'so keep the total under a few MB — the limit above keeps it in check.' }));

        body.appendChild(el('div', { className: 'ht-label', text: 'Advanced' }));
        var logSel = el('select');
        [['off', 'Off'], ['error', 'Errors only'], ['warn', 'Warnings and errors (default)'], ['info', 'Info — what was recorded and saved'], ['debug', 'Debug — everything']].forEach(function (o) {
            var opt = el('option', { value: o[0], text: o[1] });
            if ((getSetting('logLevel') || 'warn') === o[0]) opt.selected = true;
            logSel.appendChild(opt);
        });
        body.appendChild(el('div', { className: 'ht-grid' }, [
            el('label', { className: 'ht-field' }, [el('span', { text: 'Console logging (browser dev tools, messages start with ' + LOG_PREFIX + ')' }), logSel]),
        ]));

        var save = el('button', { type: 'button', className: 'ht-ok', text: 'Save & reload' });
        save.addEventListener('click', function () {
            Object.keys(boxes).forEach(function (k) { setSetting(k, boxes[k].checked); });
            setSetting('logLevel', logSel.value);
            setSetting('markStyle', styleSel.value);
            setSetting('presentationMode', modeSel.value);
            [[dedupe, 'dedupeSeconds'], [versions, 'presentationVersions'], [maxT, 'presentationMaxTorrents']].forEach(function (x) {
                var n = parseInt(x[0].input.value, 10);
                setSetting(x[1], isFinite(n) && n >= 0 ? n : DEFAULT_SETTINGS[x[1]]);
            });
            log.info('Settings saved — reloading');
            location.reload();
        });
        body.appendChild(el('div', { className: 'ht-buttons', style: 'justify-content:flex-end' }, [save]));

        // data
        var keys = groupKeys();
        var histBytes = 0;
        var presBytes = 0;
        var presCount = 0;
        keys.forEach(function (k) {
            var size = JSON.stringify(GM_getValue(k, null)).length;
            if (k.indexOf(KEY.pres) === 0) { presBytes += size; presCount++; } else histBytes += size;
        });
        var logs = logKeys();
        var visits = logs.reduce(function (a, k) { var v = GM_getValue(k, []); return a + (Array.isArray(v) ? v.length : 0); }, 0);
        body.appendChild(el('div', { className: 'ht-label', text: 'Your ' + GROUP_NAMES[GROUP] + ' data (Tampermonkey, this browser only)' }));
        body.appendChild(el('div', { className: 'ht-stats' }, [
            el('div', { className: 'ht-stat' }, [el('b', { text: torrents().size + ' / ' + Object.keys(readSearches()).length }), el('span', { text: 'torrents / searches' })]),
            el('div', { className: 'ht-stat' }, [el('b', { text: String(visits) }), el('span', { text: 'visits logged' + (logs.length ? ' since ' + logs[0].slice(KEY.log.length) : '') })]),
            el('div', { className: 'ht-stat' }, [el('b', { text: fmtBytes(histBytes) }), el('span', { text: 'history storage' })]),
            el('div', { className: 'ht-stat' }, [el('b', { text: fmtBytes(presBytes) }), el('span', { text: presCount + ' saved presentation' + (presCount === 1 ? '' : 's') })]),
        ]));

        var exp = el('button', { type: 'button', className: 'ht-btn', text: '⬇️ Export JSON' });
        var imp = el('button', { type: 'button', className: 'ht-btn', text: '⬆️ Import JSON…' });
        var clrP = el('button', { type: 'button', className: 'ht-btn ht-danger', text: 'Delete saved presentations' });
        var clr = el('button', { type: 'button', className: 'ht-btn ht-danger', text: 'Delete all ' + GROUP_NAMES[GROUP] + ' history' });
        var file = el('input', { type: 'file', accept: '.json,application/json', className: 'ht-hidden' });
        exp.addEventListener('click', exportData);
        imp.addEventListener('click', function () { file.click(); });
        file.addEventListener('change', function () { if (file.files[0]) importData(file.files[0]); });
        clrP.addEventListener('click', function () {
            if (!confirm('Delete all ' + presCount + ' saved presentations? Your visit history is kept.')) return;
            presKeys().forEach(function (k) { GM_deleteValue(k); });
            location.reload();
        });
        clr.addEventListener('click', function () {
            if (!confirm('Delete your whole ' + GROUP_NAMES[GROUP] + ' history (torrents, searches, presentations and the visit log)? Settings are kept. This can\'t be undone — export first if unsure.')) return;
            groupKeys().forEach(function (k) { GM_deleteValue(k); });
            location.reload();
        });
        body.appendChild(el('div', { className: 'ht-buttons' }, [exp, imp, clrP, clr, file]));
        body.appendChild(el('p', { className: 'ht-note', text:
            'Export makes a backup of all sites. Importing replaces the history of the sites in the file; ' +
            'exports from the older "[HF] Visit Tracker" script are accepted too.' }));
    }

    function exportData() {
        var values = {};
        GM_listValues().filter(function (k) { return DATA_KEY_RE.test(k); }).forEach(function (k) { values[k] = GM_getValue(k, null); });
        var data = { app: 'history-tracker', format: 2, version: SCRIPT_VERSION, exported_at: new Date().toISOString(), values: values };
        var a = el('a', {
            href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })),
            download: 'history-tracker-' + new Date().toISOString().slice(0, 10) + '.json',
        });
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        log.info('Exported ' + Object.keys(values).length + ' storage entries');
    }

    /** old "[HF] Visit Tracker" 2.0 export keys → History Tracker keys (that script was HappyFappy only) */
    function mapLegacyKey(k) {
        var m = k.match(/^hfvt_tor_(\d+)$/);
        if (m) return 'ht_hf_tor_' + m[1];
        if (k === 'hfvt_searches') return 'ht_hf_searches';
        m = k.match(/^hfvt_log_(\d{4}-\d{2})$/);
        if (m) return 'ht_hf_log_' + m[1];
        return null;
    }

    function importData(f) {
        var reader = new FileReader();
        reader.onload = function () {
            var data;
            try { data = JSON.parse(reader.result); } catch (e) { log.error('Import: not valid JSON', e); alert('That file isn\'t valid JSON.'); return; }
            if (!data || !data.values || typeof data.values !== 'object' || (data.app !== 'history-tracker' && data.app !== 'hf-visit-tracker')) {
                log.error('Import: not a History Tracker export', data && data.app);
                alert('That isn\'t a History Tracker export.');
                return;
            }
            var values = {};
            Object.keys(data.values).forEach(function (k) {
                var nk = data.app === 'hf-visit-tracker' ? mapLegacyKey(k) : (DATA_KEY_RE.test(k) ? k : null);
                if (nk) values[nk] = data.values[k];
            });
            var groups = {};
            Object.keys(values).forEach(function (k) { groups[k.split('_')[1]] = true; });
            var names = Object.keys(groups).map(function (g) { return GROUP_NAMES[g] || g; });
            if (!names.length) { alert('The file has no history in it.'); return; }
            var nT = 0;
            var nS = 0;
            Object.keys(values).forEach(function (k) {
                if (/_tor_\d+$/.test(k)) nT += Object.keys(values[k] || {}).length;
                if (/_searches$/.test(k)) nS += Object.keys(values[k] || {}).length;
            });
            if (!confirm('Replace your ' + names.join(' + ') + ' history in this browser with the file\'s (' + nT + ' torrents, ' + nS + ' searches, exported ' +
                (data.exported_at ? fmtDate(Date.parse(data.exported_at)) : '?') + ')?')) return;
            GM_listValues().forEach(function (k) {
                var m = k.match(/^ht_(hf|emp)_/);
                if (m && groups[m[1]] && DATA_KEY_RE.test(k)) GM_deleteValue(k);
            });
            Object.keys(values).forEach(function (k) { GM_setValue(k, values[k]); });
            log.info('Imported ' + nT + ' torrents and ' + nS + ' searches (' + names.join(' + ') + ')' + (data.app === 'hf-visit-tracker' ? ' from an old [HF] Visit Tracker export' : ''));
            location.reload();
        };
        reader.onerror = function () { log.error('Import: couldn\'t read the file', reader.error); };
        reader.readAsText(f);
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

    // ── Changelog / "What's New" ─────────────────────────────────────────────
    // Same as Advanced Better filelist: fetched from GitHub, shown after an update and from the menu.

    var CHANGELOG_URL = 'https://raw.githubusercontent.com/edstagdh/Userscripts/refs/heads/master/EMP_HF/History_Tracker_Changelog.md';
    var CHANGELOG_HISTORY_DEPTH = 3;
    var changelogCache = null;
    var changelogModalEl = null;

    function parseChangelogMarkdown(md) {
        var entries = [];
        var current = null;
        md.split(/\r?\n/).forEach(function (line) {
            var headerMatch = line.match(/^##\s*v?([0-9][0-9.]*)\s*(?:-\s*(.+))?\s*$/i);
            if (headerMatch) {
                current = { version: headerMatch[1], date: (headerMatch[2] || '').trim(), changes: [] };
                entries.push(current);
                return;
            }
            var itemMatch = line.match(/^\s*[-*]\s+(.*\S)\s*$/);
            if (itemMatch && current) current.changes.push(itemMatch[1]);
        });
        return entries.filter(function (e) { return e.changes.length; });
    }

    function findChangelogIndexForVersion(entries, version) {
        for (var i = 0; i < entries.length; i++) if (entries[i].version === version) return i;
        return -1;
    }

    function fetchChangelog(callback) {
        if (changelogCache) { callback(changelogCache, null); return; }
        if (typeof GM_xmlhttpRequest !== 'function') { callback(null, 'GM_xmlhttpRequest not available'); return; }
        GM_xmlhttpRequest({
            method: 'GET',
            url: CHANGELOG_URL,
            timeout: 10000,
            onload: function (res) {
                if (res.status < 200 || res.status >= 300) { callback(null, 'HTTP ' + res.status); return; }
                try {
                    changelogCache = parseChangelogMarkdown(res.responseText);
                    callback(changelogCache, null);
                } catch (e) {
                    callback(null, 'Parse error: ' + e.message);
                }
            },
            onerror: function () { callback(null, 'Network error fetching changelog'); },
            ontimeout: function () { callback(null, 'Timed out fetching changelog'); },
        });
    }
    // log every failed changelog fetch once, wherever it was asked for
    var fetchChangelogRaw = fetchChangelog;
    fetchChangelog = function (callback) {
        fetchChangelogRaw(function (entries, err) {
            if (err) log.warn('Couldn\'t load the changelog: ' + err);
            callback(entries, err);
        });
    };

    function injectChangelogStyle() {
        if (document.getElementById('ht-cl-style')) return;
        var style = document.createElement('style');
        style.id = 'ht-cl-style';
        style.textContent = `
#ht-cl-backdrop {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.78); z-index: 2147483003; backdrop-filter: blur(2px);
}
#ht-cl-backdrop.active { display: flex; align-items: center; justify-content: center; }
#ht-cl-modal {
    position: relative; background: #1a1a1a;
    border: 1px solid #3a3a3a; border-radius: 8px;
    width: 560px; max-width: 96vw; max-height: 86vh;
    overflow-y: auto; color: #d0d0d0;
    font-family: inherit; font-size: 12px; text-align: left;
    box-shadow: 0 10px 50px rgba(0,0,0,0.8);
}
#ht-cl-modal .ht-cl-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px 12px; border-bottom: 1px solid #2e2e2e;
    position: sticky; top: 0; background: #1a1a1a; z-index: 1; gap: 10px;
}
#ht-cl-modal .ht-cl-header-left { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; }
#ht-cl-modal .ht-cl-header h2 {
    margin: 0; padding: 0; border: none; background: none;
    font-size: 14px; font-weight: 800; color: #f0f0f0; letter-spacing: 0.04em; text-transform: uppercase;
    text-align: left !important; float: none; width: auto; display: block;
    font-family: inherit; line-height: 1.3; text-shadow: none; box-shadow: none;
}
#ht-cl-modal .ht-cl-header .ht-cl-subtitle { display: block; font-size: 10px; color: #666; letter-spacing: 0.02em; text-align: left; }
#ht-cl-modal .ht-cl-body { padding: 14px 18px 6px; }
#ht-cl-modal .ht-cl-version-block { margin-bottom: 18px; }
#ht-cl-modal .ht-cl-version-block:last-child { margin-bottom: 0; }
#ht-cl-modal .ht-cl-version-label {
    display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: 0.08em;
    text-transform: uppercase; color: #7ec87e; background: #1a2e1a; border: 1px solid #2e5e2e;
    padding: 2px 8px; border-radius: 3px; margin-bottom: 8px;
}
#ht-cl-modal .ht-cl-version-date { font-size: 10px; color: #777; margin-left: 8px; }
#ht-cl-modal .ht-cl-changes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
#ht-cl-modal .ht-cl-changes li {
    display: flex; gap: 8px; align-items: flex-start;
    font-size: 11px; color: #c0c0c0; line-height: 1.5; margin: 0; padding: 0; list-style: none;
}
#ht-cl-modal .ht-cl-changes li::before { content: '→'; color: #5a8a5a; font-weight: 700; flex-shrink: 0; }
#ht-cl-modal .ht-cl-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 18px 16px; border-top: 1px solid #2e2e2e; margin-top: 10px;
    position: sticky; bottom: 0; background: #1a1a1a; gap: 10px; flex-wrap: wrap;
}
#ht-cl-modal .ht-cl-github-link { font-size: 11px; color: #5a7a9a; text-decoration: none; font-weight: 600; }
#ht-cl-modal .ht-cl-github-link:hover { color: #7aa0c8; text-decoration: underline; }
#ht-cl-modal .ht-cl-ok-btn {
    padding: 6px 22px; font-size: 12px; font-weight: 700; border-radius: 4px; cursor: pointer;
    background: #2d4a2d; border: 1px solid #4a7a4a; color: #8fc88f;
    transition: background 0.15s, color 0.15s; letter-spacing: 0.03em;
}
#ht-cl-modal .ht-cl-ok-btn:hover { background: #3a5e3a; color: #aedaae; border-color: #6aaa6a; }
#ht-cl-modal .ht-cl-update-banner {
    display: flex; align-items: center; gap: 8px; font-size: 12px; color: #f0d080;
    background: #2e2810; border: 1px solid #6a5a1a; border-radius: 8px; padding: 8px 10px; margin-bottom: 14px;
}
#ht-cl-modal .ht-cl-loading, #ht-cl-modal .ht-cl-error { font-size: 12px; color: #999; padding: 4px 0; }
#ht-cl-modal .ht-cl-error { color: #d09090; }
#ht-cl-modal .ht-cl-more { font-size: 11px; color: #777; padding: 10px 0 2px; border-top: 1px solid #2a2a2a; margin-top: 4px; }
#ht-cl-modal .ht-cl-more a { color: #5a7a9a; text-decoration: none; }
#ht-cl-modal .ht-cl-more a:hover { color: #7aa0c8; text-decoration: underline; }
`;
        document.head.appendChild(style);
    }

    function onChangelogKeydown(e) {
        if (e.key === 'Escape') { e.stopPropagation(); dismissChangelog(); }
    }

    function ensureChangelogModal() {
        if (changelogModalEl) return;
        injectChangelogStyle();
        changelogModalEl = el('div', { id: 'ht-cl-backdrop', 'data-ht-ui': '' });
        var okBtn = el('button', { type: 'button', className: 'ht-cl-ok-btn', text: 'OK, got it' });
        changelogModalEl.appendChild(el('div', { id: 'ht-cl-modal' }, [
            el('div', { className: 'ht-cl-header' }, [
                el('div', { className: 'ht-cl-header-left' }, [
                    el('h2', { text: '🆕 What\'s New' }),
                    el('span', { className: 'ht-cl-subtitle', text: SCRIPT_NAME + ' — currently v' + SCRIPT_VERSION }),
                ]),
            ]),
            el('div', { className: 'ht-cl-body', id: 'ht-cl-body-content' }),
            el('div', { className: 'ht-cl-footer' }, [
                el('a', { className: 'ht-cl-github-link', href: 'https://github.com/edstagdh/Userscripts', target: '_blank', rel: 'noopener noreferrer', text: '🔗 View on GitHub' }),
                okBtn,
            ]),
        ]));
        document.body.appendChild(changelogModalEl);
        changelogModalEl.addEventListener('click', function (e) { if (e.target === this) dismissChangelog(); });
        okBtn.addEventListener('click', dismissChangelog);
    }

    function openChangelog() {
        ensureChangelogModal();
        changelogModalEl.classList.add('active');
        document.addEventListener('keydown', onChangelogKeydown, true);
    }

    function dismissChangelog() {
        if (changelogModalEl) changelogModalEl.classList.remove('active');
        document.removeEventListener('keydown', onChangelogKeydown, true);
    }

    function renderChangelogBody(versionsToShow, errorMsg, updateAvailableVersion, hasMore) {
        var body = changelogModalEl.querySelector('#ht-cl-body-content');
        body.replaceChildren();
        if (updateAvailableVersion) {
            body.appendChild(el('div', { className: 'ht-cl-update-banner', text:
                '🔔 A newer version (v' + updateAvailableVersion + ') is available on GitHub — you\'re currently on v' + SCRIPT_VERSION + '.' }));
        }
        if (errorMsg) {
            body.appendChild(el('div', { className: 'ht-cl-error', text: 'Couldn\'t load the changelog (' + errorMsg + '). Check the GitHub repo directly for the latest version history.' }));
            return;
        }
        if (!versionsToShow || !versionsToShow.length) {
            body.appendChild(el('div', { className: 'ht-cl-error', text: 'No changelog entries found.' }));
            return;
        }
        versionsToShow.forEach(function (entry) {
            body.appendChild(el('div', { className: 'ht-cl-version-block' }, [
                el('span', { className: 'ht-cl-version-label', text: 'v' + entry.version }),
                entry.date ? el('span', { className: 'ht-cl-version-date', text: entry.date }) : null,
                el('ul', { className: 'ht-cl-changes' }, entry.changes.map(function (c) { return el('li', { text: c }); })),
            ]));
        });
        if (hasMore) {
            body.appendChild(el('div', { className: 'ht-cl-more' }, [
                'Showing the ' + versionsToShow.length + ' most recent versions — ',
                el('a', { href: CHANGELOG_URL, target: '_blank', rel: 'noopener noreferrer', text: 'see full version history on GitHub' }),
                '.',
            ]));
        }
    }

    function showChangelogModal() {
        openChangelog();
        changelogModalEl.querySelector('#ht-cl-body-content').replaceChildren(el('div', { className: 'ht-cl-loading', text: 'Loading changelog…' }));
        fetchChangelog(function (entries, err) {
            if (err) { renderChangelogBody(null, err, null); return; }
            var currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
            var updateAvailableVersion = currentIdx > 0 ? entries[0].version : null;
            var startIdx = currentIdx === -1 ? 0 : currentIdx;
            renderChangelogBody(entries.slice(startIdx, startIdx + CHANGELOG_HISTORY_DEPTH), null, updateAvailableVersion,
                entries.length > startIdx + CHANGELOG_HISTORY_DEPTH);
        });
    }

    function checkVersionUpdate() {
        var lastVersion = GM_getValue('ht_last_version', null);
        if (lastVersion === SCRIPT_VERSION) return;
        GM_setValue('ht_last_version', SCRIPT_VERSION);
        fetchChangelog(function (entries, err) {
            if (err) return; // stay quiet on auto-check failures; the menu command still works
            var currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
            var available = currentIdx === -1 ? entries : entries.slice(currentIdx);
            var toShow;
            if (!lastVersion) {
                toShow = available.length ? [available[0]] : [];
            } else {
                toShow = [];
                for (var i = 0; i < available.length; i++) {
                    if (available[i].version === lastVersion) break;
                    toShow.push(available[i]);
                }
                if (!toShow.length && available.length) toShow = [available[0]];
            }
            if (!toShow.length) return;
            log.info('Updated ' + (lastVersion ? 'from v' + lastVersion + ' ' : '') + 'to v' + SCRIPT_VERSION + ' — showing what\'s new');
            openChangelog();
            renderChangelogBody(toShow, null, currentIdx > 0 ? entries[0].version : null);
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

    function start() {
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
})();