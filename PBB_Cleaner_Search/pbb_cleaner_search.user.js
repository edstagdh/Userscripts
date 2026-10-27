// ==UserScript==
// @name        [PBB] Cleaner Search
// @description Shrinks post images on PBB search results to small thumbnails (max 350×350) with a click-to-preview lightbox, and auto-collapses results whose topic name matches your keywords.
// @namespace   https://github.com/edstagdh/Userscripts
// @version     1.0
// @author      edstagdh
// @match       *://pornbb.org/*
// @match       *://*.pornbb.org/*
// @icon        https://www.google.com/s2/favicons?sz=64&domain=pornbb.org
// @updateURL   https://github.com/edstagdh/Userscripts/raw/refs/heads/master/PBB_Cleaner_Search/pbb_cleaner_search.user.js
// @installURL  https://github.com/edstagdh/Userscripts/raw/refs/heads/master/PBB_Cleaner_Search/pbb_cleaner_search.user.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.7/viewer.min.js
// @require     https://raw.githubusercontent.com/edstagdh/Userscripts/master/PBB_Cleaner_Search/pbb_cleaner_search.viewer.js?v=1.0
// @require     https://raw.githubusercontent.com/edstagdh/Userscripts/master/PBB_Cleaner_Search/pbb_cleaner_search.changelog.js?v=1.0
// @resource    VIEWER_CSS https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.7/viewer.min.css
// @resource    PBB_STYLES https://raw.githubusercontent.com/edstagdh/Userscripts/master/PBB_Cleaner_Search/pbb_cleaner_search.styles.css?v=1.0
// @grant       GM_addStyle
// @grant       GM_getResourceText
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_registerMenuCommand
// @grant       GM_xmlhttpRequest
// @connect     raw.githubusercontent.com
// @run-at      document-end
// ==/UserScript==

"use strict";

// Code is split across files (all in PBB_Cleaner_Search/, cached by Tampermonkey, refreshed
// on each version bump through the ?v= on their URLs):
//   pbb_cleaner_search.viewer.js      full-size URL rules + Viewer.js lightbox (click to preview)
//   pbb_cleaner_search.changelog.js   "What's New" popup (fetches Changelog.md from GitHub)
//   pbb_cleaner_search.styles.css     all CSS
// When bumping @version, update the ?v= on those @require / @resource lines too.
// The main script is not wrapped in an IIFE: the @require modules share its scope.

const LOG_PREFIX = '[PBB-CS]';

// --------------------
// VERSION
// --------------------
const SCRIPT_VERSION = '1.0';

// --------------------
// SETTINGS (changed from the Tampermonkey menu)
// --------------------
const DEFAULT_KEYWORDS = ['XXXXXXXXX', 'YYYYYY'];
const DEFAULT_THUMB_MAX = 350;

function getKeywords() {
    const v = GM_getValue('COLLAPSE_KEYWORDS', null);
    return Array.isArray(v) ? v : DEFAULT_KEYWORDS.slice();
}
function getThumbMax() {
    const n = parseInt(GM_getValue('THUMB_MAX', DEFAULT_THUMB_MAX), 10);
    return n >= 50 && n <= 2000 ? n : DEFAULT_THUMB_MAX;
}
function applyThumbMax() {
    document.documentElement.style.setProperty('--pbb-thumb-max', getThumbMax() + 'px');
}

// --------------------
// CSS — Viewer.js stylesheet (@resource VIEWER_CSS) + our stylesheet (@resource PBB_STYLES)
// --------------------
function loadStyles() {
    ['VIEWER_CSS', 'PBB_STYLES'].forEach(function (name) {
        let css = '';
        try { css = GM_getResourceText(name) || ''; } catch (e) { /* handled below */ }
        if (css) GM_addStyle(css);
        else console.error(`${LOG_PREFIX} Stylesheet resource ${name} is missing — check the @resource line / reinstall the script.`);
    });
    applyThumbMax();
}

// --------------------
// THUMBNAILS — every image inside a post becomes a small, clickable thumbnail
// --------------------
const POST_IMG_SEL = '.post-text img, .postbody img';

function markImage(img) {
    if (img.dataset.pbbThumb) return;
    img.dataset.pbbThumb = '1';
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.classList.add('pbb-thumb');
    // Leave smilies and other tiny images alone
    const checkTiny = function () {
        if (img.naturalWidth && img.naturalWidth < 40 && img.naturalHeight < 40) img.classList.remove('pbb-thumb');
    };
    if (img.complete) checkTiny(); else img.addEventListener('load', checkTiny, { once: true });
}

function markAllImages(root) {
    root.querySelectorAll(POST_IMG_SEL).forEach(markImage);
}

// --------------------
// AUTO-COLLAPSE — search results whose topic name contains a keyword
// --------------------
function makeButton(text, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pbb-btn';
    b.textContent = text;
    b.addEventListener('click', function (e) { e.preventDefault(); onClick(b); });
    return b;
}

function applyCollapse() {
    const list = document.querySelector('.forumline.search-posts');
    if (!list) return;
    const keywords = getKeywords().map(k => String(k).trim()).filter(Boolean);

    document.querySelectorAll('.pbb-summary').forEach(n => n.remove());
    const collapsed = [];

    list.querySelectorAll('.cattitle').forEach(function (ct) {
        const link = ct.querySelector('a');
        const row = ct.closest('.row');
        const body = row && row.nextElementSibling;
        if (!link || !body || !body.querySelector('.postbody')) return;

        // reset any previous state (keywords may have just changed)
        ct.querySelectorAll('.pbb-btn, .pbb-match-tag').forEach(n => n.remove());
        ct.classList.remove('pbb-matched');
        body.classList.remove('pbb-collapsed');

        const title = link.textContent.toLowerCase();
        const hit = keywords.find(k => title.includes(k.toLowerCase()));
        if (!hit) return;

        ct.classList.add('pbb-matched');
        body.classList.add('pbb-collapsed');
        const tag = document.createElement('span');
        tag.className = 'pbb-match-tag';
        tag.textContent = `collapsed: "${hit}"`;
        const btn = makeButton('Show', function (b) {
            const hidden = body.classList.toggle('pbb-collapsed');
            b.textContent = hidden ? 'Show' : 'Hide';
        });
        ct.append(tag, btn);
        collapsed.push({ body, btn });
    });

    if (!collapsed.length) return;
    const bar = document.createElement('div');
    bar.className = 'pbb-summary';
    bar.textContent = `${collapsed.length} result${collapsed.length > 1 ? 's' : ''} collapsed by keyword.`;
    let open = false;
    bar.appendChild(makeButton('Show all', function (b) {
        open = !open;
        collapsed.forEach(function (c) {
            c.body.classList.toggle('pbb-collapsed', !open);
            c.btn.textContent = open ? 'Hide' : 'Show';
        });
        b.textContent = open ? 'Collapse again' : 'Show all';
    }));
    list.parentNode.insertBefore(bar, list);
}

// --------------------
// MENU
// --------------------
function registerMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    GM_registerMenuCommand('🙈 Collapse keywords…', function () {
        const v = prompt('Collapse search results whose topic name contains any of these (comma-separated, case-insensitive):', getKeywords().join(', '));
        if (v === null) return;
        GM_setValue('COLLAPSE_KEYWORDS', v.split(',').map(s => s.trim()).filter(Boolean));
        applyCollapse();
    });
    GM_registerMenuCommand('🖼 Thumbnail max size…', function () {
        const v = prompt('Maximum thumbnail width/height in pixels (50–2000):', getThumbMax());
        if (v === null) return;
        const n = parseInt(v, 10);
        if (!(n >= 50 && n <= 2000)) { alert('Please enter a number between 50 and 2000.'); return; }
        GM_setValue('THUMB_MAX', n);
        applyThumbMax();
    });
    GM_registerMenuCommand('📋 Show Changelog', showFullChangelog);
}

// --------------------
// INIT
// --------------------
(function init() {
    loadStyles();
    registerMenu();
    markAllImages(document);
    initViewer();
    applyCollapse();
    checkVersionAndShowChangelog();
    console.log(`${LOG_PREFIX} v${SCRIPT_VERSION} ready`);
})();
