// ==UserScript==
// @name         [HF][EMP] Copy BBCode Button
// @namespace    https://github.com/edstagdh/Userscripts
// @version      1.3
// @description  This script adds a button to copy the BBCode presentation of the torrent, including mediainfo section.
// @author       edstagdh + others
// @match        https://www.happyfappy.net/torrents.php?id=*
// @match        https://www.empornium.sx/torrents.php?id=*
// @match        https://emparadise.rs/torrents.php?id=*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=www.happyfappy.net
// @icon         https://www.google.com/s2/favicons?sz=64&domain=www.empornium.sx/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=emparadise.rs
// @installURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/copy_bbcode_button.user.js
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/copy_bbcode_button.user.js
// @grant        GM_setClipboard
// ==/UserScript==

// CHANGELOG:
// v1.3:
// -updated script namespace.
// -updated toast notification style.
// -updated "Copy BBCode" button style
// v1.2 - 2026-02-24:
// -added .net domain
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

    function showToast(message, duration = 5000) {
        const toast = document.createElement('div');
        toast.className = 'autothank-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #1a1a1a;
            color: #ffa500;
            padding: 16px 20px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 700;
            line-height: 1.4;
            min-width: 280px;
            max-width: 500px;
            border: 2px solid #ffa500;
            box-shadow: 0 6px 18px rgba(255,165,0,0.35);
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.25s ease, transform 0.25s ease;
            transform: translateY(10px);
            white-space: pre-line;
        `;

        // Stack above any existing toasts
        const existing = document.querySelectorAll('.autothank-toast');
        toast.style.bottom = `${20 + existing.length * 80}px`;

        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
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

        // add glow animation once
        if (!document.getElementById('copy-bbcode-style')) {
            const style = document.createElement('style');
            style.id = 'copy-bbcode-style';

            style.textContent = `
                .copy-bbcode-btn {
                    display: inline-block;
                    margin-left: 8px;
                    padding: 4px 10px;
                    border-radius: 6px;
                    background: linear-gradient(135deg, #ff9800, #ff5722);
                    color: white !important;
                    font-weight: bold;
                    text-decoration: none !important;
                    cursor: pointer;
                    box-shadow:
                        0 0 8px rgba(255, 87, 34, 0.7),
                        0 0 16px rgba(255, 87, 34, 0.4);
                    transition:
                        transform 0.15s ease,
                        box-shadow 0.15s ease,
                        filter 0.15s ease;
                    animation: bbcodePulse 1.8s infinite;
                }

                .copy-bbcode-btn:hover {
                    transform: scale(1.08);
                    filter: brightness(1.1);
                    box-shadow:
                        0 0 12px rgba(255, 87, 34, 0.9),
                        0 0 24px rgba(255, 87, 34, 0.7);
                }

                @keyframes bbcodePulse {
                    0% {
                        box-shadow:
                            0 0 6px rgba(255, 87, 34, 0.5),
                            0 0 12px rgba(255, 87, 34, 0.3);
                    }
                    50% {
                        box-shadow:
                            0 0 12px rgba(255, 87, 34, 0.9),
                            0 0 24px rgba(255, 87, 34, 0.7);
                    }
                    100% {
                        box-shadow:
                            0 0 6px rgba(255, 87, 34, 0.5),
                            0 0 12px rgba(255, 87, 34, 0.3);
                    }
                }
            `;

            document.head.appendChild(style);
        }

        let button = document.createElement('a');

        button.textContent = 'Copy BBCode';
        button.href = 'javascript:void(0)';
        button.className = 'copy-bbcode-btn';

        button.addEventListener('click', copyBBCode);

        container.appendChild(button);
    }

})();
