// ==UserScript==
// @name         [Pixeldrain] Gallery View
// @namespace    https://github.com/edstagdh
// @version      1.2
// @description  Adds a toggleable grid/table gallery view with modal lightbox and hover previews to pixeldrain list/album pages, launched from the sidebar.
// @author       edstagdh
// @match        https://pixeldrain.com/l/*
// @match        https://pixeldrain.net/l/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pixeldrain.com
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/PD/pd_album_gallery_view.user.js
// @installURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/PD/pd_album_gallery_view.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_info
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_VERSION = (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script.version : '1.1';
    const LIST_ID = location.pathname.split('/').filter(Boolean).pop();
    const API_BASE = 'https://pixeldrain.com/api';
    const STORAGE_KEY_ACTIVE = 'pdg_view_active';
    const STORAGE_KEY_MODE = 'pdg_view_mode'; // 'grid' | 'table'
    const PREVIEW_SCALE_PERCENT = 150;
    const PREVIEW_BASE_SIZE = 200;
    const PREVIEW_MAX_SIZE = Math.round(PREVIEW_BASE_SIZE * (PREVIEW_SCALE_PERCENT / 100));

    // ---------- version history ----------
    const CHANGELOG = [
        {
            version: '1.3',
            date: '2026-07-20',
            changes: [
                'Removed single file links match.',
            ]
        },
                {
            version: '1.2',
            date: '2026-07-20',
            changes: [
                'Removed redundant file size overlay on thumbnails.',
                'Changed Hover Preview to apply only when hovering the thumbnails in both grid and table view.',
                'Changed preview scale to 150%.'
            ]
        },
        {
            version: '1.1',
            date: '2026-07-20',
            changes: [
                'Added Version History modal and automatic update detection.',
                'Added item size, upload date, and view count to grid view cards.',
                'Fixed text horizontal and vertical truncation in both Grid and Table views.',
                'Added Tampermonkey menu command to manually view changelog anytime.'
            ]
        },
        {
            version: '1.0',
            date: '2026-07-20',
            changes: [
                'Initial release with Grid & Table gallery views, lightbox modal, and hover previews.'
            ]
        }
    ];

    let listData = null;
    let galleryEl = null;
    let modalEl = null;
    let changelogModalEl = null;
    let previewBox = null;
    let previewImg = null;
    let currentIndex = 0;
    let currentMode = localStorage.getItem(STORAGE_KEY_MODE) || 'grid';
    let originalContainer = null;
    let sortState = { col: 'name', asc: true };

    // ---------- styles ----------
    const style = document.createElement('style');
    style.textContent = `
    #pdg-sidebar-btn, #pdg-sidebar-btn-fallback {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        box-sizing: border-box;
        font-size: 16px;
        font-weight: 800;
        cursor: pointer;
        color: #fff !important;
        text-decoration: none !important;
        background: linear-gradient(135deg, #6d78f5, #4752c4);
        border: none;
        border-radius: 8px;
        padding: 10px 14px;
        margin-top: 10px;
        margin-bottom: 10px;
        box-shadow: 0 0 8px rgba(88,101,242,.5), 0 3px 10px rgba(0,0,0,.35);
        transition: transform .12s ease, filter .12s ease;
    }
    #pdg-sidebar-btn:hover, #pdg-sidebar-btn-fallback:hover {
        transform: translateY(-1px);
        filter: brightness(1.1);
    }
    #pdg-sidebar-btn .pdg-icon, #pdg-sidebar-btn-fallback .pdg-icon {
        font-size: 18px;
    }
    #pdg-sidebar-btn-fallback {
        position: fixed;
        top: 14px;
        right: 14px;
        z-index: 100000;
        width: auto;
        padding: 11px 18px;
        margin-top: 0;
        margin-bottom: 0;
    }

    #pdg-gallery-root {
        position: relative;
        z-index: 9998;
        background: #1a1c23;
        min-height: 100vh;
        box-sizing: border-box;
        font-family: system-ui, sans-serif;
        color: #eceef3;
        font-size: 17px;
    }
    #pdg-gallery-root.pdg-hidden { display: none; }

    #pdg-gallery-header {
        position: sticky;
        top: 0;
        z-index: 50;
        background: #1f222b;
        border-bottom: 1px solid #333747;
        padding: 18px 28px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 16px;
    }
    #pdg-gallery-header-left { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
    #pdg-exit-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #2c303c;
        border: 1px solid #454a5c;
        color: #eceef3;
        border-radius: 9px;
        padding: 10px 16px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
    }
    #pdg-exit-btn:hover { background: #383d4c; border-color: #5865f2; }
    #pdg-gallery-titles h1 {
        font-size: 24px;
        margin: 0 0 3px;
        color: #fff;
    }
    #pdg-gallery-titles .pdg-sub {
        font-size: 15px;
        color: #9aa0b4;
    }

    #pdg-mode-switch {
        display: flex;
        background: #2c303c;
        border: 1px solid #454a5c;
        border-radius: 10px;
        overflow: hidden;
    }
    #pdg-mode-switch button {
        border: none;
        background: transparent;
        color: #c2c6d4;
        padding: 11px 20px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
    }
    #pdg-mode-switch button.pdg-active {
        background: #5865f2;
        color: #fff;
    }

    #pdg-gallery-body { padding: 24px 28px 50px; }

    #pdg-grid {
        max-width: 1600px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
        gap: 20px;
        align-items: start;
    }
    .pdg-card {
        background: #232631;
        border: 1px solid #333747;
        border-radius: 12px;
        overflow: hidden;
        cursor: pointer;
        transition: transform .12s ease, border-color .12s ease;
        display: flex;
        flex-direction: column;
        height: auto;
        text-decoration: none;
        color: inherit;
    }
    .pdg-card:hover {
        transform: translateY(-3px);
        border-color: #5865f2;
    }
    .pdg-thumb-wrap {
        position: relative;
        width: 100%;
        aspect-ratio: 16/10;
        background: #14161c;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }
    .pdg-thumb-wrap img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
    }
    .pdg-thumb-wrap .pdg-noicon {
        font-size: 44px;
        opacity: .5;
    }
    .pdg-badge {
        position: absolute;
        bottom: 8px;
        right: 8px;
        background: rgba(0,0,0,.7);
        color: #fff;
        font-size: 13.5px;
        padding: 3px 8px;
        border-radius: 5px;
    }
    .pdg-meta {
        padding: 11px 13px 13px;
    }
    .pdg-name {
        font-size: 16px;
        line-height: 1.35;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        overflow: hidden;
        color: #eceef3;
        overflow-wrap: anywhere;
        word-break: break-word;
    }
    .pdg-card-stats {
        font-size: 13.5px;
        color: #b0b6c8;
        margin-top: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .pdg-card-date {
        font-size: 12.5px;
        color: #82889e;
        margin-top: 3px;
    }

    /* table view */
    #pdg-table-wrap {
        max-width: 1600px;
        margin: 0 auto;
        overflow-x: auto;
        border: 1px solid #333747;
        border-radius: 12px;
    }
    #pdg-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 15.5px;
    }
    #pdg-table thead {
        background: #262a37;
    }
    #pdg-table th {
        text-align: left;
        padding: 13px 15px;
        color: #d3d7e3;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        user-select: none;
        border-bottom: 2px solid #333747;
    }
    #pdg-table th:hover { color: #fff; }
    #pdg-table th .pdg-sort-arrow { opacity: .7; margin-left: 4px; font-size: 12px; }
    #pdg-table td {
        padding: 11px 15px;
        border-bottom: 1px solid #2a2d38;
        color: #dfe2ec;
        vertical-align: middle;
    }
    #pdg-table tbody tr {
        cursor: pointer;
        transition: background .1s ease;
    }
    #pdg-table tbody tr:hover { background: #262a37; }
    .pdg-table-thumb {
        width: 68px;
        height: 42px;
        border-radius: 5px;
        object-fit: contain;
        background: #14161c;
        display: block;
    }
    a.pdg-table-thumb-link { display: block; width: 68px; height: 42px; }
    a.pdg-table-name {
        display: block;
        color: #eceef3;
        text-decoration: none;
        min-width: 200px;
        max-width: 450px;
        overflow-wrap: anywhere;
        word-break: break-word;
        white-space: normal;
    }
    a.pdg-table-name:hover { color: #8b95f7; text-decoration: underline; }
    .pdg-table-link {
        color: #8b95f7;
        text-decoration: none;
        font-size: 14.5px;
        margin-right: 12px;
    }
    .pdg-table-link:hover { text-decoration: underline; }

    /* hover preview */
    @keyframes pdgPreviewPulse {
        0% { box-shadow: 0 0 8px rgba(88,101,242,.5), 0 0 16px rgba(88,101,242,.3); }
        50% { box-shadow: 0 0 16px rgba(88,101,242,.95), 0 0 30px rgba(88,101,242,.6); }
        100% { box-shadow: 0 0 8px rgba(88,101,242,.5), 0 0 16px rgba(88,101,242,.3); }
    }
    #pdg-preview-box {
        position: fixed;
        pointer-events: none;
        z-index: 100050;
        display: none;
        padding: 7px;
        border-radius: 10px;
        background: rgba(15,16,22,.96);
    }
    #pdg-preview-box img {
        display: block;
        object-fit: contain;
        border: 2px solid #5865f2;
        border-radius: 7px;
        animation: pdgPreviewPulse 1.8s infinite;
        image-rendering: -webkit-optimize-contrast;
    }

    /* modal */
    #pdg-modal {
        position: fixed;
        inset: 0;
        z-index: 100001;
        background: rgba(8,9,13,.95);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
    }
    #pdg-modal.pdg-hidden { display: none; }
    #pdg-modal-media-wrap {
        max-width: 92vw;
        max-height: 76vh;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    #pdg-modal-media-wrap img,
    #pdg-modal-media-wrap video {
        max-width: 92vw;
        max-height: 76vh;
        border-radius: 6px;
        background: #000;
    }
    #pdg-modal-media-wrap audio { width: 60vw; }
    #pdg-modal-caption {
        margin-top: 16px;
        color: #eceef3;
        font-size: 17px;
        text-align: center;
        max-width: 80vw;
    }
    #pdg-modal-counter {
        color: #9aa0b4;
        font-size: 15px;
        margin-top: 5px;
    }
    .pdg-nav-btn {
        position: fixed;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(88,101,242,.25);
        border: 1px solid rgba(88,101,242,.55);
        color: #fff;
        font-size: 28px;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100002;
        transition: background .12s ease;
    }
    .pdg-nav-btn:hover { background: rgba(88,101,242,.55); }
    #pdg-prev-btn { left: 22px; }
    #pdg-next-btn { right: 22px; }
    #pdg-close-btn {
        position: fixed;
        top: 18px;
        right: 18px;
        z-index: 100002;
        background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.2);
        color: #fff;
        width: 42px;
        height: 42px;
        border-radius: 50%;
        font-size: 20px;
        cursor: pointer;
    }
    #pdg-close-btn:hover { background: rgba(255,255,255,.2); }
    #pdg-download-btn {
        position: fixed;
        top: 18px;
        right: 72px;
        z-index: 100002;
        background: rgba(88,101,242,.35);
        border: 1px solid rgba(88,101,242,.65);
        color: #fff;
        padding: 0 16px;
        height: 42px;
        line-height: 42px;
        border-radius: 21px;
        font-size: 15px;
        cursor: pointer;
        text-decoration: none;
    }
    #pdg-download-btn:hover { background: rgba(88,101,242,.6); }

    /* changelog modal */
    #pdg-changelog-modal {
        position: fixed;
        inset: 0;
        z-index: 100055;
        background: rgba(8, 9, 13, 0.85);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    }
    #pdg-changelog-modal.pdg-hidden { display: none; }
    .pdg-changelog-box {
        background: #1f222b;
        border: 1px solid #333747;
        border-radius: 12px;
        width: 100%;
        max-width: 520px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        overflow: hidden;
        color: #eceef3;
        font-family: system-ui, sans-serif;
    }
    .pdg-changelog-header {
        padding: 16px 20px;
        background: #262a37;
        border-bottom: 1px solid #333747;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .pdg-changelog-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        color: #fff;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .pdg-changelog-close {
        background: transparent;
        border: none;
        color: #9aa0b4;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
    }
    .pdg-changelog-close:hover { color: #fff; }
    .pdg-changelog-body {
        padding: 20px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 18px;
    }
    .pdg-version-block {
        border-bottom: 1px solid #2a2d38;
        padding-bottom: 14px;
    }
    .pdg-version-block:last-child {
        border-bottom: none;
        padding-bottom: 0;
    }
    .pdg-version-title {
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 700;
        font-size: 15px;
        color: #fff;
        margin-bottom: 8px;
    }
    .pdg-version-badge {
        background: #5865f2;
        color: #fff;
        font-size: 12px;
        padding: 2px 8px;
        border-radius: 10px;
        font-weight: 600;
    }
    .pdg-version-date {
        font-size: 12px;
        color: #82889e;
    }
    .pdg-version-changes {
        margin: 0;
        padding-left: 18px;
        font-size: 14px;
        color: #c2c6d4;
        line-height: 1.5;
    }
    .pdg-changelog-footer {
        padding: 12px 20px;
        background: #1a1c23;
        border-top: 1px solid #333747;
        display: flex;
        justify-content: flex-end;
    }
    .pdg-changelog-btn {
        background: #5865f2;
        color: #fff;
        border: none;
        padding: 8px 18px;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
    }
    .pdg-changelog-btn:hover { background: #4752c4; }

    #pdg-loading, #pdg-error {
        max-width: 1600px;
        margin: 40px auto;
        text-align: center;
        color: #9aa0b4;
        font-size: 17px;
    }
    `;
    document.head.appendChild(style);

    // ---------- helpers ----------
    function fmtSize(bytes) {
        if (bytes == null) return '';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0, n = bytes;
        while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
        return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
    }

    function fmtDate(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) { return iso; }
    }

    function isImage(mime) { return mime && mime.startsWith('image/'); }
    function isVideo(mime) { return mime && mime.startsWith('video/'); }
    function isAudio(mime) { return mime && mime.startsWith('audio/'); }

    function apiUrl(href) {
        return href ? `${API_BASE}${href}` : '';
    }
    function thumbUrl(file) {
        return file.thumbnail_href ? apiUrl(file.thumbnail_href) : `${API_BASE}/file/${file.id}/thumbnail`;
    }
    function fileUrl(id) { return `${API_BASE}/file/${id}`; }
    function downloadUrl(id) { return `${API_BASE}/file/${id}?download`; }
    function viewerUrl(id) { return `https://pixeldrain.com/u/${id}`; }

    async function fetchListData() {
        const res = await fetch(`${API_BASE}/list/${LIST_ID}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return res.json();
    }

    function setThumb(imgEl, file) {
        const primary = thumbUrl(file);
        const fallback = `${API_BASE}/file/${file.id}/thumbnail`;
        let triedFallback = false;
        imgEl.loading = 'lazy';
        imgEl.alt = file.name;
        imgEl.onerror = () => {
            if (!triedFallback && imgEl.src !== fallback) {
                triedFallback = true;
                imgEl.src = fallback;
            } else {
                imgEl.replaceWith(iconFor(file));
            }
        };
        imgEl.src = primary;
    }

    function iconFor(file) {
        const span = document.createElement('span');
        span.className = 'pdg-noicon';
        span.textContent = isAudio(file.mime_type) ? '\u{1F3B5}' : isVideo(file.mime_type) ? '\u{1F3AC}' : '\u{1F4C4}';
        return span;
    }

    // ---------- hover preview ----------
    function buildPreviewBox() {
        const box = document.createElement('div');
        box.id = 'pdg-preview-box';
        const img = document.createElement('img');
        img.style.width = `${PREVIEW_MAX_SIZE}px`;
        img.style.height = `${PREVIEW_MAX_SIZE}px`;
        box.appendChild(img);
        document.body.appendChild(box);
        return { box, img };
    }

    function showPreview(file, x, y) {
        previewImg.onerror = null;
        previewImg.src = thumbUrl(file);
        previewBox.style.display = 'block';
        movePreview(x, y);
    }

    function hidePreview() {
        previewBox.style.display = 'none';
        previewImg.src = '';
    }

    function movePreview(x, y) {
        const offset = 24;
        const w = previewBox.offsetWidth || PREVIEW_MAX_SIZE;
        const h = previewBox.offsetHeight || PREVIEW_MAX_SIZE;
        let posX = x + offset;
        let posY = y + offset;
        if (posX + w > window.innerWidth) posX = x - w - offset;
        if (posY + h > window.innerHeight) posY = y - h - offset;
        posX = Math.max(offset, posX);
        posY = Math.max(offset, posY);
        previewBox.style.left = `${posX}px`;
        previewBox.style.top = `${posY}px`;
    }

    function bindItemLink(el, idx) {
        el.addEventListener('click', (e) => {
            if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                e.preventDefault();
                openModal(idx);
            }
        });
    }

    function attachHoverPreview(el, file) {
        el.addEventListener('mouseenter', (e) => showPreview(file, e.clientX, e.clientY));
        el.addEventListener('mousemove', (e) => movePreview(e.clientX, e.clientY));
        el.addEventListener('mouseleave', hidePreview);
    }

    // ---------- gallery root ----------
    function buildGalleryRoot() {
        const root = document.createElement('div');
        root.id = 'pdg-gallery-root';
        root.className = 'pdg-hidden';
        root.innerHTML = `
            <div id="pdg-gallery-header">
                <div id="pdg-gallery-header-left">
                    <button id="pdg-exit-btn"><span class="pdg-icon pdg-toggle-icon">&#8617;</span><span class="pdg-toggle-label">Default view</span></button>
                    <div id="pdg-gallery-titles">
                        <h1 id="pdg-gallery-title"></h1>
                        <div class="pdg-sub" id="pdg-gallery-sub"></div>
                    </div>
                </div>
                <div id="pdg-mode-switch">
                    <button data-mode="grid">&#9638; Grid</button>
                    <button data-mode="table">&#9776; Table</button>
                </div>
            </div>
            <div id="pdg-gallery-body">
                <div id="pdg-loading">Loading files&hellip;</div>
                <div id="pdg-grid" style="display:none"></div>
                <div id="pdg-table-wrap" style="display:none">
                    <table id="pdg-table">
                        <thead>
                            <tr>
                                <th data-col="thumb">Preview</th>
                                <th data-col="name">Name <span class="pdg-sort-arrow"></span></th>
                                <th data-col="mime_type">Type <span class="pdg-sort-arrow"></span></th>
                                <th data-col="size">Size <span class="pdg-sort-arrow"></span></th>
                                <th data-col="date_upload">Uploaded <span class="pdg-sort-arrow"></span></th>
                                <th data-col="views">Views <span class="pdg-sort-arrow"></span></th>
                                <th data-col="links">Links</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
        `;
        document.body.appendChild(root);

        root.querySelector('#pdg-exit-btn').addEventListener('click', () => setActive(false));

        root.querySelectorAll('#pdg-mode-switch button').forEach((btn) => {
            btn.addEventListener('click', () => setMode(btn.dataset.mode));
        });
        root.querySelectorAll('#pdg-table th[data-col]').forEach((th) => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                if (col === 'thumb' || col === 'links') return;
                if (sortState.col === col) sortState.asc = !sortState.asc;
                else sortState = { col, asc: true };
                renderTable();
            });
        });

        return root;
    }

    function setMode(mode) {
        currentMode = mode;
        localStorage.setItem(STORAGE_KEY_MODE, mode);
        galleryEl.querySelectorAll('#pdg-mode-switch button').forEach((b) => {
            b.classList.toggle('pdg-active', b.dataset.mode === mode);
        });
        galleryEl.querySelector('#pdg-grid').style.display = mode === 'grid' ? 'grid' : 'none';
        galleryEl.querySelector('#pdg-table-wrap').style.display = mode === 'table' ? 'block' : 'none';
        if (mode === 'table') renderTable();
    }

    function renderGrid(data) {
        const grid = galleryEl.querySelector('#pdg-grid');
        grid.innerHTML = '';
        data.files.forEach((file, idx) => {
            const card = document.createElement('a');
            card.className = 'pdg-card';
            card.dataset.index = idx;
            card.href = viewerUrl(file.id);
            card.target = '_blank';
            card.rel = 'noopener noreferrer';

            const thumbWrap = document.createElement('div');
            thumbWrap.className = 'pdg-thumb-wrap';

            const img = document.createElement('img');
            setThumb(img, file);
            thumbWrap.appendChild(img);

            const meta = document.createElement('div');
            meta.className = 'pdg-meta';
            meta.innerHTML = `
                <div class="pdg-name" title="${file.name.replace(/"/g, '&quot;')}">${file.name}</div>
                <div class="pdg-card-stats">
                    <span>${fmtSize(file.size)}</span> &bull; <span>${file.views ?? 0} views</span>
                </div>
                <div class="pdg-card-date">Uploaded ${fmtDate(file.date_upload)}</div>
            `;

            card.appendChild(thumbWrap);
            card.appendChild(meta);
            bindItemLink(card, idx);
            attachHoverPreview(thumbWrap, file);
            grid.appendChild(card);
        });
    }

    function sortedFiles() {
        const files = [...listData.files];
        const { col, asc } = sortState;
        files.sort((a, b) => {
            let va = a[col], vb = b[col];
            if (col === 'date_upload') { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
            if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
            if (va < vb) return asc ? -1 : 1;
            if (va > vb) return asc ? 1 : -1;
            return 0;
        });
        return files;
    }

    function renderTable() {
        const tbody = galleryEl.querySelector('#pdg-table tbody');
        tbody.innerHTML = '';

        galleryEl.querySelectorAll('#pdg-table th[data-col] .pdg-sort-arrow').forEach((el) => (el.textContent = ''));
        const activeTh = galleryEl.querySelector(`#pdg-table th[data-col="${sortState.col}"] .pdg-sort-arrow`);
        if (activeTh) activeTh.textContent = sortState.asc ? '\u25B2' : '\u25BC';

        sortedFiles().forEach((file) => {
            const realIdx = listData.files.indexOf(file);
            const tr = document.createElement('tr');

            const tdThumb = document.createElement('td');
            const thumbLink = document.createElement('a');
            thumbLink.className = 'pdg-table-thumb-link';
            thumbLink.href = viewerUrl(file.id);
            thumbLink.target = '_blank';
            thumbLink.rel = 'noopener noreferrer';
            const img = document.createElement('img');
            img.className = 'pdg-table-thumb';
            setThumb(img, file);
            thumbLink.appendChild(img);
            bindItemLink(thumbLink, realIdx);
            tdThumb.appendChild(thumbLink);

            const tdName = document.createElement('td');
            const nameLink = document.createElement('a');
            nameLink.className = 'pdg-table-name';
            nameLink.href = viewerUrl(file.id);
            nameLink.target = '_blank';
            nameLink.rel = 'noopener noreferrer';
            nameLink.title = file.name;
            nameLink.textContent = file.name;
            bindItemLink(nameLink, realIdx);
            tdName.appendChild(nameLink);

            const tdType = document.createElement('td');
            tdType.textContent = file.mime_type || '';

            const tdSize = document.createElement('td');
            tdSize.textContent = fmtSize(file.size);

            const tdDate = document.createElement('td');
            tdDate.textContent = fmtDate(file.date_upload);

            const tdViews = document.createElement('td');
            tdViews.textContent = file.views ?? '';

            const tdLinks = document.createElement('td');
            const openA = document.createElement('a');
            openA.className = 'pdg-table-link';
            openA.href = '#';
            openA.textContent = 'Preview';
            openA.addEventListener('click', (e) => { e.preventDefault(); openModal(realIdx); });
            const viewA = document.createElement('a');
            viewA.className = 'pdg-table-link';
            viewA.href = viewerUrl(file.id);
            viewA.target = '_blank';
            viewA.textContent = 'Open';
            const dlA = document.createElement('a');
            dlA.className = 'pdg-table-link';
            dlA.href = downloadUrl(file.id);
            dlA.textContent = 'Download';
            tdLinks.appendChild(openA);
            tdLinks.appendChild(viewA);
            tdLinks.appendChild(dlA);

            tr.appendChild(tdThumb);
            tr.appendChild(tdName);
            tr.appendChild(tdType);
            tr.appendChild(tdSize);
            tr.appendChild(tdDate);
            tr.appendChild(tdViews);
            tr.appendChild(tdLinks);
            tr.addEventListener('click', (e) => {
                if (e.target.closest('a')) return;
                openModal(realIdx);
            });
            attachHoverPreview(thumbLink, file);

            tbody.appendChild(tr);
        });
    }

    function renderAll(data) {
        galleryEl.querySelector('#pdg-gallery-title').textContent = data.title || 'Album';
        galleryEl.querySelector('#pdg-gallery-sub').textContent =
            `${data.file_count ?? data.files.length} files`;
        renderGrid(data);
        setMode(currentMode);
        galleryEl.querySelector('#pdg-loading').style.display = 'none';
    }

    // ---------- modal ----------
    function buildModal() {
        const modal = document.createElement('div');
        modal.id = 'pdg-modal';
        modal.className = 'pdg-hidden';
        modal.innerHTML = `
            <button id="pdg-close-btn" title="Close (Esc)">&#10005;</button>
            <a id="pdg-download-btn" title="Download">Download</a>
            <button id="pdg-prev-btn" class="pdg-nav-btn" title="Previous (&larr;)">&#8249;</button>
            <div id="pdg-modal-media-wrap"></div>
            <button id="pdg-next-btn" class="pdg-nav-btn" title="Next (&rarr;)">&#8250;</button>
            <div id="pdg-modal-caption"></div>
            <div id="pdg-modal-counter"></div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#pdg-close-btn').addEventListener('click', closeModal);
        modal.querySelector('#pdg-prev-btn').addEventListener('click', () => stepModal(-1));
        modal.querySelector('#pdg-next-btn').addEventListener('click', () => stepModal(1));
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        document.addEventListener('keydown', (e) => {
            if (!modal.classList.contains('pdg-hidden')) {
                if (e.key === 'Escape') { closeModal(); return; }
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    const currentFile = listData && listData.files[currentIndex];
                    if (currentFile && isVideo(currentFile.mime_type)) return;
                    stepModal(e.key === 'ArrowLeft' ? -1 : 1);
                    return;
                }
                return;
            }
            if (e.key === 'Escape' && galleryEl && !galleryEl.classList.contains('pdg-hidden')) {
                setActive(false);
            }
        });

        return modal;
    }

    function openModal(idx) {
        currentIndex = idx;
        hidePreview();
        renderModalMedia();
        modalEl.classList.remove('pdg-hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modalEl.classList.add('pdg-hidden');
        modalEl.querySelector('#pdg-modal-media-wrap').innerHTML = '';
        document.body.style.overflow = '';
    }

    function stepModal(delta) {
        const total = listData.files.length;
        currentIndex = (currentIndex + delta + total) % total;
        renderModalMedia();
    }

    function renderModalMedia() {
        const file = listData.files[currentIndex];
        const wrap = modalEl.querySelector('#pdg-modal-media-wrap');
        wrap.innerHTML = '';

        if (isImage(file.mime_type)) {
            const img = document.createElement('img');
            img.src = fileUrl(file.id);
            wrap.appendChild(img);
        } else if (isVideo(file.mime_type)) {
            const video = document.createElement('video');
            video.src = fileUrl(file.id);
            video.controls = true;
            video.autoplay = true;
            wrap.appendChild(video);
        } else if (isAudio(file.mime_type)) {
            const audio = document.createElement('audio');
            audio.src = fileUrl(file.id);
            audio.controls = true;
            audio.autoplay = true;
            wrap.appendChild(audio);
        } else {
            const div = document.createElement('div');
            div.style.color = '#eceef3';
            div.style.fontSize = '17px';
            div.textContent = 'No preview available for this file type.';
            wrap.appendChild(div);
        }

        modalEl.querySelector('#pdg-modal-caption').textContent = file.name;
        modalEl.querySelector('#pdg-modal-counter').textContent =
            `${currentIndex + 1} / ${listData.files.length}`;
        modalEl.querySelector('#pdg-download-btn').href = downloadUrl(file.id);
    }

    // ---------- changelog / version history modal ----------
    function buildChangelogModal() {
        const modal = document.createElement('div');
        modal.id = 'pdg-changelog-modal';
        modal.className = 'pdg-hidden';

        const historyHtml = CHANGELOG.map(item => `
            <div class="pdg-version-block">
                <div class="pdg-version-title">
                    <span class="pdg-version-badge">v${item.version}</span>
                    <span class="pdg-version-date">${item.date}</span>
                </div>
                <ul class="pdg-version-changes">
                    ${item.changes.map(c => `<li>${c}</li>`).join('')}
                </ul>
            </div>
        `).join('');

        modal.innerHTML = `
            <div class="pdg-changelog-box">
                <div class="pdg-changelog-header">
                    <h2>📜 [Pixeldrain] Gallery View History</h2>
                    <button class="pdg-changelog-close" title="Close">&#10005;</button>
                </div>
                <div class="pdg-changelog-body">
                    ${historyHtml}
                </div>
                <div class="pdg-changelog-footer">
                    <button class="pdg-changelog-btn">Got it!</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeFn = () => modal.classList.add('pdg-hidden');
        modal.querySelector('.pdg-changelog-close').addEventListener('click', closeFn);
        modal.querySelector('.pdg-changelog-btn').addEventListener('click', closeFn);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeFn(); });

        return modal;
    }

    function showChangelogModal() {
        if (!changelogModalEl) {
            changelogModalEl = buildChangelogModal();
        }
        changelogModalEl.classList.remove('pdg-hidden');
    }

    function checkVersionUpdate() {
        if (typeof GM_getValue === 'undefined' || typeof GM_setValue === 'undefined') return;

        const lastVersion = GM_getValue('pdg_last_version', null);
        if (lastVersion !== SCRIPT_VERSION) {
            GM_setValue('pdg_last_version', SCRIPT_VERSION);
            // Show changelog automatically if updating from an older version
            showChangelogModal();
        }
    }

    // ---------- toggle / sidebar injection ----------
    function setActive(active) {
        localStorage.setItem(STORAGE_KEY_ACTIVE, active ? '1' : '0');
        if (active) {
            if (!originalContainer) originalContainer = findNativeContainer();
            if (originalContainer) originalContainer.style.display = 'none';
            galleryEl.classList.remove('pdg-hidden');
        } else {
            if (originalContainer) originalContainer.style.display = '';
            galleryEl.classList.add('pdg-hidden');
            hidePreview();
        }
        updateToggleLabel(active);
    }

    function updateToggleLabel(active) {
        document.querySelectorAll('.pdg-toggle-label').forEach((el) => {
            el.textContent = active ? 'Default view' : 'Gallery view';
        });
        document.querySelectorAll('.pdg-toggle-icon').forEach((el) => {
            el.innerHTML = active ? '&#8617;' : '&#9638;';
        });
    }

    function findNativeContainer() {
        return document.getElementById('app') || document.body.firstElementChild;
    }

    function makeToggleButton(tag = 'button') {
        const btn = document.createElement(tag);
        btn.id = 'pdg-sidebar-btn';
        btn.innerHTML = `<span class="pdg-icon pdg-toggle-icon">&#9638;</span><span class="pdg-toggle-label">Gallery view</span>`;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const isHidden = galleryEl.classList.contains('pdg-hidden');
            setActive(isHidden);
        });
        return btn;
    }

    function injectSidebarButton() {
        if (document.getElementById('pdg-sidebar-btn') || document.getElementById('pdg-sidebar-btn-fallback')) return;

        // Target Pixeldrain sidebar metadata labels (Size, Files, Date)
        const labels = document.querySelectorAll('div.label');
        let targetElement = null;

        labels.forEach((label) => {
            const text = label.textContent.trim();
            if (text === 'Size' || text === 'Files' || text === 'Date') {
                targetElement = label.nextElementSibling;
            }
        });

        const btn = makeToggleButton('button');
        const isActive = galleryEl && !galleryEl.classList.contains('pdg-hidden');
        updateToggleLabel(isActive);

        if (targetElement) {
            targetElement.insertAdjacentElement('afterend', btn);
        } else {
            const sidebar = document.querySelector('.sidebar') || document.querySelector('[class*="sidebar"]') || document.querySelector('.details') || document.querySelector('nav');
            if (sidebar) {
                sidebar.appendChild(btn);
            } else {
                btn.id = 'pdg-sidebar-btn-fallback';
                document.body.appendChild(btn);
            }
        }
    }

    // Dynamic SPA observer to handle Pixeldrain route navigation and delayed sidebar rendering
    const sidebarObserver = new MutationObserver(() => {
        if (location.pathname.includes('/l/') || location.pathname.includes('/u/')) {
            injectSidebarButton();
        }
    });
    sidebarObserver.observe(document.body, { childList: true, subtree: true });

    async function init() {
        galleryEl = buildGalleryRoot();
        modalEl = buildModal();
        const preview = buildPreviewBox();
        previewBox = preview.box;
        previewImg = preview.img;

        injectSidebarButton();

        try {
            listData = await fetchListData();
            renderAll(listData);

            const wasActive = localStorage.getItem(STORAGE_KEY_ACTIVE) === '1';
            if (wasActive) {
                setActive(true);
            }
        } catch (err) {
            console.error('[Pixeldrain Gallery View] Failed to load list:', err);
            galleryEl.querySelector('#pdg-loading').style.display = 'none';
            const errDiv = document.createElement('div');
            errDiv.id = 'pdg-error';
            errDiv.textContent = 'Failed to load list data. Please refresh or try again.';
            galleryEl.querySelector('#pdg-gallery-body').appendChild(errDiv);
        }

        // Check version update state
        checkVersionUpdate();
    }

    // Register Userscript Menu Command
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('📜 Version History / Changelog', () => showChangelogModal());
    }

    init();
})();