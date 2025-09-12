// ==UserScript==
// @name         PMV Heaven Auto Volume 5%
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Sets video volume to 5% on load.
// @author       edstagdh
// @match        https://pmvhaven.com/video/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CHECK_INTERVAL = 500;
    const MAX_WAIT_TIME = 15000;
    let waited = 0;

    const waitForVideo = setInterval(() => {
        const videoElement = document.getElementById('VideoPlayer');

        if (!videoElement) {
            console.warn('[Tampermonkey] Video element not found yet.');
            return;
        }

        // Force video volume to 5%
        if (videoElement.volume !== 0.05) {
            videoElement.volume = 0.05;
            console.log('[Tampermonkey] Video volume set to 5%.');
        }

        clearInterval(waitForVideo);
    }, CHECK_INTERVAL);
})();
