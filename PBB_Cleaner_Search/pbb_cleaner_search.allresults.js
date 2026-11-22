// [PBB] Cleaner Search — "All results" popup: loads every page of the current search into one
// scrollable list, one page at a time with a pause between pages, stopping every 10 pages.
// Part of pbb_cleaner_search.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install pbb_cleaner_search.user.js.
// Version 1.4
//
// Top-level code only declares things; anything from the main script is used inside functions.

const AR_PAGES_PER_BATCH = 10;   // stop after this many pages and wait for "Load next"
const AR_PAGE_DELAY_MS = 1500;   // pause between page requests (avoids rate limiting)
const AR_RETRY_DELAY_MS = 5000;  // a failed page is retried once after this pause

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
// Fetching + parsing
// --------------------
const arSleep = ms => new Promise(r => setTimeout(r, ms));

async function arFetchPage(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    if (!doc.querySelector('.forumline.search-posts')) throw new Error('no results on the page (rate limited or logged out?)');
    return doc;
}

// [{ title, nodes: [topic row, post row] }] — nodes are copies, ready to insert
function arExtractResults(doc) {
    const out = [];
    doc.querySelectorAll('.forumline.search-posts .cattitle').forEach(function (ct) {
        const link = ct.querySelector('a');
        const row = ct.closest('.row');
        const body = row && row.nextElementSibling;
        if (!link || !body || !body.querySelector('.postbody')) return;
        const nodes = [row, body].map(function (n) {
            const c = document.importNode(n, true);
            // the live page has our collapse tags/buttons on it — drop them from the copy
            c.querySelectorAll('.pbb-btn, .pbb-match-tag').forEach(x => x.remove());
            c.classList.remove('pbb-collapsed');
            c.querySelectorAll('.pbb-matched').forEach(x => x.classList.remove('pbb-matched'));
            c.querySelectorAll('img').forEach(function (im) {
                im.loading = 'lazy'; // hundreds of results: load images only when scrolled to
                delete im.dataset.pbbThumb;
                im.classList.remove('pbb-thumb', 'pbb-thumb-ext');
            });
            return c;
        });
        out.push({ title: link.textContent, nodes });
    });
    return out;
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
                <button type="button" class="pbb-btn pbb-ar-close" title="Close (Esc)">✕</button>
            </div>
            <div class="pbb-ar-body"></div>
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
    wrap.addEventListener('click', function (e) { if (e.target === wrap) arClose(); });
    wrap.querySelector('.pbb-ar-close').addEventListener('click', arClose);
    wrap.querySelector('.pbb-ar-next').addEventListener('click', arLoadBatch);
    wrap.querySelector('.pbb-ar-stop').addEventListener('click', function () { arState.running = false; arUpdateUI(); });
    document.body.appendChild(wrap);
    return wrap;
}

function arKeydown(e) {
    if (e.key !== 'Escape' || !arState || !arState.open) return;
    if (document.querySelector('.viewer-container.viewer-in')) return; // Esc closes the image preview first
    arClose();
}

function openAllResults() {
    if (!document.querySelector('.forumline.search-posts')) { alert('Open a search results page first.'); return; }
    if (!arState) {
        arState = {
            pg: arPagination(), nextPage: 1, running: false, open: false,
            shown: 0, hidden: 0, failed: null, error: '', items: [], el: arBuildPopup(),
        };
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
    const s = arState, el = s.el, total = s.pg.total, loaded = s.nextPage - 1;
    let status = `Loaded ${loaded} of ${total} page${total > 1 ? 's' : ''} · ${s.shown} result${s.shown === 1 ? '' : 's'}`;
    if (s.hidden) status += ` · ${s.hidden} hidden by keyword`;
    if (s.running) status += ` · loading page ${s.nextPage}…`;
    else if (s.failed) status += ` · page ${s.failed} failed: ${s.error}`;
    el.querySelector('.pbb-ar-status').textContent = status;

    const next = el.querySelector('.pbb-ar-next');
    const from = s.nextPage, to = Math.min(total, from + AR_PAGES_PER_BATCH - 1);
    next.textContent = s.failed ? `Retry page ${s.failed}` : (from === to ? `Load page ${from}` : `Load next pages (${from}–${to})`);
    next.hidden = s.running || from > total;
    el.querySelector('.pbb-ar-stop').hidden = !s.running;
}

function arAddPage(n, results) {
    const keywords = getKeywords().map(k => String(k).trim().toLowerCase()).filter(Boolean);
    const page = document.createElement('div');
    page.className = 'forumline search-posts pbb-ar-page';
    const head = document.createElement('div');
    head.className = 'pbb-ar-page-head';
    head.textContent = `Page ${n} of ${arState.pg.total}`;
    page.appendChild(head);
    results.forEach(function (r) {
        const item = document.createElement('div');
        item.className = 'pbb-ar-item';
        r.nodes.forEach(node => item.appendChild(node));
        item.dataset.title = r.title.toLowerCase();
        const blocked = keywords.some(k => item.dataset.title.includes(k));
        item.classList.toggle('pbb-ar-blocked', blocked);
        if (blocked) arState.hidden++; else arState.shown++;
        page.appendChild(item);
        arState.items.push(item);
    });
    arState.el.querySelector('.pbb-ar-body').appendChild(page);
    markAllImages(page);
}

// Re-applies the collapse keywords to everything already loaded (called when they change)
function refreshAllResultsFilter() {
    if (!arState) return;
    const keywords = getKeywords().map(k => String(k).trim().toLowerCase()).filter(Boolean);
    arState.shown = arState.hidden = 0;
    arState.items.forEach(function (item) {
        const blocked = keywords.some(k => item.dataset.title.includes(k));
        item.classList.toggle('pbb-ar-blocked', blocked);
        if (blocked) arState.hidden++; else arState.shown++;
    });
    arUpdateUI();
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
