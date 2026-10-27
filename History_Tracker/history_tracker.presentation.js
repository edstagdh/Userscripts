// [HF][EMP][PLAB][SC] History Tracker — Presentations: BBCode capture, storage and preview
// Part of history_tracker.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install history_tracker.user.js.
// Version 4.8
//
// Turns the torrent presentation (#descbox) back into BBCode (ported from [HF][EMP] Copy BBCode Button),
// stores it gzip-compressed, prunes old copies, and renders saved BBCode for the "🖼 Render" preview.
// Top-level code here only declares things: everything from the main script (settings, storage,
// log, el, …) is used inside functions, which run after the main script has loaded.

// ── Presentation → BBCode ────────────────────────────────────────────────
// Ported from [HF][EMP] Copy BBCode Button: walks #descbox and rebuilds the BBCode it was rendered from.

function presentationToBBCode(root) {
    var spoilerMap = new Map();
    var torrentMap = new Map();
    var userMap = new Map();

    function Node() { this.type = null; this.value = null; this.text = null; this.children = []; }
    function isElement(n) { return n && n.nodeType === 1; }

    function filterFooterNodes(nodes) {
        for (var i = nodes.length - 1; i >= 0; i--) {
            if (isElement(nodes[i]) && nodes[i].id === 'torrentsigbox') nodes.splice(i, 1);
        }
        return nodes;
    }

    function filterSpoilerNodes(nodes) {
        for (var i = nodes.length - 1; i >= 0; i--) {
            var n = nodes[i];
            if (isElement(n) && n.nodeName.toLowerCase() === 'blockquote' && n.className && n.className.includes('spoiler')) {
                var label = null;
                for (var j = i - 1; j >= Math.max(0, i - 5); j--) {
                    var prev = nodes[j];
                    if (isElement(prev) && prev.innerText && prev.innerText.trim()) {
                        label = prev.innerText.trim();
                        nodes.splice(j, 1);
                        i -= 1;
                        break;
                    }
                }
                spoilerMap.set(n, label);
            }
        }
        return nodes;
    }

    function filterTorrentNodes(nodes) {
        for (var i = nodes.length - 1; i >= 1; i--) {
            var prev = nodes[i - 1];
            var cur = nodes[i];
            if (isElement(prev) && prev.nodeName.toLowerCase() === 'script' && isElement(cur) && cur.nodeName.toLowerCase() === 'a') {
                var m = (cur.getAttribute('href') || '').match(/(\d+)/);
                if (m) { torrentMap.set(cur, m[1]); nodes.splice(i - 1, 1); }
            }
        }
        return nodes;
    }

    function filterUserNodes(nodes) {
        nodes.forEach(function (n) {
            if (isElement(n) && n.nodeName.toLowerCase() === 'a') {
                var href = n.getAttribute('href') || '';
                var fc = n.firstChild;
                if (/user.php\?/.test(href) && fc && fc.className === 'taglabel') {
                    var m = href.match(/(\d+)/);
                    if (m) userMap.set(n, m[1]);
                }
            }
        });
        return nodes;
    }

    function filterNodes(nodes) {
        nodes = filterFooterNodes(nodes);
        nodes = filterSpoilerNodes(nodes);
        nodes = filterTorrentNodes(nodes);
        nodes = filterUserNodes(nodes);
        // remove the filename link right before a mediainfo block
        for (var i = nodes.length - 2; i >= 0; i--) {
            var cur = nodes[i];
            var next = nodes[i + 1];
            if (isElement(cur) && isElement(next) && cur.nodeName.toLowerCase() === 'a' && next.classList && next.classList.contains('mediainfo')) {
                nodes.splice(i, 1);
            }
        }
        return nodes;
    }

    function normalizeHex(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) return '#' + hex.split('').map(function (c) { return c + c; }).join('').toUpperCase();
        if (hex.length === 6 || hex.length === 8) return '#' + hex.toUpperCase();
        return null;
    }

    function rgbaToHex(r, g, b, a) {
        var out = '#' + [r, g, b].map(function (x) { return Number(x).toString(16).padStart(2, '0'); }).join('');
        if (a !== undefined && a !== null) out += Math.round(Number(a) * 255).toString(16).padStart(2, '0');
        return out.toUpperCase();
    }

    function getColorValue(style) {
        if (!style) return null;
        var m = style.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)/i);
        if (m) return rgbaToHex(m[1], m[2], m[3], m[4]);
        m = style.match(/(?:^|;)\s*(?:background-)?color\s*:\s*(#[A-Fa-f0-9]{3,8})\b/);
        if (m) { var hex = normalizeHex(m[1]); if (hex) return hex; }
        m = style.match(/(?:^|;)\s*(?:background-)?color\s*:\s*([a-zA-Z]+)\b/);
        if (m) return m[1];
        m = style.match(/(?:^|;)\s*(?:background-)?color\s*:\s*([^;!]+)/);
        if (m) return m[1].trim();
        return null;
    }

    function getGradientValue(style) {
        if (!style) return null;
        var match = style.match(/gradient\(([^)]+)\)\s*;/i) || style.match(/gradient\(([^)]+)\)/i);
        if (!match) return null;
        var arr = match[1].split(',');
        for (var i = 0; i <= arr.length - 4; i++) {
            if (/rgba?\(/.test(arr[i])) arr.splice(i, 4, arr.slice(i, i + 4).join(','));
        }
        var values = arr.map(function (part, idx) {
            if (idx === 0) return part.trim();
            var color = getColorValue('color:' + part);
            var pct = part.match(/(\d+%)/g);
            return pct ? color + ' ' + pct.join(' ') : color;
        });
        return 'gradient:' + values.join(';');
    }

    function getTableValue(n, style) {
        var values = [];
        if (style) {
            if (/width:\s*/.test(style)) { var w = style.match(/width:\s*(\d+px|\d+%)/); if (w) values.push(w[1]); }
            if (/border:\s*none/.test(style)) values.push('nball');
            if (/(?:^|;)\s*(?:background-)?color\s*:/.test(style)) { var c = getColorValue(style); if (c) values.push(c); }
            if (/url\(/.test(style)) { var u = style.match(/url\(([^)]+)\)/); if (u) values.push(u[1]); }
            if (/gradient\(/.test(style)) { var g = getGradientValue(style); if (g) values.push(g); }
            if (/margin:\s*0px\s+auto\s+0px\s+0px/.test(style)) values.push('left');
            else if (/margin:\s*0px\s+0px\s+0px\s+auto/.test(style)) values.push('right');
            else if (/margin:\s*0px\s+auto/.test(style)) values.push('center');
        }
        if (isElement(n) && n.className && n.className.includes('nopad')) values.push('nopad');
        if (isElement(n) && n.className) {
            if (n.className.includes('vat')) values.push('vat');
            else if (n.className.includes('vam')) values.push('vam');
            else if (n.className.includes('vab')) values.push('vab');
        }
        return values.length ? values.join(',') : null;
    }

    function parseText(n) {
        var node = new Node();
        var text = (n.textContent || '').trim();
        text = text.replace(/\[n\]/g, '[n[n]]');
        var regex = /\[(b|i|u|s|color|font|size|tip|url|anchor|#|\*|img|hr|br|quote|code|pre|plain|cast|info|plot|screens|user|torrent|article|mediainfo|table|tr|td|bg|tex)(?:=[^\]]+)?\]/g;
        var match = text.match(regex);
        if (match) match.forEach(function (tag) { text = text.replace(tag, tag.replace(/\]$/, '[n]]')); });
        node.text = text;
        return node;
    }

    function typed(type) { var node = new Node(); node.type = type; return node; }

    function parseBlockquote(n) {
        var node = new Node();
        if (n.className && n.className.includes && n.className.includes('spoiler')) {
            node.type = 'spoiler';
            node.value = spoilerMap.get(n) || null;
        } else {
            node.type = 'quote';
        }
        return node;
    }

    function parseA(n) {
        var node = new Node();
        var href = n.getAttribute('href') || '';
        if (torrentMap.has(n)) { node.type = 'torrent'; node.text = torrentMap.get(n); }
        else if (userMap.has(n)) { node.type = 'user'; node.text = userMap.get(n); }
        else if (n.className && n.className.includes('article')) {
            var m = href.match(/articles\.php\?topic=(.+)/);
            if (m) { node.type = 'article'; node.value = m[1]; }
        }
        else if (n.className === 'anchor') { node.type = '#'; node.value = n.getAttribute('id'); }
        else { node.type = 'url'; node.value = href.replace(/^https?:\/\/anonym\.es\/?\?/, ''); }
        return node;
    }

    function parseDiv(n) {
        var node = new Node();
        if (n.classList && n.classList.contains('mediainfo')) {
            node.type = 'mediainfo';
            node.text = n.textContent.replace(/\r\n/g, '\n');
            return node;
        }
        var style = n.getAttribute('style') || '';
        if (n.className === 'bbcode') { node.type = 'bg'; node.value = getTableValue(n, style); }
        else if (/text-align:\s*/.test(style)) {
            var m = style.match(/text-align:\s*([a-zA-Z]+)/);
            node.type = 'align';
            node.value = m ? m[1] : null;
        }
        return node;
    }

    function parseSpan(n) {
        var node = new Node();
        var c = n.getAttribute('class') || '';
        var style = n.getAttribute('style') || '';
        if (c) {
            if (/size/.test(c)) { node.type = 'size'; var m = c.match(/size(\d*)/); node.value = m ? m[1] : null; }
            else if (/tooltip/.test(c)) { node.type = 'tip'; node.value = n.getAttribute('title'); }
        } else if (/color:\s*/.test(style)) {
            node.type = 'color';
            node.value = getColorValue(style);
        } else if (/font-family:\s*/.test(style)) {
            node.type = 'font';
            var mm = style.match(/font-family:\s*(['"]?)([^,'"]+)\1/);
            var font = mm ? mm[2] : null;
            if (font === 'Helvetica Neue') font = 'Helvetica';
            else if (font === 'Palatino') font = 'Palatino Linotype';
            else if (font === 'TimesNewRoman') font = 'Times New Roman';
            node.value = font;
        } else if (/text-decoration:\s*/.test(style)) {
            var deco = style.match(/text-decoration:\s*([a-zA-Z-]+)/);
            node.type = deco && deco[1] === 'line-through' ? 's' : 'u';
        }
        return node;
    }

    function parseImg(n) {
        var node = new Node();
        var alt = n.getAttribute('alt') || '';
        if (n.className && n.className.includes('image')) {
            var src = n.hasAttribute('src') ? n.getAttribute('src') : n.getAttribute('data-src');
            if (n.className.includes('nopad')) { node.type = 'imgnm'; node.value = (alt && alt !== src) ? alt : null; }
            else if (n.className.includes('thumb')) node.type = 'thumb';
            else if (alt && alt !== src) { node.type = 'imgalt'; node.value = alt; }
            else {
                var w = n.getAttribute('width');
                var h = n.getAttribute('height');
                node.type = 'img';
                node.value = (w || h) ? [w, h].join(',') : null;
            }
            node.text = src;
        } else {
            node.type = alt || null;
        }
        return node;
    }

    function parseTableLike(n, type) {
        var node = new Node();
        node.type = type;
        node.value = getTableValue(n, n.getAttribute('style') || '');
        return node;
    }

    function parseDOM(n) {
        var node;
        switch (n.nodeName ? n.nodeName.toLowerCase() : '') {
            case '#text': node = parseText(n); break;
            case 'br': node = new Node(); node.text = '\n'; break;
            case 'hr': node = typed('hr'); break;
            case 'strong': node = typed('b'); break;
            case 'em': node = typed('i'); break;
            case 'code': node = typed('code'); break;
            case 'blockquote': node = parseBlockquote(n); break;
            case 'pre': node = typed('pre'); break;
            case 'li': node = typed('*'); break;
            case 'a': node = parseA(n); break;
            case 'div': node = parseDiv(n); break;
            case 'span': node = parseSpan(n); break;
            case 'img': node = parseImg(n); break;
            case 'table': node = parseTableLike(n, 'table'); break;
            case 'tr': node = parseTableLike(n, 'tr'); break;
            case 'td': node = parseTableLike(n, 'td'); break;
            default: node = new Node(); break;
        }
        if (node.type === 'mediainfo') return node;
        if (n.childNodes && n.childNodes.length) {
            var children = Array.from(n.childNodes);
            var mi = children.findIndex(function (c) { return isElement(c) && c.classList && c.classList.contains('mediainfo'); });
            if (mi !== -1) children = children.slice(0, mi + 1);
            node.children = filterNodes(children).map(parseDOM);
        }
        return node;
    }

    function build(node) {
        var out = '';
        if (node.type) {
            switch (node.type) {
                case 'img': case 'imgalt': case 'imgnm': case 'thumb': case 'torrent': case 'user': case 'mediainfo': case 'plain':
                    out += node.value ? '[' + node.type + '=' + node.value + ']' : '[' + node.type + ']';
                    out += node.text || '';
                    out += '[/' + node.type + ']';
                    break;
                case 'hr': case '*': case 'cast': case 'details': case 'info': case 'plot': case 'screens':
                    out += '[' + node.type + ']';
                    out += (node.children || []).map(build).join('');
                    break;
                default:
                    out += node.value ? '[' + node.type + '=' + node.value + ']' : '[' + node.type + ']';
                    out += (node.children || []).map(build).join('');
                    out += '[/' + node.type + ']';
            }
        } else if (node.text) {
            out += node.text;
        } else if (node.children) {
            out += node.children.map(build).join('');
        }
        return out;
    }

    return filterNodes(Array.from(root.childNodes)).map(parseDOM).map(build).join('');
}

// ── Saved presentations ──────────────────────────────────────────────────
// Stored gzip-compressed (base64) where the browser supports it: BBCode shrinks to roughly a quarter.

function bytesToB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

function encodeText(text) {
    if (typeof CompressionStream !== 'function') return Promise.resolve({ z: 0, d: text });
    try {
        var stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
        return new Response(stream).arrayBuffer()
            .then(function (buf) { return { z: 1, d: bytesToB64(new Uint8Array(buf)) }; })
            .catch(function () { return { z: 0, d: text }; });
    } catch (e) {
        return Promise.resolve({ z: 0, d: text });
    }
}

function decodeVersion(v) {
    if (!v.z) return Promise.resolve(v.d);
    var bin = atob(v.d);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
}

function readPresentations(tid, g) {
    var arr = GM_getValue(keysOf(g).pres + tid, null);
    return Array.isArray(arr) ? arr : [];
}

/** the presentation of the page being viewed: { text, f } — f: '' = BBCode (HF / EMP), 'html' = cleaned first post (Pornolab) */
function capturePresentation(tid) {
    if (GROUP === 'plab') {
        if (parseInt(new URL(location.href).searchParams.get('start'), 10) > 0) {
            log.debug('Pornolab: a later page of topic #' + tid + ' — the first post isn\'t on it, presentation not saved');
            return null;
        }
        var post = document.querySelector('.post_body');
        if (!post) { log.debug('No .post_body on this page — presentation not saved'); return null; }
        return { text: sanitizeHtmlToString(post.querySelector('.post-user-message') || post), f: 'html' };
    }
    var box = document.getElementById('descbox');
    if (!box) { log.debug('No #descbox on this page — presentation not saved'); return null; }
    return { text: presentationToBBCode(box), f: '' };
}

function savePresentation(tid, now) {
    var cap;
    try { cap = capturePresentation(tid); } catch (e) { log.warn('Reading the presentation of #' + tid + ' failed', e); return; }
    if (!cap) return;
    var text = cap.text;
    if (!text || !text.trim()) { log.debug('Presentation of #' + tid + ' is empty — not saved'); return; }
    var h = hashText(text);
    var key = KEY.pres + tid;
    var arr = readPresentations(tid);
    var lastV = arr[arr.length - 1];
    if (lastV && lastV.h === h) {           // unchanged since the last saved copy: just note we saw it again
        lastV.l = now;
        GM_setValue(key, arr);
        log.debug('Presentation of #' + tid + ' unchanged since ' + fmtDateTime(lastV.t));
        return;
    }
    encodeText(text).then(function (enc) {
        var v = { t: now, l: now, h: h, n: text.length, z: enc.z, d: enc.d };
        if (cap.f) v.f = cap.f;
        var list = readPresentations(tid);
        if (getSetting('presentationMode') === 'every') {
            list.push(v);
            var max = Math.max(1, parseInt(getSetting('presentationVersions'), 10) || 1);
            if (list.length > max) list = list.slice(-max);
        } else {
            list = [v];
        }
        GM_setValue(key, list);
        log.info('Saved presentation of #' + tid + ': ' + fmtBytes(text.length) + (cap.f === 'html' ? ' of cleaned HTML' : ' of BBCode') + ', stored as ' +
            fmtBytes(enc.d.length) + (enc.z ? ' (gzip)' : ' (uncompressed)') + ' · ' + list.length + ' cop' + (list.length === 1 ? 'y' : 'ies') + ' kept');
        prunePresentations(tid);
    }).catch(function (e) { log.error('Saving the presentation of #' + tid + ' failed', e); });
}

/** keep presentations only for the N most recently seen torrents */
function prunePresentations(keepId) {
    var max = parseInt(getSetting('presentationMaxTorrents'), 10) || 0;
    if (max <= 0) return;
    var keys = presKeys();
    if (keys.length <= max) return;
    var dated = keys.map(function (k) {
        var arr = GM_getValue(k, []);
        var last = arr.length ? arr[arr.length - 1].l || arr[arr.length - 1].t : 0;
        return [k, last];
    }).filter(function (x) { return x[0] !== KEY.pres + keepId; });
    dated.sort(function (a, b) { return a[1] - b[1]; });
    var drop = dated.slice(0, keys.length - max);
    drop.forEach(function (x) {
        GM_deleteValue(x[0]);
        GM_deleteValue(x[0].replace(/_pres_/, '_files_'));   // Pornolab: the file list goes with it
    });
    log.info('Removed ' + drop.length + ' old saved presentation(s) (keeping the ' + max + ' most recent torrents)');
}

// ── Pornolab: first post (cleaned HTML), download section, file list ──────
// Pornolab has no BBCode to rebuild, so the topic's first post is kept as HTML — but only through an allow-list:
// known formatting tags, a few style properties, http(s) links and images. Its own markup is translated on the
// way: var.postImg → <img>, spoilers (.sp-wrap / .sp-body) → <details>, .post-b / .post-i / … → <strong> / <em> / ….
// The same cleaner runs again when a saved post is rendered, so nothing stored can ever run code.

var HTML_KEEP = {
    DIV: 'div', P: 'p', SPAN: 'span', BR: 'br', HR: 'hr', B: 'strong', STRONG: 'strong', I: 'em', EM: 'em', U: 'u',
    S: 's', STRIKE: 's', DEL: 's', A: 'a', IMG: 'img', UL: 'ul', OL: 'ol', LI: 'li', TABLE: 'table', TBODY: 'tbody',
    THEAD: 'thead', TR: 'tr', TD: 'td', TH: 'th', PRE: 'pre', CODE: 'code', BLOCKQUOTE: 'blockquote', H1: 'h3', H2: 'h3',
    H3: 'h3', H4: 'h4', H5: 'h5', H6: 'h6', DETAILS: 'details', SUMMARY: 'summary', SUP: 'sup', SUB: 'sub', CENTER: 'div', FONT: 'span',
};
var HTML_DROP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, FORM: 1, INPUT: 1, BUTTON: 1, SELECT: 1, TEXTAREA: 1, NOSCRIPT: 1, SVG: 1, VIDEO: 1, AUDIO: 1, LINK: 1, META: 1 };
var HTML_STYLE_KEEP = ['color', 'background-color', 'font-size', 'font-weight', 'font-style', 'font-family', 'text-align', 'text-decoration', 'line-height'];
var HTML_CLASS_MAP = { 'post-b': 'strong', 'post-i': 'em', 'post-u': 'u', 'post-s': 's' };
var HTML_MAX_NODES = 40000;
// classes of our own that survive (a saved post is cleaned again when it's rendered)
var HTML_OWN_CLASSES = ['ht-unfurl', 'ht-embed', 'ht-quote-head', 'ht-host'];

/**
 * SimpCity (XenForo) shortens outgoing links to /redirect/?to=<base64>; the saved copy keeps the real address,
 * so it still works when the forum is down.
 */
function decodeRedirectUrl(href) {
    if (!href || href.indexOf('/redirect/') === -1) return href;
    try {
        var u = new URL(href, location.href);
        if (!/^\/redirect\/?$/.test(u.pathname)) return href;
        var to = u.searchParams.get('to');
        if (!to) return href;
        var bin = atob(to.replace(/-/g, '+').replace(/_/g, '/'));
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var real = new TextDecoder('utf-8').decode(bytes);
        return /^https?:\/\//i.test(real) ? real : href;
    } catch (e) { return href; }
}

/** an embedded player (iframe / video / click-to-load media) kept as a plain link */
function embedLink(src, label) {
    var url = cleanUrl(src);
    if (!url) return null;
    return el('div', { className: 'ht-embed' }, ['▶ ' + (label || 'Embedded media') + ': ',
        el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: url })]);
}

function cleanStyle(style) {
    if (!style) return '';
    var out = [];
    String(style).split(';').forEach(function (decl) {
        var i = decl.indexOf(':');
        if (i < 0) return;
        var prop = decl.slice(0, i).trim().toLowerCase();
        var val = decl.slice(i + 1).trim();
        if (HTML_STYLE_KEEP.indexOf(prop) === -1 || !val || val.length > 80) return;
        if (/url\s*\(|expression|javascript:|[<>{}\\]/i.test(val)) return;
        out.push(prop + ': ' + val);
    });
    return out.join('; ');
}

function cleanUrl(u) {
    if (!u) return null;
    try { u = new URL(String(u).trim(), location.href).href; } catch (e) { return null; }
    return /^https?:\/\//i.test(u) ? u : null;
}

/** allow-listed copy of a DOM subtree, as nodes of the current document */
function sanitizeNode(src, budget) {
    var frag = document.createDocumentFragment();
    (function walk(node, parent) {
        for (var c = node.firstChild; c; c = c.nextSibling) {
            if (--budget.n < 0) return;
            if (c.nodeType === 3) { parent.appendChild(document.createTextNode(c.nodeValue)); continue; }
            if (c.nodeType !== 1) continue;
            var tag = c.tagName.toUpperCase();
            var cls = c.classList || { contains: function () { return false; } };
            // embedded players: a link instead (nothing in a saved post may load or run anything by itself)
            if (tag === 'IFRAME' || tag === 'VIDEO') {
                var vsrc = c.getAttribute('src') || c.getAttribute('data-src');
                if (!vsrc && tag === 'VIDEO') { var so = c.querySelector('source[src]'); vsrc = so && so.getAttribute('src'); }
                var emb = embedLink(vsrc, tag === 'VIDEO' ? 'Video' : 'Embedded player');
                if (emb) parent.appendChild(emb);
                continue;
            }
            var onclick = c.getAttribute('onclick') || '';
            var lm = onclick.match(/loadMedia\(\s*this\s*,\s*['"]([^'"]+)['"]/);   // SimpCity's click-to-load media
            if (lm) { var emb2 = embedLink(lm[1], 'Embedded media'); if (emb2) parent.appendChild(emb2); continue; }
            if (HTML_DROP[tag]) continue;
            // XenForo (SimpCity) markup → plain elements
            if (cls.contains('bbCodeSpoiler')) {
                var stl = c.querySelector('.bbCodeSpoiler-button-title');
                var sdet = el('details', { className: 'ht-bb-spoiler' }, [el('summary', { text: 'Spoiler' + (stl && cleanText(stl.textContent) ? ': ' + cleanText(stl.textContent) : '') })]);
                walk(c.querySelector('.bbCodeSpoiler-content') || c, sdet);
                parent.appendChild(sdet);
                continue;
            }
            if (cls.contains('bbCodeSpoiler-button') || cls.contains('bbCodeBlock-expandLink') || cls.contains('js-extraPhrases') || cls.contains('u-srOnly')) continue;
            if (cls.contains('bbCodeBlock--unfurl')) {          // link preview card → a one-line link
                var ulink = cleanUrl(decodeRedirectUrl(c.getAttribute('data-url') || ''));
                var utl = c.querySelector('.js-unfurl-title');
                var utitle = cleanText(utl ? utl.textContent : '') || ulink;
                if (ulink) {
                    parent.appendChild(el('div', { className: 'ht-unfurl' }, [
                        el('a', { href: ulink, target: '_blank', rel: 'noopener noreferrer', text: utitle }),
                        ' ', el('span', { className: 'ht-host', text: cleanText(c.getAttribute('data-host')) || '' }),
                    ]));
                }
                continue;
            }
            if (cls.contains('bbCodeBlock--quote')) {
                var qbq = el('blockquote', { className: 'ht-bb-quote' });
                var qh = c.querySelector('.bbCodeBlock-title');
                if (qh && cleanText(qh.textContent)) qbq.appendChild(el('div', { className: 'ht-quote-head', text: cleanText(qh.textContent) }));
                walk(c.querySelector('.bbCodeBlock-expandContent') || c.querySelector('.bbCodeBlock-content') || c, qbq);
                parent.appendChild(qbq);
                continue;
            }
            if (cls.contains('bbCodeBlock--code')) {
                var code = c.querySelector('code, pre, .bbCodeBlock-content') || c;
                parent.appendChild(el('pre', { className: 'ht-bb-pre', text: code.textContent }));
                continue;
            }
            if (cls.contains('bbCodeBlock-title') && !c.closest('.bbCodeBlock--quote')) continue;
            if (tag === 'IMG' && cls.contains('smilie')) { parent.appendChild(document.createTextNode(c.getAttribute('alt') || '')); continue; }
            if (cls.contains('mc-note') || cls.contains('sp-title') || cls.contains('q-head-hidden')) continue;
            // Pornolab markup → plain elements
            if (tag === 'VAR' && cls.contains('postImg')) {
                var isrc = cleanUrl(c.getAttribute('title'));
                if (isrc) {
                    var img = el('img', { src: isrc, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', 'data-ht-zoom': isrc });
                    if (cls.contains('img-right')) img.setAttribute('style', 'float: right; margin: 0 0 6px 8px');
                    else if (cls.contains('img-left')) img.setAttribute('style', 'float: left; margin: 0 8px 6px 0');
                    parent.appendChild(img);
                }
                continue;
            }
            if (cls.contains('post-hr')) { parent.appendChild(el('hr')); continue; }
            if (cls.contains('post-br')) { parent.appendChild(el('br')); continue; }
            if (cls.contains('sp-body') || tag === 'DETAILS') {
                var title = cleanText(c.getAttribute('title')) || '';
                if (tag === 'DETAILS') { var sm = c.querySelector(':scope > summary'); title = sm ? cleanText(sm.textContent) : title; }
                var det = el('details', { className: 'ht-bb-spoiler' }, [el('summary', { text: title || 'Spoiler' })]);
                walk(c, det);
                parent.appendChild(det);
                continue;
            }
            if (tag === 'SUMMARY') continue;   // already used as the spoiler's title
            if (cls.contains('q-wrap') || cls.contains('q')) {
                if (cls.contains('q')) { var bq = el('blockquote', { className: 'ht-bb-quote' }); walk(c, bq); parent.appendChild(bq); }
                else walk(c, parent);
                continue;
            }
            if (cls.contains('c-wrap') || cls.contains('c-body')) {
                parent.appendChild(el('pre', { className: 'ht-bb-pre', text: c.textContent }));
                continue;
            }
            var mapped = null;
            for (var k in HTML_CLASS_MAP) if (cls.contains(k)) mapped = HTML_CLASS_MAP[k];
            var out = HTML_KEEP[tag] || mapped;
            if (!out) { walk(c, parent); continue; }        // unknown element: keep its contents only
            if (mapped && (tag === 'SPAN' || tag === 'DIV')) out = mapped;
            var e = document.createElement(out);
            var st = cleanStyle(c.getAttribute('style'));
            if (tag === 'CENTER') st = (st ? st + '; ' : '') + 'text-align: center';
            if (tag === 'FONT' && c.getAttribute('color')) st = (st ? st + '; ' : '') + cleanStyle('color: ' + c.getAttribute('color'));
            if (st) e.setAttribute('style', st);
            for (var oc = 0; oc < HTML_OWN_CLASSES.length; oc++) if (cls.contains(HTML_OWN_CLASSES[oc])) e.classList.add(HTML_OWN_CLASSES[oc]);
            if (out === 'a') {
                var href = cleanUrl(decodeRedirectUrl(c.getAttribute('href')));
                if (href) { e.setAttribute('href', href); e.setAttribute('target', '_blank'); e.setAttribute('rel', 'noopener noreferrer'); }
            } else if (out === 'img') {
                // XenForo keeps the original image address in data-url; src may be a proxy or a lazy placeholder
                var src = cleanUrl(c.getAttribute('data-url')) || cleanUrl(c.getAttribute('src')) || cleanUrl(c.getAttribute('data-src'));
                if (!src) continue;
                e.setAttribute('src', src); e.setAttribute('alt', ''); e.setAttribute('loading', 'lazy');
                e.setAttribute('referrerpolicy', 'no-referrer'); e.setAttribute('data-ht-zoom', src);
            } else if (out === 'td' || out === 'th') {
                ['colspan', 'rowspan'].forEach(function (a) { var v = c.getAttribute(a); if (/^\d{1,2}$/.test(v || '')) e.setAttribute(a, v); });
            } else if (out === 'details' || out === 'blockquote') {
                e.classList.add(out === 'details' ? 'ht-bb-spoiler' : 'ht-bb-quote');
            }
            parent.appendChild(e);
            if (out !== 'img' && out !== 'br' && out !== 'hr') walk(c, e);
        }
    })(src, frag);
    return frag;
}

/** capture: the cleaned post as an HTML string (only allow-listed elements and attributes are in it) */
function sanitizeHtmlToString(root) {
    var budget = { n: HTML_MAX_NODES };
    var box = document.createElement('div');
    box.appendChild(sanitizeNode(root, budget));
    if (budget.n < 0) log.warn('Post is very large — saved the first ' + HTML_MAX_NODES + ' elements');
    return box.innerHTML.replace(/\n{3,}/g, '\n\n');
}

/**
 * render: a saved post, parsed inertly and cleaned again (it may come from an imported file).
 * referer: the site the post comes from (SimpCity) — used when an image host refuses a direct request.
 */
function renderSafeHtml(html, referer) {
    var doc = new DOMParser().parseFromString('<!doctype html><body>' + html, 'text/html');
    var frag = sanitizeNode(doc.body, { n: HTML_MAX_NODES });
    enhanceRendered(frag, referer);
    return frag;
}

// ── Rendered posts: image fallback and video players ─────────────────────
// Some image hosts (SimpCity's simp*.cuckcapital.cr) only serve their pictures to visitors of the forum. Away from
// it — the offline viewer on github.io — Firefox keeps a separate cookie jar per site, the host answers with an
// error (JSON) instead of the picture, and the browser blocks it. When an image fails, it's fetched once more
// through Tampermonkey (your normal cookies for that host, the forum as referrer) and shown from memory.
// A few at a time, and each address only once per page.

var gmImageCache = new Map();
var gmImageQueue = [];
var gmImageActive = 0;
var GM_IMAGE_PARALLEL = 4;

function gmImageUrl(url, referer) {
    if (gmImageCache.has(url)) return gmImageCache.get(url);
    var p = new Promise(function (resolve, reject) {
        gmImageQueue.push({ url: url, referer: referer, resolve: resolve, reject: reject });
        pumpGmImages();
    });
    p.catch(function () { /* reported by the caller */ });
    gmImageCache.set(url, p);
    return p;
}

function pumpGmImages() {
    while (gmImageActive < GM_IMAGE_PARALLEL && gmImageQueue.length) {
        var job = gmImageQueue.shift();
        gmImageActive++;
        fetchGmImage(job, function () { gmImageActive--; pumpGmImages(); });
    }
}

function fetchGmImage(job, done) {
    if (typeof GM_xmlhttpRequest !== 'function') { job.reject(new Error('GM_xmlhttpRequest unavailable')); done(); return; }
    var headers = {};
    if (job.referer) headers.Referer = job.referer;
    GM_xmlhttpRequest({
        method: 'GET', url: job.url, responseType: 'blob', anonymous: false, timeout: 30000, headers: headers,
        onload: function (r) {
            var m = /^content-type:\s*([^;\r\n]+)/im.exec(r.responseHeaders || '');
            var ct = (m ? m[1] : (r.response && r.response.type) || '').trim().toLowerCase();
            var blob = r.response;
            if (r.status >= 200 && r.status < 300 && blob && blob.size && (!ct || ct.indexOf('image/') === 0)) {
                job.resolve(URL.createObjectURL(ct && blob.type !== ct ? new Blob([blob], { type: ct }) : blob));
            } else {
                var err = new Error('HTTP ' + r.status + ' ' + (ct || '?'));
                if (blob && blob.text && blob.size < 4096) {
                    blob.text().then(function (t) { log.warn('Image refused by its host: ' + job.url + ' — ' + err.message + ' — ' + t.slice(0, 200)); });
                } else {
                    log.warn('Image refused by its host: ' + job.url + ' — ' + err.message);
                }
                job.reject(err);
            }
            done();
        },
        onerror: function (e) { log.warn('Image couldn\'t be fetched: ' + job.url, e && e.error); job.reject(new Error('network')); done(); },
        ontimeout: function () { job.reject(new Error('timeout')); done(); },
    });
}

/** when img fails to load directly, try it through Tampermonkey; onFail() when that fails too */
function imgFallback(img, src, referer, onFail) {
    if (!src || /^(blob|data):/i.test(src)) return;
    if (referer) img.setAttribute('data-ht-ref', referer);
    img.addEventListener('error', function () {
        if (img.getAttribute('data-ht-gm')) { if (onFail) onFail(); return; }
        img.setAttribute('data-ht-gm', '1');
        gmImageUrl(src, referer).then(function (u) { img.src = u; }).catch(function () { if (onFail) onFail(); });
    });
}

var VIDEO_FILE_RE = /\.(mp4|webm|m4v|mov|ogv)(?:[?#]|$)/i;

/** images get the fallback; "▶ Embedded player: <url>" blocks get the player itself (loaded when scrolled to) */
function enhanceRendered(root, referer) {
    root.querySelectorAll('img').forEach(function (img) { imgFallback(img, img.getAttribute('src'), referer); });
    root.querySelectorAll('.ht-embed').forEach(function (box) {
        var a = box.querySelector('a[href]');
        var url = a && cleanUrl(a.getAttribute('href'));
        if (!url || !/^https:/i.test(url) || box.querySelector('iframe, video')) return;
        var player;
        if (VIDEO_FILE_RE.test(new URL(url).pathname)) {
            player = el('video', { className: 'ht-player', controls: true, preload: 'metadata', src: url });
        } else {
            // sandboxed: the player runs, but can't open pop-ups or navigate this page
            player = el('iframe', {
                className: 'ht-player', src: url, loading: 'lazy', allowfullscreen: true,
                allow: 'fullscreen; autoplay; encrypted-media; picture-in-picture',
                sandbox: 'allow-scripts allow-same-origin allow-presentation allow-forms',
            });
        }
        box.classList.add('ht-embed-player');
        box.appendChild(player);
    });
}

/** the download section of a Pornolab topic: size, registration date, status (stored with the torrent) */
function savePlabTorrentInfo(tid) {
    var box = document.getElementById('tor-reged');
    if (!box) { log.debug('Pornolab: no download section on this page'); return; }
    var info = {};
    box.querySelectorAll('tr').forEach(function (tr) {
        var tds = tr.querySelectorAll(':scope > td');
        if (tds.length < 2) return;
        var label = cleanText(tds[0].textContent).replace(/:$/, '').toLowerCase();
        var value = cleanText(tds[1].textContent);
        if (label === 'размер') info.sz = value;
        else if (label === 'торрент') { var m = value.match(/\[\s*([^\]]+?)\s*\]/); info.reg = m ? m[1] : value; }
        else if (label === 'статус') info.st = value.replace(/^\*\s*/, '');
        else if (label === '.torrent скачан') info.dlc = value;
    });
    if (!info.sz && !info.reg) { log.debug('Pornolab: download section without size / date'); return; }
    updateTorrent(tid, function (e) { if (!e) return null; e.x = info; return e; });
    log.debug('Pornolab: torrent info of #' + tid, info);
}

/**
 * The file list, fetched the way the site's own "Список файлов" button does (POST viewtorrent.php t=N, same site,
 * your own session). Stored as a compact tree: dir = [name, [children]], file = [name, bytes]; refreshed weekly.
 */
var FILE_LIST_MAX_AGE = 7 * 86400000;
var FILE_LIST_MAX_ITEMS = 20000;

function parseFileTree(ul, counter) {
    var out = [];
    if (!ul) return out;
    Array.prototype.forEach.call(ul.children, function (li) {
        if (li.tagName !== 'LI' || counter.items >= FILE_LIST_MAX_ITEMS) return;
        counter.items++;
        var sub = li.querySelector(':scope > ul');
        if (sub) {
            var head = li.querySelector(':scope > span.b, :scope > b, :scope > span');
            var dname = cleanText(head ? head.textContent : li.firstChild && li.firstChild.textContent) || '…';
            dname = dname.replace(/\s*·.*$/, '');
            out.push([dname, parseFileTree(sub, counter)]);
            return;
        }
        var sizeEl = li.querySelector('i');
        var bytes = sizeEl ? parseInt(String(sizeEl.textContent).replace(/[^\d]/g, ''), 10) || 0 : 0;
        var clone = li.cloneNode(true);
        clone.querySelectorAll('i, s').forEach(function (n) { n.remove(); });
        var fname = cleanText(clone.textContent);
        if (!fname) return;
        counter.files++;
        counter.bytes += bytes;
        out.push([fname, bytes]);
    });
    return out;
}

function decodeHtmlResponse(buf, contentType) {
    var m = /charset=([\w-]+)/i.exec(contentType || '');
    var charset = m ? m[1] : 'windows-1251';          // Pornolab's pages are windows-1251
    try { return new TextDecoder(charset).decode(buf); } catch (e) { return new TextDecoder('windows-1251').decode(buf); }
}

function savePlabFileList(tid, now) {
    var key = keysOf().files + tid;
    var cur = GM_getValue(key, null);
    if (cur && now - cur.t < FILE_LIST_MAX_AGE) { log.debug('Pornolab: file list of #' + tid + ' saved ' + ago(cur.t) + ' — not fetched again'); return; }
    fetch(location.origin + '/forum/viewtorrent.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body: 't=' + encodeURIComponent(tid),
    }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var ct = res.headers.get('Content-Type');
        return res.arrayBuffer().then(function (buf) { return decodeHtmlResponse(buf, ct); });
    }).then(function (html) {
        var doc = new DOMParser().parseFromString('<!doctype html><body>' + html, 'text/html');
        var root = doc.querySelector('ul.tree-root') || doc.querySelector('ul');
        var counter = { items: 0, files: 0, bytes: 0 };
        var tree = parseFileTree(root, counter);
        if (!counter.files) { log.warn('Pornolab: couldn\'t read the file list of #' + tid + ' (unexpected format)', html.slice(0, 300)); return; }
        return encodeText(JSON.stringify(tree)).then(function (enc) {
            GM_setValue(key, { t: now, n: counter.files, b: counter.bytes, z: enc.z, d: enc.d });
            log.info('Saved the file list of #' + tid + ': ' + counter.files + ' files, ' + fmtSize(counter.bytes) + ', stored as ' + fmtBytes(enc.d.length));
        });
    }).catch(function (e) { log.warn('Pornolab: fetching the file list of #' + tid + ' failed', e); });
}

function readFileList(tid, g) {
    var v = GM_getValue(keysOf(g).files + tid, null);
    return v && typeof v === 'object' ? v : null;
}

/** sizes like the site shows them (1024-based) */
function fmtSize(bytes) {
    var units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    var i = 0;
    var n = Number(bytes) || 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return (i >= 3 ? n.toFixed(2) : i ? n.toFixed(1) : String(Math.round(n))) + ' ' + units[i];
}

/** the saved file list as a nested, collapsible tree */
function renderFileTree(tree) {
    function list(items) {
        var ul = el('ul', { className: 'ht-files' });
        items.forEach(function (it) {
            if (Array.isArray(it[1])) {
                var total = 0;
                var count = 0;
                (function sum(xs) { xs.forEach(function (x) { if (Array.isArray(x[1])) sum(x[1]); else { total += x[1]; count++; } }); })(it[1]);
                var det = el('details', { open: items.length === 1 ? true : null }, [
                    el('summary', {}, ['📁 ' + it[0], el('span', { className: 'ht-sub', text: ' · ' + count + ' file' + (count === 1 ? '' : 's') + ' · ' + fmtSize(total) })]),
                    list(it[1]),
                ]);
                ul.appendChild(el('li', { className: 'ht-files-dir' }, [det]));
            } else {
                ul.appendChild(el('li', {}, [it[0], el('span', { className: 'ht-sub', text: ' · ' + fmtSize(it[1]) })]));
            }
        });
        return ul;
    }
    return list(tree);
}

// ── BBCode → preview ─────────────────────────────────────────────────────
// Renders the tags the converter above produces. Builds DOM nodes directly (never innerHTML), only http(s)
// links / images and plain colour / font values get through, so a presentation can't run anything.

var BB_TAGS = {
    b: 1, i: 1, u: 1, s: 1, color: 1, size: 1, font: 1, align: 1, url: 1, quote: 1, spoiler: 1, table: 1, tr: 1, td: 1,
    bg: 1, tip: 1, '#': 1, article: 1, cast: 1, details: 1, info: 1, plot: 1, screens: 1,
    img: 2, imgnm: 2, imgalt: 2, thumb: 2, code: 2, pre: 2, mediainfo: 2, plain: 2, torrent: 2, user: 2,   // raw content
    hr: 0, '*': 0, n: 0,                                                                                  // no closing tag
};
var BB_SIZES = { 0: '0.6em', 1: '0.7em', 2: '0.85em', 3: '1em', 4: '1.15em', 5: '1.4em', 6: '1.7em', 7: '2em', 8: '2.4em', 9: '2.8em', 10: '3.2em' };

function bbParse(src) {
    var root = { tag: null, kids: [] };
    var stack = [root];
    var re = /\[(\/?)([a-z]+|\*|#)(?:=([^\]]*))?\]/gi;
    var last = 0;
    var m;
    function top() { return stack[stack.length - 1]; }
    function text(t) { if (t) top().kids.push(t); }
    while ((m = re.exec(src))) {
        var close = m[1] === '/';
        var tag = m[2].toLowerCase();
        var kind = BB_TAGS[tag];
        if (kind === undefined) continue;                 // unknown tag: stays as text
        text(src.slice(last, m.index));
        last = re.lastIndex;
        if (tag === 'n') continue;                        // [n] = "don't parse" marker
        if (kind === 0) { if (!close) top().kids.push({ tag: tag, val: m[3], kids: [] }); continue; }
        if (close) {
            for (var j = stack.length - 1; j > 0; j--) {
                if (stack[j].tag === tag) { stack.length = j; break; }
            }
            continue;
        }
        var node = { tag: tag, val: m[3], kids: [] };
        top().kids.push(node);
        if (kind === 2) {
            var rest = src.slice(last);
            var end = rest.toLowerCase().indexOf('[/' + tag + ']');
            node.kids = [end === -1 ? rest : rest.slice(0, end)];
            last += end === -1 ? rest.length : end + tag.length + 3;
            re.lastIndex = last;
        } else {
            stack.push(node);
        }
    }
    text(src.slice(last));
    return root.kids;
}

function bbUrl(u) {
    u = String(u || '').trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (/^\/[^/]/.test(u)) return location.origin + u;
    return null;
}
function bbColor(v) { v = String(v || '').trim(); return /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,%]+\))$/i.test(v) ? v : null; }
function bbRaw(n) { return n.kids.map(function (k) { return typeof k === 'string' ? k : bbRaw(k); }).join(''); }

/** table / tr / td / bg values, e.g. "80%,#222222,nball,center,vat" */
function bbBoxStyle(e, val) {
    String(val || '').split(',').forEach(function (p) {
        p = p.trim();
        if (/^\d+(px|%)$/.test(p)) e.style.width = p;
        else if (p === 'nball') e.style.border = 'none';
        else if (p === 'center') { e.style.marginLeft = 'auto'; e.style.marginRight = 'auto'; }
        else if (p === 'right') e.style.marginLeft = 'auto';
        else if (p === 'vat') e.style.verticalAlign = 'top';
        else if (p === 'vam') e.style.verticalAlign = 'middle';
        else if (p === 'vab') e.style.verticalAlign = 'bottom';
        else if (bbColor(p) && /^#|^rgb/i.test(p)) e.style.backgroundColor = p;
    });
}

function bbAppendText(parent, t) {
    t.split('\n').forEach(function (line, i) {
        if (i) parent.appendChild(document.createElement('br'));
        if (line) parent.appendChild(document.createTextNode(line));
    });
}

function bbBuild(kids, parent) {
    kids.forEach(function (k) {
        if (typeof k === 'string') bbAppendText(parent, k);
        else parent.appendChild(bbNode(k));
    });
    return parent;
}

function bbImage(n) {
    var src = bbUrl(bbRaw(n));
    if (!src) return document.createTextNode('');
    var img = el('img', { src: src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', 'data-ht-zoom': src });
    if (n.tag === 'img' && n.val) {
        var wh = n.val.split(',');
        if (/^\d+$/.test(wh[0] || '')) img.width = parseInt(wh[0], 10);
        if (/^\d+$/.test(wh[1] || '')) img.height = parseInt(wh[1], 10);
    }
    if (n.tag === 'imgalt' && n.val) img.alt = n.val;
    if (n.tag === 'thumb') img.className = 'ht-bb-thumb';
    if (n.tag === 'imgnm') img.className = 'ht-bb-nm';
    return img;
}

function bbNode(n) {
    var e;
    switch (n.tag) {
        case 'b': return bbBuild(n.kids, el('strong'));
        case 'i': return bbBuild(n.kids, el('em'));
        case 'u': e = el('span'); e.style.textDecoration = 'underline'; return bbBuild(n.kids, e);
        case 's': e = el('span'); e.style.textDecoration = 'line-through'; return bbBuild(n.kids, e);
        case 'color': e = el('span'); if (bbColor(n.val)) e.style.color = n.val; return bbBuild(n.kids, e);
        case 'size': e = el('span'); if (BB_SIZES[n.val]) e.style.fontSize = BB_SIZES[n.val]; return bbBuild(n.kids, e);
        case 'font': e = el('span'); if (/^[\w\s-]{1,40}$/.test(n.val || '')) e.style.fontFamily = '"' + n.val + '", sans-serif'; return bbBuild(n.kids, e);
        case 'align':
            e = el('div');
            if (/^(left|center|right|justify)$/i.test(n.val || '')) e.style.textAlign = n.val.toLowerCase();
            return bbBuild(n.kids, e);
        case 'url':
            var href = bbUrl(n.val || bbRaw(n));
            e = href ? el('a', { href: href, target: '_blank', rel: 'noopener noreferrer' }) : el('span');
            return bbBuild(n.kids, e);
        case 'img': case 'imgnm': case 'imgalt': case 'thumb': return bbImage(n);
        case 'quote': return bbBuild(n.kids, el('blockquote', { className: 'ht-bb-quote' }));
        case 'spoiler':
            e = el('details', { className: 'ht-bb-spoiler' }, [el('summary', { text: n.val || 'Spoiler' })]);
            return bbBuild(n.kids, e);
        case 'code': case 'pre': case 'mediainfo': return el('pre', { className: 'ht-bb-pre', text: bbRaw(n) });
        case 'plain': return document.createTextNode(bbRaw(n));
        case 'hr': return el('hr');
        case '*': return el('span', { className: 'ht-bb-bullet', text: '• ' });
        case 'table': e = el('table', { className: 'ht-bb-table' }); bbBoxStyle(e, n.val); return bbBuild(n.kids.filter(function (k) { return typeof k !== 'string' || k.trim(); }), e);
        case 'tr': e = el('tr'); bbBoxStyle(e, n.val); return bbBuild(n.kids.filter(function (k) { return typeof k !== 'string' || k.trim(); }), e);
        case 'td': e = el('td'); bbBoxStyle(e, n.val); return bbBuild(n.kids, e);
        case 'bg': e = el('div', { className: 'ht-bb-bg' }); bbBoxStyle(e, n.val); return bbBuild(n.kids, e);
        case 'tip': e = el('span', { title: n.val || '' }); e.style.borderBottom = '1px dotted'; return bbBuild(n.kids, e);
        case 'torrent':
            var tid = bbRaw(n).trim();
            return /^\d+$/.test(tid) ? el('a', { href: location.origin + '/torrents.php?id=' + tid, target: '_blank', rel: 'noopener', text: 'Torrent #' + tid }) : document.createTextNode('');
        case 'user':
            var uid = bbRaw(n).trim();
            return /^\d+$/.test(uid) ? el('a', { href: location.origin + '/user.php?id=' + uid, target: '_blank', rel: 'noopener', text: 'User #' + uid }) : document.createTextNode('');
        default: return bbBuild(n.kids, el('span'));
    }
}

function renderBBCode(text) {
    return bbBuild(bbParse(text), document.createDocumentFragment());
}
