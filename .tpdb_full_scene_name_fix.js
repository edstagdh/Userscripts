// ==UserScript==
// @name         TPDB Full Scene Name Display (Force Fix)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Completely remove truncation and enforce full visibility for scenes
// @author       edstagdh
// @match        https://theporndb.net/*
// @icon         https://theporndb.net/favicon-16x16.png
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Inject global CSS override
    const style = document.createElement('style');
    style.innerHTML = `
        h2.p-3.text-xl.truncate,
        h2.p-3.text-xl.truncate a,
        div.flex.truncate,
        div.flex.truncate span {
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: clip !important;
            max-width: none !important;
            display: block !important;
        }
    `;
    document.head.appendChild(style);

    // Force inline fix just in case dynamic elements load outside style rules
    const forceInlineUntruncate = () => {
        // Fix video title
        document.querySelectorAll('h2.p-3.text-xl.truncate').forEach(h2 => {
            const a = h2.querySelector('a');
            if (a) {
                h2.classList.remove('truncate');
                a.classList.remove('truncate');

                Object.assign(h2.style, {
                    whiteSpace: 'normal',
                    overflow: 'visible',
                    textOverflow: 'clip',
                    maxWidth: 'none',
                    display: 'block'
                });

                Object.assign(a.style, {
                    whiteSpace: 'normal',
                    overflow: 'visible',
                    textOverflow: 'clip',
                    maxWidth: 'none',
                    display: 'block'
                });
            }
        });

        // Fix performer names
        document.querySelectorAll('div.flex.truncate').forEach(div => {
            div.classList.remove('truncate');
            Object.assign(div.style, {
                whiteSpace: 'normal',
                overflow: 'visible',
                textOverflow: 'clip',
                maxWidth: 'none',
                display: 'block'
            });
        });
    };

    // Run it immediately and keep checking for new content
    const interval = setInterval(forceInlineUntruncate, 500);
    setTimeout(() => clearInterval(interval), 10000);

    const observer = new MutationObserver(forceInlineUntruncate);
    observer.observe(document.body, { childList: true, subtree: true });
})();
