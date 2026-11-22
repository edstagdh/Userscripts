// [PBB] Cleaner Search — "All results" popup: loads every page of the current search into one
// full-window view (grid of cards or a slim list), one page at a time with a pause between
// pages, stopping every 10 pages. Results can be filtered by several keywords; durations match
// in either form (00:02:42 / 2:42 / 2 min 42 s).
// Part of pbb_cleaner_search.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install pbb_cleaner_search.user.js.
// Version 1.5
//
// Top-level code only declares things; anything from the main script is used inside functions.

const AR_PAGES_PER_BATCH = 10;   // stop after this many pages and wait for "Load next"
const AR_PAGE_DELAY_MS = 1500;   // pause between page requests (avoids rate limiting)
const AR_RETRY_DELAY_MS = 5000;  // a failed page is retried once after this pause
const AR_STRIP_MAX = 4;          // small images shown under a card's cover

let arState = null; // created on first open, kept while the page is open

// --------------------
// Pagination — read from the page's "Go to page" box (same data the site's own pageJump uses)
// --------------------
function arPagination() {
    const inp = document.querySelector('.pagenav input.pgn_input');
    const params = new URLSearchParams(location.search);
    if (!inp) return { total: 1, perPage: 15, current: 1, urlFor: () => location.href };
    const base = inp.dataset.baseUrl;
    const startName = inp.dataset.startName || 'start';
    const perPage = parseInt(inp.dataset.perPage, 10) || 15;
    const total = Math.max(1, parseInt(inp.max, 10) || 1);
    const start = parseInt(params.get(startName), 10) || 0;
    const urlFor = function (n) {
        const off = (n - 1) * perPage;
        const rel = base.indexOf('.html') > -1
            ? base.replace(/\.html/g, '-') + off + '.html'
            : base + (base.indexOf('?') === -1 ? '?' : '&') + startName + '=' + off;
        return new URL(rel, location.href).href;
    };
    return { total, perPage, current: Math.floor(start / perPage) + 1, urlFor };
}

// --------------------
// Durations — "00:02:42", "2:42", "2 min 42 s", "1 h 5 min" … all compared as seconds
// --------------------
const AR_DUR_COLON = /\b(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\b/g;
const AR_DUR_WORDS = /(?:\b(\d+)\s*(?:h|hrs?|hours?)\.?\s*)?\b(\d+)\s*(?:mins?|minutes?|mn)\.?(?:\s*(\d+)\s*(?:s|secs?|seconds?)\b)?/gi;

// All durations found in a post's text, in seconds
function arDurationsIn(text) {
    const out = [];
    let m;
    AR_DUR_COLON.lastIndex = 0;
    while ((m = AR_DUR_COLON.exec(text))) {
        out.push(m[3] !== undefined ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]));
    }
    AR_DUR_WORDS.lastIndex = 0;
    while ((m = AR_DUR_WORDS.exec(text))) {
        out.push((+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+(m[3] || 0)));
    }
    return out;
}

// A filter term that is a duration → { min, max } seconds; "2 min" (no seconds) = 2:00–2:59.
// Returns null if the term isn't a duration.
function arParseDurationTerm(term) {
    let m = term.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
    if (m) {
        const s = m[3] !== undefined ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
        return { min: s, max: s };
    }
    m = term.match(/^(?:(\d+)\s*(?:h|hrs?|hours?)\.?\s*)?(\d+)\s*(?:mins?|minutes?|mn)\.?(?:\s*(\d+)\s*(?:s|secs?|seconds?))?$/i);
    if (m) {
        const base = (+(m[1] || 0)) * 3600 + (+m[2]) * 60;
        return m[3] !== undefined ? { min: base + (+m[3]), max: base + (+m[3]) } : { min: base, max: base + 59 };
    }
    m = term.match(/^(\d+)\s*(?:h|hrs?|hours?)$/i);
    if (m) return { min: (+m[1]) * 3600, max: (+m[1]) * 3600 + 3599 };
    return null;
}

function arFormatDuration(s) {
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    const pad = n => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// --------------------
// Fetching + parsing
// --------------------
const arSleep = ms => new Promise(r => setTimeout(r, ms));
const arNorm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();

async function arFetchPage(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    if (!doc.querySelector('.forumline.search-posts')) throw new Error('no results on the page (rate limited or logged out?)');
    return doc;
}

// Copy of a node from a fetched (or the live) page, without our own additions
function arCopy(n) {
    const c = document.importNode(n, true);
    c.querySelectorAll('.pbb-btn, .pbb-match-tag').forEach(x => x.remove());
    c.classList.remove('pbb-collapsed');
    c.querySelectorAll('img').forEach(function (im) {
        im.loading = 'lazy'; // hundreds of results: load images only when scrolled to
        delete im.dataset.pbbThumb;
        im.classList.remove('pbb-thumb', 'pbb-thumb-ext');
    });
    return c;
}

// Plain text of an element, with <br> as line breaks
function arTextOf(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    return c.textContent;
}

// After removing images: keep at most one empty line in a row, none at the start/end
function arTrimBreaks(el) {
    let run = 0;
    Array.from(el.childNodes).forEach(function (n) {
        if (n.nodeType === 3 && !n.textContent.trim()) return; // whitespace between <br>s
        if (n.nodeName === 'BR') { if (++run > 2) n.remove(); }
        else run = 0;
    });
    const isGap = n => n && (n.nodeName === 'BR' || (n.nodeType === 3 && !n.textContent.trim()));
    while (isGap(el.firstChild)) el.firstChild.remove();
    while (isGap(el.lastChild)) el.lastChild.remove();
}

// One result per search hit: { topic, subject, date, postUrl, text, durations, body (post row copy) }
function arExtractResults(doc) {
    const out = [];
    doc.querySelectorAll('.forumline.search-posts .cattitle').forEach(function (ct) {
        const link = ct.querySelector('a');
        const row = ct.closest('.row');
        const bodyRow = row && row.nextElementSibling;
        if (!link || !bodyRow || !bodyRow.querySelector('.postbody')) return;
        const body = arCopy(bodyRow);
        const postText = body.querySelector('.post-text');
        const subjEl = body.querySelector('.search-post-subj a');
        const firstBold = postText && postText.querySelector('.bold');
        const postLink = body.querySelector('.post-info-row a[href*="post"]');
        const dateEl = body.querySelector('.search-post-date');
        const text = postText ? arTextOf(postText) : '';
        const subject = (subjEl && subjEl.textContent.trim()) || (firstBold && firstBold.textContent.trim()) || link.textContent.trim();
        out.push({
            topic: arNorm(link.textContent),
            subject,
            date: dateEl ? dateEl.textContent.trim() : '',
            postUrl: postLink ? new URL(postLink.getAttribute('href'), location.href).href : '',
            text,
            durations: arDurationsIn(text),
            haystack: arNorm(subject + '\n' + text),
            body,
        });
    });
    return out;
}

// --------------------
// Grid card for one result
// --------------------
function arBuildCard(r, pageNo) {
    const card = document.createElement('div');
    card.className = 'pbb-card';

    // images (with their links, so open-in-tab hosts keep working): cover + small strip
    const postText = r.body.querySelector('.post-text');
    const imgs = postText ? Array.from(postText.querySelectorAll('img')) : [];
    const gallery = document.createElement('div');
    gallery.className = 'post-text pbb-card-imgs'; // .post-text = one preview gallery per card
    imgs.forEach(function (im, i) {
        const a = im.closest('a');
        const node = a ? a.cloneNode(false) : document.createDocumentFragment();
        const ic = im.cloneNode(false);
        ic.loading = 'lazy';
        node.appendChild(ic);
        const holder = document.createElement('span');
        holder.className = i === 0 ? 'pbb-card-cover' : 'pbb-card-mini';
        if (i > AR_STRIP_MAX) holder.classList.add('pbb-card-extra');
        holder.appendChild(node);
        gallery.appendChild(holder);
    });
    if (imgs.length > AR_STRIP_MAX + 1) {
        const more = document.createElement('span');
        more.className = 'pbb-card-more';
        more.textContent = `+${imgs.length - AR_STRIP_MAX - 1}`;
        more.title = 'More images — click any image and use the arrows';
        gallery.appendChild(more);
    }
    if (!imgs.length) gallery.classList.add('pbb-card-noimg');
    card.appendChild(gallery);

    const title = document.createElement(r.postUrl ? 'a' : 'div');
    title.className = 'pbb-card-title';
    title.textContent = r.subject;
    title.title = r.subject;
    if (r.postUrl) { title.href = r.postUrl; title.target = '_blank'; title.rel = 'noopener'; }
    card.appendChild(title);

    // quick facts: duration, size, resolution
    const tags = document.createElement('div');
    tags.className = 'pbb-card-tags';
    const addTag = function (label, val) {
        if (!val) return;
        const t = document.createElement('span');
        t.className = 'pbb-card-tag';
        t.textContent = val;
        t.title = label;
        tags.appendChild(t);
    };
    addTag('Duration', r.durations.length ? arFormatDuration(r.durations[0]) : '');
    const size = r.text.match(/\b(\d+(?:[.,]\d+)?)\s*(GB|MB|GiB|MiB)\b/i);
    addTag('Size', size ? size[1] + ' ' + size[2].toUpperCase() : '');
    const res = r.text.match(/\b(\d{3,4})\s*[x×]\s*(\d{3,4})\b/);
    addTag('Resolution', res ? res[1] + '×' + res[2] : '');
    const meta = document.createElement('span');
    meta.className = 'pbb-card-meta';
    meta.textContent = (r.date ? r.date + ' · ' : '') + 'p' + pageNo;
    tags.appendChild(meta);
    card.appendChild(tags);

    // full post text and links, without the images (they're above)
    if (postText) {
        const det = document.createElement('details');
        det.className = 'pbb-card-details';
        const sum = document.createElement('summary');
        sum.textContent = 'Post text & links';
        const txt = postText.cloneNode(true);
        txt.className = 'pbb-card-text';
        txt.querySelectorAll('img').forEach(function (im) {
            const a = im.closest('a');
            (a && a.textContent.trim() === '' ? a : im).remove();
        });
        arTrimBreaks(txt);
        det.append(sum, txt);
        card.appendChild(det);
    }
    return card;
}

// --------------------
// Popup
// --------------------
function arSiteBackground() {
    for (const el of [document.querySelector('.bodyline'), document.querySelector('.body'), document.body, document.documentElement]) {
        if (!el) continue;
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) return bg;
    }
    return '#fff';
}

function arBuildPopup() {
    const wrap = document.createElement('div');
    wrap.id = 'pbb-ar-backdrop';
    const terms = document.querySelector('h1');
    wrap.innerHTML = `
        <div id="pbb-ar-modal" role="dialog" aria-label="All search results">
            <div class="pbb-ar-header">
                <div class="pbb-ar-title"></div>
                <div class="pbb-ar-controls">
                    <span class="pbb-ar-views">
                        <button type="button" class="pbb-btn pbb-ar-view" data-view="grid">▦ Grid</button>
                        <button type="button" class="pbb-btn pbb-ar-view" data-view="list">☰ List</button>
                    </span>
                    <input type="search" class="pbb-ar-filter" placeholder="Filter — comma-separated, e.g. 1080p, 2 min 42 s"
                           title="Comma-separated keywords. Durations match in any form: 00:02:42 = 2:42 = 2 min 42 s; '2 min' matches 2:00–2:59.">
                    <select class="pbb-ar-mode" title="How several keywords combine">
                        <option value="all">match all</option>
                        <option value="any">match any</option>
                    </select>
                </div>
                <button type="button" class="pbb-btn pbb-ar-close" title="Close (Esc)">✕</button>
            </div>
            <div class="pbb-ar-body">
                <div class="pbb-ar-grid"></div>
                <div class="pbb-ar-list"></div>
                <div class="pbb-ar-empty" hidden>No results match the filter.</div>
            </div>
            <div class="pbb-ar-footer">
                <span class="pbb-ar-status"></span>
                <span class="pbb-ar-actions">
                    <button type="button" class="pbb-btn pbb-ar-next"></button>
                    <button type="button" class="pbb-btn pbb-ar-stop">Stop</button>
                </span>
            </div>
        </div>`;
    wrap.querySelector('.pbb-ar-title').textContent = 'All results' + (terms ? ' — ' + terms.textContent.trim() : '');
    wrap.querySelector('#pbb-ar-modal').style.background = arSiteBackground();
    wrap.querySelector('.pbb-ar-close').addEventListener('click', arClose);
    wrap.querySelector('.pbb-ar-next').addEventListener('click', arLoadBatch);
    wrap.querySelector('.pbb-ar-stop').addEventListener('click', function () { arState.running = false; arUpdateUI(); });
    wrap.querySelectorAll('.pbb-ar-view').forEach(b => b.addEventListener('click', () => arSetView(b.dataset.view)));

    const filter = wrap.querySelector('.pbb-ar-filter');
    const mode = wrap.querySelector('.pbb-ar-mode');
    mode.value = GM_getValue('AR_FILTER_MODE', 'all') === 'any' ? 'any' : 'all';
    let t = null;
    filter.addEventListener('input', function () { clearTimeout(t); t = setTimeout(arApplyFilters, 200); });
    mode.addEventListener('change', function () { GM_setValue('AR_FILTER_MODE', mode.value); arApplyFilters(); });

    document.body.appendChild(wrap);
    return wrap;
}

function arSetView(view) {
    view = view === 'list' ? 'list' : 'grid';
    GM_setValue('AR_VIEW', view);
    const el = arState.el;
    el.querySelector('.pbb-ar-grid').hidden = view !== 'grid';
    el.querySelector('.pbb-ar-list').hidden = view !== 'list';
    el.querySelectorAll('.pbb-ar-view').forEach(b => b.classList.toggle('pbb-active', b.dataset.view === view));
}

function arKeydown(e) {
    if (e.key !== 'Escape' || !arState || !arState.open) return;
    if (document.querySelector('.viewer-container.viewer-in')) return; // Esc closes the image preview first
    if (e.target && e.target.classList && e.target.classList.contains('pbb-ar-filter') && e.target.value) return; // Esc clears the filter box
    arClose();
}

function openAllResults() {
    if (!document.querySelector('.forumline.search-posts')) { alert('Open a search results page first.'); return; }
    if (!arState) {
        arState = {
            pg: arPagination(), nextPage: 1, running: false, open: false,
            failed: null, error: '', items: [], counts: { total: 0, blocked: 0, shown: 0 }, el: arBuildPopup(),
        };
        arSetView(GM_getValue('AR_VIEW', 'grid'));
        document.addEventListener('keydown', arKeydown);
    }
    arState.open = true;
    arState.el.classList.add('active');
    document.documentElement.classList.add('pbb-ar-lock');
    arUpdateUI();
    if (arState.nextPage === 1 && !arState.running) arLoadBatch(); // first open: start right away
}

function arClose() {
    if (!arState) return;
    arState.open = false;
    arState.running = false; // pause; "Load next" continues from where it stopped
    arState.el.classList.remove('active');
    document.documentElement.classList.remove('pbb-ar-lock');
    arUpdateUI();
}

function arUpdateUI() {
    const s = arState, el = s.el, total = s.pg.total, loaded = s.nextPage - 1, c = s.counts;
    const visible = c.total - c.blocked;
    let status = `Loaded ${loaded} of ${total} page${total > 1 ? 's' : ''} · `;
    status += c.shown === visible ? `${visible} result${visible === 1 ? '' : 's'}` : `${c.shown} of ${visible} results match the filter`;
    if (c.blocked) status += ` · ${c.blocked} hidden by keyword`;
    if (s.running) status += ` · loading page ${s.nextPage}…`;
    else if (s.failed) status += ` · page ${s.failed} failed: ${s.error}`;
    el.querySelector('.pbb-ar-status').textContent = status;
    el.querySelector('.pbb-ar-empty').hidden = !(c.total && !c.shown);

    const next = el.querySelector('.pbb-ar-next');
    const from = s.nextPage, to = Math.min(total, from + AR_PAGES_PER_BATCH - 1);
    next.textContent = s.failed ? `Retry page ${s.failed}` : (from === to ? `Load page ${from}` : `Load next pages (${from}–${to})`);
    next.hidden = s.running || from > total;
    el.querySelector('.pbb-ar-stop').hidden = !s.running;
}

// --------------------
// Filtering: collapse keywords (topic name) always hide; the filter box narrows further
// --------------------
function arFilterTerms() {
    const box = arState.el.querySelector('.pbb-ar-filter');
    return box.value.split(',').map(arNorm).filter(Boolean).map(t => ({ text: t, dur: arParseDurationTerm(t) }));
}

function arItemMatches(item, terms, mode) {
    if (!terms.length) return true;
    // a duration term compares times only (so "2:42" doesn't match inside "0:32:42")
    const hit = term => term.dur
        ? item.durations.some(d => d >= term.dur.min && d <= term.dur.max)
        : item.haystack.includes(term.text);
    return mode === 'any' ? terms.some(hit) : terms.every(hit);
}

function arApplyItem(item, keywords, terms, mode) {
    const blocked = keywords.some(k => item.topic.includes(k));
    const show = !blocked && arItemMatches(item, terms, mode);
    item.card.classList.toggle('pbb-ar-off', !show);
    item.listEl.classList.toggle('pbb-ar-off', !show);
    return { blocked, show };
}

function arApplyFilters() {
    if (!arState) return;
    const keywords = getKeywords().map(arNorm).filter(Boolean);
    const terms = arFilterTerms();
    const mode = arState.el.querySelector('.pbb-ar-mode').value;
    const c = arState.counts = { total: arState.items.length, blocked: 0, shown: 0 };
    arState.items.forEach(function (item) {
        const r = arApplyItem(item, keywords, terms, mode);
        if (r.blocked) c.blocked++;
        if (r.show) c.shown++;
    });
    arUpdateUI();
}

// Re-applies the collapse keywords to everything already loaded (called when they change)
function refreshAllResultsFilter() { arApplyFilters(); }

function arAddPage(n, results) {
    const keywords = getKeywords().map(arNorm).filter(Boolean);
    const terms = arFilterTerms();
    const mode = arState.el.querySelector('.pbb-ar-mode').value;
    const grid = arState.el.querySelector('.pbb-ar-grid');
    const page = document.createElement('div');
    page.className = 'forumline search-posts pbb-ar-page';
    const head = document.createElement('div');
    head.className = 'pbb-ar-page-head';
    head.textContent = `Page ${n} of ${arState.pg.total}`;
    page.appendChild(head);

    const cards = document.createDocumentFragment();
    results.forEach(function (r) {
        const listEl = document.createElement('div');
        listEl.className = 'pbb-ar-item';
        listEl.appendChild(r.body); // post only — no topic row, no uploader column (hidden by CSS)
        page.appendChild(listEl);
        const item = { topic: r.topic, haystack: r.haystack, durations: r.durations, listEl, card: arBuildCard(r, n) };
        cards.appendChild(item.card);
        arState.items.push(item);
        const res = arApplyItem(item, keywords, terms, mode);
        arState.counts.total++;
        if (res.blocked) arState.counts.blocked++;
        if (res.show) arState.counts.shown++;
    });
    arState.el.querySelector('.pbb-ar-list').appendChild(page);
    grid.appendChild(cards);
    markAllImages(page);
    markAllImages(grid);
}

async function arLoadBatch() {
    const s = arState;
    if (s.running || s.nextPage > s.pg.total) return;
    s.running = true;
    s.failed = null;
    const end = Math.min(s.pg.total, s.nextPage + AR_PAGES_PER_BATCH - 1);
    let fetchedBefore = false;
    arUpdateUI();
    while (s.running && s.nextPage <= end) {
        const n = s.nextPage;
        const isCurrent = n === s.pg.current;
        try {
            let doc = document; // the page already open isn't fetched again
            if (!isCurrent) {
                if (fetchedBefore) await arSleep(AR_PAGE_DELAY_MS);
                if (!s.running) break;
                try { doc = await arFetchPage(s.pg.urlFor(n)); }
                catch (first) {
                    await arSleep(AR_RETRY_DELAY_MS);
                    if (!s.running) break;
                    doc = await arFetchPage(s.pg.urlFor(n));
                }
                fetchedBefore = true;
            }
            arAddPage(n, arExtractResults(doc));
            s.nextPage++;
        } catch (e) {
            console.warn(`${LOG_PREFIX} All results: page ${n} failed`, e);
            s.failed = n;
            s.error = e.message || String(e);
            break;
        }
        arUpdateUI();
    }
    s.running = false;
    arUpdateUI();
}

// "All results" button above the result list
function initAllResults() {
    const list = document.querySelector('.forumline.search-posts');
    if (!list || document.querySelector('.pbb-ar-bar')) return;
    const pages = arPagination().total;
    const bar = document.createElement('div');
    bar.className = 'pbb-ar-bar';
    bar.appendChild(makeButton(`📚 View all results in one list (${pages} page${pages > 1 ? 's' : ''})`, openAllResults));
    list.parentNode.insertBefore(bar, list);
}
