// ==UserScript==
// @name         add Copy BBCode link improved
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Add a button to copy the BBCode presentation of the torrent, even with mediainfo section.
// @author       edstagdh + others
// @match        https://www.happyfappy.org/torrents.php?id=*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=happyfappy.org
// @download     https://raw.githubusercontent.com/edstagdh/Userscripts/master/.HF_add_copy_bbcode_link.js
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/.HF_add_copy_bbcode_link.js
// @grant        GM_setClipboard
// ==/UserScript==

// CHANGELOG:
// v1.1 - 2026-02-11:
// -fixed usage of torrent with mediainfo element.
// -added toast notification to alert successful copy.
// v1.0

(function() {
    'use strict';

    let cached = null;
    const spoilerMap = new Map();
    const torrentMap = new Map();
    const userMap = new Map();
    const mediainfoMap = new Map();

    class Node {
        constructor() {
            this.type = null;
            this.value = null;
            this.text = null;
            this.children = [];
        }
    }

    // helpers
    function isElement(node) {
        return node && node.nodeType === 1; // ELEMENT_NODE
    }

    function filterFooterNodes(nodes) {
        // operate only on element nodes
        for (let i = nodes.length - 1; i >= 0; i--) {
            const n = nodes[i];
            if (isElement(n) && n.id === 'torrentsigbox') {
                nodes.splice(i, 1);
            }
        }
        return nodes;
    }

    function filterSpoilerNodes(nodes) {
        // Find blockquote.spoiler and attempt to find a preceding text/title node for the spoiler label
        for (let i = nodes.length - 1; i >= 0; i--) {
            const n = nodes[i];
            if (isElement(n) && n.nodeName.toLowerCase() === 'blockquote' && n.className && n.className.includes('spoiler')) {
                // search backwards up to 5 nodes for something with innerText
                let label = null;
                for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
                    const prev = nodes[j];
                    if (isElement(prev) && prev.innerText && prev.innerText.trim()) {
                        label = prev.innerText.trim();
                        // remove the found label node
                        nodes.splice(j, 1);
                        // adjust i because we removed an earlier item
                        i -= 1;
                        break;
                    }
                }
                // store label (may be null)
                spoilerMap.set(n, label);
                // leave the blockquote in place (we only removed label if found)
            }
        }
        return nodes;
    }

    function filterTorrentNodes(nodes) {
        for (let i = nodes.length - 1; i >= 1; i--) {
            const prev = nodes[i - 1];
            const cur = nodes[i];
            if (isElement(prev) && prev.nodeName.toLowerCase() === 'script' && isElement(cur) && cur.nodeName.toLowerCase() === 'a') {
                const href = cur.getAttribute('href') || '';
                const m = href.match(/(\d+)/);
                if (m) {
                    const torrentID = m[1];
                    torrentMap.set(cur, torrentID);
                    // remove the script node
                    nodes.splice(i - 1, 1);
                }
            }
        }
        return nodes;
    }

    function filterUserNodes(nodes) {
        for (const el of nodes) {
            if (isElement(el) && el.nodeName.toLowerCase() === 'a') {
                const href = el.getAttribute('href') || '';
                const firstChild = el.firstChild;
                if (/user.php\?/.test(href) && firstChild && firstChild.className === 'taglabel') {
                    const m = href.match(/(\d+)/);
                    if (m) userMap.set(el, m[1]);
                }
            }
        }
        return nodes;
    }

    function filterMediaInfoNodes(nodes) {
        for (const el of nodes) {
            if (isElement(el) && el.classList && el.classList.contains('mediainfo')) {
                mediainfoMap.set(el, el.innerText);
            }
        }
        return nodes;
    }

    function filterNodes(nodes) {

        nodes = filterFooterNodes(nodes);
        nodes = filterSpoilerNodes(nodes);
        nodes = filterTorrentNodes(nodes);
        nodes = filterUserNodes(nodes);

        // 🚀 Remove filename link before mediainfo
        for (let i = nodes.length - 2; i >= 0; i--) {
            const current = nodes[i];
            const next = nodes[i + 1];

            if (
                isElement(current) &&
                isElement(next) &&
                current.nodeName.toLowerCase() === 'a' &&
                next.classList &&
                next.classList.contains('mediainfo')
            ) {
                nodes.splice(i, 1); // remove the <a>
            }
        }

        return nodes;
    }


    // color parsing - robust and safe
    function normalizeHex(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            return '#' + hex.split('').map(c => c + c).join('').toUpperCase();
        }
        if (hex.length === 6) return '#' + hex.toUpperCase();
        if (hex.length === 8) return '#' + hex.toUpperCase();
        return null;
    }

    function rgbaToHex(r, g, b, a) {
        const rh = Number(r).toString(16).padStart(2, '0');
        const gh = Number(g).toString(16).padStart(2, '0');
        const bh = Number(b).toString(16).padStart(2, '0');
        if (typeof a !== 'undefined' && a !== null) {
            const ah = Math.round(Number(a) * 255).toString(16).padStart(2, '0');
            return ('#' + rh + gh + bh + ah).toUpperCase();
        }
        return ('#' + rh + gh + bh).toUpperCase();
    }

    function getColorValue(style) {
        if (!style) return null;
        // try rgba()/rgb()
        let m = style.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)/i);
        if (m) {
            return rgbaToHex(m[1], m[2], m[3], m[4]);
        }

        // try hex (3,6,8)
        m = style.match(/(?:^|;)\s*(?:background-)?color\s*:\s*(#[A-Fa-f0-9]{3,8})\b/);
        if (m) {
            const hex = normalizeHex(m[1]);
            if (hex) return hex;
        }

        // try named color (e.g. red)
        m = style.match(/(?:^|;)\s*(?:background-)?color\s*:\s*([a-zA-Z]+)\b/);
        if (m) return m[1];

        // try var(...) or other values - return raw trimmed value if present
        m = style.match(/(?:^|;)\s*(?:background-)?color\s*:\s*([^;!]+)/);
        if (m) return m[1].trim();

        // nothing matched
        return null;
    }

    function getGradientValue(style) {
        if (!style) return null;
        const match = style.match(/gradient\(([^)]+)\)\s*;/i) || style.match(/gradient\(([^)]+)\)/i);
        if (!match) return null;
        const arr = match[1].split(',');
        // combine rgba parts that were split by commas
        for (let i = 0; i <= arr.length - 4; i++) {
            if (/rgba?\(/.test(arr[i])) {
                arr.splice(i, 4, arr.slice(i, i + 4).join(','));
            }
        }
        const values = arr.map((el, idx) => {
            if (idx === 0) return el.trim();
            const color = getColorValue('color:' + el);
            const percentMatch = el.match(/(\d+%)/g);
            if (percentMatch) {
                return `${color} ${percentMatch.join(' ')}`;
            }
            return color;
        });
        return 'gradient:' + values.join(';');
    }

    function getTableValue(el, style) {
        const values = [];
        if (style) {
            if (/width:\s*/.test(style)) {
                const m = style.match(/width:\s*(\d+px|\d+%)/);
                if (m) values.push(m[1]);
            }
            if (/border:\s*none/.test(style)) {
                values.push('nball');
            }
            if (/(?:^|;)\s*(?:background-)?color\s*:/.test(style)) {
                const color = getColorValue(style);
                if (color) values.push(color);
            }
            if (/url\(/.test(style)) {
                const m = style.match(/url\(([^)]+)\)/);
                if (m) values.push(m[1]);
            }
            if (/gradient\(/.test(style)) {
                const g = getGradientValue(style);
                if (g) values.push(g);
            }

            if (/margin:\s*0px\s+auto\s+0px\s+0px/.test(style)) {
                values.push('left');
            } else if (/margin:\s*0px\s+0px\s+0px\s+auto/.test(style)) {
                values.push('right');
            } else if (/margin:\s*0px\s+auto/.test(style)) {
                values.push('center');
            }
        }

        if (isElement(el) && el.className && el.className.includes('nopad')) {
            values.push('nopad');
        }

        if (isElement(el) && el.className) {
            if (el.className.includes('vat')) {
                values.push('vat');
            } else if (el.className.includes('vam')) {
                values.push('vam');
            } else if (el.className.includes('vab')) {
                values.push('vab');
            }
        }

        return (values.length > 0) ? values.join(',') : null;
    }

    // parsers
    function parseText(el) {
        const node = new Node();
        let text = (el.textContent || '').trim();

        // replace all occurrences reliably (replaceAll might not exist)
        text = text.replace(/\[n\]/g, '[n[n]]');

        // escape any existing BBCode tags by adding [n]
        const regex = /\[(b|i|u|s|color|font|size|tip|url|anchor|#|\*|img|hr|br|quote|code|pre|plain|cast|info|plot|screens|user|torrent|article|mediainfo|table|tr|td|bg|tex)(?:=[^\]]+)?\]/g;
        const match = text.match(regex);
        if (match) {
            for (const tag of match) {
                const noParseTag = tag.replace(/\]$/, '[n]]');
                text = text.replace(tag, noParseTag);
            }
        }

        node.text = text;
        return node;
    }

    function parseBr() {
        const node = new Node();
        node.text = '\n';
        return node;
    }

    function parseHr() {
        const node = new Node();
        node.type = 'hr';
        return node;
    }

    function parseStrong() { const node = new Node(); node.type = 'b'; return node; }
    function parseEm() { const node = new Node(); node.type = 'i'; return node; }
    function parseCode() { const node = new Node(); node.type = 'code'; return node; }
    function parseBlockquote(el) {
        const node = new Node();
        if (el.className && el.className.includes && el.className.includes('spoiler')) {
            node.type = 'spoiler';
            node.value = spoilerMap.get(el) || null;
        } else {
            node.type = 'quote';
        }
        return node;
    }
    function parsePre() { const node = new Node(); node.type = 'pre'; return node; }
    function parseLi() { const node = new Node(); node.type = '*'; return node; }

    function parseA(el) {
        const node = new Node();
        const href = el.getAttribute('href') || '';
        if (torrentMap.has(el)) {
            node.type = 'torrent';
            node.text = torrentMap.get(el);
        }
        else if (userMap.has(el)) {
            node.type = 'user';
            node.text = userMap.get(el);
        }
        else if (el.className && el.className.includes('article')) {
            const m = href.match(/articles\.php\?topic=(.+)/);
            if (m) {
                node.type = 'article';
                node.value = m[1];
            }
        }
        else if (el.className === 'anchor') {
            node.type = '#';
            node.value = el.getAttribute('id');
        }
        else {
            node.type = 'url';
            // strip anonymizer if present
            node.value = href.replace(/^https?:\/\/anonym\.es\/?\?/, '');
        }
        return node;
    }

    function filterAfterMediainfo(nodes) {
        let found = false;
        return nodes.filter(el => {
            if (isElement(el) && el.classList && el.classList.contains('mediainfo')) {
                found = true;
                return true;
            }

            // If we already found mediainfo and this is a summary table, skip it
            if (found && isElement(el) && el.nodeName.toLowerCase() === 'table') {
                return false;
            }

            return true;
        });
    }

    function parseDiv(el) {
        const node = new Node();

        if (el.classList && el.classList.contains('mediainfo')) {
            node.type = 'mediainfo';

            // Preserve formatting exactly (not innerText!)
            node.text = el.textContent.replace(/\r\n/g, '\n');

            return node;
        }

        const style = el.getAttribute('style') || '';

        if (el.className === 'bbcode') {
            node.type = 'bg';
            node.value = getTableValue(el, style);
        }
        else if (/text-align:\s*/.test(style)) {
            const match = style.match(/text-align:\s*([a-zA-Z]+)/);
            node.type = 'align';
            node.value = match ? match[1] : null;
        }

        return node;
    }

    function parseSpan(el) {
        const node = new Node();
        const c = el.getAttribute('class') || '';
        const style = el.getAttribute('style') || '';
        if (c) {
            if (/size/.test(c)) {
                node.type = 'size';
                const m = c.match(/size(\d*)/);
                node.value = m ? m[1] : null;
            }
            else if (/tooltip/.test(c)) {
                node.type = 'tip';
                node.value = el.getAttribute('title');
            }
        } else {
            if (/color:\s*/.test(style)) {
                node.type = 'color';
                node.value = getColorValue(style);
            }
            else if (/font-family:\s*/.test(style)) {
                node.type = 'font';
                let regex = /font-family:\s*(['"]?)([^,'"]+)\1/;
                const mm = style.match(regex);
                let font = mm ? mm[2] : null;
                if (font) {
                    switch (font) {
                        case 'Helvetica Neue': font = 'Helvetica'; break;
                        case 'Palatino': font = 'Palatino Linotype'; break;
                        case 'TimesNewRoman': font = 'Times New Roman'; break;
                    }
                }
                node.value = font;
            }
            else if (/text-decoration:\s*/.test(style)) {
                const deco = style.match(/text-decoration:\s*([a-zA-Z-]+)/);
                const decoration = deco ? deco[1] : null;
                switch (decoration) {
                    case 'line-through': node.type = 's'; break;
                    case 'underline': node.type = 'u'; break;
                    default: node.type = 'u'; break;
                }
            }
        }
        return node;
    }

    function parseImg(el) {
        const node = new Node();
        const alt = el.getAttribute('alt') || '';
        if (el.className && el.className.includes('image')) {
            const src = el.hasAttribute('src') ? el.getAttribute('src') : el.getAttribute('data-src');
            if (el.className.includes('nopad')) {
                node.type = 'imgnm';
                node.value = (alt && alt !== src) ? alt : null;
            }
            else if (el.className.includes('thumb')) {
                node.type = 'thumb';
            }
            else if (alt && alt !== src) {
                node.type = 'imgalt';
                node.value = alt;
            }
            else {
                const width = el.getAttribute('width');
                const height = el.getAttribute('height');
                node.type = 'img';
                node.value = (width || height) ? [width, height].join(',') : null;
            }
            node.text = src;
        }
        else {
            node.type = alt || null;
        }
        return node;
    }

    function parseTable(el) { const node = new Node(); node.type = 'table'; node.value = getTableValue(el, el.getAttribute('style') || ''); return node; }
    function parseTr(el) { const node = new Node(); node.type = 'tr'; node.value = getTableValue(el, el.getAttribute('style') || ''); return node; }
    function parseTd(el) { const node = new Node(); node.type = 'td'; node.value = getTableValue(el, el.getAttribute('style') || ''); return node; }

    function parseDOM(el) {
        let node = null;
        const name = el.nodeName ? el.nodeName.toLowerCase() : '';

        switch (name) {
            case '#text': node = parseText(el); break;
            case 'br': node = parseBr(el); break;
            case 'hr': node = parseHr(el); break;
            case 'strong': node = parseStrong(); break;
            case 'em': node = parseEm(); break;
            case 'code': node = parseCode(); break;
            case 'blockquote': node = parseBlockquote(el); break;
            case 'pre': node = parsePre(); break;
            case 'li': node = parseLi(); break;
            case 'a': node = parseA(el); break;
            case 'div': node = parseDiv(el); break;
            case 'span': node = parseSpan(el); break;
            case 'img': node = parseImg(el); break;
            case 'table': node = parseTable(el); break;
            case 'tr': node = parseTr(el); break;
            case 'td': node = parseTd(el); break;
            default:
                node = new Node();
                break;
        }

        // 🚀 STOP recursion for mediainfo
        if (node.type === 'mediainfo') {
            return node;
        }

        if (el.childNodes && el.childNodes.length > 0) {

            let children = Array.from(el.childNodes);

            // If this element contains a mediainfo block,
            // remove all siblings that come AFTER it
            const miIndex = children.findIndex(n =>
                                               isElement(n) &&
                                               n.classList &&
                                               n.classList.contains('mediainfo')
                                              );

            if (miIndex !== -1) {
                children = children.slice(0, miIndex + 1);
            }

            const filtered = filterNodes(children);
            node.children = filtered.map(parseDOM);
        }

        return node;
    }

    function buildBBCode(node) {
        let bbcode = '';
        if (node.type) {
            switch (node.type) {
                case 'img':
                case 'imgalt':
                case 'imgnm':
                case 'thumb':
                case 'torrent':
                case 'user':
                case 'mediainfo':
                case 'plain':
                    bbcode += (node.value) ? `[${node.type}=${node.value}]` : `[${node.type}]`;
                    bbcode += node.text || '';
                    bbcode += `[/${node.type}]`;
                    break;
                case 'hr':
                case '*':
                case 'cast':
                case 'details':
                case 'info':
                case 'plot':
                case 'screens':
                    bbcode += `[${node.type}]`;
                    bbcode += (node.children || []).map(buildBBCode).join('');
                    break;
                default:
                    bbcode += (node.value) ? `[${node.type}=${node.value}]` : `[${node.type}]`;
                    bbcode += (node.children || []).map(buildBBCode).join('');
                    bbcode += `[/${node.type}]`;
                    break;
            }
        }
        else if (node.text) {
            bbcode += node.text;
        }
        else if (node.children) {
            bbcode += node.children.map(buildBBCode).join('');
        }
        return bbcode;
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.textContent = message;

        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.padding = '10px 16px';
        toast.style.background = 'rgba(0, 0, 0, 0.85)';
        toast.style.color = '#fff';
        toast.style.fontSize = '14px';
        toast.style.borderRadius = '6px';
        toast.style.zIndex = '99999';
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';

        document.body.appendChild(toast);

        // fade in
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
        });

        // fade out + remove
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000); // 3 seconds
    }

    function copyBBCode() {
        if (cached === null) {
            const presentationDOM = document.getElementById('descbox');
            if (!presentationDOM) return;
            const nodes = filterNodes(Array.from(presentationDOM.childNodes)).map(parseDOM);
            cached = nodes.map(buildBBCode).join('');
        }

        try {
            GM_setClipboard(cached);
            showToast('BBCode copied successfully!');
        } catch (e) {
            console.error('Failed to copy BBCode to clipboard', e);
            showToast('Failed to copy BBCode.');
        }
    }


    // inject button safely
    const bookmarkAnchor = document.querySelector('a[id*="bookmarklink"]');
    if (bookmarkAnchor && bookmarkAnchor.parentElement) {
        const container = bookmarkAnchor.parentElement;
        let button = document.createElement('a');
        button.textContent = '[Copy BBCode]';
        button.href = 'javascript:void(0)';
        button.style.cursor = 'pointer';
        button.addEventListener('click', copyBBCode);
        container.appendChild(button);
    }

})();
