// ==UserScript==
// @name         pornolab column preview
// @description  Adds a preview image column to the tracker browsing table on pornolab
// @namespace    https://pornolab.net/forum/index.php
// @version      0.3
// @author       tobij12, edstagdh
// @match        https://pornolab.net/forum/tracker.php*
// @require      https://cdn.jsdelivr.net/npm/axios@0.19.0/dist/axios.min.js
// @grant        GM_xmlhttpRequest
// ==/UserScript==


(function () {
    'use strict';

    const PREVIEW_WIDTH = 300;
    const PREVIEW_HEIGHT = 200;
    const ZOOM_WIDTH = 600;
    const ZOOM_HEIGHT = 400;
    const MIN_VALID_IMAGE_SIZE = 150;

    const table = document.getElementById('tor-tbl');
    if (!table) return;

    // Insert new "Preview" column header after "Форум"
    const headerRow = table.querySelector('thead tr');
    const forumTh = headerRow.children[2]; // "Форум" is the 3rd column
    const previewTh = document.createElement('th');
    previewTh.innerHTML = '<b class="tbs-text">Preview</b><span class="tbs-icon">&nbsp;&nbsp;</span>';
    forumTh.after(previewTh);

    // Insert new "Preview" cells for each row
    const rows = table.querySelectorAll('tbody tr.tCenter');
    rows.forEach(row => {
        const forumTd = row.children[2];
        const previewTd = document.createElement('td');
        previewTd.classList.add('preview-cell');
        forumTd.after(previewTd);

        const link = row.querySelector('.tLink');
        if (!link) return;

        axios.get(link.href).then(res => {
            const div = document.createElement('div');
            div.innerHTML = res.data;
            const imageTags = div.querySelectorAll('var.postImg');

            if (imageTags.length === 0) return;

            function tryImage(index = 0, fallbackSrc = null) {
                if (index >= imageTags.length) {
                    if (fallbackSrc) {
                        addPreview(fallbackSrc);
                    }
                    return;
                }

                const imageTag = imageTags[index];
                if (!imageTag || !imageTag.title) {
                    tryImage(index + 1, fallbackSrc);
                    return;
                }

                const imgSrc = imageTag.title;
                const testImg = new Image();
                testImg.src = imgSrc;

                testImg.onload = function () {
                    if (this.width >= MIN_VALID_IMAGE_SIZE && this.height >= MIN_VALID_IMAGE_SIZE) {
                        addPreview(imgSrc);
                    } else {
                        if (!fallbackSrc) fallbackSrc = imgSrc;
                        tryImage(index + 1, fallbackSrc);
                    }
                };

                testImg.onerror = function () {
                    tryImage(index + 1, fallbackSrc);
                };
            }

            function addPreview(imgSrc) {
                const thumb = document.createElement('img');
                thumb.src = imgSrc;
                thumb.style.maxWidth = PREVIEW_WIDTH + 'px';
                thumb.style.maxHeight = PREVIEW_HEIGHT + 'px';
                thumb.style.cursor = 'zoom-in';

                // Create popup
                const popup = document.createElement('div');
                popup.style.position = 'fixed';
                popup.style.display = 'none';
                popup.style.zIndex = '9999';
                popup.style.border = '2px solid #000';
                popup.style.backgroundColor = '#000';
                popup.style.padding = '1px';
                popup.style.pointerEvents = 'none';

                const popupImg = document.createElement('img');
                popupImg.src = imgSrc;
                popupImg.style.maxWidth = ZOOM_WIDTH + 'px';
                popupImg.style.maxHeight = ZOOM_HEIGHT + 'px';
                popup.appendChild(popupImg);
                document.body.appendChild(popup);

                // Hover handlers
                thumb.addEventListener('mouseenter', e => {
                    popup.style.left = (e.clientX + 20) + 'px';
                    popup.style.top = (e.clientY + 20) + 'px';
                    popup.style.display = 'block';
                });

                thumb.addEventListener('mousemove', e => {
                    popup.style.left = (e.clientX + 20) + 'px';
                    popup.style.top = (e.clientY + 20) + 'px';
                });

                thumb.addEventListener('mouseleave', () => {
                    popup.style.display = 'none';
                });

                previewTd.appendChild(thumb);
            }

            tryImage();
        });
    });
})();