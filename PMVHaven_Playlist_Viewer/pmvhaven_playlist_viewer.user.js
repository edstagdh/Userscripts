// ==UserScript==
// @name         [PMVHaven] Playlist Viewer
// @namespace    edstagdh.pmvhaven.playlist.viewer
// @version      1.0
// @description  Adds a "Videos" button to every playlist card: browse, search and sort all videos of a playlist in a popup (grid / table view).
// @author       edstagdh
// @match        https://pmvhaven.com/*
// @match        https://www.pmvhaven.com/*
// @icon         https://pmvhaven.com/favicon.ico
// @require      https://raw.githubusercontent.com/edstagdh/Userscripts/master/PMVHaven_Playlist_Viewer/pmvhaven_playlist_viewer.api.js?v=1.0
// @require      https://raw.githubusercontent.com/edstagdh/Userscripts/master/PMVHaven_Playlist_Viewer/pmvhaven_playlist_viewer.views.js?v=1.0
// @require      https://raw.githubusercontent.com/edstagdh/Userscripts/master/PMVHaven_Playlist_Viewer/pmvhaven_playlist_viewer.modal.js?v=1.0
// @require      https://raw.githubusercontent.com/edstagdh/Userscripts/master/PMVHaven_Playlist_Viewer/pmvhaven_playlist_viewer.changelog.js?v=1.0
// @resource     PVX_STYLES https://raw.githubusercontent.com/edstagdh/Userscripts/master/PMVHaven_Playlist_Viewer/pmvhaven_playlist_viewer.styles.css?v=1.0
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      pmvhaven.com
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/edstagdh/Userscripts/master/PMVHaven_Playlist_Viewer/pmvhaven_playlist_viewer.user.js
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/PMVHaven_Playlist_Viewer/pmvhaven_playlist_viewer.user.js
// ==/UserScript==

/* Main script: settings, helpers, "Videos" buttons on playlist cards, route watcher, start.
   Modules (@require, same scope — they run first, so only call into them from functions):
     .api.js        API calls, resumable playlist loader, URL templates
     .views.js      grid cards + table
     .modal.js      popup: header, toolbar, search/sort, pagination, settings
     .changelog.js  "What's New" popup (Changelog.md on GitHub)
     .styles.css    all CSS (@resource PVX_STYLES) */

const SCRIPT_VERSION = '1.0';

/* ───────────────────────── Settings ───────────────────────── */

const PVX_DEFAULTS = {
    view: 'grid',            // 'grid' | 'table'
    pageSize: 48,            // 0 = all
    scale: 100,              // text / UI scale in %
    sort: 'index',           // index | title | uploader | duration | views | likes | rating | date
    sortDir: 1,              // 1 asc, -1 desc
    newTab: true,            // open videos in a new tab
    showTags: true,          // tag chips on grid cards
    cacheMinutes: 15,        // how long a loaded playlist is kept in memory
    // URL templates — placeholders: {id} {key} {oldId} {slug} {pid} {index} (0-based) {index1} (1-based)
    videoUrl: '/video/{id}',
    playlistVideoUrl: '/video/{id}?playlist={pid}&index={index}',
};

const S = {};

function pvxLoadSettings() {
    for (const k of Object.keys(PVX_DEFAULTS)) S[k] = GM_getValue('pvx_' + k, PVX_DEFAULTS[k]);
}

function pvxSet(k, v) {
    S[k] = v;
    GM_setValue('pvx_' + k, v);
}

function pvxResetSettings() {
    for (const k of Object.keys(PVX_DEFAULTS)) pvxSet(k, PVX_DEFAULTS[k]);
}

/* ───────────────────────── Helpers ───────────────────────── */

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Tiny DOM builder: h('div', {class:'x', onclick: fn}, child, 'text', [more]) */
function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
            if (v == null || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k === 'style') el.style.cssText = v;
            else if (k === 'html') el.innerHTML = v;
            else if (k === 'dataset') Object.assign(el.dataset, v);
            else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
            else if (k in el && typeof v !== 'string') el[k] = v;
            else el.setAttribute(k, v === true ? '' : v);
        }
    }
    for (const c of kids.flat(Infinity)) {
        if (c == null || c === false) continue;
        el.append(c.nodeType ? c : String(c));
    }
    return el;
}

function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const pad2 = n => String(n).padStart(2, '0');

function fmtNum(n) {
    if (n == null || !isFinite(n)) return '–';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e4) return Math.round(n / 1e3) + 'K';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
}

function fmtDur(sec) {
    if (!isFinite(sec) || sec <= 0) return '';
    sec = Math.round(sec);
    const hh = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return hh ? `${hh}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

function fmtTotal(sec) {
    if (!isFinite(sec) || sec <= 0) return '–';
    const hh = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    return hh ? `${hh} h ${m} min` : `${m} min`;
}

function parseDur(str) {
    if (str == null) return 0;
    if (typeof str === 'number') return str;
    const p = String(str).trim().split(':').map(Number);
    if (!p.length || p.some(isNaN)) return 0;
    return p.reduce((a, b) => a * 60 + b, 0);
}

function fmtDate(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function relTime(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    const s = (Date.now() - d) / 1000;
    if (s < 60) return 'just now';
    const units = [[31536000, 'y'], [2592000, 'mo'], [604800, 'w'], [86400, 'd'], [3600, 'h'], [60, 'm']];
    for (const [sec, u] of units) if (s >= sec) return Math.floor(s / sec) + u + ' ago';
    return '';
}

function slugify(s) {
    return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

/* ───────────────────────── Card buttons ───────────────────────── */

const PVX_PL_HREF = /^\/playlists\/([0-9a-f]{24})\/?(?:[?#].*)?$/i;
const PVX_ICON_LIST = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h13M3 12h13M3 18h9"/><path d="m17 15 4 3-4 3z" fill="currentColor"/></svg>';

function pvxPidFromAnchor(a) {
    const m = a && PVX_PL_HREF.exec(a.getAttribute('href') || '');
    return m ? m[1].toLowerCase() : null;
}

function pvxScanCards() {
    for (const a of document.querySelectorAll('a[href^="/playlists/"]')) {
        if (a.closest('#pvx-root')) continue;
        if (!pvxPidFromAnchor(a)) continue;
        // Only real cards (with a thumbnail area), not text links.
        const host = a.querySelector('.aspect-video') || a.querySelector('img')?.parentElement;
        if (!host || host.querySelector(':scope > .pvx-cardbtn')) continue;
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        host.append(h('button', {
            type: 'button', class: 'pvx-cardbtn', title: 'Browse the videos in this playlist',
            html: PVX_ICON_LIST + '<span>Videos</span>',
        }));
    }
}

/** What the card already shows — used for the header while the API loads. */
function pvxCardHint(a) {
    if (!a) return null;
    const txt = sel => a.querySelector(sel)?.textContent.trim() || '';
    return {
        name: txt('h3'),
        thumb: a.querySelector('.aspect-video img')?.getAttribute('src') || '',
        owner: txt('span.truncate'),
    };
}

function pvxOnCardClick(e) {
    const btn = e.target.closest && e.target.closest('.pvx-cardbtn');
    if (!btn) return;
    // The button sits inside the card's <a>: keep the site from navigating.
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.type !== 'click') return;
    const a = btn.closest('a');
    const pid = pvxPidFromAnchor(a);
    if (pid) pvxOpen(pid, pvxCardHint(a));
}

/* ───────────────────────── Playlist page button ───────────────────────── */

let pvxLastPath = '';

function pvxRouteCheck() {
    if (location.pathname === pvxLastPath) return;
    pvxLastPath = location.pathname;
    const m = /^\/playlists\/([0-9a-f]{24})\/?$/i.exec(location.pathname);
    let fab = document.getElementById('pvx-fab');
    if (!m) { fab?.remove(); return; }
    if (!fab) {
        fab = h('button', { id: 'pvx-fab', type: 'button', class: 'pvx-cardbtn pvx-fab', html: PVX_ICON_LIST + '<span>All videos</span>' });
        fab.addEventListener('click', () => {
            const pid = /^\/playlists\/([0-9a-f]{24})/i.exec(location.pathname)?.[1];
            if (pid) pvxOpen(pid.toLowerCase(), { name: document.querySelector('h1')?.textContent.trim() || '' });
        });
        document.body.append(fab);
    }
}

/* ───────────────────────── Start ───────────────────────── */

function pvxStart() {
    pvxLoadSettings();
    try { GM_addStyle(GM_getResourceText('PVX_STYLES')); } catch (e) { console.error('[PVX] CSS not loaded', e); }

    for (const type of ['click', 'auxclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']) {
        document.addEventListener(type, pvxOnCardClick, true);
    }

    let queued = false;
    const queue = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; pvxScanCards(); pvxRouteCheck(); });
    };
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', queue);
    setInterval(pvxRouteCheck, 800);   // client-side navigation doesn't always mutate the DOM
    queue();

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Reset Playlist Viewer settings', () => { pvxResetSettings(); alert('Playlist Viewer settings reset.'); });
        GM_registerMenuCommand('Clear loaded playlists (memory)', () => PVX_CACHE.clear());
        GM_registerMenuCommand("What's New", () => pvxShowChangelog(true));
    }
    pvxMaybeShowChangelog();
}

pvxStart();
