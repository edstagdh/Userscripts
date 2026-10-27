// [HF][EMP][PLAB][SC] History Tracker — Backup to Filester
// Part of history_tracker.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install history_tracker.user.js.
// Version 4.9
//
// Opt-in daily backup of the whole history (the same data as "⬇️ Export JSON", gzip-compressed) to your own
// Filester account (https://filester.me, API: https://filester.me/api-docs), into a private folder.
//   • API key: Filester → Account settings. Stored in this script's Tampermonkey settings (ht_setting_filesterKey),
//     never in exports or backups.
//   • Once a day at most: on a page where the script runs, ~15 s after it loads, if the last good backup is over
//     24 h old (after a failure, it tries again an hour later). One tab at a time (lock ht_backup_lock).
//   • Folder: found by name, created private (public: 0) if missing; its id is remembered.
//   • Old backups beyond the "keep" count are deleted (best effort). Filester also deletes files that nobody
//     opened or downloaded for 45 days, so backups you never touch expire on their own.
//   • Restore: download a backup from Filester, then Settings & data → ⬆️ Import JSON… (it reads .json.gz too).
// Status of the last run: ht_backup_state { last: attempt, ok: last success, name, url, size, err, folderId, folderName }.

var FS_API = 'https://u1.filester.me';
var FS_STATE_KEY = 'ht_backup_state';
var FS_LOCK_KEY = 'ht_backup_lock';
var FS_DAY_MS = 86400000;
var FS_RETRY_MS = 3600000;
var FS_NAME_PREFIX = 'history-tracker-';

function fsState() { var s = GM_getValue(FS_STATE_KEY, null); return s && typeof s === 'object' ? s : {}; }
function fsSaveState(patch) { var s = Object.assign(fsState(), patch); GM_setValue(FS_STATE_KEY, s); return s; }

/** one API call → Promise of the parsed JSON (rejects with a readable message) */
function fsRequest(key, method, url, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
        if (typeof GM_xmlhttpRequest !== 'function') { reject(new Error('GM_xmlhttpRequest isn\'t available')); return; }
        var headers = Object.assign({ Authorization: 'Bearer ' + key, Accept: 'application/json' }, opts.headers || {});
        var data;
        if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; data = JSON.stringify(opts.json); }
        else if (opts.form) data = opts.form;
        GM_xmlhttpRequest({
            method: method, url: /^https?:/.test(url) ? url : FS_API + url, headers: headers, data: data, timeout: opts.timeout || 60000,
            onload: function (r) {
                var body = null;
                try { body = JSON.parse(r.responseText); } catch (e) { /* not JSON */ }
                if (r.status >= 200 && r.status < 300 && body && body.success !== false) { resolve(body); return; }
                var msg = (body && body.message) || ('HTTP ' + r.status + (r.responseText ? ' — ' + String(r.responseText).slice(0, 120) : ''));
                if (r.status === 401) msg = 'The API key was refused (401) — check it in Filester → Account settings';
                if (r.status === 429) msg = 'Filester rate limit reached (429) — try again later';
                var err = new Error(msg);
                err.status = r.status;
                reject(err);
            },
            onerror: function () { reject(new Error('Couldn\'t reach Filester (network error, or Tampermonkey blocked the connection)')); },
            ontimeout: function () { reject(new Error('Filester didn\'t answer in time')); },
        });
    });
}

function fsAccount(key) { return fsRequest(key, 'GET', '/api/v1/account'); }

/** the backup folder's id: remembered, else found by name, else created (private) */
function fsFolderId(key, name, fresh) {
    var st = fsState();
    if (!fresh && st.folderId && st.folderName === name) return Promise.resolve(st.folderId);
    return fsRequest(key, 'GET', '/api/v1/folders').then(function (res) {
        var list = Array.isArray(res.data) ? res.data : Array.isArray(res.folders) ? res.folders : [];
        var found = list.filter(function (f) { return f && f.name === name && !f.parent && !f.parent_id; })[0];
        if (found) return found.id || found.identifier;
        return fsRequest(key, 'POST', '/api/v1/folder', { json: { name: name, public: 0 } }).then(function (c) {
            log.info('Backup: created the private Filester folder "' + name + '"');
            return (c.data && (c.data.identifier || c.data.id)) || c.identifier;
        });
    }).then(function (id) {
        if (!id) throw new Error('Filester didn\'t return a folder id');
        fsSaveState({ folderId: id, folderName: name });
        return id;
    });
}

function fsGzip(text) {
    if (typeof CompressionStream !== 'function') return Promise.resolve({ blob: new Blob([text], { type: 'application/json' }), gz: false });
    return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob()
        .then(function (b) { return { blob: new Blob([b], { type: 'application/gzip' }), gz: true }; });
}

function fsUpload(key, folderId, blob, name) {
    var form = new FormData();
    form.append('file', blob, name);
    return fsRequest(key, 'POST', '/api/v1/upload', { form: form, headers: { 'X-Folder-ID': folderId }, timeout: 300000 });
}

/** backups in the folder, newest first: [{ id, slug, name, size, url, created }] */
function fsListBackups(key, folderId) {
    return fsRequest(key, 'GET', '/api/v1/folder/' + encodeURIComponent(folderId) + '/files').then(function (res) {
        var list = Array.isArray(res.data) ? res.data : Array.isArray(res.files) ? res.files : [];
        return list.filter(function (f) { return f && String(f.name || '').indexOf(FS_NAME_PREFIX) === 0; }).map(function (f) {
            var m = String(f.url || '').match(/\/d\/([^\/?#]+)/);
            return { id: f.id, slug: f.slug || (m ? m[1] : ''), name: f.name, size: f.size, url: f.url, created: Date.parse(f.created_at) || 0 };
        }).sort(function (a, b) { return b.created - a.created || (b.name > a.name ? 1 : -1); });
    });
}

/** delete backups beyond `keep` (best effort: the delete endpoint isn't under /api/v1 in Filester's docs) */
function fsPrune(key, folderId, keep) {
    if (!(keep > 0)) return Promise.resolve(0);
    return fsListBackups(key, folderId).then(function (list) {
        var old = list.slice(keep);
        if (!old.length) return 0;
        var ids = old.map(function (f) { return f.slug || String(f.id); });
        var urls = [FS_API + '/file/delete', 'https://filester.me/file/delete', FS_API + '/api/v1/file/delete'];
        function attempt(i) {
            if (i >= urls.length) throw new Error('no delete endpoint accepted the request');
            return fsRequest(key, 'POST', urls[i], { json: { identifiers: ids } }).catch(function () { return attempt(i + 1); });
        }
        return attempt(0).then(function () {
            log.info('Backup: deleted ' + ids.length + ' old backup(s) from Filester (keeping ' + keep + ')');
            return ids.length;
        });
    }).catch(function (e) {
        log.warn('Backup: couldn\'t delete old backups (' + e.message + ') — Filester removes files nobody opened for 45 days anyway');
        return 0;
    });
}

/**
 * run one backup now. cfg: { key, folder, keep } (default: the saved settings) → Promise of the new state.
 */
function fsBackupNow(cfg, reason) {
    cfg = cfg || {};
    var key = String(cfg.key !== undefined ? cfg.key : getSetting('filesterKey') || '').trim();
    var folder = cleanText(cfg.folder !== undefined ? cfg.folder : getSetting('backupFolder')) || DEFAULT_SETTINGS.backupFolder;
    var keep = parseInt(cfg.keep !== undefined ? cfg.keep : getSetting('backupKeep'), 10) || 0;
    if (!key) return Promise.reject(new Error('No Filester API key'));
    var now = Date.now();
    fsSaveState({ last: now });
    var data = buildExportData();
    var json = JSON.stringify(data);
    var name = FS_NAME_PREFIX + new Date(now).toISOString().slice(0, 16).replace(/[:T]/g, '-') + (typeof CompressionStream === 'function' ? '.json.gz' : '.json');
    log.info('Backup (' + (reason || 'manual') + '): uploading ' + Object.keys(data.values).length + ' storage entries, ' + fmtBytes(json.length) + ' of JSON…');
    return fsGzip(json).then(function (z) {
        function up(fresh) {
            return fsFolderId(key, folder, fresh).then(function (fid) {
                return fsUpload(key, fid, z.blob, name).then(function (res) { return { res: res, fid: fid }; });
            });
        }
        return up(false).catch(function (e) {
            if (e.status === 404 || e.status === 400 || e.status === 403) return up(true);   // remembered folder gone? look it up again
            throw e;
        }).then(function (r) {
            var st = fsSaveState({ ok: Date.now(), err: '', name: name, url: r.res.url || '', size: z.blob.size });
            log.info('Backup: saved to Filester as ' + name + ' (' + fmtBytes(z.blob.size) + ')' + (r.res.url ? ' — ' + r.res.url : ''));
            return fsPrune(key, r.fid, keep).then(function () { return st; });
        });
    }).catch(function (e) {
        fsSaveState({ err: e.message || String(e) });
        log.warn('Backup to Filester failed: ' + (e.message || e));
        throw e;
    });
}

/** on page load: back up if it's due (enabled, key set, last good backup over a day old) */
function fsMaybeBackup() {
    if (!getSetting('backupEnabled') || !String(getSetting('filesterKey') || '').trim()) return;
    var st = fsState();
    var now = Date.now();
    if (st.ok && now - st.ok < FS_DAY_MS) return;
    if (st.last && st.last > (st.ok || 0) && now - st.last < FS_RETRY_MS) return;   // failed recently: wait an hour
    setTimeout(function () {
        var lock = GM_getValue(FS_LOCK_KEY, null);
        if (lock && Date.now() - lock.ts < 10 * 60000) return;                     // another tab is on it
        var again = fsState();
        if (again.ok && Date.now() - again.ok < FS_DAY_MS) return;
        GM_setValue(FS_LOCK_KEY, { ts: Date.now() });
        fsBackupNow(null, 'daily').catch(function () { /* logged, state saved */ }).then(function () { GM_deleteValue(FS_LOCK_KEY); });
    }, 15000);
}

// ── Settings & data: the backup section ──────────────────────────────────

/** fields go into the settings form (saved with "Save & reload"); the buttons use what's typed right now */
function backupSettingsBlock(checks) {
    var wrap = el('div');
    wrap.appendChild(el('div', { className: 'ht-label', text: 'Backup to Filester' }));
    var enabled = el('input', { type: 'checkbox' });
    enabled.checked = !!getSetting('backupEnabled');
    var key = el('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'API key from filester.me → Account settings' });
    key.value = getSetting('filesterKey') || '';
    var showKey = el('button', { type: 'button', className: 'ht-btn ht-icon', title: 'Show / hide the key', text: '👁' });
    showKey.addEventListener('click', function () { key.type = key.type === 'password' ? 'text' : 'password'; });
    var folder = el('input', { type: 'text', spellcheck: 'false' });
    folder.value = getSetting('backupFolder') || DEFAULT_SETTINGS.backupFolder;
    var keep = el('input', { type: 'number', min: '0', max: '1000', step: '1' });
    keep.value = getSetting('backupKeep');
    wrap.appendChild(el('label', { className: 'ht-check' }, [enabled, el('span', { text: 'Back up my history to my Filester account once a day (a private folder)' })]));
    wrap.appendChild(el('div', { className: 'ht-grid', style: 'margin-top:8px;gap:10px 18px' }, [
        el('label', { className: 'ht-field' }, [el('span', { text: 'Filester API key' }), el('span', { className: 'ht-keyrow' }, [key, showKey])]),
        el('label', { className: 'ht-field' }, [el('span', { text: 'Folder (created private if missing)' }), folder]),
        el('label', { className: 'ht-field' }, [el('span', { text: 'Backups kept (older ones deleted; 0 = keep all)' }), keep]),
    ]));

    var status = el('div', { className: 'ht-backup-status' });
    function drawStatus() {
        var st = fsState();
        var kids = [];
        if (st.ok) {
            kids.push('Last backup: ', el('b', { text: fmtDateTime(st.ok) }), ' (' + ago(st.ok) + ')' + (st.size ? ' · ' + fmtBytes(st.size) : '') + ' ');
            if (st.url) kids.push(el('a', { href: st.url, target: '_blank', rel: 'noopener noreferrer', text: st.name || 'open' }));
        } else {
            kids.push('No backup yet.');
        }
        if (st.err && (st.last || 0) >= (st.ok || 0)) kids.push(el('div', { className: 'ht-backup-err', text: '⚠ Last try ' + (st.last ? ago(st.last) : '') + ': ' + st.err }));
        else if (getSetting('backupEnabled') && st.ok) kids.push(el('div', { className: 'ht-sub', text: 'Next one after ' + fmtDateTime(st.ok + FS_DAY_MS) + ', on a page where the script runs.' }));
        status.replaceChildren.apply(status, kids);
    }
    drawStatus();

    var out = el('div', { className: 'ht-backup-out' });
    function cfg() { return { key: key.value.trim(), folder: cleanText(folder.value) || DEFAULT_SETTINGS.backupFolder, keep: parseInt(keep.value, 10) || 0 }; }
    function busy(b, on, text) { b.disabled = on; if (text) b.textContent = text; }
    var test = el('button', { type: 'button', className: 'ht-btn', text: '🔌 Test connection' });
    var now = el('button', { type: 'button', className: 'ht-btn', text: '☁️ Back up now' });
    var list = el('button', { type: 'button', className: 'ht-btn', text: '📋 Show backups' });
    test.addEventListener('click', function () {
        var c = cfg();
        if (!c.key) { out.textContent = 'Enter your API key first.'; return; }
        busy(test, true, '🔌 Testing…');
        fsAccount(c.key).then(function (r) {
            var a = r.data || r;
            out.replaceChildren(el('span', { className: 'ht-ok-text', text: '✔ Connected' + (a.username ? ' as ' + a.username : '') }),
                (a.storage_used !== undefined ? ' · storage ' + fmtBytes(+a.storage_used || 0) + (a.storage_limit ? ' of ' + fmtBytes(+a.storage_limit) : '') : '') +
                (a.files_count !== undefined ? ' · ' + a.files_count + ' files' : ''));
        }).catch(function (e) { out.replaceChildren(el('span', { className: 'ht-backup-err', text: '⚠ ' + e.message })); })
            .then(function () { busy(test, false, '🔌 Test connection'); });
    });
    now.addEventListener('click', function () {
        var c = cfg();
        if (!c.key) { out.textContent = 'Enter your API key first.'; return; }
        busy(now, true, '☁️ Backing up…');
        out.textContent = 'Uploading…';
        fsBackupNow(c, 'manual').then(function (st) {
            out.replaceChildren(el('span', { className: 'ht-ok-text', text: '✔ Saved ' + (st.name || '') + ' (' + fmtBytes(st.size || 0) + ')' }));
        }).catch(function (e) { out.replaceChildren(el('span', { className: 'ht-backup-err', text: '⚠ ' + e.message })); })
            .then(function () { busy(now, false, '☁️ Back up now'); drawStatus(); });
    });
    list.addEventListener('click', function () {
        var c = cfg();
        if (!c.key) { out.textContent = 'Enter your API key first.'; return; }
        busy(list, true, '📋 Loading…');
        fsFolderId(c.key, c.folder).then(function (fid) { return fsListBackups(c.key, fid); }).then(function (files) {
            if (!files.length) { out.textContent = 'No backups in "' + c.folder + '" yet.'; return; }
            out.replaceChildren(el('div', { className: 'ht-sub', text: files.length + ' backup' + (files.length === 1 ? '' : 's') + ' in "' + c.folder + '" — download one, then ⬆️ Import JSON… to restore it:' }),
                el('ul', { className: 'ht-list ht-backup-list' }, files.slice(0, 60).map(function (f) {
                    return el('li', {}, [
                        f.url ? el('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer', text: f.name }) : el('span', { text: f.name }),
                        el('span', { className: 'ht-sub', text: (f.size ? ' · ' + fmtBytes(+f.size) : '') + (f.created ? ' · ' + fmtDateTime(f.created) : '') }),
                    ]);
                })));
        }).catch(function (e) { out.replaceChildren(el('span', { className: 'ht-backup-err', text: '⚠ ' + e.message })); })
            .then(function () { busy(list, false, '📋 Show backups'); });
    });
    wrap.appendChild(status);
    wrap.appendChild(el('div', { className: 'ht-buttons' }, [test, now, list]));
    wrap.appendChild(out);
    wrap.appendChild(el('p', { className: 'ht-note', text:
        'The backup is the same data as "Export JSON" (all sites\' history, saved posts and pages — not your settings or this key), compressed. ' +
        'It goes only to your own Filester account. Filester deletes files nobody opened for 45 days, so old backups expire by themselves. ' +
        'The buttons use what\'s typed above; "💾 Save & reload" keeps it for the daily backup.' }));
    return {
        el: wrap,
        state: function () {
            return { backupEnabled: enabled.checked, filesterKey: key.value.trim(), backupFolder: cleanText(folder.value) || DEFAULT_SETTINGS.backupFolder, backupKeep: Math.max(0, parseInt(keep.value, 10) || 0) };
        },
    };
}
