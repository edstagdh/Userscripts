// [HF][EMP][PLAB][SC] History Tracker — SimpCity
// Part of history_tracker.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install history_tracker.user.js.
// Version 4.1
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

/** the thread's own path (/threads/slug.N/) when we've seen it, else /threads/N/ (the forum redirects that) */
function scThreadPath(id) {
    var w = readWatched('sc')[id];
    if (w && w.p) return w.p;
    var e = torrents('sc').get(id);
    if (e && e.x && e.x.p) return e.x.p;
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
function scPageTitle() {
    var h1 = document.querySelector('h1.p-title-value');
    if (h1) {
        var c = h1.cloneNode(true);
        c.querySelectorAll('.label, .labelLink, .label-append, [data-ht-ui]').forEach(function (n) { n.remove(); });
        var t = cleanText(c.textContent);
        if (t) return t.slice(0, 300);
    }
    return cleanText(document.title.split(' | ')[0]).replace(/^[^-]{1,30} - /, '').slice(0, 300);
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
        p: /^\/threads\//.test(path) ? path : '',
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

/** facts about the thread from its page */
function scThreadFacts(page) {
    var f = {};
    var canon = document.querySelector('link[rel="canonical"]');
    try {
        var cp = new URL(canon ? canon.getAttribute('href') : location.href, location.href).pathname.replace(/page-\d+\/?$/i, '');
        if (/^\/threads\/[^\/]+\/$/.test(cp)) f.p = cp;
    } catch (e) { /* no path */ }
    f.t = scPageTitle();
    f.pf = scPrefixes(document.querySelector('h1.p-title-value'));
    var crumbs = document.querySelectorAll('ul.p-breadcrumbs:not(.p-breadcrumbs--bottom) a[href*="/forums/"]');
    var forum = crumbs[crumbs.length - 1];
    if (forum) { f.fo = cleanText(forum.textContent); f.fu = forum.getAttribute('href'); }
    var desc = document.querySelector('.p-body-header .p-description') || document.querySelector('.p-description');
    if (desc) {
        var starter = desc.querySelector('.username');
        if (starter) f.st = cleanText(starter.textContent);
        var sd = scTs(desc.querySelector('time'));
        if (sd) f.sd = sd;
        f.tg = Array.prototype.map.call(desc.querySelectorAll('.js-tagList a, .tagList a.tagItem'), function (a) { return cleanText(a.textContent); }).filter(Boolean).slice(0, 30);
    }
    var pages = 1;
    var nav = document.querySelector('.pageNav-main');
    if (nav) nav.querySelectorAll('a').forEach(function (a) { var n = parseInt(cleanText(a.textContent), 10); if (n > pages) pages = n; });
    f.np = Math.max(pages, page);
    var cv = coverUrl();
    if (cv) f.cv = cv;
    // watched or not: the thread's own Watch / Unwatch button
    var watch = null;
    document.querySelectorAll('a[href$="/watch"]').forEach(function (a) {
        var tx = cleanText(a.textContent).toLowerCase();
        if (tx === 'unwatch') watch = true;
        else if (tx === 'watch' && watch === null) watch = false;
    });
    f.w = watch;
    // the last post — known when this is the last page
    var posts = document.querySelectorAll('article.message--post[data-content^="post-"]');
    if (posts.length && page >= f.np) {
        var lastPost = posts[posts.length - 1];
        f.lp = scTs(lastPost.querySelector('.message-attribution-main time'));
        f.lpu = lastPost.getAttribute('data-author') || '';
    }
    return f;
}

/** a thread page: update the thread's facts and its watched state (both only read this page) */
function scSaveThreadInfo(tid, page, now) {
    var f;
    try { f = scThreadFacts(page); } catch (e) { log.warn('SimpCity: reading thread #' + tid + ' failed', e); return; }
    var keep = ['p', 'pf', 'fo', 'fu', 'st', 'sd', 'tg', 'np'];
    if (torrents().has(tid)) {
        updateTorrent(tid, function (e) {
            if (!e) return null;
            var x = e.x || {};
            keep.forEach(function (k) { if (f[k] !== undefined && f[k] !== '') x[k] = f[k]; });
            if (f.lp && f.lp >= (x.lp || 0)) { x.lp = f.lp; x.lpu = f.lpu; }
            x.rd = Math.max(x.rd || 0, page);        // furthest page read
            x.lr = page;                              // page of the latest visit
            e.x = x;
            return e;
        });
    }
    var all = readWatched('sc');
    if (f.w === true) {
        var w = all[tid] || { a: now };
        keep.concat(['t', 'cv']).forEach(function (k) { if (f[k] !== undefined && f[k] !== '') w[k] = f[k]; });
        if (f.lp && f.lp >= (w.lp || 0)) { w.lp = f.lp; w.lpu = f.lpu; }
        w.tw = now;                                   // seen watched on the thread page
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
function scCapturePosts() {
    var out = [];
    document.querySelectorAll('article.message--post[data-content^="post-"]').forEach(function (art) {
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

/** keys of a thread's saved pages */
function scPageKeys(tid, g) {
    var p = keysOf(g || 'sc').posts + tid + '_';
    return GM_listValues().filter(function (k) { return k.indexOf(p) === 0 && /_\d+$/.test(k.slice(p.length - 1)); });
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
    var json = JSON.stringify(posts);
    var h = hashText(json);
    var key = KEY.posts + tid + '_' + page;
    var cur = GM_getValue(key, null);
    if (cur && cur.h === h) {
        cur.l = now;
        GM_setValue(key, cur);
        log.debug('SimpCity: page ' + page + ' of #' + tid + ' unchanged since ' + fmtDateTime(cur.t));
        return;
    }
    encodeText(json).then(function (enc) {
        GM_setValue(key, {
            t: now, l: now, h: h, n: posts.length, b: json.length,
            a: posts[0].n, e: posts[posts.length - 1].n, z: enc.z, d: enc.d,
        });
        log.info('SimpCity: saved page ' + page + ' of #' + tid + ': ' + posts.length + ' posts (#' + posts[0].n + '–#' + posts[posts.length - 1].n + '), ' +
            fmtBytes(json.length) + ', stored as ' + fmtBytes(enc.d.length) + (enc.z ? ' (gzip)' : ' (uncompressed)'));
        scPrunePages(key);
    }).catch(function (e) { log.error('SimpCity: saving page ' + page + ' of #' + tid + ' failed', e); });
}

/** keep at most N saved thread pages: the ones you've looked at least recently go first */
function scPrunePages(keepKey) {
    var max = parseInt(getSetting('threadPagesMax'), 10) || 0;
    if (max <= 0) return;
    var keys = GM_listValues().filter(function (k) { return k.indexOf(KEY.posts) === 0; });
    if (keys.length <= max) return;
    var dated = keys.filter(function (k) { return k !== keepKey; }).map(function (k) {
        var v = GM_getValue(k, null);
        return [k, v ? v.l || v.t || 0 : 0];
    }).sort(function (a, b) { return a[1] - b[1]; });
    var drop = dated.slice(0, keys.length - max);
    drop.forEach(function (x) { GM_deleteValue(x[0]); });
    log.info('SimpCity: removed ' + drop.length + ' old saved thread page(s) (keeping ' + max + ')');
}

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
                coverEl(w.cv || (it.e && it.e.cv)),
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

/** saved pages of a thread, each one rendered here on demand */
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
    var box = el('div', { className: 'ht-pres' });
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
        var out = null;
        renderBtn.addEventListener('click', function () {
            hideZoom();
            if (out) { out.remove(); out = null; renderBtn.classList.remove('ht-active'); return; }
            renderBtn.classList.add('ht-active');
            out = el('div', { className: 'ht-render ht-posts', text: 'Loading…' });
            row.appendChild(out);
            var target = out;
            decodeVersion(v).then(function (json) {
                if (out !== target) return;
                target.replaceChildren(scRenderPosts(JSON.parse(json)));
            }).catch(function (err) {
                log.error('SimpCity: reading saved page ' + pg.page + ' of #' + tid + ' failed', err);
                target.textContent = 'Couldn\'t read the saved page.';
            });
        });
        box.appendChild(row);
    });
    wrap.appendChild(box);
    return wrap;
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
        bodyEl.appendChild(renderSafeHtml(String(p.h || '')));
        frag.appendChild(el('div', { className: 'ht-post' }, [head, bodyEl]));
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
        cover ? coverEl(cover) : null,
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
