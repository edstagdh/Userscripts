// ==UserScript Module==
// @name         [PMVHaven] Playlist Viewer — playlist downloads
// Version       1.9
// Part of pmvhaven_playlist_viewer.user.js (loaded via @require, shares its scope).
// Top-level code only declares things; main-script helpers are used inside functions only.

/* Downloads every video of a playlist, strictly one file at a time.

   Original file: each video's full record (GET /api/videos/<id>) has `videoUrl` — the uploaded
   file itself (not the HLS stream the player uses) — plus `filename`, `fileSize`, `contentType`.
   The playlist's own video records don't carry it, so the record is looked up right before that
   video's turn. Files are saved with Tampermonkey's GM_download (needs .mp4 allowed in Tampermonkey's
   download settings; "Browser API" mode streams straight to disk — files can be 1–2 GB).

   Big playlists / dead links (v1.9):
   - Storage is split so a 10k queue stays cheap: the item list (pvx_dl_items) is written only when
     items are added / removed; statuses are one character per item in a string (pvx_dl), so a
     status change writes ~2 bytes × items instead of the whole queue.
   - Dead links are their own status ("dead"), found without downloading: the loaded playlist already
     knows the video is gone, the API says 404, the record has no original file, or a HEAD request
     says the file is gone from the server. They cost ~0.25 s, are not retried by "Retry", and are
     listed in their own tab.
   - Safety stops: 5 real failures in a row (connection / site down / signed out) pause the queue;
     15 "no original file" answers in a row with nothing downloaded yet pause it too (that looks like
     a site change or a login problem rather than dead links) — Resume continues anyway.

   The queue is shared by all pmvhaven tabs and survives reloads. Only one tab downloads at a time
   (lock pvx_dl_lock with a heartbeat); the others just show progress. While downloading, leaving /
   closing the tab asks for confirmation; if it's closed anyway the queue pauses and can be resumed.
   Finished video ids per playlist are remembered (pvx_dl_done) to skip them next time. */

const PVD_KEY = 'pvx_dl';                   // { v:2, rev, paused, note, st, er, msg }
const PVD_ITEMS_KEY = 'pvx_dl_items';       // { rev, list: [[k, id, pid, idx, n, dir, title], …] }
const PVD_DONE_KEY = 'pvx_dl_done';         // { pid: [video ids] }
const PVD_LOCK_KEY = 'pvx_dl_lock';
const PVD_CUR_KEY = 'pvx_dl_cur';           // live progress of the current file, for other tabs
const PVD_LOCK_TTL = 8000;                  // a lock older than this belongs to a closed tab
const PVD_GAP = 1500;                       // pause after a downloaded file (ms)
const PVD_GAP_DEAD = 250;                   // … after a dead link
const PVD_GAP_FAIL = 2000;                  // … after a failure
const PVD_FAIL_STOP = 5;                    // real failures in a row → pause
const PVD_NOFILE_STOP = 15;                 // "no original file" in a row (nothing downloaded yet) → pause
const PVD_MSG_MAX = 150;                    // stored free-text error messages
const PVD_TAB = Math.random().toString(36).slice(2, 10);
const PVD_FILE_BASE = 'https://pmvhavencloud.s3.eu-west-par.io.cloud.ovh.net/';
const PVD_FATAL = { not_enabled: 1, not_whitelisted: 1, not_permitted: 1, not_supported: 1 };

// status ↔ one-character code
const PVD_ST = { q: 'queued', a: 'active', d: 'done', f: 'failed', x: 'dead', s: 'skipped' };
const PVD_STC = Object.fromEntries(Object.entries(PVD_ST).map(([c, n]) => [n, c]));
// error / note codes ('m' = free text in state.msg)
const PVD_ERR = {
    i: 'Interrupted — will be downloaded again',
    c: 'Cancelled',
    g: 'Dead link: the video was removed from the site',
    n: 'Dead link: the site has no original file for this video',
    z: 'Dead link: the file is gone from the site\'s storage',
    o: 'Saved without the playlist folder',
};

let PVD = null;   // { s: state, running, cur, els, cache: {rev, items}, … }

/* ───────────────────────── State ───────────────────────── */

function pvdEmpty() { return { v: 2, rev: 0, paused: false, note: '', items: [], msg: {} }; }

function pvdItemFromRow(r) {
    return { k: r[0], id: r[1], pid: r[2], idx: r[3], n: r[4], dir: r[5], title: r[6], st: 'queued', ec: '', err: '' };
}

/** Item objects for a list revision (re-read only when the list itself changed). */
function pvdItemsFor(rev) {
    const c = PVD && PVD.cache;
    if (c && c.rev === rev) return c.items;
    const stored = GM_getValue(PVD_ITEMS_KEY, null);
    const items = stored && Array.isArray(stored.list) ? stored.list.map(pvdItemFromRow) : [];
    if (PVD) PVD.cache = { rev: stored ? stored.rev : rev, items };
    return items;
}

function pvdFromMeta(m) {
    if (!m || m.v !== 2) return pvdEmpty();
    const items = pvdItemsFor(m.rev);
    const st = m.st || '', er = m.er || '', msg = m.msg || {};
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        it.st = PVD_ST[st[i]] || 'queued';
        const e = er[i] && er[i] !== '-' ? er[i] : '';
        it.ec = e;
        it.err = e === 'm' ? (msg[it.k] || 'Download failed') : (PVD_ERR[e] || '');
    }
    return { v: 2, rev: m.rev, paused: !!m.paused, note: m.note || '', items, msg };
}

function pvdRead() {
    let m = GM_getValue(PVD_KEY, null);
    if (m && Array.isArray(m.items)) m = pvdMigrate(m);   // v1.8 format
    return pvdFromMeta(m);
}

/** v1.8 kept everything in one object: convert once. */
function pvdMigrate(old) {
    const s = pvdEmpty();
    s.paused = !!old.paused;
    s.note = old.note || '';
    for (const o of old.items) {
        const it = { k: o.k, id: o.id, pid: o.pid, idx: o.idx, n: o.n || '', dir: o.dir || '', title: o.title || '', st: o.st === 'active' ? 'queued' : o.st, ec: '', err: '' };
        if (o.err) { it.ec = 'm'; s.msg[o.k] = String(o.err).slice(0, 200); }
        s.items.push(it);
    }
    pvdWrite(s, true);
    return GM_getValue(PVD_KEY, null);
}

/** Writes the state. structural = items were added / removed (rewrites the item list). */
function pvdWrite(s, structural) {
    if (structural || !s.rev) {
        s.rev = (s.rev || 0) + 1;
        GM_setValue(PVD_ITEMS_KEY, { rev: s.rev, list: s.items.map(it => [it.k, it.id, it.pid, it.idx, it.n, it.dir, it.title]) });
        if (PVD) PVD.cache = { rev: s.rev, items: s.items };
    }
    let st = '', er = '';
    const msg = {};
    let nMsg = 0;
    for (const it of s.items) {
        st += PVD_STC[it.st] || 'q';
        er += it.ec || '-';
        if (it.ec === 'm' && nMsg < PVD_MSG_MAX) { msg[it.k] = String(it.err || '').slice(0, 200); nMsg++; }
    }
    GM_setValue(PVD_KEY, { v: 2, rev: s.rev, paused: !!s.paused, note: s.note || '', st, er, msg });
}

/** Read-modify-write on the shared state (other tabs may have changed it). */
function pvdMutate(fn, structural) {
    const s = pvdRead();
    fn(s);
    pvdWrite(s, structural);
    if (PVD) PVD.s = s;
    pvdScheduleRender();
    return s;
}

/** Sets an item's status; ec = error code (PVD_ERR key, 'm' + text, or ''). */
function pvdSet(it, st, ec, text) {
    it.st = st;
    it.ec = ec || '';
    it.err = ec === 'm' ? String(text || 'Download failed') : (PVD_ERR[ec] || '');
}

/* finished ids: kept in memory and written in batches (one write per ~20 files, not per file) */
function pvdDoneSet(pid) {
    const all = GM_getValue(PVD_DONE_KEY, {});
    const set = new Set(all[pid] || []);
    for (const id of (PVD && PVD.doneBuf && PVD.doneBuf[pid]) || []) set.add(id);
    return set;
}

function pvdMarkDone(pid, id) {
    const buf = PVD.doneBuf || (PVD.doneBuf = {});
    (buf[pid] || (buf[pid] = [])).push(id);
    if (++PVD.doneN >= 20) pvdFlushDone();
}

function pvdFlushDone() {
    if (!PVD || !PVD.doneBuf) return;
    const buf = PVD.doneBuf;
    PVD.doneBuf = null;
    PVD.doneN = 0;
    const all = GM_getValue(PVD_DONE_KEY, {});
    for (const [pid, ids] of Object.entries(buf)) {
        const set = new Set(all[pid] || []);
        for (const id of ids) set.add(id);
        all[pid] = [...set];
    }
    GM_setValue(PVD_DONE_KEY, all);
}

function pvdCounts(items) {
    const c = { queued: 0, active: 0, done: 0, failed: 0, dead: 0, skipped: 0, total: items.length };
    for (const it of items) c[it.st] = (c[it.st] || 0) + 1;
    c.pending = c.queued + c.active;
    c.finished = c.total - c.pending;
    return c;
}

/* ───────────────────────── Lock (one downloading tab) ───────────────────────── */

function pvdLockOwner() {
    const l = GM_getValue(PVD_LOCK_KEY, null);
    return l && Date.now() - l.ts < PVD_LOCK_TTL ? l.tab : null;
}

/** Claims the downloading role. Tabs see each other's writes with a delay, so: write the claim,
    wait, read it back — only the tab whose claim survived starts (no two tabs downloading at once). */
async function pvdTakeLock() {
    const owner = pvdLockOwner();
    if (owner && owner !== PVD_TAB) return false;
    if (owner !== PVD_TAB) {
        GM_setValue(PVD_LOCK_KEY, { tab: PVD_TAB, ts: Date.now() });
        await sleep(700);
        if (pvdLockOwner() !== PVD_TAB) return false;
    }
    GM_setValue(PVD_LOCK_KEY, { tab: PVD_TAB, ts: Date.now() });
    clearInterval(PVD.beat);
    PVD.beat = setInterval(() => GM_setValue(PVD_LOCK_KEY, { tab: PVD_TAB, ts: Date.now() }), 2000);
    return true;
}

function pvdDropLock() {
    clearInterval(PVD && PVD.beat);
    if (pvdLockOwner() === PVD_TAB) GM_setValue(PVD_LOCK_KEY, null);
}

/* ───────────────────────── Start-up ───────────────────────── */

function pvdInit() {
    PVD = { s: null, running: false, cur: null, els: null, cache: null, doneBuf: null, doneN: 0,
        minimized: !!GM_getValue('pvx_dl_min', false) };
    PVD.s = pvdRead();
    // A file marked "active" with no live downloading tab was interrupted (tab closed / crashed).
    if (!pvdLockOwner() && PVD.s.items.some(i => i.st === 'active')) {
        pvdMutate(s => {
            for (const it of s.items) if (it.st === 'active') pvdSet(it, 'queued', 'i');
            s.paused = true;
            s.note = 'The tab that was downloading was closed. Press Resume to continue.';
        });
    }
    if (PVD.s.items.length) pvdRender();

    // Other tabs: follow the shared state and the current file's progress (they never start by themselves).
    if (typeof GM_addValueChangeListener === 'function') {
        GM_addValueChangeListener(PVD_KEY, (name, oldV, newV, remote) => {
            if (!remote || !PVD) return;
            PVD.s = pvdFromMeta(newV);
            // the item list may arrive a moment after the statuses
            if (PVD.cache && newV && PVD.cache.rev !== newV.rev) setTimeout(() => { PVD.s = pvdRead(); pvdScheduleRender(); }, 600);
            pvdScheduleRender();
        });
        GM_addValueChangeListener(PVD_CUR_KEY, (name, oldV, newV, remote) => {
            if (remote && PVD && !PVD.running) { PVD.remoteCur = newV; pvdRenderCurrent(); }
        });
    }

    // Leaving the page while this tab downloads: ask first (the browser shows its own dialog).
    window.addEventListener('beforeunload', e => {
        if (PVD && PVD.running) { e.preventDefault(); e.returnValue = ''; return ''; }
    });
    // …and if the tab goes away anyway, hand the queue over in a paused state.
    window.addEventListener('pagehide', () => {
        if (!PVD) return;
        pvdFlushDone();
        if (!PVD.running) return;
        try { PVD.cur && PVD.cur.abort && PVD.cur.abort(true); } catch (e) { /* ignore */ }
        const s = pvdRead();
        for (const it of s.items) if (it.st === 'active') pvdSet(it, 'queued', 'i');
        s.paused = true;
        s.note = 'The tab that was downloading was closed. Press Resume to continue.';
        pvdWrite(s);
        pvdDropLock();
    });
}

/* ───────────────────────── Queue ───────────────────────── */

/** Adds videos to the queue (one pass, fine for 10k+). list: normalized videos ({id, idx, title}); pl: {id, name}. */
function pvdEnqueue(list, pl, opts) {
    const width = Math.max(3, String(opts.total || list.length).length);
    const dir = opts.folder ? pvdSafeName(pl.name || 'Playlist', 80) : '';
    let added = 0;
    pvdMutate(s => {
        const pos = new Map(s.items.map((it, i) => [it.k, it]));
        const drop = new Set(), add = [];
        for (const v of list) {
            const k = pl.id + ':' + v.id;
            const old = pos.get(k);
            if (old && (old.st === 'queued' || old.st === 'active')) continue;
            if (old) drop.add(k);   // a finished / failed copy of the same video goes away
            add.push({ k, id: v.id, pid: pl.id, idx: v.idx, n: opts.number ? String(v.idx + 1).padStart(width, '0') + ' - ' : '',
                dir, title: String(v.title || '').slice(0, 140), st: 'queued', ec: '', err: '' });
            pos.set(k, add[add.length - 1]);
        }
        if (drop.size) s.items = s.items.filter(it => !drop.has(it.k));
        s.items.push(...add);
        added = add.length;
        s.paused = false;
        s.note = '';
    }, true);
    PVD.trustDead = false;
    PVD.minimized = false;
    GM_setValue('pvx_dl_min', false);
    pvdRender();
    pvdKick();
    return added;
}

function pvdKick() {
    if (PVD.running || PVD.s.paused) return;
    if (!PVD.s.items.some(i => i.st === 'queued')) return;
    pvdRun();
}

async function pvdRun() {
    if (PVD.running || PVD.starting) return;
    PVD.starting = true;
    const ok = await pvdTakeLock();
    PVD.starting = false;
    if (!ok) { pvdScheduleRender(); return; }   // another tab is downloading
    if (PVD.running) return;
    PVD.running = true;
    PVD.failRun = 0;     // real failures in a row
    PVD.noFileRun = 0;   // "no original file" in a row
    PVD.doneThisRun = 0;
    pvdScheduleRender();
    let stop = null;     // { note } → pause the queue with this message
    try {
        for (;;) {
            const s = pvdRead();
            PVD.s = s;
            if (s.paused) break;
            const next = s.items.find(i => i.st === 'queued');
            if (!next) break;
            const k = next.k;
            pvdMutate(st => { const it = st.items.find(i => i.k === k); if (it) pvdSet(it, 'active'); });
            PVD.cur = { k, started: Date.now(), loaded: 0, total: 0, speed: 0, phase: 'lookup', file: '' };
            pvdRenderCurrent();
            let r;   // { st, ec, text }
            try {
                r = await pvdDownloadOne(next);
            } catch (err) {
                if (err.skipped) r = { st: 'skipped' };
                else if (err.dead) r = { st: 'dead', ec: err.dead };
                else r = { st: 'failed', ec: 'm', text: err.message || String(err) };
                if (err.fatal) stop = { note: err.message };
            }
            pvdMutate(st => {
                const it = st.items.find(i => i.k === k);
                if (!it || it.st !== 'active') return;   // removed / cancelled meanwhile
                pvdSet(it, r.st, r.ec, r.text);
            });
            if (r.st === 'done') { pvdMarkDone(next.pid, next.id); PVD.doneThisRun++; }
            PVD.cur = null;
            GM_setValue(PVD_CUR_KEY, null);

            // safety stops
            PVD.failRun = r.st === 'failed' ? PVD.failRun + 1 : 0;
            PVD.noFileRun = r.st === 'dead' && r.ec === 'n' ? PVD.noFileRun + 1 : r.st === 'done' ? 0 : PVD.noFileRun;
            if (!stop && PVD.failRun >= PVD_FAIL_STOP) {
                stop = { note: `${PVD_FAIL_STOP} downloads in a row failed (last: ${r.text}). Paused — check your connection and that you're signed in to PMVHaven, then press Resume (or Retry for the failed ones).` };
            }
            if (!stop && !PVD.trustDead && !PVD.doneThisRun && PVD.noFileRun >= PVD_NOFILE_STOP) {
                PVD.trustDead = true;   // ask only once per run
                stop = { note: `The site returned no original file for the last ${PVD_NOFILE_STOP} videos. If that's unexpected (the site may have changed, or wants you signed in), check before continuing. Press Resume to carry on — dead links are skipped.` };
            }
            if (stop) { pvdMutate(st => { st.paused = true; st.note = stop.note; }); break; }
            if (PVD.stopNow) break;
            await sleep(r.st === 'done' ? PVD_GAP : r.st === 'dead' ? PVD_GAP_DEAD : r.st === 'failed' ? PVD_GAP_FAIL : 300);
        }
    } finally {
        PVD.running = false;
        PVD.stopNow = false;
        pvdFlushDone();
        pvdDropLock();
        pvdMutate(s => { if (/^Pausing/.test(s.note || '')) s.note = 'Paused.'; });
        pvdScheduleRender();
    }
    const c = pvdCounts(PVD.s.items);
    if (!PVD.s.paused && !c.pending && c.total) pvdFinished(c);
}

function pvdSummary(c) {
    return [
        `${c.done.toLocaleString()} downloaded`,
        c.dead ? `${c.dead.toLocaleString()} dead link${c.dead === 1 ? '' : 's'}` : '',
        c.failed ? `${c.failed.toLocaleString()} failed` : '',
        c.skipped ? `${c.skipped.toLocaleString()} skipped` : '',
    ].filter(Boolean).join(', ');
}

function pvdFinished(c) {
    if (typeof GM_notification === 'function') {
        try { GM_notification({ title: 'Playlist downloads finished', text: pvdSummary(c), timeout: 10000 }); } catch (e) { /* ignore */ }
    }
}

const pvdDead = code => Object.assign(new Error(PVD_ERR[code]), { dead: code });

/** Looks up the original file of one video and downloads it. → { st:'done', ec } — throws with .dead / .fatal / .skipped */
async function pvdDownloadOne(it) {
    // 1. Dead already known? (the playlist was loaded in this tab and the video wasn't found)
    const job = typeof PVX_CACHE !== 'undefined' ? PVX_CACHE.get(it.pid) : null;
    const known = job && job.found ? job.found.get(it.id) : null;
    if (job && job.done && !known && job.entries.some(e => e.id === it.id)) throw pvdDead('g');

    // 2. The video's own record → original file
    let v = known && known.videoUrl ? known : null;
    if (!v) {
        try {
            const res = await pvxApi('/videos/' + encodeURIComponent(it.id));
            v = (res && (res.data || res.video)) || res || {};
        } catch (err) {
            if (err.status === 404 || err.status === 410) throw pvdDead('g');
            if (err.status === 401) throw new Error('Not signed in to PMVHaven (the site refused the lookup)');
            throw new Error('Couldn\'t look up the video: ' + err.message);
        }
    }
    const url = v.videoUrl || v.originalUrl || (v.key && /^videos\//.test(v.key) ? PVD_FILE_BASE + v.key : '');
    if (!url) throw pvdDead('n');
    let size = +v.fileSize || 0;
    const ext = (/\.[a-z0-9]{2,4}$/i.exec(v.filename || '') || /\.[a-z0-9]{2,4}(?=$|\?)/i.exec(url) || ['.mp4'])[0].toLowerCase();
    const base = String(v.filename || v.title || it.title || it.id).replace(/\.[a-z0-9]{2,4}$/i, '');
    const fileName = pvdSafeName(it.n + base, 150) + ext;
    Object.assign(PVD.cur, { phase: 'check', total: size, file: fileName, title: v.title || it.title });
    pvdRenderCurrent();

    // 3. Is the file still there? (a HEAD request: no download, no saved error page)
    const probe = await pvdProbe(url);
    if (probe.status === 404 || probe.status === 403 || probe.status === 410) throw pvdDead('z');
    if (!size && probe.size) size = probe.size;
    Object.assign(PVD.cur, { phase: 'download', total: size });
    pvdRenderCurrent();

    // 4. Download
    const useDir = it.dir && !PVD.noDir;
    try {
        await pvdGmDownload(url, useDir ? it.dir + '/' + fileName : fileName);
    } catch (err) {
        if (err.fatal || err.skipped) throw err;
        if (/\b(404|410|403)\b|forbidden|not.?found|bad.?content/i.test(err.detail || '')) throw pvdDead('z');
        // Some setups refuse sub-folders: try once more straight into the downloads folder.
        if (useDir && err.code === 'not_succeeded') {
            await pvdGmDownload(url, fileName);
            PVD.noDir = true;   // and save the next ones there directly (said so in the panel)
            pvdMutate(st => { st.note = 'Your download setup refuses sub-folders, so files are saved straight into the Downloads folder.'; });
            return { st: 'done', ec: 'o' };
        }
        throw err;
    }
    return { st: 'done', ec: '' };
}

/** HEAD request for the file → { status, size } (status 0 = couldn't check: download anyway). */
function pvdProbe(url) {
    return new Promise(resolve => {
        if (typeof GM_xmlhttpRequest !== 'function') return resolve({ status: 0 });
        try {
            GM_xmlhttpRequest({
                method: 'HEAD', url, timeout: 20000,
                onload: r => {
                    const len = /content-length:\s*(\d+)/i.exec(r.responseHeaders || '');
                    resolve({ status: r.status, size: len ? +len[1] : 0 });
                },
                onerror: () => resolve({ status: 0 }),
                ontimeout: () => resolve({ status: 0 }),
            });
        } catch (e) { resolve({ status: 0 }); }
    });
}

function pvdGmDownload(url, name) {
    return new Promise((resolve, reject) => {
        if (typeof GM_download !== 'function') {
            return reject(Object.assign(new Error('Downloads are not available (GM_download missing)'), { fatal: true }));
        }
        let handle = null, settled = false;
        const done = (fn, v) => { if (!settled) { settled = true; fn(v); } };
        let lastT = Date.now(), lastB = 0;
        handle = GM_download({
            url, name, saveAs: false, conflictAction: 'uniquify',
            onprogress: p => {
                if (!PVD.cur) return;
                const loaded = p.loaded || 0, total = p.lengthComputable ? p.total : PVD.cur.total;
                const now = Date.now();
                if (now - lastT >= 1000) {
                    const inst = (loaded - lastB) / ((now - lastT) / 1000);
                    PVD.cur.speed = PVD.cur.speed ? PVD.cur.speed * 0.6 + inst * 0.4 : inst;
                    lastT = now; lastB = loaded;
                }
                Object.assign(PVD.cur, { loaded, total: total || PVD.cur.total });
                pvdRenderCurrentSoon();
            },
            onload: () => done(resolve),
            onerror: e => done(reject, pvdGmError(e)),
            ontimeout: () => done(reject, new Error('The download timed out')),
        });
        PVD.cur.abort = (quiet) => {
            try { handle && handle.abort && handle.abort(); } catch (e) { /* ignore */ }
            done(reject, Object.assign(new Error('Skipped'), { skipped: true, quiet }));
        };
    });
}

/** Tampermonkey's error codes → a message that says what to do. */
function pvdGmError(e) {
    const code = (e && (e.error || e.name)) || 'not_succeeded';
    const detail = e && (e.details || e.message) ? ` (${e.details || e.message})` : '';
    const msg = {
        not_enabled: 'Downloads are turned off in Tampermonkey: Dashboard → Settings → Downloads → Download Mode.',
        not_whitelisted: 'Tampermonkey doesn\'t allow this file type: add .mp4 (and .webm, .mkv, .mov) to Dashboard → Settings → Downloads → Whitelisted File Extensions.',
        not_permitted: 'Tampermonkey was not allowed to download: accept its "downloads" permission request (Download Mode "Browser API").',
        not_supported: 'This Tampermonkey version can\'t download files.',
    }[code] || 'Download failed' + detail;
    return Object.assign(new Error(msg), { code, fatal: !!PVD_FATAL[code], detail: e && (e.details || e.message) || '' });
}

/** Windows-safe file / folder name. */
function pvdSafeName(s, max) {
    let n = String(s || '').normalize('NFC')
        .replace(/[\u0000-\u001f]/g, '')
        .replace(/\s*:\s*/g, ' - ')             // "Angel: Youngs" → "Angel - Youngs"
        .replace(/[/\\|]/g, '-')
        .replace(/[<>"?*]/g, '')                  // characters Windows doesn't allow in names
        .replace(/\s+/g, ' ').trim()
        .replace(/[. ]+$/, '');
    if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(n)) n += '_';
    if (n.length > max) n = n.slice(0, max).trim();
    return n || 'video';
}

/* ───────────────────────── Controls ───────────────────────── */

function pvdPause() {
    pvdMutate(s => { s.paused = true; s.note = PVD.running ? 'Pausing after the current file…' : ''; });
}

function pvdResume() {
    pvdMutate(s => { s.paused = false; s.note = ''; });
    pvdKick();
}

function pvdSkipCurrent() {
    if (PVD.cur && PVD.cur.abort) PVD.cur.abort();
}

/** Failed + skipped go back in the queue; dead links don't (they'd only fail again). */
function pvdRetryFailed() {
    pvdMutate(s => { for (const it of s.items) if (it.st === 'failed' || it.st === 'skipped') pvdSet(it, 'queued'); s.paused = false; s.note = ''; });
    pvdKick();
}

function pvdClearFinished() {
    pvdMutate(s => { s.items = s.items.filter(i => i.st === 'queued' || i.st === 'active'); }, true);
    if (!PVD.s.items.length) pvdRender();
}

function pvdCancelAll() {
    const c = pvdCounts(PVD.s.items);
    if (c.pending && !confirm(`Cancel ${c.pending.toLocaleString()} download${c.pending === 1 ? '' : 's'} that ${c.pending === 1 ? 'hasn\'t' : 'haven\'t'} finished?`)) return;
    pvdMutate(s => {
        for (const it of s.items) if (it.st === 'queued') pvdSet(it, 'skipped', 'c');
        s.paused = true; s.note = '';
    });
    PVD.stopNow = true;
    pvdSkipCurrent();
}

function pvdRemove(k) {
    pvdMutate(s => { s.items = s.items.filter(i => i.k !== k || i.st === 'active'); }, true);
}

/** One item again (also a dead link: maybe the site restored it). */
function pvdRetry(k) {
    pvdMutate(s => { const it = s.items.find(i => i.k === k); if (it) pvdSet(it, 'queued'); s.paused = false; s.note = ''; });
    pvdKick();
}

/* ───────────────────────── Progress panel ───────────────────────── */

const PVD_LIST_MAX = 200;   // rows rendered at once

function pvdScheduleRender() {
    if (!PVD || PVD._rt) return;
    PVD._rt = setTimeout(() => { PVD._rt = 0; pvdRender(); }, 250);
}

function pvdRenderCurrentSoon() {
    if (PVD._ct) return;
    PVD._ct = setTimeout(() => {
        PVD._ct = 0;
        pvdRenderCurrent();
        if (PVD.cur) GM_setValue(PVD_CUR_KEY, { k: PVD.cur.k, loaded: PVD.cur.loaded, total: PVD.cur.total, speed: PVD.cur.speed, started: PVD.cur.started, phase: PVD.cur.phase, file: PVD.cur.file });
    }, 500);
}

function pvdBuild() {
    const e = {};
    e.root = h('div', { id: 'pvx-dl', class: 'pvd' });
    e.pill = h('button', { type: 'button', class: 'pvd-pill', title: 'Show downloads', onclick: () => pvdMinimize(false) });
    e.title = h('div', { class: 'pvd-sum' });
    e.min = h('button', { type: 'button', class: 'pvd-ibtn', title: 'Minimize', onclick: () => pvdMinimize(true) }, '–');
    e.close = h('button', { type: 'button', class: 'pvd-ibtn', title: 'Close (only when nothing is left to download)', onclick: () => { pvdClearFinished(); } }, '×');
    e.note = h('div', { class: 'pvd-note' });
    e.keep = h('div', { class: 'pvd-keep' }, 'Keep this tab open until the downloads finish — leaving asks for confirmation.');
    e.curTitle = h('div', { class: 'pvd-curtitle' });
    e.curFill = h('div', { class: 'pvd-fill' });
    e.curText = h('div', { class: 'pvd-curtext' });
    e.cur = h('div', { class: 'pvd-cur' }, e.curTitle, h('div', { class: 'pvd-bar' }, e.curFill), e.curText);
    e.allFill = h('div', { class: 'pvd-fill pvd-fill-all' });
    e.allText = h('div', { class: 'pvd-alltext' });
    e.btns = h('div', { class: 'pvd-btns' });
    e.tabs = h('div', { class: 'pvd-tabs' });
    e.list = h('div', { class: 'pvd-list' });
    e.list.addEventListener('click', ev => {
        const b = ev.target.closest('[data-pvd-act]');
        if (!b) return;
        if (b.dataset.pvdAct === 'remove') pvdRemove(b.dataset.k);
        if (b.dataset.pvdAct === 'retry') pvdRetry(b.dataset.k);
    });
    e.panel = h('div', { class: 'pvd-panel' },
        h('div', { class: 'pvd-head' }, h('b', null, 'Downloads'), e.title, e.min, e.close),
        e.note, e.keep, e.cur,
        h('div', { class: 'pvd-all' }, h('div', { class: 'pvd-bar' }, e.allFill), e.allText),
        e.btns, e.tabs, e.list);
    e.root.append(e.pill, e.panel);
    document.body.append(e.root);
    PVD.els = e;
    PVD.tab = PVD.tab || 'queued';
}

function pvdMinimize(m) {
    PVD.minimized = m;
    GM_setValue('pvx_dl_min', m);
    pvdRender();
}

function pvdRender() {
    if (!PVD) return;
    const s = PVD.s, items = s.items;
    if (!items.length) { PVD.els && PVD.els.root.remove(); PVD.els = null; return; }
    if (!PVD.els || !PVD.els.root.isConnected) pvdBuild();
    const e = PVD.els, c = pvdCounts(items);
    const finished = c.finished;
    const owner = pvdLockOwner();
    const elsewhere = !PVD.running && owner && owner !== PVD_TAB;
    const busy = PVD.running || elsewhere;
    const pct = c.total ? finished / c.total : 0;

    e.root.classList.toggle('is-min', PVD.minimized);
    e.root.classList.toggle('is-busy', busy);
    e.pill.innerHTML = PVX_SVG.download + `<span>${finished.toLocaleString()} / ${c.total.toLocaleString()}</span>` +
        (c.failed ? `<span class="pvd-pfail">${c.failed.toLocaleString()} failed</span>` : '') +
        (c.dead ? `<span class="pvd-pdead">${c.dead.toLocaleString()} dead</span>` : '') + (s.paused && c.pending ? '<span class="pvd-ppause">paused</span>' : '');
    e.title.textContent = `${finished.toLocaleString()} / ${c.total.toLocaleString()}`;
    e.close.hidden = c.pending > 0;
    e.note.textContent = elsewhere ? 'Downloading in another tab — it continues there.' : s.note || '';
    e.note.hidden = !e.note.textContent;
    e.keep.hidden = !PVD.running;
    e.allFill.style.transform = `scaleX(${pct})`;
    e.allText.textContent = pvdSummary(c) + (c.pending ? ` · ${c.pending.toLocaleString()} waiting` : '');

    const btn = (label, fn, cls, title) => h('button', { type: 'button', class: 'pvd-btn ' + (cls || ''), onclick: fn, title: title || null }, label);
    e.btns.replaceChildren(...[
        c.pending && !elsewhere ? (s.paused ? btn('▶ Resume', pvdResume, 'is-acc') : btn('❚❚ Pause', pvdPause, '', 'Stop after the current file')) : null,
        PVD.running ? btn('Skip this file', pvdSkipCurrent) : null,
        (c.failed + c.skipped) && !elsewhere ? btn(`Retry ${(c.failed + c.skipped).toLocaleString()}`, pvdRetryFailed, '', 'Queue failed / skipped files again (dead links are left out — use ↻ on one to re-check it)') : null,
        finished ? btn('Clear finished', pvdClearFinished) : null,
        c.pending && !elsewhere ? btn('Cancel all', pvdCancelAll, 'is-danger') : null,
    ].filter(Boolean));

    const tabs = [['queued', 'Waiting', c.pending], ['done', 'Done', c.done], ['failed', 'Failed', c.failed + c.skipped], ['dead', 'Dead links', c.dead], ['all', 'All', c.total]]
        .filter(t => t[0] !== 'dead' || t[2] || PVD.tab === 'dead');
    e.tabs.replaceChildren(...tabs.map(([k, label, n]) => h('button', {
        type: 'button', class: 'pvd-tab' + (PVD.tab === k ? ' is-on' : ''), onclick: () => { PVD.tab = k; pvdRender(); },
    }, label, h('span', null, n.toLocaleString()))));

    const want = { queued: i => i.st === 'queued' || i.st === 'active', done: i => i.st === 'done', failed: i => i.st === 'failed' || i.st === 'skipped', dead: i => i.st === 'dead', all: () => true }[PVD.tab] || (() => true);
    const rows = items.filter(want);
    const icon = { queued: '•', active: '⬇', done: '✓', failed: '✕', skipped: '–', dead: '⊘' };
    const sig = PVD.tab + '|' + rows.length + '|' + rows.slice(0, PVD_LIST_MAX).map(i => i.k + i.st + (i.err ? 1 : 0)).join(',');
    if (e.list.dataset.sig !== sig) {
        e.list.dataset.sig = sig;
        const top = e.list.scrollTop;
        e.list.replaceChildren(...rows.slice(0, PVD_LIST_MAX).map(it => h('div', { class: 'pvd-row is-' + it.st, title: it.title + (it.err ? '\n' + it.err : '') },
            h('span', { class: 'pvd-st' }, icon[it.st] || '•'),
            h('span', { class: 'pvd-idx' }, '#' + (it.idx + 1)),
            h('span', { class: 'pvd-name' }, h('span', null, it.title || it.id), it.err ? h('small', null, it.err) : null),
            h('span', { class: 'pvd-size' }, it.st === 'active' && PVD.cur && PVD.cur.total ? pvdBytes(PVD.cur.total) : ''),
            it.st === 'queued' ? h('button', { type: 'button', class: 'pvd-x', title: 'Remove from the queue', dataset: { pvdAct: 'remove', k: it.k } }, '×') : null,
            it.st === 'failed' || it.st === 'skipped' || it.st === 'dead' ? h('button', { type: 'button', class: 'pvd-x', title: it.st === 'dead' ? 'Check again' : 'Try again', dataset: { pvdAct: 'retry', k: it.k } }, '↻') : null,
        )), ...(rows.length > PVD_LIST_MAX ? [h('div', { class: 'pvd-more' }, `+ ${(rows.length - PVD_LIST_MAX).toLocaleString()} more`)] : []));
        e.list.scrollTop = top;
        if (!rows.length) e.list.replaceChildren(h('div', { class: 'pvd-more' }, 'Nothing here.'));
    }
    pvdRenderCurrent();
}

function pvdRenderCurrent() {
    if (!PVD || !PVD.els) return;
    const e = PVD.els;
    const cur = PVD.running ? PVD.cur : PVD.remoteCur;
    const it = cur && PVD.s.items.find(i => i.k === cur.k && i.st === 'active');
    e.cur.hidden = !it;
    if (!it) return;
    e.curTitle.textContent = `#${it.idx + 1} · ${cur.file || it.title}`;
    e.curTitle.title = cur.file || it.title;
    const secs = Math.round((Date.now() - cur.started) / 1000);
    if (cur.phase === 'lookup') {
        e.curFill.style.transform = 'scaleX(0)';
        e.curText.textContent = 'Looking up the original file…';
    } else if (cur.phase === 'check') {
        e.curFill.style.transform = 'scaleX(0)';
        e.curText.textContent = 'Checking the file is still on the site…';
    } else if (cur.loaded && cur.total) {
        const p = Math.min(1, cur.loaded / cur.total);
        const left = cur.speed > 0 ? (cur.total - cur.loaded) / cur.speed : 0;
        e.curFill.style.transform = `scaleX(${p})`;
        e.curText.textContent = `${Math.floor(p * 100)}% · ${pvdBytes(cur.loaded)} of ${pvdBytes(cur.total)}` +
            (cur.speed ? ` · ${pvdBytes(cur.speed)}/s` : '') + (left ? ` · ${fmtDur(left)} left` : '');
    } else {
        // Browser-API mode doesn't report progress: show what we know.
        e.curFill.style.transform = 'scaleX(0)';
        e.curText.textContent = `Downloading${cur.total ? ' ' + pvdBytes(cur.total) : ''}… ${fmtDur(secs) || '0:00'} — progress is shown in Firefox's downloads list`;
    }
}

function pvdBytes(n) {
    if (!n) return '';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
}

/* ───────────────────────── "Download" dialog in the viewer ───────────────────────── */

function pvdToggleDialog(show) {
    if (!PV) return;
    const panel = PV.els.dlg;
    show = show ?? panel.hidden;
    if (show) { pvxToggleSettings(false); pvxCloseList(); pvxHidePop(); }
    panel.hidden = !show;
    PV.els.dlBtn.classList.toggle('is-on', show);
    if (show) pvdBuildDialog();
}

function pvdBuildDialog() {
    const panel = PV.els.dlg, job = PV.job;
    const close = h('button', { type: 'button', class: 'pvx-ibtn', title: 'Close', onclick: () => pvdToggleDialog(false),
        html: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' });
    if (!job) { panel.replaceChildren(h('div', { class: 'pvx-shead' }, h('b', null, 'Download videos'), close), h('div', null, 'The playlist is still loading…')); return; }

    const total = job.videos.length;
    const dead = job.videos.filter(v => v.missing).length;            // known dead links (left out)
    const unchecked = job.videos.filter(v => v.pending).length;       // not checked yet (still loading)
    const all = job.videos.filter(v => !v.missing);
    const results = PV.qText ? PV.list.filter(v => !v.missing) : null;
    const done = pvdDoneSet(PV.pid);
    const mode = (typeof GM_info !== 'undefined' && GM_info && GM_info.downloadMode) || '';
    const head = h('div', { class: 'pvx-shead' }, h('b', null, 'Download videos'), close);
    // nothing at all to offer: say why instead of a disabled button
    if (!total || (!all.length && job.done)) {
        panel.replaceChildren(head, h('div', { class: 'pvd-warn' }, !total
            ? 'This playlist has no videos.'
            : `All ${total.toLocaleString()} video${total === 1 ? '' : 's'} in this playlist ${total === 1 ? 'is a dead link' : 'are dead links'} (removed from the site) — there is nothing to download.`));
        return;
    }

    let scope = 'all';
    const opt = (key, label) => {
        const box = h('input', { type: 'checkbox', checked: !!S[key] });
        box.addEventListener('change', () => { pvxSet(key, box.checked); update(); });
        return h('label', { class: 'pvx-srow pvx-scheck' }, box, h('span', null, label));
    };
    const radio = (val, label) => {
        const r = h('input', { type: 'radio', name: 'pvd-scope', value: val, checked: scope === val });
        r.addEventListener('change', () => { scope = val; update(); });
        return h('label', { class: 'pvx-srow pvx-scheck' }, r, h('span', null, label));
    };
    const skipRow = opt('dlSkipDone', '');
    const startBtn = h('button', { type: 'button', class: 'pvx-btn pvd-start' });
    const summary = h('div', { class: 'pvd-dsum' });
    const pick = () => {
        let list = scope === 'results' && results ? results : all;
        if (S.dlSkipDone) list = list.filter(v => !done.has(v.id));
        return list;
    };
    const update = () => {
        const base = scope === 'results' && results ? results : all;
        const already = base.filter(v => done.has(v.id)).length;
        skipRow.hidden = !already;
        skipRow.querySelector('span').textContent = `Skip ${already.toLocaleString()} video${already === 1 ? '' : 's'} already downloaded from this playlist`;
        const n = pick().length;
        startBtn.textContent = n ? `⬇ Download ${n.toLocaleString()} video${n === 1 ? '' : 's'}`
            : !base.length ? 'No videos match' : 'Everything here was already downloaded';
        startBtn.disabled = !n || mode === 'disabled';
        const ex = `${S.dlFolder ? pvdSafeName(job.pl.name, 80) + '/' : ''}${S.dlNumber ? String(1).padStart(Math.max(3, String(job.videos.length).length), '0') + ' - ' : ''}Original file name.mp4`;
        summary.replaceChildren(h('span', null, 'Saved as '), h('code', null, ex));
    };
    startBtn.addEventListener('click', () => {
        const list = pick();
        if (!list.length) return;
        pvdEnqueue(list, { id: PV.pid, name: job.pl.name }, { folder: S.dlFolder, number: S.dlNumber, total: job.videos.length });
        pvdToggleDialog(false);
        pvxToast(`${list.length.toLocaleString()} video${list.length === 1 ? '' : 's'} added to the download queue.`, 'info');
    });

    const warn = mode === 'disabled'
        ? h('div', { class: 'pvd-warn is-bad' }, 'Downloads are turned off in Tampermonkey. Turn them on in Dashboard → Settings → Downloads → Download Mode (choose "Browser API").')
        : mode === 'native'
            ? h('div', { class: 'pvd-warn' }, 'Tampermonkey\'s Download Mode is "Native": each file passes through memory before it\'s saved, and these files are often 1–2 GB. For big files set Dashboard → Settings (Config mode: Advanced) → Downloads → Download Mode to "Browser API".')
            : null;

    panel.replaceChildren(...[
        h('div', { class: 'pvx-shead' }, h('b', null, 'Download videos'), close),
        h('div', { class: 'pvd-dinfo' }, 'Downloads the original uploaded files, one at a time. Each video\'s original file is looked up from the site right before its turn. Progress shows in the Downloads panel (bottom right) and the queue continues while you browse the site.'),
        warn,
        results ? h('div', { class: 'pvd-scope' }, radio('all', `Whole playlist — ${all.length.toLocaleString()} videos`), radio('results', `Current search results — ${results.length.toLocaleString()} videos`)) : null,
        dead ? h('div', { class: 'pvx-shelp' }, `${dead.toLocaleString()} dead link${dead === 1 ? ' is' : 's are'} left out (video${dead === 1 ? '' : 's'} removed from the site).`) : null,
        unchecked ? h('div', { class: 'pvx-shelp' }, `${unchecked.toLocaleString()} video${unchecked === 1 ? ' hasn\'t' : 's haven\'t'} been checked yet (the playlist is still loading). Dead links among them are recognised and skipped quickly while downloading.`) : null,
        skipRow,
        opt('dlFolder', 'Save into a folder named after the playlist'),
        opt('dlNumber', 'Number the files by their playlist position (001 - …)'),
        summary,
        h('div', { class: 'pvx-sbtns' }, startBtn),
    ].filter(Boolean));
    update();
}
