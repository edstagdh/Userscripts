// ==UserScript==
// @name         Bunkr Full Filename Display (Fixed)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Ensure full filenames are displayed and wrapped on Bunkr album pages
// @author       edstagdh
// @match        https://bunkr.is/*
// @match        https://bunkr.ru/*
// @match        https://bunkr.si/*
// @match        https://bunkr.la/*
// @match        https://bunkr.media/*
// @match        https://bunkr.cr/*
// @match        https://bunkrr.ru/*
// @match        https://bunkr.fun/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const applyFix = () => {
        const fileNameElements = document.querySelectorAll('p.truncate.theName.text-center');

        fileNameElements.forEach((pTag) => {
            if (pTag.classList.contains('truncate')) {
                pTag.classList.remove('truncate');
            }

            // Apply styles to ensure full display and wrapping
            pTag.style.whiteSpace = 'normal';
            pTag.style.overflow = 'visible';
            pTag.style.textOverflow = 'clip';
            pTag.style.wordBreak = 'break-word'; // break long words if needed
        });
    };

    const setupObservers = () => {
        const observer = new MutationObserver(() => {
            applyFix();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Retry loop for late-loading dynamic content
        let retryCount = 0;
        const maxRetries = 30;
        const retryInterval = setInterval(() => {
            applyFix();
            retryCount++;
            if (retryCount >= maxRetries) {
                clearInterval(retryInterval);
            }
        }, 1000);
    };

    // Run initially and setup dynamic observers
    applyFix();
    setupObservers();
})();
