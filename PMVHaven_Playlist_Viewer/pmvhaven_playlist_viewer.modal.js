// ==UserScript Module==
// @name         [PMVHaven] Playlist Viewer — popup
// Version       1.3
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

/** opts.focusIdx: open on the page of that playlist position and highlight it (from the playlist player). */
function pvxOpen(pid, hint, opts = {}) {
    pvxClose();
    const els = {};
    const root = h('div', { id: 'pvx-root', class: 'pvx-overlay', role: 'dialog', 'aria-modal': 'true' });
    root.addEventListener('mousedown', e => { if (e.target === root) pvxClose(); });

    els.thumb = h('div', { class: 'pvx-hthumb' });
    els.title = h('h2', { class: 'pvx-htitle' });
    els.owner = h('span', { class: 'pvx-howner' });
    els.meta = h('div', { class: 'pvx-hmeta' });     // compact inline stats
    els.drops = h('div', { class: 'pvx-hdrops' });   // Details / Tags / Stars / … dropdowns
    els.openPl = h('a', { class: 'pvx-btn pvx-openpl', href: pvxPlaylistPageUrl(pid), title: 'Open the playlist on the site', html: PVX_SVG.list + '<span>Open playlist</span>' });
    const head = h('div', { class: 'pvx-head' },
        els.thumb,
        h('div', { class: 'pvx-hinfo' },
            h('div', { class: 'pvx-hline' }, els.title, els.owner),
            h('div', { class: 'pvx-hline' }, els.meta, els.drops)),
        h('div', { class: 'pvx-hbtns' },
            els.openPl,
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
        els.size);

    // Loading bar
    els.barFill = h('div', { class: 'pvx-barfill' });
    els.barText = h('span', { class: 'pvx-bartext' });
    els.barBtn = h('button', { type: 'button', class: 'pvx-btn pvx-barbtn' });
    els.loadbar = h('div', { class: 'pvx-loadbar' }, h('div', { class: 'pvx-bar' }, els.barFill), els.barText, els.barBtn);

    els.body = h('div', { class: 'pvx-body', tabIndex: -1 });
    pvxPreviewBind(els.body);
    els.pager = h('div', { class: 'pvx-pager' });
    els.pager.addEventListener('click', pvxOnPagerClick);
    els.settings = h('div', { class: 'pvx-settings pvx-panel', hidden: true });
    els.list = h('div', { class: 'pvx-listpanel pvx-panel', hidden: true });   // full Tags / Stars / … list
    els.pop = h('div', { class: 'pvx-pop', hidden: true });                    // hover preview of a dropdown
    els.pop.addEventListener('mouseenter', () => clearTimeout(PV._popHide));
    els.pop.addEventListener('mouseleave', () => pvxHidePopSoon());
    els.pop.addEventListener('click', pvxOnBodyClick);

    const modal = h('div', { class: 'pvx-modal' }, head, toolbar, els.loadbar, els.body, els.pager, els.settings, els.list);
    root.append(modal, els.pop);
    modal.addEventListener('click', pvxOnBodyClick);   // tag / star / uploader filters + table sort, anywhere in the popup
    // Keys typed inside the popup run their own handlers first, then stop here so the site's shortcuts don't fire.
    root.addEventListener('keydown', e => e.stopPropagation());
    els.root = root;
    els.modal = modal;

    PV = { pid, hint: hint || {}, els, job: null, page: 1, qText: '', query: { terms: [], marks: [] },
        list: [], listVersion: -1, renderSig: '', loading: false, error: null, _rt: 0, _st: 0,
        focusIdx: opts.focusIdx ?? null, currentIdx: opts.focusIdx ?? null };

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
    pvxPreviewStop();
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

const PVX_DROPS = [
    // key, label, field (query token prefix), chip class
    ['tag', 'Tags', 'tag', ''],
    ['star', 'Stars', 'star', 'pvx-chip-star'],
    ['by', 'Uploaders', 'by', 'pvx-chip-by'],
    ['music', 'Music', 'music', 'pvx-chip-music'],
    ['creator', 'Creators', 'creator', 'pvx-chip-by'],
];
const PVX_POP_TOP = 15;

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
    Object.assign(els.openPl, S.newTab ? { target: '_blank', rel: 'noopener' } : { target: '' });

    const owner = pl ? pl.owner : hint.owner;
    els.owner.replaceChildren(...(owner ? [
        pl && pl.ownerAvatar ? h('img', { class: 'pvx-ava', src: pl.ownerAvatar, alt: '' }) : h('span', { class: 'pvx-ava pvx-ava-txt' }, owner[0].toUpperCase()),
        h('span', null, 'by '), h('b', null, owner)] : []));

    if (!pl) { els.meta.replaceChildren(); els.drops.replaceChildren(); return; }

    const vids = job.videos;
    let totalSec = 0, missing = 0;
    for (const v of vids) {
        if (v.pending) continue;
        if (v.missing) missing++;
        totalSec += v.durSec || 0;
    }
    PV._stats = { totalSec, missing };
    const stat = (icon, value, title, cls) => h('span', { class: 'pvx-stat ' + (cls || ''), title }, h('span', { class: 'pvx-stat-i', html: icon }), value);
    els.meta.replaceChildren(...[
        stat(PVX_SVG.film, vids.length.toLocaleString(), 'Videos in the playlist'),
        stat('<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
            (job.done ? '' : '≥ ') + fmtTotal(totalSec), job.done ? 'Total length' : 'Total length of the videos loaded so far'),
        stat(PVX_SVG.eye, fmtNum(pl.views), (pl.views ?? '–') + ' playlist views'),
        isFinite(pl.rating) ? stat(PVX_SVG.star, Math.round(pl.rating) + '%', 'Quality score (Bayesian rating)', pvxRatingClass(pl.rating)) : null,
        missing ? stat(PVX_SVG.warn, missing.toLocaleString(), 'Videos that no longer exist or could not be found', 'pvx-stat-warn') : null,
    ].filter(Boolean));

    // Counted lists (recomputed only when the data changed)
    if (PV._topVersion !== job.version || !PV._top) {
        PV._topVersion = job.version;
        const count = get => {
            const m = new Map();
            for (const v of vids) if (!v.pending) for (const x of get(v)) if (x) m.set(x, (m.get(x) || 0) + 1);
            return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        };
        PV._top = {
            tag: count(v => v.tags), star: count(v => v.stars), creator: count(v => v.creators),
            by: count(v => (v.uploader ? [v.uploader] : [])),
            music: count(v => v.music.map(m => [m.artist, m.song].filter(Boolean).join(' - '))),
        };
        if (!els.list.hidden && PV._listKind !== 'details') pvxRenderList();
    }
    const caret = '<svg class="pvx-caret" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    const drop = (kind, label, n) => {
        const b = h('button', { type: 'button', class: 'pvx-drop', dataset: { pvxDrop: kind }, html: `<span>${escHtml(label)}</span>` + (n != null ? `<span class="pvx-cnt">${n.toLocaleString()}</span>` : '') + caret });
        b.addEventListener('mouseenter', () => pvxShowPopSoon(b, kind));
        b.addEventListener('mouseleave', () => pvxHidePopSoon());
        b.addEventListener('click', () => pvxOpenList(kind));
        return b;
    };
    els.drops.replaceChildren(drop('details', 'Details'),
        ...PVX_DROPS.filter(([k]) => PV._top[k].length).map(([k, label]) => drop(k, label, PV._top[k].length)));
}

/* ───────────────────────── Dropdowns: hover preview + full list ───────────────────────── */

function pvxDetailsContent(full) {
    const { job } = PV;
    const pl = job.pl;
    const loaded = job.videos.filter(v => !v.pending).length;
    const row = (k, v) => (v == null || v === '' ? null : h('div', { class: 'pvx-drow' }, h('span', { class: 'pvx-dkey' }, k), h('span', { class: 'pvx-dval' }, v)));
    return [
        pl.description ? h('div', { class: 'pvx-ddesc' + (full ? ' is-full' : '') }, pl.description) : null,
        h('div', { class: 'pvx-dgrid' }, [
            row('Owner', pl.owner),
            row('Videos', job.videos.length.toLocaleString() + (job.done ? '' : ` (${loaded.toLocaleString()} loaded)`)),
            row('Total length', (job.done ? '' : '≥ ') + fmtTotal(PV._stats.totalSec)),
            row('Unavailable', PV._stats.missing ? PV._stats.missing.toLocaleString() : null),
            row('Views', pl.views != null ? pl.views.toLocaleString() : null),
            row('Likes', pl.likes != null ? pl.likes.toLocaleString() + (pl.dislikes != null ? ` / ${pl.dislikes.toLocaleString()} dislikes` : '') : null),
            row('Score', isFinite(pl.rating) ? Math.round(pl.rating) + '%' : null),
            row('Created', pl.createdAt ? new Date(pl.createdAt).toLocaleString() : null),
            row('Updated', pl.updatedAt ? new Date(pl.updatedAt).toLocaleString() : null),
            row('Visibility', pl.isPublic === false ? 'Private' : pl.isPublic ? 'Public' : null),
            row('Playlist ID', pl.id),
        ].filter(Boolean)),
    ].filter(Boolean);
}

function pvxShowPopSoon(trigger, kind) {
    clearTimeout(PV._popHide);
    clearTimeout(PV._popShow);
    PV._popShow = setTimeout(() => pvxShowPop(trigger, kind), PV.els.pop.hidden ? 140 : 0);
}

function pvxHidePopSoon() {
    clearTimeout(PV._popShow);
    clearTimeout(PV._popHide);
    PV._popHide = setTimeout(pvxHidePop, 220);
}

function pvxHidePop() {
    if (!PV) return;
    clearTimeout(PV._popShow);
    PV.els.pop.hidden = true;
    PV._popKind = null;
}

function pvxShowPop(trigger, kind) {
    if (!PV || !PV.job || !PV.els.list.hidden) return;   // no preview while the full list is open
    const pop = PV.els.pop;
    PV._popKind = kind;
    const foot = txt => h('div', { class: 'pvx-pfoot' }, txt);
    if (kind === 'details') {
        pop.replaceChildren(h('div', { class: 'pvx-phead' }, 'Playlist details'), ...pvxDetailsContent(false), foot('Click for the full details'));
    } else {
        const def = PVX_DROPS.find(d => d[0] === kind);
        const all = PV._top[kind] || [];
        const max = all[0] ? all[0][1] : 1;
        pop.replaceChildren(
            h('div', { class: 'pvx-phead' }, `Top ${def[1].toLowerCase()}`, h('span', { class: 'pvx-cnt' }, all.length.toLocaleString())),
            h('div', { class: 'pvx-plist' }, all.slice(0, PVX_POP_TOP).map(([name, n]) => pvxListRow(def, name, n, max))),
            foot(all.length > PVX_POP_TOP ? `Click for all ${all.length.toLocaleString()}` : 'Click to open the list'));
    }
    pop.hidden = false;
    const r = trigger.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    pop.style.maxHeight = Math.max(160, innerHeight - r.bottom - 24) + 'px';
}

/** One clickable "name … count" row; marked active when its token is in the search. */
function pvxListRow(def, name, n, max) {
    const token = pvxToken(def[2], name);
    const active = pvxHasToken(token);
    return h('button', { type: 'button', class: 'pvx-lrow' + (active ? ' is-active' : ''), dataset: { pvxQ: token }, title: (active ? 'Remove filter: ' : 'Filter: ') + name },
        h('span', { class: 'pvx-lbar', style: `width:${Math.max(2, n / max * 100)}%` }),
        h('span', { class: 'pvx-lname' }, name),
        h('span', { class: 'pvx-lcnt' }, n.toLocaleString()));
}

function pvxHasToken(token) {
    const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|\\s)' + esc + '(?=\\s|$)', 'i').test(PV.els.search.value);
}

function pvxOpenList(kind) {
    pvxHidePop();
    if (!PV.job) return;
    if (!PV.els.list.hidden && PV._listKind === kind) { pvxCloseList(); return; }
    pvxToggleSettings(false);
    PV._listKind = kind;
    PV._listFilter = '';
    PV._listSort = 'count';
    PV.els.list.hidden = false;
    pvxRenderList(true);
    PV.els.drops.querySelectorAll('.pvx-drop').forEach(b => b.classList.toggle('is-on', b.dataset.pvxDrop === kind));
}

function pvxCloseList() {
    if (!PV) return;
    PV.els.list.hidden = true;
    PV._listKind = null;
    PV.els.drops.querySelectorAll('.pvx-drop.is-on').forEach(b => b.classList.remove('is-on'));
}

const PVX_LIST_MAX = 2000;   // rows rendered at once in the full list

function pvxRenderList(rebuild) {
    const panel = PV.els.list;
    const kind = PV._listKind;
    if (!kind) return;
    const closeBtn = h('button', { type: 'button', class: 'pvx-ibtn', title: 'Close', onclick: pvxCloseList,
        html: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' });
    if (kind === 'details') {
        panel.replaceChildren(h('div', { class: 'pvx-shead' }, h('b', null, 'Playlist details'), closeBtn), ...pvxDetailsContent(true));
        return;
    }
    const def = PVX_DROPS.find(d => d[0] === kind);
    const all = PV._top[kind] || [];
    if (rebuild || !PV.els.listBody) {
        const filter = h('input', { type: 'search', class: 'pvx-input pvx-lfilter', placeholder: `Filter ${def[1].toLowerCase()}…`, value: PV._listFilter || '', spellcheck: false });
        filter.addEventListener('input', () => { PV._listFilter = filter.value; pvxRenderList(false); });
        const sortBtn = h('button', { type: 'button', class: 'pvx-btn pvx-lsort' });
        sortBtn.addEventListener('click', () => { PV._listSort = PV._listSort === 'count' ? 'name' : 'count'; pvxRenderList(false); });
        PV.els.listTitle = h('b');
        PV.els.listSortBtn = sortBtn;
        PV.els.listBody = h('div', { class: 'pvx-llist' });
        PV.els.listNote = h('div', { class: 'pvx-lnote' });
        panel.replaceChildren(
            h('div', { class: 'pvx-shead' }, PV.els.listTitle, closeBtn),
            h('div', { class: 'pvx-ltools' }, filter, sortBtn),
            h('div', { class: 'pvx-lhint' }, 'Click to add / remove a filter. Several filters must all match.'),
            PV.els.listBody, PV.els.listNote);
        setTimeout(() => filter.focus(), 0);
    }
    const f = (PV._listFilter || '').trim().toLowerCase();
    let rows = f ? all.filter(([n]) => n.toLowerCase().includes(f)) : all.slice();
    if (PV._listSort === 'name') rows.sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base', numeric: true }));
    const max = all[0] ? all[0][1] : 1;
    PV.els.listTitle.textContent = `${def[1]} — ${all.length.toLocaleString()}` + (PV.job.done ? '' : ' (so far)');
    PV.els.listSortBtn.textContent = PV._listSort === 'count' ? 'Sort: most videos' : 'Sort: A → Z';
    const top = PV.els.listBody.scrollTop;
    PV.els.listBody.replaceChildren(...rows.slice(0, PVX_LIST_MAX).map(([name, n]) => pvxListRow(def, name, n, max)));
    PV.els.listBody.scrollTop = rebuild ? 0 : top;
    PV.els.listNote.textContent = !rows.length ? 'Nothing matches.' : rows.length > PVX_LIST_MAX ? `Showing ${PVX_LIST_MAX.toLocaleString()} of ${rows.length.toLocaleString()} — type to narrow down.` : '';
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
    if (!PV.els.list.hidden && PV._listKind !== 'details') pvxRenderList(false);
    if (!PV.els.pop.hidden) PV.els.pop.querySelectorAll('.pvx-lrow').forEach(r => r.classList.toggle('is-active', pvxHasToken(r.dataset.pvxQ)));
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

/** Text size applies to the videos area only (grid / table), so the controls never move while you drag. */
function pvxApplyScale() {
    PV.els.modal.style.setProperty('--pvx-scale', S.scale / 100);
    if (PV.els.scale) PV.els.scale.value = S.scale;
    if (PV.els.scaleVal) PV.els.scaleVal.textContent = S.scale + '%';
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
    if (PV.focusIdx != null && job) {   // jump to the page holding the current video (once)
        const at = list.findIndex(v => v.idx === PV.focusIdx);
        if (at >= 0) { PV.page = Math.floor(at / size) + 1; PV._scrollToCur = true; force = true; }
        PV.focusIdx = null;
    }
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

    const ctx = { pid: PV.pid, marks: PV.query.marks, sort: S.sort, sortDir: S.sortDir, currentIdx: PV.currentIdx };
    let content;
    if (!job) content = h('div', { class: 'pvx-empty' }, PV.error ? 'Could not load this playlist.' : h('div', { class: 'pvx-spinner' }));
    else if (!total) content = h('div', { class: 'pvx-empty' }, 'This playlist has no videos.');
    else if (!items.length) content = h('div', { class: 'pvx-empty' }, PV.qText ? (job.done ? 'No videos match your search.' : 'No matches among the videos loaded so far…') : 'Nothing to show.');
    else content = S.view === 'table' ? pvxRenderTable(items, ctx) : pvxRenderGrid(items, ctx);

    const keepScroll = !force;
    const top = els.body.scrollTop;
    if (pvxPrev && els.body.contains(pvxPrev.host)) pvxPreviewStop();
    els.body.replaceChildren(content);
    els.body.classList.toggle('is-table', S.view === 'table');
    els.body.scrollTop = keepScroll ? top : 0;
    if (PV._scrollToCur) {
        PV._scrollToCur = false;
        els.body.querySelector('.is-current')?.scrollIntoView({ block: 'center' });
    }
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
    if (document.getElementById('pvxcl-backdrop')) return;   // the changelog popup handles its own keys
    const inside = PV.els.root.contains(e.target);
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!PV.els.pop.hidden) pvxHidePop();
        else if (!PV.els.list.hidden) pvxCloseList();
        else if (!PV.els.settings.hidden) pvxToggleSettings(false);
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
    if (show) { pvxCloseList(); pvxHidePop(); }
    panel.hidden = !show;
    PV.els.gear.classList.toggle('is-on', show);
    if (show) pvxBuildSettings();
}

function pvxSettingRange(key, label, min, max, step, unit) {
    const val = h('span', { class: 'pvx-scaleval' }, S[key] + unit);
    const inp = h('input', { type: 'range', class: 'pvx-range', min, max, step, value: S[key] });
    inp.addEventListener('input', () => { pvxSet(key, +inp.value); val.textContent = inp.value + unit; });
    return h('div', { class: 'pvx-srow' }, h('span', { class: 'pvx-slabel' }, label), h('div', { class: 'pvx-scalerow' }, inp, val));
}

function pvxBuildSettings() {
    const panel = PV.els.settings;
    PV.els.scale = h('input', { type: 'range', class: 'pvx-range', min: 70, max: 200, step: 5, value: S.scale, title: 'Text size' });
    PV.els.scale.addEventListener('input', () => pvxSetScale(+PV.els.scale.value));
    PV.els.scaleVal = h('span', { class: 'pvx-scaleval' }, S.scale + '%');
    const check = (key, label) => {
        const box = h('input', { type: 'checkbox', checked: !!S[key] });
        box.addEventListener('change', () => { pvxSet(key, box.checked); if (key === 'cardClick') pvxRefreshCards(); pvxRenderHeader(); pvxRenderBody(false); });
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
        h('div', { class: 'pvx-srow' }, h('span', { class: 'pvx-slabel' }, 'Text size of the videos (grid / table)'),
            h('div', { class: 'pvx-scalerow' },
                h('button', { type: 'button', class: 'pvx-btn pvx-a', title: 'Smaller', onclick: () => pvxSetScale(S.scale - 10) }, 'A−'),
                PV.els.scale,
                h('button', { type: 'button', class: 'pvx-btn pvx-a', title: 'Larger', onclick: () => pvxSetScale(S.scale + 10) }, 'A+'),
                PV.els.scaleVal,
                h('button', { type: 'button', class: 'pvx-btn', title: 'Back to 100%', onclick: () => pvxSetScale(100) }, 'Reset'))),
        check('cardClick', 'Clicking a playlist card opens this viewer (the small "Playlist" button on the card opens the playlist itself)'),
        check('newTab', 'Open videos and the playlist page in a new tab'),
        h('div', { class: 'pvx-ssec' }, 'Hover preview'),
        check('previewOnHover', "Play the video's preview while hovering its thumbnail"),
        check('previewMuted', 'Play previews muted (the speaker button on a playing preview toggles this too)'),
        pvxSettingRange('previewVolume', 'Preview volume (when not muted)', 0, 100, 5, '%'),
        pvxSettingRange('previewDelay', 'Hover delay before the preview starts', 0, 1500, 50, ' ms'),
        h('div', { class: 'pvx-ssec' }, 'Playlist player'),
        check('fixWatch', "Repair the site's playlist player: real position (\"Video 722 of 1,234\"), working Previous / Next / Theater, side list around the current video"),
        check('autoNext', 'Playlist player: go to the next video when one ends'),
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
            h('button', { type: 'button', class: 'pvx-btn', onclick: () => showFullChangelog() }, "📋 Show Changelog"),
            h('button', { type: 'button', class: 'pvx-btn', onclick: () => {
                if (!confirm('Reset all Playlist Viewer settings?')) return;
                pvxResetSettings(); pvxApplyScale(); pvxSyncControls(); PV.els.size.value = S.pageSize; pvxBuildSettings(); pvxRenderBody(true);
            } }, 'Reset to defaults')),
        h('div', { class: 'pvx-sver' }, 'Playlist Viewer v' + SCRIPT_VERSION),
    );
}
