// ==UserScript==
// @name         ThePornDB - Enhanced Search Results
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Table/grid toggle with lazy-loaded scene images, resizable columns, hide-images panic button, hover preview, custom action buttons, Tampermonkey settings menu & changelog popup - REQUIRES API KEY (set via the Tampermonkey menu).
// @author       edstagdh
// @match        https://theporndb.net/*
// @icon         https://theporndb.net/favicon-16x16.png
// @noframes
// @grant        GM_addStyle
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_info
// @connect      api.theporndb.net
// @connect      raw.githubusercontent.com
// @installURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/TPDB/tpdb_enhanced_search_results.user.js
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/TPDB/tpdb_enhanced_search_results.user.js
// ==/UserScript==

(function () {
    'use strict';

    /* =====================================================================
     * 1. CONSTANTS & SETTINGS
     * ===================================================================== */
    const SCRIPT_VERSION = (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script.version : '3.0';
    const API_BASE = 'https://api.theporndb.net';
    const SITE_ORIGIN = 'https://theporndb.net';
    const CHANGELOG_URL = 'https://raw.githubusercontent.com/edstagdh/Userscripts/refs/heads/master/TPDB/TPDB_Changelog.md';

    const GRID_SEL = 'div.grid.grid-cols-scene-card';
    const CARD_SEL = 'div.relative.group';
    const SCENE_CACHE_TTL_MS = 60_000;
    const MAX_SITE_DEPTH = 10;

    const KEYS = {
        apiKey: 'tpdb_api_key',
        timeoutMs: 'tpdb_api_timeout_ms',
        filenameMode: 'tpdb_filename_mode',
        filenameGenders: 'tpdb_filename_genders',
        debug: 'tpdb_debug',
        lastVersion: 'tpdb_last_version',
    };

    const DEFAULTS = {
        apiKey: '',
        timeoutMs: 30000,                       // per-request timeout for TPDB API calls
        filenameMode: 'names',                  // "names" | "title" | "both"
        filenameGenders: ['Female', 'Non Binary'], // [] = all performers
        debug: false,
    };

    const Settings = {
        get: (name) => GM_getValue(KEYS[name], DEFAULTS[name]),
        set: (name, value) => GM_setValue(KEYS[name], value),
    };

    const log = (...args) => { if (Settings.get('debug')) console.log('[TPDB+]', ...args); };

    /* =====================================================================
     * 2. SMALL UTILITIES
     * ===================================================================== */
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

    // Accepts "2024-05-12", "2024.05.12" or anything Date can parse -> "YYYY.MM.DD"
    function formatDate(raw) {
        if (!raw) return '';
        const iso = raw.trim().match(/^(\d{4})[-.](\d{2})[-.](\d{2})/);
        if (iso) return `${iso[1]}.${iso[2]}.${iso[3]}`;
        const d = new Date(raw);
        if (isNaN(d)) return raw;
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
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

    /* =====================================================================
     * 3. API LAYER (GM_xmlhttpRequest + configurable timeout)
     * ===================================================================== */
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

    /* =====================================================================
     * 4. SCENE ACTIONS
     * ===================================================================== */
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
            icon: '⧉', title: 'Copy UUID',
            run: async (slug) => {
                const s = await fetchScene(slug);
                if (!s.id) throw new Error('Response missing data.id');
                await copyText(s.id);
                toast(`Copied scene ID: ${s.id}`);
            },
        },
        {
            icon: '🌐', title: 'Copy Scene URL',
            run: async (slug) => {
                const s = await fetchScene(slug);
                if (!s.url) throw new Error('Response missing data.url');
                await copyText(s.url);
                toast(`Copied scene URL: ${s.url}`);
            },
        },
        {
            icon: '🆔', title: 'Show External ID',
            run: async (slug) => {
                const s = await fetchScene(slug);
                if (!s.external_id) throw new Error('Response missing data.external_id');
                toast(`Scene External ID: ${s.external_id}`);
            },
        },
        {
            icon: '👥', title: 'Show Performers',
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
            icon: '🌳', title: 'Show Site Parents',
            run: async (slug) => {
                const s = await fetchScene(slug);
                const names = await getSiteHierarchy(s);
                toast(`🌳 Site hierarchy:\n${names.map((n, i) => `${i}: ${n}`).join('\n')}`, 8000);
            },
        },
        {
            icon: '🔗', title: 'Open Scene URL (background tab)',
            run: async (slug) => {
                const s = await fetchScene(slug);
                if (!s.url) throw new Error('Response missing data.url');
                if (typeof GM_openInTab === 'function') GM_openInTab(s.url, { active: false, insert: true });
                else window.open(s.url, '_blank', 'noopener,noreferrer');
                toast('Opened scene URL');
            },
        },
        {
            icon: '★', title: 'Collect / Uncollect Scene',
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
            icon: '🗎', title: 'Copy Filename',
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
            console.error(`[TPDB+] "${action.title}" failed:`, err);
            toast(`${action.title} failed: ${err.message}`, 6000, true);
        } finally {
            btn.classList.remove('busy');
        }
    }

    /* =====================================================================
     * 5. CHANGELOG / "WHAT'S NEW"
     * ===================================================================== */
    let changelogCache = null;
    let changelogModalEl = null;

    function parseChangelogMarkdown(md) {
        const entries = [];
        let current = null;
        md.split(/\r?\n/).forEach((line) => {
            const header = line.match(/^##\s*v?([0-9][0-9.]*)\s*(?:-\s*(.+))?\s*$/i);
            if (header) {
                current = { version: header[1], date: (header[2] || '').trim(), changes: [] };
                entries.push(current);
                return;
            }
            const item = line.match(/^\s*[-*]\s+(.*\S)\s*$/);
            if (item && current) current.changes.push(item[1]);
        });
        return entries.filter((e) => e.changes.length);
    }

    const findVersionIndex = (entries, version) => entries.findIndex((e) => e.version === version);

    function fetchChangelog(callback) {
        if (changelogCache) return callback(changelogCache, null);
        GM_xmlhttpRequest({
            method: 'GET',
            url: CHANGELOG_URL,
            timeout: 10000,
            onload: (res) => {
                if (res.status < 200 || res.status >= 300) return callback(null, 'HTTP ' + res.status);
                try {
                    changelogCache = parseChangelogMarkdown(res.responseText);
                    callback(changelogCache, null);
                } catch (e) {
                    callback(null, 'Parse error: ' + e.message);
                }
            },
            onerror: () => callback(null, 'Network error fetching changelog'),
            ontimeout: () => callback(null, 'Timed out fetching changelog'),
        });
    }

    function buildChangelogModal() {
        const modal = ce('div', 'tpdb_cl_modal tpdb_cl_hidden');
        modal.innerHTML = `
            <div class="tpdb_cl_box">
                <div class="tpdb_cl_header">
                    <div>
                        <h2>📜 What's New</h2>
                        <span class="tpdb_cl_subtitle">ThePornDB Enhanced Search Results &mdash; currently v${esc(SCRIPT_VERSION)}</span>
                    </div>
                    <button type="button" class="tpdb_cl_close" title="Close">✕</button>
                </div>
                <div class="tpdb_cl_body"></div>
                <div class="tpdb_cl_footer">
                    <a href="https://github.com/edstagdh/Userscripts" target="_blank" rel="noopener noreferrer">🔗 View on GitHub</a>
                    <button type="button" class="tpdb_cl_btn">Got it!</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const close = () => modal.classList.add('tpdb_cl_hidden');
        modal.querySelector('.tpdb_cl_close').addEventListener('click', close);
        modal.querySelector('.tpdb_cl_btn').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        return modal;
    }

    function renderChangelogBody(versions, errorMsg, updateVersion) {
        const body = changelogModalEl.querySelector('.tpdb_cl_body');
        let html = '';
        if (updateVersion) {
            html += `<div class="tpdb_cl_update">🔔 A newer version (v${esc(updateVersion)}) is available on GitHub — you're on v${esc(SCRIPT_VERSION)}.</div>`;
        }
        if (errorMsg) {
            html += `<div class="tpdb_cl_error">Couldn't load the changelog (${esc(errorMsg)}). Check the GitHub repo for the latest version history.</div>`;
        } else if (!versions || !versions.length) {
            html += '<div class="tpdb_cl_error">No changelog entries found.</div>';
        } else {
            html += versions.map((v) => `
                <div class="tpdb_cl_version">
                    <div class="tpdb_cl_version_title">
                        <span class="tpdb_cl_badge">v${esc(v.version)}</span>
                        ${v.date ? `<span class="tpdb_cl_date">${esc(v.date)}</span>` : ''}
                    </div>
                    <ul>${v.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
                </div>`).join('');
        }
        body.innerHTML = html;
    }

    // Manual (menu) — shows the entry for the running version
    function showChangelogModal() {
        if (!changelogModalEl) changelogModalEl = buildChangelogModal();
        changelogModalEl.classList.remove('tpdb_cl_hidden');
        changelogModalEl.querySelector('.tpdb_cl_body').innerHTML = '<div class="tpdb_cl_loading">Loading changelog…</div>';

        fetchChangelog((entries, err) => {
            if (err) return renderChangelogBody(null, err, null);
            const idx = findVersionIndex(entries, SCRIPT_VERSION);
            if (idx === -1) return renderChangelogBody(entries.length ? [entries[0]] : [], null, null);
            renderChangelogBody([entries[idx]], null, idx > 0 ? entries[0].version : null);
        });
    }

    // Automatic — one-time popup after a version bump
    function checkVersionUpdate() {
        const lastVersion = GM_getValue(KEYS.lastVersion, null);
        if (lastVersion === SCRIPT_VERSION) return;
        GM_setValue(KEYS.lastVersion, SCRIPT_VERSION);

        fetchChangelog((entries, err) => {
            if (err) return; // stay quiet; the menu command still works
            const idx = findVersionIndex(entries, SCRIPT_VERSION);
            // never show entries newer than the running version
            const available = idx === -1 ? entries : entries.slice(idx);

            let toShow = [];
            if (!lastVersion) {
                toShow = available.length ? [available[0]] : [];
            } else {
                for (const e of available) {
                    if (e.version === lastVersion) break;
                    toShow.push(e);
                }
                if (!toShow.length && available.length) toShow = [available[0]];
            }
            if (!toShow.length) return;

            if (!changelogModalEl) changelogModalEl = buildChangelogModal();
            changelogModalEl.classList.remove('tpdb_cl_hidden');
            renderChangelogBody(toShow, null, idx > 0 ? entries[0].version : null);
        });
    }

    /* =====================================================================
     * 6. TAMPERMONKEY MENU
     * ===================================================================== */
    function registerMenu() {
        GM_registerMenuCommand('Set TPDB API key', () => {
            const key = window.prompt('ThePornDB API key:', Settings.get('apiKey'));
            if (key === null) return;
            Settings.set('apiKey', key.trim());
            sceneCache.clear();
            toast(key.trim() ? 'API key saved' : 'API key cleared');
        });

        GM_registerMenuCommand('Set API request timeout (seconds)', () => {
            const cur = Settings.get('timeoutMs') / 1000;
            const input = window.prompt('TPDB API request timeout in seconds (1–120):', String(cur));
            if (input === null) return;
            const secs = Number(input);
            if (!isFinite(secs) || secs < 1 || secs > 120) {
                toast('Invalid timeout — enter a number between 1 and 120', 5000, true);
                return;
            }
            Settings.set('timeoutMs', Math.round(secs * 1000));
            toast(`API timeout set to ${secs}s`);
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

    /* =====================================================================
     * 7. STYLES
     * ===================================================================== */
    GM_addStyle(`
        /* --- Titles / layout --- */
        h2.p-3.text-xl a {
            font-weight: bold !important; color: #fff !important; font-size: 1em !important;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.6);
            font-family: "Segoe UI","Arial Black",sans-serif !important;
        }
        h2.p-3.text-xl a:hover { color: #FF4757 !important; text-decoration: underline !important; }
        h2.p-3.text-xl.truncate, h2.p-3.text-xl.truncate a,
        div.flex.truncate, div.flex.truncate span {
            white-space: normal !important; overflow: visible !important; text-overflow: clip !important;
            max-width: none !important; display: block !important;
        }
        ${GRID_SEL} div.flex.truncate { display: inline-flex !important; align-items: center !important; gap: 4px !important; }
        ${GRID_SEL} div.flex.truncate span { display: inline !important; }
        ${GRID_SEL} div.p-3.border-t a span { font-weight: bold !important; font-size: 16px !important; }

        /* --- Grid images: contain instead of cover --- */
        ${GRID_SEL} img[style*="object-fit"] {
            object-fit: contain !important; background-color: #000;
            height: 200px !important; width: 100% !important; display: block; margin: 0 auto;
        }

        /* --- Toolbar --- */
        .tpdb-toolbar { margin: 10px 0; }
        .tpdb-toolbar button {
            margin-right: 8px; padding: 6px 12px; background: #d9534f; color: #fff;
            border: none; border-radius: 4px; cursor: pointer; font-size: 14px;
        }
        .tpdb-toolbar button.is-on { background: #0275d8; }
        .tpdb-toolbar button.tpdb-table-btn { background: #5cb85c; }
        .tpdb-toolbar button.tpdb-table-btn.is-on { background: #f0ad4e; }

        /* --- Action buttons --- */
        .tpdb-btn-container { display: flex; flex-wrap: wrap; margin-left: 6px; gap: 5px; }
        .tpdb-copy-btn {
            width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center;
            border: 1px solid #888; border-radius: 3px; background: #222; color: #fff;
            font-size: 30px; cursor: pointer; user-select: none;
        }
        .tpdb-copy-btn:hover { background: #FF4757; }
        .tpdb-copy-btn.busy { opacity: 0.4; pointer-events: none; }

        /* --- Hide images (panic) --- */
        body.tpdb-hide-images img { display: none !important; }
        body.tpdb-hide-images div.relative { min-height: 3rem !important; }

        /* --- Table view --- */
        #tpdb-table-view table { width: 100%; border-collapse: collapse; font-size: 18px; table-layout: fixed; }
        #tpdb-table-view th, #tpdb-table-view td {
            padding: 6px 8px; border-bottom: 1px solid #ccc; word-wrap: break-word;
            white-space: normal; vertical-align: top; position: relative;
        }
        #tpdb-table-view th { background: #333; color: #fff; text-align: left; user-select: none; font-weight: bold !important; }
        .col-resizer { position: absolute; top: 0; right: 0; width: 5px; height: 100%; cursor: col-resize; user-select: none; }
        .tpdb-thumb { width: 200px; transition: opacity 0.25s ease-in-out; cursor: zoom-in; }

        /* --- Hover preview --- */
        #tpdb-preview-box {
            position: fixed; pointer-events: none; z-index: 9999; display: none;
            border: 2px solid #333; background: #fff; padding: 5px; box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
        #tpdb-preview-box img { max-width: 900px; max-height: 700px; display: block; }

        /* --- Toasts --- */
        #tpdb-toast-container {
            position: fixed; bottom: 20px; right: 20px; z-index: 10000; display: flex;
            flex-direction: column; gap: 10px; align-items: flex-end; pointer-events: none;
        }
        .tpdb-toast {
            background: #1a1a1a; color: #ffa500; padding: 16px 20px; border-radius: 10px;
            font-size: 16px; font-weight: 700; line-height: 1.4; min-width: 280px; max-width: 1000px;
            border: 2px solid #ffa500; box-shadow: 0 6px 18px rgba(255,165,0,0.35);
            white-space: pre-line; word-break: break-word; overflow-wrap: break-word;
            opacity: 0; transform: translateY(10px); transition: opacity 0.25s ease, transform 0.25s ease;
        }
        .tpdb-toast.show { opacity: 1; transform: translateY(0); }
        .tpdb-toast-error { color: #ff6b6b; border-color: #ff6b6b; box-shadow: 0 6px 18px rgba(255,107,107,0.35); }

        /* --- Changelog modal --- */
        .tpdb_cl_modal {
            position: fixed; inset: 0; z-index: 10001; background: rgba(0,0,0,0.7);
            display: flex; align-items: center; justify-content: center;
        }
        .tpdb_cl_hidden { display: none !important; }
        .tpdb_cl_box {
            background: #1e2327; color: #e5e7eb; width: min(640px, 92vw); max-height: 80vh;
            display: flex; flex-direction: column; border-radius: 10px; border: 1px solid #3a4550;
            box-shadow: 0 10px 40px rgba(0,0,0,0.6); font-family: "Segoe UI", Arial, sans-serif;
        }
        .tpdb_cl_header { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 20px; border-bottom: 1px solid #3a4550; }
        .tpdb_cl_header h2 { margin: 0; font-size: 20px; color: #fff; }
        .tpdb_cl_subtitle { font-size: 12px; color: #9ca3af; }
        .tpdb_cl_close { background: none; border: none; color: #9ca3af; font-size: 18px; cursor: pointer; }
        .tpdb_cl_close:hover { color: #fff; }
        .tpdb_cl_body { padding: 16px 20px; overflow-y: auto; }
        .tpdb_cl_version + .tpdb_cl_version { margin-top: 18px; }
        .tpdb_cl_version_title { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .tpdb_cl_badge { background: #7e22ce; color: #fff; padding: 2px 10px; border-radius: 12px; font-weight: 700; font-size: 13px; }
        .tpdb_cl_date { color: #9ca3af; font-size: 12px; }
        .tpdb_cl_version ul { margin: 0; padding-left: 20px; }
        .tpdb_cl_version li { margin: 4px 0; font-size: 14px; line-height: 1.4; }
        .tpdb_cl_update { background: #3b2f0b; border: 1px solid #f0ad4e; color: #fcd34d; padding: 8px 12px; border-radius: 6px; margin-bottom: 14px; font-size: 13px; }
        .tpdb_cl_error, .tpdb_cl_loading { color: #9ca3af; font-size: 14px; }
        .tpdb_cl_error { color: #ff6b6b; }
        .tpdb_cl_footer { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-top: 1px solid #3a4550; }
        .tpdb_cl_footer a { color: #60a5fa; font-size: 13px; text-decoration: none; }
        .tpdb_cl_btn { background: #7e22ce; color: #fff; border: none; border-radius: 6px; padding: 6px 16px; cursor: pointer; font-size: 14px; }
        .tpdb_cl_btn:hover { background: #9333ea; }
    `);

    /* =====================================================================
     * 8. GRID ENHANCEMENTS (all idempotent — safe to run on every DOM change)
     * ===================================================================== */
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
        document.querySelectorAll(`${GRID_SEL} img[style*="object-fit"]`).forEach((img) => {
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

    /* =====================================================================
     * 9. TOOLBAR, TABLE VIEW & HOVER PREVIEW
     * ===================================================================== */
    function waitForAllScenes(grid, maxTicks = 200) {
        return new Promise((resolve) => {
            let lastCount = 0, stable = 0, ticks = 0;
            const timer = setInterval(() => {
                const count = grid.querySelectorAll(CARD_SEL).length;
                window.scrollTo(0, document.body.scrollHeight); // trigger lazy loading
                stable = count === lastCount ? stable + 1 : 0;
                lastCount = count;
                if (stable >= 3 || ++ticks >= maxTicks) {
                    clearInterval(timer);
                    window.scrollTo(0, 0);
                    resolve();
                }
            }, 300);
        });
    }

    const TABLE_COLUMNS = [
        ['Thumbnail', 100], ['Title', 260], ['Date (YYYY.MM.DD)', 80],
        ['Duration', 50], ['Site', 70], ['Performers', 150],
    ];

    function getPerformersHTML(card) {
        return [...card.querySelectorAll('div.p-3.border-t a')].map((a) => {
            const cs = window.getComputedStyle(a);
            const svg = a.querySelector('svg')?.outerHTML || '';
            const name = a.querySelector('span:last-child')?.textContent.trim() || a.textContent.trim();
            return `<a href="${esc(a.href)}" target="_blank" style="background:${cs.backgroundColor};color:${cs.color};padding:2px 6px;border-radius:3px;display:inline-flex;align-items:center;font-size:16px;font-weight:bold;margin:0 2px 2px 0;white-space:nowrap;">${svg}<span style="margin-left:2px;">${esc(name)}</span></a>`;
        }).join('');
    }

    function buildTable(grid) {
        const wrapper = ce('div');
        wrapper.id = 'tpdb-table-view';

        const table = ce('table');
        table.innerHTML = `
            <thead><tr>${TABLE_COLUMNS.map(([label, w]) => `<th style="width:${w}px;">${label}<div class="col-resizer"></div></th>`).join('')}</tr></thead>
            <tbody></tbody>`;
        const tbody = table.querySelector('tbody');

        grid.querySelectorAll(CARD_SEL).forEach((card) => {
            const titleLink = card.querySelector('h2 a');
            const thumb = card.querySelector('img');
            const largeSrc = thumb ? thumb.src.replace(/-small(\.[a-zA-Z0-9]+)$/, '-large$1') : '';

            const rawDate = card.querySelector('div.absolute div.flex:not(.place-items-center)')?.textContent?.trim() || '';
            const duration = card.querySelector('div.flex.place-items-center')?.childNodes[0]?.textContent?.trim() || '';

            let siteHTML = '';
            const siteAnchor = card.querySelector('div.grid.justify-end.items-center a');
            if (siteAnchor) {
                let href = siteAnchor.getAttribute('href') || '';
                if (href && !href.startsWith('http')) href = SITE_ORIGIN + href;
                siteHTML = `<a href="${esc(href)}" target="_blank" style="color:#1E90FF;text-decoration:none;font-weight:bold;">${esc(siteAnchor.textContent.trim())}</a>`;
            }

            const row = ce('tr');
            row.innerHTML = `
                <td>${thumb ? `<img src="${esc(largeSrc)}" class="tpdb-thumb">` : ''}</td>
                <td>${titleLink ? `<a href="${esc(titleLink.href)}" target="_blank">${esc(titleLink.textContent.trim())}</a>` : ''}</td>
                <td>${esc(formatDate(rawDate))}</td>
                <td>${esc(duration)}</td>
                <td>${siteHTML}</td>
                <td>${getPerformersHTML(card)}</td>`;
            tbody.appendChild(row);
        });

        wrapper.appendChild(table);
        makeColumnsResizable(table);
        return wrapper;
    }

    function makeColumnsResizable(table) {
        table.querySelectorAll('th').forEach((th) => {
            const resizer = th.querySelector('.col-resizer');
            if (!resizer) return;
            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const startX = e.pageX;
                const startWidth = th.offsetWidth;
                const onMove = (ev) => { th.style.width = startWidth + (ev.pageX - startX) + 'px'; };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        });
    }

    function initToolbar() {
        if (document.getElementById('tpdb-toolbar')) return;
        const grid = document.querySelector(GRID_SEL);
        if (!grid || !grid.parentNode) return;

        const toolbar = ce('div', 'tpdb-toolbar');
        toolbar.id = 'tpdb-toolbar';

        // Hide images (panic) button
        const hideBtn = ce('button');
        hideBtn.textContent = 'Hide Images';
        hideBtn.addEventListener('click', () => {
            const hidden = document.body.classList.toggle('tpdb-hide-images');
            hideBtn.textContent = hidden ? 'Show Images' : 'Hide Images';
            hideBtn.classList.toggle('is-on', hidden);
        });

        // Table / grid toggle
        const tableBtn = ce('button', 'tpdb-table-btn');
        tableBtn.textContent = 'Table View';
        let tableActive = false, tableLoading = false, tableWrapper = null;

        tableBtn.addEventListener('click', async () => {
            if (tableLoading) return;
            const currentGrid = document.querySelector(GRID_SEL);
            if (!currentGrid) return;

            tableActive = !tableActive;
            tableBtn.textContent = tableActive ? 'Grid View' : 'Table View';
            tableBtn.classList.toggle('is-on', tableActive);

            if (tableActive) {
                currentGrid.style.display = 'none';
                tableLoading = true;
                try {
                    await waitForAllScenes(currentGrid);
                    tableWrapper?.remove();
                    tableWrapper = buildTable(currentGrid); // rebuilt each time so it's never stale
                    currentGrid.parentNode.insertBefore(tableWrapper, currentGrid);
                } finally {
                    tableLoading = false;
                }
            } else {
                tableWrapper?.remove();
                tableWrapper = null;
                currentGrid.style.display = '';
            }
        });

        toolbar.append(hideBtn, tableBtn);
        grid.parentNode.insertBefore(toolbar, grid);
    }

    // One delegated hover-preview for both grid images and table thumbnails
    function initHoverPreview() {
        const box = ce('div');
        box.id = 'tpdb-preview-box';
        const img = ce('img');
        box.appendChild(img);
        document.body.appendChild(box);

        const isTarget = (el) => el instanceof HTMLImageElement &&
            (el.classList.contains('tpdb-thumb') || !!el.closest(GRID_SEL));

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
            img.src = e.target.src.replace(/-small(\.[a-zA-Z0-9]+)$/, '-large$1');
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

    /* =====================================================================
     * 10. INIT — single debounced MutationObserver
     * ===================================================================== */
    function enhancePage() {
        untruncate();
        initToolbar();
        unwrapGridImageLinks();
        addActionButtons();
        formatGridDates();
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

    registerMenu();
    initHoverPreview();
    enhancePage();
    new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true });
    checkVersionUpdate();
})();