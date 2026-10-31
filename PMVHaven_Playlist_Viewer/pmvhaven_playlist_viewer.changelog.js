// ==UserScript Module==
// @name         [PMVHaven] Playlist Viewer — What's New
// Version       1.1
// Part of pmvhaven_playlist_viewer.user.js (loaded via @require, shares its scope).
// Top-level code only declares things; main-script helpers are used inside functions only.

/* Changelog.md format (newest first):
     ## v1.1
     - change
     - change
   The popup opens once after an update (versions newer than the last one seen);
   "What's New" in the Tampermonkey menu / settings opens it any time. */

const CHANGELOG_URL = 'https://raw.githubusercontent.com/edstagdh/Userscripts/master/PMVHaven_Playlist_Viewer/Changelog.md';
const LAST_SEEN_VERSION = 'pvx_last_version';
let pvxChangelogCache = null;

function pvxCmpVersion(a, b) {
    const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const d = (x[i] || 0) - (y[i] || 0);
        if (d) return d > 0 ? 1 : -1;
    }
    return 0;
}

function pvxFetchChangelog() {
    if (pvxChangelogCache) return Promise.resolve(pvxChangelogCache);
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET', url: CHANGELOG_URL + '?t=' + Date.now(), timeout: 15000,
            onload: r => {
                if (r.status !== 200) return reject(new Error('HTTP ' + r.status));
                pvxChangelogCache = pvxParseChangelog(r.responseText);
                resolve(pvxChangelogCache);
            },
            onerror: () => reject(new Error('Network error')),
            ontimeout: () => reject(new Error('Timed out')),
        });
    });
}

/** → [{version, items:[…]}] newest first */
function pvxParseChangelog(md) {
    const out = [];
    let cur = null;
    for (const line of String(md).split(/\r?\n/)) {
        const head = /^##\s+v?(\d+(?:\.\d+)*)\s*$/.exec(line.trim());
        if (head) { cur = { version: head[1], items: [] }; out.push(cur); continue; }
        const item = /^\s*[-*]\s+(.*)$/.exec(line);
        if (item && cur) cur.items.push(item[1]);
    }
    return out;
}

/** Runs at start: shows the popup once when the installed version is newer than the last one seen. */
function pvxMaybeShowChangelog() {
    const seen = GM_getValue(LAST_SEEN_VERSION, '');
    if (!seen) { GM_setValue(LAST_SEEN_VERSION, SCRIPT_VERSION); return; }   // fresh install: nothing to announce
    if (pvxCmpVersion(SCRIPT_VERSION, seen) > 0) pvxShowChangelog(false, seen);
}

/** all=true → every version; otherwise only versions newer than `since`. */
async function pvxShowChangelog(all, since) {
    document.getElementById('pvx-cl')?.remove();
    const body = h('div', { class: 'pvx-cl-body' }, h('div', { class: 'pvx-spinner' }));
    const close = () => { root.remove(); GM_setValue(LAST_SEEN_VERSION, SCRIPT_VERSION); document.removeEventListener('keydown', onKey, true); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const root = h('div', { id: 'pvx-cl', class: 'pvx-overlay pvx-cl-overlay' },
        h('div', { class: 'pvx-cl' },
            h('div', { class: 'pvx-cl-head' }, h('b', null, "What's New — Playlist Viewer"),
                h('button', { type: 'button', class: 'pvx-ibtn', title: 'Close', onclick: close,
                    html: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' })),
            body));
    root.addEventListener('mousedown', e => { if (e.target === root) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(root);
    try {
        let list = await pvxFetchChangelog();
        if (!all && since) list = list.filter(e => pvxCmpVersion(e.version, since) > 0);
        if (!list.length) list = (await pvxFetchChangelog()).slice(0, 1);
        body.replaceChildren(...list.map(e => h('div', { class: 'pvx-cl-ver' },
            h('div', { class: 'pvx-cl-vname' }, 'v' + e.version, pvxCmpVersion(e.version, SCRIPT_VERSION) === 0 ? h('span', { class: 'pvx-cl-cur' }, 'installed') : null),
            h('ul', null, e.items.map(i => h('li', null, i))))));
    } catch (err) {
        body.replaceChildren(h('div', { class: 'pvx-empty' }, 'Could not load the changelog (' + err.message + ').'));
    }
}
