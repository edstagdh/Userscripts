// ==UserScript==
// @name         ThePornDB - Enhanced Table/Grid Toggle with Lazy Load Fix & Proper Image Toggle + Hover Preview
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Table/grid toggle with lazy-loaded scenes, styled performers, resizable columns, hide images, and hover preview in table view.
// @author       edstagdh
// @match        https://theporndb.net/*
// @icon         https://theporndb.net/favicon-16x16.png
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      api.theporndb.net
// ==/UserScript==

// CHANGELOG
// v2.0:
// -big overhaul
// v1.8:
// -added show site parents hierarchy button(requires API key configured - "API_AUTH").
// -added collect scene button(requires API key configured - "API_AUTH").
// -added copy scene UUID button(requires API key configured - "API_AUTH").
// -fixed hover on scene image for larger preview.
// -fixed table view button.
// -fixed custom hide images button.
// -fixed custom table view button


(function () {
    "use strict";

    // === CONFIG ===
    const API_URL= "https://api.theporndb.net/";
    const API_AUTH= "";
    const API_SITES_URL= "https://api.theporndb.net/sites/";
    const API_Collections_URL= "https://api.theporndb.net/user/collection";

    /* ---------- CSS ---------- */
    GM_addStyle(`
        h2.p-3.text-xl a {
            font-weight: bold !important;
            color: #fff !important;
            font-size: 1em !important;
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
        div.grid.grid-cols-scene-card div.flex.truncate {
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
        }
        div.grid.grid-cols-scene-card div.flex.truncate span {
            display: inline !important;
        }
            /* Make performer names bold and larger */
        div.grid.grid-cols-scene-card div.p-3.border-t a span {
            font-weight: bold !important;
            font-size: 16px !important; /* adjust size as needed */
        }
        .tpdb-copy-btn {
            width: 30px;
            height: 30px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-left: 6px;
            border: 1px solid #888;
            border-radius: 3px;
            background: #222;
            color: #fff;
            font-size: 30px;
            cursor: pointer;
            user-select: none;
        }

        .tpdb-copy-btn:hover {
            background: #FF4757;
        }
        /* === Hide Images Toggle === */
        body.tpdb-hide-images img {
            display: none !important;
        }

        /* Keep layout compact when images are hidden */
        body.tpdb-hide-images div.relative {
            min-height: 3rem !important;
        }
    `);

    /* ---------- Inline Untruncate ---------- */
    function forceInlineUntruncate() {
        document.querySelectorAll('h2.p-3.text-xl.truncate').forEach(h2 => {
            const a = h2.querySelector('a');
            h2.classList.remove('truncate');
            Object.assign(h2.style, { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', maxWidth: 'none', display: 'inline-flex' });
            if (a) {
                a.classList.remove('truncate');
                Object.assign(a.style, { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', maxWidth: 'none', display: 'inline-flex' });
            }
        });
        document.querySelectorAll('div.flex.truncate').forEach(div => {
            div.classList.remove('truncate');
            Object.assign(div.style, { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', maxWidth: 'none', display: 'inline-flex' });
        });
    }

    function formatGridDates() {
        document.querySelectorAll(
            "div.absolute div.flex:not(.place-items-center)"
        ).forEach(el => {
            if (el.__dateFormatted) return; // prevent reprocessing
            el.__dateFormatted = true;

            const raw = el.textContent.trim();
            if (!raw) return;

            const d = new Date(raw);
            if (isNaN(d)) return;

            const yy = String(d.getFullYear());
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");

            el.textContent = `${yy}.${mm}.${dd}`;
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


    function showToast(message, duration = 5000) {
        const toast = document.createElement("div");

        toast.style.whiteSpace = "pre-line";
        toast.style.position = "fixed";
        toast.style.bottom = "20px";
        toast.style.right = "20px";

        // Bigger, more visible container
        toast.style.background = "#1a1a1a";
        toast.style.color = "#ffa500"; // orange text
        toast.style.padding = "16px 20px";
        toast.style.borderRadius = "10px";
        toast.style.fontSize = "16px";
        toast.style.fontWeight = "700"; // bold
        toast.style.lineHeight = "1.4";
        toast.style.minWidth = "280px";
        toast.style.maxWidth = "1000px";

        // Make it stand out more
        toast.style.border = "2px solid #ffa500";
        toast.style.boxShadow = "0 6px 18px rgba(255,165,0,0.35)";

        toast.style.zIndex = "10000";
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.25s ease, transform 0.25s ease";
        toast.style.transform = "translateY(10px)";

        document.body.appendChild(toast);

        // stack above existing toasts (adjust spacing for bigger size)
        const existing = document.querySelectorAll(".tpdb-toast");
        toast.style.bottom = `${20 + existing.length * 80}px`;
        toast.className = "tpdb-toast";

        toast.textContent = message;

        requestAnimationFrame(() => {
            toast.style.opacity = "1";
            toast.style.transform = "translateY(0)";
        });

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(10px)";
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }


    async function showSceneSiteParents(sceneJson) {

        const sites = [];

        try {
            let siteUuid = sceneJson?.data?.site?.uuid;

            if (!siteUuid) {
                throw new Error("Scene JSON missing data.site.uuid");
            }

            let level = 0;

            while (siteUuid) {
                const requestUrl = `${API_SITES_URL.replace(/\/$/, "")}/${encodeURIComponent(siteUuid)}`;

                const response = await fetch(requestUrl, {
                    method: "GET",
                    headers: {
                        "accept": "application/json",
                        "Authorization": `Bearer ${API_AUTH}`
                }
                });

                if (!response.ok) {
                    throw new Error(`Site API request failed: ${response.status}`);
                }

                const json = await response.json();
                const site = json?.data;

                if (!site) {
                    throw new Error("Site response missing data");
                }

                sites.push(site.name);

                // move up using embedded parent object
                if (site.parent && site.parent.uuid) {
                    siteUuid = site.parent.uuid;
                    level++;
                } else {
                    // top-level site reached
                    break;
                }
            }

            // reverse so top parent is first
            const ordered = sites.reverse();

            // add numbering (0 = top parent)
            const formatted = ordered.map((name, index) => `${index}: ${name}`);

            showToast(`🌳 Site hierarchy:\n${formatted.join("\n")}`, 8000);

        } catch (err) {
            console.error("Site parent traversal failed:", err);
            alert("Failed to resolve site parents — check console");
        }
    }

    function copySlugFromUrl(url) {
        try {
            const u = new URL(url);
            const parts = u.pathname.split("/").filter(Boolean);
            const slug = parts[parts.length - 1];

            const requestUrl = `${API_URL.replace(/\/$/, "")}/scenes/${encodeURIComponent(slug)}`;

            fetch(requestUrl, {
                method: "GET",
                headers: {
                    "accept": "application/json",
                    "Authorization": `Bearer ${API_AUTH}`
            }
            })
                .then(response => {
                console.log("API status:", response.status);
                console.log("API headers:", [...response.headers.entries()]);
                return response.text().then(text => {
                    console.log("API raw response:", text);
                    if (!response.ok) {
                        throw new Error(`API request failed: ${response.status}`);
                    }
                    return JSON.parse(text);
                });
            })
                .then(json => {
                const id = json?.data?.id;
                if (!id) {
                    throw new Error("Response missing data.id");
                }
                return navigator.clipboard.writeText(id).then(() => id);
            })
                .then(id => {
                console.log("Copied scene ID:", id);
                showToast(`Copied scene ID: ${id}`, 5000);
            })

                .catch(err => {
                console.error("Copy scene ID failed:", err);
                alert("Failed to copy scene ID — check console");
            });

        } catch (err) {
            console.error("Copy setup failed:", err);
        }
    }

    function copy_scene_url(url) {
        try {
            const u = new URL(url);
            const parts = u.pathname.split("/").filter(Boolean);
            const slug = parts[parts.length - 1];

            const requestUrl = `${API_URL.replace(/\/$/, "")}/scenes/${encodeURIComponent(slug)}`;

            fetch(requestUrl, {
                method: "GET",
                headers: {
                    "accept": "application/json",
                    "Authorization": `Bearer ${API_AUTH}`
            }
            })
                .then(response => {
                console.log("API status:", response.status);
                console.log("API headers:", [...response.headers.entries()]);
                return response.text().then(text => {
                    console.log("API raw response:", text);
                    if (!response.ok) {
                        throw new Error(`API request failed: ${response.status}`);
                    }
                    return JSON.parse(text);
                });
            })
                .then(json => {
                const scene_url = json?.data?.url;
                if (!scene_url) {
                    throw new Error("Response missing data.url");
                }
                return navigator.clipboard.writeText(scene_url).then(() => scene_url);
            })
                .then(scene_url => {
                console.log("Copied scene URL:", scene_url);
                showToast(`Copied scene URL: ${scene_url}`, 5000);
            })

                .catch(err => {
                console.error("Copy scene URL failed:", err);
                alert("Failed to copy scene URL — check console");
            });

        } catch (err) {
            console.error("Copy setup failed:", err);
        }
    }

    function open_scene_url(url) {
        try {
            const u = new URL(url);
            const parts = u.pathname.split("/").filter(Boolean);
            const slug = parts[parts.length - 1];

            const requestUrl = `${API_URL.replace(/\/$/, "")}/scenes/${encodeURIComponent(slug)}`;

            fetch(requestUrl, {
                method: "GET",
                headers: {
                    "accept": "application/json",
                    "Authorization": `Bearer ${API_AUTH}`
            }
            })
                .then(response => {
                console.log("API status:", response.status);
                console.log("API headers:", [...response.headers.entries()]);
                return response.text().then(text => {
                    console.log("API raw response:", text);
                    if (!response.ok) {
                        throw new Error(`API request failed: ${response.status}`);
                    }
                    return JSON.parse(text);
                });
            })
                .then(json => {
                const sceneUrl = json?.data?.url;
                if (!sceneUrl) {
                    throw new Error("Response missing data.url");
                }

                // Open in true background tab (userscript only)
                if (typeof GM_openInTab === "function") {
                    GM_openInTab(sceneUrl, { active: false, insert: true });
                } else {
                    // fallback
                    window.open(sceneUrl, "_blank", "noopener,noreferrer");
                }

                console.log("Opened scene URL:", sceneUrl);
                showToast(`Opened scene URL`, 5000);
            })
                .catch(err => {
                console.error("Open scene URL failed:", err);
                alert("Failed to open scene URL — check console");
            });

        } catch (err) {
            console.error("Setup failed:", err);
        }
    }
    function showPerformers(url) {
        try {
            const u = new URL(url);
            const parts = u.pathname.split("/").filter(Boolean);
            const slug = parts[parts.length - 1];

            const requestUrl = `${API_URL.replace(/\/$/, "")}/scenes/${encodeURIComponent(slug)}`;

            fetch(requestUrl, {
                method: "GET",
                headers: {
                    "accept": "application/json",
                    "Authorization": `Bearer ${API_AUTH}`
				}
            })
                .then(response => {
                console.log("API status:", response.status);
                console.log("API headers:", [...response.headers.entries()]);
                return response.text().then(text => {
                    console.log("API raw response:", text);
                    if (!response.ok) {
                        throw new Error(`API request failed: ${response.status}`);
                    }
                    return JSON.parse(text);
                });
            })
                .then(json => {
                const performers = json?.data?.performers;
                if (!Array.isArray(performers) || performers.length === 0) {
                    throw new Error("No performers found in response");
                }

                const formatted = performers.map((p, index) => {
                    const parentName = p?.parent?.name || "Unknown";
                    const sceneName = p?.name || "Unknown";

                    const rawGender = p?.parent?.extras?.gender;

                    let gender;
                    if (rawGender === "Female") {
                        gender = "F";
                    } else if (rawGender === "Male") {
                        gender = "M";
                    } else {
                        gender = "N/A";
                    }

                    // check if names match (strict or normalized)
                    const namesMatch = parentName === sceneName;

                    const displayName = namesMatch
                    ? sceneName
                    : `${sceneName} (${parentName})`;

                    return `${index + 1}. [${gender}] ${displayName}`;
                });

                return formatted;
            })
                .then(list => {
                console.log("Performers:");
                list.forEach(p => console.log(p));
                showToast(`Performers:\n${list.join("\n")}`, 5000);
            })
                .catch(err => {
                console.error("Fetch performers failed:", err);
                alert("Failed to get performers — check console");
            });

        } catch (err) {
            console.error("Setup failed:", err);
        }
    }
    function generate_filename(url) {
        try {
            const u = new URL(url);
            const parts = u.pathname.split("/").filter(Boolean);
            const slug = parts[parts.length - 1];

            const requestUrl = `${API_URL.replace(/\/$/, "")}/scenes/${encodeURIComponent(slug)}`;

            fetch(requestUrl, {
                method: "GET",
                headers: {
                    "accept": "application/json",
                    "Authorization": `Bearer ${API_AUTH}`
            }
            })
                .then(response => {
                return response.json();
            })
                .then(json => {
                const data = json?.data;
                if (!data) throw new Error("Invalid API response");

                // --------------------------
                // STUDIO NAME
                // --------------------------
                let studio = data?.site?.name || "Unknown";

                // remove apostrophes and non-alphanumeric except spaces
                studio = studio.replace(/['’._!()]/g, "");
                studio = studio.replace(/\s+/g, ""); // remove spaces entirely

                // --------------------------
                // DATE → YY.MM.DD
                // --------------------------
                let date = data?.date;
                if (!date) throw new Error("Missing date");

                const [year, month, day] = date.split("-");
                const shortYear = year.slice(2);
                const formattedDate = `${shortYear}.${month}.${day}`;

                // --------------------------
                // FEMALE PERFORMERS ONLY
                // --------------------------
                const performers = Array.isArray(data?.performers) ? data.performers : [];

                const femalePerformers = performers.filter(p => {
                    const gender = p?.parent?.extras?.gender;
                    return gender === "Female";
                });

                if (femalePerformers.length === 0) {
                    throw new Error("No female performers found");
                }

                const formattedPerformers = femalePerformers.map(p => {
                    let name = p?.parent?.name || "Unknown";

                    // normalize: remove special chars except spaces/numbers
                    name = name.replace(/[^a-zA-Z0-9\s]/g, "");
                    name = name.trim().replace(/\s+/g, ".");

                    return name;
                });

                // join with ".and."
                const performersString = formattedPerformers.join(".and.");

                // --------------------------
                // FINAL FILENAME
                // --------------------------
                const filename = [
                    studio,
                    formattedDate,
                    performersString
                ].join(".");

                return navigator.clipboard.writeText(filename).then(() => filename);

            })
                .then(filename => {
                console.log("Copied filename:", filename);
                showToast(`Copied filename: ${filename}`, 5000);
            })
                .catch(err => {
                console.error("Failed to generate filename:", err);
                alert("Failed to generate filename — check console");
            });

        } catch (err) {
            console.error("Setup failed:", err);
        }
    }
    function showExternalStudioID(url) {
        try {
            const u = new URL(url);
            const parts = u.pathname.split("/").filter(Boolean);
            const slug = parts[parts.length - 1];

            const requestUrl = `${API_URL.replace(/\/$/, "")}/scenes/${encodeURIComponent(slug)}`;

            fetch(requestUrl, {
                method: "GET",
                headers: {
                    "accept": "application/json",
                    "Authorization": `Bearer ${API_AUTH}`
            }
            })
                .then(response => {
                console.log("API status:", response.status);
                console.log("API headers:", [...response.headers.entries()]);
                return response.text().then(text => {
                    console.log("API raw response:", text);
                    if (!response.ok) {
                        throw new Error(`API request failed: ${response.status}`);
                    }
                    return JSON.parse(text);
                });
            })
                .then(json => {
                const e_id = json?.data?.external_id;
                if (!e_id) {
                    throw new Error("Response missing data.external_id");
                }
                return e_id;
            })
                .then(e_id => {
                console.log("Scene External ID:", e_id);
                showToast(`Scene External ID: ${e_id}`, 5000);
            })

                .catch(err => {
                console.error("Fetch scene External ID failed:", err);
                alert("Failed to get scene External ID — check console");
            });

        } catch (err) {
            console.error("Setup failed:", err);
        }
    }
    /* ---------- Toolbar ---------- */
    async function initToolbar() {
        if (document.getElementById("tpdb-toolbar")) return;
        const grid = document.querySelector("div.grid.grid-cols-scene-card");
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

            document.body.classList.toggle("tpdb-hide-images", imagesHidden);

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
                // ENTER TABLE MODE
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
                initThumbnailPreview(tableWrapper);
                tableLoading = false;

            } else {
                // RETURN TO GRID MODE
                tableBtn.textContent = "Table View";
                tableBtn.style.background = "#5cb85c";

                if (tableWrapper) tableWrapper.style.display = "none";
                grid.style.display = "";
            }
        });

        toolbar.append(hideBtn, tableBtn);
        grid.parentNode.insertBefore(toolbar, grid);

        // Hook into table mode toggle
        const originalTableClick = tableBtn.onclick;
        tableBtn.onclick = (e) => {
            tableBtn.dispatchEvent(new Event("click-original"));
        };
        tableBtn.addEventListener("click-original", async () => {
            // run previous logic
            originalTableClick?.();
        });

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
        document.querySelectorAll('div.grid.grid-cols-scene-card img[style*="object-fit"]').forEach(img => {
            if (img.style.objectFit === "cover") {
                img.style.objectFit = "contain";
                img.style.maxHeight = "200px";
                img.style.backgroundColor = "#000"; // optional: black background for aspect difference
            }
        });
    }

    // Run on page load and whenever new elements are added
    const imgObserver = new MutationObserver(fixGridImageFit);
    imgObserver.observe(document.body, { childList: true, subtree: true });

    // Initial run
    fixGridImageFit();

    async function fetchSceneAndShowSiteParents(sceneUrl) {
        try {
            const u = new URL(sceneUrl);
            const parts = u.pathname.split("/").filter(Boolean);
            const slug = parts[parts.length - 1];

            const requestUrl = `${API_URL.replace(/\/$/, "")}/scenes/${encodeURIComponent(slug)}`;

            const response = await fetch(requestUrl, {
                method: "GET",
                headers: {
                    "accept": "application/json",
                    "Authorization": `Bearer ${API_AUTH}`
            }
            });

            if (!response.ok) {
                throw new Error(`Scene API request failed: ${response.status}`);
            }

            const sceneJson = await response.json();

            await showSceneSiteParents(sceneJson);

        } catch (err) {
            console.error("Fetch scene / site parents failed:", err);
            alert("Failed to fetch scene or site parents — check console");
        }
    }

    async function collectSceneFromUrl(sceneUrl) {
        try {
            const u = new URL(sceneUrl);
            const parts = u.pathname.split("/").filter(Boolean);
            const slug = parts[parts.length - 1];

            // ---- Step 1: Fetch Scene JSON ----
            const sceneRequestUrl = `${API_URL.replace(/\/$/, "")}/scenes/${encodeURIComponent(slug)}`;

            const sceneResponse = await fetch(sceneRequestUrl, {
                method: "GET",
                headers: {
                    "accept": "application/json",
                    "Authorization": `Bearer ${API_AUTH}`
            }
            });

            if (!sceneResponse.ok) {
                throw new Error(`Scene API request failed: ${sceneResponse.status}`);
            }

            const sceneJson = await sceneResponse.json();
            const sceneId = sceneJson?.data?._id;

            if (!sceneId) {
                throw new Error("Scene JSON missing data._id");
            }

            // ---- Step 2: Check Collection Status (GET) ----
            const collectionUrl = `${API_Collections_URL}?scene_id=${encodeURIComponent(sceneId)}&type=Scene`;

            const checkResponse = await fetch(collectionUrl, {
                method: "GET",
                headers: {
                    "accept": "application/json",
                    "Authorization": `Bearer ${API_AUTH}`
            }
            });

            if (!checkResponse.ok) {
                throw new Error(`Collection check failed: ${checkResponse.status}`);
            }

            const checkJson = await checkResponse.json();
            const isCollected = checkJson?.value === true;

            // ---- Step 3: Decide What To Do ----
            let shouldToggle = false;

            if (isCollected) {
                const remove = confirm("Scene is already collected.\n\nRemove from collection?");
                if (remove) {
                    shouldToggle = true;
                } else {
                    showToast("Kept in collection", 5000);
                    return; // stop here
                }
            } else {
                shouldToggle = true;
            }

            if (!shouldToggle) return;

            // ---- Step 4: Toggle Collection (POST) ----
            GM_xmlhttpRequest({
                method: "POST",
                url: collectionUrl,
                headers: {
                    "accept": "application/json",
                    "Authorization": `Bearer ${API_AUTH}`
            },
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        showToast(
                            isCollected
                            ? `${encodeURIComponent(slug)} Removed from Collection`
                        : `${encodeURIComponent(slug)} Collected Successfully`,
                            10000
                        );
                    } else {
                        console.error(`${encodeURIComponent(slug)} Collection POST failed:`, response);
                        showToast(`${encodeURIComponent(slug)} Collection failed — check console`, 5000);
                    }
                },
                onerror: function (err) {
                    console.error(`${encodeURIComponent(slug)} Collection request error:`, err);
                    showToast(`${encodeURIComponent(slug)} Collection request failed`, 5000);
                }
            });

        } catch (err) {
            console.error(`Collect scene failed:`, err);
            showToast(`Failed to collect scene — check console`, 5000);
        }
    }



    function addCopyButtonsToGrid() {
        document.querySelectorAll('div.relative.group').forEach(card => {
            if (card.__copyBtnAdded) return;
            card.__copyBtnAdded = true;

            const titleLink = card.querySelector('h2 a');
            if (!titleLink) return;

            // container so buttons can stack vertically
            const btnContainer = document.createElement("div");
            btnContainer.style.display = "flex-end";
            btnContainer.style.flexDirection = "column";
            btnContainer.style.marginLeft = "6px";
            btnContainer.style.gap = "5px"; // adds 4px space between each button

            // ---- Button 1: Copy Scene URL ----
            const copy_scene_url_button = document.createElement("div");
            copy_scene_url_button.className = "tpdb-copy-btn";
            copy_scene_url_button.title = "Copy Scene URL";
            copy_scene_url_button.textContent = "🌐";

            copy_scene_url_button.addEventListener("click", e => {
                e.stopPropagation();
                e.preventDefault();
                copy_scene_url(titleLink.href);
            });

            // ---- Button 2: Copy slug / scene ID ----
            const copyBtn = document.createElement("div");
            copyBtn.className = "tpdb-copy-btn";
            copyBtn.title = "Copy UUID";
            copyBtn.textContent = "⧉";

            copyBtn.addEventListener("click", e => {
                e.stopPropagation();
                e.preventDefault();
                copySlugFromUrl(titleLink.href);
            });
            // ---- Button 3: Open Scene URL ----
            const open_url_btn = document.createElement("div");
            open_url_btn.className = "tpdb-copy-btn";
            open_url_btn.title = "Open Scene URL";
            open_url_btn.textContent = "🔗";

            open_url_btn.addEventListener("click", e => {
                e.stopPropagation();
                e.preventDefault();
                open_scene_url(titleLink.href);
            });

            // ---- Button 4: show External ID ----
            const e_id_Btn = document.createElement("div");
            e_id_Btn.className = "tpdb-copy-btn";
            e_id_Btn.title = "E_ID";
            e_id_Btn.textContent = "🆔";

            e_id_Btn.addEventListener("click", e => {
                e.stopPropagation();
                e.preventDefault();
                showExternalStudioID(titleLink.href);
            });

            // ---- Button 5: show Performers ----
            const performers = document.createElement("div");
            performers.className = "tpdb-copy-btn";
            performers.title = "E_ID";
            performers.textContent = "👥";

            performers.addEventListener("click", e => {
                e.stopPropagation();
                e.preventDefault();
                showPerformers(titleLink.href);
            });


            // ---- Button 6: API JSON action ----
            const jsonBtn = document.createElement("div");
            jsonBtn.className = "tpdb-copy-btn";
            jsonBtn.title = "Check Site Parents";
            jsonBtn.textContent = "🌳";

            jsonBtn.addEventListener("click", e => {
                e.stopPropagation();
                e.preventDefault();
                fetchSceneAndShowSiteParents(titleLink.href);
            });

            // ---- Button 7: Collect ----
            const collectBtn = document.createElement("div");
            collectBtn.className = "tpdb-copy-btn";
            collectBtn.title = "Collect Scene";
            collectBtn.textContent = "★";

            collectBtn.addEventListener("click", e => {
                e.stopPropagation();
                e.preventDefault();
                collectSceneFromUrl(titleLink.href);
            });

            // ---- Button 8: show Performers ----
            const copy_filename = document.createElement("div");
            copy_filename.className = "tpdb-copy-btn";
            copy_filename.title = "Filename";
            copy_filename.textContent = "🗎";

            copy_filename.addEventListener("click", e => {
                e.stopPropagation();
                e.preventDefault();
                generate_filename(titleLink.href);
            });

            btnContainer.appendChild(copyBtn);
            btnContainer.appendChild(copy_scene_url_button);
            btnContainer.appendChild(e_id_Btn);
            btnContainer.appendChild(performers);
            btnContainer.appendChild(jsonBtn);
            btnContainer.appendChild(open_url_btn);
            btnContainer.appendChild(collectBtn);
            btnContainer.appendChild(copy_filename);

            // ensure inline layout
            titleLink.parentElement.style.display = "inline-flex";
            titleLink.parentElement.style.alignItems = "center";

            titleLink.after(btnContainer);
        });
    }

    /* ---------- Grid View: object-fit contain + no link + hover preview (large image fix) ---------- */
    function enhanceGridImages() {
        // 1. Fix image object-fit & unwrap link
        document.querySelectorAll('div.grid.grid-cols-scene-card img[style*="object-fit"]').forEach(img => {
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

            addCopyButtonsToGrid();
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
            previewImg.style.maxWidth = '900px';
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
                document.querySelectorAll('div.grid.grid-cols-scene-card img').forEach(img => {
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
    const gridObserver = new MutationObserver(() => {
        enhanceGridImages();
        formatGridDates();
    });
    gridObserver.observe(document.body, { childList: true, subtree: true });

    // Initial run
    enhanceGridImages();
    addCopyButtonsToGrid();
    formatGridDates(); // <-- add this

})();
