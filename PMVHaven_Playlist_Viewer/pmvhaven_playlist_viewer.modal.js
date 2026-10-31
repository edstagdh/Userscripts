// ==UserScript Module==
// @name         [PMVHaven] Playlist Viewer — popup
// Version       1.0
// Part of pmvhaven_playlist_viewer.user.js (loaded via @require, shares its scope).
// Top-level code only declares things; main-script helpers are used inside functions only.

/* The popup: header (playlist info), toolbar (search / sort / view / page size / scale),
   loading bar (stop / resume), body (grid or table of the current page), pager, settings panel.
   Videos stream in batch by batch (see pvxLoadPlaylist); search, sort and paging always work
   on everything loaded so far, so 10k+ playlists stay usable while they load. */

let PV = null;   // state of the open popup (null when closed)

const PVX_PAGE_SIZES = [24, 48, 96, 200, 500];
const PVX_SORTS = [
    ['index', 'Playlist order'], ['title', 'Title'], ['uploader', 'Uploader'], ['duration', 'Length'],
    ['views', 'Views'], ['likes', 'Likes'], ['rating', 'Score'], ['date', 'Upload date'],
];
// Default direction when a sort is picked: numbers/dates high→low, text A→Z.
const PVX_SORT_DEFAULT_DIR = { index: 1, title: 1, uploader: 1, duration: -1, views: -1, likes: -1, rating: -1, date: -1 };
const PVX_FIELDS = { tag: 'tag', tags: 'tag', star: 'star', stars: 'star', by: 'by', uploader: 'by', music: 'music', creator: 'creator', title: 'title' };

/* ───────────────────────── Open / close ───────────────────────── */

function pvxOpen(pid, hint) {
    pvxClose();
    const els = {};
    const root = h('div', { id: 'pvx-root', class: 'pvx-overlay', role: 'dialog', 'aria-modal': 'true' });
    root.addEventListener('mousedown', e => { if (e.target === root) pvxClose(); });

    els.thumb = h('div', { class: 'pvx-hthumb' });
    els.title = h('h2', { class: 'pvx-htitle' });
    els.owner = h('div', { class: 'pvx-howner' });
    els.meta = h('div', { class: 'pvx-hmeta' });
    els.desc = h('div', { class: 'pvx-hdesc' });
    els.top = h('div', { class: 'pvx-htop' });
    const head = h('div', { class: 'pvx-head' },
        els.thumb,
        h('div', { class: 'pvx-hinfo' }, els.title, els.owner, els.meta, els.desc, els.top),
        h('div', { class: 'pvx-hbtns' },
            h('a', { class: 'pvx-ibtn', href: pvxPlaylistPageUrl(pid), target: '_blank', rel: 'noopener', title: 'Open the playlist page', html: PVX_SVG.list }),
            els.reload = h('button', { type: 'button', class: 'pvx-ibtn', title: 'Reload from the server', html: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16m0 5v-5h5"/></svg>', onclick: () => pvxStartLoad(true) }),
            els.gear = h('button', { type: 'button', class: 'pvx-ibtn', title: 'Settings', html: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>', onclick: () => pvxToggleSettings() }),
            h('button', { type: 'button', class: 'pvx-ibtn pvx-close', title: 'Close (Esc)', html: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>', onclick: () => pvxClose() }),
        ));

    // Toolbar
    els.search = h('input', { type: 'search', class: 'pvx-search', placeholder: 'Search title, uploader, tags, stars, music…  ( / )', spellcheck: false, autocomplete: 'off' });
    els.search.addEventListener('input', () => { clearTimeout(PV._st); PV._st = setTimeout(() => pvxSetQuery(els.search.value), 160); });
    els.count = h('div', { class: 'pvx-count' });
    els.sort = h('select', { class: 'pvx-select', title: 'Sort by' }, PVX_SORTS.map(([k, l]) => h('option', { value: k }, l)));
    els.sort.addEventListener('change', () => pvxSetSort(els.sort.value));
    els.dir = h('button', { type: 'button', class: 'pvx-btn pvx-dir', title: 'Reverse order', onclick: () => pvxSetSort(S.sort, -S.sortDir) });
    els.viewGrid = h('button', { type: 'button', class: 'pvx-seg', title: 'Grid view', html: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>', onclick: () => pvxSetView('grid') });
    els.viewTable = h('button', { type: 'button', class: 'pvx-seg', title: 'Table view', html: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 5h18M3 10h18M3 15h18M3 20h18"/></svg>', onclick: () => pvxSetView('table') });
    els.size = h('select', { class: 'pvx-select', title: 'Videos per page' }, PVX_PAGE_SIZES.map(n => h('option', { value: n }, n + ' / page')));
    els.size.addEventListener('change', () => { pvxSet('pageSize', +els.size.value); PV.page = 1; pvxRenderBody(true); });
    els.scale = h('input', { type: 'range', class: 'pvx-range', min: 70, max: 200, step: 5, title: 'Text size' });
    els.scaleVal = h('span', { class: 'pvx-scaleval' });
    els.scale.addEventListener('input', () => pvxSetScale(+els.scale.value));
    const toolbar = h('div', { class: 'pvx-toolbar' },
        h('div', { class: 'pvx-searchwrap' },
            h('span', { class: 'pvx-searchicon', html: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>' }),
            els.search,
            h('span', { class: 'pvx-help', tabIndex: 0, html: '?',
                title: 'All words must match (title, uploader, tags, stars, creators, music, description).\n' +
                    '"two words"  exact phrase\n-word  exclude\n' +
                    'tag:x  star:x  by:uploader  music:x  creator:x  title:x  field filters\n' +
                    'Click a tag, star or uploader to filter by it.' })),
        els.count,
        h('div', { class: 'pvx-tgroup' }, els.sort, els.dir),
        h('div', { class: 'pvx-tgroup pvx-segs' }, els.viewGrid, els.viewTable),
        els.size,
        h('div', { class: 'pvx-tgroup pvx-scale' },
            h('button', { type: 'button', class: 'pvx-btn pvx-a', title: 'Smaller text', onclick: () => pvxSetScale(S.scale - 10) }, 'A−'),
            els.scale,
            h('button', { type: 'button', class: 'pvx-btn pvx-a', title: 'Larger text', onclick: () => pvxSetScale(S.scale + 10) }, 'A+'),
            els.scaleVal));

    // Loading bar
    els.barFill = h('div', { class: 'pvx-barfill' });
    els.barText = h('span', { class: 'pvx-bartext' });
    els.barBtn = h('button', { type: 'button', class: 'pvx-btn pvx-barbtn' });
    els.loadbar = h('div', { class: 'pvx-loadbar' }, h('div', { class: 'pvx-bar' }, els.barFill), els.barText, els.barBtn);

    els.body = h('div', { class: 'pvx-body', tabIndex: -1 });
    els.pager = h('div', { class: 'pvx-pager' });
    els.pager.addEventListener('click', pvxOnPagerClick);
    els.settings = h('div', { class: 'pvx-settings', hidden: true });

    const modal = h('div', { class: 'pvx-modal' }, head, toolbar, els.loadbar, els.body, els.pager, els.settings);
    root.append(modal);
    modal.addEventListener('click', pvxOnBodyClick);   // tag / star / uploader filters + table sort, anywhere in the popup
    // Keys typed inside the popup run their own handlers first, then stop here so the site's shortcuts don't fire.
    root.addEventListener('keydown', e => e.stopPropagation());
    els.root = root;
    els.modal = modal;

    PV = { pid, hint: hint || {}, els, job: null, page: 1, qText: '', query: { terms: [], marks: [] },
        list: [], listVersion: -1, renderSig: '', loading: false, error: null, _rt: 0, _st: 0 };

    els.sort.value = S.sort;
    els.size.value = PVX_PAGE_SIZES.includes(+S.pageSize) ? S.pageSize : 48;
    pvxApplyScale();
    pvxSyncControls();
    pvxRenderHeader();
    pvxRenderBody(true);

    document.body.append(root);
    document.documentElement.classList.add('pvx-lock');
    document.addEventListener('keydown', pvxOnKey, true);
    setTimeout(() => els.search.focus(), 30);

    pvxStartLoad(false);
}

function pvxClose() {
    if (!PV) return;
    pvxStopLoad(PV.pid);
    clearTimeout(PV._rt);
    clearTimeout(PV._st);
    PV.els.root.remove();
    PV = null;
    document.documentElement.classList.remove('pvx-lock');
    document.removeEventListener('keydown', pvxOnKey, true);
}

/* ───────────────────────── Loading ───────────────────────── */

async function pvxStartLoad(force) {
    if (!PV) return;
    const pid = PV.pid;
    PV.loading = true;
    PV.error = null;
    pvxRenderLoadbar();
    try {
        const job = await pvxLoadPlaylist(pid, { force, onUpdate: j => { if (PV && PV.pid === pid) { PV.job = j; pvxScheduleRender(); } } });
        if (!PV || PV.pid !== pid) return;
        PV.job = job;
    } catch (err) {
        if (!PV || PV.pid !== pid) return;
        console.error('[PVX]', err);
        PV.error = err.message || String(err);
    }
    if (!PV || PV.pid !== pid) return;
    PV.loading = false;
    pvxRenderAll();
}

function pvxStopClicked() {
    if (!PV) return;
    pvxStopLoad(PV.pid);   // the running batch finishes, then the loop exits and pvxStartLoad re-renders
    PV.els.barBtn.disabled = true;
    PV.els.barText.textContent = 'Stopping…';
}

/** Renders at most every 350 ms while batches stream in. */
function pvxScheduleRender() {
    if (!PV || PV._rt) return;
    PV._rt = setTimeout(() => { if (!PV) return; PV._rt = 0; pvxRenderAll(); }, 350);
}

function pvxRenderAll() {
    if (!PV) return;
    pvxRenderHeader();
    pvxRenderLoadbar();
    pvxRenderBody(false);
}

function pvxRenderLoadbar() {
    const { els, job } = PV;
    const total = job ? job.total : 0;
    const done = job ? total - job.queue.length : 0;
    els.barBtn.disabled = false;
    if (PV.error) {
        els.loadbar.className = 'pvx-loadbar is-error';
        els.barFill.style.width = '100%';
        els.barText.textContent = 'Could not load: ' + PV.error;
        els.barBtn.textContent = 'Retry';
        els.barBtn.onclick = () => pvxStartLoad(!PV.job);
        return;
    }
    if (!job) {
        els.loadbar.className = 'pvx-loadbar is-busy';
        els.barFill.style.width = '0%';
        els.barText.textContent = 'Loading playlist…';
        els.barBtn.textContent = '';
        els.barBtn.hidden = true;
        return;
    }
    els.barBtn.hidden = false;
    if (job.done) {
        els.loadbar.className = 'pvx-loadbar is-done';
        return;
    }
    const pct = total ? Math.round(done / total * 100) : 0;
    els.barFill.style.width = pct + '%';
    if (PV.loading) {
        els.loadbar.className = 'pvx-loadbar is-busy';
        els.barText.textContent = `Loading video details… ${done.toLocaleString()} / ${total.toLocaleString()} (${pct}%) — search and sort already work on what's loaded`;
        els.barBtn.textContent = 'Stop';
        els.barBtn.onclick = pvxStopClicked;
    } else {
        els.loadbar.className = 'pvx-loadbar is-paused';
        els.barText.textContent = `Stopped at ${done.toLocaleString()} / ${total.toLocaleString()} (${pct}%). Results only include loaded videos.`;
        els.barBtn.textContent = 'Resume';
        els.barBtn.onclick = () => pvxStartLoad(false);
    }
}

/* ───────────────────────── Header ───────────────────────── */

function pvxRenderHeader() {
    const { els, job, hint } = PV;
    const pl = job ? job.pl : null;
    const name = pl ? pl.name : hint.name || 'Playlist';
    const thumb = (pl && pl.thumb) || hint.thumb || '';
    if (els.thumb.dataset.src !== thumb) {
        els.thumb.dataset.src = thumb;
        els.thumb.replaceChildren(thumb ? h('img', { src: thumb, alt: '' }) : h('span', { class: 'pvx-noimg', html: PVX_SVG.film }));
    }
    els.title.textContent = name;
    els.title.title = name;

    const owner = pl ? pl.owner : hint.owner;
    els.owner.replaceChildren(owner ? h('span', null,
        pl && pl.ownerAvatar ? h('img', { class: 'pvx-ava', src: pl.ownerAvatar, alt: '' }) : h('span', { class: 'pvx-ava pvx-ava-txt' }, owner[0].toUpperCase()),
        h('span', null, 'by '), h('b', null, owner)) : '');

    els.meta.replaceChildren();
    els.desc.textContent = pl ? pl.description : '';
    els.desc.hidden = !(pl && pl.description);
    els.top.replaceChildren();
    if (!pl) return;

    const vids = job.videos;
    let totalSec = 0, loaded = 0, missing = 0;
    for (const v of vids) {
        if (v.pending) continue;
        loaded++;
        if (v.missing) missing++;
        totalSec += v.durSec || 0;
    }
    const chip = (label, value, title) => h('span', { class: 'pvx-mchip', title: title || '' }, h('span', { class: 'pvx-mlabel' }, label), h('b', null, value));
    els.meta.append(...[
        chip('Videos', vids.length.toLocaleString()),
        chip('Length', (job.done ? '' : '≥ ') + fmtTotal(totalSec), job.done ? 'Total length' : 'Total length of the videos loaded so far'),
        chip('Views', fmtNum(pl.views)),
        isFinite(pl.rating) ? chip('Score', Math.round(pl.rating) + '%', 'Quality score (Bayesian rating)') : null,
        pl.createdAt ? chip('Created', fmtDate(pl.createdAt), new Date(pl.createdAt).toLocaleString()) : null,
        pl.isPublic === false ? chip('Visibility', 'Private') : null,
        missing ? chip('Unavailable', missing.toLocaleString(), 'Videos that no longer exist or could not be found') : null,
    ].filter(Boolean));

    // Most common tags / uploaders among loaded videos (recomputed only when the data changed)
    if (PV._topVersion !== job.version || !PV._top) {
        PV._topVersion = job.version;
        const count = (get) => {
            const m = new Map();
            for (const v of vids) if (!v.pending) for (const x of get(v)) m.set(x, (m.get(x) || 0) + 1);
            return [...m].sort((a, b) => b[1] - a[1]);
        };
        PV._top = {
            tags: count(v => v.tags).slice(0, 12),
            stars: count(v => v.stars).slice(0, 6),
            by: count(v => v.uploader ? [v.uploader] : []).slice(0, 6),
        };
    }
    const t = PV._top;
    const row = (label, list, field, cls) => list.length ? h('div', { class: 'pvx-toprow' }, h('span', { class: 'pvx-mlabel' }, label),
        list.map(([name, n]) => h('button', { type: 'button', class: 'pvx-chip ' + (cls || ''), dataset: { pvxQ: pvxToken(field, name) }, title: `${n} video(s) — click to filter` }, name, h('small', null, ' ' + n.toLocaleString())))) : null;
    els.top.append(...[row('Top tags', t.tags, 'tag'), row('Stars', t.stars, 'star', 'pvx-chip-star'), row('Uploaders', t.by, 'by', 'pvx-chip-by')].filter(Boolean));
}

/* ───────────────────────── Search & sort ───────────────────────── */

/** "foo -bar "exact phrase" tag:x by:"some one"" → {terms:[{field,text,neg}], marks:[…]} */
function pvxParseQuery(q) {
    const terms = [];
    const re = /(-?)(?:([a-z]+):)?(?:"([^"]*)"?|(\S+))/gi;
    let m;
    while ((m = re.exec(q))) {
        if (!m[0]) { re.lastIndex++; continue; }
        let field = m[2] ? PVX_FIELDS[m[2].toLowerCase()] : null;
        let text = (m[3] ?? m[4] ?? '');
        if (m[2] && !field) text = m[2] + ':' + text;   // unknown prefix → plain text (e.g. "Re:Zero")
        text = text.toLowerCase().trim();
        if (!text || text === '-') continue;
        terms.push({ field, text, neg: !!m[1] });
    }
    const marks = terms.filter(t => !t.neg && (!t.field || t.field === 'title' || t.field === 'by' || t.field === 'music')).map(t => t.text);
    return { terms, marks };
}

function pvxMatches(v, terms) {
    for (const t of terms) {
        let hit;
        if (!t.field) hit = v.hay.includes(t.text);
        else {
            const f = v.f[t.field];
            hit = Array.isArray(f) ? f.some(x => x.includes(t.text)) : (f || '').includes(t.text);
        }
        if (hit === t.neg) return false;
    }
    return true;
}

const PVX_SORT_GET = {
    index: v => v.idx,
    title: v => v.f.title,
    uploader: v => v.f.by,
    duration: v => v.durSec || null,
    views: v => v.views ?? null,
    likes: v => v.likes ?? null,
    rating: v => (isFinite(v.rating) ? v.rating : null),
    date: v => { const t = Date.parse(v.uploadDate); return isNaN(t) ? null : t; },
};

/** Rebuilds PV.list (filtered + sorted) when the data, query or sort changed. */
function pvxRefreshList() {
    const job = PV.job;
    const sig = (job ? job.version + ':' + job.videos.length : 'none') + '|' + PV.qText + '|' + S.sort + S.sortDir;
    if (sig === PV.listSig) return;
    PV.listSig = sig;
    if (!job) { PV.list = []; return; }
    const terms = PV.query.terms;
    let list = terms.length ? job.videos.filter(v => !v.pending && pvxMatches(v, terms)) : job.videos.slice();
    const get = PVX_SORT_GET[S.sort] || PVX_SORT_GET.index;
    const dir = S.sortDir;
    if (S.sort !== 'index' || dir !== 1) {
        const coll = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
        list = list.map(v => [v, v.pending || v.missing ? null : get(v)]);
        list.sort((a, b) => {
            const x = a[1], y = b[1];
            if (x == null || y == null) return x == null && y == null ? a[0].idx - b[0].idx : (x == null ? 1 : -1);   // unknown always last
            const c = typeof x === 'string' ? coll.compare(x, y) : x - y;
            return c ? c * dir : a[0].idx - b[0].idx;
        }).forEach((p, i) => { list[i] = p[0]; });
    }
    PV.list = list;
}

function pvxSetQuery(text) {
    if (!PV) return;
    PV.qText = text.trim();
    PV.query = pvxParseQuery(PV.qText);
    PV.page = 1;
    if (PV.els.search.value !== text) PV.els.search.value = text;
    pvxRenderBody(true);
}

/** Adds a field token to the search, or removes it if it's already there. */
function pvxToggleToken(token) {
    const cur = PV.els.search.value;
    const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(^|\\s)' + esc + '(?=\\s|$)', 'i');
    const next = re.test(cur) ? cur.replace(re, ' ').replace(/\s+/g, ' ').trim() : (cur.trim() + ' ' + token).trim();
    pvxSetQuery(next);
}

function pvxSetSort(key, dir) {
    if (dir == null) dir = key === S.sort ? S.sortDir : (PVX_SORT_DEFAULT_DIR[key] || 1);
    pvxSet('sort', key);
    pvxSet('sortDir', dir);
    PV.page = 1;
    pvxSyncControls();
    pvxRenderBody(true);
}

function pvxSetView(view) {
    pvxSet('view', view);
    pvxSyncControls();
    pvxRenderBody(true);
}

function pvxSetScale(n) {
    n = Math.max(70, Math.min(200, Math.round(n / 5) * 5));
    pvxSet('scale', n);
    pvxApplyScale();
}

function pvxApplyScale() {
    PV.els.modal.style.setProperty('--pvx-scale', S.scale / 100);
    PV.els.scale.value = S.scale;
    PV.els.scaleVal.textContent = S.scale + '%';
}

function pvxSyncControls() {
    const { els } = PV;
    els.sort.value = S.sort;
    els.dir.textContent = S.sortDir > 0 ? '↑' : '↓';
    els.dir.title = S.sortDir > 0 ? 'Ascending — click to reverse' : 'Descending — click to reverse';
    els.viewGrid.classList.toggle('is-on', S.view !== 'table');
    els.viewTable.classList.toggle('is-on', S.view === 'table');
}

/* ───────────────────────── Body & pager ───────────────────────── */

function pvxPageSize() {
    return PVX_PAGE_SIZES.includes(+S.pageSize) ? +S.pageSize : 48;
}

/**
 * Renders the current page. With force=false (streaming updates) it only re-renders
 * when something visible changed, so scrolling isn't disturbed for nothing.
 */
function pvxRenderBody(force) {
    if (!PV) return;
    pvxRefreshList();
    const { els, list, job } = PV;
    const size = pvxPageSize();
    const pages = Math.max(1, Math.ceil(list.length / size));
    if (PV.page > pages) PV.page = pages;
    const start = (PV.page - 1) * size;
    const items = list.slice(start, start + size);

    // Count line
    const total = job ? job.videos.length : 0;
    const loaded = job ? job.videos.length - job.videos.filter(v => v.pending).length : 0;
    let count;
    if (!job) count = '';
    else if (PV.qText) count = `${list.length.toLocaleString()} match${list.length === 1 ? '' : 'es'}` + (job.done ? '' : ` in ${loaded.toLocaleString()} loaded`);
    else count = `${total.toLocaleString()} video${total === 1 ? '' : 's'}`;
    els.count.textContent = count;

    const sig = [S.view, PV.page, size, S.sort, S.sortDir, PV.qText, S.newTab, S.showTags, S.videoUrl, S.playlistVideoUrl,
        items.map(v => v.idx + (v.pending ? 'p' : v.missing ? 'm' : '')).join(',')].join('|');
    if (!force && sig === PV.renderSig) { pvxRenderPager(pages, list.length, start, items.length); return; }
    PV.renderSig = sig;

    const ctx = { pid: PV.pid, marks: PV.query.marks, sort: S.sort, sortDir: S.sortDir };
    let content;
    if (!job) content = h('div', { class: 'pvx-empty' }, PV.error ? 'Could not load this playlist.' : h('div', { class: 'pvx-spinner' }));
    else if (!total) content = h('div', { class: 'pvx-empty' }, 'This playlist has no videos.');
    else if (!items.length) content = h('div', { class: 'pvx-empty' }, PV.qText ? (job.done ? 'No videos match your search.' : 'No matches among the videos loaded so far…') : 'Nothing to show.');
    else content = S.view === 'table' ? pvxRenderTable(items, ctx) : pvxRenderGrid(items, ctx);

    const keepScroll = !force;
    const top = els.body.scrollTop;
    els.body.replaceChildren(content);
    els.body.classList.toggle('is-table', S.view === 'table');
    els.body.scrollTop = keepScroll ? top : 0;
    pvxRenderPager(pages, list.length, start, items.length);
}

function pvxRenderPager(pages, count, start, shown) {
    const { els } = PV;
    const p = PV.page;
    const btn = (label, page, opts = {}) => h('button', {
        type: 'button', class: 'pvx-pbtn' + (opts.on ? ' is-on' : ''), disabled: !!opts.disabled,
        dataset: { page }, title: opts.title || ('Page ' + page),
    }, label);
    const nums = [];
    const win = 2;
    let last = 0;
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || (i >= p - win && i <= p + win)) {
            if (last && i - last > 1) nums.push(h('span', { class: 'pvx-gap' }, '…'));
            nums.push(btn(i.toLocaleString(), i, { on: i === p }));
            last = i;
        }
    }
    const jump = h('input', { type: 'number', class: 'pvx-jump', min: 1, max: pages, placeholder: 'Page', title: 'Go to page (Enter)' });
    jump.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const n = parseInt(jump.value, 10);
        if (n >= 1) pvxGoPage(Math.min(n, pages));
    });
    els.pager.replaceChildren(
        h('div', { class: 'pvx-prange' }, count ? `${(start + 1).toLocaleString()}–${(start + shown).toLocaleString()} of ${count.toLocaleString()}` : ''),
        h('div', { class: 'pvx-pnums' },
            btn('«', 1, { disabled: p <= 1, title: 'First page' }),
            btn('‹', p - 1, { disabled: p <= 1, title: 'Previous page (←)' }),
            nums,
            btn('›', p + 1, { disabled: p >= pages, title: 'Next page (→)' }),
            btn('»', pages, { disabled: p >= pages, title: 'Last page' })),
        h('div', { class: 'pvx-pjump' }, pages > 7 ? jump : null, h('span', { class: 'pvx-ptotal' }, `${pages.toLocaleString()} page${pages === 1 ? '' : 's'}`)),
    );
}

function pvxGoPage(n) {
    if (!PV || n === PV.page || n < 1) return;
    PV.page = n;
    pvxRenderBody(true);
}

function pvxOnPagerClick(e) {
    const b = e.target.closest('.pvx-pbtn');
    if (b && !b.disabled) pvxGoPage(+b.dataset.page);
}

function pvxOnBodyClick(e) {
    const q = e.target.closest('[data-pvx-q]');
    if (q) { e.preventDefault(); pvxToggleToken(q.dataset.pvxQ); return; }
    const th = e.target.closest('th[data-pvx-sort]');
    if (th) {
        const key = th.dataset.pvxSort;
        pvxSetSort(key, key === S.sort ? -S.sortDir : null);
    }
}

/* ───────────────────────── Keyboard ───────────────────────── */

function pvxOnKey(e) {
    if (!PV) return;
    const inside = PV.els.root.contains(e.target);
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!PV.els.settings.hidden) pvxToggleSettings(false);
        else if (typing && e.target === PV.els.search && PV.els.search.value) pvxSetQuery('');
        else pvxClose();
        return;
    }
    // Keys aimed at the page behind the popup: keep the site's shortcuts from firing.
    // (Keys inside the popup must reach their target first — the root's keydown listener stops them afterwards.)
    if (!inside) e.stopPropagation();
    if (typing) return;
    const pages = Math.max(1, Math.ceil(PV.list.length / pvxPageSize()));
    if (e.key === '/') { e.preventDefault(); PV.els.search.focus(); PV.els.search.select(); }
    else if (e.key === 'ArrowRight' && PV.page < pages) { e.preventDefault(); pvxGoPage(PV.page + 1); }
    else if (e.key === 'ArrowLeft' && PV.page > 1) { e.preventDefault(); pvxGoPage(PV.page - 1); }
}

/* ───────────────────────── Settings panel ───────────────────────── */

function pvxToggleSettings(show) {
    const panel = PV.els.settings;
    show = show ?? panel.hidden;
    panel.hidden = !show;
    PV.els.gear.classList.toggle('is-on', show);
    if (show) pvxBuildSettings();
}

function pvxBuildSettings() {
    const panel = PV.els.settings;
    const check = (key, label) => {
        const box = h('input', { type: 'checkbox', checked: !!S[key] });
        box.addEventListener('change', () => { pvxSet(key, box.checked); pvxRenderBody(false); });
        return h('label', { class: 'pvx-srow pvx-scheck' }, box, h('span', null, label));
    };
    const tpl = (key, label) => {
        const inp = h('input', { type: 'text', class: 'pvx-input', value: S[key], spellcheck: false });
        inp.addEventListener('change', () => { pvxSet(key, inp.value.trim() || PVX_DEFAULTS[key]); inp.value = S[key]; pvxRenderBody(false); });
        return h('label', { class: 'pvx-srow' }, h('span', { class: 'pvx-slabel' }, label), inp);
    };
    const cache = h('input', { type: 'number', class: 'pvx-input pvx-input-s', min: 1, max: 1440, value: S.cacheMinutes });
    cache.addEventListener('change', () => pvxSet('cacheMinutes', Math.max(1, +cache.value || PVX_DEFAULTS.cacheMinutes)));
    panel.replaceChildren(
        h('div', { class: 'pvx-shead' }, h('b', null, 'Settings'),
            h('button', { type: 'button', class: 'pvx-ibtn', title: 'Close', html: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>', onclick: () => pvxToggleSettings(false) })),
        check('newTab', 'Open videos in a new tab'),
        check('showTags', 'Show tags on grid cards'),
        h('label', { class: 'pvx-srow' }, h('span', { class: 'pvx-slabel' }, 'Keep finished playlists in memory for (minutes)'), cache),
        h('div', { class: 'pvx-ssec' }, 'Video links'),
        tpl('videoUrl', '"Open" link (single video)'),
        tpl('playlistVideoUrl', '"In playlist" link'),
        h('div', { class: 'pvx-shelp' },
            'Placeholders: ', h('code', null, '{id}'), ' ', h('code', null, '{key}'), ' ', h('code', null, '{oldId}'), ' ', h('code', null, '{slug}'), ' ',
            h('code', null, '{pid}'), ' (playlist id) ', h('code', null, '{index}'), ' (0-based) ', h('code', null, '{index1}'), ' (1-based). ',
            'Relative links start at https://pmvhaven.com.'),
        h('div', { class: 'pvx-sbtns' },
            h('button', { type: 'button', class: 'pvx-btn', onclick: () => pvxShowChangelog(true) }, "What's New"),
            h('button', { type: 'button', class: 'pvx-btn', onclick: () => {
                if (!confirm('Reset all Playlist Viewer settings?')) return;
                pvxResetSettings(); pvxApplyScale(); pvxSyncControls(); PV.els.size.value = S.pageSize; pvxBuildSettings(); pvxRenderBody(true);
            } }, 'Reset to defaults')),
        h('div', { class: 'pvx-sver' }, 'Playlist Viewer v' + SCRIPT_VERSION),
    );
}
