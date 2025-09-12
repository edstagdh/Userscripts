// ==UserScript==
// @name         Export Search Results — Full Performers (iframe + JSON fallback, concurrency=2)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Export search results with full performer lists by loading scene pages (or JSON) and waiting for dynamic data. Concurrency limited to 2.
// @author       edstagdh
// @match        https://theporndb.net/*
// @icon         https://theporndb.net/favicon-16x16.png
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    // Config
    const JSON_FETCH_TIMEOUT_MS = 7000; // try fetch(sceneUrl) with Accept: application/json first
    const IFRAME_WAIT_TIMEOUT_MS = 15000; // how long to wait for dynamic DOM inside iframe
    const CONCURRENCY = 2;

    // Helpers
    function safeText(el) {
        return el ? String(el.textContent || "").trim() : "";
    }

    function sleep(ms) {
        return new Promise((res) => setTimeout(res, ms));
    }

    async function fetchWithTimeout(url, opts = {}, timeout = 7000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const res = await fetch(url, { ...opts, signal: controller.signal });
            clearTimeout(id);
            return res;
        } catch (e) {
            clearTimeout(id);
            throw e;
        }
    }

    // Try to fetch a JSON response for the scene (many SPA servers return JSON when Accept: application/json)
    async function tryFetchSceneJson(sceneUrl) {
        try {
            const res = await fetchWithTimeout(sceneUrl, {
                credentials: "include",
                headers: { Accept: "application/json, text/javascript, */*" },
            }, JSON_FETCH_TIMEOUT_MS);

            if (!res.ok) return null;
            const contentType = (res.headers.get("content-type") || "").toLowerCase();
            if (!contentType.includes("application/json") && !contentType.includes("json")) {
                // Sometimes the server returns HTML even with Accept header; give up here.
                return null;
            }

            const data = await res.json();

            // Look for performers in likely places (structure may vary)
            // Many responses have props.scene.performers or props.scene or scene.performers
            let sceneObj = null;
            if (data.props && data.props.scene) sceneObj = data.props.scene;
            else if (data.scene) sceneObj = data.scene;
            else if (data.props && data.props.scene && data.props.scene.performers) sceneObj = data.props.scene;
            else sceneObj = data;

            if (!sceneObj) return null;
            const inputPerformers = sceneObj.performers || sceneObj.props?.scene?.performers || [];

            if (!Array.isArray(inputPerformers) || inputPerformers.length === 0) return [];

            const performers = inputPerformers.map((p) => {
                // performer object shape varies; try common fields
                const name = p.name || (p.parent && p.parent.name) || (p.full_name || "") || "";
                const gender = (p.gender || (p.parent && p.parent.gender) || "Unknown") || "Unknown";
                return { name: String(name).trim(), gender: String(gender).trim() || "Unknown" };
            }).filter(p => p.name);

            return performers;
        } catch (err) {
            // console.debug("JSON fetch failed for", sceneUrl, err);
            return null;
        }
    }

    // Load the scene page inside a hidden iframe and wait for the performers grid to appear, then scrape it.
    async function fetchPerformersByIframe(sceneUrl, timeoutMs = IFRAME_WAIT_TIMEOUT_MS) {
        return new Promise((resolve) => {
            const iframe = document.createElement("iframe");
            // hide off-screen but let JS run
            iframe.style.position = "fixed";
            iframe.style.left = "-9999px";
            iframe.style.top = "-9999px";
            iframe.style.width = "1px";
            iframe.style.height = "1px";
            iframe.style.border = "0";
            iframe.src = sceneUrl;

            let resolved = false;
            const cleanup = () => {
                if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
            };

            const finish = (result) => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve(result || []);
            };

            // Safety timeout in case something never appears
            const overallTimer = setTimeout(() => {
                // console.warn("iframe timeout for", sceneUrl);
                finish([]);
            }, timeoutMs + 2000);

            iframe.onload = async () => {
                try {
                    // Access iframe document (same-origin assumed)
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    if (!doc) return finish([]);

                    // Wait for performers grid to appear (mutations) or immediate presence
                    const selector = "div.grid.grid-cols-w-43";
                    const found = doc.querySelector(selector);

                    if (found && found.children.length > 0) {
                        // extract performers now
                        const performers = extractPerformersFromSceneDocument(doc);
                        clearTimeout(overallTimer);
                        return finish(performers);
                    }

                    // Otherwise observe DOM mutations until selector with children appears or timeout
                    const obs = new MutationObserver(() => {
                        try {
                            const node = doc.querySelector(selector);
                            if (node && node.children.length > 0) {
                                obs.disconnect();
                                const performers = extractPerformersFromSceneDocument(doc);
                                clearTimeout(overallTimer);
                                finish(performers);
                            }
                        } catch (e) {
                            // cross-origin or other error -> bail
                            obs.disconnect();
                            clearTimeout(overallTimer);
                            finish([]);
                        }
                    });

                    obs.observe(doc, { childList: true, subtree: true });

                    // In case the performer's grid is inserted slowly, also guard with additional timeout
                } catch (e) {
                    // cross-origin or other access issue
                    clearTimeout(overallTimer);
                    finish([]);
                }
            };

            // Append and start loading
            document.body.appendChild(iframe);
        });
    }

    // Extract performers from a fully-rendered scene document (iframe.contentDocument or current document)
    function extractPerformersFromSceneDocument(doc) {
        const out = [];
        try {
            // Find the performers container(s)
            const container = doc.querySelector("div.grid.grid-cols-w-43");
            if (!container) return out;

            // performer cards inside container
            const cards = container.querySelectorAll("div.relative.group, div.relative.group.rounded-sm, .relative.group");
            cards.forEach((card) => {
                try {
                    // Name: usually in <h2 class="text-xl ..."><a>NAME</a></h2>
                    const nameEl = card.querySelector("h2 a, h2 > a, .px-3 h2 a, .text-center h2 a");
                    const name = safeText(nameEl);

                    // Gender: there are multiple spans with title attributes (age, gender)
                    // We'll search for a span[title] whose title contains Male|Female|Other (case-insensitive)
                    let gender = "Unknown";
                    const spanTitles = Array.from(card.querySelectorAll("span[title]"));
                    for (const s of spanTitles) {
                        const t = (s.getAttribute("title") || "").trim();
                        const m = t.match(/\b(male|female|other)\b/i);
                        if (m) {
                            gender = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(); // normalize
                            break;
                        }
                    }

                    // Fallback: look for span elements with common class color hint (blue/pink) and title attribute
                    if (gender === "Unknown") {
                        const maybe = card.querySelector('span[title*="Male"], span[title*="Female"]');
                        if (maybe) {
                            gender = maybe.getAttribute("title").trim();
                        }
                    }

                    if (name) out.push({ name, gender });
                } catch (e) {
                    // ignore card-level errors
                }
            });
        } catch (e) {
            // ignore
        }
        return out;
    }

    // Concurrency worker for arbitrary items
    async function processWithConcurrency(items, workerFn, limit = CONCURRENCY) {
        const results = new Array(items.length);
        let idx = 0;

        async function worker() {
            while (true) {
                const current = idx++;
                if (current >= items.length) break;
                try {
                    results[current] = await workerFn(items[current], current);
                } catch (e) {
                    results[current] = null;
                }
            }
        }

        const workers = [];
        for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(worker());
        await Promise.all(workers);
        return results;
    }

    // UI: insert button above results grid
    function addExportButton() {
        if (document.getElementById("export-json-btn")) return;

        const btn = document.createElement("button");
        btn.id = "export-json-btn";
        btn.type = "button";
        btn.textContent = "Export to JSON";
        btn.style.cssText = "margin:10px; padding:6px 10px; background:#2f9d58; color:white; border:none; border-radius:4px; cursor:pointer;";

        // Give your button an id or a unique class so we can check it
        btn.id = "my-custom-btn";
        const interval = setInterval(() => {
            // Check if the button is already inserted
            if (document.getElementById("my-custom-btn")) {
                clearInterval(interval); // stop polling if button already exists
                return;
            }

            const resultsContainer = document.querySelector("div.grid.grid-cols-w-72");
            if (resultsContainer && resultsContainer.parentNode) {
                resultsContainer.parentNode.insertBefore(btn, resultsContainer);
                clearInterval(interval); // stop polling once inserted
            }
        }, 500); // checks every 500ms

        btn.addEventListener("click", async () => {
            try {
                btn.disabled = true;
                btn.style.opacity = "0.6";

                // collect base scene info from search page (no thumbnail)
                const cards = document.querySelectorAll("div.relative.group.rounded-sm");
                if (!cards || cards.length === 0) {
                    alert("No scenes found on this page to export.");
                    btn.disabled = false;
                    btn.style.opacity = "1";
                    return;
                }

                const sceneBasics = Array.from(cards).map((card) => {
                    const titleEl = card.querySelector("h2 a");
                    const linkEl = card.querySelector("h2 a");
                    const dateEl = card.querySelector(".absolute .flex"); // may include date + extra
                    const durationEl = card.querySelector(".absolute .flex.place-items-center");
                    const siteEl = card.querySelector(".absolute a.text-right");

                    return {
                        title: safeText(titleEl),
                        link: linkEl ? (new URL(linkEl.getAttribute("href"), location.origin)).href : "",
                        date: safeText(dateEl),
                        duration: safeText(durationEl).replace(/\s*⏰.*/, ""),
                        site: safeText(siteEl),
                        performers: [], // will populate
                    };
                });

                // Progress UI helper
                let completed = 0;
                function setProgressText(txt) {
                    btn.textContent = txt;
                }

                setProgressText(`Exporting 0 / ${sceneBasics.length} ...`);

                // Worker: try JSON first, fallback to iframe (wait for dynamic DOM)
                async function processScene(basicScene) {
                    // try JSON fetch
                    let performers = null;
                    if (basicScene.link) {
                        performers = await tryFetchSceneJson(basicScene.link);
                        // if fetch returned null => server didn't return JSON; if empty array => returned JSON but no performers
                    }

                    if (performers === null) {
                        // fallback to iframe scraping
                        performers = await fetchPerformersByIframe(basicScene.link, IFRAME_WAIT_TIMEOUT_MS).catch(() => []);
                    }

                    // attach performers to scene
                    basicScene.performers = Array.isArray(performers) ? performers : [];

                    // update progress in UI
                    completed++;
                    setProgressText(`Exporting ${completed} / ${sceneBasics.length} ...`);

                    // small pause to keep UI responsive
                    await sleep(50);
                    return basicScene;
                }

                // Process with concurrency
                const processed = await processWithConcurrency(sceneBasics, processScene, CONCURRENCY);

                // Build aggregated stats
                const siteCounts = {};
                const performerStats = {};

                processed.forEach((scene) => {
                    if (!scene) return;
                    if (scene.site) siteCounts[scene.site] = (siteCounts[scene.site] || 0) + 1;
                    (scene.performers || []).forEach((p) => {
                        const key = `${p.name} (${p.gender})`;
                        performerStats[key] = (performerStats[key] || 0) + 1;
                    });
                });

                // Sort performers alphabetically by key
                const sortedPerformers = {};
                Object.keys(performerStats)
                    .sort((a, b) => a.localeCompare(b))
                    .forEach((k) => (sortedPerformers[k] = performerStats[k]));

                const summary = {
                    total_scenes: processed.length,
                    sites: siteCounts,
                    performers: sortedPerformers,
                };

                const output = {
                    summary,
                    scenes: processed,
                };

                // Build filename from URL params
                const params = new URLSearchParams(window.location.search);
                const filenamePart =
                      params.get("site") && params.get("site_id")
                ? `&site=${params.get("site")}&site_id=${params.get("site_id")}`
            : params.get("q")
        ? `&q=${params.get("q")}`
              : "search_results";

          const page = params.get("page") || "1";
          const dateStr = new Date().toISOString().split("T")[0];
          // sanitize: replace forward slashes (rare) from filenamePart
          const sanitizedPart = filenamePart.replace(/\//g, "_");
          const filename = `${sanitizedPart}_page=${page}_${dateStr}.json`;

          // Trigger download
          const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);

          setProgressText("Export complete — downloaded");
          await sleep(1400);
      } catch (err) {
          console.error("Export failed:", err);
          alert("Export failed — check console for details.");
      } finally {
          btn.disabled = false;
          btn.style.opacity = "1";
          btn.textContent = "Export to JSON";
      }
    });
  }

    // Observe the page and add the button when results are present / updated
    const observer = new MutationObserver(() => addExportButton());
    observer.observe(document.body, { childList: true, subtree: true });

    // Also try adding immediately on script run
    addExportButton();
})();
