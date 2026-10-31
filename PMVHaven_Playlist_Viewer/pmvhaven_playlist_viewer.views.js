// ==UserScript Module==
// @name         [PMVHaven] Playlist Viewer — grid & table views
// Version       1.3
// Part of pmvhaven_playlist_viewer.user.js (loaded via @require, shares its scope).
// Top-level code only declares things; main-script helpers are used inside functions only.

/* Both renderers take (items, ctx):
     items  normalized videos of the current page
     ctx    { pid, marks: [lowercase strings to highlight], sort, sortDir }
   Clickable filters carry data-pvx-q="<query token>" (handled by the modal).
   Sortable table headers carry data-pvx-sort="<key>". */

const PVX_SVG = {
    eye: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></svg>',
    like: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v3m8-3v3"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
    list: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h13M3 12h13M3 18h9"/><path d="m17 15 4 3-4 3z" fill="currentColor"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor"><path d="M11.52 2.3a.53.53 0 0 1 .95 0l2.31 4.68a2.12 2.12 0 0 0 1.6 1.16l5.16.76a.53.53 0 0 1 .3.9l-3.74 3.64a2.12 2.12 0 0 0-.61 1.88l.88 5.14a.53.53 0 0 1-.77.56l-4.62-2.43a2.12 2.12 0 0 0-1.97 0L6.4 21.01a.53.53 0 0 1-.77-.56l.88-5.14a2.12 2.12 0 0 0-.61-1.88L2.16 9.8a.53.53 0 0 1 .3-.9l5.16-.76a2.12 2.12 0 0 0 1.6-1.16z"/></svg>',
    music: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    warn: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4m0 4h.01"/></svg>',
    film: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M3 7.5h4M3 12h18M3 16.5h4M17 3v18m0-13.5h4m-4 9h4"/></svg>',
};

/** Escapes text and wraps every occurrence of the given (lowercase) strings in <mark>. */
function pvxMarkHtml(text, marks) {
    text = String(text ?? '');
    const parts = (marks || []).filter(Boolean);
    if (!parts.length) return escHtml(text);
    const re = new RegExp('(' + parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|') + ')', 'gi');
    return text.split(re).map((seg, i) => (i % 2 ? '<mark>' + escHtml(seg) + '</mark>' : escHtml(seg))).join('');
}

/** Query token for a field value, e.g. tag:"big tits" */
function pvxToken(field, value) {
    const v = String(value);
    return field + ':' + (/[\s"]/.test(v) ? '"' + v.replace(/"/g, '') + '"' : v);
}

function pvxLinkAttrs(href) {
    return S.newTab ? { href, target: '_blank', rel: 'noopener' } : { href };
}

function pvxRatingClass(r) {
    if (!isFinite(r)) return '';
    return r >= 75 ? 'pvx-r-hi' : r >= 50 ? 'pvx-r-mid' : 'pvx-r-lo';
}

function pvxThumbImg(v, cls) {
    if (!v.thumb) return h('span', { class: cls + ' pvx-noimg', html: PVX_SVG.film });
    const img = h('img', { class: cls, src: v.thumb, alt: '', loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer-when-downgrade' });
    img.addEventListener('error', () => img.replaceWith(h('span', { class: cls + ' pvx-noimg', html: PVX_SVG.film })), { once: true });
    return img;
}

function pvxChips(v, max) {
    const out = [];
    for (const s of v.stars) out.push(h('button', { type: 'button', class: 'pvx-chip pvx-chip-star', dataset: { pvxQ: pvxToken('star', s) }, title: 'Filter: ' + s }, s));
    for (const t of v.tags) out.push(h('button', { type: 'button', class: 'pvx-chip', dataset: { pvxQ: pvxToken('tag', t) }, title: 'Filter: ' + t }, t));
    if (max && out.length > max) {
        const more = out.length - max;
        const rest = out.slice(max).map(c => c.textContent).join(', ');
        return [...out.slice(0, max), h('span', { class: 'pvx-chip pvx-chip-more', title: rest }, '+' + more)];
    }
    return out;
}

function pvxActionLinks(v, pid, compact) {
    if (v.missing || v.pending) return null;
    return [
        h('a', { class: 'pvx-act', ...pvxLinkAttrs(pvxVideoUrl(v, pid)), title: 'Open this video on its own', html: PVX_SVG.play + (compact ? '' : '<span>Open</span>') }),
        h('a', { class: 'pvx-act pvx-act-pl', ...pvxLinkAttrs(pvxPlaylistVideoUrl(v, pid)), title: 'Open this video inside the playlist', html: PVX_SVG.list + (compact ? '' : '<span>In playlist</span>') }),
    ];
}

/* ───────────────────────── Grid ───────────────────────── */

function pvxRenderGrid(items, ctx) {
    const grid = h('div', { class: 'pvx-grid' });
    for (const v of items) grid.append(pvxGridCard(v, ctx));
    return grid;
}

function pvxGridCard(v, ctx) {
    const cls = 'pvx-card' + (v.missing ? ' is-missing' : '') + (v.pending ? ' is-pending' : '') + (v.idx === ctx.currentIdx ? ' is-current' : '');
    if (v.pending) {
        return h('div', { class: cls },
            h('div', { class: 'pvx-thumb' }, h('span', { class: 'pvx-badge pvx-idx' }, '#' + (v.idx + 1))),
            h('div', { class: 'pvx-cbody' }, h('div', { class: 'pvx-skel' }), h('div', { class: 'pvx-skel pvx-skel-s' })));
    }
    const href = v.missing ? null : pvxVideoUrl(v, ctx.pid);
    const thumb = h(href ? 'a' : 'div', { class: 'pvx-thumb', ...(href ? pvxLinkAttrs(href) : {}), dataset: pvxPreviewData(v) },
        pvxThumbImg(v, 'pvx-thumb-img'),
        h('span', { class: 'pvx-badge pvx-idx', title: 'Position in playlist' }, '#' + (v.idx + 1)),
        v.durSec ? h('span', { class: 'pvx-badge pvx-dur' }, fmtDur(v.durSec)) : null,
        v.seizure ? h('span', { class: 'pvx-badge pvx-warn', title: 'Seizure warning', html: PVX_SVG.warn }) : null,
        isFinite(v.rating) ? h('span', { class: 'pvx-badge pvx-rating ' + pvxRatingClass(v.rating), title: 'Quality score (Bayesian rating)', html: PVX_SVG.star + Math.round(v.rating) + '%' }) : null,
    );
    const title = h(href ? 'a' : 'div', { class: 'pvx-title', title: v.title, ...(href ? pvxLinkAttrs(href) : {}), html: pvxMarkHtml(v.title, ctx.marks) });
    const by = v.uploader ? h('button', { type: 'button', class: 'pvx-by', dataset: { pvxQ: pvxToken('by', v.uploader) }, title: 'Filter by uploader' },
        v.uploaderAvatar ? h('img', { class: 'pvx-ava', src: v.uploaderAvatar, alt: '', loading: 'lazy' }) : h('span', { class: 'pvx-ava pvx-ava-txt' }, v.uploader[0].toUpperCase()),
        h('span', { class: 'pvx-by-name', html: pvxMarkHtml(v.uploader, ctx.marks) })) : null;
    const stats = v.missing ? h('div', { class: 'pvx-stats' }, 'This video is no longer available') : h('div', { class: 'pvx-stats' },
        h('span', { title: (v.views ?? '–') + ' views', html: PVX_SVG.eye + fmtNum(v.views) }),
        h('span', { title: (v.likes ?? '–') + ' likes', html: PVX_SVG.like + fmtNum(v.likes) }),
        v.uploadDate ? h('span', { title: fmtDate(v.uploadDate), html: PVX_SVG.cal + escHtml(relTime(v.uploadDate)) }) : null);
    const music = v.music.length ? h('div', { class: 'pvx-music', title: v.music.map(m => [m.artist, m.song].filter(Boolean).join(' - ')).join('\n'),
        html: PVX_SVG.music + pvxMarkHtml(v.music.map(m => [m.artist, m.song].filter(Boolean).join(' - ')).join(' · '), ctx.marks) }) : null;
    const chips = S.showTags && (v.tags.length || v.stars.length) ? h('div', { class: 'pvx-chips' }, pvxChips(v, 6)) : null;
    const acts = pvxActionLinks(v, ctx.pid, false);
    return h('div', { class: cls },
        thumb,
        h('div', { class: 'pvx-cbody' }, title, h('div', { class: 'pvx-row' }, by, stats), music, chips,
            acts ? h('div', { class: 'pvx-actions' }, acts) : null));
}

/* ───────────────────────── Table ───────────────────────── */

const PVX_COLUMNS = [
    { key: 'index', label: '#', cls: 'pvx-c-idx', sort: 'index' },
    { key: 'thumb', label: '', cls: 'pvx-c-thumb' },
    { key: 'title', label: 'Title', cls: 'pvx-c-title', sort: 'title' },
    { key: 'uploader', label: 'Uploader', cls: 'pvx-c-by', sort: 'uploader' },
    { key: 'duration', label: 'Length', cls: 'pvx-c-num', sort: 'duration' },
    { key: 'views', label: 'Views', cls: 'pvx-c-num', sort: 'views' },
    { key: 'likes', label: 'Likes', cls: 'pvx-c-num', sort: 'likes' },
    { key: 'rating', label: 'Score', cls: 'pvx-c-num', sort: 'rating' },
    { key: 'date', label: 'Uploaded', cls: 'pvx-c-date', sort: 'date' },
    { key: 'tags', label: 'Tags', cls: 'pvx-c-tags' },
    { key: 'open', label: 'Open', cls: 'pvx-c-open' },
];

function pvxRenderTable(items, ctx) {
    const head = h('tr', null, PVX_COLUMNS.map(c => {
        const active = c.sort && ctx.sort === c.sort;
        return h('th', {
            class: c.cls + (c.sort ? ' is-sortable' : '') + (active ? ' is-sorted' : ''),
            dataset: c.sort ? { pvxSort: c.sort } : null,
            title: c.sort ? 'Sort by ' + (c.label || c.key) : null,
        }, c.label, active ? h('span', { class: 'pvx-sortarrow' }, ctx.sortDir > 0 ? ' ▲' : ' ▼') : null);
    }));
    const body = h('tbody');
    for (const v of items) body.append(pvxTableRow(v, ctx));
    return h('div', { class: 'pvx-tablewrap' }, h('table', { class: 'pvx-table' }, h('thead', null, head), body));
}

function pvxTableRow(v, ctx) {
    const cls = (v.missing ? 'is-missing' : '') + (v.pending ? ' is-pending' : '') + (v.idx === ctx.currentIdx ? ' is-current' : '');
    if (v.pending) {
        return h('tr', { class: cls }, h('td', { class: 'pvx-c-idx' }, v.idx + 1), h('td', { class: 'pvx-c-thumb' }, h('div', { class: 'pvx-tthumb' })),
            h('td', { colSpan: PVX_COLUMNS.length - 2 }, h('div', { class: 'pvx-skel' })));
    }
    const href = v.missing ? null : pvxVideoUrl(v, ctx.pid);
    const sub = [];
    if (v.stars.length) sub.push(h('span', { class: 'pvx-sub-stars' }, v.stars.map(s => h('button', { type: 'button', class: 'pvx-chip pvx-chip-star', dataset: { pvxQ: pvxToken('star', s) } }, s))));
    if (v.music.length) sub.push(h('span', { class: 'pvx-music', html: PVX_SVG.music + pvxMarkHtml(v.music.map(m => [m.artist, m.song].filter(Boolean).join(' - ')).join(' · '), ctx.marks) }));
    return h('tr', { class: cls },
        h('td', { class: 'pvx-c-idx' }, v.idx + 1),
        h('td', { class: 'pvx-c-thumb' }, h(href ? 'a' : 'div', { class: 'pvx-tthumb', ...(href ? pvxLinkAttrs(href) : {}), dataset: pvxPreviewData(v) },
            pvxThumbImg(v, 'pvx-thumb-img'),
            v.seizure ? h('span', { class: 'pvx-badge pvx-warn', title: 'Seizure warning', html: PVX_SVG.warn }) : null)),
        h('td', { class: 'pvx-c-title' },
            h(href ? 'a' : 'span', { class: 'pvx-title', title: v.title, ...(href ? pvxLinkAttrs(href) : {}), html: pvxMarkHtml(v.title, ctx.marks) }),
            sub.length ? h('div', { class: 'pvx-sub' }, sub) : null,
            v.missing ? h('div', { class: 'pvx-sub' }, 'No longer available') : null),
        h('td', { class: 'pvx-c-by' }, v.uploader ? h('button', { type: 'button', class: 'pvx-by', dataset: { pvxQ: pvxToken('by', v.uploader) }, title: 'Filter by uploader' },
            h('span', { class: 'pvx-by-name', html: pvxMarkHtml(v.uploader, ctx.marks) })) : ''),
        h('td', { class: 'pvx-c-num' }, fmtDur(v.durSec)),
        h('td', { class: 'pvx-c-num', title: v.views ?? '' }, fmtNum(v.views)),
        h('td', { class: 'pvx-c-num', title: v.likes ?? '' }, fmtNum(v.likes)),
        h('td', { class: 'pvx-c-num' }, isFinite(v.rating) ? h('span', { class: 'pvx-score ' + pvxRatingClass(v.rating) }, Math.round(v.rating) + '%') : ''),
        h('td', { class: 'pvx-c-date', title: fmtDate(v.uploadDate) }, fmtDate(v.uploadDate)),
        h('td', { class: 'pvx-c-tags' }, h('div', { class: 'pvx-chips' }, v.tags.map(t => h('button', { type: 'button', class: 'pvx-chip', dataset: { pvxQ: pvxToken('tag', t) } }, t)))),
        h('td', { class: 'pvx-c-open' }, h('div', { class: 'pvx-actions' }, pvxActionLinks(v, ctx.pid, true))),
    );
}

/* ───────────────────────── Hover preview ─────────────────────────
   Any element with data-pvx-preview="<clip url>" inside a container passed to pvxPreviewBind()
   plays that clip over itself while hovered (settings previewOnHover / previewMuted /
   previewVolume / previewDelay). Only one preview plays at a time; it is fully unloaded
   when the pointer leaves, so hovering through a grid doesn't keep downloads running. */

let pvxPrev = null;   // { host, timer, video, snd }

const PVX_SVG_SOUND_ON = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6M19.4 18.4a9 9 0 0 0 0-12.8"/></svg>';
const PVX_SVG_SOUND_OFF = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';

function pvxPreviewData(v) {
    return v.preview && !v.missing && !v.pending ? { pvxPreview: v.preview } : null;
}

function pvxPreviewBind(root) {
    if (root.dataset.pvxPrevBound) return;
    root.dataset.pvxPrevBound = '1';
    root.addEventListener('mouseover', e => {
        const host = e.target.closest && e.target.closest('[data-pvx-preview]');
        if (!host || !root.contains(host) || (pvxPrev && pvxPrev.host === host)) return;
        pvxPreviewStop();
        if (!S.previewOnHover || host.dataset.pvxPreviewBad) return;
        pvxPrev = { host, timer: setTimeout(() => pvxPreviewStart(host), Math.max(0, +S.previewDelay || 0)) };
    });
    root.addEventListener('mouseout', e => {
        if (!pvxPrev || !pvxPrev.host.contains(e.target)) return;
        if (e.relatedTarget && pvxPrev.host.contains(e.relatedTarget)) return;
        pvxPreviewStop();
    });
}

function pvxPreviewStart(host) {
    if (!pvxPrev || pvxPrev.host !== host || !host.isConnected) return;
    const video = document.createElement('video');
    video.className = 'pvx-prev';
    video.muted = !!S.previewMuted;
    video.volume = Math.max(0, Math.min(1, (+S.previewVolume || 0) / 100));
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.src = host.dataset.pvxPreview;
    host.classList.add('pvx-prev-loading');
    video.addEventListener('playing', () => { video.classList.add('is-on'); host.classList.remove('pvx-prev-loading'); }, { once: true });
    video.addEventListener('error', () => {
        host.dataset.pvxPreviewBad = '1';   // no clip for this video — don't try again
        if (pvxPrev && pvxPrev.video === video) pvxPreviewStop();
    }, { once: true });
    const snd = h('button', { type: 'button', class: 'pvx-prevsnd', title: 'Preview sound on / off (saved in Settings)' });
    const paint = () => { snd.innerHTML = video.muted ? PVX_SVG_SOUND_OFF : PVX_SVG_SOUND_ON; snd.classList.toggle('is-on', !video.muted); };
    snd.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        pvxSet('previewMuted', !S.previewMuted);
        video.muted = S.previewMuted;
        paint();
        if (!video.muted) video.play().catch(() => {});
    });
    paint();
    host.append(video, snd);
    pvxPrev.video = video;
    pvxPrev.snd = snd;
    video.play().catch(err => {
        // Sound may be blocked until the page has had a click; fall back to muted.
        if (err && err.name === 'NotAllowedError' && !video.muted) { video.muted = true; paint(); video.play().catch(() => {}); }
    });
}

function pvxPreviewStop() {
    if (!pvxPrev) return;
    const { timer, video, snd, host } = pvxPrev;
    pvxPrev = null;
    clearTimeout(timer);
    host.classList.remove('pvx-prev-loading');
    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();   // releases the download
        video.remove();
    }
    snd?.remove();
}
