// ==UserScript==
// @name         ThePornDB - Enhanced Search Results
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Table/grid toggle with lazy-loaded scene images, resizable columns, hide-images panic button, hover preview, custom action buttons (plus a kebab menu in the site's Table mode), adjustable grid card width, Tampermonkey settings menu & changelog popup - REQUIRES API KEY (set via the Tampermonkey menu).
// @author       edstagdh
// @match        https://theporndb.net/*
// @icon         https://theporndb.net/favicon-16x16.png
// @noframes
// @installURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/TPDB/tpdb_enhanced_search_results.user.js
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/TPDB/tpdb_enhanced_search_results.user.js
// @require      https://raw.githubusercontent.com/edstagdh/Userscripts/master/TPDB/tpdb_enhanced_search_results.table.js?v=3.2
// @require      https://raw.githubusercontent.com/edstagdh/Userscripts/master/TPDB/tpdb_enhanced_search_results.changelog.js?v=3.2
// @resource     TPDB_STYLES https://raw.githubusercontent.com/edstagdh/Userscripts/master/TPDB/tpdb_enhanced_search_results.styles.css?v=3.2
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @connect      api.theporndb.net
// @connect      raw.githubusercontent.com
// ==/UserScript==

'use strict';

// Code is split across files (all in TPDB/, cached by Tampermonkey, refreshed on each
// version bump through the ?v= on their URLs):
//   tpdb_enhanced_search_results.table.js       toolbar (Hide Images / Table View) + our table view,
//                                               and action buttons / kebab menu in the site's own Table mode
//   tpdb_enhanced_search_results.changelog.js   "What's New" popup (fetches TPDB_Changelog.md)
//   tpdb_enhanced_search_results.styles.css     all CSS
// When bumping @version, update the ?v= on those @require / @resource lines too.
// The main script is not wrapped in an IIFE: the @require modules share its scope.

const LOG_PREFIX = '[TPDB+]';

// --------------------
// VERSION
// --------------------
const SCRIPT_VERSION = '3.2';

// --------------------
// CONSTANTS
// --------------------
const API_BASE = 'https://api.theporndb.net';
const SITE_ORIGIN = 'https://theporndb.net';

const GRID_SEL = 'div.grid.grid-cols-scene-card';
const CARD_SEL = 'div.relative.group';
const GRID_IMG_SEL = `${GRID_SEL} img[style*="object-fit"]`; // scene images only (not site logos)
const SITE_TABLE_SEL = 'div.n-data-table';                     // the site's own Table mode (Card/Table switch)
const SITE_TABLE_IMG_SEL = `${SITE_TABLE_SEL} td[data-col-key="image"] img`;
const SCENE_CACHE_TTL_MS = 60_000;
const MAX_SITE_DEPTH = 10;

// --------------------
// SETTINGS (changed from the Tampermonkey menu)
// --------------------
const KEYS = {
    apiKey: 'tpdb_api_key',
    timeoutMs: 'tpdb_api_timeout_ms',
    filenameMode: 'tpdb_filename_mode',
    filenameGenders: 'tpdb_filename_genders',
    cardMinWidth: 'tpdb_card_min_width',
    debug: 'tpdb_debug',
    lastVersion: 'tpdb_last_version',
};

const DEFAULTS = {
    apiKey: '',
    timeoutMs: 30000,                          // per-request timeout for TPDB API calls
    filenameMode: 'names',                     // "names" | "title" | "both"
    filenameGenders: ['Female', 'Non Binary'], // [] = all performers
    cardMinWidth: 280,                         // px; 280 → 5 cards per row at 1080p / 100%
    debug: false,
};

const Settings = {
    get: (name) => GM_getValue(KEYS[name], DEFAULTS[name]),
    set: (name, value) => GM_setValue(KEYS[name], value),
};

const log = (...args) => { if (Settings.get('debug')) console.log(LOG_PREFIX, ...args); };

// --------------------
// CSS — our stylesheet (@resource TPDB_STYLES) + settings-driven CSS variables
// --------------------
function loadStyles() {
    let css = '';
    try { css = GM_getResourceText('TPDB_STYLES') || ''; } catch (e) { /* handled below */ }
    if (css) GM_addStyle(css);
    else console.error(`${LOG_PREFIX} Stylesheet resource TPDB_STYLES is missing — check the @resource line / reinstall the script.`);
    applyCardMinWidth();
}

function applyCardMinWidth() {
    const px = Number(Settings.get('cardMinWidth')) || DEFAULTS.cardMinWidth;
    document.documentElement.style.setProperty('--tpdb-card-min', px + 'px');
}

// --------------------
// SMALL UTILITIES
// --------------------
function ce(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str ?? '');
    return d.innerHTML;
}

function slugFromUrl(url) {
    const parts = new URL(url, SITE_ORIGIN).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1];
}

// Accepts "2024-05-12", "2024.05.12", "Nov 20, 2026" or anything Date can parse -> "YYYY.MM.DD"
function formatDate(raw) {
    if (!raw) return '';
    const iso = raw.trim().match(/^(\d{4})[-.](\d{2})[-.](\d{2})/);
    if (iso) return `${iso[1]}.${iso[2]}.${iso[3]}`;
    const d = new Date(raw);
    if (isNaN(d)) return raw;
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// Full-size image for a scene thumbnail. The site now puts a tiny base64 placeholder in src
// and the real image in data-preview-src; older markup used "-small" / "-large" file names.
function fullImageSrc(img) {
    if (!img) return '';
    if (img.dataset.previewSrc) return img.dataset.previewSrc;
    return (img.currentSrc || img.src || '').replace(/-small(\.[a-zA-Z0-9]+)$/, '-large$1');
}

async function copyText(text) {
    if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text, 'text');
        return;
    }
    await navigator.clipboard.writeText(text);
}

function toast(message, duration = 5000, isError = false) {
    let container = document.getElementById('tpdb-toast-container');
    if (!container) {
        container = ce('div');
        container.id = 'tpdb-toast-container';
        document.body.appendChild(container);
    }
    const el = ce('div', 'tpdb-toast' + (isError ? ' tpdb-toast-error' : ''));
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
    }, duration);
}

// --------------------
// API LAYER (GM_xmlhttpRequest + configurable timeout)
// --------------------
function getApiKey(promptIfMissing = true) {
    let key = String(Settings.get('apiKey') || '').trim();
    if (!key && promptIfMissing) {
        key = (window.prompt('Enter your ThePornDB API key (saved locally for next time):', '') || '').trim();
        if (key) Settings.set('apiKey', key);
    }
    return key;
}

function apiRequest(path, method = 'GET') {
    return new Promise((resolve, reject) => {
        const key = getApiKey();
        if (!key) return reject(new Error('No API key set (use the Tampermonkey menu → Set API key)'));

        const timeout = Number(Settings.get('timeoutMs')) || DEFAULTS.timeoutMs;
        log(method, path, `(timeout ${timeout}ms)`);

        GM_xmlhttpRequest({
            method,
            url: API_BASE + path,
            timeout,
            headers: { accept: 'application/json', Authorization: `Bearer ${key}` },
            onload: (res) => {
                log('status', res.status, path);
                if (res.status < 200 || res.status >= 300) {
                    return reject(new Error(`API request failed: HTTP ${res.status}`));
                }
                if (!res.responseText) return resolve(null);
                try { resolve(JSON.parse(res.responseText)); }
                catch (e) { method === 'GET' ? reject(new Error('Invalid JSON in API response')) : resolve(null); }
            },
            onerror: () => reject(new Error('Network error contacting the TPDB API')),
            ontimeout: () => reject(new Error(`API request timed out after ${timeout / 1000}s`)),
        });
    });
}

// Several buttons hit the same scene endpoint — share one request per slug for a short while.
const sceneCache = new Map();
function fetchScene(slug) {
    const hit = sceneCache.get(slug);
    if (hit && Date.now() - hit.t < SCENE_CACHE_TTL_MS) return hit.p;

    const p = apiRequest(`/scenes/${encodeURIComponent(slug)}`).then((json) => {
        if (!json?.data) throw new Error('Invalid API response (missing data)');
        return json.data;
    });
    sceneCache.set(slug, { t: Date.now(), p });
    p.catch(() => sceneCache.delete(slug));
    return p;
}

// --------------------
// SCENE ACTIONS
// --------------------
async function getSiteHierarchy(scene) {
    let uuid = scene?.site?.uuid;
    if (!uuid) throw new Error('Scene has no site UUID');

    const names = [];
    const seen = new Set();
    while (uuid && !seen.has(uuid) && names.length < MAX_SITE_DEPTH) {
        seen.add(uuid);
        const json = await apiRequest(`/sites/${encodeURIComponent(uuid)}`);
        const site = json?.data;
        if (!site) throw new Error('Site response missing data');
        names.push(site.name);
        uuid = site.parent?.uuid;
    }
    return names.reverse(); // top-level parent first
}

function normalizeStudio(str) {
    // mirrors Python sanitize_site_filename_part()
    return str
        .replace(/:/g, '-')
        .replace(/\./g, ' ')
        .replace(/\//g, '-')
        .replace(/[!@#$%^&*()_+='’‘\s]/g, '');
}

function normalizeSegment(str) {
    return str.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '.');
}

function buildFilename(scene) {
    const mode = Settings.get('filenameMode');
    const genders = Array.isArray(Settings.get('filenameGenders')) ? Settings.get('filenameGenders') : [];

    if (!scene.date) throw new Error('Missing date');
    const [y, m, d] = scene.date.split('-');
    const studio = normalizeStudio(scene?.site?.name || 'Unknown');
    const date = `${y.slice(2)}.${m}.${d}`;

    const all = Array.isArray(scene.performers) ? scene.performers : [];
    const filtered = genders.length ? all.filter((p) => genders.includes(p?.parent?.extras?.gender)) : all;
    const performersStr = filtered.length
        ? filtered.map((p) => normalizeSegment(p?.parent?.name || 'Unknown')).join('.and.')
        : null;
    const titleStr = scene.title ? normalizeSegment(scene.title) : null;

    let suffix;
    if (mode === 'title') {
        if (!titleStr) throw new Error('Missing title');
        suffix = titleStr;
    } else if (mode === 'both') {
        if (!performersStr) throw new Error('No matching performers found');
        if (!titleStr) throw new Error('Missing title');
        suffix = `${performersStr}.${titleStr}`;
    } else {
        if (!performersStr) throw new Error('No matching performers found');
        suffix = performersStr;
    }

    let filename = [studio, date, suffix].join('.');
    let warning = null;

    if (filename.length > 250) {
        if (mode !== 'names') {
            if (!performersStr) throw new Error('No matching performers found (fallback)');
            const original = filename.length;
            filename = [studio, date, performersStr].join('.');
            warning = `⚠️ Filename too long (${original} chars).\nFalling back to "names" mode.`;
        } else {
            warning = `⚠️ Filename is ${filename.length} chars (exceeds 250).\nCopied as-is — consider shortening manually.`;
        }
    }
    return { filename, warning };
}

// Each action: icon, tooltip, and an async run(slug) that throws on failure.
const ACTIONS = [
    {
        id: 'uuid', icon: '⧉', title: 'Copy UUID',
        run: async (slug) => {
            const s = await fetchScene(slug);
            if (!s.id) throw new Error('Response missing data.id');
            await copyText(s.id);
            toast(`Copied scene ID: ${s.id}`);
        },
    },
    {
        id: 'url', icon: '🌐', title: 'Copy Scene URL',
        run: async (slug) => {
            const s = await fetchScene(slug);
            if (!s.url) throw new Error('Response missing data.url');
            await copyText(s.url);
            toast(`Copied scene URL: ${s.url}`);
        },
    },
    {
        id: 'external_id', icon: '🆔', title: 'Show External ID',
        run: async (slug) => {
            const s = await fetchScene(slug);
            if (!s.external_id) throw new Error('Response missing data.external_id');
            toast(`Scene External ID: ${s.external_id}`);
        },
    },
    {
        id: 'performers', icon: '👥', title: 'Show Performers',
        run: async (slug) => {
            const s = await fetchScene(slug);
            if (!Array.isArray(s.performers) || !s.performers.length) throw new Error('No performers found in response');
            const genderMap = { Female: 'F', Male: 'M' };
            const lines = s.performers.map((p, i) => {
                const parentName = p?.parent?.name || 'Unknown';
                const sceneName = p?.name || 'Unknown';
                const g = genderMap[p?.parent?.extras?.gender] || 'N/A';
                const display = parentName === sceneName ? sceneName : `${sceneName} (${parentName})`;
                return `${i + 1}. [${g}] ${display}`;
            });
            toast(`Performers:\n${lines.join('\n')}`);
        },
    },
    {
        id: 'site_parents', icon: '🌳', title: 'Show Site Parents',
        run: async (slug) => {
            const s = await fetchScene(slug);
            const names = await getSiteHierarchy(s);
            toast(`🌳 Site hierarchy:\n${names.map((n, i) => `${i}: ${n}`).join('\n')}`, 8000);
        },
    },
    {
        id: 'open', icon: '🔗', title: 'Open Scene URL (background tab)',
        run: async (slug) => {
            const s = await fetchScene(slug);
            if (!s.url) throw new Error('Response missing data.url');
            if (typeof GM_openInTab === 'function') GM_openInTab(s.url, { active: false, insert: true });
            else window.open(s.url, '_blank', 'noopener,noreferrer');
            toast('Opened scene URL');
        },
    },
    {
        id: 'collect', icon: '★', title: 'Collect / Uncollect Scene',
        run: async (slug) => {
            const s = await fetchScene(slug);
            if (!s._id) throw new Error('Scene JSON missing data._id');

            const path = `/user/collection?scene_id=${encodeURIComponent(s._id)}&type=Scene`;
            const collected = (await apiRequest(path))?.value === true; // never cached

            if (collected && !confirm('Scene is already collected.\n\nRemove from collection?')) {
                toast('Kept in collection');
                return;
            }
            await apiRequest(path, 'POST');
            toast(`${slug} ${collected ? 'Removed from Collection' : 'Collected Successfully'}`, 10000);
        },
    },
    {
        id: 'filename', icon: '🗎', title: 'Copy Filename',
        run: async (slug) => {
            const s = await fetchScene(slug);
            const { filename, warning } = buildFilename(s);
            await copyText(filename);
            log('Copied filename:', filename);
            toast(warning ? `${warning}\n\nCopied:\n${filename}` : `Copied filename:\n${filename}`, warning ? 8000 : 5000);
        },
    },
];

async function runAction(action, btn, href) {
    if (btn.classList.contains('busy')) return;
    btn.classList.add('busy');
    try {
        await action.run(slugFromUrl(href));
    } catch (err) {
        console.error(`${LOG_PREFIX} "${action.title}" failed:`, err);
        toast(`${action.title} failed: ${err.message}`, 6000, true);
    } finally {
        btn.classList.remove('busy');
    }
}

// --------------------
// TAMPERMONKEY MENU
// --------------------
// Prompts for a number in [min, max]; returns it, or null if cancelled / invalid (with a toast).
function promptNumber(message, current, min, max) {
    const input = window.prompt(message, String(current));
    if (input === null) return null;
    const n = Number(input);
    if (!isFinite(n) || n < min || n > max) {
        toast(`Invalid value — enter a number between ${min} and ${max}`, 5000, true);
        return null;
    }
    return n;
}

function registerMenu() {
    GM_registerMenuCommand('Set TPDB API key', () => {
        const key = window.prompt('ThePornDB API key:', Settings.get('apiKey'));
        if (key === null) return;
        Settings.set('apiKey', key.trim());
        sceneCache.clear();
        toast(key.trim() ? 'API key saved' : 'API key cleared');
    });

    GM_registerMenuCommand('Set API request timeout (seconds)', () => {
        const secs = promptNumber('TPDB API request timeout in seconds (1–120):', Settings.get('timeoutMs') / 1000, 1, 120);
        if (secs === null) return;
        Settings.set('timeoutMs', Math.round(secs * 1000));
        toast(`API timeout set to ${secs}s`);
    });

    GM_registerMenuCommand('Set grid card minimum width (px)', () => {
        const px = promptNumber(
            'Minimum width of a scene card in the grid, in px (150–800).\nSmaller = more cards per row. Default 280 (5 per row at 1080p).',
            Settings.get('cardMinWidth'), 150, 800);
        if (px === null) return;
        Settings.set('cardMinWidth', Math.round(px));
        applyCardMinWidth();
        toast(`Grid card minimum width set to ${Math.round(px)}px`);
    });

    GM_registerMenuCommand('Set filename mode (names / title / both)', () => {
        const input = window.prompt('Filename mode:\n  names → performers after the date\n  title → scene title after the date\n  both  → performers, then title', Settings.get('filenameMode'));
        if (input === null) return;
        const mode = input.trim().toLowerCase();
        if (!['names', 'title', 'both'].includes(mode)) {
            toast('Invalid mode — use names, title or both', 5000, true);
            return;
        }
        Settings.set('filenameMode', mode);
        toast(`Filename mode set to "${mode}"`);
    });

    GM_registerMenuCommand('Set filename performer genders', () => {
        const cur = (Settings.get('filenameGenders') || []).join(', ');
        const input = window.prompt('Genders to include in filenames (comma separated, e.g. Female, Male, Non Binary).\nLeave empty to include all performers:', cur);
        if (input === null) return;
        const list = input.split(',').map((s) => s.trim()).filter(Boolean);
        Settings.set('filenameGenders', list);
        toast(list.length ? `Filename genders: ${list.join(', ')}` : 'Filename genders: all performers');
    });

    GM_registerMenuCommand("Show changelog / what's new", showChangelogModal);

    GM_registerMenuCommand('Toggle debug logging', () => {
        const next = !Settings.get('debug');
        Settings.set('debug', next);
        toast(`Debug logging ${next ? 'enabled' : 'disabled'}`);
    });
}

// --------------------
// GRID ENHANCEMENTS (all idempotent — safe to run on every DOM change)
// --------------------
function untruncate() {
    const apply = (el) => {
        el.classList.remove('truncate');
        Object.assign(el.style, { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', maxWidth: 'none', display: 'inline-flex' });
    };
    document.querySelectorAll('h2.p-3.text-xl.truncate').forEach((h2) => {
        apply(h2);
        const a = h2.querySelector('a');
        if (a) apply(a);
    });
    document.querySelectorAll('div.flex.truncate').forEach(apply);
}

function formatGridDates() {
    document.querySelectorAll('div.absolute div.flex:not(.place-items-center)').forEach((el) => {
        if (el.__dateFormatted) return;
        el.__dateFormatted = true;
        const formatted = formatDate(el.textContent);
        if (formatted && formatted !== el.textContent.trim()) el.textContent = formatted;
    });
}

function unwrapGridImageLinks() {
    document.querySelectorAll(GRID_IMG_SEL).forEach((img) => {
        const link = img.closest('a');
        if (link && link.parentNode) link.parentNode.replaceChild(img, link);
    });
}

function addActionButtons() {
    document.querySelectorAll(CARD_SEL).forEach((card) => {
        if (card.__tpdbButtons) return;
        const titleLink = card.querySelector('h2 a');
        if (!titleLink) return;
        card.__tpdbButtons = true;

        const container = ce('div', 'tpdb-btn-container');
        ACTIONS.forEach((action) => {
            const btn = ce('div', 'tpdb-copy-btn');
            btn.title = action.title;
            btn.textContent = action.icon;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                runAction(action, btn, titleLink.href);
            });
            container.appendChild(btn);
        });

        titleLink.parentElement.style.display = 'inline-flex';
        titleLink.parentElement.style.alignItems = 'center';
        titleLink.after(container);
    });
}

// --------------------
// HOVER PREVIEW — one delegated handler for grid images and table thumbnails
// --------------------
function initHoverPreview() {
    const box = ce('div');
    box.id = 'tpdb-preview-box';
    const img = ce('img');
    box.appendChild(img);
    document.body.appendChild(box);

    const isTarget = (el) => el instanceof HTMLImageElement &&
        (el.classList.contains('tpdb-thumb') || el.matches(GRID_IMG_SEL) || el.matches(SITE_TABLE_IMG_SEL));

    const move = (x, y) => {
        const pad = 20;
        const w = box.offsetWidth || 600;
        const h = box.offsetHeight || 600;
        let px = x + pad, py = y + pad;
        if (px + w > window.innerWidth) px = x - w - pad;
        if (py + h > window.innerHeight) py = y - h - pad;
        box.style.left = Math.max(pad, px) + 'px';
        box.style.top = Math.max(pad, py) + 'px';
    };

    document.addEventListener('mouseover', (e) => {
        if (!isTarget(e.target)) return;
        img.src = fullImageSrc(e.target);
        box.style.display = 'block';
        move(e.clientX, e.clientY);
    });
    document.addEventListener('mousemove', (e) => {
        if (box.style.display === 'block') move(e.clientX, e.clientY);
    });
    document.addEventListener('mouseout', (e) => {
        if (!isTarget(e.target)) return;
        box.style.display = 'none';
        img.removeAttribute('src');
    });
}

// --------------------
// INIT — single debounced MutationObserver
// --------------------
function enhancePage() {
    untruncate();
    initToolbar();
    unwrapGridImageLinks();
    addActionButtons();
    formatGridDates();
    enhanceSiteTable();
}

let enhanceQueued = false;
function scheduleEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(() => {
        enhanceQueued = false;
        enhancePage();
    });
}

loadStyles();
registerMenu();
initHoverPreview();
enhancePage();
new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true });
checkVersionUpdate();
