// ==UserScript Module==
// @name         [PMVHaven] Playlist Viewer — API & playlist loader
// Version       1.5
// Part of pmvhaven_playlist_viewer.user.js (loaded via @require, shares its scope).
// Top-level code only declares things; main-script helpers are used inside functions only.

/* ───────────────────────── API ───────────────────────── */

function pvxHttpGet(url) {
    return new Promise((resolve, reject) => {
        if (typeof GM_xmlhttpRequest === 'function') {
            GM_xmlhttpRequest({
                method: 'GET', url, timeout: 30000,
                headers: { Accept: 'application/json' },
                onload: r => resolve({ status: r.status, headers: r.responseHeaders || '', text: r.responseText }),
                onerror: () => reject(new Error('Network error')),
                ontimeout: () => reject(new Error('Request timed out')),
            });
        } else {
            fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } })
                .then(async r => resolve({ status: r.status, headers: 'retry-after: ' + (r.headers.get('retry-after') || ''), text: await r.text() }))
                .catch(reject);
        }
    });
}

/** GET /api<path> → parsed JSON. Retries 429 / 502 / 503 with back-off. */
async function pvxApi(path) {
    const url = location.origin + '/api' + path;
    let wait = 1500;
    for (let attempt = 0; ; attempt++) {
        const r = await pvxHttpGet(url);
        if ((r.status === 429 || r.status === 502 || r.status === 503) && attempt < 4) {
            const ra = /retry-after:\s*(\d+)/i.exec(r.headers);
            await sleep(ra ? Math.min(+ra[1], 30) * 1000 : wait);
            wait *= 2;
            continue;
        }
        if (r.status < 200 || r.status >= 300) {
            let msg = '';
            try { const j = JSON.parse(r.text); msg = j.statusMessage || j.message || ''; } catch (e) { /* not JSON */ }
            throw new Error(`HTTP ${r.status}${msg ? ' – ' + msg : ''}`);
        }
        try { return JSON.parse(r.text); } catch (e) { throw new Error('The API returned invalid JSON'); }
    }
}

/* ───────────────────────── Playlist loading ───────────────────────── */

const PVX_PREVIEW_BASE = 'https://pmvhavencloud.s3.eu-west-par.io.cloud.ovh.net/previews/';
const PVX_CACHE = new Map();   // pid → { pl, videos, ts }
const PVX_BULK_MAX = 100;      // /videos/bulk limit

function pvxIsFullVideo(o) {
    return o && typeof o === 'object' && o.title && (o.durationSeconds != null || o.duration) && o.uploader;
}

function pvxNormalizePlaylist(p, pid) {
    const owner = p.owner && typeof p.owner === 'object' ? p.owner : null;
    return {
        id: p._id || pid,
        name: p.name || p.title || '(untitled playlist)',
        description: p.description || '',
        owner: (owner ? owner.username || owner.displayName : p.ownerUsername || p.owner) || '',
        ownerId: (owner ? owner._id : p.ownerId) || '',
        ownerAvatar: (owner ? owner.avatarUrl : p.ownerAvatarUrl) || '',
        views: p.views, likes: p.likes, dislikes: p.dislikes,
        rating: p.bayesianRating,
        createdAt: p.createdAt, updatedAt: p.updatedAt,
        thumb: p.thumbnailUrl || p.thumbnail || '',
        isPublic: p.isPublic,
        videoCount: p.videoCount ?? p.validVideoCount,
    };
}

function pvxNormalizeVideo(v, id, idx) {
    const arr = x => Array.isArray(x) ? x.filter(Boolean).map(String) : (x ? [String(x)] : []);
    const music = Array.isArray(v?.music) ? v.music.filter(Boolean).map(m => typeof m === 'string'
        ? { artist: '', song: m } : { artist: m.artist || '', song: m.song || m.title || '' }) : [];
    const o = {
        idx, id: v?._id || id, missing: !v,
        title: v?.title || '(unavailable video)',
        thumb: v?.thumbnailUrl || v?.thumbnail || '',
        // Preview clip (field not in the OpenAPI spec, but the site's own video objects carry it).
        // Fallback: the path the site uses for newer videos; a 404 just means no preview.
        preview: v ? (v.previewUrl || PVX_PREVIEW_BASE + encodeURIComponent(v._id || id) + '_preview.mp4') : '',
        durSec: v ? (v.durationSeconds || parseDur(v.duration)) : 0,
        views: v?.views, likes: v?.likes, dislikes: v?.dislikes, favorites: v?.favorites,
        rating: v?.bayesianRating,
        uploadDate: v?.uploadDate || v?.createdAt || '',
        uploader: v?.uploader || '', uploaderId: v?.uploaderId || '', uploaderAvatar: v?.uploaderAvatarUrl || '',
        tags: arr(v?.tags), stars: arr(v?.starsTags), creators: arr(v?.creator),
        music,
        key: v?.key || '', oldId: v?.oldId || '',
        seizure: !!v?.seizureWarning,
        width: v?.width, height: v?.height,
        description: v?.description || '',
    };
    const lc = a => a.map(s => s.toLowerCase());
    o.f = {
        title: o.title.toLowerCase(),
        by: o.uploader.toLowerCase(),
        tag: lc(o.tags), star: lc(o.stars), creator: lc(o.creators),
        music: lc(music.map(m => [m.artist, m.song].filter(Boolean).join(' - '))),
    };
    o.hay = [o.f.title, o.f.by, ...o.f.tag, ...o.f.star, ...o.f.creator, ...o.f.music, o.description.toLowerCase()].join('\n');
    return o;
}

/** Turns the playlist's `videos` field (ids or objects, any shape) into ordered entries. */
function pvxPlaylistEntries(pl) {
    const raw = pl.videos || pl.items || pl.videoIds || [];
    if (!Array.isArray(raw)) return [];
    return raw.map(e => {
        if (typeof e === 'string') return { id: e, obj: null };
        if (!e || typeof e !== 'object') return null;
        if (e.video && typeof e.video === 'object') return { id: e.video._id, obj: e.video };
        const id = e._id || e.id || e.videoId || (typeof e.video === 'string' ? e.video : null);
        return { id, obj: e.title ? e : null };
    }).filter(e => e && e.id);
}

const PVX_CACHE_MAX = 4;       // playlists kept in memory (a 10k playlist is a few MB)
const PVX_BULK_GAP = 250;      // ms between bulk requests

/** Placeholder for a video whose details haven't arrived yet. */
function pvxPendingVideo(id, idx) {
    const o = pvxNormalizeVideo(null, id, idx);
    o.missing = false;
    o.pending = true;
    o.title = 'Loading…';
    o.hay = '';
    return o;
}

function pvxCachePut(pid, job) {
    PVX_CACHE.delete(pid);
    PVX_CACHE.set(pid, job);
    while (PVX_CACHE.size > PVX_CACHE_MAX) PVX_CACHE.delete(PVX_CACHE.keys().next().value);
}

/**
 * A playlist load job. Kept in PVX_CACHE so a stopped / interrupted load resumes
 * where it left off when the playlist is opened again.
 *   job.pl        normalized playlist
 *   job.entries   [{id, obj}] in playlist order
 *   job.videos    normalized videos (pending placeholders until loaded)
 *   job.found     Map id → raw video
 *   job.queue     ids still to look up (in playlist order)
 *   job.done      true when everything has been looked up
 */
async function pvxCreateJob(pid) {
    const res = await pvxApi('/playlists/' + encodeURIComponent(pid));
    const raw = res?.data || res?.playlist || res;
    if (!raw || typeof raw !== 'object') throw new Error('Unexpected playlist response');

    const entries = pvxPlaylistEntries(raw);
    if (!entries.length && (raw.videoCount || raw.validVideoCount)) {
        throw new Error('The API did not return the list of videos for this playlist');
    }
    const pl = pvxNormalizePlaylist(raw, pid);
    pvxSessionSave(pid, pl, entries);
    return pvxBuildJob(pid, pl, entries);
}

function pvxBuildJob(pid, pl, entries) {
    const found = new Map();
    for (const e of entries) if (pvxIsFullVideo(e.obj)) found.set(e.id, e.obj);
    const queue = [...new Set(entries.filter(e => !found.has(e.id)).map(e => e.id))];
    return {
        pid, pl, entries, found, queue,
        videos: entries.map((e, i) => found.has(e.id) ? pvxNormalizeVideo(found.get(e.id), e.id, i) : pvxPendingVideo(e.id, i)),
        total: queue.length, oldIdsTried: false, done: !queue.length, ts: Date.now(), version: 0,
        signal: { stopped: false },
    };
}

/* The playlist's id list is also kept in this tab's sessionStorage for a while, so moving
   from video to video in playlist mode (full page loads) doesn't download it every time. */
const PVX_SESSION_TTL = 30 * 60000;

function pvxSessionSave(pid, pl, entries) {
    try {
        sessionStorage.setItem('pvx_pl_' + pid, JSON.stringify({ ts: Date.now(), pl, ids: entries.map(e => e.id) }));
    } catch (e) { /* storage full / blocked — not important */ }
}

function pvxSessionLoad(pid) {
    try {
        const o = JSON.parse(sessionStorage.getItem('pvx_pl_' + pid) || 'null');
        if (!o || Date.now() - o.ts > PVX_SESSION_TTL || !Array.isArray(o.ids)) return null;
        return pvxBuildJob(pid, o.pl, o.ids.map(id => ({ id, obj: null })));
    } catch (e) { return null; }
}

/** The playlist job (ids + info), from memory, this tab's session copy or the API — no video details yet. */
async function pvxGetJob(pid, force) {
    let job = PVX_CACHE.get(pid);
    const stale = job && job.done && Date.now() - job.ts > S.cacheMinutes * 60000;
    if (job && !force && !stale) return job;
    if (job && job.running) { job.signal.stopped = true; job.onUpdate = null; }
    job = (!force && !job && pvxSessionLoad(pid)) || await pvxCreateJob(pid);
    pvxCachePut(pid, job);
    return job;
}

/** Loads the details of the videos at positions [from, to) only (used by the playlist player page). */
async function pvxLoadRange(job, from, to) {
    const ids = [...new Set(job.entries.slice(Math.max(0, from), to).map(e => e.id).filter(id => !job.found.has(id)))];
    for (let i = 0; i < ids.length; i += PVX_BULK_MAX) {
        const chunk = ids.slice(i, i + PVX_BULK_MAX);
        const r = await pvxApi('/videos/bulk?ids=' + chunk.map(encodeURIComponent).join(','));
        for (const v of (r?.data || r?.videos || [])) {
            if (!v) continue;
            for (const k of [v._id, v.oldId, v.key]) if (k) job.found.set(String(k), v);
        }
        pvxRefreshVideos(job, chunk, true);   // not found → shown as unavailable
        if (i + PVX_BULK_MAX < ids.length) await sleep(PVX_BULK_GAP);
    }
    if (ids.length) job.queue = job.queue.filter(id => !job.found.has(id));
    return job;
}

/** Re-normalizes the entries whose raw video is now known (or finalizes missing ones). */
function pvxRefreshVideos(job, ids, finalize) {
    const set = new Set(ids);
    job.entries.forEach((e, i) => {
        if (!set.has(e.id)) return;
        const v = job.found.get(e.id) || (finalize ? e.obj : null);
        if (v || finalize) job.videos[i] = pvxNormalizeVideo(v || null, e.id, i);
    });
    job.version++;
}

/** Pauses a running load (the job stays in the cache and resumes on the next open). */
function pvxStopLoad(pid) {
    const job = PVX_CACHE.get(pid);
    if (!job || !job.signal) return;
    job.signal.stopped = true;
    job.onUpdate = null;
}

/**
 * Loads (or resumes) a playlist. onUpdate(job) is called after the playlist info
 * and after each batch of videos. Resolves with the job when loading ends
 * (finished or stopped — check job.done).
 */
async function pvxLoadPlaylist(pid, { force = false, onUpdate } = {}) {
    const job = await pvxGetJob(pid, force);   // also marks it as recently used
    job.onUpdate = onUpdate || null;
    job.signal = job.signal || { stopped: false };
    job.signal.stopped = false;
    job.onUpdate?.(job);
    if (job.done) return job;
    if (job.running) return job.promise;   // a stopped loop that hasn't exited yet just continues
    job.promise = pvxRunJob(job);
    return job.promise;
}

async function pvxRunJob(job) {
    const signal = job.signal;
    const onUpdate = j => job.onUpdate?.(j);
    job.running = true;
    try {
        while (job.queue.length && !signal.stopped) {
            const chunk = job.queue.slice(0, PVX_BULK_MAX);
            const r = await pvxApi('/videos/bulk?ids=' + chunk.map(encodeURIComponent).join(','));
            for (const v of (r?.data || r?.videos || [])) {
                if (!v) continue;
                for (const k of [v._id, v.oldId, v.key]) if (k) job.found.set(String(k), v);
            }
            job.queue.splice(0, chunk.length);
            pvxRefreshVideos(job, chunk.filter(id => job.found.has(id)), false);
            onUpdate?.(job);
            if (job.queue.length && !signal.stopped) await sleep(PVX_BULK_GAP);
        }
        if (signal.stopped) return job;

        // Videos migrated from the old site may be stored by their legacy id.
        const missing = [...new Set(job.entries.filter(e => !job.found.has(e.id)).map(e => e.id))];
        if (missing.length && !job.oldIdsTried) {
            job.oldIdsTried = true;
            for (let i = 0; i < missing.length && !signal.stopped; i += PVX_BULK_MAX) {
                try {
                    const r = await pvxApi('/videos/bulk?oldIds=' + missing.slice(i, i + PVX_BULK_MAX).map(encodeURIComponent).join(','));
                    for (const v of (r?.data || r?.videos || [])) if (v?.oldId) job.found.set(String(v.oldId), v);
                } catch (e) { break; /* best effort */ }
                await sleep(PVX_BULK_GAP);
            }
            if (signal.stopped) { job.oldIdsTried = false; return job; }
        }
        pvxRefreshVideos(job, missing, true);
        job.done = true;
        job.ts = Date.now();
        onUpdate?.(job);
        return job;
    } finally {
        job.running = false;
    }
}

/* ───────────────────────── URLs ───────────────────────── */

/* The site's links are /video/<title-slug>_<id>; the id alone (/video/<id>) works too, so when
   the title isn't known (yet) or has no letters, "{slug}_" is simply left out. */
function pvxFillUrl(tpl, v, pid) {
    const slug = v.pending || v.missing ? '' : slugify(v.title);
    if (!slug) tpl = String(tpl || '').replace(/\{slug\}[_-]?/g, '');
    const map = {
        id: v.id, key: v.key || v.id, oldId: v.oldId || v.id, slug,
        pid, index: v.idx, index1: v.idx + 1,
    };
    const out = String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in map ? encodeURIComponent(map[k] ?? '') : m));
    try { return new URL(out, location.origin).href; } catch (e) { return out; }
}

const pvxVideoUrl = (v, pid) => pvxFillUrl(S.videoUrl, v, pid);
const pvxPlaylistVideoUrl = (v, pid) => pvxFillUrl(S.playlistVideoUrl, v, pid);
const pvxPlaylistPageUrl = pid => location.origin + '/playlists/' + pid;
