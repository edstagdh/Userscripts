// ==UserScript Module==
// @name         [PMVHaven] Playlist Viewer — playlist player repair
// Version       1.4
// Part of pmvhaven_playlist_viewer.user.js (loaded via @require, shares its scope).
// Top-level code only declares things; main-script helpers are used inside functions only.

/* The site's playlist mode (/video/<slug>_<id>?playlist=<pid>&index=<n>) only knows the
   first 50 videos of a playlist: past that the counter reads "Video 722 of 50", Next is
   disabled, the side list shows videos 1–50 and its "Theater" link points to a page that
   doesn't exist. On those pages (setting fixWatch) this module:
     - corrects the counter (real position / real total),
     - replaces Previous / Next with links that use the whole playlist,
     - makes Theater toggle the site's own theater mode,
     - adds "All videos" (opens the viewer at the current video),
     - shows the side list as a window around the current video (+ "earlier" / "more"),
     - goes to the next video when one ends (setting autoNext), as the site stops after 50.
   Navigation is a normal page load. The site's own elements are only hidden, never removed. */

let PVW = null;   // { href, pid, idx, vid, job, cur, from, to, error, loading }

const PVW_BEFORE = 10;   // side list: videos shown before the current one
const PVW_AFTER = 40;    //            … and after it
const PVW_STEP = 25;     // "Show earlier" / "Show more"

function pvwParams() {
    if (!/^\/video\//.test(location.pathname)) return null;
    const sp = new URLSearchParams(location.search);
    const pid = sp.get('playlist');
    if (!pid || !/^[0-9a-f]{24}$/i.test(pid)) return null;
    const idx = parseInt(sp.get('index'), 10);
    const vid = (/([0-9a-f]{24})\/?$/i.exec(location.pathname) || [])[1];
    return { pid: pid.toLowerCase(), idx: isNaN(idx) ? null : idx, vid: vid ? vid.toLowerCase() : null };
}

/** Called on every (throttled) DOM change and route check. Cheap when nothing changed. */
function pvwCheck() {
    const p = S.fixWatch ? pvwParams() : null;
    if (!p) { if (PVW) pvwTeardown(); return; }
    if (!PVW || PVW.href !== location.href) {
        pvwTeardown();
        PVW = { ...p, href: location.href, job: null, cur: null, from: 0, to: 0, error: null, loading: false };
        pvwLoad();
    }
    pvwApply();
}

async function pvwLoad() {
    const w = PVW;
    w.loading = true;
    try {
        const job = await pvxGetJob(w.pid);
        if (PVW !== w) return;
        const n = job.entries.length;
        // The index in the URL wins if it points at this video; otherwise look the video up.
        let cur = w.idx;
        const fits = cur != null && cur >= 0 && cur < n && (!w.vid || job.entries[cur].id === w.vid);
        if (!fits) {
            const f = w.vid ? job.entries.findIndex(e => e.id === w.vid) : -1;
            cur = f >= 0 ? f : Math.max(0, Math.min(n - 1, cur || 0));
        }
        w.job = job;
        w.cur = cur;
        w.from = Math.max(0, cur - PVW_BEFORE);
        w.to = Math.min(n, cur + PVW_AFTER + 1);
        pvwApply();
        await pvxLoadRange(job, w.from, w.to);
    } catch (err) {
        console.error('[PVX] playlist player:', err);
        if (PVW === w) w.error = err.message || String(err);
    }
    if (PVW !== w) return;
    w.loading = false;
    pvwApply();
}

async function pvwExtend(dir) {
    const w = PVW;
    if (!w || !w.job || w.loading) return;
    const n = w.job.entries.length;
    const from = dir < 0 ? Math.max(0, w.from - PVW_STEP) : w.from;
    const to = dir > 0 ? Math.min(n, w.to + PVW_STEP) : w.to;
    w.loading = true;
    pvwApply();
    try { await pvxLoadRange(w.job, from, to); } catch (e) { console.error('[PVX]', e); }
    if (PVW !== w) return;
    w.from = from;
    w.to = to;
    w.loading = false;
    w.scrollTo = dir < 0 ? 'top' : null;
    pvwApply();
}

function pvwUrl(i) {
    const w = PVW;
    if (!w || !w.job || i < 0 || i >= w.job.entries.length) return null;
    return pvxPlaylistVideoUrl(w.job.videos[i], w.pid);
}

function pvwTeardown() {
    for (const el of document.querySelectorAll('[data-pvx-hidden]')) { el.style.display = ''; delete el.dataset.pvxHidden; }
    for (const el of document.querySelectorAll('.pvx-wctl, .pvx-wpanel, .pvx-wpos')) el.remove();
    const c = document.querySelector('[data-pvx-counter]');
    if (c) delete c.dataset.pvxCounter;
    PVW = null;
}

function pvwHide(el) {
    if (el && !el.dataset.pvxHidden) { el.dataset.pvxHidden = '1'; el.style.display = 'none'; }
}

/* ───────────────────────── DOM ───────────────────────── */

function pvwApply() {
    const w = PVW;
    if (!w || !w.job || w.error) return;   // until the playlist is known (or if it failed) the site's own UI stays
    const n = w.job.entries.length;

    // Top bar: counter + controls
    const prev = document.querySelector('button[title="Previous video"]');
    const next = document.querySelector('button[title="Next video"]');
    const theater = document.querySelector('a[title="Playlist theater mode"]');
    const bar = (prev || next || theater)?.closest('.mb-4') || null;
    if (bar) {
        const p = bar.querySelector('p');
        const text = `Video ${(w.cur + 1).toLocaleString()} of ${n.toLocaleString()}`;
        if (p && p.textContent.trim() !== text) { p.textContent = ' ' + text; p.dataset.pvxCounter = '1'; }
        const holder = (prev || next || theater).parentElement;
        let ctl = holder.querySelector(':scope > .pvx-wctl');
        // rebuilt when video details arrive, so Previous / Next get the site's /video/<slug>_<id> links
        const ctlSig = [w.cur, w.job.videos[w.cur - 1]?.pending, w.job.videos[w.cur + 1]?.pending].join('|');
        if (!ctl || ctl.dataset.sig !== ctlSig) {
            const fresh = pvwBuildControls(prev, next, theater);
            fresh.dataset.sig = ctlSig;
            if (ctl) ctl.replaceWith(fresh); else holder.append(fresh);
        }
        [prev, next, theater].forEach(pvwHide);
    }

    pvwRenderPanel();
}

function pvwBuildControls(prev, next, theater) {
    const w = PVW;
    const btnCls = (prev || next)?.className || 'pvx-wbtn';
    const accCls = theater?.className || 'pvx-wbtn pvx-wbtn-acc';
    const link = (i, title, iconFrom, fallback) => {
        const href = pvwUrl(i);
        const a = h('a', { class: btnCls + (href ? '' : ' pvx-wdis'), title: href ? `${title} (#${i + 1})` : title, 'aria-disabled': href ? null : 'true' });
        if (href) a.href = href;
        a.innerHTML = iconFrom ? iconFrom.innerHTML : fallback;
        return a;
    };
    const tBtn = h('button', { type: 'button', class: accCls, title: 'Theater mode' });
    tBtn.innerHTML = theater ? theater.innerHTML : 'Theater';
    tBtn.addEventListener('click', () => document.querySelector('button[aria-label="Toggle theater mode"]')?.click());
    const all = h('button', { type: 'button', class: btnCls, title: 'All videos of this playlist (opens at this video)', html: PVX_ICON_LIST + '<span>All videos</span>' });
    all.addEventListener('click', () => pvxOpen(w.pid, { name: w.job.pl.name, thumb: w.job.pl.thumb, owner: w.job.pl.owner }, { focusIdx: w.cur }));
    return h('div', { class: 'pvx-wctl' },
        link(w.cur - 1, 'Previous video', prev, '‹'),
        link(w.cur + 1, 'Next video', next, '›'),
        tBtn, all);
}

function pvwRenderPanel() {
    const w = PVW;
    // the site's own list rows (not our controls / rows / the viewer)
    const anchor = [...document.querySelectorAll('a[href*="?playlist="][href*="index="]')].find(a => !a.closest('.pvx-wctl, .pvx-wpanel, #pvx-root'));
    let list = anchor ? anchor.parentElement : document.querySelector('.pvx-wpanel')?.previousElementSibling;
    let panel = document.querySelector('.pvx-wpanel');
    if (!list && !panel) return;
    if (list && !list.classList.contains('pvx-wpanel')) {
        pvwHide(list);
        if (!panel || panel.previousElementSibling !== list) {
            panel?.remove();
            panel = h('div', { class: (list.className || '') + ' pvx-wpanel' });
            pvxPreviewBind(panel);
            list.after(panel);
        }
        // "Playlist" heading: add the position
        const head = list.parentElement?.querySelector('h3');
        if (head && !head.querySelector('.pvx-wpos')) head.append(h('span', { class: 'pvx-wpos' }));
        const pos = head?.querySelector('.pvx-wpos');
        const posText = `${(w.cur + 1).toLocaleString()} / ${w.job.entries.length.toLocaleString()}`;
        if (pos && pos.textContent !== posText) pos.textContent = posText;
    }
    const sig = [w.from, w.to, w.cur, w.job.version, w.loading].join('|');
    if (panel.dataset.sig === sig) return;
    panel.dataset.sig = sig;

    const n = w.job.entries.length;
    const items = [];
    if (w.from > 0) items.push(h('button', { type: 'button', class: 'pvx-wmore', disabled: w.loading, onclick: () => pvwExtend(-1) },
        w.loading ? 'Loading…' : `▲ Show earlier (${w.from.toLocaleString()} more)`));
    for (let i = w.from; i < w.to; i++) items.push(pvwItem(w.job.videos[i], i === w.cur));
    if (w.to < n) items.push(h('button', { type: 'button', class: 'pvx-wmore', disabled: w.loading, onclick: () => pvwExtend(1) },
        w.loading ? 'Loading…' : `▼ Show more (${(n - w.to).toLocaleString()} more)`));
    const top = panel.scrollTop, oldH = panel.scrollHeight;
    if (pvxPrev && panel.contains(pvxPrev.host)) pvxPreviewStop();
    panel.replaceChildren(...items);
    if (!panel.dataset.scrolled) {
        const cur = panel.querySelector('.pvx-wcur');
        if (cur) { panel.scrollTop = cur.offsetTop - panel.offsetTop - 60; panel.dataset.scrolled = '1'; }
    } else if (w.scrollTo === 'top') {
        panel.scrollTop = top + (panel.scrollHeight - oldH);   // keep the same videos in view after adding earlier ones
        w.scrollTo = null;
    } else {
        panel.scrollTop = top;
    }
}

/** One side-list row, same markup / classes as the site's own playlist rows. */
function pvwItem(v, current) {
    const href = v.pending || v.missing ? null : pvxPlaylistVideoUrl(v, PVW.pid);
    const row = h(href ? 'a' : 'div', {
        class: 'pvx-witem flex gap-2 p-2 rounded-lg transition-colors cursor-pointer group hover:bg-[#1A1A1A]' + (current ? ' pvx-wcur' : '') + (v.missing ? ' pvx-wmissing' : ''),
        href: href || null, title: v.title,
    });
    row.append(
        h('div', { class: 'pvx-wnum flex-shrink-0 flex items-start justify-center pt-1' }, h('span', { class: 'text-xs font-semibold text-gray-500' }, (v.idx + 1).toLocaleString())),
        h('div', { class: 'pvx-wthumb w-32 flex-shrink-0 bg-[#0F0F0F] rounded overflow-hidden relative', dataset: pvxPreviewData(v) },
            v.thumb ? h('img', { src: v.thumb, alt: v.title, class: 'w-full h-full object-cover group-hover:scale-105 transition-transform duration-200', loading: 'lazy' }) : null,
            v.durSec ? h('div', { class: 'absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[10px] text-white' }, fmtDur(v.durSec)) : null,
            current ? h('div', { class: 'pvx-wnow' }, '▶ Now playing') : null),
        h('div', { class: 'flex-1 min-w-0' },
            v.pending ? h('div', { class: 'pvx-skel' }) : h('h4', { class: 'text-sm font-medium line-clamp-2 mb-1 text-white group-hover:text-blue-400' }, v.title),
            v.uploader ? h('p', { class: 'text-xs text-gray-400 mb-1' }, v.uploader) : null,
            v.views != null ? h('div', { class: 'flex items-center gap-2 text-xs text-gray-500' }, h('span', null, fmtNum(v.views) + ' views')) : null),
    );
    return row;
}

/* ───────────────────────── Auto-advance ───────────────────────── */

function pvwOnEnded(e) {
    const w = PVW;
    if (!S.autoNext || !w || !w.job || !e.target || e.target.tagName !== 'VIDEO') return;
    const url = pvwUrl(w.cur + 1);
    if (!url) return;
    const at = location.href;
    // Give the site a moment in case it moves on by itself (it does for the first 50).
    setTimeout(() => { if (location.href === at && PVW === w) location.href = url; }, 1500);
}
