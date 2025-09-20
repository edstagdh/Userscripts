// ==UserScript==
// @name         PMV Haven - Disable Infinite Scroll & Hide PMVArchive
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Disable Infinite Scrolling and Hide PMVArchive switches once when they appear
// @author       edstagdh
// @match        https://pmvhaven.com/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pmvhaven.com
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const LOG_PREFIX = '[TM]';
    const switchesToDisable = ["Infinite Scrolling"];
    let done = false;

    const observer = new MutationObserver((mutations, obs) => {
        if (done) return;

        let anyFound = false;
        switchesToDisable.forEach(label => {
            const input = document.querySelector(`input[aria-label="${label}"]`);
            if (input && input.checked) {
                input.checked = false;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(`${LOG_PREFIX} "${label}" switch disabled.`);
                anyFound = true;
            }
        });

        if (anyFound) {
            done = true;
            obs.disconnect();
            console.log(`${LOG_PREFIX} Switches disabled, observer disconnected.`);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
