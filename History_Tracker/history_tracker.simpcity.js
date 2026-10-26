// [HF][EMP][PLAB][SC] History Tracker — SimpCity
// Part of history_tracker.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install history_tracker.user.js.
// Version 4.7
//
// SimpCity (simpcity.cr) is a XenForo 2 forum. Here a "torrent" is a thread (/threads/slug.N/):
//   • /watched/threads (any page): every thread listed is saved to ht_sc_watched — title, prefixes, thumbnail,
//     forum, starter, replies / views, pages, and the last post's date and author.
//   • a thread page: the visit is recorded with its page number, the thread's facts are updated (and its watched
//     state, from the page's Watch / Unwatch button), and a cleaned copy of that page's posts is saved to
//     ht_sc_posts_<thread>_<page> (that page only — never the rest of the thread).
//   • /search/N/?q=…: recorded as a search (also searches inside one thread, c[thread]=N).
// The forum rate-limits and blocks bots, so this module never sends a request to it: it only reads the pages you
// open. (Rendering a saved page loads the posts' images from their image hosts, like the forum does.)
// Top-level code here only declares things; it runs inside functions, after the main script has loaded.

// ── URLs and page types ──────────────────────────────────────────────────

/** thread id from a /threads/slug.N/… path (0 if it isn't one) */
function scThreadIdFromPath(path) {
    var m = String(path || '').match(/^\/threads\/(?:[^\/]*?\.)?(\d{1,10})(?:\/|$)/i);
    return m ? parseInt(m[1], 10) : 0;
}

/** page number of a thread path (/page-3) — 1 when there's none */
function scPageFromPath(path) {
    var m = String(path || '').match(/\/page-(\d{1,5})(?:\/|$)/i);
    return m ? parseInt(m[1], 10) : 1;
}

/**
 * the thread's base path (/threads/slug.N/) from any link to it: list titles point to …/latest?new=1, …/unread,
 * …/page-7 or …/post-123, so everything after the thread's own segment is dropped. '' if it isn't a thread link.
 */
function scBasePath(path) {
    var m = String(path || '').match(/^\/threads\/([^\/?#]*?\.)?(\d{1,10})(?=[\/?#]|$)/i);
    return m ? '/threads/' + (m[1] || '') + m[2] + '/' : '';
}

/** the thread's own path (/threads/slug.N/) when we've seen it, else /threads/N/ (the forum redirects that) */
function scThreadPath(id) {
    var w = readWatched('sc')[id];
    if (w && scBasePath(w.p)) return scBasePath(w.p);
    var e = torrents('sc').get(id);
    if (e && e.x && scBasePath(e.x.p)) return scBasePath(e.x.p);
    return GROUP_PATHS.sc.torrent + id + '/';
}

/** the address of one page of a thread */
function scPageUrl(id, page) {
    return originOf('sc') + scThreadPath(id) + (page > 1 ? 'page-' + page : '');
}

function scSearchUrl(text, threadId) {
    var p = new URLSearchParams();
    p.set('keywords', text || '');
    if (threadId) p.set('c[thread]', String(threadId));
    p.set('o', 'date');
    return originOf('sc') + '/search/search?' + p.toString();
}

/**
 * SimpCity page types. Thread pages are recognised by the page itself (data-template="thread_view") as well as by
 * the URL, so /threads/x.N/post-123 and …/unread (which the forum redirects to a page) are counted once, as that page.
 */
function classifySc(u) {
    var path = u.pathname;
    var tpl = document.documentElement.getAttribute('data-template') || '';
    var tid = scThreadIdFromPath(path);
    if (tpl === 'thread_view' || (tid && /^\/threads\/[^\/]+\/(page-\d+\/?)?$/i.test(path))) {
        var ck = (document.documentElement.getAttribute('data-content-key') || '').match(/^thread-(\d{1,10})$/);
        if (ck) tid = parseInt(ck[1], 10);
        return tid ? { type: 'torrent', torrent_id: tid, page: scCurrentPage(path) } : { type: 'other' };
    }
    if (/^\/watched\/threads\/?$/i.test(path)) return { type: 'watched', page: parseInt(u.searchParams.get('page'), 10) || 1 };
    if (/^\/search\/\d+\/?$/i.test(path)) return classifyScSearch(u);
    return { type: 'other' };
}

function scCurrentPage(path) {
    var cur = document.querySelector('.pageNav-page--current a');
    var n = cur ? parseInt(cleanText(cur.textContent), 10) : 0;
    return n > 0 ? n : scPageFromPath(path);
}

/**
 * A search results page (/search/45206648/?q=…&o=date). The number is the forum's own (short-lived) result set,
 * so the search is remembered by what was searched: text, member, "titles only" and the thread searched in.
 * Running it again goes through /search/search?keywords=… (a fresh search). Result pages 2, 3, … aren't counted.
 */
function classifyScSearch(u) {
    if ((parseInt(u.searchParams.get('page'), 10) || 1) > 1) return { type: 'browse' };
    var text = cleanText(u.searchParams.get('q'));
    if (!text) { var em = document.querySelector('h1.p-title-value em'); text = cleanText(em && em.textContent); }
    var users = cleanText(u.searchParams.get('c[users]'));
    var titles = u.searchParams.get('c[title_only]') === '1';
    var thread = parseInt(u.searchParams.get('c[thread]'), 10) || 0;
    if (!text && !users) return { type: 'browse' };
    var threadTitle = '';
    if (thread) {
        var tl = document.querySelector('.search-term.term--thread a');
        threadTitle = cleanText(tl && tl.textContent);
    }
    var key = [];
    var label = [];
    if (text) { key.push('text:' + text.toLowerCase()); label.push(text); }
    if (users) { key.push('by:' + users.toLowerCase()); label.push('by ' + users); }
    if (titles) { key.push('titles'); label.push('titles only'); }
    if (thread) { key.push('thread:' + thread); label.push('in “' + (threadTitle || 'thread #' + thread) + '”'); }
    var p = new URLSearchParams();
    p.set('keywords', text);
    if (users) p.set('c[users]', users);
    if (titles) p.set('c[title_only]', '1');
    if (thread) p.set('c[thread]', String(thread));
    p.set('o', u.searchParams.get('o') || 'date');
    return {
        type: 'search', key: key.join(' | '), text: text, label: label.join(' · '),
        url: originOf('sc') + '/search/search?' + p.toString(), th: thread, tt: threadTitle,
    };
}

/** the thread title without its prefix labels ("XXX", "OnlyFans", …) */
function scPageTitle(doc) {
    var d = doc || document;
    var h1 = d.querySelector('h1.p-title-value');
    if (h1) {
        var c = h1.cloneNode(true);
        c.querySelectorAll('.label, .labelLink, .label-append, [data-ht-ui]').forEach(function (n) { n.remove(); });
        var t = cleanText(c.textContent);
        if (t) return t.slice(0, 300);
    }
    return cleanText(String(d.title || '').split(' | ')[0]).replace(/^[^-]{1,30} - /, '').slice(0, 300);
}

function scPrefixes(root) {
    return root ? Array.prototype.map.call(root.querySelectorAll('.label'), function (l) { return cleanText(l.textContent); }).filter(Boolean).slice(0, 6) : [];
}

/** the image behind a thread thumbnail (the forum draws it as a CSS background) */
function scThumbUrl(img) {
    if (!img) return '';
    var m = String(img.getAttribute('style') || '').match(/background-image:\s*url\(\s*(['"]?)(.*?)\1\s*\)/i);
    var src = cleanUrl(m ? m[2] : img.getAttribute('src'));
    return src && !/defaultThumbnailImage|no_image/i.test(src) ? src : '';
}

function scTs(t) {
    var n = t ? parseInt(t.getAttribute('data-timestamp'), 10) : 0;
    return n > 0 ? n * 1000 : 0;
}

/** last post time shown in a thread list row (watched threads, forums), for the "new" badge */
function scListLastPost(a) {
    var row = a.closest && a.closest('.structItem');
    return row ? scTs(row.querySelector('time.structItem-latestDate')) : 0;
}

// ── Watched threads ──────────────────────────────────────────────────────

function readWatched(g) { return readObj(keysOf(g || 'sc').watched); }
function writeWatched(all) { GM_setValue(keysOf('sc').watched, all); }

/** one row of /watched/threads → the facts we keep */
function scParseListRow(row) {
    var idM = (row.className || '').match(/js-threadListItem-(\d{1,10})/);
    var cb = row.querySelector('input[name="thread_ids[]"]');
    var id = idM ? parseInt(idM[1], 10) : (cb ? parseInt(cb.value, 10) : 0);
    var titleBox = row.querySelector('.structItem-title');
    var link = titleBox && (titleBox.querySelector('a[data-tp-primary]') || titleBox.querySelector('a[href*="/threads/"]'));
    if (!id || !link) return null;
    var path = '';
    try { path = new URL(link.getAttribute('href'), location.href).pathname; } catch (e) { /* keep '' */ }
    var forum = row.querySelector('.structItem-parts a[href^="/forums/"], .structItem-parts a[href*="/forums/"]');
    var pages = 1;
    row.querySelectorAll('.structItem-pageJump a').forEach(function (a) { var n = parseInt(cleanText(a.textContent), 10); if (n > pages) pages = n; });
    var dds = row.querySelectorAll('.structItem-cell--meta dd');
    var latest = row.querySelector('.structItem-cell--latest');
    var lastBy = latest && latest.querySelector('.username');
    var item = {
        t: cleanText(link.textContent).slice(0, 300),
        p: scBasePath(path),
        pf: scPrefixes(titleBox),
        cv: scThumbUrl(row.querySelector('.dcThumbnail img')),
        fo: forum ? cleanText(forum.textContent) : '',
        fu: forum ? forum.getAttribute('href') : '',
        st: row.getAttribute('data-author') || '',
        sd: scTs(row.querySelector('.structItem-startDate time')),
        np: pages,
        rp: dds[0] ? cleanText(dds[0].textContent) : '',
        vw: dds[1] ? cleanText(dds[1].textContent) : '',
        lp: scTs(row.querySelector('time.structItem-latestDate')),
        lpu: lastBy ? cleanText(lastBy.textContent) : '',
        un: row.classList.contains('is-unread') ? 1 : 0,
    };
    return { id: id, item: item };
}

/** /watched/threads?page=N: save every thread listed (no request — just this page) */
function scSaveWatchedList(page, now) {
    var rows = document.querySelectorAll('.structItem--thread');
    if (!rows.length) { log.warn('SimpCity: no threads found on the watched threads page (layout changed?)'); return; }
    var all = readWatched('sc');
    var added = 0;
    var n = 0;
    rows.forEach(function (row, i) {
        var r = scParseListRow(row);
        if (!r) return;
        n++;
        var old = all[r.id];
        if (!old) added++;
        var item = Object.assign(old || {}, r.item);
        if (!item.cv && old && old.cv) item.cv = old.cv;
        item.s = now;                       // last seen in the watched list
        item.o = (page - 1) * 1000 + i;     // position in the list (the forum sorts it by last post)
        if (!item.a) item.a = now;          // first seen watched
        all[r.id] = item;
    });
    writeWatched(all);
    log.info('SimpCity: saved ' + n + ' watched thread(s) from page ' + page + (added ? ' (' + added + ' new)' : '') + ' · ' + Object.keys(all).length + ' watched in total');
}

// ── Thread pages ─────────────────────────────────────────────────────────

/** facts about the thread from its page (doc: a fetched page, default the open one) */
function scThreadFacts(page, doc) {
    var d = doc || document;
    var f = {};
    var canon = d.querySelector('link[rel="canonical"]');
    try {
        var cp = new URL(canon ? canon.getAttribute('href') : location.href, location.href).pathname.replace(/page-\d+\/?$/i, '');
        if (scBasePath(cp)) f.p = scBasePath(cp);
    } catch (e) { /* no path */ }
    f.t = scPageTitle(d);
    f.pf = scPrefixes(d.querySelector('h1.p-title-value'));
    var crumbs = d.querySelectorAll('ul.p-breadcrumbs:not(.p-breadcrumbs--bottom) a[href*="/forums/"]');
    var forum = crumbs[crumbs.length - 1];
    if (forum) { f.fo = cleanText(forum.textContent); f.fu = forum.getAttribute('href'); }
    var desc = d.querySelector('.p-body-header .p-description') || d.querySelector('.p-description');
    if (desc) {
        var starter = desc.querySelector('.username');
        if (starter) f.st = cleanText(starter.textContent);
        var sd = scTs(desc.querySelector('time'));
        if (sd) f.sd = sd;
        f.tg = Array.prototype.map.call(desc.querySelectorAll('.js-tagList a, .tagList a.tagItem'), function (a) { return cleanText(a.textContent); }).filter(Boolean).slice(0, 30);
    }
    var pages = 1;
    var nav = d.querySelector('.pageNav-main');
    if (nav) nav.querySelectorAll('a').forEach(function (a) { var n = parseInt(cleanText(a.textContent), 10); if (n > pages) pages = n; });
    f.np = Math.max(pages, page);
    var og = d.querySelector('meta[property="og:image"]');
    var cv = og ? cleanUrl(og.getAttribute('content')) : '';
    if (cv && !/defaultThumbnailImage|no_image/i.test(cv)) f.cv = cv;
    // watched or not: the thread's own Watch / Unwatch button
    var watch = null;
    d.querySelectorAll('a[href$="/watch"]').forEach(function (a) {
        var tx = cleanText(a.textContent).toLowerCase();
        if (tx === 'unwatch') watch = true;
        else if (tx === 'watch' && watch === null) watch = false;
    });
    f.w = watch;
    // the last post — known when this is the last page
    var posts = d.querySelectorAll('article.message--post[data-content^="post-"]');
    if (posts.length && page >= f.np) {
        var lastPost = posts[posts.length - 1];
        f.lp = scTs(lastPost.querySelector('.message-attribution-main time'));
        f.lpu = lastPost.getAttribute('data-author') || '';
    }
    return f;
}

/**
 * a thread page: update the thread's facts and its watched state (both only read this page).
 * doc: a page fetched by "Save all pages" — then the pages you've read aren't touched.
 */
function scSaveThreadInfo(tid, page, now, doc) {
    var f;
    try { f = scThreadFacts(page, doc); } catch (e) { log.warn('SimpCity: reading thread #' + tid + ' failed', e); return; }
    var keep = ['p', 'pf', 'fo', 'fu', 'st', 'sd', 'tg', 'np'];
    if (torrents().has(tid)) {
        updateTorrent(tid, function (e) {
            if (!e) return null;
            var x = e.x || {};
            keep.forEach(function (k) { if (f[k] !== undefined && f[k] !== '') x[k] = f[k]; });
            if (f.lp && f.lp >= (x.lp || 0)) { x.lp = f.lp; x.lpu = f.lpu; }
            if (!doc) {
                x.rd = Math.max(x.rd || 0, page);    // furthest page read
                x.lr = page;                          // page of the latest visit
            }
            e.x = x;
            return e;
        });
    }
    var all = readWatched('sc');
    if (f.w === true) {
        var w = all[tid] || { a: now };
        keep.concat(['t', 'cv']).forEach(function (k) { if (f[k] !== undefined && f[k] !== '') w[k] = f[k]; });
        if (f.lp && f.lp >= (w.lp || 0)) { w.lp = f.lp; w.lpu = f.lpu; }
        if (!doc) w.tw = now;                         // seen watched on the thread page
        all[tid] = w;
        writeWatched(all);
    } else if (f.w === false && all[tid]) {
        delete all[tid];
        writeWatched(all);
        log.info('SimpCity: thread #' + tid + ' isn\'t watched any more — removed from your watched threads');
    }
    log.debug('SimpCity: thread #' + tid + ' page ' + page + ' of ' + f.np + (f.w === true ? ' (watched)' : f.w === false ? ' (not watched)' : ''), f);
}

/** the posts on this page, each cleaned: [{ i: post id, n: "41", a: author, d: time, h: html }] */
function scCapturePosts(doc) {
    var out = [];
    (doc || document).querySelectorAll('article.message--post[data-content^="post-"]').forEach(function (art) {
        if (art.closest('[data-ht-ui]')) return;
        var id = parseInt(String(art.getAttribute('data-content')).slice(5), 10);
        var body = art.querySelector('.message-body .bbWrapper') || art.querySelector('.message-body');
        if (!id || !body) return;
        var num = '';
        var meta = art.querySelector('meta[itemprop="name"]');
        var nm = meta && String(meta.getAttribute('content')).match(/#\s*([\d,]+)/);
        if (nm) num = nm[1].replace(/,/g, '');
        if (!num) {
            art.querySelectorAll('.message-attribution-opposite a').forEach(function (a) {
                var m = cleanText(a.textContent).match(/^#([\d,]+)$/);
                if (m) num = m[1].replace(/,/g, '');
            });
        }
        var html = sanitizeHtmlToString(body);
        var att = art.querySelector('.message-attachments');
        if (att) {
            var attHtml = sanitizeHtmlToString(att);
            if (cleanText(attHtml.replace(/<[^>]+>/g, ' ')) || /<img/i.test(attHtml)) html += '<hr>' + attHtml;
        }
        out.push({ i: id, n: num, a: art.getAttribute('data-author') || '', d: scTs(art.querySelector('.message-attribution-main time')), h: html });
    });
    return out;
}

/** all storage keys, listed at most once a second (the Threads tab asks for every row) */
var scKeysCache = { t: 0, keys: [] };
function scAllKeys() {
    if (Date.now() - scKeysCache.t > 1000) scKeysCache = { t: Date.now(), keys: GM_listValues() };
    return scKeysCache.keys;
}

/** keys of a thread's saved pages (cached: a key list up to a second old, for long lists) */
function scPageKeys(tid, g, cached) {
    var p = keysOf(g || 'sc').posts + tid + '_';
    if (!cached) scKeysCache.t = 0;   // fresh list (pages may have just been saved or deleted)
    return scAllKeys().filter(function (k) { return k.indexOf(p) === 0 && /_\d+$/.test(k.slice(p.length - 1)); });
}

/** a thread's saved pages, in page order: [{ page, v }] */
function scSavedPages(tid, g) {
    var p = keysOf(g || 'sc').posts + tid + '_';
    return scPageKeys(tid, g).map(function (k) {
        var v = GM_getValue(k, null);
        return v && typeof v === 'object' ? { page: parseInt(k.slice(p.length), 10), v: v } : null;
    }).filter(Boolean).sort(function (a, b) { return a.page - b.page; });
}

/** save this page's posts (latest copy only; an unchanged page just gets "seen again") */
function scSaveThreadPage(tid, page, now) {
    if (!torrents().has(tid)) return;                 // only for threads whose visits are recorded
    var posts;
    try { posts = scCapturePosts(); } catch (e) { log.warn('SimpCity: reading the posts of #' + tid + ' failed', e); return; }
    if (!posts.length) { log.debug('SimpCity: no posts found on this page of #' + tid); return; }
    scStorePage(tid, page, posts, now, false).then(scRefreshButtons, function () { /* logged */ });
}

/**
 * store one page's posts → Promise of 'saved' | 'unchanged'.
 * pin: saved by "Save all pages" — kept apart from the threadPagesMax limit (k: 1); a pinned page stays pinned.
 */
function scStorePage(tid, page, posts, now, pin) {
    var json = JSON.stringify(posts);
    var h = hashText(json);
    var key = keysOf('sc').posts + tid + '_' + page;
    var cur = GM_getValue(key, null);
    var keep = !!(pin || (cur && cur.k));
    if (cur && cur.h === h) {
        cur.l = now;
        if (keep) cur.k = 1;
        GM_setValue(key, cur);
        log.debug('SimpCity: page ' + page + ' of #' + tid + ' unchanged since ' + fmtDateTime(cur.t));
        return Promise.resolve('unchanged');
    }
    return encodeText(json).then(function (enc) {
        var v = { t: now, l: now, h: h, n: posts.length, b: json.length, a: posts[0].n, e: posts[posts.length - 1].n, z: enc.z, d: enc.d };
        if (keep) v.k = 1;
        GM_setValue(key, v);
        log.info('SimpCity: saved page ' + page + ' of #' + tid + ': ' + posts.length + ' posts (#' + posts[0].n + '–#' + posts[posts.length - 1].n + '), ' +
            fmtBytes(json.length) + ', stored as ' + fmtBytes(enc.d.length) + (enc.z ? ' (gzip)' : ' (uncompressed)') + (keep ? ' · kept (saved with "Save all pages")' : ''));
        if (!keep) scPrunePages(key);
        return 'saved';
    }).catch(function (e) { log.error('SimpCity: saving page ' + page + ' of #' + tid + ' failed', e); throw e; });
}

/** keep at most N saved thread pages: the ones you've looked at least recently go first */
function scPrunePages(keepKey) {
    var max = parseInt(getSetting('threadPagesMax'), 10) || 0;
    if (max <= 0) return;
    // pages saved with "Save all pages" (k: 1) don't count and are never dropped here
    var keys = [];
    var dated = [];
    GM_listValues().forEach(function (k) {
        if (k.indexOf(keysOf('sc').posts) !== 0) return;
        var v = GM_getValue(k, null);
        if (v && v.k) return;
        keys.push(k);
        if (k !== keepKey) dated.push([k, v ? v.l || v.t || 0 : 0]);
    });
    if (keys.length <= max) return;
    dated.sort(function (a, b) { return a[1] - b[1]; });
    var drop = dated.slice(0, keys.length - max);
    drop.forEach(function (x) { GM_deleteValue(x[0]); });
    log.info('SimpCity: removed ' + drop.length + ' old saved thread page(s) (keeping ' + max + ')');
}

// ── "📥 Save all pages" ─────────────────────────────────────────────────
// The only place this script requests SimpCity pages itself, and only when you click the button. One page at a
// time, with random pauses — settings scrapeDelay / scrapeBurst / scrapePause, by default 1–3 s between pages
// and a longer 3–5 s pause every 5–10 pages. It stops at once on anything unexpected (an error status such as
// 429 "too many requests", a check page, being logged out, a page of another thread) and never retries.
// One tab at a time: a lock in storage (ht_sc_scrape) refreshed while it runs. Threads can be queued.
// Pages saved this way are "kept" (k: 1): not counted against, nor dropped by, the threadPagesMax limit.

var SC_LOCK_KEY = 'ht_sc_scrape';
var SC_LOCK_STALE_MS = 20000;
var scTabId = uuid();
var scPending = [];      // threads waiting for you to choose "missing" or "all"
var scQueue = [];        // jobs: { tid, title, path, np, pages: [n, …], total, done, saved, same }
var scFinished = [];
var scState = { running: false, paused: false, stopped: false, error: '', status: '', waitLeft: 0, waitLong: false, panel: null, job: null };

function scRange(name, defMin, defMax) {
    var m = String(getSetting(name) || '').match(/^\s*(\d+(?:\.\d+)?)\s*(?:[-–]\s*(\d+(?:\.\d+)?))?\s*$/);
    var a = m ? parseFloat(m[1]) : defMin;
    var b = m && m[2] !== undefined ? parseFloat(m[2]) : (m ? a : defMax);
    if (!(a >= 0)) a = defMin;
    if (!(b >= a)) b = a;
    return [a, b];
}
function scRand(r) { return r[0] + Math.random() * (r[1] - r[0]); }

function scLockHeld() {
    var l = GM_getValue(SC_LOCK_KEY, null);
    return !!(l && l.id !== scTabId && Date.now() - l.ts < SC_LOCK_STALE_MS);
}
function scTakeLock() {
    if (scLockHeld()) return false;
    GM_setValue(SC_LOCK_KEY, { id: scTabId, ts: Date.now() });
    return true;
}
function scDropLock() {
    var l = GM_getValue(SC_LOCK_KEY, null);
    if (l && l.id === scTabId) GM_deleteValue(SC_LOCK_KEY);
}

/** a thread to save: { tid, title, path, np } — asks "missing pages" or "all pages" in the panel */
function scRequestSaveAll(t) {
    if (scQueue.some(function (j) { return j.tid === t.tid; }) || scPending.some(function (j) { return j.tid === t.tid; })) {
        scDraw();
        return;
    }
    scPending.push(t);
    scDraw();
}

function scSavedSet(tid) {
    var set = {};
    scSavedPages(tid, 'sc').forEach(function (p) { set[p.page] = 1; });
    return set;
}

function scQueueJob(t, mode) {
    var saved = scSavedSet(t.tid);
    var pages = [];
    for (var n = 1; n <= t.np; n++) {
        if (mode === 'all' || !saved[n] || n === t.np) pages.push(n);   // the last page may have new posts
    }
    scQueue.push({ tid: t.tid, title: t.title, path: t.path, np: t.np, mode: mode, pages: pages, total: pages.length, done: 0, saved: 0, same: 0 });
    log.info('SimpCity: queued "' + t.title + '" — ' + pages.length + ' page(s) to fetch (' + mode + ')');
    scRunQueue();
}

function scStopError(msg) { var e = new Error(msg); e.scStop = true; return e; }

/** fetch one page of a thread and check it's really that page of that thread */
function scFetchPage(job, n) {
    var url = location.origin + (scBasePath(job.path) || scThreadPath(job.tid)) + (n > 1 ? 'page-' + n : '');
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/html' } }).then(function (res) {
        if (res.status === 429) throw scStopError('SimpCity answered 429 (too many requests) on page ' + n);
        if (!res.ok) throw scStopError('SimpCity answered ' + res.status + ' on page ' + n);
        return res.text();
    }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var root = doc.documentElement;
        if (root.getAttribute('data-template') !== 'thread_view') throw scStopError('page ' + n + ' isn\'t a thread page (a check page, or logged out?)');
        if (root.getAttribute('data-logged-in') === 'false') throw scStopError('you seem to be logged out');
        var ck = root.getAttribute('data-content-key');
        if (ck && ck !== 'thread-' + job.tid) throw scStopError('page ' + n + ' belongs to another thread (' + ck + ')');
        var cur = doc.querySelector('.pageNav-page--current a');
        var page = cur ? parseInt(cleanText(cur.textContent), 10) || 1 : 1;
        return { doc: doc, page: page };
    });
}

/** wait ms, showing the countdown; Pause holds it, Stop ends it; the lock is refreshed meanwhile */
function scWait(ms, isLong) {
    return new Promise(function (resolve) {
        var left = ms;
        var last = Date.now();
        var tick = setInterval(function () {
            var now = Date.now();
            if (!scState.paused) left -= now - last;
            last = now;
            scState.waitLeft = Math.max(0, left);
            scState.waitLong = isLong;
            GM_setValue(SC_LOCK_KEY, { id: scTabId, ts: now });
            scDraw();
            if (left <= 0 || scState.stopped) { clearInterval(tick); scState.waitLeft = 0; resolve(); }
        }, 200);
    });
}

async function scRunQueue() {
    if (scState.running || !scQueue.length) { scDraw(); return; }
    if (!scTakeLock()) {
        scState.error = 'Another SimpCity tab is saving thread pages — try again when it\'s done.';
        scQueue.length = 0;
        scDraw();
        return;
    }
    scState.running = true;
    scState.stopped = false;
    scState.paused = false;
    scState.error = '';
    var sinceBreak = 0;
    var burst = Math.round(scRand(scRange('scrapeBurst', 5, 10)));
    var first = true;
    try {
        while (scQueue.length && !scState.stopped) {
            var job = scQueue[0];
            scState.job = job;
            while (job.pages.length && !scState.stopped) {
                if (!first) {
                    var isLong = sinceBreak >= burst;
                    var ms = 1000 * scRand(isLong ? scRange('scrapePause', 3, 5) : scRange('scrapeDelay', 1, 3));
                    if (isLong) { sinceBreak = 0; burst = Math.round(scRand(scRange('scrapeBurst', 5, 10))); }
                    await scWait(ms, isLong);
                    while (scState.paused && !scState.stopped) await scWait(400, false);
                    if (scState.stopped) break;
                }
                first = false;
                var n = job.pages[0];
                scState.status = 'Fetching page ' + n + ' of ' + job.np + '…';
                scDraw();
                var r = await scFetchPage(job, n);
                sinceBreak++;
                job.pages.shift();
                if (r.page !== n) {
                    // past the end (the forum sends you to the last page): the thread is shorter than listed
                    log.info('SimpCity: page ' + n + ' of #' + job.tid + ' doesn\'t exist (got page ' + r.page + ') — thread has ' + r.page + ' pages');
                    job.np = r.page;
                    job.pages = job.pages.filter(function (p) { return p <= r.page; });
                    job.total = job.done + job.pages.length;
                    continue;
                }
                var posts = scCapturePosts(r.doc);
                if (!posts.length) throw scStopError('no posts found on page ' + n);
                var facts = scThreadFacts(n, r.doc);
                if (facts.np > job.np) {          // the thread grew while saving: add the new pages
                    for (var q = job.np + 1; q <= facts.np; q++) job.pages.push(q);
                    job.total += facts.np - job.np;
                    job.np = facts.np;
                }
                if (n === 1 || n === job.np) scSaveThreadInfo(job.tid, n, Date.now(), r.doc);
                var res = await scStorePage(job.tid, n, posts, Date.now(), true);
                job.done++;
                if (res === 'saved') job.saved++; else job.same++;
                scDraw();
            }
            if (!scState.stopped) {
                scQueue.shift();
                scFinished.push(job);
                log.info('SimpCity: "' + job.title + '" — ' + job.done + ' page(s) fetched: ' + job.saved + ' saved, ' + job.same + ' unchanged');
            }
        }
    } catch (e) {
        scState.error = e.scStop ? e.message : 'Stopped: ' + (e && e.message || e);
        log.warn('SimpCity: "Save all pages" stopped — ' + scState.error, e.scStop ? '' : e);
        scState.stopped = true;
    } finally {
        if (scState.stopped && scState.job && scQueue.indexOf(scState.job) !== -1) scFinished.push(scState.job);
        if (scState.stopped) scQueue.length = 0;
        scState.running = false;
        scState.status = '';
        scState.job = null;
        scDropLock();
        scDraw();
        scRefreshButtons();
    }
}

// the progress panel: bottom right by default, draggable by its title bar (position remembered), collapsible.
// It's rebuilt only when its content changes (a thread queued, started, finished…); in between, only the
// progress line, bar and title are updated — rebuilding it on every countdown tick replaced the buttons under
// the mouse, so a click could get lost.
var SC_PANEL_POS_KEY = 'ht_ui_scrape_pos';
var scLastSig = null;
var scLive = {};

function scPanelSig() {
    return [scPending.length ? scPending[0].tid + ':' + scPending.length : '', scState.running ? 1 : 0, scState.paused ? 1 : 0,
        scState.job ? scState.job.tid : '', scQueue.length, scFinished.length, scState.error, scState.min ? 1 : 0].join('|');
}

/** x, y in the panel's own (zoomed) CSS pixels; kept on screen */
function scPlacePanel(p, x, y) {
    var z = parseFloat(p.style.zoom) || 1;
    var r = p.getBoundingClientRect();
    var h = r.height || 60;
    x = Math.min(Math.max(0, x), Math.max(0, (window.innerWidth - (r.width || 380)) / z));
    y = Math.min(Math.max(0, y), Math.max(0, (window.innerHeight - 40) / z));
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.right = 'auto';
    p.style.bottom = 'auto';
    return { x: x, y: y, h: h };
}

function scMakePanel() {
    var p = el('div', { className: 'ht-scrape', 'data-ht-ui': '' });
    applyUiScale(p);
    var title = el('span', { className: 'ht-scrape-title', text: '📥 Save all pages' });
    var minBtn = el('button', { type: 'button', className: 'ht-scrape-min', title: 'Collapse / expand' });
    var head = el('div', { className: 'ht-scrape-head', title: 'Drag to move' }, [title, minBtn]);
    var content = el('div', { className: 'ht-scrape-body' });
    p.append(head, content);
    scLive.title = title;
    scLive.minBtn = minBtn;
    scLive.content = content;
    minBtn.addEventListener('click', function (ev) { ev.stopPropagation(); scState.min = !scState.min; scDraw(); });
    // drag by the title bar
    head.addEventListener('mousedown', function (ev) {
        if (ev.button !== 0 || ev.target === minBtn) return;
        ev.preventDefault();
        var r = p.getBoundingClientRect();
        var dx = ev.clientX - r.left;
        var dy = ev.clientY - r.top;
        var zoom = parseFloat(p.style.zoom) || 1;
        function move(e) { scPlacePanel(p, (e.clientX - dx) / zoom, (e.clientY - dy) / zoom); }
        function up() {
            document.removeEventListener('mousemove', move, true);
            document.removeEventListener('mouseup', up, true);
            p.classList.remove('ht-dragging');
            GM_setValue(SC_PANEL_POS_KEY, { x: parseFloat(p.style.left) || 0, y: parseFloat(p.style.top) || 0 });
        }
        p.classList.add('ht-dragging');
        document.addEventListener('mousemove', move, true);
        document.addEventListener('mouseup', up, true);
    });
    document.body.appendChild(p);
    var pos = GM_getValue(SC_PANEL_POS_KEY, null);
    if (pos && typeof pos.x === 'number') scPlacePanel(p, pos.x, pos.y);
    return p;
}

function scDraw() {
    if (!scState.panel) {
        if (!scPending.length && !scQueue.length && !scFinished.length && !scState.error) return;
        scState.panel = scMakePanel();
        scLastSig = null;
    }
    var sig = scPanelSig();
    if (sig !== scLastSig) { scLastSig = sig; scBuildPanel(); }
    scUpdateLive();
}

/** the parts that change every tick: title (also shown collapsed), progress line and bar */
function scUpdateLive() {
    var job = scState.job;
    var p = scState.panel;
    if (!p) return;
    var title = '📥 Save all pages';
    if (scState.running && job) title += ' — ' + job.done + '/' + job.total + (scQueue.length > 1 ? ' (+' + (scQueue.length - 1) + ')' : '') + (scState.paused ? ' · paused' : '');
    else if (scPending.length) title += ' — choose';
    else if (scState.error) title += ' — stopped';
    else if (scFinished.length) title += ' — done';
    if (scLive.title.textContent !== title) scLive.title.textContent = title;
    scLive.minBtn.textContent = scState.min ? '▢' : '–';
    p.classList.toggle('ht-min', !!scState.min);
    if (scLive.line && job) {
        var line = job.done + ' of ' + job.total + ' page' + (job.total === 1 ? '' : 's') + ' fetched';
        if (scState.paused) line += ' · paused';
        else if (scState.waitLeft > 0) line += ' · next in ' + (scState.waitLeft / 1000).toFixed(1) + ' s' + (scState.waitLong ? ' (longer pause)' : '');
        else if (scState.status) line += ' · ' + scState.status;
        if (scLive.line.textContent !== line) scLive.line.textContent = line;
    }
    if (scLive.bar && job) scLive.bar.style.width = (job.total ? Math.round(100 * job.done / job.total) : 0) + '%';
}

function scBuildPanel() {
    var p = scState.panel;
    scLive.line = null;
    scLive.bar = null;
    var kids = [];
    var btn = function (text, cls, fn, title) {
        var b = el('button', { type: 'button', className: 'ht-btn' + (cls ? ' ' + cls : ''), text: text, title: title || null });
        b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); fn(); });
        return b;
    };
    if (scPending.length) {
        var t = scPending[0];
        var set = scSavedSet(t.tid);
        var saved = Object.keys(set).length;
        var missing = 0;
        for (var n = 1; n <= t.np; n++) if (!set[n] || n === t.np) missing++;
        var d = scRange('scrapeDelay', 1, 3);
        kids.push(el('div', { className: 'ht-scrape-thread', text: t.title }));
        kids.push(el('div', { className: 'ht-sub', text: t.np + ' page' + (t.np === 1 ? '' : 's') + ' · ' + saved + ' already saved · ' + d[0] + '–' + d[1] + ' s between pages' +
            (scState.running ? ' · will wait for the current thread' : '') }));
        kids.push(el('div', { className: 'ht-buttons' }, [
            missing < t.np ? btn('Missing + last page (' + missing + ')', 'ht-active', function () { scPending.shift(); scQueueJob(t, 'missing'); }) : null,
            btn('All ' + t.np + ' page' + (t.np === 1 ? '' : 's'), missing < t.np ? '' : 'ht-active', function () { scPending.shift(); scQueueJob(t, 'all'); }),
            btn('Cancel', '', function () { scPending.shift(); scDraw(); }),
        ]));
    }
    var job = scState.job;
    if (scState.running && job) {
        var bar = el('span');
        var line = el('div', { className: 'ht-sub' });
        scLive.bar = bar;
        scLive.line = line;
        kids.push(el('div', { className: 'ht-scrape-thread', text: job.title }));
        kids.push(el('div', { className: 'ht-scrape-bar' }, [bar]));
        kids.push(line);
        if (scQueue.length > 1) {
            kids.push(el('div', { className: 'ht-sub', text: 'Queued next: ' + scQueue.slice(1).map(function (j) { return j.title; }).join(', ') }));
        }
        kids.push(el('div', { className: 'ht-buttons' }, [
            btn(scState.paused ? '▶ Resume' : '⏸ Pause', '', function () { scState.paused = !scState.paused; scDraw(); }),
            btn('⏹ Stop', 'ht-danger', function () { scState.stopped = true; scState.paused = false; scDraw(); }),
        ]));
    }
    if (!scState.running && (scFinished.length || scState.error)) {
        scFinished.slice(-5).forEach(function (j) {
            kids.push(el('div', { className: 'ht-sub' }, [
                el('b', { text: j.title }), ': ' + j.done + ' of ' + j.total + ' page' + (j.total === 1 ? '' : 's') + ' fetched · ' + j.saved + ' saved · ' + j.same + ' unchanged',
            ]));
        });
        if (scState.error) kids.push(el('div', { className: 'ht-scrape-error', text: '⚠ ' + scState.error }));
        if (!scPending.length) {
            kids.push(el('div', { className: 'ht-buttons' }, [btn('Close', '', function () {
                scFinished.length = 0;
                scState.error = '';
                p.remove();
                scState.panel = null;
            })]));
        }
    }
    scLive.content.replaceChildren.apply(scLive.content, kids.filter(Boolean));
}

var scSaveButtons = [];   // [button, thread] pairs on the page, refreshed after saving

function scSaveButtonText(tid, np) {
    var saved = Object.keys(scSavedSet(tid)).length;
    return '📥 ' + (saved ? saved + '/' + np : np) + ' page' + (np === 1 ? '' : 's');
}

function scMakeSaveButton(t, cls) {
    var b = el('button', {
        type: 'button', className: cls, 'data-ht-ui': '',
        title: 'History Tracker: save all pages of this thread (one at a time, with pauses) to read them later in 🕘 History — even offline',
    });
    b.textContent = scSaveButtonText(t.tid, t.np);
    b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); scRequestSaveAll(t); });
    scSaveButtons.push([b, t]);
    return b;
}

function scRefreshButtons() {
    scSaveButtons.forEach(function (x) { if (x[0].isConnected) x[0].textContent = scSaveButtonText(x[1].tid, x[1].np); });
}

/** thread page: "📥 Save all pages" next to the 👁 button */
function scAddThreadSaveButton(tid, page) {
    var f = scThreadFacts(page);
    var path = scBasePath(f.p) || scThreadPath(tid);
    var b = scMakeSaveButton({ tid: tid, title: f.t || 'Thread #' + tid, path: path, np: f.np || 1 }, 'ht-tbtn ht-tbtn-save');
    var anchor = document.querySelector('h1.p-title-value .ht-tbtn');
    if (anchor) anchor.insertAdjacentElement('afterend', b);
    else (document.querySelector('h1.p-title-value') || document.body).appendChild(b);
}

/** watched threads page: a small 📥 button on each row */
function scAddListSaveButtons() {
    document.querySelectorAll('.structItem--thread').forEach(function (row) {
        if (row.querySelector('.ht-rowsave')) return;
        var r = scParseListRow(row);
        if (!r || !r.item.p) return;
        var b = scMakeSaveButton({ tid: r.id, title: r.item.t, path: r.item.p, np: r.item.np || 1 }, 'ht-rowsave');
        var title = row.querySelector('.structItem-title');
        if (title) title.appendChild(b);
    });
}

window.addEventListener('beforeunload', function (ev) {
    if (!scState.running) return;
    ev.preventDefault();
    ev.returnValue = 'History Tracker is still saving thread pages.';
});
window.addEventListener('pagehide', scDropLock);

// ── Thread page button ───────────────────────────────────────────────────

/** "👁 Seen 3× before" + whether there's anything new since, and the furthest page you'd read */
function scDecorateThreadButton(btn, tid) {
    var e = torrents().get(tid);
    var x = (e && e.x) || {};
    var pages = scPageKeys(tid).length;
    btn.title = 'History Tracker: your visits to this thread' + (x.rd ? ' · read up to page ' + x.rd : '') +
        (pages ? ' · ' + pages + ' page' + (pages === 1 ? '' : 's') + ' saved' : '');
}

// ── History window: Watched tab ──────────────────────────────────────────

/** Threads tab: forum, pages read / saved */
function scThreadRowExtra(t) {
    var x = t.x || {};
    var saved = scPageKeys(t.id, 'sc', true).length;
    var np = Math.max(x.np || 0, (readWatched('sc')[t.id] || {}).np || 0);
    return (x.fo ? ' · ' + x.fo : '') + (np ? ' · ' + np + ' page' + (np === 1 ? '' : 's') : '') + (saved ? ' · ' + saved + ' saved' : '');
}

function scPrefixChips(pf) {
    return (pf || []).map(function (p) { return el('span', { className: 'ht-prefix', text: p }); });
}

/** the watched threads joined with your visits */
function scWatchedItems() {
    var all = readWatched('sc');
    var tor = torrents('sc');
    return Object.keys(all).map(function (k) {
        var id = parseInt(k, 10);
        var w = all[k];
        var e = tor.get(id) || null;
        var x = (e && e.x) || {};
        var lp = Math.max(w.lp || 0, x.lp || 0);
        return {
            id: id, g: 'sc', w: w, e: e, t: w.t || (e && e.t) || 'Thread #' + id, lp: lp,
            l: e ? e.l : 0, c: e ? e.c : 0, f: e ? e.f : 0, isNew: !!(e && lp > e.l),
        };
    });
}

function renderWatchedTab(body, filter, onChange, openDetails) {
    renderListTab(body, {
        filter: filter,
        noSites: true,
        placeholder: 'Find a watched thread… (title, prefix, forum or starter)',
        emptyText: 'No watched threads saved yet — open your Watched Threads page on SimpCity (each page you open is saved).',
        sorts: [['lp', 'Last post'], ['new', 'New posts first'], ['mine', 'My last visit'], ['az', 'A → Z'], ['added', 'Recently watched']],
        sortFns: {
            lp: function (a, b) { return b.lp - a.lp; },
            new: function (a, b) { return (b.isNew - a.isNew) || (b.lp - a.lp); },
            mine: function (a, b) { return b.l - a.l || b.lp - a.lp; },
            az: function (a, b) { return a.t.localeCompare(b.t, undefined, { sensitivity: 'base' }); },
            added: function (a, b) { return (b.w.a || 0) - (a.w.a || 0); },
        },
        items: scWatchedItems,
        match: function (it, q) {
            if (/^\d+$/.test(q)) return String(it.id).indexOf(q) === 0;
            return [it.t, it.w.fo, it.w.st].concat(it.w.pf || []).join(' ').toLowerCase().indexOf(q) !== -1;
        },
        top: function (text, items) {
            if (text || !items.length) return null;
            var nNew = items.filter(function (it) { return it.isNew; }).length;
            var never = items.filter(function (it) { return !it.e; }).length;
            var seen = Math.max.apply(null, [0].concat(items.map(function (it) { return it.w.s || 0; })));
            var watchedUrl = originOf('sc') + '/watched/threads';
            return el('div', { className: 'ht-action' }, [
                el('span', {}, [
                    el('b', { text: String(items.length) }), ' watched thread' + (items.length === 1 ? '' : 's'),
                    nNew ? [' · ', el('b', { className: 'ht-newtext', text: nNew + ' with new posts' }), ' since your last visit'] : null,
                    never ? ' · ' + never + ' never opened' : null,
                    seen ? el('span', { className: 'ht-sub', text: ' · list last updated ' + ago(seen) }) : null,
                ].flat()),
                el('a', linkProps('sc', watchedUrl, { className: 'ht-ok', title: 'Each page of the list you open is saved', text: '⭐ Watched threads on SimpCity' })),
            ]);
        },
        row: function (it, reload) {
            var w = it.w;
            var x = (it.e && it.e.x) || {};
            var pages = scPageKeys(it.id).length;
            var infoBtn = el('button', { type: 'button', className: 'ht-btn ht-icon', title: 'Details & saved pages (read them here)', text: 'ℹ️' });
            var del = el('button', { type: 'button', className: 'ht-btn ht-icon ht-danger', title: 'Remove from this list (doesn\'t unwatch it on SimpCity)', text: '✕' });
            var facts = [w.fo, w.rp ? w.rp + ' replies' : '', w.vw ? w.vw + ' views' : '', w.np > 1 ? w.np + ' pages' : ''].filter(Boolean).join(' · ');
            var mine = it.e
                ? 'You: ' + it.c + ' visit' + (it.c === 1 ? '' : 's') + ' · last ' + ago(it.l) + (x.lr ? ' (page ' + x.lr + ')' : '') +
                    (x.rd && x.rd !== x.lr ? ' · read up to page ' + x.rd : '') + (pages ? ' · ' + pages + ' page' + (pages === 1 ? '' : 's') + ' saved' : '')
                : 'Not opened yet';
            var lastPage = Math.max(w.np || 1, x.np || 1);
            var row = el('div', { className: 'ht-row' + (it.isNew ? ' ht-row-new' : '') }, [
                coverEl(w.cv || (it.e && it.e.cv), null, originOf('sc') + '/'),
                el('div', { className: 'ht-main' }, [
                    el('div', { className: 'ht-titleline' }, scPrefixChips(w.pf).concat([
                        el('a', linkProps('sc', torrentUrl('sc', it.id), { className: 'ht-title', text: it.t })),
                    ])),
                    el('div', { className: 'ht-sub', text: facts }),
                    el('div', { className: 'ht-sub' }, [
                        it.lp ? el('span', { title: fmtDateTime(it.lp), text: 'Last post ' + ago(it.lp) + (w.lpu ? ' by ' + w.lpu : '') }) : 'Last post unknown',
                        ' · ',
                        el('span', { className: it.e ? 'ht-mine' : 'ht-never', text: mine }),
                    ]),
                ]),
                el('div', { className: 'ht-side' }, [
                    it.isNew ? el('a', linkProps('sc', scPageUrl(it.id, lastPage), { className: 'ht-newpill', title: 'New posts since your last visit — open the last page', text: 'new' })) : null,
                    it.e ? countPill(it.c) : null,
                    infoBtn, del,
                ]),
            ]);
            infoBtn.addEventListener('click', function () { openDetails(it.id, 'sc', function () { reload(); onChange(); }); });
            del.addEventListener('click', function () {
                if (!confirm('Remove "' + it.t + '" from your saved watched threads? (It stays watched on SimpCity, and your visits and saved pages are kept.)')) return;
                var all = readWatched('sc');
                delete all[it.id];
                writeWatched(all);
                reload();
                onChange();
            });
            return row;
        },
    });
}

// ── History window: thread details ───────────────────────────────────────

/** the thread's facts (from the watched list and its pages) */
function scFactsRow(w, x) {
    var facts = [];
    var fo = x.fo || w.fo;
    if (fo) facts.push(['Forum', fo]);
    if (x.st || w.st) facts.push(['Started by', (x.st || w.st) + ((x.sd || w.sd) ? ', ' + fmtDate(x.sd || w.sd) : '')]);
    var np = Math.max(x.np || 0, w.np || 0);
    if (np) facts.push(['Pages', String(np)]);
    if (w.rp) facts.push(['Replies', w.rp]);
    if (w.vw) facts.push(['Views', w.vw]);
    var lp = Math.max(x.lp || 0, w.lp || 0);
    var lpu = (x.lp || 0) >= (w.lp || 0) ? x.lpu || w.lpu : w.lpu || x.lpu;
    if (lp) facts.push(['Last post', fmtDateTime(lp) + ' (' + ago(lp) + ')' + (lpu ? ' by ' + lpu : '')]);
    return el('div', { className: 'ht-facts' }, facts.map(function (f) {
        return el('span', { className: 'ht-fact' }, [el('span', { className: 'ht-sub', text: f[0] + ' ' }), f[1]]);
    }));
}

/**
 * saved pages of a thread, each one rendered here on demand — with a search over all of them on top:
 * matching posts are listed (page, post #, author, snippet); a click opens that page at the post, and the
 * text is highlighted in every page you open while the search is on.
 */
function scSavedPagesSection(tid) {
    var wrap = el('div');
    var pages = scSavedPages(tid, 'sc');
    wrap.appendChild(el('div', { className: 'ht-label', text: 'Saved pages' + (pages.length ? ' (' + pages.length + ')' : '') }));
    if (!pages.length) {
        wrap.appendChild(el('p', { className: 'ht-note', text: getSetting('saveThreadPosts')
            ? 'None saved yet — each page of the thread you open is saved (that page\'s posts only).'
            : 'Saving thread pages is off (Settings & data).' }));
        return wrap;
    }

    // ── search over the saved pages ──
    var query = '';
    var decoded = {};            // page → Promise of [posts with .tx = plain text]
    function postsOf(pg) {
        if (!decoded[pg.page]) {
            decoded[pg.page] = decodeVersion(pg.v).then(function (json) {
                var posts = JSON.parse(json);
                posts.forEach(function (p) {
                    var doc = new DOMParser().parseFromString('<!doctype html><body>' + String(p.h || ''), 'text/html');
                    p.tx = cleanText(doc.body.textContent);
                });
                return posts;
            });
        }
        return decoded[pg.page];
    }
    var input = el('input', { type: 'search', placeholder: 'Search the ' + pages.length + ' saved page' + (pages.length === 1 ? '' : 's') + ' of this thread… (text or author)', autocomplete: 'off', spellcheck: 'false' });
    var summary = el('div', { className: 'ht-sub' });
    var results = el('div', { className: 'ht-hits' });
    wrap.appendChild(el('div', { className: 'ht-thread-search' }, [input, summary, results]));

    function runSearch() {
        query = cleanText(input.value);
        var q = query.toLowerCase();
        rows.forEach(function (r) { if (r.out) scHighlight(r.out, query); });
        results.replaceChildren();
        if (q.length < 2) { summary.textContent = q ? 'Type at least 2 characters.' : ''; return; }
        summary.textContent = 'Searching…';
        var mine = q;
        Promise.all(pages.map(function (pg) {
            return postsOf(pg).then(function (posts) { return { pg: pg, posts: posts }; }, function () { return { pg: pg, posts: [] }; });
        })).then(function (all) {
            if (mine !== cleanText(input.value).toLowerCase()) return;
            var hits = [];
            var total = 0;
            all.forEach(function (x) {
                x.posts.forEach(function (p) {
                    var n = scCount(p.tx.toLowerCase(), q);
                    var byAuthor = String(p.a || '').toLowerCase().indexOf(q) !== -1;
                    if (n || byAuthor) { hits.push({ page: x.pg.page, p: p, n: n }); total += n || 1; }   // a post by that author counts once
                });
            });
            var nPages = {};
            hits.forEach(function (h) { nPages[h.page] = 1; });
            summary.textContent = hits.length
                ? total + ' match' + (total === 1 ? '' : 'es') + ' in ' + hits.length + ' post' + (hits.length === 1 ? '' : 's') + ' on ' + Object.keys(nPages).length + ' page' + (Object.keys(nPages).length === 1 ? '' : 's') + (hits.length > 200 ? ' — showing the first 200' : '')
                : 'No matches in the saved pages.';
            hits.slice(0, 200).forEach(function (h) {
                var item = el('button', { type: 'button', className: 'ht-hit', title: 'Open page ' + h.page + ' at this post' }, [
                    el('div', { className: 'ht-hit-head' }, [
                        el('b', { text: 'Page ' + h.page + ' · #' + (h.p.n || '?') }), ' ',
                        el('span', { text: h.p.a || 'Guest' }),
                        h.p.d ? el('span', { className: 'ht-sub', text: ' · ' + fmtDateTime(h.p.d) }) : null,
                        h.n > 1 ? el('span', { className: 'ht-sub', text: ' · ' + h.n + ' matches' }) : null,
                    ]),
                    scSnippet(h.p.tx, query),
                ]);
                item.addEventListener('click', function () { openPage(h.page, h.p.i); });
                results.appendChild(item);
            });
        });
    }
    var t;
    input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(runSearch, 250); });
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { clearTimeout(t); runSearch(); } });

    // ── the pages ──
    var box = el('div', { className: 'ht-pres' });
    var rows = [];
    function openPage(page, postId) {
        var r = rows.filter(function (x) { return x.page === page; })[0];
        if (!r) return;
        r.show(true).then(function () {
            var target = postId ? r.out.querySelector('.ht-post[data-ht-post="' + postId + '"]') : r.out;
            if (!target) return;
            target.scrollIntoView({ block: 'start', behavior: 'smooth' });
            target.classList.add('ht-post-focus');
            setTimeout(function () { target.classList.remove('ht-post-focus'); }, 2000);
        });
    }
    pages.forEach(function (pg) {
        var v = pg.v;
        var renderBtn = el('button', { type: 'button', className: 'ht-btn', text: '🖼 Read' });
        var open = el('a', linkProps('sc', scPageUrl(tid, pg.page), { className: 'ht-btn', target: '_blank', rel: 'noopener', title: 'Open this page on SimpCity', text: '↗' }));
        var row = el('div', { className: 'ht-row' }, [
            el('div', { className: 'ht-main' }, [
                el('div', { style: 'color:#e0e0e0;font-weight:600', text: 'Page ' + pg.page + ' · ' + v.n + ' post' + (v.n === 1 ? '' : 's') + (v.a ? ' (#' + v.a + (v.e && v.e !== v.a ? '–#' + v.e : '') + ')' : '') }),
                el('div', { className: 'ht-sub', text: 'saved ' + fmtDateTime(v.t) + (v.l && v.l - v.t > 60000 ? ' · last seen ' + ago(v.l) : '') + ' · ' + fmtBytes(v.b || 0) }),
            ]),
            el('div', { className: 'ht-side' }, [renderBtn, open]),
        ]);
        var r = { page: pg.page, out: null, ready: null };
        /** show (keepOpen) or toggle the page; resolves once its posts are on screen */
        r.show = function (keepOpen) {
            hideZoom();
            if (r.out) {
                if (keepOpen) return r.ready;
                r.out.remove(); r.out = null; r.ready = null; renderBtn.classList.remove('ht-active');
                return Promise.resolve();
            }
            renderBtn.classList.add('ht-active');
            var target = el('div', { className: 'ht-render ht-posts', text: 'Loading…' });
            r.out = target;
            row.appendChild(target);
            r.ready = postsOf(pg).then(function (posts) {
                if (r.out !== target) return;
                target.replaceChildren(scRenderPosts(posts));
                if (query) scHighlight(target, query);
            }).catch(function (err) {
                log.error('SimpCity: reading saved page ' + pg.page + ' of #' + tid + ' failed', err);
                target.textContent = 'Couldn\'t read the saved page.';
            });
            return r.ready;
        };
        renderBtn.addEventListener('click', function () { r.show(false); });
        rows.push(r);
        box.appendChild(row);
    });
    wrap.appendChild(box);
    return wrap;
}

function scCount(hay, q) {
    var n = 0;
    for (var i = hay.indexOf(q); i !== -1; i = hay.indexOf(q, i + q.length)) n++;
    return n;
}

/** ~200 characters around the first match, the match itself highlighted */
function scSnippet(text, query) {
    var q = query.toLowerCase();
    var i = text.toLowerCase().indexOf(q);
    var box = el('div', { className: 'ht-hit-snippet' });
    if (i === -1) { box.textContent = text.slice(0, 200) + (text.length > 200 ? '…' : ''); return box; }
    var from = Math.max(0, i - 90);
    var to = Math.min(text.length, i + q.length + 110);
    box.append((from > 0 ? '…' : '') + text.slice(from, i), el('mark', { className: 'ht-hl', text: text.slice(i, i + q.length) }),
        text.slice(i + q.length, to) + (to < text.length ? '…' : ''));
    return box;
}

/** highlight every occurrence of query in root's text (previous highlights are removed first) */
function scHighlight(root, query) {
    root.querySelectorAll('mark.ht-hl').forEach(function (m) { m.replaceWith(document.createTextNode(m.textContent)); });
    root.normalize();
    var q = String(query || '').toLowerCase();
    if (q.length < 2) return 0;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [];
    for (var n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.toLowerCase().indexOf(q) !== -1) nodes.push(n);
    var count = 0;
    nodes.forEach(function (node) {
        var text = node.nodeValue;
        var low = text.toLowerCase();
        var frag = document.createDocumentFragment();
        var last = 0;
        for (var i = low.indexOf(q); i !== -1; i = low.indexOf(q, i + q.length)) {
            if (i > last) frag.appendChild(document.createTextNode(text.slice(last, i)));
            frag.appendChild(el('mark', { className: 'ht-hl', text: text.slice(i, i + q.length) }));
            last = i + q.length;
            count++;
        }
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.replaceWith(frag);
    });
    // open the spoilers that hold a match, so it's visible
    root.querySelectorAll('details').forEach(function (d) { if (d.querySelector('mark.ht-hl')) d.open = true; });
    return count;
}

/** saved posts → nodes (each post's HTML is cleaned again here, like any saved post) */
function scRenderPosts(posts) {
    var frag = document.createDocumentFragment();
    (Array.isArray(posts) ? posts : []).forEach(function (p) {
        var head = el('div', { className: 'ht-post-head' }, [
            el('a', linkProps('sc', originOf('sc') + '/posts/' + p.i + '/', { target: '_blank', rel: 'noopener', title: 'Open this post on SimpCity', text: '#' + (p.n || '?') })),
            el('b', { text: p.a || 'Guest' }),
            p.d ? el('span', { className: 'ht-sub', title: fmtDateTime(p.d), text: fmtDateTime(p.d) }) : null,
        ]);
        var bodyEl = el('div', { className: 'ht-post-body' });
        bodyEl.appendChild(renderSafeHtml(String(p.h || ''), originOf('sc') + '/'));
        frag.appendChild(el('div', { className: 'ht-post', 'data-ht-post': String(p.i) }, [head, bodyEl]));
    });
    return frag;
}

/** thread details: watched facts, your visits (with the page of each) and the saved pages */
function scBuildThreadDetails(tid, onForgotten, showTitle) {
    var e = torrents('sc').get(tid);
    var w = readWatched('sc')[tid] || {};
    var x = (e && e.x) || {};
    var title = (e && e.t) || w.t || 'Thread #' + tid;
    var body = el('div');
    if (showTitle) {
        body.appendChild(el('div', { className: 'ht-detail-title' }, [siteTag('sc')].concat(scPrefixChips(x.pf || w.pf), [
            el('a', linkProps('sc', torrentUrl('sc', tid), { title: 'Open the thread', text: title })),
            el('span', { className: 'ht-sub', text: ' #' + tid + (w.t ? ' · ⭐ watched' : '') }),
        ])));
    }
    var cover = (e && e.cv) || w.cv;
    body.appendChild(el('div', { className: 'ht-torrent-head' }, [
        cover ? coverEl(cover, 'ht-thread-cover', originOf('sc') + '/') : null,
        el('div', { className: 'ht-stats' }, e ? [
            el('div', { className: 'ht-stat' }, [el('b', { text: String(e.c) }), el('span', { text: 'visits' })]),
            el('div', { className: 'ht-stat' }, [el('b', { text: fmtDate(e.f) }), el('span', { text: 'first visit' })]),
            el('div', { className: 'ht-stat' }, [el('b', { text: fmtDate(e.l) }), el('span', { text: 'last visit' + (x.lr ? ' (page ' + x.lr + ')' : '') })]),
            el('div', { className: 'ht-stat' }, [el('b', { text: x.rd ? String(x.rd) : '–' }), el('span', { text: 'furthest page read' })]),
            el('div', { className: 'ht-stat' }, [el('b', { text: fmtDur(totalSeconds(e)) || '–' }), el('span', { text: 'time on pages, total' })]),
        ] : [el('div', { className: 'ht-stat' }, [el('b', { text: '–' }), el('span', { text: 'not opened yet' })])]),
    ]));
    body.appendChild(el('div', { className: 'ht-label', text: 'Thread' }));
    body.appendChild(scFactsRow(w, x));
    var tags = x.tg || [];
    if (tags.length) body.appendChild(el('div', { className: 'ht-facts', style: 'margin-top:6px' }, [el('span', { className: 'ht-sub', text: 'Tags ' })].concat(tags.map(function (t) { return el('span', { className: 'ht-prefix ht-tag', text: t }); }))));
    if (e) {
        body.appendChild(el('div', { className: 'ht-label', text: 'Visits' }));
        body.appendChild(timesBox(e.v || []));
    }
    body.appendChild(scSavedPagesSection(tid));
    var btns = el('div', { className: 'ht-buttons' });
    var nSaved = scPageKeys(tid, 'sc').length;
    if (nSaved) {
        var delPages = el('button', { type: 'button', className: 'ht-btn ht-danger', text: 'Delete saved pages (' + nSaved + ')' });
        delPages.addEventListener('click', function () {
            if (!confirm('Delete the ' + nSaved + ' saved page(s) of "' + title + '"? Your visits are kept.')) return;
            scPageKeys(tid, 'sc').forEach(function (k) { GM_deleteValue(k); });
            if (onForgotten) onForgotten();
        });
        btns.appendChild(delPages);
    }
    if (e) {
        var forget = el('button', { type: 'button', className: 'ht-btn ht-danger', text: 'Forget this thread' });
        forget.addEventListener('click', function () {
            if (!confirm('Forget all ' + e.c + ' visits of "' + title + '" and its saved pages? (It stays in your watched threads.)')) return;
            forgetTorrent(tid, 'sc');
            if (onForgotten) onForgotten();
        });
        btns.appendChild(forget);
    }
    body.appendChild(btns);
    return body;
}
