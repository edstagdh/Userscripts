// [PBB] Cleaner Search — "What's New" popup (fetches Changelog.md from GitHub)
// Part of pbb_cleaner_search.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install pbb_cleaner_search.user.js.
// Version 1.0

// Changelog is not stored inline — it's fetched on demand from Changelog.md in this repo
// folder, either when the version changes or when requested via the GM menu command.
const CHANGELOG_URL = 'https://raw.githubusercontent.com/edstagdh/Userscripts/refs/heads/master/PBB_Cleaner_Search/Changelog.md';
let changelogCache = null; // parsed [{version, changes:[...]}] once fetched this session

// --------------------
// Expected file format (newest version FIRST — the "newer version available" check relies on it):
//
//   ## v1.1
//   - Change one
//   - Change two
//
//   ## v1.0
//   - Change one
// --------------------
function parseChangelogMarkdown(md) {
    const entries = [];
    let current = null;
    md.split(/\r?\n/).forEach(function (line) {
        const headerMatch = line.match(/^##\s*v?([0-9][0-9.]*)\s*$/i);
        if (headerMatch) {
            current = { version: headerMatch[1], changes: [] };
            entries.push(current);
            return;
        }
        const itemMatch = line.match(/^\s*[-*]\s+(.*\S)\s*$/);
        if (itemMatch && current) current.changes.push(itemMatch[1]);
    });
    return entries.filter(e => e.changes.length);
}

function findChangelogIndexForVersion(entries, version) {
    for (let i = 0; i < entries.length; i++) {
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
        timeout: 10000,
        onload: function (res) {
            if (res.status < 200 || res.status >= 300) { callback(null, 'HTTP ' + res.status); return; }
            try {
                changelogCache = parseChangelogMarkdown(res.responseText);
                callback(changelogCache, null);
            } catch (e) {
                callback(null, 'Parse error: ' + e.message);
            }
        },
        onerror: function () { callback(null, 'Network error fetching changelog'); },
        ontimeout: function () { callback(null, 'Timed out fetching changelog'); },
    });
}

function clEscape(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function buildChangelogPopup(versionsToShow, errorMsg, updateAvailableVersion) {
    const old = document.getElementById('pbbcl-backdrop');
    if (old) old.remove();

    let bodyHtml = '';
    if (updateAvailableVersion) {
        bodyHtml += `<div class="pbbcl-update-banner">&#128276; A newer version (v${clEscape(updateAvailableVersion)}) is available on GitHub — you're currently on v${SCRIPT_VERSION}.</div>`;
    }
    if (errorMsg) {
        bodyHtml += `<div class="pbbcl-error">Couldn't load the changelog (${clEscape(errorMsg)}). You can view it directly on GitHub using the link below.</div>`;
    } else if (!versionsToShow || !versionsToShow.length) {
        bodyHtml += `<div class="pbbcl-error">No changelog entries found.</div>`;
    } else {
        bodyHtml += versionsToShow.map(function (entry) {
            const items = entry.changes.map(c => `<li>${clEscape(c)}</li>`).join('');
            return `<div class="pbbcl-version-block"><span class="pbbcl-version-label">v${clEscape(entry.version)}</span><ul class="pbbcl-changes">${items}</ul></div>`;
        }).join('');
    }

    const wrap = document.createElement('div');
    wrap.id = 'pbbcl-backdrop';
    wrap.innerHTML = `
        <div id="pbbcl-modal">
            <div class="pbbcl-header">
                <h2>&#127381; What's New</h2>
                <span class="pbbcl-subtitle">[PBB] Cleaner Search &mdash; currently v${SCRIPT_VERSION}</span>
            </div>
            <div class="pbbcl-body">${bodyHtml}</div>
            <div class="pbbcl-footer">
                <a class="pbbcl-github-link" href="https://github.com/edstagdh/Userscripts/tree/master/PBB_Cleaner_Search" target="_blank" rel="noopener">&#128279; View on GitHub</a>
                <button type="button" class="pbbcl-ok-btn">OK, got it</button>
            </div>
        </div>`;
    document.body.appendChild(wrap);

    const onKey = function (e) { if (e.key === 'Escape') dismissChangelog(); };
    function dismissChangelog() {
        wrap.remove();
        GM_setValue('LAST_SEEN_VERSION', SCRIPT_VERSION);
        document.removeEventListener('keydown', onKey);
    }
    wrap.addEventListener('click', function (e) { if (e.target === wrap) dismissChangelog(); });
    wrap.querySelector('.pbbcl-ok-btn').addEventListener('click', dismissChangelog);
    document.addEventListener('keydown', onKey);
}

// On page load: show what changed since the last version the user saw
function checkVersionAndShowChangelog() {
    const lastSeen = GM_getValue('LAST_SEEN_VERSION', '');
    if (lastSeen === SCRIPT_VERSION) return;
    fetchChangelog(function (entries, err) {
        if (err) { buildChangelogPopup(null, err); return; }
        const currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
        // Only show changes up through the version actually running
        const available = currentIdx === -1 ? entries : entries.slice(currentIdx);
        let toShow = [];
        if (!lastSeen) {
            toShow = available.length ? [available[0]] : [];
        } else {
            for (let i = 0; i < available.length; i++) {
                if (available[i].version === lastSeen) break;
                toShow.push(available[i]);
            }
        }
        if (!toShow.length) { GM_setValue('LAST_SEEN_VERSION', SCRIPT_VERSION); return; }
        buildChangelogPopup(toShow, null, currentIdx > 0 ? entries[0].version : null);
    });
}

// Menu command: show the running version's entry
function showFullChangelog() {
    fetchChangelog(function (entries, err) {
        if (err) { buildChangelogPopup(null, err); return; }
        const currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
        if (currentIdx === -1) { buildChangelogPopup(entries.length ? [entries[0]] : [], null, null); return; }
        buildChangelogPopup([entries[currentIdx]], null, currentIdx > 0 ? entries[0].version : null);
    });
}
