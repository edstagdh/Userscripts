// ==UserScript==
// @name         PixelDrain D-Folder(Filesystem) Bypass Links Simple + Redirect Fix
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Show bypass download links for Pixeldrain /d/ folders and fix redirect URLs for filesystem links
// @author       edstagdh
// @match        https://pixeldrain.com/d/*
// @match        https://pixeldrain.net/d/*
// @include      /^https:\/\/.*\.pd\d+\.workers\.dev\/.*/
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const isPixeldrainFolder = /^pixeldrain\.(com|net)$/.test(location.hostname) && location.pathname.startsWith('/d/');
    const isWorkerDomain = /\.pd\d+\.workers\.dev$/.test(location.hostname);

    // Redirect Fix Logic
    if (isWorkerDomain) {
        const url = window.location.href;
        const badPattern = '/api/file/api/filesystem/';
        if (url.includes(badPattern)) {
            const fixedUrl = url.replace('/api/file/api/filesystem/', '/api/filesystem/');
            console.log('[RedirectFix] Redirecting to fixed URL:', fixedUrl);
            window.location.replace(fixedUrl);
            return;
        }
    }

    // Folder Bypass Logic
    if (isPixeldrainFolder) {
        function getFolderId() {
            const match = window.location.pathname.match(/^\/d\/([^\/]+)/);
            return match ? match[1] : null;
        }

        function buildBypassUrl(folderId, fileName) {
            const workerDomain = 'pd.1drv.eu.org';
            return `https://${workerDomain}/api/filesystem/${folderId}/${encodeURIComponent(fileName)}`;
        }

        function getFileList() {
            const folderId = getFolderId();
            if (!folderId) return [];
            const nodes = Array.from(document.querySelectorAll(`a[href^="/d/${folderId}/"]`));
            return nodes.map(a => {
                const href = a.getAttribute('href');
                const fileName = decodeURIComponent(href.split('/').pop());
                return {
                    name: fileName,
                    url: buildBypassUrl(folderId, fileName),
                };
            });
        }

        let popupBox = null;

        function showBypassLinks() {
            if (!popupBox) {
                popupBox = document.createElement('div');
                Object.assign(popupBox.style, {
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    padding: '20px',
                    background: '#2f3541',
                    border: '2px solid #a4be8c',
                    color: '#d7dde8',
                    borderRadius: '10px',
                    width: '70%',
                    height: '80%',
                    zIndex: 999999,
                    overflowY: 'auto',
                    fontSize: '18px',
                });
                document.body.appendChild(popupBox);
            }
            popupBox.innerHTML = '';

            const header = document.createElement('div');
            Object.assign(header.style, {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #555',
                paddingBottom: '8px',
                marginBottom: '10px',
            });

            const title = document.createElement('div');
            title.textContent = 'Pixeldrain Bypass Links';
            title.style.fontSize = '18px';
            title.style.fontWeight = 'bold';
            header.appendChild(title);

            const closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            Object.assign(closeBtn.style, {
                fontSize: '24px',
                lineHeight: '20px',
                background: 'none',
                border: 'none',
                color: '#d7dde8',
                cursor: 'pointer',
            });
            closeBtn.onclick = () => (popupBox.style.display = 'none');
            header.appendChild(closeBtn);

            popupBox.appendChild(header);

            const files = getFileList();
            if (files.length === 0) {
                const msg = document.createElement('div');
                msg.textContent = 'No files found in this folder.';
                popupBox.appendChild(msg);
                popupBox.style.display = 'block';
                return;
            }

            const table = document.createElement('table');
            Object.assign(table.style, {
                width: '100%',
                borderCollapse: 'collapse',
                color: '#d7dde8',
            });

            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');

            const colFile = document.createElement('th');
            colFile.textContent = 'Filename';
            Object.assign(colFile.style, {
                padding: '8px',
                borderBottom: '2px solid #555',
                width: '50%',
                textAlign: 'left',
            });
            headerRow.appendChild(colFile);

            const colLink = document.createElement('th');
            colLink.textContent = 'Download Link';
            Object.assign(colLink.style, {
                padding: '8px',
                borderBottom: '2px solid #555',
                width: '50%',
                textAlign: 'left',
            });
            headerRow.appendChild(colLink);

            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');

            for (const file of files) {
                const tr = document.createElement('tr');

                const tdName = document.createElement('td');
                tdName.textContent = file.name;
                Object.assign(tdName.style, {
                    padding: '6px',
                    borderBottom: '1px solid #444',
                    wordBreak: 'break-word',
                });
                tr.appendChild(tdName);

                const tdLink = document.createElement('td');
                const a = document.createElement('a');
                a.href = file.url;
                a.textContent = 'Download';
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.style.color = '#8ec7ff';
                tdLink.appendChild(a);
                Object.assign(tdLink.style, {
                    padding: '6px',
                    borderBottom: '1px solid #444',
                    wordBreak: 'break-word',
                });
                tr.appendChild(tdLink);

                tbody.appendChild(tr);
            }

            table.appendChild(tbody);
            popupBox.appendChild(table);
            popupBox.style.display = 'block';
        }

        function addShowBypassButton() {
            const toolbar = Array.from(document.querySelectorAll('div')).find(div => {
                if (!div.children) return false;
                const labels = div.querySelectorAll('div.label');
                if (labels.length < 3) return false;
                const labelTexts = Array.from(labels).map(l => l.textContent.trim().toLowerCase());
                return labelTexts.includes('directories') && labelTexts.includes('files') && labelTexts.includes('total size');
            });

            if (!toolbar) return false;

            const gridDiv = toolbar.querySelector('div.grid');
            if (!gridDiv) return false;

            if (document.getElementById('bypassButtonContainer')) return true;

            const buttonContainer = document.createElement('div');
            buttonContainer.id = 'bypassButtonContainer';
            buttonContainer.style.display = 'flex';
            buttonContainer.style.justifyContent = 'center';
            buttonContainer.style.marginTop = '15px';
            buttonContainer.style.gap = '10px';

            const btn = document.createElement('button');
            btn.textContent = 'Show Bypass Links';
            btn.title = 'Show direct bypass download links for all files in this folder';

            Object.assign(btn.style, {
                cursor: 'pointer',
                padding: '12px 30px',
                fontSize: '16px',
                fontWeight: '600',
                borderRadius: '6px',
                backgroundColor: '#4a90e2',
                color: 'white',
                border: 'none',
                boxShadow: '0 3px 6px rgba(0,0,0,0.2)',
                transition: 'background-color 0.3s ease',
                minWidth: '160px',
                minHeight: '40px',
            });

            btn.addEventListener('mouseenter', () => btn.style.backgroundColor = '#357ABD');
            btn.addEventListener('mouseleave', () => btn.style.backgroundColor = '#4a90e2');

            btn.addEventListener('click', showBypassLinks);

            buttonContainer.appendChild(btn);
            gridDiv.appendChild(buttonContainer);

            return true;
        }

        function initObserver() {
            const observer = new MutationObserver(() => {
                const added = addShowBypassButton();
                if (added) observer.disconnect();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        function waitForReady() {
            const intervalId = setInterval(() => {
                const added = addShowBypassButton();
                if (added) clearInterval(intervalId);
            }, 500);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                initObserver();
                waitForReady();
            });
        } else {
            initObserver();
            waitForReady();
        }
    }
})();
