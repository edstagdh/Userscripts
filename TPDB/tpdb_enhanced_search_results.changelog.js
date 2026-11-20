// ThePornDB - Enhanced Search Results — "What's New" popup (fetches TPDB_Changelog.md from GitHub)
// Part of tpdb_enhanced_search_results.user.js, loaded via @require (runs before the main
// script, in the same scope). Not a standalone userscript — install the .user.js.
// Version 3.1

// Changelog is not stored inline — it's fetched on demand from TPDB_Changelog.md in this repo
// folder, either when the version changes or when requested via the GM menu command.
const CHANGELOG_URL = 'https://raw.githubusercontent.com/edstagdh/Userscripts/refs/heads/master/TPDB/TPDB_Changelog.md';
let changelogCache = null;   // parsed [{version, date, changes:[...]}] once fetched this session
let changelogModalEl = null;

// --------------------
// Expected file format (newest version FIRST — the "newer version available" check relies on it):
//
//   ## v3.1 - 2026-11-20      (the " - date" part is optional)
//   - Change one
//   - Change two
// --------------------
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
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    return modal;
}

function openChangelogModal() {
    if (!changelogModalEl) changelogModalEl = buildChangelogModal();
    changelogModalEl.classList.remove('tpdb_cl_hidden');
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
    openChangelogModal();
    changelogModalEl.querySelector('.tpdb_cl_body').innerHTML = '<div class="tpdb_cl_loading">Loading changelog…</div>';

    fetchChangelog((entries, err) => {
        if (err) return renderChangelogBody(null, err, null);
        const idx = findVersionIndex(entries, SCRIPT_VERSION);
        if (idx === -1) return renderChangelogBody(entries.length ? [entries[0]] : [], null, null);
        renderChangelogBody([entries[idx]], null, idx > 0 ? entries[0].version : null);
    });
}

// Automatic — one-time popup after a version bump, listing every version since the last one seen
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

        openChangelogModal();
        renderChangelogBody(toShow, null, idx > 0 ? entries[0].version : null);
    });
}
