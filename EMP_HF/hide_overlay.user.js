// ==UserScript==
// @name         [HF][EMP] Hidebar Overlay Button Offset
// @namespace    https://github.com/edstagdh/Userscripts
// @version      1.0
// @description  Shift overlay buttons to the middle to avoid clicking on them when trying to press the download button.
// @author       edstagdh
// @match        https://www.happyfappy.net/torrents.php?id=*
// @match        https://www.empornium.sx/torrents.php?id=*
// @match        https://emparadise.rs/torrents.php?id=*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=www.happyfappy.net
// @icon         https://www.google.com/s2/favicons?sz=64&domain=emparadise.rs
// @icon         https://www.google.com/s2/favicons?sz=64&domain=www.empornium.sx
// @grant        none
// @installURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/hide_overlay.user.js
// @updateURL    https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/hide_overlay.user.js
// ==/UserScript==

// CHANGELOG:
// v1.0:
// -added Hidebar Overlay Button Offset Script


(function () {
    'use strict';

    function addSpacer() {
        const sidebar = document.querySelector('#user-sidebar');
        if (!sidebar) return;

        // Prevent duplicate insertion
        if (document.getElementById('fake-spacer-button')) return;

        const spacer = document.createElement('a');
        spacer.id = 'fake-spacer-button';
        spacer.className = 'button';
        spacer.style.visibility = 'hidden';   // invisible but takes space
        spacer.style.pointerEvents = 'none';   // non-clickable
        spacer.style.width = '300px';
        spacer.textContent = 'SPACER';

        // Insert before first real button
        const firstButton = sidebar.querySelector('a.button');
        if (firstButton) {
            sidebar.insertBefore(spacer, firstButton);
        }
    }

    // Run once page loads
    window.addEventListener('load', addSpacer);

    // Also observe DOM in case overlay loads dynamically
    const observer = new MutationObserver(addSpacer);
    observer.observe(document.body, { childList: true, subtree: true });
})();