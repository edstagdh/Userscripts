// ==UserScript==
// @name         [ManyVids] Store Viewer
// @namespace    edstagdh.manyvids.store.viewer
// @version      1.0
// @description  Adds an "All videos" button to creator store pages: every video (regular + mobile) in one popup — 5-per-row grid with full titles and uncropped thumbnails, or a sortable table, with filters and a per-video details popup.
// @author       edstagdh
// @match        https://www.manyvids.com/*
// @match        https://manyvids.com/*
// @icon         https://logos.manyvids.com/icon_public/favicon-32x32.png?v=4
// @require      https://raw.githubusercontent.com/edstagdh/Userscripts/master/ManyVids_Store_Viewer/manyvids_store_viewer.api.js?v=1.0
// @require      https://raw.githubusercontent.com/edstagdh/Userscripts/master/ManyVids_Store_Viewer/manyvids_store_viewer.views.js?v=1.0
// @require      https://raw.githubusercontent.com/edstagdh/Userscripts/master/ManyVids_Store_Viewer/manyvids_store_viewer.modal.js?v=1.0
// @require      https://raw.githubusercontent.com/edstagdh/Userscripts/master/ManyVids_Store_Viewer/manyvids_store_viewer.changelog.js?v=1.0
// @resource     MSV_STYLES https://raw.githubusercontent.com/edstagdh/Userscripts/master/ManyVids_Store_Viewer/manyvids_store_viewer.styles.css?v=1.0
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      api.manyvids.com
// @connect      manyvids.com
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/edstagdh/Userscripts/master/ManyVids_Store_Viewer/manyvids_store_viewer.user.js
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/ManyVids_Store_Viewer/manyvids_store_viewer.user.js
// ==/UserScript==

/* Main script: settings, helpers, "All videos" button, route watcher, start.
   Modules (@require, same scope — they run first, so only call into them from functions):
     .api.js        API calls, embedded-data fallback, store loader
     .views.js      filtering / sorting, grid cards, table, hover preview
     .modal.js      viewer popup: header, filters, render, details popup
     .changelog.js  "What's New" popup (Changelog.md on GitHub)
     .styles.css    all CSS (@resource MSV_STYLES) */

const SCRIPT_VERSION = '1.0';
const MSV_LIMIT = 70;
const MSV_MAX_PAGES = 200;
const MSV_DEFAULT_API = 'https://api.manyvids.com';

const MSV_DEFAULTS = { view: 'grid', cols: 5, sort: 'date_desc', autoOpen: false, preview: true };
const S = Object.assign({}, MSV_DEFAULTS, GM_getValue('msv_settings', {}));
function msvSet(k, v) { S[k] = v; GM_setValue('msv_settings', S); }

const MSV = { profileId: null, slug: null, items: [], loading: false, errors: [], loadToken: 0, open: false, details: new Map() };
const F = { q: '', kind: 'all', bundle: 'all', price: 'all', minPrice: '', maxPrice: '', minDur: '', maxDur: '', from: '', to: '', hideAi: false };

/* ---------- helpers ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function el(tag, attrs, html) { const e = document.createElement(tag); if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
function fmtNum(n) { return n == null ? '' : Number(n).toLocaleString(); }
function durSecs(d) { if (!d) return 0; return String(d).split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0); }
function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
function fmtPrice(it) {
  if (it.free) return '<span class="msv-free">Free</span>';
  if (it.onSale && it.salePrice != null) return `<span class="msv-sale">$${esc(it.salePrice.toFixed(2))}</span> <s>$${esc(it.regular.toFixed(2))}</s>`;
  return it.regular != null ? '$' + esc(it.regular.toFixed(2)) : '';
}

/* ---------- launcher button ---------- */
function msvUpdateFab() {
  const pr = msvParseUrl();
  if (!pr) { if (els.fab) els.fab.remove(), els.fab = null; return; }
  if (!els.fab) {
    els.fab = el('button', { id: 'msv-fab', title: 'Show all videos of this store' });
    els.fab.addEventListener('click', () => (MSV.open ? msvClose() : msvOpen()));
    document.body.appendChild(els.fab);
  }
  const n = pr.id === MSV.profileId && MSV.items.length ? ` (${MSV.items.length})` : '';
  els.fab.textContent = '▦ All videos' + n;
}

function msvCheckUrl() {
  const pr = msvParseUrl();
  const key = pr ? pr.id : null;
  if (key !== msvCheckUrl.last) {
    const first = msvCheckUrl.last === undefined;
    msvCheckUrl.last = key;
    if (!pr && MSV.open) msvClose();
    if (pr && MSV.open && pr.id !== MSV.profileId) msvLoad();
    if (pr && !MSV.open && S.autoOpen && first) msvOpen();
  }
  msvUpdateFab();
}

/* ---------- start ---------- */
try { GM_addStyle(GM_getResourceText('MSV_STYLES')); } catch (e) { console.error('[MSV] CSS not loaded', e); }
GM_registerMenuCommand('Toggle auto-open on store pages', () => {
  msvSet('autoOpen', !S.autoOpen);
  alert('ManyVids Store Viewer: auto-open is now ' + (S.autoOpen ? 'ON' : 'OFF'));
});
GM_registerMenuCommand('Reset Store Viewer settings', () => { GM_setValue('msv_settings', {}); Object.assign(S, MSV_DEFAULTS); if (MSV.open) msvRender(); });
GM_registerMenuCommand('📋 Show Changelog', showFullChangelog);

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !MSV.open) return;
  if (msvDetailsOpen()) msvDetailsClose(); else msvClose();
});
msvCheckUrl();
setInterval(msvCheckUrl, 700);
checkVersionAndShowChangelog();
