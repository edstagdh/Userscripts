// [HF][EMP] Advanced Viewer Experience — Poster Wall: full-screen endless poster grid
// Part of advanced_viewer_experience.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install advanced_viewer_experience.user.js.
// Version 3.16

// --------------------
// POSTER WALL — endless 2D grid (Kaleidescape-style)
//
// Full-screen overlay that tiles every torrent image on the page across an
// endless plane. Drag / wheel to glide in any direction, arrows to step,
// click or Enter to open. Rows without an image, or whose image fails to
// load (or is a tiny placeholder), are left out.
//
// Layout: cell (i, j) shows item  (i + j * S) mod N.
// Moving right walks the list in order and wraps around; each row down
// starts S items further on, so neighbours never repeat on screen for a
// normal 100-item page.
// --------------------
const WALL_INVALID_SRC_RE  = /noartwork|noimage/i;
const WALL_MIN_IMG_PX      = 40;      // smaller than this = tracking pixel / placeholder
const WALL_LOAD_GRACE_MS   = 3000;    // open the wall after this even if some images are still downloading
const WALL_MIN_COLS        = 3;
const WALL_MAX_COLS        = 14;
const WALL_ASPECT_ORDER    = ['auto', 'portrait', 'square', 'landscape'];
const WALL_ASPECTS         = { portrait: 2 / 3, square: 1, landscape: 16 / 9 };
const WALL_ASPECT_LABELS   = { auto: 'Auto', portrait: 'Poster', square: 'Square', landscape: 'Wide' };

let WALL_ASPECT       = GM_getValue('WALL_ASPECT', 'auto');
let WALL_FIT          = GM_getValue('WALL_FIT', 'cover');           // 'cover' | 'contain'
let WALL_COLS_VISIBLE = GM_getValue('WALL_COLS_VISIBLE', 7);        // zoom: columns across the screen
let WALL_EDGE_PAN     = GM_getValue('WALL_EDGE_PAN', false);        // glide when the mouse nears an edge
// Torrents sharing one image link become one poster with a picker (usually different resolutions)
let WALL_GROUP_DUP_IMAGES = GM_getValue('WALL_GROUP_DUP_IMAGES', GM_getValue('WALL_SKIP_DUP_IMAGES', true));
// Close the wall after this many minutes without mouse / wheel / keyboard activity (0 = never)
let WALL_IDLE_CLOSE_MIN = GM_getValue('WALL_IDLE_CLOSE_MIN', 10);
const WALL_IDLE_WARN_S  = 30;      // countdown shown before an idle close
// The notice about resource use / image hosts shown when the wall opens
let WALL_NOTICE_SHOW    = GM_getValue('WALL_NOTICE_SHOW', true);
const WALL_ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'wheel', 'keydown'];

// "Image unavailable" placeholders: hosts like imgbox / imagebam keep the original
// link but serve a generic template once an image is removed. We learn what those
// templates look like from example links (size + content fingerprint) and leave out
// any poster that matches. Example links themselves are also blocked outright.
const WALL_UNAVAIL_DEFAULT_URLS = [
    'https://images2.imgbox.com/9c/11/qvDFcYsq_o.jpg',
    'https://images2.imgbox.com/dd/c9/488NiWBY_o.jpg',
    'https://thumbs4.imagebam.com/bc/03/2f/MEOMWT2_t.jpg',
    'https://thumbs4.imagebam.com/8f/59/df/ME1AM82Z_t.jpg',
];
const WALL_DHASH_MAX_DIFF = 5;     // of 64 bits — near-identical structure
const WALL_PX_MEAN_DIFF   = 8;     // 8×8 colour thumbnail: average per-channel difference (0–255)
const WALL_PX_MAX_DIFF    = 48;    // ...and no single cell may differ more than this
let WALL_UNAVAIL_URLS = [];
let WALL_UNAVAIL_SIGS = {};        // url -> { w, h, sha, dh, px }
try { WALL_UNAVAIL_URLS = JSON.parse(GM_getValue('WALL_UNAVAIL_URLS', JSON.stringify(WALL_UNAVAIL_DEFAULT_URLS))) || []; } catch (e) { WALL_UNAVAIL_URLS = WALL_UNAVAIL_DEFAULT_URLS.slice(); }
try { WALL_UNAVAIL_SIGS = JSON.parse(GM_getValue('WALL_UNAVAIL_SIGS', '{}')) || {}; } catch (e) { WALL_UNAVAIL_SIGS = {}; }
Object.keys(WALL_UNAVAIL_SIGS).forEach(u => { if (WALL_UNAVAIL_SIGS[u].px === undefined) delete WALL_UNAVAIL_SIGS[u]; });
const wallUnavailStatus = {};      // url -> 'learning' | 'failed' (this page load only)
const wallFpCache = {};            // src -> Promise<{ w, h, sha, dh } | null>

let wall = null;             // live state while the wall is open
let wallSession = 0;         // bumps on every open/close so late image loads are ignored

// ── Image probing (cached across opens; timeouts are retried next time) ──
// ── Image loader ──
// One job per image link (torrents sharing an image share the job). Downloads go
// through a queue with a limited number of slots (see WALL_SLOTS): on-screen posters
// first, then the screen around them, then the rest. A
// download is never cancelled. Once an image has loaded it is checked (size,
// "unavailable" template), drawn once into a small copy sized for the poster, and
// the full-size image is released — posters then just draw the small copy, so
// scrolling never waits on decoding big (often animated) images again.
// Download slots by priority: on-screen posters may use every slot, the screen around
// them fewer, and background loading only a few — so whatever comes into view never
// waits behind background downloads. The total stays under the browser's own limits
// (about 10 image requests per page, 6 per host), otherwise the browser queues the
// extra requests itself in arrival order and our priorities stop mattering.
const WALL_SLOTS = [
    { all: 10, host: 6 },   // 0: on screen
    { all: 6,  host: 3 },   // 1: around the screen
    { all: 3,  host: 2 },   // 2: everything else
];
const WALL_THUMB_BUDGET_PX = 40e6;   // small copies kept in memory (~160 MB); oldest off-screen ones are dropped

function wallHost(src) {
    try { return new URL(src, location.href).host; } catch (e) { return ''; }
}

function wallLoaderInit(candidates) {
    const jobs = new Map();
    candidates.forEach(item => {
        let job = jobs.get(item.absSrc);
        if (!job) {
            job = { src: item.src, host: wallHost(item.src), state: 'queued', items: [],
                    thumb: null, tw: 0, th: 0, w: 0, h: 0, verified: false, lastUse: 0, order: jobs.size };
            jobs.set(item.absSrc, job);
        }
        job.items.push(item);
        item.job = job;
    });
    wall.ld = { jobs, active: 0, perHost: {}, thumbPx: 0, viewJobs: new Set(), nearJobs: new Set(), dist: new Map(),
                firstView: new Set(), settledJobs: 0, rangeKey: '' };
}

// Pixel size of a poster's drawing surface
function wallCellPx() {
    const dpr = window.devicePixelRatio || 1;
    return { cw: Math.max(1, Math.round((wall.pw - wall.gap) * dpr)), ch: Math.max(1, Math.round((wall.ph - wall.gap) * dpr)) };
}

function wallJobRank(job) {
    const ld = wall.ld;
    if (ld.viewJobs.has(job)) return 0;
    if (ld.nearJobs.has(job)) return 1;
    if (!wall.ready && ld.firstView.has(job)) return 0;
    return 2;
}

// Same priority tier: the poster nearest the middle of the screen first, then page order
function wallJobBefore(a, b) {
    const dist = wall.ld.dist, da = dist.has(a) ? dist.get(a) : 1e9, db = dist.has(b) ? dist.get(b) : 1e9;
    return da !== db ? da < db : a.order < b.order;
}

function wallPump() {
    if (!wall || !wall.ld) return;
    const ld = wall.ld;
    for (;;) {
        let best = null, bestRank = 9;
        ld.jobs.forEach(job => {
            if (job.state !== 'queued') return;
            const r = wallJobRank(job);
            // A dropped or outgrown small copy is only rebuilt when it's needed near the screen
            if (job.reloadWhenNear && r > 1) return;
            if (ld.active >= WALL_SLOTS[r].all || (ld.perHost[job.host] || 0) >= WALL_SLOTS[r].host) return;
            if (!best || r < bestRank || (r === bestRank && wallJobBefore(job, best))) { best = job; bestRank = r; }
        });
        if (!best) return;
        wallStartJob(best);
    }
}

function wallStartJob(job) {
    const ld = wall.ld, session = wall.session;
    job.state = 'loading';
    ld.active++;
    ld.perHost[job.host] = (ld.perHost[job.host] || 0) + 1;
    const img = new Image();
    img.decoding = 'async';
    let netDone = false;
    const releaseSlot = () => {
        if (netDone) return;
        netDone = true;
        if (!wall || wall.session !== session) return;
        ld.active--;
        ld.perHost[job.host]--;
        wallPump();
    };
    img.onerror = () => { releaseSlot(); if (wall && wall.session === session) wallJobFailed(job, 'broken'); };
    img.onload = () => {
        releaseSlot();
        if (!wall || wall.session !== session) return;
        const w = img.naturalWidth, h = img.naturalHeight;
        if (w < WALL_MIN_IMG_PX || h < WALL_MIN_IMG_PX) { wallJobFailed(job, 'placeholder'); return; }
        // Check against the placeholders known right now (saved from earlier visits);
        // links still being learned re-check finished posters afterwards.
        const check = job.verified ? Promise.resolve(false) : wallLooksUnavailable(job.src, w, h);
        check.then(un => {
            if (!wall || wall.session !== session) return;
            if (un) { wallJobFailed(job, 'unavailable'); return; }
            job.verified = true;
            return wallMakeThumb(img, w, h).then(t => {
                if (!wall || wall.session !== session) { wallFreeThumb(t); return; }
                const first = !job.w;
                if (job.thumb) { ld.thumbPx -= job.tw * job.th; wallFreeThumb(job.thumb); }
                job.thumb = t.src; job.tw = t.w; job.th = t.h; job.w = w; job.h = h;
                job.state = 'done';
                job.reloadWhenNear = false;
                job.lastUse = performance.now();
                ld.thumbPx += t.w * t.h;
                if (first) wallJobSettled(job, true);
                wallRedrawJob(job, true);
                wallEnforceBudget();
            });
        }).catch(err => {
            console.error(`${LOG_PREFIX} Poster Wall: could not prepare ${job.src}`, err);
            if (wall && wall.session === session) wallJobFailed(job, 'broken');
        });
    };
    img.src = job.src;
}

// Small copy of the image, big enough to fill a poster at the current size
function wallMakeThumb(img, w, h) {
    const { cw, ch } = wallCellPx();
    const s  = Math.min(1, Math.max(cw / w, ch / h) * 1.1);
    const tw = Math.max(1, Math.round(w * s)), th = Math.max(1, Math.round(h * s));
    const viaCanvas = () => {
        // Step down by halves for a clean downscale, then draw the final size
        let src = img, sw = w, sh = h;
        while (sw / 2 >= tw && sh / 2 >= th) {
            const c = document.createElement('canvas');
            c.width = Math.round(sw / 2); c.height = Math.round(sh / 2);
            const x = c.getContext('2d');
            x.imageSmoothingQuality = 'high';
            x.drawImage(src, 0, 0, c.width, c.height);
            src = c; sw = c.width; sh = c.height;
        }
        const c = document.createElement('canvas');
        c.width = tw; c.height = th;
        const x = c.getContext('2d');
        x.imageSmoothingQuality = 'high';
        x.drawImage(src, 0, 0, tw, th);
        return { src: c, w: tw, h: th };
    };
    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(img, { resizeWidth: tw, resizeHeight: th, resizeQuality: 'high' })
            .then(bm => ({ src: bm, w: tw, h: th }))
            .catch(() => viaCanvas());
    }
    return Promise.resolve().then(viaCanvas);
}

function wallFreeThumb(t) {
    const src = t && (t.src || t);
    if (src && typeof src.close === 'function') { try { src.close(); } catch (e) {} }
}

// Keep the small copies under budget: drop the least recently shown off-screen ones.
// They are rebuilt from the browser cache when needed again.
function wallEnforceBudget() {
    const ld = wall.ld;
    if (ld.thumbPx <= WALL_THUMB_BUDGET_PX) return;
    const victims = [];
    ld.jobs.forEach(job => {
        if (job.state === 'done' && !ld.viewJobs.has(job) && !ld.nearJobs.has(job)) victims.push(job);
    });
    victims.sort((a, b) => a.lastUse - b.lastUse);
    for (const job of victims) {
        if (ld.thumbPx <= WALL_THUMB_BUDGET_PX * 0.85) break;
        ld.thumbPx -= job.tw * job.th;
        wallFreeThumb(job.thumb);
        job.thumb = null; job.tw = job.th = 0;
        job.state = 'queued';   // reload (from cache) when it comes near the screen again
        job.reloadWhenNear = true;
    }
}

function wallJobFailed(job, reason) {
    if (job.state === 'failed') return;
    const wasSettled = !!job.w;
    if (job.thumb) { wall.ld.thumbPx -= job.tw * job.th; wallFreeThumb(job.thumb); job.thumb = null; }
    job.state = 'failed';
    job.items.forEach(it => {
        if (it.state === 'failed') return;
        it.state = 'failed';
        wall[reason === 'placeholder' ? 'placeholder' : reason === 'unavailable' ? 'unavailable' : 'broken']++;
    });
    if (!wasSettled) wallJobSettled(job, false);
    wallScheduleRebuild();
}

// New "unavailable" examples were learned after posters were shown: check those posters again
function wallRecheckUnavailable() {
    const session = wall.session;
    wall.ld.jobs.forEach(job => {
        if (!job.w || job.state === 'failed') return;
        wallLooksUnavailable(job.src, job.w, job.h).then(un => {
            if (un && wall && wall.session === session) wallJobFailed(job, 'unavailable');
        });
    });
}

// First result for a job: update item states and progress
function wallJobSettled(job, ok) {
    const ld = wall.ld;
    ld.settledJobs++;
    job.items.forEach(it => {
        wall.loading--;
        if (ok) { it.state = 'ok'; it.w = job.w; it.h = job.h; }
    });
    if (wall.onProgress) wall.onProgress();
    if (wall.ready) {
        wallUpdateCount();
        if (!wall.loading) wallLogStats();
    }
}

// ── "Image unavailable" placeholder detection ──
function wallAbsUrl(src) {
    try { return new URL(src, location.href).href; } catch (e) { return src; }
}

function wallSaveUnavail() {
    GM_setValue('WALL_UNAVAIL_URLS', JSON.stringify(WALL_UNAVAIL_URLS));
    GM_setValue('WALL_UNAVAIL_SIGS', JSON.stringify(WALL_UNAVAIL_SIGS));
}

function wallIsBlockedUrl(src) {
    return WALL_UNAVAIL_URLS.indexOf(wallAbsUrl(src)) !== -1;
}

function wallBytesToBase64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
}

function wallHamming(a, b) {
    if (!a || !b || a.length !== b.length) return 64;
    let d = 0;
    for (let i = 0; i < a.length; i++) {
        let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
        while (x) { d += x & 1; x >>= 1; }
    }
    return d;
}

// Download an image's bytes (cross-origin, via Tampermonkey) and return its size,
// a SHA-256 of the file and a 64-bit difference hash of a 9×8 grayscale copy.
// Resolves null when it can't be fetched or decoded.
function wallFingerprint(src) {
    const url = wallAbsUrl(src);
    if (wallFpCache[url]) return wallFpCache[url];
    const p = new Promise(resolve => {
        GM_xmlhttpRequest({
            method: 'GET', url, responseType: 'arraybuffer', timeout: 20000,
            headers: { Referer: location.origin + '/' },
            onerror: () => resolve(null),
            ontimeout: () => resolve(null),
            onload: (r) => {
                if (r.status < 200 || r.status >= 400 || !r.response) { resolve(null); return; }
                const bytes = new Uint8Array(r.response);
                const type  = ((r.responseHeaders || '').match(/content-type:\s*([^;\r\n]+)/i) || [])[1] || 'image/jpeg';
                const shaP  = (window.crypto && crypto.subtle)
                    ? crypto.subtle.digest('SHA-256', bytes).then(buf =>
                        Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''))
                        .catch(() => '')
                    : Promise.resolve('');
                const img = new Image();
                img.onerror = () => resolve(null);
                img.onload  = () => {
                    let dh = '', px = '';
                    try {
                        const c = document.createElement('canvas');
                        c.width = 9; c.height = 8;
                        const ctx = c.getContext('2d');
                        ctx.drawImage(img, 0, 0, 9, 8);
                        const d = ctx.getImageData(0, 0, 9, 8).data;
                        const L = (x, y) => { const o = (y * 9 + x) * 4; return d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114; };
                        let bits = '';
                        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += L(x, y) > L(x + 1, y) ? '1' : '0';
                        for (let i = 0; i < 64; i += 4) dh += parseInt(bits.substr(i, 4), 2).toString(16);
                        // 8×8 colour thumbnail: separates pictures whose structure is similar
                        // (e.g. mostly flat) but whose colours / layout differ
                        const c2 = document.createElement('canvas');
                        c2.width = 8; c2.height = 8;
                        const ctx2 = c2.getContext('2d');
                        ctx2.drawImage(img, 0, 0, 8, 8);
                        const d2 = ctx2.getImageData(0, 0, 8, 8).data;
                        for (let i = 0; i < d2.length; i += 4) {
                            for (let ch = 0; ch < 3; ch++) px += d2[i + ch].toString(16).padStart(2, '0');
                        }
                    } catch (e) { dh = ''; px = ''; }   // canvas unavailable: fall back to the file hash alone
                    shaP.then(sha => resolve({ w: img.naturalWidth, h: img.naturalHeight, sha, dh, px }));
                };
                // data: URL keeps the canvas readable (no cross-origin taint)
                img.src = 'data:' + type.trim() + ';base64,' + wallBytesToBase64(bytes);
            },
        });
    });
    wallFpCache[url] = p;
    p.then(v => { if (!v) delete wallFpCache[url]; });   // retry failures later
    return p;
}

// Learn the signature of every example link we haven't fingerprinted yet.
function wallLearnUnavail() {
    const todo = WALL_UNAVAIL_URLS.filter(u => !WALL_UNAVAIL_SIGS[u] && wallUnavailStatus[u] !== 'learning');
    return Promise.all(todo.map(u => {
        wallUnavailStatus[u] = 'learning';
        return wallFingerprint(u).then(fp => {
            if (fp && WALL_UNAVAIL_URLS.indexOf(u) !== -1) {
                WALL_UNAVAIL_SIGS[u] = fp;
                delete wallUnavailStatus[u];
            } else {
                wallUnavailStatus[u] = 'failed';
            }
        });
    })).then(() => { wallSaveUnavail(); refreshUnavailSettingsPanel(); });
}

// Is this (already loaded, w×h) image one of the known placeholders?
// Only images with exactly a placeholder's size are downloaded and compared.
function wallLooksUnavailable(src, w, h) {
    const sigs = Object.keys(WALL_UNAVAIL_SIGS).map(k => WALL_UNAVAIL_SIGS[k]).filter(s => s.w === w && s.h === h);
    if (!sigs.length) return Promise.resolve(false);
    return wallFingerprint(src).then(fp => {
        // The script's download must be the same picture the page shows; if the host
        // served something else (e.g. a hotlink notice), don't guess — keep the poster.
        if (!fp || fp.w !== w || fp.h !== h) return false;
        return sigs.some(sg => wallSigMatches(sg, fp));
    });
}

// Same file, or visually the same picture (structure AND colours) after re-encoding.
function wallSigMatches(sg, fp) {
    if (sg.sha && fp.sha && sg.sha === fp.sha) return true;
    if (!sg.dh || !fp.dh || !sg.px || !fp.px || sg.px.length !== fp.px.length) return false;
    if (wallHamming(sg.dh, fp.dh) > WALL_DHASH_MAX_DIFF) return false;
    let sum = 0, max = 0;
    for (let i = 0; i < sg.px.length; i += 2) {
        const diff = Math.abs(parseInt(sg.px.substr(i, 2), 16) - parseInt(fp.px.substr(i, 2), 16));
        sum += diff;
        if (diff > max) max = diff;
    }
    return sum / (sg.px.length / 2) <= WALL_PX_MEAN_DIFF && max <= WALL_PX_MAX_DIFF;
}

function wallAddUnavailUrl(src) {
    const u = wallAbsUrl(src);
    if (WALL_UNAVAIL_URLS.indexOf(u) === -1) WALL_UNAVAIL_URLS.push(u);
    wallSaveUnavail();
    refreshUnavailSettingsPanel();
    return wallLearnUnavail().then(() => WALL_UNAVAIL_SIGS[u] || null);
}

function wallRemoveUnavailUrl(u) {
    WALL_UNAVAIL_URLS = WALL_UNAVAIL_URLS.filter(x => x !== u);
    delete WALL_UNAVAIL_SIGS[u];
    delete wallUnavailStatus[u];
    wallSaveUnavail();
    refreshUnavailSettingsPanel();
}

function refreshUnavailSettingsPanel() {
    const $c = jQuery('#vsm-unavail-container');
    if (!$c.length) return;
    $c.empty();
    if (!WALL_UNAVAIL_URLS.length) {
        $c.append(jQuery('<span>').css({ color: '#555', fontSize: '11px' }).text('No example images.'));
        return;
    }
    WALL_UNAVAIL_URLS.forEach(u => {
        const sig = WALL_UNAVAIL_SIGS[u];
        const st  = wallUnavailStatus[u];
        let short = u;
        try { const x = new URL(u); short = x.hostname.replace(/^www\./, '') + '/…/' + x.pathname.split('/').pop(); } catch (e) {}
        const $chip = jQuery('<span class="vsm-bl-chip">');
        jQuery('<a target="_blank" rel="noopener">').attr('href', u).attr('title', u).text(short).appendTo($chip);
        const status = sig ? `${sig.w}×${sig.h}` : (st === 'failed' ? 'could not fetch' : 'learning…');
        jQuery('<span class="vsm-bl-time">').text('· ' + status)
            .attr('title', sig ? 'Learned — matching images are left out of the wall'
                               : (st === 'failed' ? 'Only this exact link is blocked until it can be fetched (retried on next wall open)' : ''))
            .appendTo($chip);
        jQuery('<button type="button" title="Remove">').html('&times;')
            .on('click', () => wallRemoveUnavailUrl(u)).appendTo($chip);
        $c.append($chip);
    });
}

// ── Gather torrents from every table on the page (respects blacklists) ──
function wallCollectItems() {
    const cols  = getGalleryColOffsets();
    const items = [];
    const seen  = new Set();
    const stats = { rows: 0, blacklisted: 0, noImage: 0, noLink: 0, duplicate: 0, blockedUrl: 0 };

    jQuery('.torrent_table tr.torrent').each(function () {
        const $row = jQuery(this);
        stats.rows++;
        if (rowIsBlacklisted($row)) { stats.blacklisted++; return; }

        const src = globalBackend ? globalBackend.get_image_src($row) : '';
        if (!src || WALL_INVALID_SRC_RE.test(src)) { stats.noImage++; return; }

        const $tds  = $row.find('> td');
        let $link = $tds.eq(cols.title).find('a[href*="torrents.php?id="]').first();
        if (!$link.length) $link = $row.find('a[href*="torrents.php?id="]').not('[href*="action="]').first();
        if (!$link.length) { stats.noLink++; return; }
        const href = $link.attr('href');
        if (seen.has(href)) { stats.duplicate++; return; }
        seen.add(href);

        if (wallIsBlockedUrl(src)) { stats.blockedUrl++; return; }
        const absSrc = wallAbsUrl(src);

        const td = (i) => (i >= 0 ? $tds.eq(i).text().replace(/\s+/g, ' ').trim() : '');

        let cat = '';
        if (cols.cat >= 0) {
            const $catTd = $tds.eq(cols.cat);
            cat = $catTd.find('div[title]').first().attr('title') || '';
            if (!cat) cat = $catTd.find('div[style*="position: absolute"]').first().text().trim();
        }

        let fav = false;
        try { fav = rowMatchesFavorites($row); } catch (e) { /* favorites optional */ }

        items.push({
            src, href, cat, fav,
            title:    $link.text().trim(),
            size:     td(cols.size),
            seeders:  td(cols.seeders),
            leechers: td(cols.leechers),
            time:     td(cols.time),
            absSrc,
            state:    'loading',   // 'loading' | 'ok' | 'failed'
            group:    null,        // display leader: every torrent sharing this image
        });
    });
    return { items, stats };
}

// ── Page suspend / restore ──
// While the wall is open, every loaded page image is swapped for a 1x1 blank (freeing
// its decoded pixels) and the page content is hidden (no layout / paint / observers).
// Everything is put back on close; the images come straight from the browser cache.
const WALL_BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function wallSuspendPage() {
    const saved = { scrollX: window.scrollX, scrollY: window.scrollY, imgs: [] };
    document.querySelectorAll('body img').forEach(img => {
        if (img.closest('#vw-wall')) return;
        const src = img.getAttribute('src');
        if (!src || src === WALL_BLANK_IMG) return;
        // Still downloading: leave it alone. Cancelling would throw away the partial
        // download, and the wall's own request for the same image joins this one.
        if (!img.complete) return;
        saved.imgs.push([img, src, img.getAttribute('srcset')]);
        if (img.hasAttribute('srcset')) img.removeAttribute('srcset');
        img.setAttribute('src', WALL_BLANK_IMG);
    });
    document.documentElement.classList.add('vw-page-suspended');
    return saved;
}

function wallRestorePage(saved) {
    document.documentElement.classList.remove('vw-page-suspended');
    if (!saved) return;
    saved.imgs.forEach(([img, src, srcset]) => {
        if (img.getAttribute('src') !== WALL_BLANK_IMG) return;   // changed by the page meanwhile
        if (srcset) img.setAttribute('srcset', srcset);
        img.setAttribute('src', src);
    });
    window.scrollTo(saved.scrollX, saved.scrollY);
}

// ── Open / close ──
function openPosterWall() {
    if (wall) return;
    const session = ++wallSession;
    const collected  = wallCollectItems();
    const candidates = collected.items;

    const $root = jQuery(`
        <div id="vw-wall" tabindex="-1">
            <div class="vw-stage"><div class="vw-layer"></div></div>
            <div class="vw-vignette"></div>
            <div class="vw-topbar">
                <span class="vw-brand">&#9638; Poster Wall</span>
                <span class="vw-count"></span>
                <div class="vw-controls">
                    <button class="vw-btn" data-act="zoom-out" title="Smaller (−)">&minus;</button>
                    <button class="vw-btn" data-act="zoom-in"  title="Larger (+)">+</button>
                    <span class="vw-sep"></span>
                    <button class="vw-btn" data-act="aspect" title="Cell shape (A)"></button>
                    <button class="vw-btn" data-act="fit"    title="Fill or fit images (F)"></button>
                    <button class="vw-btn" data-act="edge"   title="Glide when the mouse nears an edge (E)">Edge glide</button>
                    <button class="vw-btn" data-act="dups"   title="Group torrents that share an image into one poster (D)"></button>
                    <span class="vw-sep"></span>
                    <span class="vw-kbd-hint" title="Hover a poster showing an 'image unavailable' template and press U. No clicking needed, so the highlight stays on that poster."><kbd>U</kbd> mark hovered as unavailable</span>
                    <button class="vw-btn" data-act="notice" title="About the Poster Wall: resource use, image hosts, auto-close">&#9432;</button>
                    <button class="vw-btn vw-close" data-act="close" title="Close (Esc)">&times;</button>
                </div>
            </div>
            <div class="vw-info"><div class="vw-info-title"></div><div class="vw-info-meta"></div></div>
            <div class="vw-help">Drag or scroll to glide &middot; Shift+wheel sideways &middot; Ctrl+wheel to resize &middot; Arrows step &middot; Enter opens &middot; D groups duplicates &middot; Esc closes</div>
            <div class="vw-loading"><div class="vw-loading-text">Loading posters&hellip;</div><div class="vw-bar"><div></div></div></div>
            <div class="vw-idle"></div>
        </div>
    `);
    jQuery('body').append($root);
    if (WALL_NOTICE_SHOW) wallShowNotice(false);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const pageState = wallSuspendPage();
    requestAnimationFrame(() => $root.addClass('vw-open'));
    $root[0].focus();

    wall = {
        session, $root, prevOverflow, pageState,
        root:  $root[0],
        stage: $root.find('.vw-stage')[0],
        layer: $root.find('.vw-layer')[0],
        oi: 0, oj: 0,             // layer origin cell (cells are placed relative to it)
        relayout: false,          // cell size changed: reposition every live cell
        focusEl: null,
        items: [], N: 0, S: 1,
        cu: 0, cv: 0,             // camera centre, in cell units
        pw: 1, ph: 1, gap: 8,     // cell pitch / gap, in px
        vx: 0, vy: 0,             // inertia, in px per frame
        wheelX: 0, wheelY: 0,     // pending smooth-wheel distance, in px
        tween: null,              // { u, v } camera target for keyboard steps
        cells: new Map(), pool: [],
        focusI: 0, focusJ: 0, focusKey: '',
        mouseX: -1, mouseY: -1, mouseIn: false, overUi: false, keyboardMode: false,
        drag: null, suppressClick: false,
        dirty: true, raf: 0, ready: false, autoAspect: 2 / 3,
        stats: collected.stats, broken: 0, placeholder: 0, unavailable: 0, loading: candidates.length,
        all: candidates, dupGrouped: 0, picker: null,
        lastActive: Date.now(), idleTimer: 0, idleWarned: false,
    };
    WALL_ACTIVITY_EVENTS.forEach(t => window.addEventListener(t, wallActivity, true));
    wall.idleTimer = setInterval(wallIdleCheck, 1000);
    // Learn any example placeholder links not fingerprinted yet (bounded wait)
    const sigCountBefore = Object.keys(WALL_UNAVAIL_SIGS).length;
    wallLearnUnavail().then(() => {
        if (!wall || wall.session !== session || Object.keys(WALL_UNAVAIL_SIGS).length === sigCountBefore) return;
        wallRecheckUnavailable();
    });

    wallBindEvents();
    wallUpdateToolbar();

    if (!candidates.length) { wallLogStats(); wallShowEmpty('No torrents with images on this page.'); return; }

    // Load every image through the queue. Only real failures (broken link, tiny
    // placeholder, "unavailable" template) are dropped; slow images never are. The wall
    // opens once the first screen is ready (or after a short grace period) and the
    // rest fill in as they arrive.
    wallLoaderInit(candidates);
    const ld = wall.ld;
    let started = false;
    const $txt = $root.find('.vw-loading-text');
    const $bar = $root.find('.vw-bar > div');
    const S0 = wallRowShift(candidates.length);
    // Roughly the posters that fit on the first screen (cell shape isn't known yet: assume square)
    const rowsGuess = Math.ceil(window.innerHeight / (window.innerWidth / WALL_COLS_VISIBLE));
    const viewIdx = [];
    for (let j = 0; j <= rowsGuess; j++) for (let i = 0; i <= WALL_COLS_VISIBLE; i++) {
        viewIdx.push((((i + j * S0) % candidates.length) + candidates.length) % candidates.length);
    }
    viewIdx.forEach(k => ld.firstView.add(candidates[k].job));

    const startNow = () => {
        if (started || !wall || wall.session !== session) return;
        started = true;
        clearTimeout(graceTimer);
        $root.find('.vw-loading').remove();
        $root.find('.vw-notice').addClass('vw-notice-docked');
        if (!candidates.some(it => it.state !== 'failed')) { wallLogStats(); wallShowEmpty('None of the torrents on this page have a loadable image.'); return; }
        wallStart();
    };
    const graceTimer = setTimeout(startNow, WALL_LOAD_GRACE_MS);
    wall.onProgress = () => {
        if (started) return;
        const total = ld.jobs.size;
        $txt.text(`Loading posters… ${ld.settledJobs} / ${total}`);
        $bar.css('width', (ld.settledJobs / total * 100) + '%');
        let firstDone = true;
        ld.firstView.forEach(job => { if (!job.w && job.state !== 'failed') firstDone = false; });
        if (firstDone || ld.settledJobs === total) startNow();
    };
    wall.onProgress();
    wallPump();
}

function closePosterWall() {
    if (!wall) return;
    wallSession++;
    cancelAnimationFrame(wall.raf);
    clearInterval(wall.idleTimer);
    WALL_ACTIVITY_EVENTS.forEach(t => window.removeEventListener(t, wallActivity, true));
    jQuery(window).off('.vwall');
    document.removeEventListener('keydown', wallOnKey, true);
    wallRestorePage(wall.pageState);
    document.documentElement.style.overflow = wall.prevOverflow;
    clearTimeout(wall.rebuildTimer);
    clearTimeout(wall.liveTimer);
    if (wall.ld) wall.ld.jobs.forEach(job => { if (job.thumb) wallFreeThumb(job.thumb); job.thumb = null; });
    const $root = wall.$root;
    wall = null;
    $root.removeClass('vw-open');
    setTimeout(() => $root.remove(), 250);
}

// ── Notice: resource use, where images come from, auto-close ──
function wallSiteName() {
    const h = location.hostname;
    if (/happyfappy/i.test(h)) return 'HappyFappy';
    if (/emparadise/i.test(h)) return 'EMParadise';
    if (/empornium/i.test(h))  return 'Empornium';
    return 'this site';
}

function wallShowNotice(docked) {
    if (!wall && !jQuery('#vw-wall').length) return;
    const $root = wall ? wall.$root : jQuery('#vw-wall');
    $root.find('.vw-notice').remove();
    const site = wallSiteName();
    const idleText = WALL_IDLE_CLOSE_MIN > 0
        ? `To be safe it closes itself after ${WALL_IDLE_CLOSE_MIN} minutes without any mouse or keyboard activity (with a ${WALL_IDLE_WARN_S}-second warning first).`
        : 'Auto-close is turned off in Viewer Settings, so remember to close it yourself.';
    const $n = jQuery(`
        <div class="vw-notice" role="note">
            <div class="vw-notice-title">&#9432; Before you browse</div>
            <ul>
                <li><b>It can be heavy on your PC.</b> The wall shows many large images at once (animated ones especially), which can use a lot of memory and CPU on some computers. Close it when you're done and don't leave it open while idle. <span class="vw-notice-idle"></span></li>
                <li><b>Images come from image hosts, not from <span class="vw-notice-site"></span>.</b> Uploaders keep their posters on third-party image sites, so slow or missing posters are down to those hosts, not <span class="vw-notice-site"></span>.</li>
                <li><b>Big images take longer.</b> The slowest posters are usually animated WebP or GIF files, and in rare cases a very high-resolution picture.</li>
            </ul>
            <div class="vw-notice-actions">
                <label><input type="checkbox" class="vw-notice-never"> Don't show this again</label>
                <button class="vw-btn vw-notice-ok" type="button">Got it</button>
            </div>
        </div>`);
    $n.find('.vw-notice-site').text(site);
    $n.find('.vw-notice-idle').text(idleText);
    $n.find('.vw-notice-never').prop('checked', !WALL_NOTICE_SHOW);
    if (docked || (wall && wall.ready)) $n.addClass('vw-notice-docked');
    $n.find('.vw-notice-ok').on('click', function (e) {
        e.preventDefault();
        WALL_NOTICE_SHOW = !$n.find('.vw-notice-never').is(':checked');
        GM_setValue('WALL_NOTICE_SHOW', WALL_NOTICE_SHOW);
        jQuery('#vsm-WALL_NOTICE_SHOW').prop('checked', WALL_NOTICE_SHOW);
        $n.remove();
    });
    $root.append($n);
}

// ── Inactivity auto-close ──
function wallActivity() {
    if (!wall) return;
    wall.lastActive = Date.now();
    if (wall.idleWarned) {
        wall.idleWarned = false;
        wall.$root.find('.vw-idle').removeClass('vw-show');
    }
}

function wallIdleCheck() {
    if (!wall) return;
    if (!(WALL_IDLE_CLOSE_MIN > 0)) { wallActivity(); return; }
    const left = WALL_IDLE_CLOSE_MIN * 60000 - (Date.now() - wall.lastActive);
    if (left <= 0) {
        console.log(`${LOG_PREFIX} Poster Wall closed after ${WALL_IDLE_CLOSE_MIN} minutes of inactivity.`);
        closePosterWall();
        return;
    }
    if (left <= WALL_IDLE_WARN_S * 1000) {
        wall.idleWarned = true;
        wall.$root.find('.vw-idle')
            .text(`The Poster Wall will close in ${Math.ceil(left / 1000)}s because it has been idle. Move the mouse or press a key to keep it open.`)
            .addClass('vw-show');
    }
}

function wallShowEmpty(msg) {
    wall.$root.find('.vw-loading').remove();
    wall.$root.append(jQuery('<div class="vw-empty">').text(msg));
}

// Work out what's on the wall from every collected torrent: failed images out,
// and (when grouping) torrents sharing an image link folded into one poster.
function wallBuildDisplay() {
    const live = wall.all.filter(it => it.state !== 'failed');
    live.forEach(it => { it.group = null; });
    let display = live;
    if (WALL_GROUP_DUP_IMAGES) {
        const leaders = new Map();
        display = [];
        live.forEach(it => {
            const lead = leaders.get(it.absSrc);
            if (lead) { lead.group.push(it); return; }
            it.group = [it];
            leaders.set(it.absSrc, it);
            display.push(it);
        });
    } else {
        live.forEach(it => { it.group = [it]; });
    }
    wall.items = display;
    wall.N     = display.length;
    wall.S     = wallRowShift(display.length);
    wall.dupGrouped = live.length - display.length;
}

// Re-flow after the set of posters changed (late failure, marked unavailable, grouping toggled)
// Failures arrive one by one while loading; re-flow at most every 700 ms
function wallScheduleRebuild() {
    if (!wall || !wall.ready || wall.rebuildTimer) return;
    wall.rebuildTimer = setTimeout(() => { if (wall) { wall.rebuildTimer = 0; wallRebuild(); } }, 700);
}

function wallRebuild() {
    if (!wall || !wall.ready) return;
    clearTimeout(wall.rebuildTimer);
    wall.rebuildTimer = 0;
    const focusItem = wall.items[wallIndex(wall.focusI, wall.focusJ)];
    wallBuildDisplay();
    wallUpdateCount();
    if (!wall.N) { wall.ready = false; wallClosePicker(); wallShowEmpty('None of the torrents on this page have a loadable image.'); return; }
    // Every cell's item may have shifted: recycle them all so they rebind
    wall.cells.forEach(el => {
        el.style.display = 'none';
        el.dataset.idx = '';
        el.classList.remove('vw-focus');
        wall.pool.push(el);
    });
    wall.cells.clear();
    wall.focusEl = null;
    wall.focusKey = '';
    wall.ld.rangeKey = '';
    // Keep the focused poster where it was on screen (its neighbours may shift)
    const k = focusItem ? wall.items.indexOf(focusItem) : -1;
    if (k >= 0) {
        const n = wall.N, cur = wallIndex(wall.focusI, wall.focusJ);
        let d = (((k - cur) % n) + n) % n;
        if (d > n / 2) d -= n;
        wall.focusI += d;
        wall.cu += d;
    }
    wall.dirty = true;
    wallKick();
}

function wallStart() {
    wallBuildDisplay();
    const items = wall.items;

    // Auto cell shape: closest preset to the median ratio of the images loaded so far
    const ratios = items.filter(it => it.w && it.h).map(it => it.w / it.h).sort((a, b) => a - b);
    let best = 'portrait';
    if (ratios.length) {
        const median = ratios[Math.floor(ratios.length / 2)];
        Object.keys(WALL_ASPECTS).forEach(k => {
            if (Math.abs(Math.log(WALL_ASPECTS[k] / median)) < Math.abs(Math.log(WALL_ASPECTS[best] / median))) best = k;
        });
    }
    wall.autoAspect = WALL_ASPECTS[best];

    wallUpdateCount();
    if (!wall.loading) wallLogStats();

    wallLayout();
    // Start with item 0 near the top-left, with the wrapped neighbours peeking in at the edges
    wall.cu = window.innerWidth  / 2 / wall.pw - 0.35;
    wall.cv = window.innerHeight / 2 / wall.ph - 0.25;
    wall.focusI = 0; wall.focusJ = 0;
    wall.ready = true;
    wall.dirty = true;
    wallUpdateToolbar();
    wallKick();
}

function wallRowShift(n) {
    return Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * 1.6))));
}

function wallUpdateCount() {
    const parts = [wall.dupGrouped
        ? `${wall.N} posters (${wall.N + wall.dupGrouped} torrents, ${wall.dupGrouped} sharing an image)`
        : `${wall.N} torrents`];
    if (wall.loading)     parts.push(`${wall.loading} still loading`);
    if (wall.broken)      parts.push(`${wall.broken} broken image${wall.broken > 1 ? 's' : ''} skipped`);
    if (wall.placeholder) parts.push(`${wall.placeholder} placeholder${wall.placeholder > 1 ? 's' : ''} skipped`);
    const unav = wall.unavailable + wall.stats.blockedUrl;
    if (unav)             parts.push(`${unav} "unavailable" image${unav > 1 ? 's' : ''} skipped`);
    const noImg = wall.stats.noImage;
    if (noImg)            parts.push(`${noImg} without an image`);
    wall.$root.find('.vw-count').text(parts.join(' · ')).attr('title', parts.join('\n'));
}

function wallLogStats() {
    const st = wall.stats;
    // Count from the items themselves: a batched re-flow may still be pending
    const live = wall.all.filter(it => it.state !== 'failed');
    const shown = WALL_GROUP_DUP_IMAGES ? new Set(live.map(it => it.absSrc)).size : live.length;
    console.log(`${LOG_PREFIX} Poster Wall: ${st.rows} rows → ${shown} shown | ` +
        `blacklisted ${st.blacklisted}, no image ${st.noImage}, no title link ${st.noLink}, duplicates ${st.duplicate}, ` +
        `grouped under a shared image ${wall.dupGrouped}, blocked links ${st.blockedUrl}, ` +
        `broken ${wall.broken}, placeholder ${wall.placeholder}, unavailable ${wall.unavailable}, still loading ${wall.loading}`);
}

// ── Geometry ──
function wallAspect() {
    return WALL_ASPECT === 'auto' ? wall.autoAspect : (WALL_ASPECTS[WALL_ASPECT] || 2 / 3);
}

function wallLayout() {
    const W = window.innerWidth;
    wall.pw  = W / WALL_COLS_VISIBLE;
    wall.gap = Math.max(6, Math.round(wall.pw * 0.045));
    wall.ph  = (wall.pw - wall.gap) / wallAspect() + wall.gap;
    // Cell sizes changed: resize every live cell
    wall.cells.forEach(el => { wallSizeCell(el); wallDrawCell(el); });
    wall.pool.forEach(el => wallSizeCell(el));
    wall.relayout = true;
    wall.dirty = true;
    wallKick();
}

function wallSizeCell(el) {
    const p = el.firstChild;
    const half = wall.gap / 2;
    p.style.left   = half + 'px';
    p.style.top    = half + 'px';
    p.style.width  = (wall.pw - wall.gap) + 'px';
    p.style.height = (wall.ph - wall.gap) + 'px';
    const { cw, ch } = wallCellPx();
    const c = p.firstChild;
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
}

// Paint a poster's small copy into its canvas (Fill = crop to cover, Fit = letterbox)
function wallDrawCell(el, fade) {
    const item = wall.items[+el.dataset.idx];
    const c = el.firstChild.firstChild;
    const job = item && item.job;
    if (!job || !job.thumb) { c.style.transition = 'none'; c.classList.remove('vw-shown'); return; }
    const ctx = c.getContext('2d');
    const cw = c.width, ch = c.height, tw = job.tw, th = job.th;
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingQuality = 'high';
    if (WALL_FIT === 'contain') {
        const s = Math.min(cw / tw, ch / th), dw = tw * s, dh = th * s;
        ctx.drawImage(job.thumb, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    } else {
        const s = Math.max(cw / tw, ch / th), sw = cw / s, sh = ch / s;
        ctx.drawImage(job.thumb, (tw - sw) / 2, (th - sh) / 2, sw, sh, 0, 0, cw, ch);
    }
    c.style.transition = fade ? '' : 'none';
    c.classList.add('vw-shown');
    job.lastUse = performance.now();
    // Poster grew past its small copy (zoomed in): rebuild a sharper one from cache
    if (job.state === 'done' && Math.max(cw / tw, ch / th) > 1.35 && tw < job.w && th < job.h) {
        job.state = 'queued';
        job.reloadWhenNear = true;
        wallPump();
    }
}

function wallRedrawJob(job, fade) {
    wall.cells.forEach(el => {
        const item = wall.items[+el.dataset.idx];
        if (item && item.job === job) wallDrawCell(el, fade);
    });
    if (wall.focusEl && wall.items[+wall.focusEl.dataset.idx] && wall.items[+wall.focusEl.dataset.idx].job === job) wallScheduleLive();
}

// The highlighted poster shows the original image on top (sharp, and animated if it is)
function wallScheduleLive() {
    clearTimeout(wall.liveTimer);
    wall.liveTimer = setTimeout(wallUpdateLive, 160);
}

function wallUpdateLive() {
    if (!wall) return;
    const el = wall.focusEl;
    if (wall.liveEl && wall.liveEl !== el) wallClearLive(wall.liveEl);
    wall.liveEl = null;
    if (!el) return;
    const item = wall.items[+el.dataset.idx];
    if (!item || !item.job || !item.job.thumb) return;
    const live = el.firstChild.children[1];
    if (live.getAttribute('src') !== item.src) {
        live.classList.remove('vw-shown');
        live.onload = () => live.classList.add('vw-shown');
        live.src = item.src;
        if (live.complete && live.naturalWidth) live.classList.add('vw-shown');
    }
    wall.liveEl = el;
}

function wallClearLive(el) {
    const live = el.firstChild.children[1];
    live.onload = null;
    live.classList.remove('vw-shown');
    live.removeAttribute('src');
}

function wallIndex(i, j) {
    const n = wall.N;
    return (((i + j * wall.S) % n) + n) % n;
}

function wallMakeCell() {
    const a = document.createElement('a');
    a.className = 'vw-cell';
    a.target = '_blank';
    a.draggable = false;
    const p = document.createElement('div');
    p.className = 'vw-poster';
    const canvas = document.createElement('canvas');
    canvas.className = 'vw-canvas';
    p.appendChild(canvas);
    const live = document.createElement('img');
    live.className = 'vw-live';
    live.alt = '';
    live.draggable = false;
    live.decoding = 'async';
    p.appendChild(live);
    const badge = document.createElement('span');
    badge.className = 'vw-dup-badge';
    p.appendChild(badge);
    a.appendChild(p);
    wallSizeCell(a);
    return a;
}

// ── Render: place only the cells that intersect the viewport ──
// Cells sit at fixed positions inside one layer; moving the camera only changes
// that layer's transform (a single compositor update per frame). Cells are only
// touched when they scroll into view.
function wallPlaceCell(el, i, j) {
    el.style.transform = `translate(${((i - wall.oi) * wall.pw).toFixed(2)}px, ${((j - wall.oj) * wall.ph).toFixed(2)}px)`;
}

function wallRender() {
    const W = window.innerWidth, H = window.innerHeight;
    const pw = wall.pw, ph = wall.ph;
    const left = wall.cu * pw - W / 2;
    const top  = wall.cv * ph - H / 2;
    const i0 = Math.floor(left / pw) - 1, i1 = Math.floor((left + W) / pw) + 1;
    const j0 = Math.floor(top  / ph) - 1, j1 = Math.floor((top  + H) / ph) + 1;

    // Re-anchor the layer if we've travelled far, so pixel offsets stay small
    if (Math.abs(i0 - wall.oi) > 500 || Math.abs(j0 - wall.oj) > 500) {
        wall.oi = i0; wall.oj = j0; wall.relayout = true;
    }
    if (wall.relayout) {
        wall.relayout = false;
        wall.cells.forEach(el => wallPlaceCell(el, +el.dataset.i, +el.dataset.j));
    }

    const wanted = new Set();
    for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
            const key = i + ',' + j;
            wanted.add(key);
            if (wall.cells.has(key)) continue;
            const el   = wall.pool.pop() || wallMakeCell();
            const idx  = wallIndex(i, j);
            const item = wall.items[idx];
            if (el.dataset.idx !== String(idx)) {
                el.dataset.idx = idx;
                el.href = item.href;
                if (el === wall.liveEl) { wallClearLive(el); wall.liveEl = null; }
                el.classList.toggle('vw-fav', !!item.fav);
                const n = item.group ? item.group.length : 1;
                el.classList.toggle('vw-has-dups', n > 1);
                el.firstChild.children[2].textContent = n > 1 ? '×' + n : '';
                if (item.fav) el.style.setProperty('--vw-fav', FAVORITE_GLOW_COLOR || '#f5c518');
                wallDrawCell(el, false);
            }
            el.dataset.i = i;
            el.dataset.j = j;
            el.style.display = '';
            wallPlaceCell(el, i, j);
            if (!el.parentNode) wall.layer.appendChild(el);
            wall.cells.set(key, el);
        }
    }
    // Recycle cells that scrolled out of view
    wall.cells.forEach((el, key) => {
        if (wanted.has(key)) return;
        wall.cells.delete(key);
        el.style.display = 'none';
        if (el === wall.focusEl) { el.classList.remove('vw-focus'); wall.focusEl = null; }
        if (el === wall.liveEl) { wallClearLive(el); wall.liveEl = null; }
        wall.pool.push(el);
    });

    // Download priorities follow the view: posters actually visible first (nearest the
    // middle of the screen first), then about half a screen around them
    const vi0 = Math.floor(left / pw), vi1 = Math.floor((left + W - 1) / pw);
    const vj0 = Math.floor(top / ph),  vj1 = Math.floor((top + H - 1) / ph);
    const rangeKey = vi0 + ',' + vi1 + ',' + vj0 + ',' + vj1 + ',' + wall.N;
    if (rangeKey !== wall.ld.rangeKey) {
        wall.ld.rangeKey = rangeKey;
        const view = new Set(), near = new Set(), dist = new Map();
        const ci = Math.ceil((vi1 - vi0 + 1) / 2), cj = Math.ceil((vj1 - vj0 + 1) / 2);
        const mi = wall.cu - 0.5, mj = wall.cv - 0.5;   // cell at the middle of the screen
        for (let j = vj0 - cj; j <= vj1 + cj; j++) {
            for (let i = vi0 - ci; i <= vi1 + ci; i++) {
                const job = wall.items[wallIndex(i, j)].job;
                const d = Math.hypot(i - mi, j - mj);
                if (!dist.has(job) || d < dist.get(job)) dist.set(job, d);
                if (i >= vi0 && i <= vi1 && j >= vj0 && j <= vj1) view.add(job); else near.add(job);
            }
        }
        view.forEach(job => near.delete(job));
        wall.ld.viewJobs = view;
        wall.ld.nearJobs = near;
        wall.ld.dist = dist;
        wallPump();
    }

    wall.layer.style.transform = `translate3d(${(wall.oi * pw - left).toFixed(2)}px, ${(wall.oj * ph - top).toFixed(2)}px, 0)`;

    // Focus highlight — only touch the two cells that change
    const fKey = wall.focusI + ',' + wall.focusJ;
    const fEl  = wall.cells.get(fKey) || null;
    if (fEl !== wall.focusEl) {
        if (wall.focusEl) wall.focusEl.classList.remove('vw-focus');
        if (fEl) fEl.classList.add('vw-focus');
        wall.focusEl = fEl;
        wallScheduleLive();
    }
    if (fKey !== wall.focusKey) {
        wall.focusKey = fKey;
        wallUpdateInfo();
    }
}

function wallUpdateInfo() {
    const $info = wall.$root.find('.vw-info');
    if (!wall.ready) { $info.removeClass('vw-show'); return; }
    const item = wall.items[wallIndex(wall.focusI, wall.focusJ)];
    $info.find('.vw-info-title').text(item.title);
    const $meta = $info.find('.vw-info-meta').empty();
    const chip = (text, cls) => { if (text) $meta.append(jQuery('<span class="vw-chip">').addClass(cls || '').text(text)); };
    chip(item.cat);
    chip(item.size);
    chip(item.time);
    if (item.seeders)  chip('▲ ' + item.seeders,  'vw-seed');
    if (item.leechers) chip('▼ ' + item.leechers, 'vw-leech');
    if (item.fav)      chip('★ favorite tag');
    if (item.group && item.group.length > 1) chip(`⧉ ${item.group.length} torrents share this image — click to choose`, 'vw-dupchip');
    $info.addClass('vw-show');
}

// ── Animation loop: inertia, smooth wheel, keyboard tween, edge glide ──
// Runs only while something moves; input handlers restart it with wallKick().
function wallKick() {
    if (wall && wall.ready && !wall.raf) wall.raf = requestAnimationFrame(wallTick);
}

function wallTick() {
    if (!wall) return;
    wall.raf = 0;
    if (!wall.ready) return;

    let moved = false;

    if (!wall.drag) {
        // Inertia after a fling
        if (Math.abs(wall.vx) > 0.05 || Math.abs(wall.vy) > 0.05) {
            wall.cu -= wall.vx / wall.pw;
            wall.cv -= wall.vy / wall.ph;
            wall.vx *= 0.94;
            wall.vy *= 0.94;
            moved = true;
        } else { wall.vx = wall.vy = 0; }

        // Smooth wheel: consume a fraction of the pending distance each frame
        if (Math.abs(wall.wheelX) > 0.3 || Math.abs(wall.wheelY) > 0.3) {
            const sx = wall.wheelX * 0.22, sy = wall.wheelY * 0.22;
            wall.cu += sx / wall.pw;
            wall.cv += sy / wall.ph;
            wall.wheelX -= sx;
            wall.wheelY -= sy;
            moved = true;
        } else { wall.wheelX = wall.wheelY = 0; }

        // Keyboard step tween
        if (wall.tween) {
            const du = wall.tween.u - wall.cu, dv = wall.tween.v - wall.cv;
            if (Math.abs(du) < 0.002 && Math.abs(dv) < 0.002) {
                wall.cu = wall.tween.u; wall.cv = wall.tween.v; wall.tween = null;
            } else {
                wall.cu += du * 0.18; wall.cv += dv * 0.18;
            }
            moved = true;
        }

        // Edge glide
        if (WALL_EDGE_PAN && wall.mouseIn && !wall.overUi) {
            const W = window.innerWidth, H = window.innerHeight;
            const zx = W * 0.09, zy = H * 0.11;
            const ramp = (d, z) => (d < z ? (1 - d / z) : 0);
            const gx = ramp(wall.mouseX, zx) * -1 + ramp(W - wall.mouseX, zx);
            const gy = ramp(wall.mouseY, zy) * -1 + ramp(H - wall.mouseY, zy);
            if (gx || gy) {
                const speed = 14;   // px per frame at the very edge
                wall.cu += gx * Math.abs(gx) * speed / wall.pw;
                wall.cv += gy * Math.abs(gy) * speed / wall.ph;
                moved = true;
            }
        }
    }

    if (moved) {
        wall.dirty = true;
        // Hover focus follows the content moving under a still mouse
        if (!wall.drag && !wall.tween && wall.mouseIn && !wall.keyboardMode) wallFocusAtMouse();
    }
    if (wall.dirty) { wall.dirty = false; wallRender(); }
    if (moved) wallKick();   // keep going until everything settles
}

function wallCellAt(x, y) {
    const W = window.innerWidth, H = window.innerHeight;
    const wx = wall.cu * wall.pw - W / 2 + x;
    const wy = wall.cv * wall.ph - H / 2 + y;
    return { i: Math.floor(wx / wall.pw), j: Math.floor(wy / wall.ph) };
}

function wallFocusAtMouse() {
    if (wall.mouseY < 0) return;
    const c = wallCellAt(wall.mouseX, wall.mouseY);
    if (c.i !== wall.focusI || c.j !== wall.focusJ) {
        wall.focusI = c.i; wall.focusJ = c.j; wall.dirty = true;
    }
}

function wallZoom(dir, anchorX, anchorY) {
    const next = Math.max(WALL_MIN_COLS, Math.min(WALL_MAX_COLS, WALL_COLS_VISIBLE + (dir > 0 ? -1 : 1)));
    if (next === WALL_COLS_VISIBLE) return;
    // Keep the point under the anchor (mouse or centre) fixed while resizing
    const W = window.innerWidth, H = window.innerHeight;
    const ax = anchorX == null ? W / 2 : anchorX, ay = anchorY == null ? H / 2 : anchorY;
    const au = wall.cu + (ax - W / 2) / wall.pw;
    const av = wall.cv + (ay - H / 2) / wall.ph;
    WALL_COLS_VISIBLE = next;
    GM_setValue('WALL_COLS_VISIBLE', next);
    wallLayout();
    wall.cu = au - (ax - W / 2) / wall.pw;
    wall.cv = av - (ay - H / 2) / wall.ph;
    wall.tween = null; wall.wheelX = wall.wheelY = 0;
}

function wallStepFocus(di, dj) {
    wall.focusI += di;
    wall.focusJ += dj;
    wall.keyboardMode = true;
    wall.vx = wall.vy = 0;
    wall.wheelX = wall.wheelY = 0;
    // Glide so the focused poster sits in the middle of the screen
    wall.tween = { u: wall.focusI + 0.5, v: wall.focusJ + 0.5 };
    wall.dirty = true;
}

function wallUpdateToolbar() {
    const $r = wall.$root;
    const autoKey = Object.keys(WALL_ASPECTS).find(k => WALL_ASPECTS[k] === wall.autoAspect) || 'portrait';
    const label = WALL_ASPECT === 'auto' && wall.ready
        ? `Shape: Auto (${WALL_ASPECT_LABELS[autoKey]})`
        : `Shape: ${WALL_ASPECT_LABELS[WALL_ASPECT] || 'Auto'}`;
    $r.find('[data-act="aspect"]').text(label);
    $r.find('[data-act="fit"]').text(WALL_FIT === 'cover' ? 'Fill' : 'Fit');
    $r.find('[data-act="edge"]').toggleClass('vw-on', !!WALL_EDGE_PAN);
    $r.find('[data-act="dups"]').text(WALL_GROUP_DUP_IMAGES ? 'Duplicates: Grouped' : 'Duplicates: Separate')
        .toggleClass('vw-on', !!WALL_GROUP_DUP_IMAGES);
    $r.toggleClass('vw-fit-contain', WALL_FIT === 'contain');
}

function wallCycleAspect() {
    const k = WALL_ASPECT_ORDER[(WALL_ASPECT_ORDER.indexOf(WALL_ASPECT) + 1) % WALL_ASPECT_ORDER.length];
    WALL_ASPECT = k;
    GM_setValue('WALL_ASPECT', k);
    if (wall.ready) {
        const v = wall.cv;   // keep the same rows in view
        wallLayout();
        wall.cv = v;
    }
    wallUpdateToolbar();
}

function wallToggleFit() {
    WALL_FIT = WALL_FIT === 'cover' ? 'contain' : 'cover';
    GM_setValue('WALL_FIT', WALL_FIT);
    wallUpdateToolbar();
    if (wall && wall.ready) wall.cells.forEach(el => wallDrawCell(el, false));
}

function wallToast(msg) {
    if (!wall) return;
    let $t = wall.$root.find('.vw-toast');
    if (!$t.length) $t = jQuery('<div class="vw-toast">').appendTo(wall.$root);
    $t.text(msg).addClass('vw-show');
    clearTimeout(wallToast.t);
    wallToast.t = setTimeout(() => $t.removeClass('vw-show'), 4500);
}

function wallMarkUnavailable() {
    if (!wall || !wall.ready) return;
    const item = wall.items[wallIndex(wall.focusI, wall.focusJ)];
    if (!item) return;
    if (!confirm(`Mark this image as an "image unavailable" placeholder?\n\n${item.title}\n${item.src}\n\n` +
                 `It, and any other poster showing the same placeholder, will be left out of the wall. ` +
                 `You can undo this in Viewer Settings.`)) return;
    const session = wall.session;
    const w = item.w, h = item.h;
    wall.all.forEach(it => {
        if (it.absSrc === item.absSrc && it.state !== 'failed') { it.state = 'failed'; wall.unavailable++; }
    });
    wallRebuild();
    wallToast('Learning this placeholder…');
    wallAddUnavailUrl(item.src).then(sig => {
        if (!wall || wall.session !== session) return;
        if (!sig || (w && h && (sig.w !== w || sig.h !== h))) {
            wallToast('Blocked this exact link. Could not fingerprint the image, so look-alikes are not detected.');
            return;
        }
        const same = wall.all.filter(it => it.state === 'ok' && it.w === w && it.h === h);
        Promise.all(same.map(it => wallLooksUnavailable(it.src, it.w, it.h).then(un => un && it))).then(hits => {
            if (!wall || wall.session !== session) return;
            const found = hits.filter(Boolean);
            found.forEach(it => { if (it.state !== 'failed') { it.state = 'failed'; wall.unavailable++; } });
            if (found.length) wallRebuild();
            const n = found.length;
            wallToast(n ? `Placeholder learned — ${n} more matching poster${n > 1 ? 's' : ''} removed.` : 'Placeholder learned.');
        });
    });
}

function wallToggleGroupDups() {
    WALL_GROUP_DUP_IMAGES = !WALL_GROUP_DUP_IMAGES;
    GM_setValue('WALL_GROUP_DUP_IMAGES', WALL_GROUP_DUP_IMAGES);
    jQuery('#vsm-WALL_GROUP_DUP_IMAGES').prop('checked', WALL_GROUP_DUP_IMAGES);
    wallUpdateToolbar();
    wallRebuild();
}

function wallResolution(title) {
    const m = (title || '').match(/\b(4320p|2160p|1440p|1080p|1080i|720p|576p|540p|480p|360p|8k|4k|uhd)\b/i);
    if (!m) return '';
    const r = m[1].toLowerCase();
    return r === 'uhd' ? '4K' : (/k$/.test(r) ? r.toUpperCase() : r);
}

// Popup listing every torrent that uses this poster's image
function wallOpenPicker(item) {
    if (!wall || !item || !item.group || item.group.length < 2) return;
    wallClosePicker();
    const $back = jQuery(`
        <div class="vw-picker-back">
            <div class="vw-picker" role="dialog">
                <div class="vw-picker-head">
                    <img class="vw-picker-img" alt="">
                    <div class="vw-picker-heading">
                        <div class="vw-picker-title"></div>
                        <div class="vw-picker-sub">Choose the torrent to open &middot; &uarr;&darr; to move &middot; Enter opens &middot; Esc closes</div>
                    </div>
                    <button class="vw-btn vw-close" type="button" title="Close (Esc)">&times;</button>
                </div>
                <div class="vw-picker-list"></div>
            </div>
        </div>`);
    $back.find('.vw-picker-img').attr('src', item.src);
    $back.find('.vw-picker-title').text(`${item.group.length} torrents share this image`);
    const $list = $back.find('.vw-picker-list');
    item.group.forEach((it, k) => {
        const $row = jQuery('<a class="vw-pick-row" target="_blank" rel="noopener">').attr('href', it.href).attr('data-k', k);
        jQuery('<div class="vw-pick-title">').text(it.title).appendTo($row);
        const $meta = jQuery('<div class="vw-pick-meta">').appendTo($row);
        const chip = (text, cls) => { if (text) jQuery('<span class="vw-chip">').addClass(cls || '').text(text).appendTo($meta); };
        chip(wallResolution(it.title), 'vw-res');
        chip(it.size);
        chip(it.cat);
        chip(it.time);
        if (it.seeders)  chip('▲ ' + it.seeders,  'vw-seed');
        if (it.leechers) chip('▼ ' + it.leechers, 'vw-leech');
        $list.append($row);
    });
    $back.on('click', function (e) { if (e.target === this) wallClosePicker(); });
    $back.find('.vw-close').on('click', function (e) { e.preventDefault(); wallClosePicker(); });
    $back.on('mouseenter', '.vw-pick-row', function () { wallPickerSelect(+this.getAttribute('data-k')); });
    // A plain click opens the torrent (new tab) and closes the picker; middle-click keeps it open
    $back.on('click', '.vw-pick-row', function () { setTimeout(wallClosePicker, 0); });
    wall.$root.append($back);
    wall.picker = { $back, sel: 0, n: item.group.length };
    wallPickerSelect(0);
    requestAnimationFrame(() => $back.addClass('vw-show'));
}

function wallPickerSelect(k) {
    const pk = wall && wall.picker;
    if (!pk) return;
    pk.sel = (k + pk.n) % pk.n;
    const $rows = pk.$back.find('.vw-pick-row').removeClass('vw-sel');
    const row = $rows.eq(pk.sel).addClass('vw-sel')[0];
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
}

function wallClosePicker() {
    if (!wall || !wall.picker) return;
    wall.picker.$back.remove();
    wall.picker = null;
}

function wallOpenFocused() {
    const item = wall.items[wallIndex(wall.focusI, wall.focusJ)];
    if (!item) return;
    if (item.group && item.group.length > 1) wallOpenPicker(item);
    else window.open(item.href, '_blank');
}

function wallToggleEdge() {
    WALL_EDGE_PAN = !WALL_EDGE_PAN;
    GM_setValue('WALL_EDGE_PAN', WALL_EDGE_PAN);
    wallUpdateToolbar();
}

// ── Input ──
function wallOnKey(e) {
    if (!wall) return;
    // Keep keys from reaching the page underneath
    e.stopPropagation();
    const k = e.key;
    if (wall.picker) {   // picker open: its own keys only
        const pk = wall.picker;
        if (k === 'Escape')         { e.preventDefault(); wallClosePicker(); }
        else if (k === 'ArrowDown') { e.preventDefault(); wallPickerSelect(pk.sel + 1); }
        else if (k === 'ArrowUp')   { e.preventDefault(); wallPickerSelect(pk.sel - 1); }
        else if (k === 'Enter') {
            e.preventDefault();
            const row = pk.$back.find('.vw-pick-row')[pk.sel];
            if (row) window.open(row.getAttribute('href'), '_blank');
            wallClosePicker();
        }
        return;
    }
    if (k === 'Escape') { e.preventDefault(); closePosterWall(); return; }
    if (!wall.ready) return;
    if      (k === 'ArrowLeft')  { e.preventDefault(); wallStepFocus(-1, 0); }
    else if (k === 'ArrowRight') { e.preventDefault(); wallStepFocus(1, 0); }
    else if (k === 'ArrowUp')    { e.preventDefault(); wallStepFocus(0, -1); }
    else if (k === 'ArrowDown')  { e.preventDefault(); wallStepFocus(0, 1); }
    else if (k === 'PageDown')   { e.preventDefault(); wall.wheelY += window.innerHeight * 0.8; }
    else if (k === 'PageUp')     { e.preventDefault(); wall.wheelY -= window.innerHeight * 0.8; }
    else if (k === 'Enter') { e.preventDefault(); wallOpenFocused(); }
    else if (k === '+' || k === '=') { e.preventDefault(); wallZoom(1); }
    else if (k === '-' || k === '_') { e.preventDefault(); wallZoom(-1); }
    else if (k === 'a' || k === 'A') { wallCycleAspect(); }
    else if (k === 'f' || k === 'F') { wallToggleFit(); }
    else if (k === 'e' || k === 'E') { wallToggleEdge(); }
    else if (k === 'u' || k === 'U') { wallMarkUnavailable(); }
    else if (k === 'd' || k === 'D') { wallToggleGroupDups(); }
    wallKick();
}

function wallBindEvents() {
    const $r = wall.$root;
    const stage = wall.stage;

    document.addEventListener('keydown', wallOnKey, true);

    $r.on('click', '.vw-btn', function (e) {
        e.preventDefault();
        const act = this.getAttribute('data-act');
        if      (act === 'close')    closePosterWall();
        else if (act === 'notice')   wallShowNotice(true);
        else if (!wall.ready && act !== 'fit' && act !== 'edge' && act !== 'aspect') return;
        else if (act === 'zoom-in')  wallZoom(1);
        else if (act === 'zoom-out') wallZoom(-1);
        else if (act === 'aspect')   wallCycleAspect();
        else if (act === 'fit')      wallToggleFit();
        else if (act === 'edge')     wallToggleEdge();
        else if (act === 'dups')     wallToggleGroupDups();
    });

    // Wheel: smooth glide; Shift = sideways; Ctrl = resize
    $r[0].addEventListener('wheel', function (e) {
        if (wall && wall.picker) {   // let the picker list scroll natively, nothing else
            if (!(e.target.closest && e.target.closest('.vw-picker-list'))) e.preventDefault();
            return;
        }
        e.preventDefault();
        if (!wall || !wall.ready) return;
        if (e.ctrlKey) { wallZoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY); return; }
        const unit = e.deltaMode === 1 ? 40 : (e.deltaMode === 2 ? window.innerHeight : 1);
        let dx = e.deltaX * unit, dy = e.deltaY * unit;
        if (e.shiftKey && !dx) { dx = dy; dy = 0; }
        wall.vx = wall.vy = 0;
        wall.tween = null;
        wall.wheelX += dx;
        wall.wheelY += dy;
        wallKick();
    }, { passive: false });

    // Drag to pan (window-level move/up so links still receive their click)
    stage.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || !wall.ready) return;
        const wasMoving = Math.abs(wall.vx) > 1 || Math.abs(wall.vy) > 1 || wall.tween;
        wall.vx = wall.vy = 0;
        wall.wheelX = wall.wheelY = 0;
        wall.tween = null;
        wall.suppressClick = !!wasMoving;   // a tap that stops a fling shouldn't open anything
        wall.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, samples: [] };
    });

    jQuery(window).on('pointermove.vwall', function (ev) {
        const e = ev.originalEvent;
        if (e.clientX !== wall.mouseX || e.clientY !== wall.mouseY) wall.keyboardMode = false;
        wall.mouseX = e.clientX; wall.mouseY = e.clientY; wall.mouseIn = true;
        wall.overUi = !!(e.target && e.target.closest && e.target.closest('.vw-topbar, .vw-picker-back'));
        if (!wall.ready) return;
        const d = wall.drag;
        if (!d) { if (!wall.keyboardMode && !wall.overUi) wallFocusAtMouse(); wallKick(); return; }
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) {
            d.moved = true;
            wall.$root.addClass('vw-dragging');
        }
        if (d.moved) {
            wall.cu -= dx / wall.pw;
            wall.cv -= dy / wall.ph;
            wall.dirty = true;
            wallKick();
        }
        const now = performance.now();
        d.samples.push({ dx, dy, dt: Math.max(1, now - d.t) });
        if (d.samples.length > 5) d.samples.shift();
        d.x = e.clientX; d.y = e.clientY; d.t = now;
    });

    jQuery(window).on('pointerup.vwall pointercancel.vwall', function () {
        const d = wall && wall.drag;
        if (!d) return;
        wall.drag = null;
        wall.$root.removeClass('vw-dragging');
        if (d.moved) {
            wall.suppressClick = true;
            // Fling velocity from the last few samples, scaled to px per 16ms frame
            let sx = 0, sy = 0, st = 0;
            d.samples.forEach(s => { sx += s.dx; sy += s.dy; st += s.dt; });
            if (st > 0 && performance.now() - d.t < 80) {
                wall.vx = Math.max(-80, Math.min(80, sx / st * 16));
                wall.vy = Math.max(-80, Math.min(80, sy / st * 16));
            }
            wallKick();
        }
    });

    // Block the link click that ends a drag (capture phase, before the <a> acts)
    stage.addEventListener('click', function (e) {
        if (!wall) return;
        if (wall.suppressClick) {
            e.preventDefault();
            e.stopPropagation();
            wall.suppressClick = false;
            return;
        }
        const cell = e.target.closest && e.target.closest('.vw-cell');
        const item = cell && wall.items[+cell.dataset.idx];
        if (item && item.group && item.group.length > 1) {
            e.preventDefault();
            e.stopPropagation();
            wallOpenPicker(item);
        }
    }, true);
    stage.addEventListener('dragstart', e => e.preventDefault());

    $r.on('mouseleave', function () { if (wall) wall.mouseIn = false; });
    jQuery(window).on('blur.vwall', function () { if (wall) { wall.mouseIn = false; wall.drag = null; wall.$root.removeClass('vw-dragging'); } });
    jQuery(window).on('resize.vwall', function () { if (wall && wall.ready) wallLayout(); });
}
