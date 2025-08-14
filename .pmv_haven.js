// ==UserScript==
// @name         PMV Heaven Download Button Dual + Auto Volume 5%
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Shows HQ and stream download buttons; sets video volume to 5% on load
// @match        https://pmvhaven.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CHECK_INTERVAL = 500;
    const MAX_WAIT_TIME = 15000;
    let waited = 0;

    function createButton(id, text, url, filename) {
        const btn = document.createElement('button');
        btn.id = id;
        btn.textContent = text;
        btn.style.cssText = `
        margin: 10px auto;
        display: block;
        padding: 12px 24px;
        background-color: #28a745;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 18px;
        font-weight: bold;
        text-align: center;
        box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        width: fit-content;
        `;
        btn.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
        return btn;
    }

    const waitForElements = setInterval(() => {
        const titleHeader = document.querySelector('h1.pl-2');
        const downloadHashMeta = document.querySelector('meta[name="download-hash"]');
        const streamMeta = document.querySelector('meta[property="og:video:secure_url"]');
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

        if (titleHeader && downloadHashMeta && streamMeta && videoElement) {
            clearInterval(waitForElements);

            let title = titleHeader.textContent?.trim();
            let downloadHash = downloadHashMeta.getAttribute('content')?.trim();
            let streamUrl = streamMeta.getAttribute('content')?.trim();

            if (!title || !downloadHash || !streamUrl) {
                console.warn('[Tampermonkey] Missing title, hash, or stream URL.');
                return;
            }

            const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, '');

            // HQ URL (title + hash)
            const fullFileName = `${sanitizedTitle}_${downloadHash}.mp4`;
            const encodedFullFileName = encodeURIComponent(fullFileName);
            const hqUrl = `https://storage.pmvhaven.com/${downloadHash}/${encodedFullFileName}`;

            // Stream URL and filename from meta
            const streamFileName = `${downloadHash}.mp4`;

            console.log('[Tampermonkey] HQ URL:', hqUrl);
            console.log('[Tampermonkey] Stream URL:', streamUrl);

            if (document.getElementById('tampermonkey-download-btn-hq') ||
                document.getElementById('tampermonkey-download-btn-stream')) return;

            const hqBtn = createButton('tampermonkey-download-btn-hq', '⬇ Download HQ Video', hqUrl, fullFileName);
            const streamBtn = createButton('tampermonkey-download-btn-stream', '⬇ Download Stream Video', streamUrl, streamFileName);

            // Insert buttons below the video element
            const videoWrapper = document.getElementById('fluid_video_wrapper_VideoPlayer') || videoElement.parentElement;

            videoWrapper.insertAdjacentElement('afterend', hqBtn);
            hqBtn.insertAdjacentElement('afterend', streamBtn);

            console.log('[Tampermonkey] Download buttons added.');
        }

        waited += CHECK_INTERVAL;
        if (waited >= MAX_WAIT_TIME) {
            clearInterval(waitForElements);
            console.warn('[Tampermonkey] Timeout — Required elements not found.');
        }
    }, CHECK_INTERVAL);
})();