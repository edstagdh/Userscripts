// ==UserScript==
// @name         [HF][EMP] Advanced Better filelist
// @version      1.5
// @description  inspired by original script by ephraim
// @author       edstagdh
// @namespace    https://github.com/edstagdh/Userscripts
// @match        https://www.empornium.sx/torrents.php?id=*
// @match        https://emparadise.rs/torrents.php?id=*
// @match        https://www.happyfappy.net/torrents.php?id=*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @installURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/advanced_better_filelist.user.js
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/advanced_better_filelist.user.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=www.happyfappy.net
// @icon         https://www.google.com/s2/favicons?sz=64&domain=www.empornium.sx
// @icon         https://www.google.com/s2/favicons?sz=64&domain=emparadise.rs
// ==/UserScript==

var urlMap = {};
var multiKeywordMode = false;
var caseSensitive = false;
var clickSearchMode = false;
var hiddenFileTypes = new Set();

// ── Settings ─────────────────────────────────────────────────────────────────
// Simple on/off flags for optional features. Defaults live here; if GM_getValue
// / GM_setValue are available (they are, per the @grant lines above) the actual
// value is persisted and can be flipped live via the Tampermonkey menu (the
// little script-manager icon in the browser toolbar → script commands), no
// code editing required. Toggling reloads the page so the change takes effect.

var DEFAULT_SETTINGS = {
    tagColumnsEnabled: false,         // off by default — moves the tag list into the middle column and lays it out in columns
    thumbHoverPreviewEnabled: false,  // off by default — hovering a known-host thumbnail (.th. etc.) pops up the full-size image
    thumbFullSizeEnabled: false,      // off by default — swaps known-host thumbnails for their full-size images in place (pauses the hover preview)
    thumbFullSizeMaxWidth: 800,       // px — largest box a swapped full-size image is shown in (also never wider than its container)
    thumbFullSizeMaxHeight: 800,      // px
};
var SETTINGS_KEY_PREFIX = 'abf_setting_';

function getSetting(name) {
    if (typeof GM_getValue === 'undefined') return DEFAULT_SETTINGS[name];
    return GM_getValue(SETTINGS_KEY_PREFIX + name, DEFAULT_SETTINGS[name]);
}

function setSetting(name, value) {
    if (typeof GM_setValue === 'undefined') return;
    GM_setValue(SETTINGS_KEY_PREFIX + name, value);
}

// ── Thumbnail hover preview ──────────────────────────────────────────────────
// Hovering a thumbnail from a known image host shows the full-size image in a
// floating popup next to the cursor. The full-size URL is derived from the
// thumbnail URL per host (reverse of each host's thumbnail naming scheme).
// Toggleable via the Tampermonkey menu.

var THUMB_HOSTS = {
    HAMSTER: 'hamsterimg.net',
    IMGBOX: 'imgbox.com',
};
// pixhost serves the same files from several mirror domains. Thumbnail hosts look
// like tNN.<domain>, full-size hosts like imgNN.<domain>, for any domain below.
var PIXHOST_DOMAINS = ['pixhost.to', 'pixhost.cc', 'pixho.st'];
var PIXHOST_THUMB_HOST_RE = new RegExp('^t(\\d+)\\.(' +
    PIXHOST_DOMAINS.map(d => d.replace(/\./g, '\\.')).join('|') + ')$', 'i');
var THUMB_PREVIEW_DELAY_MS = 150; // wait before showing, so sweeping the mouse across a grid doesn't flash popups
var THUMB_PREVIEW_MARGIN = 16;    // gap between cursor / viewport edges and the popup

// Thumbnail URL -> full-size URL, or null if it isn't a recognised thumbnail.
function thumbToFullUrl(url) {
    if (!url) return null;
    try {
        var u = new URL(url, location.href);

        // hamsterimg (Chevereto): name.th.ext / name.md.ext -> name.ext
        if (u.hostname.endsWith(THUMB_HOSTS.HAMSTER) && /\.(th|md)\.[a-z0-9]+$/i.test(u.pathname)) {
            u.pathname = u.pathname.replace(/\.(th|md)\.([a-z0-9]+)$/i, '.$2');
            return u.toString();
        }

        // imgbox: thumbsN.imgbox.com/.../ID_t.ext -> imagesN.imgbox.com/.../ID_o.ext
        if (u.hostname.endsWith(THUMB_HOSTS.IMGBOX) && /^thumbs/.test(u.hostname) && /_t\.[a-z0-9]+$/i.test(u.pathname)) {
            u.hostname = u.hostname.replace(/^thumbs/, 'images');
            u.pathname = u.pathname.replace(/_t\.([a-z0-9]+)$/i, '_o.$1');
            return u.toString();
        }

        // pixhost (any mirror): tNN.<domain>/thumbs/... -> imgNN.<domain>/images/...
        // Stays on the same mirror domain the thumbnail came from.
        var pm = u.hostname.match(PIXHOST_THUMB_HOST_RE);
        if (pm && u.pathname.startsWith('/thumbs/')) {
            u.hostname = 'img' + pm[1] + '.' + pm[2].toLowerCase();
            u.pathname = u.pathname.replace(/^\/thumbs\//, '/images/');
            return u.toString();
        }
    } catch (e) { /* not a valid URL */ }
    return null;
}

function initThumbHoverPreview() {
    var style = document.createElement('style');
    style.id = 'abf-thumb-preview-style';
    style.textContent = `
        #abf-thumb-preview {
            position: fixed;
            z-index: 2147483000;
            display: none;
            pointer-events: none;
            padding: 4px;
            background: #111;
            border: 1px solid #444;
            border-radius: 6px;
            box-shadow: 0 6px 24px rgba(0,0,0,0.6);
        }
        #abf-thumb-preview img {
            display: block;
            max-width: none;
            max-height: none;
            border-radius: 3px;
        }
        #abf-thumb-preview .abf-tp-status {
            color: #ddd;
            font: 12px/1.4 sans-serif;
            padding: 6px 10px;
            white-space: nowrap;
        }
    `;
    document.head.appendChild(style);

    var popup = document.createElement('div');
    popup.id = 'abf-thumb-preview';
    var status = document.createElement('div');
    status.className = 'abf-tp-status';
    var popupImg = document.createElement('img');
    popupImg.alt = '';
    popup.append(status, popupImg);
    document.body.appendChild(popup);

    var currentThumb = null;
    var showTimer = null;
    var lastX = 0, lastY = 0;

    // Put the popup on whichever side of the cursor has more room, scaled to fit the viewport.
    function position() {
        if (popup.style.display === 'none') return;
        var vw = document.documentElement.clientWidth;
        var vh = document.documentElement.clientHeight;
        var M = THUMB_PREVIEW_MARGIN;

        if (popupImg.style.display !== 'none' && popupImg.naturalWidth) {
            var spaceRight = vw - lastX - M * 2;
            var spaceLeft = lastX - M * 2;
            var availW = Math.max(spaceRight, spaceLeft) - 10; // 10 = popup padding + border
            var availH = vh - M * 2 - 10;
            var scale = Math.min(1, availW / popupImg.naturalWidth, availH / popupImg.naturalHeight);
            popupImg.style.width = Math.round(popupImg.naturalWidth * scale) + 'px';
            popupImg.style.height = Math.round(popupImg.naturalHeight * scale) + 'px';
        }

        var w = popup.offsetWidth, h = popup.offsetHeight;
        var left = (lastX + M + w <= vw - M || lastX < vw / 2) ? lastX + M : lastX - M - w;
        var top = lastY - h / 2;
        left = Math.max(M, Math.min(left, vw - w - M));
        top = Math.max(M, Math.min(top, vh - h - M));
        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
    }

    function hide() {
        clearTimeout(showTimer);
        showTimer = null;
        currentThumb = null;
        popup.style.display = 'none';
        popupImg.onload = popupImg.onerror = null;
        popupImg.removeAttribute('src');
    }

    function show(thumb, fullUrl) {
        status.textContent = 'Loading full size…';
        status.style.display = '';
        popupImg.style.display = 'none';
        popup.style.display = 'block';
        position();

        popupImg.onload = function () {
            if (currentThumb !== thumb) return;
            status.style.display = 'none';
            popupImg.style.display = 'block';
            position();
        };
        popupImg.onerror = function () {
            if (currentThumb !== thumb) return;
            status.textContent = 'Full-size image not available';
            position();
        };
        popupImg.src = fullUrl;
    }

    document.addEventListener('mouseover', function (e) {
        var img = e.target;
        if (!(img instanceof HTMLImageElement) || img === popupImg || img === currentThumb) return;
        var fullUrl = thumbToFullUrl(img.currentSrc || img.src);
        if (!fullUrl || fullUrl === img.src) return;

        hide();
        currentThumb = img;
        lastX = e.clientX;
        lastY = e.clientY;
        showTimer = setTimeout(function () {
            if (currentThumb === img) show(img, fullUrl);
        }, THUMB_PREVIEW_DELAY_MS);
    }, true);

    document.addEventListener('mousemove', function (e) {
        if (!currentThumb) return;
        lastX = e.clientX;
        lastY = e.clientY;
        position();
    }, { passive: true });

    document.addEventListener('mouseout', function (e) {
        if (currentThumb && e.target === currentThumb) hide();
    }, true);

    // Clicking a thumb usually opens a lightbox / navigates — get out of the way.
    document.addEventListener('mousedown', hide, true);
    window.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('blur', hide);
}

// ── Full-size images in place ────────────────────────────────────────────────
// Swaps every known-host thumbnail on the page for its full-size image (same
// thumbToFullUrl() mapping the hover preview uses).
//  - Each image is shown inside a max box (thumbFullSizeMaxWidth x
//    thumbFullSizeMaxHeight, set from the Tampermonkey menu), keeping its aspect
//    ratio and never wider than its container.
//  - The link around the thumbnail (to the host's "view image" page) is removed;
//    instead, clicking an image that's shown smaller than its real size opens it
//    in the site's own lightbox — the same full view the cover image uses.
//  - If a full-size image fails to load, the thumbnail and its link are restored.

// Links we must not unwrap: the file tree's Fancybox gallery uses these.
function isProtectedLink(a) {
    return a.hasAttribute('data-fancybox');
}

// Remove a link that wraps the image, keeping its contents in place.
// Returns a function that puts the link back, or null if there was no link.
function unwrapImageLink(img) {
    var a = img.closest('a[href]');
    if (!a || isProtectedLink(a)) return null;

    var marker = document.createComment('abf-unwrapped-link');
    var children = Array.from(a.childNodes);
    a.replaceWith(marker);
    marker.after(...children);

    return function restore() {
        if (!marker.parentNode) return;
        children.forEach(c => a.appendChild(c));
        marker.replaceWith(a);
    };
}

// Hand clicks to the site's lightbox (runs in the page, where `lightbox` lives).
// Its second argument is the size threshold: it only opens when the image's real
// width is larger, so passing the current on-screen width means "open whenever
// the image is being shown scaled down". The original handler is kept for restore.
function useSiteLightbox(img) {
    img.dataset.abfOrigOnclick = img.getAttribute('onclick') || '';
    img.setAttribute('onclick', 'if (window.lightbox) lightbox.init(this, this.clientWidth);');
}

function markIfScaledDown(img) {
    img.classList.toggle('abf-full-size-zoomable',
        !!img.naturalWidth && img.clientWidth > 0 && img.clientWidth < img.naturalWidth);
}

function swapThumbToFull(img) {
    if (img.dataset.abfFullSize) return; // already handled
    var thumbUrl = img.getAttribute('src');
    var fullUrl = thumbToFullUrl(thumbUrl);
    if (!fullUrl || fullUrl === img.src) return;

    img.dataset.abfFullSize = '1';
    img.classList.add('abf-full-size');
    var link = img.closest('a[href]');
    var keepsOwnViewer = !!link && isProtectedLink(link); // e.g. file tree gallery: leave its click behaviour alone
    var restoreLink = keepsOwnViewer ? null : unwrapImageLink(img);
    if (!keepsOwnViewer) useSiteLightbox(img);

    function onLoad() { markIfScaledDown(img); }
    function revert() {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', revert);
        img.classList.remove('abf-full-size', 'abf-full-size-zoomable');
        if (!keepsOwnViewer) {
            if (img.dataset.abfOrigOnclick) img.setAttribute('onclick', img.dataset.abfOrigOnclick);
            else img.removeAttribute('onclick');
        }
        if (restoreLink) restoreLink();
        img.src = thumbUrl;
    }
    img.addEventListener('load', onLoad);
    img.addEventListener('error', revert);
    img.src = fullUrl;
}

function initFullSizeImages() {
    var maxW = parseInt(getSetting('thumbFullSizeMaxWidth'), 10) || DEFAULT_SETTINGS.thumbFullSizeMaxWidth;
    var maxH = parseInt(getSetting('thumbFullSizeMaxHeight'), 10) || DEFAULT_SETTINGS.thumbFullSizeMaxHeight;

    var style = document.createElement('style');
    style.id = 'abf-full-size-style';
    style.textContent = `
        img.abf-full-size {
            max-width: min(100%, ${maxW}px) !important;
            max-height: ${maxH}px !important;
            height: auto;
            object-fit: contain;
        }
        img.abf-full-size-zoomable { cursor: zoom-in; }
    `;
    document.head.appendChild(style);

    document.querySelectorAll('img[src]').forEach(swapThumbToFull);

    // Catch images the site (or this script) adds later.
    new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
            m.addedNodes.forEach(function (node) {
                if (node.nodeType !== 1) return;
                if (node.tagName === 'IMG') swapThumbToFull(node);
                else if (node.querySelectorAll) node.querySelectorAll('img[src]').forEach(swapThumbToFull);
            });
        });
    }).observe(document.body, { childList: true, subtree: true });

    // Whether an image counts as "scaled down" depends on the window width.
    var resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            document.querySelectorAll('img.abf-full-size').forEach(markIfScaledDown);
        }, 150);
    });
}

// Ask for a new max box, e.g. "800x800". Returns true if something was saved.
function promptFullSizeMaxDimensions() {
    var current = getSetting('thumbFullSizeMaxWidth') + 'x' + getSetting('thumbFullSizeMaxHeight');
    var answer = prompt('Max size for full-size images, as WIDTHxHEIGHT in pixels (e.g. 800x800):', current);
    if (answer === null) return false;
    var m = answer.trim().match(/^(\d{2,5})\s*[x×*,]\s*(\d{2,5})$/i);
    if (!m) {
        alert('Couldn\'t read "' + answer + '". Use the format WIDTHxHEIGHT, e.g. 800x800.');
        return false;
    }
    setSetting('thumbFullSizeMaxWidth', parseInt(m[1], 10));
    setSetting('thumbFullSizeMaxHeight', parseInt(m[2], 10));
    return true;
}

// Initialised here (before the file tree code) so they work even on pages without a file list.
// The two are mutually exclusive: with full-size images on, there's nothing left to preview.
if (getSetting('thumbFullSizeEnabled')) {
    initFullSizeImages();
} else if (getSetting('thumbHoverPreviewEnabled')) {
    initThumbHoverPreview();
}


// ── Changelog / "What's New" ────────────────────────────────────────────────

const SCRIPT_VERSION = (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script.version : '1.5';

const CHANGELOG_URL = 'https://raw.githubusercontent.com/edstagdh/Userscripts/refs/heads/master/EMP_HF/ABF_Changelog.md';
var changelogCache = null; // parsed [{version, date, changes:[...]}] once fetched this session
var changelogModalEl = null;

function parseChangelogMarkdown(md) {
    var lines = md.split(/\r?\n/);
    var entries = [];
    var current = null;
    lines.forEach(line => {
        var headerMatch = line.match(/^##\s*v?([0-9][0-9.]*)\s*(?:-\s*(.+))?\s*$/i);
        if (headerMatch) {
            current = { version: headerMatch[1], date: (headerMatch[2] || '').trim(), changes: [] };
            entries.push(current);
            return;
        }
        var itemMatch = line.match(/^\s*[-*]\s+(.*\S)\s*$/);
        if (itemMatch && current) {
            current.changes.push(itemMatch[1]);
        }
    });
    return entries.filter(e => e.changes.length);
}

function findChangelogIndexForVersion(entries, version) {
    for (var i = 0; i < entries.length; i++) {
        if (entries[i].version === version) return i;
    }
    return -1;
}

function fetchChangelog(callback) {
    if (changelogCache) { callback(changelogCache, null); return; }
    if (typeof GM_xmlhttpRequest !== 'function') { callback(null, 'GM_xmlhttpRequest not available'); return; }
    GM_xmlhttpRequest({
        method: 'GET',
        url: CHANGELOG_URL,
        onload: function (res) {
            if (res.status < 200 || res.status >= 300) { callback(null, 'HTTP ' + res.status); return; }
            try {
                var parsed = parseChangelogMarkdown(res.responseText);
                changelogCache = parsed;
                callback(parsed, null);
            } catch (e) {
                callback(null, 'Parse error: ' + e.message);
            }
        },
        onerror: function () { callback(null, 'Network error fetching changelog'); },
        ontimeout: function () { callback(null, 'Timed out fetching changelog'); },
        timeout: 10000,
    });
}

// Number of versions to show in the manual "Show Changelog" view (newest first,
// starting from the installed version).
const CHANGELOG_HISTORY_DEPTH = 3;

// Styled to match the "What's New" popup in [HF][EMP] Advanced Viewer Experience.
// Uses its own abf-cl-* ids so both scripts can run on the same page without clashing.
function injectChangelogStyle() {
    if (document.getElementById('abf-cl-style')) return;
    var style = document.createElement('style');
    style.id = 'abf-cl-style';
    style.textContent = `
#abf-cl-backdrop {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.78); z-index: 999997; backdrop-filter: blur(2px);
}
#abf-cl-backdrop.active { display: flex; align-items: center; justify-content: center; }
#abf-cl-modal {
    position: relative; background: #1a1a1a;
    border: 1px solid #3a3a3a; border-radius: 8px;
    width: 560px; max-width: 96vw; max-height: 86vh;
    overflow-y: auto; color: #d0d0d0;
    font-family: inherit; font-size: 12px; text-align: left;
    box-shadow: 0 10px 50px rgba(0,0,0,0.8); z-index: 999998;
}
#abf-cl-modal .abf-cl-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px 12px; border-bottom: 1px solid #2e2e2e;
    position: sticky; top: 0; background: #1a1a1a; z-index: 1;
    gap: 10px;
}
#abf-cl-modal .abf-cl-header-left { display: flex; flex-direction: column; gap: 2px; }
#abf-cl-modal .abf-cl-header h2 {
    margin: 0; padding: 0; border: none; background: none;
    font-size: 14px; font-weight: 800;
    color: #f0f0f0; letter-spacing: 0.04em; text-transform: uppercase;
}
#abf-cl-modal .abf-cl-header .abf-cl-subtitle {
    font-size: 10px; color: #666; letter-spacing: 0.02em;
}
#abf-cl-modal .abf-cl-body { padding: 14px 18px 6px; }
#abf-cl-modal .abf-cl-version-block { margin-bottom: 18px; }
#abf-cl-modal .abf-cl-version-block:last-child { margin-bottom: 0; }
#abf-cl-modal .abf-cl-version-label {
    display: inline-block;
    font-size: 10px; font-weight: 800; letter-spacing: 0.08em;
    text-transform: uppercase; color: #7ec87e;
    background: #1a2e1a; border: 1px solid #2e5e2e;
    padding: 2px 8px; border-radius: 3px; margin-bottom: 8px;
}
#abf-cl-modal .abf-cl-version-date { font-size: 10px; color: #777; margin-left: 8px; }
#abf-cl-modal .abf-cl-changes {
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column; gap: 5px;
}
#abf-cl-modal .abf-cl-changes li {
    display: flex; gap: 8px; align-items: flex-start;
    font-size: 11px; color: #c0c0c0; line-height: 1.5;
    margin: 0; padding: 0; list-style: none;
}
#abf-cl-modal .abf-cl-changes li::before {
    content: '→'; color: #5a8a5a; font-weight: 700;
    flex-shrink: 0;
}
#abf-cl-modal .abf-cl-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 18px 16px; border-top: 1px solid #2e2e2e; margin-top: 10px;
    position: sticky; bottom: 0; background: #1a1a1a; gap: 10px;
    flex-wrap: wrap;
}
#abf-cl-modal .abf-cl-github-link {
    font-size: 11px; color: #5a7a9a; text-decoration: none; font-weight: 600;
}
#abf-cl-modal .abf-cl-github-link:hover { color: #7aa0c8; text-decoration: underline; }
#abf-cl-modal .abf-cl-ok-btn {
    padding: 6px 22px; font-size: 12px; font-weight: 700;
    border-radius: 4px; cursor: pointer;
    background: #2d4a2d; border: 1px solid #4a7a4a; color: #8fc88f;
    transition: background 0.15s, color 0.15s; letter-spacing: 0.03em;
}
#abf-cl-modal .abf-cl-ok-btn:hover { background: #3a5e3a; color: #aedaae; border-color: #6aaa6a; }
#abf-cl-modal .abf-cl-update-banner {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; color: #f0d080;
    background: #2e2810; border: 1px solid #6a5a1a;
    border-radius: 8px; padding: 8px 10px; margin-bottom: 14px;
}
#abf-cl-modal .abf-cl-loading, #abf-cl-modal .abf-cl-error {
    font-size: 12px; color: #999; padding: 4px 0;
}
#abf-cl-modal .abf-cl-error { color: #d09090; }
#abf-cl-modal .abf-cl-more {
    font-size: 11px; color: #777; padding: 10px 0 2px;
    border-top: 1px solid #2a2a2a; margin-top: 4px;
}
#abf-cl-modal .abf-cl-more a { color: #5a7a9a; text-decoration: none; }
#abf-cl-modal .abf-cl-more a:hover { color: #7aa0c8; text-decoration: underline; }
`;
    document.head.appendChild(style);
}

function onChangelogKeydown(e) {
    if (e.key === 'Escape') dismissChangelog();
}

function ensureChangelogModal() {
    if (changelogModalEl) return;
    injectChangelogStyle();

    changelogModalEl = document.createElement('div');
    changelogModalEl.id = 'abf-cl-backdrop';
    changelogModalEl.innerHTML = `
        <div id="abf-cl-modal">
            <div class="abf-cl-header">
                <div class="abf-cl-header-left">
                    <h2>&#127381; What's New</h2>
                    <span class="abf-cl-subtitle">[HF][EMP] Advanced Better filelist &mdash; currently v${SCRIPT_VERSION}</span>
                </div>
            </div>
            <div class="abf-cl-body" id="abf-cl-body-content"></div>
            <div class="abf-cl-footer">
                <a class="abf-cl-github-link" href="https://github.com/edstagdh/Userscripts" target="_blank" rel="noopener noreferrer">
                    &#128279; View on GitHub
                </a>
                <button type="button" class="abf-cl-ok-btn" id="abf-cl-ok-btn">OK, got it</button>
            </div>
        </div>
    `;
    document.body.appendChild(changelogModalEl);

    changelogModalEl.addEventListener('click', function (e) { if (e.target === this) dismissChangelog(); });
    changelogModalEl.querySelector('#abf-cl-ok-btn').addEventListener('click', dismissChangelog);
}

function openChangelog() {
    ensureChangelogModal();
    changelogModalEl.classList.add('active');
    document.addEventListener('keydown', onChangelogKeydown);
}

function dismissChangelog() {
    if (changelogModalEl) changelogModalEl.classList.remove('active');
    document.removeEventListener('keydown', onChangelogKeydown);
}

function renderChangelogBody(versionsToShow, errorMsg, updateAvailableVersion, hasMore) {
    var html = '';
    if (updateAvailableVersion) {
        html += `<div class="abf-cl-update-banner">&#128276; A newer version (v${updateAvailableVersion}) is available on GitHub — you're currently on v${SCRIPT_VERSION}.</div>`;
    }
    if (errorMsg) {
        html += `<div class="abf-cl-error">Couldn't load the changelog (${errorMsg}). Check the GitHub repo directly for the latest version history.</div>`;
    } else if (!versionsToShow || !versionsToShow.length) {
        html += `<div class="abf-cl-error">No changelog entries found.</div>`;
    } else {
        html += versionsToShow.map(entry => `
            <div class="abf-cl-version-block">
                <span class="abf-cl-version-label">v${entry.version}</span>
                ${entry.date ? `<span class="abf-cl-version-date">${entry.date}</span>` : ''}
                <ul class="abf-cl-changes">${entry.changes.map(c => `<li>${c}</li>`).join('')}</ul>
            </div>
        `).join('');

        if (hasMore) {
            html += `<div class="abf-cl-more">Showing the ${versionsToShow.length} most recent versions &mdash; <a href="${CHANGELOG_URL}" target="_blank" rel="noopener noreferrer">see full version history on GitHub</a>.</div>`;
        }
    }
    changelogModalEl.querySelector('#abf-cl-body-content').innerHTML = html;
}

function showChangelogModal() {
    openChangelog();
    changelogModalEl.querySelector('#abf-cl-body-content').innerHTML =
        '<div class="abf-cl-loading">Loading changelog&hellip;</div>';

    fetchChangelog((entries, err) => {
        if (err) { renderChangelogBody(null, err, null); return; }

        var currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
        var updateAvailableVersion = currentIdx > 0 ? entries[0].version : null;

        // Start from the installed version if we can find it, otherwise from the top
        var startIdx = currentIdx === -1 ? 0 : currentIdx;
        var toShow = entries.slice(startIdx, startIdx + CHANGELOG_HISTORY_DEPTH);
        var hasMore = entries.length > startIdx + CHANGELOG_HISTORY_DEPTH;

        renderChangelogBody(toShow, null, updateAvailableVersion, hasMore);
    });
}

function checkVersionUpdate() {
    if (typeof GM_getValue === 'undefined' || typeof GM_setValue === 'undefined') return;

    var lastVersion = GM_getValue('abf_last_version', null);
    if (lastVersion === SCRIPT_VERSION) return;
    GM_setValue('abf_last_version', SCRIPT_VERSION);

    fetchChangelog((entries, err) => {
        if (err) return; // stay quiet on auto-check failures; the manual menu command still works
        var currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
        // Only ever show changes up through the version actually running right now —
        // entries above currentIdx belong to a newer release we haven't been updated to yet.
        var availableEntries = currentIdx === -1 ? entries : entries.slice(currentIdx);
        var toShow;
        if (!lastVersion) {
            toShow = availableEntries.length ? [availableEntries[0]] : [];
        } else {
            toShow = [];
            for (var i = 0; i < availableEntries.length; i++) {
                if (availableEntries[i].version === lastVersion) break;
                toShow.push(availableEntries[i]);
            }
            if (!toShow.length && availableEntries.length) toShow = [availableEntries[0]];
        }
        if (!toShow.length) return;
        var updateAvailableVersion = currentIdx > 0 ? entries[0].version : null;

        openChangelog();
        renderChangelogBody(toShow, null, updateAvailableVersion);
    });
}

const combinedPattern = new RegExp(
    '(?:_?(?:thumb|screen|preview|s)s?)?\.(?:jpg|jpeg|webp|bmp|png|gif|mp4|avi|m4v|mpg|mpeg|mkv|mov|wmv|flv|vob)', 'ig');

function nameHash(name) {
    var hash = name.toLowerCase();
    hash = hash.replaceAll(combinedPattern, '');
    hash = hash.replaceAll(/[\W_\[\]]/g, '');
    return hash;
}


function tree(folder) {
    var folders = [];
    var files = [];
    folder.files.forEach(f => {
        if (/\//.test(f.name)) {
            var levels = f.name.split('/');
            var currentLevel = levels.shift();
            f.name = levels.join('/');
            var existing = folders.find(fold => fold.name == currentLevel);
            if (existing) {
                existing.files.push(f);
            } else {
                var newFolder = {};
                newFolder.name = currentLevel;
                newFolder.files = [f];
                folders.push(newFolder);
            }
        } else {
            f.url = urlMap[nameHash(f.name)];
            files.push(f);
        }
    });
    folder.folders = folders;
    folder.files = files;
    folders.forEach(tree);
    folder.byteSize = folderSize(folder);
    return folder;
}


function folderSize(folder) {
    var fileSize = folder.files.reduce((currentSize, file) => currentSize + file.byteSize, 0);
    if (folder.folders.length) {
        return fileSize + folder.folders.reduce((currentSize, folder) => currentSize + folderSize(folder), 0);
    } else {
        return fileSize;
    }
}


function sizeInBytes(ssize) {
    ssize = ssize.replace(',', '');
    var number, unit;
    [number, unit] = ssize.split(' ');
    number = +number;
    var suffixes = { KiB: 1024, MiB: 1024 * 1024, GiB: 1024 * 1024 * 1024, TiB: 1024 * 1024 * 1024 * 1024 };
    return number * suffixes[unit] || number;
}


function formatBytes(bytes) {
    if (bytes == 0) return '0 Bytes';
    var k = 1024;
    var sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}


function ce(type, className) {
    var e = document.createElement(type);
    e.className = className || '';
    return e;
}


function getFileType(fileName) {
    var type;
    type = fileName.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i);
    if (type) return `icon_files_image file_type_${type[1]}`;
    type = fileName.match(/\.(mp4|avi|m4v|mpg|mpeg|mkv|mov|wmv|flv)$/i);
    if (type) return `icon_files_video file_type_${type[1]}`;
    type = fileName.match(/\.(txt|srt)$/i);
    if (type) return `icon_files_text file_type_${type[1]}`;
    type = fileName.match(/\.(zip|rar|7z)$/i);
    if (type) return `icon_files_compressed file_type_${type[1]}`;
    type = fileName.match(/\.(iso|vob)$/i);
    if (type) return `icon_files_disc file_type_${type[1]}`;
    type = fileName.match(/\.(mp3|wav|flac|m4a|wma|aac)$/i);
    if (type) return `icon_files_audio file_type_${type[1]}`;
    type = fileName.match(/\.(exe|apk)$/i);
    if (type) return `icon_files_executable file_type_${type[1]}`;
    return 'icon_files_unknown';
}


function makeFolderDom(folder) {
    var folderElement = ce('div', 'folder');
    folderElement.dataset.name = folder.name;
    var folderDetails = ce('div', 'folder_details folder_closed tree_item');
    var contains = '';
    if (folder.files.length > 1) {
        contains = `${folder.files.length} files`;
    } else if (folder.files.length == 1) {
        contains = '1 file';
    } else if (!folder.files.length && !folder.folders.length) {
        contains = 'empty';
    }
    folderDetails.innerHTML = `<span class="folder_name">${folder.name}</span>
        <span class="folder_files">${contains}</span>
        <span class="folder_size">${formatBytes(folder.byteSize)}</span>`;
    folderElement.append(folderDetails);
    var container = ce('div', 'folder_container');
    folderDetails.addEventListener('click', toggleCollapsed);
    if (folder.folders.length) {
        var folderList = ce('ul', 'folder_list');
        for (var f of folder.folders) {
            var foldi = ce('li', 'folder_item');
            foldi.appendChild(makeFolderDom(f));
            folderList.append(foldi);
        }
        container.append(folderList);
    }
    if (folder.files.length) {
        var fileList = ce('ul', 'file_list');
        for (var file of folder.files) {
            var filei = ce('li', 'file_item tree_item');
            var istack = ce('div', 'icon_stack');
            var icon = ce('i', `font_icon file_icons ${getFileType(file.name)}`);
            istack.append(icon);
            filei.append(istack);
            var fname = ce('span', 'file_name');
            fname.innerText = file.name;
            if (file.url) {
                var preview = ce('a', 'file_preview');
                preview.href = file.url;
                preview.dataset.caption = folder.name == '/' ? `${file.name}` : `${folder.name} / ${file.name}`;
                preview.dataset.fancybox = `${folder.name}`;
                preview.append(fname);
                filei.append(preview);
            } else {
                filei.append(fname);
            }
            var fsize = ce('span', 'file_size');
            fsize.innerText = file.size;
            filei.append(fsize);
            fileList.append(filei);
        }
        container.append(fileList);
    }
    folderElement.append(container);
    return folderElement;
}


function toggleCollapsed(e) {
    this.classList.toggle('folder_open');
    this.classList.toggle('folder_closed');
}


function createTree() {
    var treeContainer = ce('div', 'tree_container');
    treeContainer.append(makeFolderDom(root));
    var firstFolder = treeContainer.querySelector('.folder_closed');
    firstFolder.classList.remove('folder_closed');
    firstFolder.classList.add('folder_open');

    // click-to-search delegation — lives on the container so it survives re-sorts
    treeContainer.addEventListener('click', function (e) {
        if (!clickSearchMode) return;
        var fileNameEl = e.target.closest('.file_name');
        if (!fileNameEl) return;
        e.preventDefault();
        e.stopPropagation();
        var rawName = fileNameEl.textContent.trim();
        var nameWithoutExt = rawName.replace(/\.[^.]+$/, '');
        var searchUrl = window.location.origin + '/torrents.php?searchtext=' + encodeURIComponent(nameWithoutExt);
        window.open(searchUrl, '_blank');
    });

    return treeContainer;
}


function clearFilter(e) {
    if (e.key != "Escape") return;
    e.target.value = '';
    applyFilters();
}


// ── Multi-keyword helpers ─────────────────────────────────────────────────────

function getSearchTerms(value) {
    if (multiKeywordMode) {
        return value.trim().split(/\s+/).filter(Boolean).map(escapeRegex);
    }
    return [value];
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesAllTerms(text, terms) {
    var flags = caseSensitive ? '' : 'i';
    return terms.every(term => new RegExp(term, flags).test(text));
}

function wrapAllMatches(text, terms) {
    var flags = caseSensitive ? 'g' : 'gi';
    var result = text;
    terms.forEach(term => {
        var re = new RegExp(term, flags);
        result = result.replace(re, match => {
            var span = ce('span', 'filter_match');
            span.textContent = match;
            return span.outerHTML;
        });
    });
    return result;
}


// ── File type panel ───────────────────────────────────────────────────────────

function collectFileTypes(folder, types) {
    folder.files.forEach(f => {
        var ext = f.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
        if (ext) types.add(ext);
    });
    folder.folders.forEach(sub => collectFileTypes(sub, types));
    return types;
}

function updateTypeButton() {
    var btn = document.querySelector('.header_types_toggle');
    if (!btn) return;
    var count = hiddenFileTypes.size;
    if (count > 0) {
        btn.classList.add('types_active');
        btn.dataset.hidden = count;
    } else {
        btn.classList.remove('types_active');
        delete btn.dataset.hidden;
    }
}

function buildTypePanel(types) {
    var panel = ce('div', 'types_panel hidden');
    var panelHeader = ce('div', 'types_panel_header');
    var panelTitle = ce('span', 'types_panel_title');
    panelTitle.innerText = 'Filter by file type:';
    var btnAll = ce('button', 'types_btn');
    btnAll.type = 'button';
    btnAll.innerText = '✔ All';
    var btnNone = ce('button', 'types_btn');
    btnNone.type = 'button';
    btnNone.innerText = '✖ None';
    panelHeader.append(panelTitle, btnAll, btnNone);
    panel.append(panelHeader);

    var grid = ce('div', 'types_grid');
    var sortedTypes = [...types].sort();

    sortedTypes.forEach(ext => {
        var label = ce('label', 'type_label');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.value = ext;
        cb.addEventListener('change', function () {
            if (this.checked) hiddenFileTypes.delete(ext);
            else hiddenFileTypes.add(ext);
            updateTypeButton();
            applyFilters();
        });
        var icon = ce('i', 'font_icon file_icons ' + getFileType('file.' + ext));
        label.append(cb, icon, document.createTextNode('\u00a0' + ext));
        grid.append(label);
    });

    panel.append(grid);

    btnAll.addEventListener('click', () => {
        hiddenFileTypes.clear();
        grid.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
        updateTypeButton();
        applyFilters();
    });
    btnNone.addEventListener('click', () => {
        sortedTypes.forEach(ext => hiddenFileTypes.add(ext));
        grid.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
        updateTypeButton();
        applyFilters();
    });

    return panel;
}


// ── Unified filter ────────────────────────────────────────────────────────────

function applyFilters() {
    var container = document.querySelector('.tree_container');
    if (!container) return;

    var keywordInput = document.querySelector('.header_filter');
    var sizeInput = document.querySelector('.header_size_filter');
    var keywordValue = keywordInput ? keywordInput.value : '';
    var sizeValue = sizeInput ? sizeInput.value.trim().replace(/,/g, '') : '';

    var hasKeyword = keywordValue.length > 0;
    var hasSize = sizeValue.length > 0;
    var hasTypeFilter = hiddenFileTypes.size > 0;

    container.classList.add('hidden');
    container.querySelectorAll('.hidden, .folder_force_open, .file_found').forEach(f => {
        f.classList.remove('hidden', 'folder_force_open', 'file_found');
    });
    container.querySelectorAll('.filter_match').forEach(m => m.outerHTML = m.textContent);
    container.querySelectorAll('.size_match').forEach(el => el.classList.remove('size_match'));

    if (!hasKeyword && !hasSize && !hasTypeFilter) {
        container.classList.remove('hidden');
        return;
    }

    var terms = hasKeyword ? getSearchTerms(keywordValue) : [];

    container.querySelectorAll('.file_item').forEach(fileItem => {
        var fileNameEl = fileItem.querySelector('.file_name');
        var fileSizeEl = fileItem.querySelector('.file_size');
        var fileName = fileNameEl ? fileNameEl.textContent : '';
        var fileSize = fileSizeEl ? fileSizeEl.textContent.replace(/,/g, '') : '';

        // size comparison respects case sensitivity for unit strings (e.g. GiB vs gib)
        var sizeOk = !hasSize || (caseSensitive
            ? fileSize.includes(sizeValue)
            : fileSize.toLowerCase().includes(sizeValue.toLowerCase()));

        var ext = fileName.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || '';
        var typeOk = !hasTypeFilter || !hiddenFileTypes.has(ext);
        var keywordOk = !hasKeyword || matchesAllTerms(fileName, terms);

        if (typeOk && sizeOk && keywordOk) {
            fileItem.classList.remove('hidden');
            fileItem.classList.add('file_found');
            if (hasKeyword) {
                var el = fileNameEl.querySelector('a') || fileNameEl;
                el.innerHTML = wrapAllMatches(el.innerText, terms);
            }
            if (hasSize && fileSizeEl) {
                fileSizeEl.classList.add('size_match');
            }
        } else {
            fileItem.classList.add('hidden');
            fileItem.classList.remove('file_found');
        }
    });

    container.querySelectorAll('.folder').forEach(folder => {
        var found = folder.querySelector('.file_found');
        var folderNameEl = folder.querySelector('.folder_name');
        var folderNameHit = hasKeyword && folderNameEl && matchesAllTerms(folderNameEl.textContent, terms);

        if (found || folderNameHit) {
            folder.classList.remove('hidden');
            folder.classList.add('file_found');
            if (found) folder.querySelector('.folder_details').classList.add('folder_force_open');
            if (folderNameHit && folderNameEl) {
                var el = folderNameEl.querySelector('a') || folderNameEl;
                el.innerHTML = wrapAllMatches(el.innerText, terms);
            }
        } else {
            folder.classList.remove('file_found');
            folder.classList.add('hidden');
        }
    });

    container.querySelector('.folder')?.classList.remove('hidden');
    container.classList.remove('hidden');
}


function wrapMatch(text, match) {
    var matchElement = ce('span', 'filter_match');
    matchElement.textContent = match[0];
    return text.replaceAll(match, matchElement.outerHTML);
}


function expandAllFolders(e) {
    e.preventDefault();
    var closedFolders = document.querySelectorAll('.folder_closed');
    var openFolders = [...document.querySelectorAll('.folder_open')].slice(1);
    if (e.target.dataset.collapsed == 'collapsed') {
        closedFolders.forEach(f => { f.classList.add('folder_open'); f.classList.remove('folder_closed'); });
        e.target.dataset.collapsed = 'expanded';
        e.target.innerText = e.target.innerText.replace('📁Expand', '📂Collapse');
    } else if (e.target.dataset.collapsed == 'expanded') {
        openFolders.forEach(f => { f.classList.add('folder_closed'); f.classList.remove('folder_open'); });
        e.target.dataset.collapsed = 'collapsed';
        e.target.innerText = e.target.innerText.replace('📂Collapse', '📁Expand');
    }
}


function list2Tree() {
    var tabl = fileList.querySelector('table');
    var rows = [...tabl.rows];

    root.name = rows[0].innerText.trim();
    root.files = rows.slice(2).map(r => {
        var tdata = r.querySelectorAll('td');
        return {
            name: tdata[0].innerText.trim(),
            size: tdata[1].innerText.trim(),
            byteSize: sizeInBytes(tdata[1].innerText.trim())
        };
    });

    root = tree(root);
    tabl.style.display = 'none';

    var header = ce('div', 'tree_header colhead');
    var headerName = ce('span', 'header_name sort_ascending header_item');
    headerName.innerText = 'Name';
    headerName.addEventListener('click', sortTree);
    var headerFiles = ce('span', 'header_files header_item');
    headerFiles.innerText = 'Files';
    headerFiles.addEventListener('click', sortTree);
    var headerSize = ce('span', 'header_size header_item sort_ascending');
    headerSize.innerText = 'Size';
    headerSize.addEventListener('click', sortTree);
    headerName.dataset.type = 'header_name';
    headerFiles.dataset.type = 'header_files';
    headerSize.dataset.type = 'header_size';

    var tools = ce('span', 'header_tools');
    var expand = ce('a', 'header_expand');
    var multiToggle = ce('button', 'header_multi_toggle');
    var caseToggle = ce('button', 'header_case_toggle');
    var filterInput = ce('input', 'header_filter');
    var sizeFilterInput = ce('input', 'header_size_filter');
    var typesToggle = ce('button', 'header_types_toggle');
    var searchToggle = ce('button', 'header_search_toggle');
    var changelogToggle = ce('button', 'header_changelog_toggle');

    var allTypes = collectFileTypes(root, new Set());
    var typesPanel = buildTypePanel(allTypes);

    multiToggle.type = 'button';
    multiToggle.title = 'Toggle multi-keyword mode (space = AND)';
    multiToggle.innerText = '⊞ Multi';
    multiToggle.addEventListener('click', function () {
        multiKeywordMode = !multiKeywordMode;
        this.classList.toggle('multi_active', multiKeywordMode);
        if (filterInput.value.length > 0) applyFilters();
    });

    caseToggle.type = 'button';
    caseToggle.title = 'Toggle case-sensitive search';
    caseToggle.innerText = 'Aa';
    caseToggle.addEventListener('click', function () {
        caseSensitive = !caseSensitive;
        this.classList.toggle('case_active', caseSensitive);
        if (filterInput.value.length > 0 || sizeFilterInput.value.length > 0) applyFilters();
    });

    typesToggle.type = 'button';
    typesToggle.title = 'Filter by file type';
    typesToggle.innerText = '🗂 Types';
    typesToggle.addEventListener('click', () => typesPanel.classList.toggle('hidden'));

    searchToggle.type = 'button';
    searchToggle.title = 'Turn filenames in to "open a filename site search in a new tab"';
    searchToggle.innerText = '🔗 Search';
    searchToggle.addEventListener('click', function () {
        clickSearchMode = !clickSearchMode;
        this.classList.toggle('search_active', clickSearchMode);
        document.querySelector('.tree_container')?.classList.toggle('click_search_mode', clickSearchMode);
    });

    changelogToggle.type = 'button';
    changelogToggle.title = "Show changelog / what's new";
    changelogToggle.innerText = '📜';
    changelogToggle.addEventListener('click', () => showChangelogModal());

    expand.text = '(📁Expand all)';
    expand.href = '#';
    expand.title = 'Expand all folders';
    expand.dataset.collapsed = 'collapsed';
    expand.addEventListener('click', expandAllFolders);

    filterInput.placeholder = '🔍 Name';
    filterInput.type = 'search';
    filterInput.title = 'Enter File Name[freetext]';
    filterInput.addEventListener('input', applyFilters);
    filterInput.addEventListener('keyup', clearFilter);

    sizeFilterInput.placeholder = '📐 Size';
    sizeFilterInput.title = 'Enter File Size[freetext]';
    sizeFilterInput.type = 'search';
    sizeFilterInput.addEventListener('input', applyFilters);
    sizeFilterInput.addEventListener('keyup', clearFilter);

    tools.append(expand, multiToggle, caseToggle, filterInput, sizeFilterInput, typesToggle, searchToggle, changelogToggle);

    var headerLeft = ce('span', 'header_left');
    var headerRight = ce('span', 'header_right');
    headerLeft.append(headerName);
    headerRight.append(headerFiles, headerSize);
    header.append(headerLeft, tools, headerRight);

    fileList.append(header);
    fileList.append(typesPanel);

    var treeContainer = createTree();
    fileList.append(treeContainer);
    fileList.classList.remove('hidden');
}


function sortFolderSize(folder, ascending) {
    var direction = ascending ? 1 : -1;
    folder.files.sort((a, b) => direction * (b.byteSize - a.byteSize));
    folder.folders.sort((a, b) => direction * (b.byteSize - a.byteSize));
    folder.folders.forEach(f => sortFolderSize(f, ascending));
}

function sortFolderFiles(folder, ascending) {
    var direction = ascending ? 1 : -1;
    folder.folders.sort((a, b) => direction * (b.files.length - a.files.length));
    folder.folders.forEach(f => sortFolderFiles(f, ascending));
}

function sortFolderName(folder, ascending) {
    var direction = ascending ? -1 : 1;
    folder.files.sort((a, b) => direction * (a.name.localeCompare(b.name)));
    folder.folders.sort((a, b) => direction * (a.name.localeCompare(b.name)));
    folder.folders.forEach(f => sortFolderName(f, ascending));
}


function sortTree() {
    var isAscending = this.classList.contains('sort_ascending');
    if (isAscending) {
        this.classList.add('sort_descending');
        this.classList.remove('sort_ascending');
    } else {
        this.classList.add('sort_ascending');
        this.classList.remove('sort_descending');
    }
    var others = this.parentElement.querySelectorAll(`.header_item:not(.${this.dataset.type})`);
    for (var other of others) {
        other.classList.remove('sort_ascending', 'sort_descending');
    }
    document.querySelector('.tree_container').remove();
    if (this.classList.contains('header_name')) sortFolderName(root, isAscending);
    else if (this.classList.contains('header_files')) sortFolderFiles(root, isAscending);
    else if (this.classList.contains('header_size')) sortFolderSize(root, isAscending);
    var newTree = createTree();
    // re-apply click-search cursor class if mode is still on
    if (clickSearchMode) newTree.classList.add('click_search_mode');
    fileList.append(newTree);
}


function findThumbnails() {
    var images = document.querySelectorAll('a[data-fancybox]');
    images.forEach(i => {
        var url = i.href;
        var name = url.split('/').pop();
        urlMap[nameHash(name)] = url;
    });
}


function bindGallery() {
    if (!window.Fancybox) return;
    var fancyboxConfig = {
        wheel: "slide",
        animationDuration: 80,
        contentClick: "toggleCover",
        contentDblClick: "zoomToMax",
        Toolbar: {
            display: {
                left: ["infobar"],
                middle: ["zoomIn", "zoomOut", "toggle1to1", "rotateCCW", "rotateCW", "thumbs"],
                right: ["close"],
            },
        },
        Thumbs: { type: "classic", autoStart: false, showOnStart: false },
        Images: {
            Panzoom: { maxScale: 2, panMode: "mousemove", mouseMoveFriction: 0.2, mouseMoveFactor: 1.2 }
        }
    };
    document.querySelectorAll('.folder:has(.file_preview)').forEach(folder => {
        Fancybox.bind(`[data-fancybox="${folder.dataset.name}"]`, fancyboxConfig);
    });
}


var fileList = document.querySelector('div[id^="files_"]');
var fileListToggle = document.querySelector('a[onclick^="show_files"]');

if (!document.getElementById('filetree-toggle-style')) {
    var ftStyle = document.createElement('style');
    ftStyle.id = 'filetree-toggle-style';
    ftStyle.textContent = `
        .filetree-toggle-btn {
            display: inline-block;
            margin-left: 4px;
            padding: 4px 12px;
            border-radius: 6px;
            background: linear-gradient(135deg, #ff9800, #ff5722);
            color: white !important;
            font-weight: bold;
            text-decoration: none !important;
            cursor: pointer;
            box-shadow: 0 0 8px rgba(255,87,34,0.7), 0 0 16px rgba(255,87,34,0.4);
            transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
            animation: ftPulse 1.8s infinite;
        }
        .filetree-toggle-btn:hover {
            transform: scale(1.08);
            filter: brightness(1.1);
            box-shadow: 0 0 12px rgba(255,87,34,0.9), 0 0 24px rgba(255,87,34,0.7);
        }
        @keyframes ftPulse {
            0%   { box-shadow: 0 0 6px rgba(255,87,34,0.5), 0 0 12px rgba(255,87,34,0.3); }
            50%  { box-shadow: 0 0 12px rgba(255,87,34,0.9), 0 0 24px rgba(255,87,34,0.7); }
            100% { box-shadow: 0 0 6px rgba(255,87,34,0.5), 0 0 12px rgba(255,87,34,0.3); }
        }
    `;
    document.head.appendChild(ftStyle);
}

var ftSpacer = document.createElement('br');
fileListToggle.parentNode.insertBefore(ftSpacer, fileListToggle);

fileListToggle.textContent = '📂 Show file tree';
fileListToggle.className = (fileListToggle.className + ' filetree-toggle-btn').trim();

var root = {};
fileListToggle.onclick = function toggleTree() {
    findThumbnails();
    if (this.classList.contains('open_tree')) {
        this.textContent = '📂 Show file tree';
    } else {
        this.textContent = '📂 Hide file tree';
    }
    this.classList.toggle('open_tree');
    fileList.classList.toggle('hidden');
    if (!document.querySelector('.tree_container')) {
        list2Tree();
        bindGallery();
    }
    return false;
};

var oldListItemOdd = fileList.querySelector('.rowa');
var oldStyleOdd = getComputedStyle(oldListItemOdd);
var treeStyle = ce('style');
document.head.append(treeStyle);
treeStyle.innerHTML = `
.tree_container * {
    margin: 0;
}
.tree_container {
    max-height: 600px;
    overflow-y: scroll;
    resize: vertical;
    contain: content;
}
.folder_container {
    margin-left: 1.5em;
    border-left: dashed thin #8FC5E0;
}
.tree_header {
    display: flex;
    padding: 0.5em 2em 0.3em 2em;
    justify-content: space-between;
    align-items: baseline;
}
.sort_ascending:after {
    content: '🡩';
    margin-left: 0.3em;
    font-size: 10pt;
}
.sort_descending:after {
    content: '🡫';
    margin-left: 0.3em;
    font-size: 10pt;
}
.header_item {
    cursor: pointer;
}
.header_left {
    display: flex;
    justify-content: start;
    flex: 1;
}
.header_right {
    display: flex;
    justify-content: end;
    gap: 2.5em;
    flex: 1;
}
.header_tools {
    display: flex;
    align-items: baseline;
    flex: 3;
    justify-content: center;
    gap: 0.4em;
}
.header_expand {
    font-weight: normal;
    font-size: 10pt;
    flex: 1;
    min-width: 8em;
    max-width: 9em;
}
.header_filter {
    border: none;
    border-radius: 5px;
    background: #29374F;
    color: #bcd;
    max-width: 20em;
    padding: 4px;
    flex: 3;
}
.header_size_filter {
    border: none;
    border-radius: 5px;
    background: #29374F;
    color: #bcd;
    width: 7em;
    padding: 4px;
    flex-shrink: 0;
}
.header_multi_toggle,
.header_case_toggle,
.header_types_toggle,
.header_search_toggle,
.header_changelog_toggle {
    border: 1px solid #4a6080;
    border-radius: 4px;
    background: #29374F;
    color: #89a0b8;
    font-size: 9pt;
    padding: 2px 6px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
}
.header_multi_toggle:hover,
.header_case_toggle:hover,
.header_types_toggle:hover,
.header_search_toggle:hover,
.header_changelog_toggle:hover {
    background: #354a68;
    color: #bcd;
}
.header_multi_toggle.multi_active,
.header_case_toggle.case_active,
.header_types_toggle.types_active,
.header_search_toggle.search_active {
    background: #1a4a7a;
    color: #7ecfff;
    border-color: #4a9fd4;
}
.header_types_toggle.types_active::after {
    content: ' (' attr(data-hidden) ' hidden)';
    font-size: 8pt;
}
.types_panel {
    background: #1e2b3e;
    border-bottom: 1px solid #3a5070;
    padding: 0.5em 2em;
}
.types_panel_header {
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin-bottom: 0.5em;
}
.types_panel_title {
    flex: 1;
    font-size: 9pt;
    color: #89a0b8;
}
.types_btn {
    border: 1px solid #4a6080;
    border-radius: 3px;
    background: #29374F;
    color: #bcd;
    font-size: 8pt;
    padding: 1px 7px;
    cursor: pointer;
}
.types_btn:hover {
    background: #354a68;
}
.types_grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3em 1.4em;
}
.type_label {
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
    font-size: 8pt;
    color: #bcd;
    cursor: pointer;
    white-space: nowrap;
}
.type_label input {
    cursor: pointer;
}
.file_list {
    padding-left: 0.5em;
}
.folder_list {
    margin-bottom: 10px;
}
.folder li {
    list-style-type: none;
}
.file_item:nth-child(odd) {
    background-color: ${oldStyleOdd.backgroundColor};
}
.folder_details {
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 2px 0 2px 5px;
    margin-left: 0.5em;
    cursor: pointer;
}
.folder_open:before {
    content: '◢​📂';
    font-size: 12pt;
}
.folder_closed:before {
    content: '▷​📁';
    font-size: 12pt;
}
.folder_closed + div {
    display: none;
}
.folder_force_open + div {
    display: block;
}
.folder_details:before {
    margin-right: 0.3em;
}
.folder_item:nth-child(odd) .folder_details {
    background-color: ${oldStyleOdd.backgroundColor};
}
.folder_name {
    flex: 1;
}
.folder_files {
    font-size: 9pt;
    min-width: 7em;
    text-align: end;
}
.folder_size {
    padding-right: 1em;
    font-size: 9pt;
    min-width: 7em;
    text-align: end;
}
.file_item {
    display: flex;
    align-items: center;
    font-size: 8pt;
    padding: 3px;
    cursor: default;
}
.file_name {
    flex: 1;
    margin-left: 0.5em;
}
/* pointer cursor on filenames when click-search is active */
.click_search_mode .file_name {
    cursor: pointer;
    text-decoration: underline dotted #6baad0;
}
.file_preview {
    color: inherit;
    flex: 1;
}
.file_preview::after {
    content: '👁';
    padding-left: 0.5em;
}
.file_size {
    padding-right: 1em;
}
.size_match {
    color: #7ecfff;
    font-weight: bold;
}
.filter_match {
    font-weight: bold;
    background-color: yellow;
}
.tree_item:hover {
    background-color: #6baad040;
}
.file_item .font_icon {
    font-size: 10pt;
}
.file_item .icon_files_compressed {
    color: #F5C438;
    -webkit-text-stroke: 0.5px black;
}
.file_item .icon_files_executable {
    color: #f318bc;
}
.file_type_jpg, .file_type_jpeg, .file_type_webp {
    color: #a88526;
}
.file_type_mp4, .file_type_m4v {
    color: #7406a1;
}
.file_type_avi, .file_type_gif {
    color: #026102;
}
.file_type_mpg, .file_type_mpeg, .file_type_png {
    color: #740000;
}
.file_type_mkv, .file_type_mov, .file_type_bmp {
    color: #003cac;
}
.file_type_wmv {
    color: #694d00;
}
`;


// ── Tag list columns ────────────────────────────────────────────────────────
// Moves the tag list into the middle column and lays it out in columns
// instead of a single vertical list. Re-applies itself whenever the tag
// list is replaced (e.g. after voting on or adding a tag).

var tagMinRowsPerColumn = 5;
var tagColumns = 5;

function makeTagColumns() {
    var tagListEl = document.getElementById('torrent_tags_list');
    if (!tagListEl) return;
    tagListEl.classList.add('tag_list');
    for (var tagLi of tagListEl.children) {
        tagLi.classList.add('tag_item');
    }
    var cols = Math.min(Math.round(tagListEl.children.length / tagMinRowsPerColumn), tagColumns);
    tagListEl.style.columnCount = cols;
}

function initTagColumns() {
    var tagContainer = document.getElementById('tag_container');
    if (!tagContainer) return; // torrent has no tags / no tag panel on this page

    var middleColumn = document.getElementsByClassName('middle_column')[0];
    var sidebar = document.querySelector('.sidebar');
    if (!middleColumn || !sidebar) return;

    var coverImage = document.getElementById('coverimage');
    var sidebarHeads = sidebar.querySelectorAll('.head');
    if (!sidebarHeads.length) return;
    var tagHeader = coverImage === null ? sidebarHeads[0] : sidebarHeads[1];
    if (!tagHeader) return;

    var tagStyle = ce('style');
    document.head.append(tagStyle);
    tagStyle.innerHTML = `
ul.tag_list {
    margin: 15px;
}

li.tag_item {
    margin: 1px 0px 3px 0px;
    overflow: hidden;
    max-width: 420px;
}

li.tag_item > a {
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 410px;
}

a[title^="Vote up tag"] + span {
    display: none;
}

#torrent_tags_list {
    column-width: 180px;
    column-count: 5;
    display: inline-block;
}
`;

    middleColumn.appendChild(tagContainer);
    middleColumn.insertBefore(tagHeader, tagContainer);

    makeTagColumns();

    // After adding/voting on a tag the whole list is re-rendered by the site,
    // so the column classes need to be re-applied.
    var torrentTags = document.getElementById('torrent_tags');
    if (torrentTags) {
        var tagsObserver = new MutationObserver(() => makeTagColumns());
        tagsObserver.observe(torrentTags, { childList: true, subtree: true });
    }
}

if (getSetting('tagColumnsEnabled')) {
    initTagColumns();
}


// ── Changelog: menu command + auto "what's new" check ─────────────────────────

if (typeof GM_registerMenuCommand !== 'undefined') {
    GM_registerMenuCommand('📜 Show Changelog', () => showChangelogModal());

    var tagColumnsCurrentlyEnabled = getSetting('tagColumnsEnabled');
    GM_registerMenuCommand(
        (tagColumnsCurrentlyEnabled ? '✅' : '⬜') + ' Tag List Columns (click to ' +
        (tagColumnsCurrentlyEnabled ? 'disable' : 'enable') + ', reloads page)',
        () => {
            setSetting('tagColumnsEnabled', !tagColumnsCurrentlyEnabled);
            location.reload();
        }
    );

    var fullSizeCurrentlyEnabled = getSetting('thumbFullSizeEnabled');
    var thumbPreviewCurrentlyEnabled = getSetting('thumbHoverPreviewEnabled');

    if (fullSizeCurrentlyEnabled) {
        // Hover preview is paused while full-size images are on; clicking it switches back.
        GM_registerMenuCommand(
            '⏸️ Thumbnail Hover Preview (paused by Full-Size Images — click to switch to hover preview, reloads page)',
            () => {
                setSetting('thumbFullSizeEnabled', false);
                setSetting('thumbHoverPreviewEnabled', true);
                location.reload();
            }
        );
    } else {
        GM_registerMenuCommand(
            (thumbPreviewCurrentlyEnabled ? '✅' : '⬜') + ' Thumbnail Hover Preview (click to ' +
            (thumbPreviewCurrentlyEnabled ? 'disable' : 'enable') + ', reloads page)',
            () => {
                setSetting('thumbHoverPreviewEnabled', !thumbPreviewCurrentlyEnabled);
                location.reload();
            }
        );
    }

    GM_registerMenuCommand(
        (fullSizeCurrentlyEnabled ? '✅' : '⬜') + ' Full-Size Images Instead of Thumbnails (click to ' +
        (fullSizeCurrentlyEnabled ? 'disable' : 'enable') + ', reloads page)',
        () => {
            setSetting('thumbFullSizeEnabled', !fullSizeCurrentlyEnabled);
            location.reload();
        }
    );
    GM_registerMenuCommand(
        '📐 Full-Size Images Max Size (currently ' + getSetting('thumbFullSizeMaxWidth') + 'x' +
        getSetting('thumbFullSizeMaxHeight') + ')',
        () => {
            if (promptFullSizeMaxDimensions() && fullSizeCurrentlyEnabled) location.reload();
        }
    );
}

checkVersionUpdate();