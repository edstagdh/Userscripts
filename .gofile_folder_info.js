// ==UserScript==
// @name         GoFile Download Counter + Folder Size in Sidebar
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Count total downloads for .mp4 files and total folder size in a GoFile folder and display in the sidebar
// @author       edstagdh
// @match        https://gofile.io/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let sidebarFooter = null;
    let sidebarSizeDisplay = null;

    function createSidebarItem() {
        const sidebarItem = document.createElement('li');
        sidebarItem.classList.add('sidebar-item', 'hover:text-blue-500', 'flex', 'flex-col', 'gap-2');
        sidebarItem.innerHTML = `
            <div class="flex items-center gap-2">
                <i class="fas fa-chart-bar"></i>
                <span>📊 MP4 Downloads: loading...</span>
            </div>
            <div class="flex items-center gap-2">
                <i class="fas fa-hdd"></i>
                <span>📦 Folder Size: loading...</span>
            </div>
        `;
        sidebarItem.style.padding = '10px';
        sidebarItem.style.marginTop = '10px';

        const footer = document.querySelector('#index_footerSocial');
        if (footer && footer.querySelector('ul')) {
            footer.querySelector('ul').appendChild(sidebarItem);
            sidebarFooter = sidebarItem;
            sidebarSizeDisplay = sidebarItem.querySelectorAll('span')[1];
        }
    }

    function extractDownloadCount(text) {
        const match = text.match(/(\d[\d,.]*)\s*(downloads?|times)/i);
        if (match) {
            return parseInt(match[1].replace(/[,.]/g, ''));
        }
        return 0;
    }

    function parseSize(sizeStr) {
        const match = sizeStr.match(/([\d.]+)\s*(KB|MB|GB|B)/i);
        if (!match) return 0;

        const size = parseFloat(match[1]);
        const unit = match[2].toUpperCase();

        switch (unit) {
            case 'B': return size;
            case 'KB': return size * 1024;
            case 'MB': return size * 1024 * 1024;
            case 'GB': return size * 1024 * 1024 * 1024;
            default: return 0;
        }
    }

    function formatSize(bytes) {
        if (bytes >= 1024 * 1024 * 1024) {
            return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
        } else if (bytes >= 1024 * 1024) {
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        } else if (bytes >= 1024) {
            return (bytes / 1024).toFixed(1) + ' KB';
        } else {
            return bytes + ' B';
        }
    }

    function updateStats() {
        const itemBlocks = document.querySelectorAll('div.border-b.border-gray-600[data-item-id]');
        let downloadTotal = 0;
        let sizeTotalBytes = 0;

        itemBlocks.forEach(block => {
            const fileNameElement = block.querySelector('div.truncate a');
            if (!fileNameElement) return;

            const filename = fileNameElement.textContent.trim();
            const metaSpans = block.querySelectorAll('div.flex.flex-col.text-xs.text-gray-400 span');

            let fileSizeText = '';
            let downloadsText = '';

            if (metaSpans.length >= 3) {
                fileSizeText = metaSpans[1]?.textContent?.trim() ?? '';
                downloadsText = metaSpans[2]?.textContent?.trim() ?? '';
            }

            if (filename.toLowerCase().endsWith('.mp4')) {
                const downloads = extractDownloadCount(downloadsText);
                downloadTotal += downloads;
                console.log(`[LOG] File: ${filename}, Downloads: ${downloads}`);
            }

            if (fileSizeText) {
                const sizeBytes = parseSize(fileSizeText);
                sizeTotalBytes += sizeBytes;
                console.log(`[LOG] File: ${filename}, Size: ${formatSize(sizeBytes)}`);
            }
        });

        const downloadText = `📊 MP4 Downloads: ${downloadTotal.toLocaleString()}`;
        const sizeText = `📦 Folder Size: ${formatSize(sizeTotalBytes)}`;

        if (sidebarFooter) {
            sidebarFooter.querySelector('span').textContent = downloadText;
        }
        if (sidebarSizeDisplay) {
            sidebarSizeDisplay.textContent = sizeText;
        }
    }

    function waitForContentAndStart() {
        const checkInterval = setInterval(() => {
            const itemBlocks = document.querySelectorAll('div.border-b.border-gray-600[data-item-id]');
            if (itemBlocks.length > 0) {
                clearInterval(checkInterval);
                createSidebarItem();
                updateStats();
                setInterval(updateStats, 5000);
            }
        }, 1000);
    }

    waitForContentAndStart();
})();
