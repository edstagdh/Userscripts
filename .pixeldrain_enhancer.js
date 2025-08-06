// ==UserScript==
// @name         PixelDrain Enhanced Downloading
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Resize gallery links, rewrite file URLs, and bypass download limits on Pixeldrain galleries and file pages.
// @author       Master
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
    const API_KEY = ''; // <--- SET YOUR API KEY HERE

    if (!API_KEY) {
        console.warn('[Pixeldrain Bypass] API key is missing — file sizes will show as N/A.');
    }

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

                    // Try to find the deepest element with meaningful text
                    let name = 'Unknown';
                    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT, null);
                    let node;
                    while ((node = walker.nextNode())) {
                        const text = node.textContent.trim();
                        if (text.length > 4 && text.includes('.')) {
                            name = text;
                        }
                    }
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

    async function fetchFileSize(fileID) {
        try {
            const res = await fetch(`https://pixeldrain.com/api/file/${fileID}/info`, {
                headers: {
                    'Authorization': `Basic ${btoa(":" + API_KEY)}`
                }
            });
            const json = await res.json();
            if (json.size) {
                const size = parseInt(json.size, 10);
                return formatBytes(size);
            }
        } catch (e) {
            console.warn("Failed to fetch file size", fileID, e);
        }
        return 'N/A';
    }

    function formatBytes(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function handleShowBypassLinks() {
        const popupBox = document.getElementById('popupBox');
        popupBox.innerHTML = '';

        const headerContainer = document.createElement('div');
        headerContainer.style.position = 'sticky';
        headerContainer.style.top = '0';
        headerContainer.style.background = '#2f3541';
        headerContainer.style.zIndex = '1001';
        headerContainer.style.padding = '10px 10px 0 10px';
        headerContainer.style.borderBottom = '1px solid #555';
        headerContainer.style.display = 'flex';
        headerContainer.style.justifyContent = 'flex-end';

        const popupClose = document.createElement('span');
        popupClose.innerHTML = '&times;';
        popupClose.style.cursor = 'pointer';
        popupClose.style.fontSize = '24px';
        popupClose.style.flexShrink = '0';
        popupClose.onclick = () => (popupBox.style.display = 'none');

        headerContainer.appendChild(popupClose);
        popupBox.appendChild(headerContainer);

        const currentUrl = window.location.href;

        if (currentUrl.includes(`${location.origin}/u/`)) {
            const url = getBypassUrls("file");
            const a = document.createElement("a");
            a.href = url;
            a.textContent = url;
            a.style.display = 'block';
            a.style.padding = '10px';
            popupBox.appendChild(a);
        } else if (currentUrl.includes(`${location.origin}/l/`)) {
            const combined = getBypassUrls("gallery").sort((a, b) => {
                return a.name.trim().localeCompare(b.name.trim());
            });

            const table = document.createElement('table');
            table.style.width = '100%';
            table.style.borderCollapse = 'collapse';
            table.style.tableLayout = 'fixed';
            table.style.color = '#d7dde8';

            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            const headers = ['Filename', 'Bypass Link', 'Size'];
            const widths = ['65%', '25%', '10%'];

            headers.forEach((text, i) => {
                const th = document.createElement('th');
                th.textContent = text;
                th.style.width = widths[i];
                th.style.padding = '6px';
                th.style.borderBottom = '2px solid #ccc';
                th.style.textAlign = 'left';
                headerRow.appendChild(th);
            });

            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbodyContainer = document.createElement('div');
            tbodyContainer.style.overflowY = 'auto';
            tbodyContainer.style.maxHeight = 'calc(80vh - 100px)';
            tbodyContainer.style.borderTop = '1px solid #555';

            const tbodyTable = document.createElement('table');
            tbodyTable.style.width = '100%';
            tbodyTable.style.borderCollapse = 'collapse';
            tbodyTable.style.tableLayout = 'fixed';
            tbodyTable.style.color = '#d7dde8';

            const tbody = document.createElement('tbody');
            const rowRefs = [];

            for (let i = 0; i < combined.length; i++) {
                const { name, url, fileID } = combined[i];
                const tr = document.createElement('tr');

                const tdName = document.createElement('td');
                const link = document.createElement('a');
                link.href = PIXELDRAIN_VIEW + fileID;
                link.textContent = name;
                link.target = '_blank';
                link.style.color = '#8ec7ff';
                tdName.appendChild(link);
                tdName.style.padding = '6px';
                tdName.style.borderBottom = '1px solid #555';
                tdName.style.wordBreak = 'break-word';
                tdName.style.width = widths[0];

                const tdLink = document.createElement('td');
                const a = document.createElement('a');
                a.href = url;
                a.textContent = url;
                a.style.color = '#8ec7ff';
                a.target = '_blank';
                tdLink.appendChild(a);
                tdLink.style.padding = '6px';
                tdLink.style.borderBottom = '1px solid #555';
                tdLink.style.wordBreak = 'break-word';
                tdLink.style.width = widths[1];

                const tdSize = document.createElement('td');
                tdSize.textContent = '...';
                tdSize.style.padding = '6px';
                tdSize.style.borderBottom = '1px solid #555';
                tdSize.style.width = widths[2];
                tdSize.style.color = '#ccc';

                tr.appendChild(tdName);
                tr.appendChild(tdLink);
                tr.appendChild(tdSize);

                tbody.appendChild(tr);
                rowRefs.push({ fileID, tdSize });
            }

            tbodyTable.appendChild(tbody);
            tbodyContainer.appendChild(tbodyTable);

            popupBox.appendChild(table);
            popupBox.appendChild(tbodyContainer);

            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.justifyContent = 'center';
            buttonContainer.style.marginTop = '15px';
            buttonContainer.style.gap = '10px';

            const copyBtn = document.createElement("button");
            copyBtn.textContent = '🔗 Copy URLs';
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

            // Fetch file sizes one by one
            (async () => {
                if (!API_KEY) {
                    for (const { tdSize } of rowRefs) {
                        tdSize.textContent = 'N/A';
                    }
                } else {
                    for (const { fileID, tdSize } of rowRefs) {
                        tdSize.textContent = await fetchFileSize(fileID);
                    }
                }
            })();
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
