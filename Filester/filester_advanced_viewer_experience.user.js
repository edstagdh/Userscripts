// ==UserScript==
// @name         [Filester] Advanced Viewer Experience
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  This script provides better experience viewing filster folders, using real anchor links, large previews, hover zoom, table view, persistent sort & view, cross-page search.
// @match        https://filester.me/f/*
// @match        https://filester.sh/f/*
// @match        https://filester.si/f/*
// @match        https://filester.gg/f/*
// @author       edstagdh
// @icon         https://www.google.com/s2/favicons?sz=64&domain=filester.me
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/Filester/filester_advanced_viewer_experience.user.js
// @installURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/Filester/filester_advanced_viewer_experience.user.js
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==
(function () {
    'use strict';

    // =========================================
    // Persistence helpers
    // =========================================
    const LS_VIEW = 'filester_view_mode';
    const LS_SORT = 'filester_sort';

    const LS_SEARCH_VIEW = 'filester_search_view';
    const LS_SEARCH_SORT = 'filester_search_sort';

    function saveSearchView(mode) { try { localStorage.setItem(LS_SEARCH_VIEW, mode); } catch (_) {} }
    function loadSearchView()     { try { return localStorage.getItem(LS_SEARCH_VIEW) || 'list'; } catch (_) { return 'list'; } }
    function saveSearchSort(mode) { try { localStorage.setItem(LS_SEARCH_SORT, mode); } catch (_) {} }
    function loadSearchSort()     { try { return localStorage.getItem(LS_SEARCH_SORT) || 'name_asc'; } catch (_) { return 'name_asc'; } }

    function saveView(mode) { try { localStorage.setItem(LS_VIEW, mode); } catch (_) {} }
    function loadView()     { try { return localStorage.getItem(LS_VIEW); } catch (_) { return null; } }
    function saveSort(val)  { try { localStorage.setItem(LS_SORT, val); } catch (_) {} }
    function loadSort()     { try { return localStorage.getItem(LS_SORT); } catch (_) { return null; } }

    // =========================================
    // Folder identity (used as sessionStorage key)
    // =========================================
    const FOLDER_KEY = 'fmsearch_' + location.pathname.replace(/\/$/, '');

    // =========================================
    // Script identity / version tracking
    // =========================================
    const SCRIPT_NAME    = '[Filester] Advanced Viewer Experience';
    const SCRIPT_VERSION = '1.0';
    const GITHUB_REPO_URL = 'https://github.com/edstagdh/Userscripts/tree/master/Filester/filester_advanced_viewer_experience.user.js';

    // Entries are newest-first. Add a new entry here with every release.
    const VERSION_HISTORY = [
        {
            version: '1.0',
            changes: [
                'Introduced version tracking: a "What\'s New" popup now appears automatically after an update.',
                'Added a changelog button (ℹ) in the site\'s header nav with script info and a link to the GitHub repo.',
                'Search is now the leftmost button in the toolbar, ahead of the grid/list/table-view buttons.',
                'Hardened table view toggling when the page\'s own setViewMode() isn\'t available yet.',
                'Wrapped all localStorage reads/writes in try/catch so the script keeps working if storage is blocked.',
                'Added a page-count safety cap to the cross-page search crawler.',
                'Grid view now shows each file\'s date underneath its name, reusing the same data-date attribute the table view already relies on.',
            ],
        },
    ];

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
        .related-file-name {
            overflow: visible !important;
            white-space: break-spaces !important;
        }
        .container { max-width: 1800px !important; }

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
            margin-top: 3px;
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

        /* ── View toggle buttons (shared style) ── */
        #tableViewBtn, #searchBtn, #fm-changelog-btn {
            padding: 0.5rem;
            border-radius: 0.375rem;
            border: 1px solid var(--border-color, #333);
            background: transparent;
            color: #888;
            cursor: pointer;
        }
        #tableViewBtn.active {
            background: var(--card-bg, #1a1a1a) !important;
            color: #fff !important;
        }
        #searchBtn:hover { color: #fff; }
        #fm-changelog-btn:hover { color: #fff; }

        /* ── Table view: container ── */
        .files-list.table-view {
            display: block !important;
            border: 1px solid #2a2a2a !important;
            border-radius: 8px !important;
            overflow: hidden !important;
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
            color: #666 !important; white-space: nowrap !important;
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

        /* Header bar */
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

        /* Status bar */
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
        .fm-crawl-bar {
            flex: 1;
            height: 2px;
            background: #222;
            border-radius: 2px;
            overflow: hidden;
        }
        .fm-crawl-fill {
            height: 100%;
            background: #7c6af7;
            border-radius: 2px;
            transition: width 0.2s;
        }

        /* Results list */
        #fm-search-results {
            overflow-y: auto;
            flex: 1;
        }
        #fm-search-results::-webkit-scrollbar { width: 6px; }
        #fm-search-results::-webkit-scrollbar-track { background: transparent; }
        #fm-search-results::-webkit-scrollbar-thumb { background: #2e2e2e; border-radius: 3px; }

        /* Global Result Base Styling */
        .fm-result-item {
            display: grid;
            grid-template-columns: 100px 1fr auto;
            align-items: center;
            gap: 0;
            border-bottom: 1px solid #1c1c1c;
            text-decoration: none;
            color: inherit;
            transition: background 0.1s;
            min-height: 58px;
        }
        .fm-result-item:last-child { border-bottom: none; }
        .fm-result-item:hover { background: rgba(255,255,255,0.04); }

        .fm-result-thumb {
            width: 100px;
            height: 56px;
            overflow: hidden;
            background: #0d0d0d;
            flex-shrink: 0;
        }
        .fm-result-thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
        .fm-result-thumb-placeholder {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.4rem;
            color: #333;
        }

        .fm-result-info {
            padding: 0 14px;
            min-width: 0;
        }
        .fm-result-name {
            font-size: 0.88rem;
            color: #ddd;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.35;
        }
        .fm-result-name mark {
            background: none;
            color: #a99af8;
            font-weight: 600;
        }
        .fm-result-meta {
            font-size: 0.75rem;
            color: #555;
            margin-top: 3px;
            display: flex;
            gap: 10px;
        }
        .fm-result-meta span { white-space: nowrap; }
        .fm-result-page-badge {
            font-size: 0.65rem;
            background: #222;
            color: #666;
            border-radius: 4px;
            padding: 1px 5px;
            border: 1px solid #2a2a2a;
            white-space: nowrap;
        }

        .fm-result-actions {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            padding: 0 14px;
            flex-shrink: 0;
        }
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

        /* Empty / no-results */
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

        /* SVG Icon styling for View toggles */
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
        /* Card outer — div, not <a>, so display:flex is never overridden by page CSS */
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
        /* Full-cover invisible link sits behind content */
        .fmg-cover { position: absolute; inset: 0; z-index: 0; display: block; }
        /* Thumbnail */
        .fmg-thumb {
            position: relative; z-index: 1;
            width: 100%; height: 160px; flex-shrink: 0;
            min-height: 160px !important;
            background: #080808; overflow: hidden;
            display: flex; align-items: center; justify-content: center;
        }
        .fmg-thumb img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center; }
        .fmg-thumb-placeholder { font-size: 2rem; color: #2a2a2a; }
        /* Info */
        .fmg-info {
            position: relative; z-index: 1;
            display: flex; flex-direction: column; gap: 5px;
            padding: 10px 12px 12px; flex: 0 0 auto; min-width: 0;
        }
        .fmg-name { font-size: 0.83rem; color: #ddd; line-height: 1.4; overflow: hidden; max-height: 2.8em; word-break: break-word; }
        .fmg-name mark { background: none; color: #a99af8; font-weight: 600; }
        .fmg-meta { display: flex; flex-wrap: wrap; gap: 6px; font-size: 0.7rem; color: #555; margin-top: auto; padding-top: 4px; }
        .fmg-meta span { white-space: nowrap; }
        /* Download — above cover link */
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
            grid-template-columns: 82px 1fr 90px 110px 60px 50px;
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
        #fm-cl-ok:hover { background: #352c66; color: #e5dfff; border-color: #6a5cc4; }
    `;
    document.head.appendChild(style);

    // =========================================
    // Hover zoom popup
    // =========================================
    const popup = document.createElement('img');
    popup.id = 'fm-zoom-popup';
    document.body.appendChild(popup);
    const PAD = 16;

    function positionPopup(e) {
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
            popup.src = img.src;
            popup.style.display = 'block';
            positionPopup(e);
            popup.onload = () => positionPopup(e);
        });
        img.addEventListener('mousemove', positionPopup);
        img.addEventListener('mouseleave', () => popup.style.display = 'none');
    }

    // =========================================
    // Convert .file-item divs → real <a> links
    // =========================================
    function convertItems() {
        document.querySelectorAll('.file-item:not([data-linkified])').forEach(item => {
            const onclick = item.getAttribute('onclick');
            if (!onclick) return;
            const match = onclick.match(/href='([^']+)'/);
            if (!match) return;
            item.removeAttribute('onclick');
            item.dataset.linkified = 'true';
            const link = document.createElement('a');
            link.href = match[1];
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'file-item-link';
            const dlBtn = item.querySelector('.download-btn');
            while (item.firstChild && item.firstChild !== dlBtn) link.appendChild(item.firstChild);
            if (dlBtn) item.insertBefore(link, dlBtn); else item.appendChild(link);
        });
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

    function injectDateCells() {
        document.querySelectorAll('#filesGrid .file-item-link').forEach(link => {
            if (link.querySelector('.file-date')) return;
            const item = link.closest('.file-item');
            const el = document.createElement('div');
            el.className = 'file-date';
            try {
                const d = new Date(item?.dataset.date || '');
                el.textContent = isNaN(d.getTime()) ? '' : d.toLocaleDateString();
            } catch (_) { el.textContent = ''; }
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
            if (b) { b.style.background = 'transparent'; b.style.color = '#888'; }
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

    function setupTableView() {
        if (!document.getElementById('tableViewBtn')) {
            const viewControls = document.querySelector('.view-controls');
            if (viewControls) {
                const btn = document.createElement('button');
                btn.id = 'tableViewBtn';
                btn.title = 'Table view';
                btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 3h18v2H3V3zm0 4h18v2H3V7zm0 4h18v2H3v-2zm0 4h18v2H3v-2zm0 4h18v2H3v-2z"/>
                </svg>`;
                btn.addEventListener('click', () => {
                    if (tableActive) {
                        deactivateTableView();
                        if (typeof window.setViewMode === 'function') window.setViewMode('grid');
                        else {
                            // Fallback: the page's own setViewMode() wasn't found
                            // (e.g. it hadn't loaded yet) — restore grid layout
                            // ourselves so the view isn't left class-less.
                            const grid = document.getElementById('filesGrid');
                            if (grid) grid.classList.add('grid-view');
                            saveView('grid');
                        }
                    } else {
                        activateTableView();
                    }
                });
                // Sits right after the site's native list-view button.
                // (Search is pinned as the absolute leftmost button separately
                // in setupSearch(), so it doesn't need to be considered here.)
                const listBtn = document.getElementById('listViewBtn');
                if (listBtn) listBtn.after(btn); else viewControls.appendChild(btn);
            }
        }

        if (typeof window.setViewMode === 'function' && !window.setViewMode._fmPatched) {
            const orig = window.setViewMode;
            window.setViewMode = function (mode) {
                deactivateTableView();
                orig.call(window, mode);
                saveView(mode);
            };
            window.setViewMode._fmPatched = true;
        }

        if (typeof window.applyFilters === 'function' && !window.applyFilters._fmPatched) {
            const orig = window.applyFilters;
            window.applyFilters = function () {
                orig.call(window);
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
            window.applyFilters._fmPatched = true;
        }

        const sortSel = document.getElementById('sortSelect');
        if (sortSel && !sortSel.dataset.fmPersist) {
            sortSel.dataset.fmPersist = '1';
            sortSel.addEventListener('change', () => {
                saveSort(sortSel.value);
                if (tableActive) updateSortIndicators();
            });
        }

        const savedSort = loadSort();
        if (savedSort && sortSel && sortSel.value !== savedSort) {
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

    // =========================================
    // ── SEARCH SYSTEM ──────────────────────────
    // =========================================

    let searchIndex = null;
    let crawlState  = { done: false, total: 0, loaded: 0 };

    function loadIndexFromSession() {
        try {
            const raw = sessionStorage.getItem(FOLDER_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (_) { return null; }
    }

    function saveIndexToSession(files) {
        try { sessionStorage.setItem(FOLDER_KEY, JSON.stringify(files)); } catch (_) {}
    }

    // Utility to map size strings like '1.2 MB' to bytes for accurate sorting
    function parseSizeToBytes(sizeStr) {
        if (!sizeStr) return 0;
        const units = { 'b': 1, 'kb': 1024, 'mb': 1048576, 'gb': 1073741824, 'tb': 1099511627776 };
        const match = sizeStr.toLowerCase().match(/([\d.]+)\s*([a-z]+)/);
        if (!match) return 0;
        return parseFloat(match[1]) * (units[match[2]] || 1);
    }

    function parsePageFiles(html, pageNum) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const files = [];
        doc.querySelectorAll('.file-item').forEach(item => {
            const onclick = item.getAttribute('onclick') || '';
            const hrefMatch = onclick.match(/href='([^']+)'/);
            if (!hrefMatch) return;
            const href = hrefMatch[1];

            const dlA = item.querySelector('.download-btn[href], a[download]');
            const dlHref = dlA?.href || href;

            const nameEl = item.querySelector('.file-name');
            const name   = nameEl?.textContent.trim() || '';

            const metaEl = item.querySelector('.file-meta, .file-size');
            const size   = metaEl?.textContent.trim() || '';
            const sizeRaw = parseSizeToBytes(size);

            const dateRaw = item.dataset.date || '';
            let dateStr = '';
            let timestamp = 0;
            try {
                const d = new Date(dateRaw);
                timestamp = d.getTime() || 0;
                dateStr = isNaN(timestamp) ? '' : d.toLocaleDateString();
            } catch (_) {}

            const imgEl = item.querySelector('.file-preview img');
            const thumb = imgEl?.src || imgEl?.dataset.src || '';

            files.push({ href, dlHref, name, size, sizeRaw, dateStr, timestamp, thumb, page: pageNum });
        });
        return files;
    }

    function pageUrl(n) {
        const base = location.href.replace(/[?&]page=\d+/, '');
        const sep  = base.includes('?') ? '&' : '?';
        return n === 1 ? base : `${base}${sep}page=${n}`;
    }

    async function buildIndex(onProgress) {
        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        crawlState = { done: false, total: '?', loaded: 0 };
        onProgress(crawlState);

        const allFiles = [];
        const seenUrls = new Set();
        let page = 1;
        let consecutiveEmptyPages = 0;
        const MAX_PAGES = 2000; // safety cap against a runaway crawl

        while (page <= MAX_PAGES) {
            try {
                const response = await fetch(pageUrl(page), {
                    credentials: 'same-origin',
                    cache: 'no-store'
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const html = await response.text();
                const files = parsePageFiles(html, page);

                const newFiles = files.filter(file => {
                    const key = file.href;
                    if (seenUrls.has(key)) return false;
                    seenUrls.add(key);
                    return true;
                });

                if (newFiles.length === 0) {
                    consecutiveEmptyPages++;
                    if (consecutiveEmptyPages >= 2) break;
                } else {
                    consecutiveEmptyPages = 0;
                    allFiles.push(...newFiles);
                }
            } catch (err) {
                consecutiveEmptyPages++;
                if (consecutiveEmptyPages >= 2) break;
            }

            crawlState.loaded = page;
            onProgress({ ...crawlState });
            page++;
            await sleep(500);
        }

        crawlState.done = true;
        crawlState.total = page - 1;
        saveIndexToSession(allFiles);
        return allFiles;
    }

    function highlight(text, query) {
        if (!query) return escHtml(text);
        const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escHtml(text).replace(new RegExp(esc, 'gi'), m => `<mark>${m}</mark>`);
    }

    function escHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // --- Sort files logic ---
    function sortFiles(files, mode) {
        return [...files].sort((a, b) => {
            switch (mode) {
                case 'name_asc':  return a.name.localeCompare(b.name);
                case 'name_desc': return b.name.localeCompare(a.name);
                    // Fallback parses inline if data is old/cached from previous script version
                case 'size_desc': return (b.sizeRaw ?? parseSizeToBytes(b.size)) - (a.sizeRaw ?? parseSizeToBytes(a.size));
                case 'size_asc':  return (a.sizeRaw ?? parseSizeToBytes(a.size)) - (b.sizeRaw ?? parseSizeToBytes(b.size));
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

    function renderResults(files, query, container, currentView) {
        container.innerHTML = '';

        // ── Empty state ───────────────────────────────────────────────────
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

        if (currentView === 'grid') {
            // ── GRID ─────────────────────────────────────────────────────
            // Outer wrapper is a <div> (not <a>) so the page's a{display:inline}
            // rules can never interfere. A full-cover <a> sits inside it.
            files.forEach(f => {
                // Card shell — plain div, so display:flex is unchallengeable
                const card = document.createElement('div');
                card.className = 'fmg-card';

                // Full-cover link (sits under all other content via z-index)
                const coverLink = document.createElement('a');
                coverLink.href = f.href;
                coverLink.target = '_blank';
                coverLink.rel = 'noopener noreferrer';
                coverLink.className = 'fmg-cover';
                card.appendChild(coverLink);

                // Thumbnail
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

                // Info section
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
                const badge = document.createElement('span');
                badge.className = 'fm-result-page-badge';
                badge.textContent = `p.${f.page}`;
                meta.appendChild(badge);
                info.appendChild(meta);
                card.appendChild(info);

                // Download button — above the cover link
                const dlA = document.createElement('a');
                dlA.className = 'fmg-dl';
                dlA.href = f.dlHref;
                dlA.target = '_blank';
                dlA.rel = 'noopener noreferrer';
                dlA.title = 'Download';
                dlA.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>`;
                card.appendChild(dlA);

                container.appendChild(card);
            });

        } else {
            // ── TABLE ─────────────────────────────────────────────────────
            // Sticky header
            const header = document.createElement('div');
            header.className = 'fm-table-header';
            header.style.cssText = 'display:grid;grid-template-columns:82px 1fr 90px 110px 60px 50px;';
            ['', 'Name', 'Size', 'Date', 'Page', ''].forEach(label => {
                const th = document.createElement('div');
                th.className = 'fm-th';
                th.textContent = label;
                header.appendChild(th);
            });
            container.appendChild(header);

            files.forEach(f => {
                const row = document.createElement('a');
                row.className = 'fmr-row';
                row.href = f.href;
                row.target = '_blank';
                row.rel = 'noopener noreferrer';

                // Thumb
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

                // Name
                const nameDiv = document.createElement('div');
                nameDiv.className = 'fmr-name';
                nameDiv.innerHTML = highlight(f.name, query);
                row.appendChild(nameDiv);

                // Size
                const sizeDiv = document.createElement('div');
                sizeDiv.className = 'fmr-cell';
                sizeDiv.textContent = f.size || '—';
                row.appendChild(sizeDiv);

                // Date
                const dateDiv = document.createElement('div');
                dateDiv.className = 'fmr-cell';
                dateDiv.textContent = f.dateStr || '—';
                row.appendChild(dateDiv);

                // Page
                const pageDiv = document.createElement('div');
                pageDiv.className = 'fmr-cell';
                const badge = document.createElement('span');
                badge.className = 'fm-result-page-badge';
                badge.textContent = `p.${f.page}`;
                pageDiv.appendChild(badge);
                row.appendChild(pageDiv);

                // Download
                const dlWrap = document.createElement('div');
                dlWrap.className = 'fmr-dl-cell';
                const dlA = document.createElement('a');
                dlA.className = 'fm-result-dl';
                dlA.href = f.dlHref;
                dlA.target = '_blank';
                dlA.rel = 'noopener noreferrer';
                dlA.title = 'Download';
                dlA.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>`;
                dlA.addEventListener('click', e => e.stopPropagation());
                dlWrap.appendChild(dlA);
                row.appendChild(dlWrap);

                container.appendChild(row);
            });
        }
    }
    // --- Build and wire up the search modal ---
    function setupSearch() {

        let searchView = loadSearchView();

        if (document.getElementById('fm-search-overlay')) return;

        // ── Overlay / modal DOM ──────────────────────────────────────────
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
                    <input id="fm-search-input" type="text" placeholder="Search all pages…" autocomplete="off" spellcheck="false">
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

        const input      = document.getElementById('fm-search-input');
        const sortSelect = document.getElementById('fm-search-sort');
        const status     = document.getElementById('fm-search-status');
        const results    = document.getElementById('fm-search-results');
        const closeBtn   = document.getElementById('fm-search-close');

        // Initialize sort dropdown
        sortSelect.value = loadSearchSort();

        // Core render function that applies filter -> sort -> render
        function updateAndRender() {
            if (!searchIndex) return;
            const q = input.value;
            const filtered = filterIndex(searchIndex, q);
            const sorted = sortFiles(filtered, sortSelect.value);
            setStatus(`${sorted.length} of ${searchIndex.length} files`);
            renderResults(sorted, q, results, searchView);
        }

        function applySearchView() {
            results.classList.remove('fm-search-grid', 'fm-search-table');
            results.classList.add(`fm-search-${searchView}`);
            document.querySelectorAll('.fm-search-view-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.view === searchView);
            });
            updateAndRender();
        }

        document.getElementById('fm-search-view-controls').addEventListener('click', e => {
            const btn = e.target.closest('.fm-search-view-btn');
            if (!btn) return;
            searchView = btn.dataset.view;
            saveSearchView(searchView);
            applySearchView();
        });

        sortSelect.addEventListener('change', () => {
            saveSearchSort(sortSelect.value);
            updateAndRender();
        });

        applySearchView();

        function setStatus(text, progress) {
            if (progress !== undefined) {
                status.innerHTML = `<span>${escHtml(text)}</span>
                    <div class="fm-crawl-bar"><div class="fm-crawl-fill" style="width:${progress}%"></div></div>`;
            } else {
                status.textContent = text;
            }
        }

        function openModal() {
            overlay.classList.add('open');
            input.focus();
            input.select();
            startCrawlIfNeeded();
        }

        function closeModal() { overlay.classList.remove('open'); }

        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
        closeBtn.addEventListener('click', closeModal);

        document.addEventListener('keydown', e => {
            if (overlay.classList.contains('open')) {
                if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
            } else {
                if ((e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) ||
                    (e.key === 'k' && (e.ctrlKey || e.metaKey))) {
                    e.preventDefault();
                    openModal();
                }
            }
        });

        let debounceTimer;
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(updateAndRender, 120);
        });

        let crawlPromise = null;

        function startCrawlIfNeeded() {
            if (searchIndex) {
                setStatus(`${searchIndex.length} files indexed — ready`);
                if (input.value) updateAndRender();
                return;
            }

            const cached = loadIndexFromSession();
            if (cached && cached.length) {
                searchIndex = cached;
                setStatus(`${searchIndex.length} files indexed (cached)`);
                if (input.value) updateAndRender();
                return;
            }

            if (crawlPromise) return;

            setStatus('Scanning pages…', 0);
            results.innerHTML = '';

            crawlPromise = buildIndex(state => {
                const pct = state.total && state.total !== '?' ? Math.round((state.loaded / state.total) * 100) : 0;
                setStatus(`Scanning page ${state.loaded}…`, pct);

                const partial = loadIndexFromSession() || [];
                if (input.value) {
                    const filtered = filterIndex(partial, input.value);
                    const sorted = sortFiles(filtered, sortSelect.value);
                    renderResults(sorted, input.value, results, searchView);
                }
            }).then(files => {
                searchIndex = files;
                setStatus(`${files.length} files indexed across ${crawlState.total} pages`);
                if (input.value) updateAndRender();
            });
        }

        if (!document.getElementById('searchBtn')) {
            const viewControls = document.querySelector('.view-controls');
            if (viewControls) {
                const btn = document.createElement('button');
                btn.id = 'searchBtn';
                btn.title = 'Search all pages (/ or Ctrl+K)';
                btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>`;
                btn.addEventListener('click', openModal);
                // Search is the most-left button in the whole toolbar,
                // ahead of the site's own grid/list buttons too.
                viewControls.prepend(btn);
            }
        }

        startCrawlIfNeeded();
    }

    // =========================================
    // ── CHANGELOG / "WHAT'S NEW" POPUP ─────────
    // =========================================

    function buildChangelogModal(versionsToShow, mode) {
        if (document.getElementById('fm-changelog-backdrop')) {
            document.getElementById('fm-changelog-backdrop').remove();
        }

        const blocksHtml = versionsToShow.map(entry => {
            const items = entry.changes.map(c => `<li>${escHtml(c)}</li>`).join('');
            return `
                <div class="fm-cl-version-block">
                    <span class="fm-cl-version-label">v${escHtml(entry.version)}</span>
                    <ul class="fm-cl-changes">${items}</ul>
                </div>`;
        }).join('');

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
                <div id="fm-cl-body">${blocksHtml}</div>
                <div id="fm-cl-footer">
                    <a class="fm-cl-link" href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer">
                        🔗 View on GitHub
                    </a>
                    <button id="fm-cl-ok">OK, got it</button>
                </div>
            </div>`;
        document.body.appendChild(backdrop);

        function close() {
            backdrop.classList.remove('open');
            saveLastSeenVersion(SCRIPT_VERSION);
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

    function openChangelogModal() {
        buildChangelogModal(VERSION_HISTORY, 'manual');
    }

    // Shows a popup with only the entries newer than what the user has
    // already seen. On first install, only the current version is shown.
    function checkVersionAndShowChangelog() {
        const lastSeen = loadLastSeenVersion();
        if (lastSeen === SCRIPT_VERSION) return;

        let toShow = [];
        if (!lastSeen) {
            toShow = [VERSION_HISTORY[0]];
        } else {
            for (const entry of VERSION_HISTORY) {
                if (entry.version === lastSeen) break;
                toShow.push(entry);
            }
            if (!toShow.length) toShow = [VERSION_HISTORY[0]];
        }

        buildChangelogModal(toShow, 'auto');
    }

    function setupChangelogButton() {
        if (document.getElementById('fm-changelog-btn')) return;

        // Lives in the site's own header <nav> (next to [Home] [FAQ] etc.),
        // not in the file-listing toolbar — only its visual style matches
        // the toolbar buttons (#tableViewBtn / #searchBtn).
        const navTarget = document.querySelector('header nav .flex')
            || document.querySelector('header nav > div')
            || document.querySelector('nav .flex')
            || document.querySelector('nav');
        if (!navTarget) return;

        const btn = document.createElement('button');
        btn.id = 'fm-changelog-btn';
        btn.title = `About & changelog (v${SCRIPT_VERSION})`;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="11"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>`;
        btn.addEventListener('click', openChangelogModal);

        navTarget.appendChild(btn);
    }

    // =========================================
    // Main
    // =========================================
    function run() {
        convertItems();
        injectDateCells();
        document.querySelectorAll('.file-preview img').forEach(attachHoverZoom);
    }

    run();

    function initControls() {
        setupSearch();
        setupTableView();
        setupChangelogButton();
        checkVersionAndShowChangelog();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initControls);
    } else {
        initControls();
    }

    // Debounced so rapid/bulk DOM mutations (e.g. re-rendering search
    // results) coalesce into a single run() instead of firing repeatedly.
    let runDebounceTimer = null;
    function scheduleRun() {
        clearTimeout(runDebounceTimer);
        runDebounceTimer = setTimeout(run, 50);
    }
    const observer = new MutationObserver(scheduleRun);
    observer.observe(document.body, { childList: true, subtree: true });
})();