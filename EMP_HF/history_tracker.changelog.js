// [HF][EMP] History Tracker — Changelog ("What's New")
// Part of history_tracker.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install history_tracker.user.js.
// Version 3.4
//
// Fetches History_Tracker_Changelog.md from GitHub and shows it after an update or on request,
// in the same window as Advanced Better filelist (its CSS is in history_tracker.styles.css).
// Top-level code here only declares things: everything from the main script (settings, storage,
// log, el, …) is used inside functions, which run after the main script has loaded.

// ── Changelog / "What's New" ─────────────────────────────────────────────
// Same as Advanced Better filelist: fetched from GitHub, shown after an update and from the menu.

var CHANGELOG_URL = 'https://raw.githubusercontent.com/edstagdh/Userscripts/refs/heads/master/EMP_HF/History_Tracker_Changelog.md';
var CHANGELOG_HISTORY_DEPTH = 3;
var changelogCache = null;
var changelogModalEl = null;

function parseChangelogMarkdown(md) {
    var entries = [];
    var current = null;
    md.split(/\r?\n/).forEach(function (line) {
        var headerMatch = line.match(/^##\s*v?([0-9][0-9.]*)\s*(?:-\s*(.+))?\s*$/i);
        if (headerMatch) {
            current = { version: headerMatch[1], date: (headerMatch[2] || '').trim(), changes: [] };
            entries.push(current);
            return;
        }
        var itemMatch = line.match(/^\s*[-*]\s+(.*\S)\s*$/);
        if (itemMatch && current) current.changes.push(itemMatch[1]);
    });
    return entries.filter(function (e) { return e.changes.length; });
}

function findChangelogIndexForVersion(entries, version) {
    for (var i = 0; i < entries.length; i++) if (entries[i].version === version) return i;
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
// log every failed changelog fetch once, wherever it was asked for
var fetchChangelogRaw = fetchChangelog;
fetchChangelog = function (callback) {
    fetchChangelogRaw(function (entries, err) {
        if (err) log.warn('Couldn\'t load the changelog: ' + err);
        callback(entries, err);
    });
};

function onChangelogKeydown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); dismissChangelog(); }
}

function ensureChangelogModal() {
    if (changelogModalEl) return;
    changelogModalEl = el('div', { id: 'ht-cl-backdrop', 'data-ht-ui': '' });
    var okBtn = el('button', { type: 'button', className: 'ht-cl-ok-btn', text: 'OK, got it' });
    changelogModalEl.appendChild(el('div', { id: 'ht-cl-modal' }, [
        el('div', { className: 'ht-cl-header' }, [
            el('div', { className: 'ht-cl-header-left' }, [
                el('h2', { text: '🆕 What\'s New' }),
                el('span', { className: 'ht-cl-subtitle', text: SCRIPT_NAME + ' — currently v' + SCRIPT_VERSION }),
            ]),
        ]),
        el('div', { className: 'ht-cl-body', id: 'ht-cl-body-content' }),
        el('div', { className: 'ht-cl-footer' }, [
            el('a', { className: 'ht-cl-github-link', href: 'https://github.com/edstagdh/Userscripts', target: '_blank', rel: 'noopener noreferrer', text: '🔗 View on GitHub' }),
            okBtn,
        ]),
    ]));
    document.body.appendChild(changelogModalEl);
    changelogModalEl.addEventListener('click', function (e) { if (e.target === this) dismissChangelog(); });
    okBtn.addEventListener('click', dismissChangelog);
}

function openChangelog() {
    ensureChangelogModal();
    changelogModalEl.classList.add('active');
    document.addEventListener('keydown', onChangelogKeydown, true);
}

function dismissChangelog() {
    if (changelogModalEl) changelogModalEl.classList.remove('active');
    document.removeEventListener('keydown', onChangelogKeydown, true);
}

function renderChangelogBody(versionsToShow, errorMsg, updateAvailableVersion, hasMore) {
    var body = changelogModalEl.querySelector('#ht-cl-body-content');
    body.replaceChildren();
    if (updateAvailableVersion) {
        body.appendChild(el('div', { className: 'ht-cl-update-banner', text:
            '🔔 A newer version (v' + updateAvailableVersion + ') is available on GitHub — you\'re currently on v' + SCRIPT_VERSION + '.' }));
    }
    if (errorMsg) {
        body.appendChild(el('div', { className: 'ht-cl-error', text: 'Couldn\'t load the changelog (' + errorMsg + '). Check the GitHub repo directly for the latest version history.' }));
        return;
    }
    if (!versionsToShow || !versionsToShow.length) {
        body.appendChild(el('div', { className: 'ht-cl-error', text: 'No changelog entries found.' }));
        return;
    }
    versionsToShow.forEach(function (entry) {
        body.appendChild(el('div', { className: 'ht-cl-version-block' }, [
            el('span', { className: 'ht-cl-version-label', text: 'v' + entry.version }),
            entry.date ? el('span', { className: 'ht-cl-version-date', text: entry.date }) : null,
            el('ul', { className: 'ht-cl-changes' }, entry.changes.map(function (c) { return el('li', { text: c }); })),
        ]));
    });
    if (hasMore) {
        body.appendChild(el('div', { className: 'ht-cl-more' }, [
            'Showing the ' + versionsToShow.length + ' most recent versions — ',
            el('a', { href: CHANGELOG_URL, target: '_blank', rel: 'noopener noreferrer', text: 'see full version history on GitHub' }),
            '.',
        ]));
    }
}

function showChangelogModal() {
    openChangelog();
    changelogModalEl.querySelector('#ht-cl-body-content').replaceChildren(el('div', { className: 'ht-cl-loading', text: 'Loading changelog…' }));
    fetchChangelog(function (entries, err) {
        if (err) { renderChangelogBody(null, err, null); return; }
        var currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
        var updateAvailableVersion = currentIdx > 0 ? entries[0].version : null;
        var startIdx = currentIdx === -1 ? 0 : currentIdx;
        renderChangelogBody(entries.slice(startIdx, startIdx + CHANGELOG_HISTORY_DEPTH), null, updateAvailableVersion,
            entries.length > startIdx + CHANGELOG_HISTORY_DEPTH);
    });
}

function checkVersionUpdate() {
    var lastVersion = GM_getValue('ht_last_version', null);
    if (lastVersion === SCRIPT_VERSION) return;
    GM_setValue('ht_last_version', SCRIPT_VERSION);
    fetchChangelog(function (entries, err) {
        if (err) return; // stay quiet on auto-check failures; the menu command still works
        var currentIdx = findChangelogIndexForVersion(entries, SCRIPT_VERSION);
        var available = currentIdx === -1 ? entries : entries.slice(currentIdx);
        var toShow;
        if (!lastVersion) {
            toShow = available.length ? [available[0]] : [];
        } else {
            toShow = [];
            for (var i = 0; i < available.length; i++) {
                if (available[i].version === lastVersion) break;
                toShow.push(available[i]);
            }
            if (!toShow.length && available.length) toShow = [available[0]];
        }
        if (!toShow.length) return;
        log.info('Updated ' + (lastVersion ? 'from v' + lastVersion + ' ' : '') + 'to v' + SCRIPT_VERSION + ' — showing what\'s new');
        openChangelog();
        renderChangelogBody(toShow, null, currentIdx > 0 ? entries[0].version : null);
    });
}
