// ==UserScript==
// @name         pixeldrain Enhanced Downloading
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Resize gallery objects, rewrite file URLs, and bypass download limits on Pixeldrain galleries and file pages.
// @author       edstagdh
// @match        https://pixeldrain.com/*
// @match        https://pixeldrain.net/*
// @match        https://cdn.pd8.workers.dev/*
// @grant        GM_openInTab
// ==/UserScript==

(function () {
    'use strict';

    const PIXELDRAIN_VIEW = 'https://pixeldrain.com/u/';
    const PIXELDRAIN_BYPASS = 'https://pd.cybar.xyz/';
    const FILE_ID_REGEX = /\/api\/file\/(\w+)\//;

    function enhanceGalleryLinks() {
        const galleryDivs = Array.from(document.querySelectorAll('div[class^="gallery"]'));
        galleryDivs.forEach(div => {
            const links = div.querySelectorAll('a[class^="file"]');
            links.forEach(link => {
                link.style.width = "275px";
                link.style.height = "220px";

                const icon = link.querySelector('.icon_container');
                if (!icon) return;

                const bgImage = icon.style.backgroundImage;
                const match = bgImage.match(FILE_ID_REGEX);
                if (match && match[1]) {
                    const fileID = match[1];
                    link.href = PIXELDRAIN_VIEW + fileID;
                    link.target = '_blank';
                }
            });
        });
    }

    function getBypassUrls(type) {
        const currentUrl = window.location.href;

        if (type === "file") {
            const fileID = currentUrl.replace(`${location.origin}/u/`, "");
            return PIXELDRAIN_BYPASS + fileID;
        }

        if (type === "gallery") {
            const links = document.querySelectorAll('a.file');
            const combined = [];

            links.forEach(link => {
                const icon = link.querySelector('div.icon_container');
                const bgImage = icon?.style?.backgroundImage;
                const match = bgImage?.match(FILE_ID_REGEX);
                if (match && match[1]) {
                    const fileID = match[1];
                    const name = link.textContent.trim();
                    const url = PIXELDRAIN_BYPASS + fileID;
                    combined.push({ name, url, fileID });
                }
            });

            return combined;
        }
    }

    function startDownload(link) {
        const a = document.createElement("a");
        a.href = link;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function handleBypassDownload() {
        const currentUrl = window.location.href;

        if (currentUrl.includes(`${location.origin}/u/`)) {
            startDownload(getBypassUrls("file"));
        }

        if (currentUrl.includes(`${location.origin}/l/`)) {
            getBypassUrls("gallery")
                .forEach(({ url }) => startDownload(url));
        }
    }

    function handleShowBypassLinks() {
        const popupBox = document.getElementById('popupBox');
        popupBox.innerHTML = '';

        const popupClose = document.createElement('span');
        popupClose.innerHTML = '&times;';
        popupClose.style.position = 'absolute';
        popupClose.style.top = '1px';
        popupClose.style.right = '7px';
        popupClose.style.cursor = 'pointer';
        popupClose.onclick = () => popupBox.style.display = 'none';
        popupBox.appendChild(popupClose);

        const currentUrl = window.location.href;

        if (currentUrl.includes(`${location.origin}/u/`)) {
            const url = getBypassUrls("file");
            const a = document.createElement("a");
            a.href = url;
            a.textContent = url;
            a.style.display = 'block';
            popupBox.appendChild(a);
        }

        if (currentUrl.includes(`${location.origin}/l/`)) {
            const combined = getBypassUrls("gallery").sort((a, b) => {
                const nameA = a.name.trim().toLowerCase();
                const nameB = b.name.trim().toLowerCase();
                return nameA.localeCompare(nameB);
            });

            const table = document.createElement('table');
            table.style.width = '100%';
            table.style.borderCollapse = 'collapse';
            table.style.marginTop = '15px';

            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            const headers = ['Filename', 'Bypass Link'];
            const widths = ['70%', '30%'];

            headers.forEach((headerText, index) => {
                const th = document.createElement('th');
                th.textContent = headerText;
                th.style.borderBottom = '2px solid #ccc';
                th.style.padding = '6px';
                th.style.textAlign = 'left';
                th.style.width = widths[index];
                th.style.color = '#d7dde8';
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            for (let i = 0; i < combined.length; i++) {
                const { name, url, fileID } = combined[i];

                const tr = document.createElement('tr');

                const tdName = document.createElement('td');
                const fileLink = document.createElement('a');
                fileLink.href = PIXELDRAIN_VIEW + fileID;
                fileLink.textContent = name || 'Unknown';
                fileLink.target = '_blank';
                fileLink.style.color = '#8ec7ff';
                tdName.appendChild(fileLink);
                tdName.style.padding = '6px';
                tdName.style.borderBottom = '1px solid #555';

                const tdLink = document.createElement('td');
                const a = document.createElement('a');
                a.href = url;
                a.textContent = url;
                a.style.color = '#8ec7ff';
                a.target = '_blank';
                tdLink.appendChild(a);
                tdLink.style.padding = '6px';
                tdLink.style.borderBottom = '1px solid #555';

                tr.appendChild(tdName);
                tr.appendChild(tdLink);
                tbody.appendChild(tr);
            }

            table.appendChild(tbody);
            popupBox.appendChild(table);

            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.justifyContent = 'center';
            buttonContainer.style.marginTop = '15px';

            const copyBtn = document.createElement("button");
            copyBtn.textContent = '🔗 Copy URLs';
            copyBtn.style.marginRight = '10px';
            copyBtn.onclick = () => {
                const combinedText = combined.map(({ name, url }) => `${name}: ${url}`).join('\n');
                navigator.clipboard.writeText(combinedText).then(() => {
                    copyBtn.textContent = "✔️ Copied";
                    setTimeout(() => copyBtn.textContent = '🔗 Copy URLs', 2500);
                });
            };

            const saveBtn = document.createElement("button");
            saveBtn.textContent = '📄 Save as Text File';
            saveBtn.onclick = () => {
                const fileIdMatch = currentUrl.match(/\/l\/([^/#?]+)/);
                if (fileIdMatch && fileIdMatch[1]) {
                    const fileName = fileIdMatch[1] + '.txt';
                    const content = combined.map(({ name, url }) => `${name}: ${url}`).join('\n');
                    const blob = new Blob([content], { type: 'text/plain' });
                    const urlBlob = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = urlBlob;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(urlBlob);
                }
            };

            buttonContainer.appendChild(copyBtn);
            buttonContainer.appendChild(saveBtn);
            popupBox.appendChild(buttonContainer);
        }

        popupBox.style.display = 'block';
    }

    function addBypassButtons() {
        const button = document.createElement("button");
        button.innerHTML = `<span class="icon">download</span><span>Download Bypass</span>`;
        button.addEventListener('click', handleBypassDownload);

        const linksButton = document.createElement("button");
        linksButton.innerHTML = `<i class="icon">link</i><span>Show Bypass Links</span>`;
        linksButton.addEventListener('click', handleShowBypassLinks);

        const popupBox = document.createElement("div");
        popupBox.id = 'popupBox';
        popupBox.style.display = 'none';
        popupBox.style.position = 'fixed';
        popupBox.style.top = '50%';
        popupBox.style.left = '50%';
        popupBox.style.transform = 'translate(-50%, -50%)';
        popupBox.style.padding = '20px';
        popupBox.style.background = '#2f3541';
        popupBox.style.border = '2px solid #a4be8c';
        popupBox.style.color = '#d7dde8';
        popupBox.style.borderRadius = '10px';
        popupBox.style.width = '70%';
        popupBox.style.height = '90%';
        popupBox.style.zIndex = 9999;
        popupBox.style.overflowY = 'auto';

        document.body.appendChild(popupBox);

        const labels = document.querySelectorAll('div.label');
        labels.forEach(label => {
            if (label.textContent.trim() === 'Size') {
                const target = label.nextElementSibling;
                if (target) {
                    target.insertAdjacentElement('afterend', linksButton);
                    target.insertAdjacentElement('afterend', button);
                }
            }
        });
    }

    function waitForGalleryAndEnhance() {
        const check = setInterval(() => {
            const gallery = document.querySelector('div[class^="gallery"]');
            if (gallery && gallery.querySelector('a[class^="file"]')) {
                clearInterval(check);
                enhanceGalleryLinks();
            }
        }, 500);
    }

    window.addEventListener('load', () => {
        waitForGalleryAndEnhance();
        addBypassButtons();
    });

    const observer = new MutationObserver(enhanceGalleryLinks);
    observer.observe(document.body, { childList: true, subtree: true });
})();
