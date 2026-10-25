// [Pornolab] Advanced Viewer Experience — "What's New" popup (fetches Changelog.md from GitHub)
// Part of plab_advanced_viewer.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install plab_advanced_viewer.user.js.
// Version 1.5

// Changelog is not stored inline — it's fetched on demand from Changelog.md in this repo
// folder, either when the version changes or when requested via the GM menu command.
const CHANGELOG_URL = 'https://raw.githubusercontent.com/edstagdh/Userscripts/refs/heads/master/PLAB/Changelog.md';
let changelogCache = null; // parsed [{version, changes:[...]}] once fetched this session

// --------------------
// CHANGELOG — fetched on demand from CHANGELOG.md (GitHub raw), not stored inline.
// Expected file format (see CHANGELOG.md in the same repo folder). IMPORTANT: newest
// version must be listed FIRST — index-based "is a newer version available" checks
// below rely on that ordering:
//
//   ## v1.2
//   - Change one
//   - Change two
//
//   ## v1.1
//   - Change one
//
// Parsed into the same [{version, changes:[...]}] shape the popup renderer expects.
// --------------------
function parseChangelogMarkdown(md) {
    const lines = md.split(/\r?\n/);
    const entries = [];
    let current = null;
    lines.forEach(function (line) {
        const headerMatch = line.match(/^##\s*v?([0-9][0-9.]*)\s*$/i);
        if (headerMatch) {
            current = { version: headerMatch[1], changes: [] };
            entries.push(current);
            return;
        }
        const itemMatch = line.match(/^\s*[-*]\s+(.*\S)\s*$/);
        if (itemMatch && current) {
            current.changes.push(itemMatch[1]);
        }
    });
    return entries.filter(e => e.changes.length);
}

// Finds the index of a given version within the parsed entries (newest-first order).
// Returns -1 if the version isn't present (e.g. a dev/test build not yet released).
function findVersionIndex(entries, version) {
    for (let i = 0; i < entries.length; i++) {
        if (entries[i].version === version) return i;
    }
    return -1;
}

// Returns the index of `version` within `entries`, assuming CHANGELOG.md lists the
// newest version first. Index 0 = latest; a higher index = an older version.
// Returns -1 if the version isn't present in the fetched changelog.
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
        onload: function (res) {
            if (res.status < 200 || res.status >= 300) { callback(null, 'HTTP ' + res.status); return; }
            try {
                const parsed = parseChangelogMarkdown(res.responseText);
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

function buildChangelogPopup(versionsToShow, errorMsg, updateAvailableVersion) {
    jQuery('#vcl-backdrop').remove(); // in case a stale popup/loading state is still around

    let bodyHtml = '';
    if (updateAvailableVersion) {
        bodyHtml += `<div class="vcl-update-banner">&#128276; A newer version (v${updateAvailableVersion}) is available on GitHub — you're currently on v${SCRIPT_VERSION}.</div>`;
    }
    if (errorMsg) {
        bodyHtml += `<div class="vcl-error">Couldn't load the changelog (${errorMsg}). You can view it directly on GitHub using the link below.</div>`;
    } else if (!versionsToShow || !versionsToShow.length) {
        bodyHtml += `<div class="vcl-error">No changelog entries found.</div>`;
    } else {
        bodyHtml += versionsToShow.map(function (entry) {
            const items = entry.changes.map(c => `<li>${c}</li>`).join('');
            return `<div class="vcl-version-block"><span class="vcl-version-label">v${entry.version}</span><ul class="vcl-changes">${items}</ul></div>`;
        }).join('');
    }

    const html = `
    <div id="vcl-backdrop">
        <div id="vcl-modal">
            <div class="vcl-header">
                <div class="vcl-header-left">
                    <h2>&#127381; What's New</h2>
                    <span class="vcl-subtitle">[Pornolab] Advanced Viewer Experience &mdash; currently v${SCRIPT_VERSION}</span>
                </div>
            </div>
            <div class="vcl-body">${bodyHtml}</div>
            <div class="vcl-footer">
                <a class="vcl-github-link" href="https://github.com/edstagdh/Userscripts" target="_blank">&#128279; View on GitHub</a>
                <button class="vcl-ok-btn" id="vcl-ok-btn">OK, got it</button>
            </div>
        </div>
    </div>`;

    jQuery('body').append(html);
    jQuery('#vcl-backdrop').on('click', function (e) { if (e.target === this) dismissChangelog(); });
    jQuery('#vcl-ok-btn').on('click', dismissChangelog);
    jQuery(document).on('keydown.vcl', function (e) { if (e.key === 'Escape') dismissChangelog(); });
    jQuery('#vcl-backdrop').addClass('active');
}
function dismissChangelog() {
    jQuery('#vcl-backdrop').removeClass('active');
    GM_setValue('LAST_SEEN_VERSION', SCRIPT_VERSION);
    jQuery(document).off('keydown.vcl');
}
function checkVersionAndShowChangelog() {
    const lastSeen = GM_getValue('LAST_SEEN_VERSION', '');
    if (lastSeen === SCRIPT_VERSION) return;
    fetchChangelog(function (entries, err) {
        if (err) { buildChangelogPopup(null, err); return; }
        const currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
        // Only ever show changes up through the version actually running right now —
        // entries above currentIdx belong to a newer release we haven't been updated to yet.
        const availableEntries = currentIdx === -1 ? entries : entries.slice(currentIdx);
        let toShow;
        if (!lastSeen) {
            toShow = availableEntries.length ? [availableEntries[0]] : [];
        } else {
            toShow = [];
            for (let i = 0; i < availableEntries.length; i++) {
                if (availableEntries[i].version === lastSeen) break;
                toShow.push(availableEntries[i]);
            }
        }
        if (!toShow.length) { GM_setValue('LAST_SEEN_VERSION', SCRIPT_VERSION); return; }
        // If the remote changelog has entries newer than what's installed (e.g. the
        // GreasyFork/GitHub copy updated but this browser hasn't picked it up yet),
        // surface that as an update notice rather than silently showing future changes.
        const updateAvailableVersion = currentIdx > 0 ? entries[0].version : null;
        buildChangelogPopup(toShow, null, updateAvailableVersion);
    });
}
function showFullChangelog() {
    fetchChangelog(function (entries, err) {
        if (err) { buildChangelogPopup(null, err); return; }
        const currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
        if (currentIdx === -1) {
            // Installed version isn't in the fetched changelog at all — show the latest
            // entry as a best-effort fallback rather than nothing.
            buildChangelogPopup(entries.length ? [entries[0]] : [], null, null);
            return;
        }
        const updateAvailableVersion = currentIdx > 0 ? entries[0].version : null;
        buildChangelogPopup([entries[currentIdx]], null, updateAvailableVersion);
    });
}
