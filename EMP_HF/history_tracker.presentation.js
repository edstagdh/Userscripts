// [HF][EMP] History Tracker — Presentations: BBCode capture, storage and preview
// Part of history_tracker.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install history_tracker.user.js.
// Version 3.2
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

function savePresentation(tid, now) {
    var box = document.getElementById('descbox');
    if (!box) { log.debug('No #descbox on this page — presentation not saved'); return; }
    var text;
    try { text = presentationToBBCode(box); } catch (e) { log.warn('Presentation → BBCode failed for #' + tid, e); return; }
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
        var list = readPresentations(tid);
        if (getSetting('presentationMode') === 'every') {
            list.push(v);
            var max = Math.max(1, parseInt(getSetting('presentationVersions'), 10) || 1);
            if (list.length > max) list = list.slice(-max);
        } else {
            list = [v];
        }
        GM_setValue(key, list);
        log.info('Saved presentation of #' + tid + ': ' + fmtBytes(text.length) + ' of BBCode, stored as ' +
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
    drop.forEach(function (x) { GM_deleteValue(x[0]); });
    log.info('Removed ' + drop.length + ' old saved presentation(s) (keeping the ' + max + ' most recent torrents)');
}

function copyText(text, what) {
    try {
        GM_setClipboard(text, 'text');
        showToast('📋 ' + (what || 'BBCode') + ' copied', fmtBytes(text.length) + ' of text');
        log.info('Copied ' + (what || 'BBCode') + ' (' + fmtBytes(text.length) + ')');
    } catch (e) {
        log.error('Copy to clipboard failed', e);
        showToast('Copy failed', e.message);
    }
}

function copyLatestPresentation(tid, g) {
    var arr = readPresentations(tid, g);
    if (!arr.length) { showToast('No presentation saved for this torrent'); return; }
    decodeVersion(arr[arr.length - 1]).then(function (t) { copyText(t, 'Presentation BBCode'); })
        .catch(function (e) { log.error('Reading the saved presentation of #' + tid + ' failed', e); showToast('Couldn\'t read the saved presentation'); });
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
