// [HF][EMP][PLAB] History Tracker — History window
// Part of history_tracker.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install history_tracker.user.js.
// Version 4.0
//
// The 🕘 History window: modal shell, Searches / Torrents tabs, Settings & data (export / import),
// torrent details with saved presentations, and the cover zoom.
// Top-level code here only declares things: everything from the main script (settings, storage,
// log, el, …) is used inside functions, which run after the main script has loaded.

// ── Cover zoom (History window) ──────────────────────────────────────────
// Same behaviour as the thumbnail hover preview in Advanced Better filelist.

function setupCoverZoom() {
    var popup = el('div', { className: 'ht-zoom', 'data-ht-ui': '' });
    var status = el('div', { className: 'ht-zoom-status', text: 'Loading…' });
    var img = el('img', { alt: '', referrerpolicy: 'no-referrer' });
    popup.append(status, img);
    document.body.appendChild(popup);
    var timer = null;
    var current = null;
    var mouse = { x: 0, y: 0 };

    function position() {
        if (popup.style.display !== 'block') return;
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var maxW = Math.max(100, Math.max(mouse.x, vw - mouse.x) - ZOOM_MARGIN * 3);
        var maxH = vh - ZOOM_MARGIN * 2;
        if (img.naturalWidth) {
            var scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
            img.style.width = Math.round(img.naturalWidth * scale) + 'px';
            img.style.height = Math.round(img.naturalHeight * scale) + 'px';
        }
        var w = popup.offsetWidth;
        var h = popup.offsetHeight;
        var left = mouse.x + ZOOM_MARGIN;
        if (left + w > vw - ZOOM_MARGIN) left = mouse.x - w - ZOOM_MARGIN;
        var top = Math.min(Math.max(ZOOM_MARGIN, mouse.y - h / 2), vh - h - ZOOM_MARGIN);
        popup.style.left = Math.max(ZOOM_MARGIN, left) + 'px';
        popup.style.top = Math.max(ZOOM_MARGIN, top) + 'px';
    }

    function hide() {
        clearTimeout(timer);
        current = null;
        popup.style.display = 'none';
        img.removeAttribute('src');
    }

    function show(src) {
        var full = thumbToFullUrl(src) || src;
        status.textContent = 'Loading…';
        status.style.display = 'block';
        img.style.display = 'none';
        img.onload = function () { status.style.display = 'none'; img.style.display = 'block'; position(); };
        img.onerror = function () {
            if (img.src !== src && full !== src) { img.src = src; return; }   // full-size guess failed: show the original
            status.textContent = 'Couldn\'t load the image';
            position();
        };
        img.src = full;
        popup.style.display = 'block';
        position();
    }

    document.addEventListener('mouseover', function (ev) {
        var t = ev.target.closest && ev.target.closest('[data-ht-zoom]');
        if (!t || t === current || !getSetting('coverZoom')) return;
        hide();
        current = t;
        timer = setTimeout(function () { show(t.getAttribute('data-ht-zoom')); }, ZOOM_DELAY_MS);
    });
    document.addEventListener('mousemove', function (ev) {
        mouse.x = ev.clientX;
        mouse.y = ev.clientY;
        if (current) position();
    });
    document.addEventListener('mouseout', function (ev) {
        var t = ev.target.closest && ev.target.closest('[data-ht-zoom]');
        if (t && !t.contains(ev.relatedTarget)) hide();
    });
    return hide;
}
var hideZoom = function () {};

// ── Modal shell ──────────────────────────────────────────────────────────

var modalKeyHandler = null;
var modalEscHook = null;   // set while a sub-view (torrent details) is open: Esc goes back instead of closing
var modalCloseGuard = null; // set while settings have unsaved changes: returns false to keep the window open

function closeModal() {
    var bg = document.getElementById('ht-backdrop');
    if (bg) bg.remove();
    hideZoom();
    if (modalKeyHandler) document.removeEventListener('keydown', modalKeyHandler, true);
    modalKeyHandler = null;
    modalEscHook = null;
    modalCloseGuard = null;
}

/** ✕, Esc and clicking outside the window: ask first when there are unsaved settings */
function requestCloseModal() {
    if (modalCloseGuard && !modalCloseGuard()) return;
    closeModal();
}

/**
 * opts: { title, subtitle, tabs (element), headerButtons: [el], fullPage } → { body, actions (footer buttons), okBtn }
 * fullPage: the window is the whole page (offline viewer) — no close button, Esc / outside clicks don't close it.
 */
function openModal(opts) {
    closeModal();
    var bg = el('div', { id: 'ht-backdrop', 'data-ht-ui': '', className: opts.fullPage ? 'ht-fullpage' : null });
    var closeBtn = opts.fullPage ? null : el('button', { type: 'button', className: 'ht-btn ht-icon', title: 'Close (Esc)', 'aria-label': 'Close', text: '✕' });
    var header = el('div', { className: 'ht-header' }, [
        el('div', { className: 'ht-header-left' }, [
            el('h2', { text: opts.title }),
            el('span', { className: 'ht-subtitle', text: opts.subtitle || (SCRIPT_NAME + ' — ' + GROUP_NAMES[GROUP] + ' — v' + SCRIPT_VERSION) }),
        ]),
        el('div', { className: 'ht-header-right' }, (opts.headerButtons || []).concat(closeBtn ? [closeBtn] : [])),
    ]);
    var githubLink = el('a', { className: 'ht-github-link', href: 'https://github.com/edstagdh/Userscripts', target: '_blank', rel: 'noopener noreferrer', text: '🔗 View on GitHub' });
    var body = el('div', { className: 'ht-body' });
    var okBtn = el('button', { type: 'button', className: 'ht-ok' + (opts.fullPage ? ' ht-hidden' : ''), text: 'Close' });
    var actions = el('div', { className: 'ht-footer-actions' }, [okBtn]);
    var footer;
    if (opts.fullPage) {
        // offline viewer: GitHub link next to the header buttons; the footer only appears for "Save & reload"
        githubLink.classList.add('ht-btn');
        header.lastChild.appendChild(githubLink);
        footer = el('div', { className: 'ht-footer ht-hidden' }, [actions]);
    } else {
        footer = el('div', { className: 'ht-footer' }, [githubLink, actions]);
    }
    /** full page: show the footer only while one of its buttons is visible */
    function refreshFooter() {
        if (!opts.fullPage) return;
        var any = Array.prototype.some.call(actions.children, function (b) { return !b.classList.contains('ht-hidden'); });
        footer.classList.toggle('ht-hidden', !any);
    }
    var modal = el('div', { id: 'ht-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
        [header, opts.tabs || null, body, footer]);
    bg.appendChild(modal);
    if (closeBtn) closeBtn.addEventListener('click', requestCloseModal);
    okBtn.addEventListener('click', closeModal);   // also when it reads "Close without saving": that's the explicit choice
    bg.addEventListener('mousedown', function (ev) { if (ev.target === bg && !opts.fullPage) requestCloseModal(); });
    modalKeyHandler = function (ev) {
        if (ev.key !== 'Escape' || document.querySelector('#ht-cl-backdrop.active')) return;
        ev.stopPropagation();
        if (modalEscHook) modalEscHook(); else if (!opts.fullPage) requestCloseModal();
    };
    document.addEventListener('keydown', modalKeyHandler, true);
    document.body.appendChild(bg);
    return { body: body, actions: actions, okBtn: okBtn, refreshFooter: refreshFooter };
}

// ── Shared list pieces ───────────────────────────────────────────────────

function countPill(n) {
    return el('span', { className: 'ht-count' + (n > 1 ? ' ht-hot' : ''), title: n + ' visit' + (n === 1 ? '' : 's'), text: n + '×' });
}

function coverEl(src, cls) {
    if (!src) return el('div', { className: 'ht-cover ht-blank ' + (cls || ''), text: '–' });
    var img = el('img', { className: 'ht-cover ' + (cls || ''), src: src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', 'data-ht-zoom': src });
    img.addEventListener('error', function () { img.replaceWith(el('div', { className: 'ht-cover ht-blank', text: '–' })); });
    return img;
}

/** visits list: items = [[ts, seconds], …] or [ts, …], shown newest first */
function timesBox(items) {
    var list = items.map(function (x) { return Array.isArray(x) ? x : [x, 0]; }).sort(function (a, b) { return b[0] - a[0]; });
    var shown = list.slice(0, 100);
    var box = el('div', { className: 'ht-times' }, [
        el('ul', { className: 'ht-list' }, shown.map(function (x) {
            return el('li', {}, [el('span', {}, [fmtDateTime(x[0]), el('span', { className: 'ht-sub', text: ' · ' + ago(x[0]) + (x[1] ? ' · ' + fmtDur(x[1]) : '') })])]);
        })),
    ]);
    if (list.length > shown.length) box.appendChild(el('div', { className: 'ht-sub', text: '…and ' + (list.length - shown.length) + ' older' }));
    return box;
}

function toggleTimes(row, items, btn) {
    var open = row.querySelector('.ht-times');
    btn.classList.toggle('ht-active', !open);
    if (open) { open.remove(); return; }
    row.appendChild(timesBox(items));
}

function searchUrl(text, g) {
    return originOf(g) + GROUP_PATHS[g || GROUP].search + encodeURIComponent(text);
}

// ── Torrent details (History window and torrent pages) ───────────────────

function presentationSection(tid, g) {
    var arr = readPresentations(tid, g);
    var wrap = el('div');
    wrap.appendChild(el('div', { className: 'ht-label', text: 'Saved presentation' + (arr.length > 1 ? 's (' + arr.length + ')' : '') }));
    if (!arr.length) {
        wrap.appendChild(el('p', { className: 'ht-note', text: getSetting('savePresentation')
            ? 'None saved yet — it\'s saved the next time you open this torrent\'s page.'
            : 'Saving presentations is off (Settings & data).' }));
        return wrap;
    }
    var box = el('div', { className: 'ht-pres' });
    arr.slice().reverse().forEach(function (v, i) {
        var renderBtn = el('button', { type: 'button', className: 'ht-btn', text: '🖼 Render' });
        var isHtml = v.f === 'html';   // Pornolab: a cleaned copy of the first post, not BBCode
        var viewBtn = el('button', { type: 'button', className: 'ht-btn', text: isHtml ? '</> Source' : '</> BBCode' });
        var seen = v.l && v.l !== v.t ? ' · last seen ' + fmtDate(v.l) : '';
        var row = el('div', { className: 'ht-row' }, [
            el('div', { className: 'ht-main' }, [
                el('div', { style: 'color:#e0e0e0;font-weight:600', text: (i === 0 ? 'Latest · ' : '') + fmtDateTime(v.t) }),
                el('div', { className: 'ht-sub', text: fmtBytes(v.n) + (isHtml ? ' · first post' : ' of BBCode') + seen }),
            ]),
            el('div', { className: 'ht-side' }, [renderBtn, viewBtn]),
        ]);
        var out = null;
        var mode = null;
        function showOut(next) {
            if (out) { out.remove(); out = null; }
            hideZoom();
            mode = mode === next ? null : next;
            renderBtn.classList.toggle('ht-active', mode === 'render');
            viewBtn.classList.toggle('ht-active', mode === 'code');
            if (!mode) return;
            if (mode === 'code') {
                out = el('textarea', { className: 'ht-code', readonly: true, spellcheck: 'false' });
                out.value = 'Loading…';
            } else {
                out = el('div', { className: 'ht-render', text: 'Loading…' });
            }
            row.appendChild(out);
            var target = out;
            var wanted = mode;
            decodeVersion(v).then(function (t) {
                if (out !== target) return;
                if (wanted === 'code') target.value = t;
                else target.replaceChildren(isHtml ? renderSafeHtml(t) : renderBBCode(t));
            }).catch(function () {
                if (wanted === 'code') target.value = 'Couldn\'t read the saved presentation.';
                else target.textContent = 'Couldn\'t read the saved presentation.';
            });
        }
        renderBtn.addEventListener('click', function () { showOut('render'); });
        viewBtn.addEventListener('click', function () { showOut('code'); });
        box.appendChild(row);
    });
    wrap.appendChild(box);
    return wrap;
}

/** torrent details (stats, visits, saved presentations); onForgotten() runs after "Forget this torrent" */
function buildTorrentDetails(tid, g, onForgotten, showTitle) {
    g = g || GROUP;
    var e = torrents(g).get(tid);
    var title = e && e.t ? e.t : 'Torrent #' + tid;
    var body = el('div');
    if (showTitle) {
        body.appendChild(el('div', { className: 'ht-detail-title' }, [
            crossSite() || g !== GROUP ? siteTag(g) : null,
            el('a', linkProps(g, torrentUrl(g, tid), { title: 'Open the torrent page', text: title })),
            el('span', { className: 'ht-sub', text: ' #' + tid }),
        ]));
    }
    if (!e) {
        body.appendChild(el('div', { className: 'ht-empty', text: 'No visits recorded for this torrent.' }));
        return body;
    }
    body.appendChild(el('div', { className: 'ht-torrent-head' }, [
        e.cv ? coverEl(e.cv) : null,
        el('div', { className: 'ht-stats' }, [
            el('div', { className: 'ht-stat' }, [el('b', { text: String(e.c) }), el('span', { text: 'visits' + (g !== GROUP ? ' on ' + GROUP_NAMES[g] : '') })]),
            el('div', { className: 'ht-stat' }, [el('b', { text: fmtDate(e.f) }), el('span', { text: 'first visit' })]),
            el('div', { className: 'ht-stat' }, [el('b', { text: fmtDate(e.l) }), el('span', { text: 'last visit' })]),
            el('div', { className: 'ht-stat' }, [el('b', { text: fmtDur(totalSeconds(e)) || '–' }), el('span', { text: 'time on page, total' })]),
        ]),
    ]));
    body.appendChild(el('div', { className: 'ht-label', text: 'Visits' }));
    body.appendChild(timesBox(e.v || []));
    if (e.c > (e.v || []).length) body.appendChild(el('p', { className: 'ht-note', text: 'Only the last ' + MAX_ITEM_VISITS + ' visit times are kept; the count includes older ones.' }));
    if ((g || GROUP) === 'plab') body.appendChild(plabTorrentSection(tid, g, e));
    body.appendChild(presentationSection(tid, g));
    var forget = el('button', { type: 'button', className: 'ht-btn ht-danger', text: 'Forget this torrent' });
    forget.addEventListener('click', function () {
        if (!confirm('Forget all ' + e.c + ' visits of "' + title + '" (and its saved presentation)?')) return;
        forgetTorrent(tid, g);
        if (onForgotten) onForgotten();
    });
    body.appendChild(el('div', { className: 'ht-buttons' }, [forget]));
    return body;
}

/** details on their own (buttons on a torrent page) */
function openTorrentHistory(tid, g, onChange) {
    g = g || GROUP;
    var e = torrents(g).get(tid);
    var m = openModal({ title: '👁 ' + (e && e.t ? e.t : 'Torrent #' + tid), subtitle: g !== GROUP ? 'Seen on ' + GROUP_NAMES[g] + ' — #' + tid : null });
    m.body.appendChild(buildTorrentDetails(tid, g, function () {
        closeModal();
        if (onChange) onChange();
        markLinks();
    }, g !== GROUP));
}

/** Pornolab: size / date / status from the download section, the .torrent link and the saved file list */
function plabTorrentSection(tid, g, e) {
    var x = e.x || {};
    var wrap = el('div');
    wrap.appendChild(el('div', { className: 'ht-label', text: 'Torrent' }));
    var facts = [];
    if (x.sz) facts.push(['Size', x.sz]);
    if (x.reg) facts.push(['Registered', x.reg]);
    if (x.st) facts.push(['Status', x.st]);
    var dl = downloadUrl(g, tid);
    var row = el('div', { className: 'ht-facts' }, facts.map(function (f) {
        return el('span', { className: 'ht-fact' }, [el('span', { className: 'ht-sub', text: f[0] + ' ' }), f[1]]);
    }));
    if (dl) row.appendChild(el('a', { className: 'ht-btn', href: dl, target: '_blank', rel: 'noopener', title: 'Needs you to be logged in to Pornolab', text: '⬇ Download .torrent' }));
    wrap.appendChild(row);
    var fl = readFileList(tid, g);
    if (!fl) {
        wrap.appendChild(el('p', { className: 'ht-note', text: getSetting('saveFileList')
            ? 'No file list saved yet — it\'s saved the next time you open this topic.'
            : 'Saving file lists is off (Settings & data).' }));
        return wrap;
    }
    var btn = el('button', { type: 'button', className: 'ht-btn', text: '📁 File list · ' + fl.n + ' file' + (fl.n === 1 ? '' : 's') + ' · ' + fmtSize(fl.b) });
    var note = el('span', { className: 'ht-sub', text: ' saved ' + ago(fl.t) });
    var holder = el('div');
    btn.addEventListener('click', function () {
        if (holder.firstChild) { holder.replaceChildren(); btn.classList.remove('ht-active'); return; }
        btn.classList.add('ht-active');
        holder.replaceChildren(el('div', { className: 'ht-sub', text: 'Loading…' }));
        decodeVersion(fl).then(function (json) {
            holder.replaceChildren(el('div', { className: 'ht-files-box' }, [renderFileTree(JSON.parse(json))]));
        }).catch(function (err) {
            log.error('Reading the saved file list of #' + tid + ' failed', err);
            holder.replaceChildren(el('div', { className: 'ht-sub', text: 'Couldn\'t read the saved file list.' }));
        });
    });
    wrap.appendChild(el('div', { className: 'ht-buttons', style: 'margin-top:8px' }, [btn, note]));
    wrap.appendChild(holder);
    return wrap;
}

function totalSeconds(e) {
    return (e.v || []).reduce(function (a, x) { return a + (x[1] || 0); }, 0);
}

// ── History window (site menu) ───────────────────────────────────────────

function openHistory(tab, filter) {
    var tabsEl = el('div', { className: 'ht-tabs', role: 'tablist' });
    var clBtn = el('button', { type: 'button', className: 'ht-btn', title: 'What\'s new in History Tracker', text: '📜 Changelog' });
    clBtn.addEventListener('click', showChangelogModal);
    var m = openModal({
        title: '🕘 History', tabs: tabsEl, headerButtons: [clBtn], fullPage: IS_VIEWER,
        subtitle: SCRIPT_NAME + (IS_VIEWER ? ' — offline viewer' : '') + ' — ' +
            (crossSite() ? GROUPS.map(function (g) { return GROUP_NAMES[g]; }).join(' + ') : GROUP_NAMES[GROUP]) + ' — v' + SCRIPT_VERSION,
    });
    var TABS = [['searches', 'Searches'], ['torrents', 'Torrents'], ['settings', 'Settings & data']];
    var buttons = {};
    // the tab's list stays in `pane` while a torrent's details are shown in `detail`,
    // so "Back" returns to exactly the same filter, sort, loaded rows and scroll position
    var pane = el('div');
    var detail = el('div', { className: 'ht-hidden' });
    m.body.append(pane, detail);
    var listScroll = 0;
    var tabsBack = null;   // offline viewer: the "Back to the list" button while it sits in the tabs row

    // Settings: "Save & reload" shows up next to Close once something differs from what's saved
    var saveBtn = el('button', { type: 'button', className: 'ht-ok ht-hidden', text: '💾 Save & reload' });
    m.actions.insertBefore(saveBtn, m.okBtn);
    var settingsDirty = false;
    var saveSettings = null;
    saveBtn.addEventListener('click', function () { if (saveSettings) saveSettings(); });
    function setSettingsDirty(dirty, saveFn) {
        settingsDirty = dirty;
        saveSettings = saveFn || saveSettings;
        saveBtn.classList.toggle('ht-hidden', !dirty);
        m.okBtn.textContent = dirty ? 'Close without saving' : 'Close';
        m.okBtn.classList.toggle('ht-discard', dirty);
        modalCloseGuard = dirty ? function () { return confirm('You have unsaved settings. Close without saving them?'); } : null;
        m.refreshFooter();
    }

    function counts() {
        var nS = 0;
        var nT = 0;
        viewGroups().forEach(function (g) { nS += Object.keys(readSearches(g)).length; nT += torrents(g).size; });
        buttons.searches.textContent = '🔎 Searches (' + nS + ')';
        buttons.torrents.textContent = '👁 Torrents (' + nT + ')';
    }

    function closeDetails() {
        if (detail.classList.contains('ht-hidden')) return;
        hideZoom();
        detail.replaceChildren();
        if (tabsBack) { tabsBack.remove(); tabsBack = null; }
        detail.classList.add('ht-hidden');
        pane.classList.remove('ht-hidden');
        m.body.scrollTop = listScroll;
        modalEscHook = null;
    }

    function openDetails(tid, g, afterForget) {
        listScroll = m.body.scrollTop;
        hideZoom();
        var back = el('button', { type: 'button', className: 'ht-btn ht-back', text: '← Back to the list' });
        back.addEventListener('click', closeDetails);
        var hint = el('span', { className: 'ht-sub', text: 'or press Esc' });
        var details = buildTorrentDetails(tid, g, function () { closeDetails(); if (afterForget) afterForget(); }, true);
        if (IS_VIEWER) {
            // offline viewer: in the tabs row, so the details get the whole height of the page
            if (tabsBack) tabsBack.remove();
            tabsBack = el('span', { className: 'ht-tabs-back' }, [back, hint]);
            tabsEl.appendChild(tabsBack);
            detail.replaceChildren(details);
        } else {
            detail.replaceChildren(el('div', { className: 'ht-backbar' }, [back, hint]), details);
        }
        pane.classList.add('ht-hidden');
        detail.classList.remove('ht-hidden');
        m.body.scrollTop = 0;
        modalEscHook = closeDetails;
    }

    function show(name, f) {
        if (settingsDirty) {
            if (name === 'settings') return;
            if (!confirm('You have unsaved settings. Leave Settings without saving them?')) return;
            setSettingsDirty(false);
        }
        closeDetails();
        Object.keys(buttons).forEach(function (k) { buttons[k].setAttribute('aria-selected', String(k === name)); });
        hideZoom();
        pane.replaceChildren();
        m.body.scrollTop = 0;
        if (name === 'searches') renderSearchesTab(pane, f || '', counts);
        else if (name === 'torrents') renderTorrentsTab(pane, f || '', counts, openDetails);
        else renderSettingsTab(pane, setSettingsDirty);
    }

    TABS.forEach(function (t) {
        var b = el('button', { type: 'button', role: 'tab', className: 'ht-btn', text: t[1] });
        b.addEventListener('click', function () { show(t[0]); });
        buttons[t[0]] = b;
        tabsEl.appendChild(b);
    });
    buttons.settings.textContent = '⚙️ Settings & data';
    counts();
    show(tab || 'searches', filter);
}

/** generic filter + sort (+ site chips) + list used by the Searches and Torrents tabs */
function renderListTab(body, opts) {
    var input = el('input', { type: 'search', placeholder: opts.placeholder, autocomplete: 'off', spellcheck: 'false' });
    input.value = opts.filter || '';
    var sortSel = el('select', { 'aria-label': 'Sort' });
    opts.sorts.forEach(function (s) { sortSel.appendChild(el('option', { value: s[0], text: s[1] })); });
    var chipsEl = crossSite() ? el('div', { className: 'ht-chips', role: 'group', 'aria-label': 'Site' }) : null;
    var top = el('div');
    var list = el('div', { className: 'ht-rows' });
    var more = el('div', { className: 'ht-more' });
    body.append(el('div', { className: 'ht-toolbar' }, [input, chipsEl, sortSel]), top, list, more);

    var items = [];
    var shown = 0;
    var matches = [];
    var site = crossSite() ? (getSetting('historySite') || 'all') : GROUP;
    if (site !== 'all' && GROUPS.indexOf(site) === -1) site = 'all';

    function drawChips() {
        if (!chipsEl) return;
        chipsEl.replaceChildren();
        [['all', 'All']].concat(GROUPS.map(function (g) { return [g, GROUP_SHORT[g]]; })).forEach(function (c) {
            var n = c[0] === 'all' ? items.length : items.filter(function (it) { return it.g === c[0]; }).length;
            var b = el('button', {
                type: 'button', className: 'ht-btn' + (site === c[0] ? ' ht-active' : ''),
                title: c[0] === 'all' ? 'Both sites' : GROUP_NAMES[c[0]] + ' only', text: c[1] + ' (' + n + ')',
            });
            b.addEventListener('click', function () { site = c[0]; setSetting('historySite', site); drawChips(); draw(); });
            chipsEl.appendChild(b);
        });
    }

    function reload() { items = opts.items(); drawChips(); draw(); }

    function draw() {
        var q = cleanText(input.value).toLowerCase();
        matches = items.filter(function (it) { return (site === 'all' || it.g === site) && (!q || opts.match(it, q)); });
        matches.sort(opts.sortFns[sortSel.value]);
        top.replaceChildren();
        if (opts.top) { var t = opts.top(cleanText(input.value), items); if (t) top.appendChild(t); }
        list.replaceChildren();
        shown = 0;
        if (!matches.length) {
            list.appendChild(el('div', { className: 'ht-empty', text: items.length ? 'Nothing matches.' : opts.emptyText }));
            more.replaceChildren();
            return;
        }
        page();
    }

    function page() {
        matches.slice(shown, shown + LIST_PAGE).forEach(function (it) { list.appendChild(opts.row(it, reload)); });
        shown = Math.min(matches.length, shown + LIST_PAGE);
        more.replaceChildren();
        if (shown < matches.length) {
            var b = el('button', { type: 'button', className: 'ht-btn', text: 'Show more (' + (matches.length - shown) + ' left)' });
            b.addEventListener('click', page);
            more.appendChild(b);
        }
    }

    var t;
    input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(draw, 120); });
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && opts.onEnter) opts.onEnter(cleanText(input.value)); });
    sortSel.addEventListener('change', draw);
    reload();
    setTimeout(function () { input.focus(); }, 0);
}

var SORTS = {
    last: function (a, b) { return b.l - a.l; },
    count: function (a, b) { return b.c - a.c || b.l - a.l; },
    first: function (a, b) { return a.f - b.f; },
};

/** "12× on HF, 3× on EMP" (or just "12×" when only this site is shown) */
function perSiteCounts(found) {
    if (!crossSite()) return found.map(function (x) { return x.c + '×'; }).join(', ');
    return found.map(function (x) { return x.c + '× on ' + GROUP_SHORT[x.g]; }).join(', ');
}

function renderSearchesTab(body, filter, onChange) {
    renderListTab(body, {
        filter: filter,
        placeholder: 'Find a past search… (Enter searches this site)',
        emptyText: 'No searches recorded yet.',
        sorts: [['last', 'Most recent'], ['count', 'Most repeated'], ['first', 'Oldest first'], ['az', 'A → Z']],
        sortFns: {
            last: SORTS.last, count: SORTS.count, first: SORTS.first,
            az: function (a, b) { return (a.lb || '').localeCompare(b.lb || '', undefined, { sensitivity: 'base' }); },
        },
        items: function () {
            var out = [];
            viewGroups().forEach(function (g) {
                var all = readSearches(g);
                Object.keys(all).forEach(function (k) { var s = all[k]; s.key = k; s.g = g; out.push(s); });
            });
            return out;
        },
        match: function (s, q) {
            return (s.lb || '').toLowerCase().indexOf(q) !== -1 || s.key.indexOf(q) !== -1;
        },
        top: function (text, items) {
            if (!text) return null;
            var key = 'text:' + text.toLowerCase();
            var found = items.filter(function (s) { return s.key === key; });
            var last = Math.max.apply(null, [0].concat(found.map(function (s) { return s.l; })));
            return el('div', { className: 'ht-action' + (found.length ? '' : ' ht-new') }, [
                el('span', {}, found.length
                    ? ['You searched “', el('b', { text: text }), '” ' + perSiteCounts(found) + ' · last ' + ago(last)]
                    : ['You never searched exactly “', el('b', { text: text }), '”' + (crossSite() ? ' on either site' : '')]),
                IS_VIEWER
                    ? el('span', { className: 'ht-buttons', style: 'margin:0' }, GROUPS.map(function (g) {
                        return el('a', linkProps(g, searchUrl(text, g), { className: 'ht-ok', text: '🔎 Search ' + GROUP_NAMES[g] }));
                    }))
                    : el('a', { className: 'ht-ok', href: searchUrl(text), text: '🔎 Search ' + GROUP_NAMES[GROUP] }),
            ]);
        },
        onEnter: function (text) { if (text && !IS_VIEWER) location.href = searchUrl(text); },
        row: function (s, reload) {
            var timesBtn = el('button', { type: 'button', className: 'ht-btn ht-icon', title: 'When you ran it', text: '🕘' });
            var del = el('button', { type: 'button', className: 'ht-btn ht-icon ht-danger', title: 'Forget this search', text: '✕' });
            var href = s.u ? onDomainOf(s.g, s.u) : searchUrl(s.tx || '', s.g);
            var row = el('div', { className: 'ht-row' }, [
                countPill(s.c),
                el('div', { className: 'ht-main' }, [
                    el('div', { className: 'ht-titleline' }, [
                        crossSite() ? siteTag(s.g) : null,
                        el('a', linkProps(s.g, href, { className: 'ht-title', title: 'Run again on ' + GROUP_NAMES[s.g] + ' · last ' + fmtDateTime(s.l), text: s.lb || s.tx || s.key })),
                    ]),
                    el('div', { className: 'ht-sub', text: 'last ' + ago(s.l) + (s.c > 1 ? ' · first ' + fmtDate(s.f) : '') }),
                ]),
                el('div', { className: 'ht-side' }, [timesBtn, del]),
            ]);
            timesBtn.addEventListener('click', function () { toggleTimes(row, s.v || [], timesBtn); });
            del.addEventListener('click', function () {
                if (!confirm('Forget the search “' + (s.lb || s.key) + '” on ' + GROUP_NAMES[s.g] + ' (' + s.c + ' runs)?')) return;
                forgetSearch(s.key, s.g);
                reload();
                onChange();
            });
            return row;
        },
    });
}

function renderTorrentsTab(body, filter, onChange, openDetails) {
    renderListTab(body, {
        filter: filter,
        placeholder: 'Title or torrent id…',
        emptyText: 'No torrent pages recorded yet.',
        sorts: [['last', 'Most recent'], ['count', 'Most visited'], ['first', 'Oldest first'], ['az', 'A → Z'], ['id', 'Torrent id']],
        sortFns: {
            last: SORTS.last, count: SORTS.count, first: SORTS.first,
            az: function (a, b) { return (a.t || '').localeCompare(b.t || '', undefined, { sensitivity: 'base' }); },
            id: function (a, b) { return b.id - a.id; },
        },
        items: function () {
            var out = [];
            viewGroups().forEach(function (g) {
                torrents(g).forEach(function (e, id) { out.push(Object.assign({ id: id, g: g }, e)); });
            });
            return out;
        },
        match: function (t, q) {
            if (/^\d+$/.test(q)) return String(t.id).indexOf(q) === 0;
            return (t.t || '').toLowerCase().indexOf(q) !== -1;
        },
        row: function (t, reload) {
            var timesBtn = el('button', { type: 'button', className: 'ht-btn ht-icon', title: 'When you opened it', text: '🕘' });
            var infoBtn = el('button', { type: 'button', className: 'ht-btn ht-icon', title: 'Details & saved presentation (render it here)', text: 'ℹ️' });
            var del = el('button', { type: 'button', className: 'ht-btn ht-icon ht-danger', title: 'Forget this torrent', text: '✕' });
            var row = el('div', { className: 'ht-row' }, [
                coverEl(t.cv),
                el('div', { className: 'ht-main' }, [
                    el('div', { className: 'ht-titleline' }, [
                        crossSite() ? siteTag(t.g) : null,
                        el('a', linkProps(t.g, torrentUrl(t.g, t.id), { className: 'ht-title', text: t.t || 'Torrent #' + t.id })),
                    ]),
                    el('div', { className: 'ht-sub', text: '#' + t.id + ' · last ' + ago(t.l) + (t.c > 1 ? ' · first ' + fmtDate(t.f) : '') }),
                ]),
                el('div', { className: 'ht-side' }, [countPill(t.c), timesBtn, infoBtn, del]),
            ]);
            timesBtn.addEventListener('click', function () { toggleTimes(row, t.v || [], timesBtn); });
            function afterForget() { reload(); onChange(); markLinks(); }
            infoBtn.addEventListener('click', function () { openDetails(t.id, t.g, afterForget); });
            del.addEventListener('click', function () {
                if (!confirm('Forget all ' + t.c + ' visits of "' + (t.t || '#' + t.id) + '" on ' + GROUP_NAMES[t.g] + ' (and its saved presentation)?')) return;
                forgetTorrent(t.id, t.g);
                afterForget();
            });
            return row;
        },
    });
}

// ── Settings & data tab ──────────────────────────────────────────────────

var CHECKS = [
    ['Record', [
        ['trackTorrents', 'Torrent page visits'],
        ['trackSearches', 'Searches'],
        ['timeOnPage', 'Time spent on torrent pages'],
        ['saveCover', 'Torrent cover image URL'],
    ]],
    ['Show', [
        ['markVisited', 'Mark torrent links I\'ve opened'],
        ['hideVisited', 'Hide torrents I\'ve opened from lists (results, top 10, collages, user pages)'],
        ['torrentButton', '👁 history button on torrent pages'],
        ['searchToast', 'Notice when I repeat a search'],
        ['searchBoxHint', '"Searched before" hint by the search box'],
        ['coverZoom', 'Enlarge covers on hover (History window)'],
        ['crossSite', 'Show all sites\' history together (HappyFappy, Empornium, Pornolab)'],
    ]],
];

function numberField(label, name, min, max) {
    var input = el('input', { type: 'number', min: String(min), max: String(max), step: '1' });
    input.value = getSetting(name);
    return { input: input, field: el('label', { className: 'ht-field' }, [el('span', { text: label }), input]) };
}

function renderSettingsTab(body, setDirty) {
    var boxes = {};
    function checks(group) {
        body.appendChild(el('div', { className: 'ht-label', text: group[0] }));
        var grid = el('div', { className: 'ht-grid' });
        group[1].forEach(function (c) {
            var cb = el('input', { type: 'checkbox' });
            cb.checked = !!getSetting(c[0]);
            boxes[c[0]] = cb;
            grid.appendChild(el('label', { className: 'ht-check' }, [cb, el('span', { text: c[1] })]));
        });
        body.appendChild(grid);
    }
    CHECKS.forEach(checks);

    var styleSel = el('select');
    [['badge', '👁 badge after the link'], ['dim', 'Dim the link'], ['both', 'Badge + dim']].forEach(function (o) {
        var opt = el('option', { value: o[0], text: o[1] });
        if (getSetting('markStyle') === o[0]) opt.selected = true;
        styleSel.appendChild(opt);
    });
    var dedupe = numberField('Don\'t count a reload within (seconds)', 'dedupeSeconds', 0, 3600);
    body.appendChild(el('div', { className: 'ht-grid', style: 'margin-top:10px' }, [
        el('label', { className: 'ht-field' }, [el('span', { text: 'How visited links look' }), styleSel]),
        dedupe.field,
    ]));

    // presentation
    checks(['Presentation', [
        ['savePresentation', 'Save each torrent\'s presentation (BBCode on HF / EMP, the first post on Pornolab)'],
        ['saveFileList', 'Pornolab: save the file list (one extra request, like the site\'s "Список файлов" button)'],
    ]]);
    var modeSel = el('select');
    [['latest', 'Only from my latest visit'], ['every', 'Every visit (a new copy when it changed)']].forEach(function (o) {
        var opt = el('option', { value: o[0], text: o[1] });
        if (getSetting('presentationMode') === o[0]) opt.selected = true;
        modeSel.appendChild(opt);
    });
    var versions = numberField('Copies kept per torrent ("every visit")', 'presentationVersions', 1, 100);
    var maxT = numberField('Keep presentations for this many recent torrents (0 = all)', 'presentationMaxTorrents', 0, 100000);
    body.appendChild(el('div', { className: 'ht-grid', style: 'margin-top:10px;gap:10px 18px' }, [
        el('label', { className: 'ht-field' }, [el('span', { text: 'Keep' }), modeSel]),
        versions.field,
        maxT.field,
    ]));
    body.appendChild(el('p', { className: 'ht-note', text:
        'Presentations are stored compressed (about a quarter of their size). Tampermonkey loads all of this script\'s storage on every page, ' +
        'so keep the total under a few MB — the limit above keeps it in check.' }));

    body.appendChild(el('div', { className: 'ht-label', text: 'Advanced' }));
    var logSel = el('select');
    [['off', 'Off'], ['error', 'Errors only'], ['warn', 'Warnings and errors (default)'], ['info', 'Info — what was recorded and saved'], ['debug', 'Debug — everything']].forEach(function (o) {
        var opt = el('option', { value: o[0], text: o[1] });
        if ((getSetting('logLevel') || 'warn') === o[0]) opt.selected = true;
        logSel.appendChild(opt);
    });
    body.appendChild(el('div', { className: 'ht-grid' }, [
        el('label', { className: 'ht-field' }, [el('span', { text: 'Console logging (browser dev tools, messages start with ' + LOG_PREFIX + ')' }), logSel]),
    ]));

    function numberValue(f, name) {
        var n = parseInt(f.input.value, 10);
        return isFinite(n) && n >= 0 ? n : DEFAULT_SETTINGS[name];
    }

    /** everything the form would save, as one comparable value */
    function formState() {
        var st = {};
        Object.keys(boxes).forEach(function (k) { st[k] = boxes[k].checked; });
        st.markStyle = styleSel.value;
        st.presentationMode = modeSel.value;
        st.logLevel = logSel.value;
        st.dedupeSeconds = numberValue(dedupe, 'dedupeSeconds');
        st.presentationVersions = numberValue(versions, 'presentationVersions');
        st.presentationMaxTorrents = numberValue(maxT, 'presentationMaxTorrents');
        return st;
    }

    function saveAndReload() {
        var st = formState();
        Object.keys(st).forEach(function (k) { setSetting(k, st[k]); });
        log.info('Settings saved — reloading', st);
        modalCloseGuard = null;
        location.reload();
    }

    var saved = JSON.stringify(formState());
    var formArea = el('div');
    while (body.firstChild) formArea.appendChild(body.firstChild);   // the settings form built above
    body.appendChild(formArea);
    function checkDirty() {
        var dirty = JSON.stringify(formState()) !== saved;
        if (setDirty) setDirty(dirty, saveAndReload);
    }
    formArea.addEventListener('input', checkDirty);
    formArea.addEventListener('change', checkDirty);
    body.appendChild(el('p', { className: 'ht-note', text: 'Changes are applied with "💾 Save & reload" at the bottom of this window.' }));

    // data: one block per site (the site you're on; both in the offline viewer)
    (IS_VIEWER ? GROUPS : [GROUP]).forEach(function (g) { body.appendChild(siteDataBlock(g)); });

    var exp = el('button', { type: 'button', className: 'ht-btn', text: '⬇️ Export JSON' });
    var imp = el('button', { type: 'button', className: 'ht-btn', text: '⬆️ Import JSON…' });
    var file = el('input', { type: 'file', accept: '.json,application/json', className: 'ht-hidden' });
    exp.addEventListener('click', exportData);
    imp.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', function () { if (file.files[0]) importData(file.files[0]); });
    body.appendChild(el('div', { className: 'ht-label', text: 'Backup' }));
    body.appendChild(el('div', { className: 'ht-buttons', style: 'margin-top:0' }, [exp, imp, file]));
    body.appendChild(el('p', { className: 'ht-note', text:
        'Export makes a backup of all sites. Importing replaces the history of the sites in the file; ' +
        'exports from the older "[HF] Visit Tracker" script are accepted too.' }));
}

/** stats + delete buttons for one site's stored data */
function siteDataBlock(g) {
    var keys = groupKeys(g);
    var pres = keysOf(g).pres;
    var files = keysOf(g).files;
    var histBytes = 0;
    var presBytes = 0;
    var presCount = 0;
    keys.forEach(function (k) {
        var size = JSON.stringify(GM_getValue(k, null)).length;
        if (k.indexOf(pres) === 0) { presBytes += size; presCount++; }
        else if (k.indexOf(files) === 0) presBytes += size;
        else histBytes += size;
    });
    var logs = logKeys(g);
    var visits = logs.reduce(function (a, k) { var v = GM_getValue(k, []); return a + (Array.isArray(v) ? v.length : 0); }, 0);
    var wrap = el('div');
    wrap.appendChild(el('div', { className: 'ht-label', text: 'Your ' + GROUP_NAMES[g] + ' data (Tampermonkey, this browser only)' }));
    wrap.appendChild(el('div', { className: 'ht-stats' }, [
        el('div', { className: 'ht-stat' }, [el('b', { text: torrents(g).size + ' / ' + Object.keys(readSearches(g)).length }), el('span', { text: 'torrents / searches' })]),
        el('div', { className: 'ht-stat' }, [el('b', { text: String(visits) }), el('span', { text: 'visits logged' + (logs.length ? ' since ' + logs[0].slice(keysOf(g).log.length) : '') })]),
        el('div', { className: 'ht-stat' }, [el('b', { text: fmtBytes(histBytes) }), el('span', { text: 'history storage' })]),
        el('div', { className: 'ht-stat' }, [el('b', { text: fmtBytes(presBytes) }), el('span', { text: presCount + ' saved presentation' + (presCount === 1 ? '' : 's') })]),
    ]));
    var clrP = el('button', { type: 'button', className: 'ht-btn ht-danger', text: 'Delete ' + GROUP_SHORT[g] + ' saved presentations' });
    var clr = el('button', { type: 'button', className: 'ht-btn ht-danger', text: 'Delete all ' + GROUP_NAMES[g] + ' history' });
    clrP.addEventListener('click', function () {
        if (!confirm('Delete all ' + presCount + ' saved ' + GROUP_NAMES[g] + ' presentations? Your visit history is kept.')) return;
        presKeys(g).forEach(function (k) { GM_deleteValue(k); });
        GM_listValues().forEach(function (k) { if (k.indexOf(files) === 0) GM_deleteValue(k); });
        log.info('Deleted ' + presCount + ' saved ' + GROUP_NAMES[g] + ' presentations');
        location.reload();
    });
    clr.addEventListener('click', function () {
        if (!confirm('Delete your whole ' + GROUP_NAMES[g] + ' history (torrents, searches, presentations and the visit log)? Settings are kept. This can\'t be undone — export first if unsure.')) return;
        groupKeys(g).forEach(function (k) { GM_deleteValue(k); });
        log.info('Deleted all ' + GROUP_NAMES[g] + ' history');
        location.reload();
    });
    wrap.appendChild(el('div', { className: 'ht-buttons' }, [clrP, clr]));
    return wrap;
}

function exportData() {
    var values = {};
    GM_listValues().filter(function (k) { return DATA_KEY_RE.test(k); }).forEach(function (k) { values[k] = GM_getValue(k, null); });
    var data = { app: 'history-tracker', format: 2, version: SCRIPT_VERSION, exported_at: new Date().toISOString(), values: values };
    var a = el('a', {
        href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })),
        download: 'history-tracker-' + new Date().toISOString().slice(0, 10) + '.json',
    });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    log.info('Exported ' + Object.keys(values).length + ' storage entries');
}

/** old "[HF] Visit Tracker" 2.0 export keys → History Tracker keys (that script was HappyFappy only) */
function mapLegacyKey(k) {
    var m = k.match(/^hfvt_tor_(\d+)$/);
    if (m) return 'ht_hf_tor_' + m[1];
    if (k === 'hfvt_searches') return 'ht_hf_searches';
    m = k.match(/^hfvt_log_(\d{4}-\d{2})$/);
    if (m) return 'ht_hf_log_' + m[1];
    return null;
}

function importData(f) {
    var reader = new FileReader();
    reader.onload = function () {
        var data;
        try { data = JSON.parse(reader.result); } catch (e) { log.error('Import: not valid JSON', e); alert('That file isn\'t valid JSON.'); return; }
        if (!data || !data.values || typeof data.values !== 'object' || (data.app !== 'history-tracker' && data.app !== 'hf-visit-tracker')) {
            log.error('Import: not a History Tracker export', data && data.app);
            alert('That isn\'t a History Tracker export.');
            return;
        }
        var values = {};
        Object.keys(data.values).forEach(function (k) {
            var nk = data.app === 'hf-visit-tracker' ? mapLegacyKey(k) : (DATA_KEY_RE.test(k) ? k : null);
            if (nk) values[nk] = data.values[k];
        });
        var groups = {};
        Object.keys(values).forEach(function (k) { groups[k.split('_')[1]] = true; });
        var names = Object.keys(groups).map(function (g) { return GROUP_NAMES[g] || g; });
        if (!names.length) { alert('The file has no history in it.'); return; }
        var nT = 0;
        var nS = 0;
        Object.keys(values).forEach(function (k) {
            if (/_tor_\d+$/.test(k)) nT += Object.keys(values[k] || {}).length;
            if (/_searches$/.test(k)) nS += Object.keys(values[k] || {}).length;
        });
        if (!confirm('Replace your ' + names.join(' + ') + ' history in this browser with the file\'s (' + nT + ' torrents, ' + nS + ' searches, exported ' +
            (data.exported_at ? fmtDate(Date.parse(data.exported_at)) : '?') + ')?')) return;
        GM_listValues().forEach(function (k) {
            var m = k.match(/^ht_(hf|emp)_/);
            if (m && groups[m[1]] && DATA_KEY_RE.test(k)) GM_deleteValue(k);
        });
        Object.keys(values).forEach(function (k) { GM_setValue(k, values[k]); });
        log.info('Imported ' + nT + ' torrents and ' + nS + ' searches (' + names.join(' + ') + ')' + (data.app === 'hf-visit-tracker' ? ' from an old [HF] Visit Tracker export' : ''));
        location.reload();
    };
    reader.onerror = function () { log.error('Import: couldn\'t read the file', reader.error); };
    reader.readAsText(f);
}
