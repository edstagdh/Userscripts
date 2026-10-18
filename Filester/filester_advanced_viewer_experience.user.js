// ==UserScript==
// @name         [Filester] Advanced Viewer Experience
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  This script provides better experience viewing filster folders, using real anchor links, large previews, hover zoom, table view, persistent sort & view, in-folder search, automatic "load all pages", and a remotely-fetched changelog.
// @match        https://filester.me/*
// @match        https://filester.sh/*
// @match        https://filester.si/*
// @match        https://filester.gg/*
// @author       edstagdh
// @icon         https://www.google.com/s2/favicons?sz=64&domain=filester.me
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/Filester/filester_advanced_viewer_experience.user.js
// @installURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/Filester/filester_advanced_viewer_experience.user.js
// @run-at       document-start
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// ==/UserScript==
(function () {
    'use strict';

    // =========================================
    // Domain canonicalization
    // Always redirect non-.me domains to filester.me so the user's
    // session (logged in via filester.me) is always active.
    // =========================================
    if (location.hostname !== 'filester.me') {
        location.replace('https://filester.me' + location.pathname + location.search + location.hash);
        return;
    }

    // =========================================
    // Helpers
    // =========================================
    // With GM_* grants the script runs sandboxed, so the page's own globals
    // (setViewMode, applyFilters, ...) are reached through unsafeWindow.
    const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    // The script runs at document-start, when <head>/<body> may not exist
    // yet. Anything touching the DOM waits for this.
    function onReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    // =========================================
    // Persistence helpers
    // =========================================
    const LS_VIEW = 'filester_view_mode';
    const LS_SORT = 'filester_sort';

    const LS_SEARCH_VIEW = 'filester_search_view';
    const LS_SEARCH_SORT = 'filester_search_sort';

    function saveSearchView(mode) { try { localStorage.setItem(LS_SEARCH_VIEW, mode); } catch (_) {} }
    function loadSearchView()     { try { return localStorage.getItem(LS_SEARCH_VIEW) || 'table'; } catch (_) { return 'table'; } }
    function saveSearchSort(mode) { try { localStorage.setItem(LS_SEARCH_SORT, mode); } catch (_) {} }
    function loadSearchSort()     { try { return localStorage.getItem(LS_SEARCH_SORT) || 'name_asc'; } catch (_) { return 'name_asc'; } }

    function saveView(mode) { try { localStorage.setItem(LS_VIEW, mode); } catch (_) {} }
    function loadView()     { try { return localStorage.getItem(LS_VIEW); } catch (_) { return null; } }
    function saveSort(val)  { try { localStorage.setItem(LS_SORT, val); } catch (_) {} }
    function loadSort()     { try { return localStorage.getItem(LS_SORT); } catch (_) { return null; } }

    // The site's own init calls setViewMode() with ITS saved value, which
    // (through our patch) used to overwrite our saved view before we could
    // restore it. Saving is therefore disabled until init has finished.
    let initDone = false;

    // =========================================
    // Script identity / version tracking
    // =========================================
    const SCRIPT_NAME    = '[Filester] Advanced Viewer Experience';
    const SCRIPT_VERSION = '1.3';
    const GITHUB_REPO_URL = 'https://github.com/edstagdh/Userscripts/tree/master/Filester/filester_advanced_viewer_experience.user.js';

    // Changelog lives in AVE_Changelog.md next to this script on GitHub and is
    // fetched on demand (see the changelog section below). Every release needs
    // a "## vX.Y — YYYY-MM-DD" entry there, with the same version as above.
    const CHANGELOG_URL = 'https://raw.githubusercontent.com/edstagdh/Userscripts/master/Filester/FAVE_Changelog.md';
    const CHANGELOG_PAGE_URL = 'https://github.com/edstagdh/Userscripts/blob/master/Filester/FAVE_Changelog.md';

    const LS_LAST_SEEN_VERSION = 'filester_script_last_seen_version';
    function loadLastSeenVersion() {
        try { return localStorage.getItem(LS_LAST_SEEN_VERSION) || ''; }
        catch (_) { return ''; }
    }
    function saveLastSeenVersion(v) {
        try { localStorage.setItem(LS_LAST_SEEN_VERSION, v); }
        catch (_) {}
    }

    // =========================================
    // CSS
    // =========================================
    const style = document.createElement('style');
    style.textContent = `
        .container, main.max-w-5xl { max-width: 1800px !important; }

        /* ── Larger grid cards ── */
        .files-list.grid-view {
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important;
        }
        .files-list.grid-view .file-preview { background: #0d0d0d !important; }
        .files-list.grid-view .file-preview img {
            object-fit: contain !important;
            object-position: center !important;
        }
        .files-list.grid-view .file-name {
            overflow: visible !important;
            white-space: break-spaces !important;
            display: block !important;
        }

        /* ── Grid view: file date caption ── */
        .files-list.grid-view .file-date {
            display: block !important;
            font-size: 0.72rem;
            color: #6b6b6b;
            padding: 0 0.7rem 0.6rem;
            white-space: nowrap;
        }

        /* ── Inner anchor wrapper ── */
        .file-item-link {
            text-decoration: none !important;
            color: inherit !important;
            display: flex;
            min-width: 0;
        }
        .files-list.grid-view .file-item-link {
            flex-direction: column;
            flex: 1;
            width: 100%;
        }
        .files-list.list-view .file-item-link {
            flex-direction: row;
            flex: 1;
            align-items: center;
        }

        /* Date cell hidden outside grid/table view */
        .file-date { display: none; }

        /* ── Hover zoom popup ── */
        #fm-zoom-popup {
            display: none;
            position: fixed;
            z-index: 999999 !important;
            max-width: 80vw;
            min-width: 600px;
            max-height: 80vh;
            min-height: 400px;
            width: auto;
            height: auto;
            border-radius: 6px;
            box-shadow: 0 8px 40px rgba(0,0,0,0.85);
            pointer-events: none;
            background: #111;
            image-rendering: auto;
        }

        /* ── Toolbar buttons (shared style) ── */
        #tableViewBtn, #searchBtn, #fm-changelog-btn {
            padding: 0.5rem;
            border-radius: 0.375rem;
            border: 1px solid #262b3a;
            background: transparent;
            color: #8a90a3;
            cursor: pointer;
        }
        #fm-changelog-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 2.25rem;
            height: 2.25rem;
            padding: 0;
            margin-right: 4px;
        }
        #tableViewBtn.active {
            background: #1d2130 !important;
            color: #e8eaf0 !important;
        }
        #searchBtn:hover, #tableViewBtn:hover, #fm-changelog-btn:hover { color: #fff; }

        /* ── Table view: container ── */
        .files-list.table-view {
            display: block !important;
            border: 1px solid #2a2a2a !important;
            border-radius: 8px !important;
            overflow: clip !important;
        }

        /* ── Table view: sticky header ── */
        .fm-table-header {
            display: grid;
            grid-template-columns: 82px 1fr 90px 110px 50px;
            align-items: center;
            background: #161616;
            border-bottom: 1px solid #2a2a2a;
            position: sticky;
            top: 0;
            z-index: 20;
        }
        .fm-th {
            padding: 0.55rem 0.75rem;
            font-size: 0.7rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.07em;
            color: #555;
            user-select: none;
            white-space: nowrap;
        }
        .fm-th[data-sortable] { cursor: pointer; }
        .fm-th[data-sortable]:hover { color: #bbb; }
        .fm-th[data-sort-dir] { color: #fff; }
        .fm-arrow { color: #444; margin-left: 3px; }
        .fm-th[data-sort-dir] .fm-arrow { color: #aaa; }

        /* ── Table view: rows ── */
        .files-list.table-view .file-item {
            display: grid !important;
            grid-template-columns: 82px 1fr 90px 110px 50px !important;
            align-items: center !important;
            gap: 0 !important;
            padding: 0 !important;
            border-radius: 0 !important;
            border: none !important;
            border-bottom: 1px solid #1c1c1c !important;
            min-height: 50px;
            overflow: visible !important;
        }
        .files-list.table-view .file-item:last-child { border-bottom: none !important; }
        .files-list.table-view .file-item:hover { background: rgba(255,255,255,0.04) !important; }
        .files-list.table-view .file-item-link { display: contents !important; }
        .files-list.table-view .file-info      { display: contents !important; }
        .files-list.table-view .file-preview {
            width: 82px !important; height: 46px !important;
            aspect-ratio: unset !important; overflow: hidden !important;
            background: #111 !important; border-radius: 0 !important;
            flex-shrink: unset !important;
        }
        .files-list.table-view .file-preview img {
            width: 100% !important; height: 100% !important; object-fit: cover !important;
        }
        .files-list.table-view .file-name {
            padding: 0 0.75rem !important; font-size: 0.85rem !important;
            overflow: hidden !important; text-overflow: ellipsis !important;
            white-space: nowrap !important; display: block !important;
        }
        .files-list.table-view .file-meta {
            padding: 0 0.75rem !important; font-size: 0.8rem !important;
            color: #666 !important; white-space: nowrap !important; margin: 0 !important;
        }
        .files-list.table-view .file-date {
            display: block !important; padding: 0 0.75rem !important;
            font-size: 0.8rem !important; color: #666 !important; white-space: nowrap !important;
        }
        .files-list.table-view .download-btn {
            position: static !important; opacity: 1 !important;
            display: flex !important; align-items: center !important;
            justify-content: center !important;
            width: 32px !important; height: 32px !important;
            margin: 0 auto !important; border-radius: 4px !important;
        }

        /* =========================================
           Search modal
           ========================================= */
        #fm-search-overlay {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 10000;
            background: rgba(0,0,0,0.75);
            backdrop-filter: blur(4px);
            align-items: flex-start;
            justify-content: center;
            padding-top: 6vh;
        }
        #fm-search-overlay.open { display: flex; }

        #fm-search-modal {
            width: min(1200px, 94vw);
            max-height: 84vh;
            background: #141414;
            border: 1px solid #2e2e2e;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 24px 80px rgba(0,0,0,0.9);
        }

        #fm-search-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 14px 16px;
            border-bottom: 1px solid #222;
            flex-shrink: 0;
        }
        #fm-search-header svg { color: #555; flex-shrink: 0; }
        #fm-search-input {
            flex: 1;
            background: transparent;
            border: none;
            outline: none;
            font-size: 1rem;
            color: #e8e8e8;
            caret-color: #7c6af7;
        }
        #fm-search-input::placeholder { color: #444; }

        #fm-search-sort {
            background: #1b1b1b;
            border: 1px solid #333;
            color: #ccc;
            border-radius: 4px;
            padding: 4px 6px;
            font-size: 12px;
            outline: none;
            cursor: pointer;
            margin-right: 4px;
        }
        #fm-search-sort:focus { border-color: #666; }

        #fm-search-close {
            background: none;
            border: none;
            color: #555;
            cursor: pointer;
            font-size: 1.2rem;
            line-height: 1;
            padding: 2px 6px;
            border-radius: 4px;
        }
        #fm-search-close:hover { color: #ccc; background: #222; }

        #fm-search-status {
            padding: 6px 16px;
            font-size: 0.72rem;
            color: #555;
            border-bottom: 1px solid #1c1c1c;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 8px;
            min-height: 30px;
        }

        #fm-search-results {
            overflow-y: auto;
            flex: 1;
        }
        #fm-search-results::-webkit-scrollbar { width: 6px; }
        #fm-search-results::-webkit-scrollbar-track { background: transparent; }
        #fm-search-results::-webkit-scrollbar-thumb { background: #2e2e2e; border-radius: 3px; }

        .fm-result-dl {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background: #1e1e1e;
            border: 1px solid #2e2e2e;
            border-radius: 6px;
            color: #aaa;
            text-decoration: none;
            transition: background 0.15s, color 0.15s;
        }
        .fm-result-dl:hover { background: #7c6af7; color: #fff; border-color: #7c6af7; }

        .fm-search-empty {
            padding: 48px 0;
            text-align: center;
            color: #444;
            font-size: 0.9rem;
        }
        .fm-search-empty svg { display: block; margin: 0 auto 12px; opacity: 0.3; }

        #fm-search-view-controls {
            display: flex;
            gap: 6px;
            align-items: center;
        }

        .fm-search-view-btn {
            background: #1b1b1b;
            border: 1px solid #333;
            color: #777;
            cursor: pointer;
            border-radius: 4px;
            padding: 4px 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.15s, border-color 0.15s;
        }
        .fm-search-view-btn.active {
            color: #fff;
            border-color: #666;
            background: #222;
        }
        .fm-search-view-btn:hover { color: #fff; }

        /* ── SEARCH RESULTS: GRID ── */
        #fm-search-results.fm-search-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 14px;
            padding: 16px;
            align-content: start;
        }
        .fmg-card {
            display: flex;
            min-height: 260px;
            flex-direction: column;
            position: relative;
            border: 1px solid #222;
            border-radius: 8px;
            background: #111;
            overflow: hidden;
            cursor: pointer;
            transition: border-color 0.15s, background 0.15s, transform 0.15s;
        }
        .fmg-card:hover { border-color: #3a3a3a; background: #161616; transform: translateY(-2px); }
        .fmg-cover { position: absolute; inset: 0; z-index: 0; display: block; }
        .fmg-thumb {
            position: relative; z-index: 1;
            width: 100%; height: 160px; flex-shrink: 0;
            min-height: 160px !important;
            background: #080808; overflow: hidden;
            display: flex; align-items: center; justify-content: center;
        }
        .fmg-thumb img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center; }
        .fmg-thumb-placeholder { font-size: 2rem; color: #2a2a2a; }
        .fmg-info {
            position: relative; z-index: 1;
            display: flex; flex-direction: column; gap: 5px;
            padding: 10px 12px 12px; flex: 0 0 auto; min-width: 0;
        }
        .fmg-name { font-size: 0.83rem; color: #ddd; line-height: 1.4; overflow: hidden; max-height: 2.8em; word-break: break-word; }
        .fmg-name mark { background: none; color: #a99af8; font-weight: 600; }
        .fmg-meta { display: flex; flex-wrap: wrap; gap: 6px; font-size: 0.7rem; color: #555; margin-top: auto; padding-top: 4px; }
        .fmg-meta span { white-space: nowrap; }
        .fmg-dl {
            position: absolute; top: 8px; right: 8px; z-index: 2;
            display: flex; align-items: center; justify-content: center;
            width: 32px; height: 32px;
            background: rgba(0,0,0,0.75); border: 1px solid #555; border-radius: 6px;
            color: #aaa; text-decoration: none;
            opacity: 0; transition: opacity 0.15s, background 0.15s;
        }
        .fmg-card:hover .fmg-dl { opacity: 1; }
        .fmg-dl:hover { background: #7c6af7 !important; color: #fff; border-color: #7c6af7; }

        /* ── SEARCH RESULTS: TABLE ── */
        #fm-search-results.fm-search-table { display: block; }
        .fmr-row {
            display: grid;
            grid-template-columns: 82px 1fr 90px 110px 50px;
            align-items: center;
            border-bottom: 1px solid #1c1c1c;
            min-height: 50px;
            text-decoration: none;
            color: inherit;
        }
        .fmr-row:last-child { border-bottom: none; }
        .fmr-row:hover { background: rgba(255,255,255,0.04); }
        .fmr-thumb {
            width: 82px; height: 46px; overflow: hidden; background: #0d0d0d;
            display: flex; align-items: center; justify-content: center;
            font-size: 1.2rem; color: #333; flex-shrink: 0;
        }
        .fmr-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
        .fmr-name { padding: 0 0.75rem; font-size: 0.85rem; color: #ddd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fmr-name mark { background: none; color: #a99af8; font-weight: 600; }
        .fmr-cell { padding: 0 0.75rem; font-size: 0.8rem; color: #666; white-space: nowrap; }
        .fmr-dl-cell { display: flex; align-items: center; justify-content: center; }

        /* =========================================
           Changelog / "What's New" modal
           ========================================= */
        #fm-changelog-backdrop {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 1000000;
            background: rgba(0,0,0,0.78);
            backdrop-filter: blur(4px);
            align-items: center;
            justify-content: center;
        }
        #fm-changelog-backdrop.open { display: flex; }
        #fm-changelog-modal {
            width: min(560px, 94vw);
            max-height: 84vh;
            background: #141414;
            border: 1px solid #2e2e2e;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 24px 80px rgba(0,0,0,0.9);
            color: #d0d0d0;
            font-family: inherit;
        }
        #fm-cl-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
            padding: 16px 18px 12px;
            border-bottom: 1px solid #222;
            flex-shrink: 0;
        }
        #fm-cl-header h2 {
            margin: 0 0 3px;
            font-size: 15px;
            font-weight: 800;
            color: #f0f0f0;
            letter-spacing: 0.02em;
        }
        #fm-cl-subtitle { font-size: 11px; color: #666; }
        #fm-cl-close {
            background: none;
            border: none;
            color: #555;
            cursor: pointer;
            font-size: 1.2rem;
            line-height: 1;
            padding: 2px 6px;
            border-radius: 4px;
            flex-shrink: 0;
        }
        #fm-cl-close:hover { color: #ccc; background: #222; }
        #fm-cl-body {
            padding: 14px 18px 6px;
            overflow-y: auto;
        }
        #fm-cl-body::-webkit-scrollbar { width: 6px; }
        #fm-cl-body::-webkit-scrollbar-track { background: transparent; }
        #fm-cl-body::-webkit-scrollbar-thumb { background: #2e2e2e; border-radius: 3px; }
        .fm-cl-version-block { margin-bottom: 16px; }
        .fm-cl-version-block:last-child { margin-bottom: 4px; }
        .fm-cl-version-label {
            display: inline-block;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.07em;
            text-transform: uppercase;
            color: #7c6af7;
            background: #1a1a2e;
            border: 1px solid #333366;
            padding: 2px 8px;
            border-radius: 3px;
            margin-bottom: 8px;
        }
        .fm-cl-changes {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .fm-cl-changes li {
            display: flex;
            gap: 8px;
            align-items: flex-start;
            font-size: 12px;
            color: #c0c0c0;
            line-height: 1.5;
        }
        .fm-cl-changes li::before {
            content: '→';
            color: #7c6af7;
            font-weight: 700;
            flex-shrink: 0;
        }
        #fm-cl-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 12px 18px 16px;
            border-top: 1px solid #222;
            flex-shrink: 0;
            flex-wrap: wrap;
        }
        .fm-cl-link {
            font-size: 11px;
            color: #7c6af7;
            text-decoration: none;
            font-weight: 600;
        }
        .fm-cl-link:hover { text-decoration: underline; color: #a99af8; }
        #fm-cl-ok {
            padding: 6px 20px;
            font-size: 12px;
            font-weight: 700;
            border-radius: 4px;
            cursor: pointer;
            background: #2a2350;
            border: 1px solid #4a3f8a;
            color: #cfc6ff;
            transition: background 0.15s, color 0.15s;
        }
        .fm-cl-update-banner {
            font-size: 12px;
            color: #f0d080;
            background: #2e2810;
            border: 1px solid #6a5a1a;
            border-radius: 8px;
            padding: 8px 10px;
            margin-bottom: 14px;
        }
        .fm-cl-more {
            font-size: 11px;
            color: #777;
            padding: 10px 0 2px;
            border-top: 1px solid #2a2a2a;
            margin-top: 4px;
        }
        .fm-cl-more a { color: #7c6af7; text-decoration: none; }
        .fm-cl-more a:hover { text-decoration: underline; }
        #fm-cl-ok:hover { background: #352c66; color: #e5dfff; border-color: #6a5cc4; }
    `;
    (document.head || document.documentElement).appendChild(style);

    // =========================================
    // Hover zoom popup
    // =========================================
    let popup = null;
    const PAD = 16;

    function createPopup() {
        if (popup) return;
        popup = document.createElement('img');
        popup.id = 'fm-zoom-popup';
        document.body.appendChild(popup);
    }

    function positionPopup(e) {
        if (!popup) return;
        const pw = popup.offsetWidth  || window.innerWidth  * 0.8;
        const ph = popup.offsetHeight || window.innerHeight * 0.8;
        const vw = window.innerWidth, vh = window.innerHeight;
        let x = e.clientX + PAD, y = e.clientY + PAD;
        if (x + pw > vw - PAD) x = e.clientX - pw - PAD;
        if (y + ph > vh - PAD) y = e.clientY - ph - PAD;
        popup.style.left = Math.max(PAD, Math.min(x, vw - pw - PAD)) + 'px';
        popup.style.top  = Math.max(PAD, Math.min(y, vh - ph - PAD)) + 'px';
    }

    function attachHoverZoom(img) {
        if (img.dataset.zoomAttached) return;
        img.dataset.zoomAttached = 'true';
        img.addEventListener('mouseenter', e => {
            if (!popup) return;
            popup.src = img.src;
            popup.style.display = 'block';
            positionPopup(e);
            popup.onload = () => positionPopup(e);
        });
        img.addEventListener('mousemove', positionPopup);
        img.addEventListener('mouseleave', () => { if (popup) popup.style.display = 'none'; });
    }

    // =========================================
    // Convert .file-item divs → real <a> links
    // =========================================
    // The site makes each card clickable via onclick="window.location.href='/d/xxx'".
    // We replace that with a real anchor (middle-click, ctrl-click, etc.) and keep
    // the path in data-fm-href so other code (search index, the site's own
    // "Copy URLs" button) can still find it after the onclick is removed.
    const CONTROL_SELECTOR = 'button, .download-btn, .rename-btn, .admin-del-btn, a';

    function convertItems() {
        document.querySelectorAll('.file-item:not([data-linkified])').forEach(item => {
            const onclick = item.getAttribute('onclick');
            if (!onclick) return;
            const match = onclick.match(/href\s*=\s*['"]([^'"]+)['"]/);
            if (!match) return;
            item.removeAttribute('onclick');
            item.dataset.linkified = 'true';
            item.dataset.fmHref = match[1];
            const link = document.createElement('a');
            link.href = match[1];
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'file-item-link';
            // Move everything before the first control button into the link,
            // leaving download / rename / delete buttons outside of it.
            while (item.firstChild &&
                   !(item.firstChild.nodeType === 1 && item.firstChild.matches(CONTROL_SELECTOR))) {
                link.appendChild(item.firstChild);
            }
            item.insertBefore(link, item.firstChild);
        });
    }

    // The site's "Copy URLs" button reads the onclick attribute we removed;
    // give it a version that understands our data attribute.
    function patchSiteHelpers() {
        if (typeof W.fileItemURL === 'function' && !W.fileItemURL._fmPatched) {
            const orig = W.fileItemURL;
            W.fileItemURL = function (item) {
                if (item && item.dataset && item.dataset.fmHref) {
                    return location.origin + item.dataset.fmHref;
                }
                return orig.call(W, item);
            };
            W.fileItemURL._fmPatched = true;
        }
    }

    // =========================================
    // Table view
    // =========================================
    const COL_DEFS = [
        { id: 'preview', label: '' },
        { id: 'name',    label: 'Name', asc: 'name_asc',  desc: 'name_desc' },
        { id: 'size',    label: 'Size', asc: 'size_asc',  desc: 'size_desc' },
        { id: 'date',    label: 'Date', asc: 'date_asc',  desc: 'date_desc' },
        { id: 'dl',      label: '' },
    ];
    let tableActive = false;

    // data-date is an ISO date at midnight UTC; format it in UTC so it
    // doesn't shift a day in timezones behind UTC.
    function formatDate(raw) {
        const d = new Date(raw || '');
        if (isNaN(d.getTime())) return { str: '', ts: 0 };
        return { str: d.toLocaleDateString(undefined, { timeZone: 'UTC' }), ts: d.getTime() };
    }

    function injectDateCells() {
        document.querySelectorAll('#filesGrid .file-item-link').forEach(link => {
            if (link.querySelector('.file-date')) return;
            const item = link.closest('.file-item');
            const el = document.createElement('div');
            el.className = 'file-date';
            el.textContent = formatDate(item?.dataset.date).str;
            link.appendChild(el);
        });
    }

    function buildTableHeader() {
        const header = document.createElement('div');
        header.id = 'fm-table-header';
        header.className = 'fm-table-header';
        COL_DEFS.forEach(col => {
            const th = document.createElement('div');
            th.className = 'fm-th';
            if (col.asc) {
                th.dataset.sortable = '1';
                th.dataset.colId = col.id;
                th.textContent = col.label;
                const arrow = document.createElement('span');
                arrow.className = 'fm-arrow';
                arrow.textContent = '⇅';
                th.appendChild(arrow);
                th.addEventListener('click', () => {
                    const sel = document.getElementById('sortSelect');
                    if (!sel) return;
                    sel.value = sel.value === col.desc ? col.asc : col.desc;
                    sel.dispatchEvent(new Event('change'));
                });
            } else {
                th.textContent = col.label;
            }
            header.appendChild(th);
        });
        return header;
    }

    function updateSortIndicators() {
        const val = document.getElementById('sortSelect')?.value || 'date_desc';
        COL_DEFS.forEach(col => {
            if (!col.asc) return;
            const th = document.querySelector(`.fm-th[data-col-id="${col.id}"]`);
            if (!th) return;
            const arrow = th.querySelector('.fm-arrow');
            if      (val === col.asc)  { th.dataset.sortDir = 'asc';  if (arrow) arrow.textContent = '↑'; }
            else if (val === col.desc) { th.dataset.sortDir = 'desc'; if (arrow) arrow.textContent = '↓'; }
            else                       { delete th.dataset.sortDir;   if (arrow) arrow.textContent = '⇅'; }
        });
    }

    function activateTableView() {
        const grid = document.getElementById('filesGrid');
        if (!grid) return;
        tableActive = true;
        grid.classList.remove('grid-view', 'list-view');
        grid.classList.add('table-view');
        ['gridViewBtn', 'listViewBtn'].forEach(id => {
            const b = document.getElementById(id);
            if (b) { b.style.background = 'transparent'; b.style.color = '#8a90a3'; }
        });
        document.getElementById('tableViewBtn')?.classList.add('active');
        injectDateCells();
        if (!document.getElementById('fm-table-header')) grid.prepend(buildTableHeader());
        updateSortIndicators();
        saveView('table');
    }

    function deactivateTableView() {
        if (!tableActive) return;
        tableActive = false;
        document.getElementById('filesGrid')?.classList.remove('table-view');
        document.getElementById('fm-table-header')?.remove();
        document.getElementById('tableViewBtn')?.classList.remove('active');
    }

    // Restores the persisted sort + view (grid/list/table).
    function restoreSavedView() {
        const sortSel = document.getElementById('sortSelect');
        const savedSort = loadSort();
        if (savedSort && sortSel && sortSel.value !== savedSort &&
            [...sortSel.options].some(o => o.value === savedSort)) {
            sortSel.value = savedSort;
            sortSel.dispatchEvent(new Event('change'));
        }

        const savedView = loadView();
        if (savedView === 'table') {
            activateTableView();
        } else if (savedView === 'list') {
            document.getElementById('listViewBtn')?.click();
        } else if (savedView === 'grid') {
            document.getElementById('gridViewBtn')?.click();
        }
    }

    // The grid/list buttons (and sort <select>) sit in a plain wrapper div
    // with no class on the redesigned site, so find it via the buttons.
    function getToolbar() {
        return document.getElementById('gridViewBtn')?.parentElement
            || document.getElementById('listViewBtn')?.parentElement
            || document.querySelector('.view-controls');
    }

    function setupTableView() {
        if (!document.getElementById('tableViewBtn')) {
            const viewControls = getToolbar();
            if (viewControls) {
                const btn = document.createElement('button');
                btn.id = 'tableViewBtn';
                btn.type = 'button';
                btn.title = 'Table view';
                btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 3h18v2H3V3zm0 4h18v2H3V7zm0 4h18v2H3v-2zm0 4h18v2H3v-2zm0 4h18v2H3v-2z"/>
                </svg>`;
                btn.addEventListener('click', () => {
                    if (tableActive) {
                        deactivateTableView();
                        if (typeof W.setViewMode === 'function') W.setViewMode('grid');
                        else {
                            const grid = document.getElementById('filesGrid');
                            if (grid) grid.classList.add('grid-view');
                            saveView('grid');
                        }
                    } else {
                        activateTableView();
                    }
                });
                const listBtn = document.getElementById('listViewBtn');
                if (listBtn) listBtn.after(btn); else viewControls.appendChild(btn);
            }
        }

        if (typeof W.setViewMode === 'function' && !W.setViewMode._fmPatched) {
            const orig = W.setViewMode;
            W.setViewMode = function (mode) {
                deactivateTableView();
                orig.call(W, mode);
                if (initDone) saveView(mode);
            };
            W.setViewMode._fmPatched = true;
        }

        if (typeof W.applyFilters === 'function' && !W.applyFilters._fmPatched) {
            const orig = W.applyFilters;
            W.applyFilters = function () {
                orig.call(W);
                if (!tableActive) return;
                document.querySelectorAll('#filesGrid .file-item').forEach(item => {
                    if (item.style.display === 'flex') item.style.display = '';
                });
                injectDateCells();
                if (!document.getElementById('fm-table-header')) {
                    document.getElementById('filesGrid')?.prepend(buildTableHeader());
                }
                updateSortIndicators();
            };
            W.applyFilters._fmPatched = true;
        }

        const sortSel = document.getElementById('sortSelect');
        if (sortSel && !sortSel.dataset.fmPersist) {
            sortSel.dataset.fmPersist = '1';
            sortSel.addEventListener('change', () => {
                saveSort(sortSel.value);
                if (tableActive) updateSortIndicators();
            });
        }
    }

    // =========================================
    // ── SEARCH SYSTEM ──────────────────────────
    // =========================================

    let searchIndex = [];

    let fmSearchInput   = null;
    let fmSearchSort    = null;
    let fmSearchStatus  = null;
    let fmSearchResults = null;
    let fmSearchView    = 'table';

    function parseSizeToBytes(sizeStr) {
        if (!sizeStr) return 0;
        const units = { 'b': 1, 'kb': 1024, 'mb': 1048576, 'gb': 1073741824, 'tb': 1099511627776 };
        const match = sizeStr.toLowerCase().match(/([\d.]+)\s*([a-z]+)/);
        if (!match) return 0;
        return parseFloat(match[1]) * (units[match[2]] || 1);
    }

    // View link of a .file-item: our data attribute (set when the onclick is
    // converted into a real link), falling back to the original onclick.
    function fileItemHref(item) {
        if (item.dataset.fmHref) return item.dataset.fmHref;
        const onclick = item.getAttribute('onclick') || '';
        const match = onclick.match(/href\s*=\s*['"]([^'"]+)['"]/);
        return match ? match[1] : null;
    }

    // Download control is <button onclick="...downloadFile('slug')">; the
    // site's downloadFile() just navigates to /d/<slug>.
    function fileItemDownloadHref(item, fallbackHref) {
        const dlBtn = item.querySelector('.download-btn');
        if (!dlBtn) return fallbackHref;
        if (dlBtn.tagName === 'A' && dlBtn.getAttribute('href')) return dlBtn.href;
        const onclick = dlBtn.getAttribute('onclick') || '';
        const slugMatch = onclick.match(/downloadFile\(\s*['"]([^'"]+)['"]\s*\)/);
        if (slugMatch) return location.origin + '/d/' + slugMatch[1];
        return fallbackHref;
    }

    // Builds file records straight from the live DOM (every page that has
    // been loaded so far).
    function collectFilesFromDom() {
        const files = [];
        document.querySelectorAll('#filesGrid .file-item').forEach(item => {
            const href = fileItemHref(item);
            if (!href) return;

            const dlHref = fileItemDownloadHref(item, href);

            const nameEl = item.querySelector('.file-name');
            const name   = item.dataset.name || nameEl?.textContent.trim() || '';

            const metaEl = item.querySelector('.file-meta, .file-size');
            const size   = metaEl?.textContent.trim() || '';
            const sizeRaw = parseInt(item.dataset.size, 10) || parseSizeToBytes(size);

            const { str: dateStr, ts: timestamp } = formatDate(item.dataset.date);

            const imgEl = item.querySelector('.file-preview img');
            const thumb = imgEl?.src || imgEl?.dataset.src || '';

            files.push({ href, dlHref, name, size, sizeRaw, dateStr, timestamp, thumb });
        });
        return files;
    }

    function highlight(text, query) {
        if (!query) return escHtml(text);
        const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escHtml(text).replace(new RegExp(esc, 'gi'), m => `<mark>${m}</mark>`);
    }

    function escHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function sortFiles(files, mode) {
        return [...files].sort((a, b) => {
            switch (mode) {
                case 'name_asc':  return a.name.localeCompare(b.name);
                case 'name_desc': return b.name.localeCompare(a.name);
                case 'size_desc': return (b.sizeRaw || 0) - (a.sizeRaw || 0);
                case 'size_asc':  return (a.sizeRaw || 0) - (b.sizeRaw || 0);
                case 'date_desc': return (b.timestamp || 0) - (a.timestamp || 0);
                case 'date_asc':  return (a.timestamp || 0) - (b.timestamp || 0);
                default: return 0;
            }
        });
    }

    function filterIndex(index, query) {
        if (!query.trim()) return index;
        const q = query.toLowerCase();
        return index.filter(f => f.name.toLowerCase().includes(q));
    }

    const DL_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>`;

    function renderResults(files, query, container, currentView) {
        container.innerHTML = '';

        if (!files.length) {
            container.innerHTML = `
                <div class="fm-search-empty">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    No files match "<strong style="color:#666">${escHtml(query)}</strong>"
                </div>`;
            return;
        }

        const frag = document.createDocumentFragment();

        if (currentView === 'grid') {
            files.forEach(f => {
                const card = document.createElement('div');
                card.className = 'fmg-card';

                const coverLink = document.createElement('a');
                coverLink.href = f.href;
                coverLink.target = '_blank';
                coverLink.rel = 'noopener noreferrer';
                coverLink.className = 'fmg-cover';
                card.appendChild(coverLink);

                const thumb = document.createElement('div');
                thumb.className = 'fmg-thumb';
                if (f.thumb) {
                    const img = document.createElement('img');
                    img.src = f.thumb;
                    img.loading = 'lazy';
                    img.alt = '';
                    attachHoverZoom(img);
                    thumb.appendChild(img);
                } else {
                    thumb.textContent = '📄';
                    thumb.classList.add('fmg-thumb-placeholder');
                }
                card.appendChild(thumb);

                const info = document.createElement('div');
                info.className = 'fmg-info';

                const nameDiv = document.createElement('div');
                nameDiv.className = 'fmg-name';
                nameDiv.innerHTML = highlight(f.name, query);
                info.appendChild(nameDiv);

                const meta = document.createElement('div');
                meta.className = 'fmg-meta';
                if (f.size)    { const s = document.createElement('span'); s.textContent = f.size;    meta.appendChild(s); }
                if (f.dateStr) { const s = document.createElement('span'); s.textContent = f.dateStr; meta.appendChild(s); }
                info.appendChild(meta);
                card.appendChild(info);

                const dlA = document.createElement('a');
                dlA.className = 'fmg-dl';
                dlA.href = f.dlHref;
                dlA.target = '_blank';
                dlA.rel = 'noopener noreferrer';
                dlA.title = 'Download';
                dlA.innerHTML = DL_ICON;
                card.appendChild(dlA);

                frag.appendChild(card);
            });

        } else {
            const header = document.createElement('div');
            header.className = 'fm-table-header';
            ['', 'Name', 'Size', 'Date', ''].forEach(label => {
                const th = document.createElement('div');
                th.className = 'fm-th';
                th.textContent = label;
                header.appendChild(th);
            });
            frag.appendChild(header);

            files.forEach(f => {
                const row = document.createElement('a');
                row.className = 'fmr-row';
                row.href = f.href;
                row.target = '_blank';
                row.rel = 'noopener noreferrer';

                const thumb = document.createElement('div');
                thumb.className = 'fmr-thumb';
                if (f.thumb) {
                    const img = document.createElement('img');
                    img.src = f.thumb;
                    img.loading = 'lazy';
                    img.alt = '';
                    attachHoverZoom(img);
                    thumb.appendChild(img);
                } else {
                    thumb.textContent = '📄';
                }
                row.appendChild(thumb);

                const nameDiv = document.createElement('div');
                nameDiv.className = 'fmr-name';
                nameDiv.innerHTML = highlight(f.name, query);
                row.appendChild(nameDiv);

                const sizeDiv = document.createElement('div');
                sizeDiv.className = 'fmr-cell';
                sizeDiv.textContent = f.size || '—';
                row.appendChild(sizeDiv);

                const dateDiv = document.createElement('div');
                dateDiv.className = 'fmr-cell';
                dateDiv.textContent = f.dateStr || '—';
                row.appendChild(dateDiv);

                const dlWrap = document.createElement('div');
                dlWrap.className = 'fmr-dl-cell';
                const dlA = document.createElement('a');
                dlA.className = 'fm-result-dl';
                dlA.href = f.dlHref;
                dlA.target = '_blank';
                dlA.rel = 'noopener noreferrer';
                dlA.title = 'Download';
                dlA.innerHTML = DL_ICON;
                dlA.addEventListener('click', e => e.stopPropagation());
                dlWrap.appendChild(dlA);
                row.appendChild(dlWrap);

                frag.appendChild(row);
            });
        }

        container.appendChild(frag);
    }

    function setSearchStatus(text) {
        if (fmSearchStatus) fmSearchStatus.textContent = text;
    }

    function loadingNote() {
        const btn = document.getElementById('loadAllPagesBtn');
        if (!btn) return '';
        return btn.disabled
            ? ' — still loading remaining pages…'
            : ' — only loaded pages are searched (click "Load all pages")';
    }

    function updateAndRenderSearch() {
        if (!fmSearchInput || !fmSearchResults) return;
        const q = fmSearchInput.value;
        if (!q.trim()) {
            fmSearchResults.innerHTML = '';
            setSearchStatus(`${searchIndex.length} files ready — start typing to search${loadingNote()}`);
            return;
        }
        const filtered = filterIndex(searchIndex, q);
        const sorted = sortFiles(filtered, fmSearchSort ? fmSearchSort.value : 'name_asc');
        setSearchStatus(`${sorted.length} of ${searchIndex.length} files${loadingNote()}`);
        renderResults(sorted, q, fmSearchResults, fmSearchView);
    }

    function rebuildSearchIndex() {
        searchIndex = collectFilesFromDom();
    }

    function applySearchViewMode() {
        if (!fmSearchResults) return;
        fmSearchResults.classList.remove('fm-search-grid', 'fm-search-table');
        fmSearchResults.classList.add(`fm-search-${fmSearchView}`);
        document.querySelectorAll('.fm-search-view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === fmSearchView);
        });
        updateAndRenderSearch();
    }

    // Re-renders the search modal if it's open (called once all pages load).
    function refreshOpenSearchResults() {
        const overlay = document.getElementById('fm-search-overlay');
        if (!overlay || !overlay.classList.contains('open')) return;
        rebuildSearchIndex();
        updateAndRenderSearch();
    }

    function setupSearch() {
        // Only on pages that actually list files.
        if (!document.getElementById('filesGrid')) return;
        if (document.getElementById('fm-search-overlay')) return;

        fmSearchView = loadSearchView();

        const overlay = document.createElement('div');
        overlay.id = 'fm-search-overlay';

        overlay.innerHTML = `
            <div id="fm-search-modal" role="dialog" aria-modal="true" aria-label="Search files">
                <div id="fm-search-header">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input id="fm-search-input" type="text" placeholder="Search all loaded files…" autocomplete="off" spellcheck="false">
                    <div id="fm-search-view-controls">
                        <select id="fm-search-sort" title="Sort Results">
                            <option value="name_asc">Name (A-Z)</option>
                            <option value="name_desc">Name (Z-A)</option>
                            <option value="date_desc">Newest First</option>
                            <option value="date_asc">Oldest First</option>
                            <option value="size_desc">Largest First</option>
                            <option value="size_asc">Smallest First</option>
                        </select>
                        <button class="fm-search-view-btn" data-view="grid" title="Grid View">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                        </button>
                        <button class="fm-search-view-btn" data-view="table" title="Table View">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v2H3V3zm0 4h18v2H3V7zm0 4h18v2H3v-2zm0 4h18v2H3v-2zm0 4h18v2H3v-2z"/></svg>
                        </button>
                    </div>
                    <button id="fm-search-close" title="Close (Esc)">✕</button>
                </div>
                <div id="fm-search-status"></div>
                <div id="fm-search-results"></div>
            </div>`;
        document.body.appendChild(overlay);

        fmSearchInput   = document.getElementById('fm-search-input');
        fmSearchSort    = document.getElementById('fm-search-sort');
        fmSearchStatus  = document.getElementById('fm-search-status');
        fmSearchResults = document.getElementById('fm-search-results');
        const closeBtn  = document.getElementById('fm-search-close');

        fmSearchSort.value = loadSearchSort();

        document.getElementById('fm-search-view-controls').addEventListener('click', e => {
            const btn = e.target.closest('.fm-search-view-btn');
            if (!btn) return;
            fmSearchView = btn.dataset.view;
            saveSearchView(fmSearchView);
            applySearchViewMode();
        });

        fmSearchSort.addEventListener('change', () => {
            saveSearchSort(fmSearchSort.value);
            updateAndRenderSearch();
        });

        applySearchViewMode();

        function openModal() {
            overlay.classList.add('open');
            rebuildSearchIndex();
            updateAndRenderSearch();
            fmSearchInput.focus();
            fmSearchInput.select();
        }

        function closeModal() { overlay.classList.remove('open'); }

        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
        closeBtn.addEventListener('click', closeModal);

        document.addEventListener('keydown', e => {
            if (overlay.classList.contains('open')) {
                if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
            } else {
                const tag = document.activeElement ? document.activeElement.tagName : '';
                if ((e.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(tag)) ||
                    (e.key === 'k' && (e.ctrlKey || e.metaKey))) {
                    e.preventDefault();
                    openModal();
                }
            }
        });

        let debounceTimer;
        fmSearchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(updateAndRenderSearch, 120);
        });

        if (!document.getElementById('searchBtn')) {
            const viewControls = getToolbar();
            if (viewControls) {
                const btn = document.createElement('button');
                btn.id = 'searchBtn';
                btn.type = 'button';
                btn.title = 'Search all pages (/ or Ctrl+K)';
                btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>`;
                btn.addEventListener('click', openModal);
                viewControls.prepend(btn);
            }
        }
    }

    // =========================================
    // ── AUTO "LOAD ALL PAGES" ──────────────────
    // =========================================

    // The site has its own "Load all pages" button. We click it ourselves,
    // then poll until the site removes it (which it does as its last step),
    // so this also fires if the person clicks it manually. No function
    // patching is needed, so it doesn't matter when the site bound its
    // click handler.
    function setupAutoLoadAll() {
        if (window.__fmAutoLoadAllSetup) return;
        window.__fmAutoLoadAllSetup = true;

        const btn = document.getElementById('loadAllPagesBtn');
        if (!btn) {
            // Single page folder (or nothing to load) — finish immediately.
            onFolderFullyLoaded();
            return;
        }

        const started = Date.now();
        const timer = setInterval(() => {
            if (!document.getElementById('loadAllPagesBtn')) {
                clearInterval(timer);
                onFolderFullyLoaded();
            } else if (Date.now() - started > 10 * 60 * 1000) {
                clearInterval(timer);
            }
        }, 300);

        if (!btn.disabled) {
            btn.click();
            // Safety net in case the click handler wasn't attached.
            setTimeout(() => {
                const b = document.getElementById('loadAllPagesBtn');
                if (b && !b.disabled && typeof W.loadAllFolderPages === 'function') {
                    W.loadAllFolderPages();
                }
            }, 500);
        }
    }

    // Runs once every page of the folder is in the DOM.
    function onFolderFullyLoaded() {
        convertItems();
        injectDateCells();
        document.querySelectorAll('.file-preview img').forEach(attachHoverZoom);

        rebuildSearchIndex();
        refreshOpenSearchResults();

        restoreSavedView();
        setupSearch();
        setupTableView();
        setupChangelogButton();
    }

    // =========================================
    // ── CHANGELOG / "WHAT'S NEW" POPUP ─────────
    // =========================================

    const CHANGELOG_HISTORY_DEPTH = 3; // versions shown in the manual view
    let changelogCache = null;

    function fetchChangelogText() {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('GM_xmlhttpRequest unavailable'));
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url: CHANGELOG_URL + '?t=' + Date.now(),
                timeout: 10000,
                onload: r => (r.status >= 200 && r.status < 300)
                    ? resolve(r.responseText)
                    : reject(new Error('HTTP ' + r.status)),
                onerror: () => reject(new Error('Network error')),
                ontimeout: () => reject(new Error('Timed out')),
            });
        });
    }

    function fetchChangelog() {
        if (changelogCache) return Promise.resolve(changelogCache);
        return fetchChangelogText().then(md => {
            changelogCache = parseChangelog(md);
            return changelogCache;
        });
    }

    function findChangelogIndexForVersion(entries, version) {
        return entries.findIndex(e => e.version === version);
    }

    function parseChangelog(md) {
        const entries = [];
        let cur = null;
        String(md).split(/\r?\n/).forEach(line => {
            const h = line.match(/^##\s+v?(\d+(?:\.\d+)*)\s*(?:[—–-]+\s*(\d{4}-\d{2}-\d{2}))?\s*$/);
            if (h) {
                cur = { version: h[1], date: h[2] || '', changes: [] };
                entries.push(cur);
                return;
            }
            const b = line.match(/^\s*[-*]\s+(.*\S)\s*$/);
            if (b && cur) cur.changes.push(b[1]);
        });
        return entries.filter(e => e.changes.length);
    }

    function renderChangelogBody(entries, opts) {
        opts = opts || {};
        let html = '';
        if (opts.updateAvailableVersion) {
            html += `<div class="fm-cl-update-banner">🔔 A newer version (v${escHtml(opts.updateAvailableVersion)}) is available on GitHub — you're currently on v${escHtml(SCRIPT_VERSION)}.</div>`;
        }
        html += entries.map(entry => {
            const items = entry.changes.map(c => `<li>${escHtml(c)}</li>`).join('');
            const label = `v${escHtml(entry.version)}` + (entry.date ? ` · ${escHtml(entry.date)}` : '');
            return `
                <div class="fm-cl-version-block">
                    <span class="fm-cl-version-label">${label}</span>
                    <ul class="fm-cl-changes">${items}</ul>
                </div>`;
        }).join('');
        if (opts.hasMore) {
            html += `<div class="fm-cl-more">Showing the ${entries.length} most recent versions — <a href="${CHANGELOG_PAGE_URL}" target="_blank" rel="noopener noreferrer">see full version history on GitHub</a>.</div>`;
        }
        return html;
    }

    function changelogMessageHtml(msg) {
        return `<div class="fm-cl-version-block"><ul class="fm-cl-changes"><li>${escHtml(msg)}</li></ul></div>`;
    }

    // bodyHtml may be replaced later (manual open shows "Loading…" first).
    function buildChangelogModal(bodyHtml, mode) {
        document.getElementById('fm-changelog-backdrop')?.remove();

        const subtitle = mode === 'auto'
            ? `Updated to v${escHtml(SCRIPT_VERSION)}`
            : `v${escHtml(SCRIPT_VERSION)} · by ${escHtml('edstagdh')}`;
        const heading = mode === 'auto' ? "What's New" : SCRIPT_NAME;

        const backdrop = document.createElement('div');
        backdrop.id = 'fm-changelog-backdrop';
        backdrop.innerHTML = `
            <div id="fm-changelog-modal" role="dialog" aria-modal="true" aria-label="Changelog">
                <div id="fm-cl-header">
                    <div>
                        <h2>${escHtml(heading)}</h2>
                        <div id="fm-cl-subtitle">${subtitle}</div>
                    </div>
                    <button id="fm-cl-close" title="Close (Esc)">✕</button>
                </div>
                <div id="fm-cl-body">${bodyHtml}</div>
                <div id="fm-cl-footer">
                    <a class="fm-cl-link" href="${CHANGELOG_PAGE_URL}" target="_blank" rel="noopener noreferrer">
                        🔗 Full changelog on GitHub
                    </a>
                    <a class="fm-cl-link" href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer">
                        Script source
                    </a>
                    <button id="fm-cl-ok">OK, got it</button>
                </div>
            </div>`;
        document.body.appendChild(backdrop);

        function close() {
            backdrop.classList.remove('open');
            // Only the automatic popup counts as "seen" for the version gate.
            if (mode === 'auto') saveLastSeenVersion(SCRIPT_VERSION);
            backdrop.remove();
            document.removeEventListener('keydown', onKeydown);
        }
        function onKeydown(e) { if (e.key === 'Escape') close(); }

        backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
        document.getElementById('fm-cl-close').addEventListener('click', close);
        document.getElementById('fm-cl-ok').addEventListener('click', close);
        document.addEventListener('keydown', onKeydown);

        backdrop.classList.add('open');
    }

    // Manual open (menu command / ℹ button): starts at the installed version
    // and shows the CHANGELOG_HISTORY_DEPTH most recent entries from there,
    // with a banner if the file lists a newer version than the one installed.
    function openChangelogModal() {
        buildChangelogModal(changelogMessageHtml('Loading changelog…'), 'manual');
        fetchChangelog()
            .then(entries => {
                const body = document.getElementById('fm-cl-body');
                if (!body) return;
                if (!entries.length) {
                    body.innerHTML = changelogMessageHtml('No changelog entries found.');
                    return;
                }
                const currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
                const updateAvailableVersion = currentIdx > 0 ? entries[0].version : null;
                const startIdx = currentIdx === -1 ? 0 : currentIdx;
                const toShow = entries.slice(startIdx, startIdx + CHANGELOG_HISTORY_DEPTH);
                const hasMore = entries.length > startIdx + CHANGELOG_HISTORY_DEPTH;
                body.innerHTML = renderChangelogBody(toShow, { updateAvailableVersion, hasMore });
            })
            .catch(err => {
                const body = document.getElementById('fm-cl-body');
                if (body) body.innerHTML = changelogMessageHtml(
                    `Couldn't load the changelog (${err.message}). Check the GitHub repo directly for the latest version history.`);
            });
    }

    // Automatic popup: once per version bump, showing only what's new since
    // the version last seen. If the fetch fails nothing is shown and the
    // version is NOT marked as seen, so it simply retries on the next load.
    function checkVersionAndShowChangelog() {
        const lastSeen = loadLastSeenVersion();
        if (lastSeen === SCRIPT_VERSION) return;

        fetchChangelog()
            .then(entries => {
                if (!entries.length) return;

                const currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
                const available = currentIdx === -1 ? entries : entries.slice(currentIdx);
                if (!available.length) return;

                let toShow = [];
                if (!lastSeen) {
                    toShow = [available[0]];
                } else {
                    for (const entry of available) {
                        if (entry.version === lastSeen) break;
                        toShow.push(entry);
                    }
                    if (!toShow.length) toShow = [available[0]];
                }
                const updateAvailableVersion = currentIdx > 0 ? entries[0].version : null;
                buildChangelogModal(renderChangelogBody(toShow, { updateAvailableVersion }), 'auto');
            })
            .catch(() => {});
    }

    function setupChangelogButton() {
        if (document.getElementById('fm-changelog-btn')) return;

        // Right-hand header group (holds the Login / Register button).
        const navTarget = document.querySelector('header .flex.items-center.gap-1')
            || document.querySelector('header nav .flex')
            || document.querySelector('header nav')
            || document.querySelector('header');
        if (!navTarget) return;

        const btn = document.createElement('button');
        btn.id = 'fm-changelog-btn';
        btn.type = 'button';
        btn.title = `About & changelog (v${SCRIPT_VERSION})`;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="11"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>`;
        btn.addEventListener('click', openChangelogModal);

        navTarget.prepend(btn);
    }

    // =========================================
    // Main
    // =========================================
    function run() {
        convertItems();
        injectDateCells();
        document.querySelectorAll('.file-preview img').forEach(attachHoverZoom);
    }

    let runDebounceTimer = null;
    function scheduleRun() {
        clearTimeout(runDebounceTimer);
        runDebounceTimer = setTimeout(run, 50);
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('📋 Show Changelog', () => onReady(openChangelogModal));
    }

    onReady(function () {
        createPopup();
        run();
        patchSiteHelpers();

        setupSearch();
        setupTableView();
        setupChangelogButton();
        checkVersionAndShowChangelog();

        new MutationObserver(scheduleRun).observe(document.body, { childList: true, subtree: true });

        // Deferred to a fresh task so it runs *after* the site's own
        // DOMContentLoaded handlers (which build its file list, restore its
        // own saved view, and bind the "Load all pages" button).
        setTimeout(() => {
            patchSiteHelpers();
            restoreSavedView();
            initDone = true;
            setupAutoLoadAll();
        }, 0);
    });
})();