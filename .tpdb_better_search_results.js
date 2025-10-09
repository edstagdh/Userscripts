// ==UserScript==
// @name         ThePornDB - Enhanced Table/Grid Toggle with Lazy Load Fix & Proper Image Toggle + Hover Preview
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Table/grid toggle with lazy-loaded scenes, styled performers, resizable columns, hide images, and hover preview in table view.
// @author       edstagdh
// @match        https://theporndb.net/*
// @icon         https://theporndb.net/favicon-16x16.png
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    "use strict";

    /* ---------- CSS ---------- */
    GM_addStyle(`
        h2.p-3.text-xl a {
            font-weight: bold !important;
            color: #FFD700 !important;
            font-size: 1.1em !important;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.6);
            font-family: "Segoe UI","Arial Black",sans-serif !important;
        }
        h2.p-3.text-xl a:hover {
            color: #FF4757 !important;
            text-decoration: underline !important;
        }
        h2.p-3.text-xl.truncate,
        h2.p-3.text-xl.truncate a,
        div.flex.truncate,
        div.flex.truncate span {
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: clip !important;
            max-width: none !important;
            display: block !important;
        }
        #tpdb-table-view table {
            width: 100%;
            border-collapse: collapse;
            font-size: 18px;
            table-layout: fixed;
        }
        #tpdb-table-view th,
        #tpdb-table-view td {
            padding: 6px 8px;
            border-bottom: 1px solid #ccc;
            word-wrap: break-word;
            white-space: normal;
            vertical-align: top;
            position: relative;
        }
        #tpdb-table-view th {
            background: #333;
            color: #fff;
            text-align: left;
            user-select: none;
            font-weight: bold !important;
        }
        .col-resizer {
            position: absolute;
            top: 0;
            right: 0;
            width: 5px;
            height: 100%;
            cursor: col-resize;
            user-select: none;
        }
        .tpdb-thumb {
            width: 200px;
            transition: opacity 0.25s ease-in-out;
            cursor: zoom-in;
        }
        .tpdb-toolbar button {
            margin-right: 8px;
            padding: 6px 12px;
            background: #d9534f;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
    `);

    /* ---------- Inline Untruncate ---------- */
    function forceInlineUntruncate() {
        document.querySelectorAll('h2.p-3.text-xl.truncate').forEach(h2 => {
            const a = h2.querySelector('a');
            h2.classList.remove('truncate');
            Object.assign(h2.style, { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', maxWidth: 'none', display: 'block' });
            if (a) {
                a.classList.remove('truncate');
                Object.assign(a.style, { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', maxWidth: 'none', display: 'block' });
            }
        });
        document.querySelectorAll('div.flex.truncate').forEach(div => {
            div.classList.remove('truncate');
            Object.assign(div.style, { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', maxWidth: 'none', display: 'block' });
        });
    }
    const inlineInterval = setInterval(forceInlineUntruncate, 500);
    setTimeout(() => clearInterval(inlineInterval), 10000);
    new MutationObserver(forceInlineUntruncate).observe(document.body, { childList: true, subtree: true });

    /* ---------- Wait for Lazy-Loaded Scenes ---------- */
async function waitForAllScenes(grid) {
    return new Promise((resolve) => {
        let lastCount = 0;
        let stableTicks = 0;

        const interval = setInterval(() => {
            const items = grid.querySelectorAll("div.relative.group");

            // Scroll the window to bottom to trigger lazy load
            window.scrollTo(0, document.body.scrollHeight);

            if (items.length === lastCount) {
                stableTicks++;
                // wait 3 stable ticks (~900ms) to be sure no more load
                if (stableTicks >= 3) {
                    clearInterval(interval);
                    // Scroll back to top
                    window.scrollTo(0, 0);
                    resolve();
                }
            } else {
                stableTicks = 0;
                lastCount = items.length;
            }
        }, 300);
    });
}


    /* ---------- Toolbar ---------- */
    async function initToolbar() {
        if (document.getElementById("tpdb-toolbar")) return;
        const grid = document.querySelector("div.grid.grid-cols-w-72");
        if (!grid || !grid.parentNode) return;

        const toolbar = document.createElement("div");
        toolbar.id = "tpdb-toolbar";
        toolbar.className = "tpdb-toolbar";
        toolbar.style.margin = "10px 0";

        /* Hide Images Button */
        const hideBtn = document.createElement("button");
        hideBtn.textContent = "Hide Images";
        let imagesHidden = false;
        hideBtn.addEventListener("click", () => {
            imagesHidden = !imagesHidden;
            const containers = document.querySelectorAll("div.relative.h-64");
            containers.forEach((c) => {
                const media = c.querySelector("img, video");
                if (media) {
                    if (imagesHidden) {
                        media.style.display = "none";
                        c.style.height = "4rem";
                        c.style.minHeight = "3rem";
                    } else {
                        media.style.display = "";
                        c.style.height = "";
                        c.style.minHeight = "";
                    }
                }
            });
            hideBtn.textContent = imagesHidden ? "Show Images" : "Hide Images";
            hideBtn.style.background = imagesHidden ? "#0275d8" : "#d9534f";
        });

        /* Table View Button */
        const tableBtn = document.createElement("button");
        tableBtn.textContent = "Table View";
        let tableActive = false;
        let tableWrapper = null;
        let tableLoading = false;

        tableBtn.addEventListener("click", async () => {
            if (tableLoading) return;

            tableActive = !tableActive;

            if (tableActive) {
                tableBtn.textContent = "Grid View";
                tableBtn.style.background = "#f0ad4e";
                grid.style.display = "none";
                tableLoading = true;

                await waitForAllScenes(grid);

                if (!tableWrapper) {
                    tableWrapper = buildTable(grid);
                    grid.parentNode.insertBefore(tableWrapper, grid);
                }
                tableWrapper.style.display = "";
                initThumbnailPreview(tableWrapper); // activate preview only in table view
                tableLoading = false;
            } else {
                tableBtn.textContent = "Table View";
                tableBtn.style.background = "#5cb85c";
                if (tableWrapper) tableWrapper.style.display = "none";
                grid.style.display = "";
            }
        });

        toolbar.append(hideBtn, tableBtn);
        grid.parentNode.insertBefore(toolbar, grid);
    }

    /* ---------- Build Table ---------- */
function buildTable(grid) {
    const wrapper = document.createElement("div");
    wrapper.id = "tpdb-table-view";

    const table = document.createElement("table");
    table.innerHTML = `
        <thead>
            <tr>
                <th style="width:100px;">Thumbnail<div class="col-resizer"></div></th>
                <th style="width:260px;">Title<div class="col-resizer"></div></th>
                <th style="width:80px;">Date (YYYY.MM.DD)<div class="col-resizer"></div></th>
                <th style="width:50px;">Duration<div class="col-resizer"></div></th>
                <th style="width:70px;">Site<div class="col-resizer"></div></th>
                <th style="width:150px;">Performers<div class="col-resizer"></div></th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    grid.querySelectorAll("div.relative.group").forEach(card => {
        const titleLink = card.querySelector("h2 a");
        const thumb = card.querySelector("img");
        const thumbsrc = thumb.src
        const largethumbSrc = thumbsrc.replace(/-small(\.[a-zA-Z0-9]+)$/, '-large$1');

        // Date = first .flex inside the bottom overlay
        const rawDate = card.querySelector("div.absolute div.flex:not(.place-items-center)")?.textContent?.trim() || "";

        // Duration = time inside place-items-center
        const duration = card.querySelector("div.flex.place-items-center")?.childNodes[0]?.textContent?.trim() || "";

        // Site link and name
        const siteAnchor = card.querySelector("div.grid.justify-end.items-center a");
        let siteHTML = "";
        if (siteAnchor) {
            const siteName = siteAnchor.textContent.trim();
            let siteHref = siteAnchor.getAttribute("href");
            if (siteHref && !siteHref.startsWith("http")) {
                siteHref = "https://theporndb.net" + siteHref; // make sure relative links are full URLs
            }
            siteHTML = `<a href="${siteHref}" target="_blank" style="
                color: #1E90FF;
                text-decoration: none;
                font-weight: bold;
            ">${siteName}</a>`;
        }

        // Performers
        const performerLinks = getPerformersHTML(card);

        // --- Convert date to YYYY.MM.DD ---
        let formattedDate = rawDate;
        if (rawDate) {
            const d = new Date(rawDate);
            if (!isNaN(d)) {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, "0");
                const day = String(d.getDate()).padStart(2, "0");
                formattedDate = `${y}.${m}.${day}`;
            }
        }

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${thumb ? `<img src="${largethumbSrc}" class="tpdb-thumb">` : ""}</td>
            <td>${titleLink ? `<a href="${titleLink.href}" target="_blank">${titleLink.textContent.trim()}</a>` : ""}</td>
            <td>${formattedDate}</td>
            <td>${duration}</td>
            <td>${siteHTML}</td>
            <td>${performerLinks}</td>
        `;
        tbody.appendChild(row);
    });

    wrapper.appendChild(table);
    makeColumnsResizable(table);
    return wrapper;
}

    /* ---------- Performer HTML ---------- */
    function getPerformersHTML(card) {
        return [...card.querySelectorAll("div.p-3.border-t a")].map((a) => {
            const bg = window.getComputedStyle(a).backgroundColor;
            const color = window.getComputedStyle(a).color;
            const svg = a.querySelector("svg")?.outerHTML || "";
            const name = a.querySelector("span:last-child")?.textContent.trim() || a.textContent.trim();
            return `<a href="${a.href}" target="_blank" style="
                    background:${bg};
                    color:${color};
                    padding:2px 6px;
                    border-radius:3px;
                    display:inline-flex;
                    align-items:center;
                    font-size:16px;
                    font-weight: bold;
                    margin:0 2px 2px 0;
                    white-space:nowrap;
                ">${svg}<span style="margin-left:2px;">${name}</span></a>`;
        }).join("");
    }

    /* ---------- Column Resizing ---------- */
    function makeColumnsResizable(table) {
        const ths = table.querySelectorAll("th");
        ths.forEach(th => {
            const resizer = th.querySelector(".col-resizer");
            if (!resizer) return;
            resizer.addEventListener("mousedown", initDrag);

            function initDrag(e) {
                e.preventDefault();
                const startX = e.pageX;
                const startWidth = th.offsetWidth;
                function doDrag(e) {
                    th.style.width = startWidth + (e.pageX - startX) + "px";
                }
                function stopDrag() {
                    document.removeEventListener("mousemove", doDrag);
                    document.removeEventListener("mouseup", stopDrag);
                }
                document.addEventListener("mousemove", doDrag);
                document.addEventListener("mouseup", stopDrag);
            }
        });
    }

    /* ---------- Thumbnail Hover Preview (only in table view) ---------- */
    function initThumbnailPreview(tableWrapper) {
        if (tableWrapper.__previewInit) return;
        tableWrapper.__previewInit = true;

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
        previewImg.style.maxWidth = '800px';
        previewImg.style.maxHeight = '800px';
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
            const previewWidth = previewBox.offsetWidth || 600;
            const previewHeight = previewBox.offsetHeight || 600;

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

        tableWrapper.querySelectorAll('.tpdb-thumb').forEach(img => {
            img.addEventListener('mouseenter', function (e) {
                showPreview(img.src, e.clientX, e.clientY);
            });
            img.addEventListener('mousemove', function (e) {
                movePreview(e.clientX, e.clientY);
            });
            img.addEventListener('mouseleave', function () {
                hidePreview();
            });
        });
    }

    /* ---------- Init ---------- */
    const observer = new MutationObserver(initToolbar);
    observer.observe(document.body, { childList: true, subtree: true });
    initToolbar();

    /* ---------- Force object-fit: contain in grid view ---------- */
    function fixGridImageFit() {
        document.querySelectorAll('div.grid.grid-cols-w-72 img[style*="object-fit"]').forEach(img => {
            if (img.style.objectFit === "cover") {
                img.style.objectFit = "contain";
                img.style.backgroundColor = "#000"; // optional: black background for aspect difference
            }
        });
    }

    // Run on page load and whenever new elements are added
    const imgObserver = new MutationObserver(fixGridImageFit);
    imgObserver.observe(document.body, { childList: true, subtree: true });

    // Initial run
    fixGridImageFit();

        /* ---------- Grid View: object-fit contain + no link + hover preview (large image fix) ---------- */
    function enhanceGridImages() {
        // 1. Fix image object-fit & unwrap link
        document.querySelectorAll('div.grid.grid-cols-w-72 img[style*="object-fit"]').forEach(img => {
            // Remove <a> wrapper
            const parentLink = img.closest('a');
            if (parentLink) {
                const parent = parentLink.parentNode;
                if (parent) parent.replaceChild(img, parentLink);
            }

            // Replace "cover" with "contain"
            img.style.objectFit = "contain";
            img.style.backgroundColor = "#000";

            // ✅ Add missing inline style rules for sizing
            img.style.height = "200px";
            img.style.width = "100%";
            img.style.display = "block";
            img.style.margin = "0 auto";
        });

        // 2. Setup hover preview box once
        if (!document.getElementById('tpdb-grid-preview-box')) {
            const previewBox = document.createElement('div');
            previewBox.id = 'tpdb-grid-preview-box';
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
            previewImg.style.maxWidth = '700px';
            previewImg.style.maxHeight = '700px';
            previewBox.appendChild(previewImg);

            function showPreview(imgSrc, x, y) {
                // Replace "-small" with "-large" in image URL if present
                const largeSrc = imgSrc.replace(/-small(\.[a-zA-Z0-9]+)$/, '-large$1');
                previewImg.src = largeSrc;
                previewBox.style.display = 'block';
                movePreview(x, y);
            }

            function hidePreview() {
                previewBox.style.display = 'none';
                previewImg.src = '';
            }

            function movePreview(x, y) {
                const padding = 20;
                const previewWidth = previewBox.offsetWidth || 800;
                const previewHeight = previewBox.offsetHeight || 800;

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

            // 3. Bind hover events for grid images
            function bindHoverEvents() {
                document.querySelectorAll('div.grid.grid-cols-w-72 img').forEach(img => {
                    if (img.__hoverBound) return;
                    img.__hoverBound = true;

                    img.addEventListener('mouseenter', e => showPreview(img.src, e.clientX, e.clientY));
                    img.addEventListener('mousemove', e => movePreview(e.clientX, e.clientY));
                    img.addEventListener('mouseleave', hidePreview);
                });
            }

            // Initial and lazy-load binding
            bindHoverEvents();
            new MutationObserver(bindHoverEvents).observe(document.body, { childList: true, subtree: true });
        }
    }

    // 4. Observe DOM for new grid items (lazy-loaded scenes)
    const gridObserver = new MutationObserver(enhanceGridImages);
    gridObserver.observe(document.body, { childList: true, subtree: true });

    // Initial run
    enhanceGridImages();

})();
