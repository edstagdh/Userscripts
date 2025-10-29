// ==UserScript==
// @name         Save All Watched Threads to Text File (Debug Toggle)
// @namespace    http://tampermonkey.net/
// @version      2025-10-29
// @description  Collect all bookmarked threads (watched threads) and save them to a JSON file including pagination. Includes toggleable debug logging and thumbnail cleanup.
// @author       edstagdh
// @match        https://simpcity.cr/watched/threads*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simpcity.cr
// @grant        GM_download
// ==/UserScript==


(function () {
    'use strict';

    const BUTTON_ID = 'exportRequestsThreadsJsonBtn';
    const baseUrl = window.location.origin;
    const DEBUG = true; // toggle logs
    const DEBUG_PREFIX = '[RequestsExport]';
    const DEFAULT_THUMBNAIL = 'https://simpcity.cr/data/assets/defaultThumbnailImage/no_image.jpg';

    function log(level, ...args) {
        if (!DEBUG) return;
        const prefixStyle = 'color:#00cccc;font-weight:bold';
        switch (level) {
            case 'info': console.log(`%c${DEBUG_PREFIX}`, prefixStyle, ...args); break;
            case 'warn': console.warn(`%c${DEBUG_PREFIX}`, prefixStyle, ...args); break;
            case 'error': console.error(`%c${DEBUG_PREFIX}`, prefixStyle, ...args); break;
            case 'debug': console.debug(`%c${DEBUG_PREFIX}`, prefixStyle, ...args); break;
            default: console.log(`%c${DEBUG_PREFIX}`, prefixStyle, ...args);
        }
    }

    function waitAndInsertButton() {
        const container = document.querySelector('.p-title');
        if (container) {
            insertButton(container);
            return;
        }
        const mo = new MutationObserver(() => {
            const c = document.querySelector('.p-title');
            if (c) {
                mo.disconnect();
                insertButton(c);
            }
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }

    function insertButton(container) {
        if (document.getElementById(BUTTON_ID)) return;
        const btn = document.createElement('button');
        btn.id = BUTTON_ID;
        btn.textContent = '📥 Export Requests (JSON)';
        Object.assign(btn.style, {
            marginLeft: '12px',
            padding: '6px 10px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            background: '#007a7a',
            color: '#fff',
            verticalAlign: 'middle'
        });
        btn.addEventListener('click', onExportClicked);
        container.appendChild(btn);
        log('info', 'Export button inserted.');
    }

    async function onExportClicked(e) {
        const btn = e.currentTarget;
        btn.disabled = true;
        const oldText = btn.textContent;
        btn.textContent = 'Exporting…';
        log('info', 'Starting export process.');

        try {
            // Determine start URL: prefer ?no_date_limit=1 param to enumerate all pages
            let startUrl;
            const cur = new URL(window.location.href);
            if (cur.pathname.startsWith('/watched/threads') && cur.searchParams.get('no_date_limit') === '1') {
                startUrl = cur.href;
            } else {
                startUrl = new URL('/watched/threads?no_date_limit=1', baseUrl).href;
            }
            log('info', 'Using start URL:', startUrl);

            const result = await collectAllPages(startUrl);
            const threads = result.threads;
            const lastPageCount = result.pages;
            const threadCount = Object.keys(threads).length;


            if (!threadCount) {
                log('warn', 'No threads found.');
                alert('No threads found to export.');
            } else {
                // Extract forum name from the path
                const pathParts = window.location.pathname.split('/').filter(Boolean);
                const forumName = 'watched_threads';

                const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
                const filename = `${forumName}_${dateStr}.json`;

                const summary = {
                    URL: baseUrl + '/watched/threads/',
                    threads: threadCount,
                    pages: lastPageCount
                };

                const output = {
                    Summary: summary,
                    Threads: threads
                };

                const json = JSON.stringify(output, null, 2);
                saveJSON(filename, json);

                log('info', `✅ Exported ${threadCount} threads to ${filename}`);
            }

        } catch (err) {
            log('error', 'Unhandled export error:', err);
            alert('Error during export (see console).');
        } finally {
            btn.disabled = false;
            btn.textContent = oldText;
            log('info', 'Export process finished.');
        }
    }

    async function collectAllPages(startUrl) {
        let lastPageCount = 0;
        const visited = new Set();
        const collected = {};
        let pageCount = 0;

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        function randomBetween(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        async function collectPage(rawUrl) {
            const urlObj = new URL(rawUrl, baseUrl);

            // ✅ Ensure we ONLY scrape the target forum path
            // New (watched threads):
            if (!urlObj.pathname.startsWith('/watched/threads')) {
                log('warn', 'Skipping URL outside watched threads:', urlObj.href);
                return;
            }

            const url = urlObj.href;
            if (visited.has(url)) {
                log('debug', 'Skipping already visited page:', url);
                return;
            }

            visited.add(url);
            pageCount++;
            lastPageCount = pageCount;
            log('info', `Fetching page ${pageCount}:`, url);

            await sleep(randomBetween(200, 600));

            let res;
            try {
                res = await fetch(url, { credentials: 'include' });
            } catch (err) {
                log('error', 'Network fetch failed:', err);
                return;
            }

            if (!res.ok) {
                log('warn', 'HTTP request failed:', res.status, url);
                return;
            }

            const html = await res.text().catch(() => null);
            if (!html) return;

            const doc = new DOMParser().parseFromString(html, 'text/html');
            const items = doc.querySelectorAll(
                '.structItemContainer .structItem.structItem--thread'
            );
            log('debug', `Found ${items.length} thread rows on page.`);

            for (const item of items) {
                try {
                    const thread = parseThreadItem(item);
                    if (!thread || !thread.url || !thread.id) {
                        log('warn', 'Skipped thread (missing metadata):', thread?.title);
                        continue;
                    }

                    // ✅ Accept thread URL if it is /threads/...<id> optionally followed by anything (unread/latest/page-N)
                    const threadUrlObj = new URL(thread.url, baseUrl);
                    if (!/^\/threads\/.+\.\d+(\/|$)/.test(threadUrlObj.pathname)) {
                        log('warn', 'Skipping non-thread path:', thread.url);
                        continue;
                    }

                    // ✅ Store by numeric id
                    collected[thread.id] = thread;

                } catch (err) {
                    log('error', 'Error parsing thread item:', err);
                }
            }

            // ✅ Polite scraping system
            if (pageCount % 3 === 0) {
                const smallPause = randomBetween(1500, 3000);
                log('info', `Polite pause ${smallPause}ms (every 3 pages)`);
                await sleep(smallPause);
            }
            if (pageCount % 10 === 0) {
                const longPause = randomBetween(5000, 8000);
                log('info', `Long pause ${longPause}ms (every 10 pages)`);
                await sleep(longPause);
            }

            // ✅ Improved pagination detection — handles multiple XF themes
            let nextEl = doc.querySelector(
                'a.pageNav-jump--next,' +
                'a.pageNavSimple-el--next,' +
                'a[rel="next"]'
            );

            if (nextEl) {
                const nextHref = nextEl.getAttribute('href');
                if (nextHref) {
                    const nextUrlObj = new URL(nextHref, baseUrl);

                    // ✅ Preserve no_date_limit if used
                    if (new URL(startUrl).searchParams.get('no_date_limit') === '1') {
                        nextUrlObj.searchParams.set('no_date_limit', '1');
                    }

                    const nextUrl = nextUrlObj.href;
                    log('debug', 'Next page:', nextUrl);

                    await sleep(randomBetween(100, 300));
                    await collectPage(nextUrl);
                    return;
                }
            }

            log('debug', '✅ Pagination finished.');
        }


        await collectPage(startUrl);
        log('info', 'Collected all pages. Total threads:', Object.keys(collected).length);
        return {
            pages: lastPageCount,
            threads: collected
        };
    }

    function parseThreadItem(item) {
        const titleEl = item.querySelector('.structItem-title a:not(.labelLink)');
        const title = titleEl?.textContent.trim() || null;
        const href = titleEl?.getAttribute('href') || '';
        const url = href ? new URL(href, baseUrl).href : null;

        let id = null;
        if (href) {
            const p = new URL(href, baseUrl).pathname;
            const m = p.match(/\.([0-9]+)(?=\/|$)/);
            id = m ? m[1] : null;
        }

        const tagEls = item.querySelectorAll('.structItem-title span.label');
        const tags = Array.from(tagEls).map(t => t.textContent.trim()).filter(Boolean);

        const author = item.getAttribute('data-author') ||
              item.querySelector('.structItem-parts a.username')?.textContent.trim() || null;

        const startTimeEl = item.querySelector('.structItem-startDate time');
        const start_date_iso = startTimeEl?.getAttribute('datetime') || null;
        const start_date_display = startTimeEl?.getAttribute('title') || startTimeEl?.textContent.trim() || null;

        let replies = null;
        let views = null;
        const statEls = item.querySelectorAll('dl.pairs');
        for (const dl of statEls) {
            const dt = dl.querySelector('dt');
            const dd = dl.querySelector('dd');
            if (!dt || !dd) continue;
            const key = dt.textContent.toLowerCase();
            if (key.includes('repl')) replies = dd.textContent.trim();
            if (key.includes('view')) views = dd.textContent.trim();
        }


        const lastUserEl = item.querySelector('.structItem-cell--latest .username');
        const last_comment_by = lastUserEl?.textContent.trim() || null;
        const lastTimeEl = item.querySelector('.structItem-cell--latest time.structItem-latestDate');

        const last_comment_time_iso = lastTimeEl?.getAttribute('datetime') || null;
        const last_comment_time_display = lastTimeEl?.getAttribute('title') || lastTimeEl?.textContent.trim() || null;

        const latestLink = item.querySelector('.structItem-cell--latest a[href*="/threads/"]');
        const latest_url = latestLink ? new URL(latestLink.getAttribute('href'), baseUrl).href : null;

        return {
            id,
            title,
            url,
            tags,
            author,
            start_date_iso,
            start_date_display,
            replies,
            views,
            last_comment_by,
            last_comment_time_iso,
            last_comment_time_display,
            latest_url
        };
    }


    function saveJSON(filename, text) {
        try {
            const blob = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            if (typeof GM_download === 'function') {
                GM_download({ url, name: filename, saveAs: true });
            } else {
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
            }
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            log('info', 'File saved:', filename);
        } catch (err) {
            log('error', 'Failed to save JSON file:', err);
        }
    }

    waitAndInsertButton();
    log('info', 'Script initialized and waiting for button insertion.');
})();
