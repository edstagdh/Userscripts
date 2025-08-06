// ==UserScript==
// @name         Image Preview on Hover
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Show larger image preview when hovering over thread image
// @author       edstagdh
// @match        https://simpcity.su/*
// @match        https://simpcity.cr/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const previewBox = document.createElement('div');
    previewBox.style.position = 'fixed';
    previewBox.style.pointerEvents = 'none';
    previewBox.style.zIndex = '9999';
    previewBox.style.display = 'none';
    previewBox.style.border = '2px solid #333';
    previewBox.style.background = '#fff';
    previewBox.style.padding = '5px';
    previewBox.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    document.body.appendChild(previewBox);

    const previewImg = document.createElement('img');
    previewImg.style.maxWidth = '500px';
    previewImg.style.maxHeight = '500px';
    previewBox.appendChild(previewImg);

    function showPreview(imgSrc, x, y) {
        previewImg.src = imgSrc;
        previewBox.style.display = 'block';
        movePreview(x, y);
    }

    function hidePreview() {
        previewBox.style.display = 'none';
        previewImg.src = '';
    }

    function movePreview(x, y) {
        const padding = 20;
        const previewWidth = previewBox.offsetWidth || 300;
        const previewHeight = previewBox.offsetHeight || 300;

        let posX = x + padding;
        let posY = y + padding;

        if ((posX + previewWidth) > window.innerWidth) {
            posX = x - previewWidth - padding;
        }
        if ((posY + previewHeight) > window.innerHeight) {
            posY = y - previewHeight - padding;
        }

        posX = Math.max(padding, posX);
        posY = Math.max(padding, posY);

        previewBox.style.left = `${posX}px`;
        previewBox.style.top = `${posY}px`;
    }

    function extractBackgroundImageUrl(style) {
        const match = style.match(/url\(["']?(.*?)["']?\)/);
        return match ? match[1] : null;
    }

    function attachListeners() {
        document.querySelectorAll('.structItem-iconContainer').forEach(container => {
            const img = container.querySelector('img');
            if (!img) return;

            if (container.__previewListenerAttached) return;
            container.__previewListenerAttached = true;

            container.addEventListener('mouseenter', function (e) {
                const bgStyle = img.style.backgroundImage;
                const url = extractBackgroundImageUrl(bgStyle);
                if (url) {
                    showPreview(url, e.clientX, e.clientY);
                }
            });

            container.addEventListener('mousemove', function (e) {
                movePreview(e.clientX, e.clientY);
            });

            container.addEventListener('mouseleave', function () {
                hidePreview();
            });
        });
    }

    attachListeners();

    const observer = new MutationObserver(() => {
        attachListeners();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
