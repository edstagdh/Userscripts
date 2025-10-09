// ==UserScript==
// @name         Save All Watched Threads to Text File (Debug Toggle)
// @namespace    http://tampermonkey.net/
// @version      2025-10-09
// @description  Collect all bookmarked threads (watched threads) and save them to a JSON file including pagination. Includes toggleable debug logging and thumbnail cleanup.
// @author       edstagdh
// @match        https://simpcity.cr/watched/threads*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simpcity.cr
// @grant        GM_download
// ==/UserScript==

(function () {
  'use strict';

  const BUTTON_ID = 'exportWatchedThreadsJsonBtn';
  const baseUrl = window.location.origin;
  const DEBUG = true; // ⬅️ Toggle this to false to silence all logs
  const DEBUG_PREFIX = '[WatchedThreadsExport]';
  const DEFAULT_THUMBNAIL = 'https://simpcity.cr/data/assets/defaultThumbnailImage/no_image.jpg';

  /**
   * Unified console logger with prefix and level
   */
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
    btn.textContent = '📥 Export Watched Threads (JSON)';
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
      const threads = await collectAllPages(window.location.href);
      const threadCount = Object.keys(threads).length;

      if (!threadCount) {
        log('warn', 'No threads found.');
        alert('No threads found to export.');
      } else {
        const filename = `watched_threads_${new Date().toISOString().slice(0, 10)}.json`;
        const json = JSON.stringify(threads, null, 2);
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
    const visited = new Set();
    const collected = {};

    async function collectPage(rawUrl) {
      const url = new URL(rawUrl, baseUrl).href;
      if (visited.has(url)) {
        log('debug', 'Skipping already visited page:', url);
        return;
      }

      visited.add(url);
      log('info', 'Fetching page:', url);

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

      let html;
      try {
        html = await res.text();
      } catch (err) {
        log('error', 'Failed to parse HTML:', err);
        return;
      }

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const items = doc.querySelectorAll('.structItem.structItem--thread');
      log('debug', `Found ${items.length} threads on page.`);

      for (const item of items) {
        try {
          const thread = parseThreadItem(item);
          if (thread.id) {
            collected[thread.id] = thread;
          } else {
            log('warn', 'Skipped thread with missing ID:', thread.title);
          }
        } catch (err) {
          log('error', 'Error parsing thread item:', err);
        }
      }

      const next = doc.querySelector('a.pageNav-jump--next, a.pageNavSimple-el--next');
      if (next && next.getAttribute('href')) {
        const nextUrl = new URL(next.getAttribute('href'), baseUrl).href;
        log('debug', 'Next page:', nextUrl);
        await new Promise(r => setTimeout(r, 150));
        await collectPage(nextUrl);
      } else {
        log('debug', 'Pagination complete.');
      }
    }

    await collectPage(startUrl);
    log('info', 'Collected all pages. Total threads:', Object.keys(collected).length);
    return collected;
  }

  function parseThreadItem(item) {
    const titleEl = item.querySelector('.structItem-title a[data-tp-primary="on"], .structItem-title a');
    const title = titleEl?.textContent.trim() || null;
    const href = titleEl?.getAttribute('href') || '';
    const url = href ? new URL(href, baseUrl).href : null;
    const idMatches = href.match(/\d+/g);
    const id = idMatches ? idMatches[idMatches.length - 1] : null;

    if (!id) log('warn', 'Thread missing valid ID:', title);

    const tagEls = item.querySelectorAll('.structItem-title .label');
    const tags = Array.from(tagEls).map(t => t.textContent.trim()).filter(Boolean);

    // 🔹 Handle thumbnail extraction and placeholder removal
    let thumbnail = null;
    const img = item.querySelector('.structItem-cell--icon img');
    if (img) {
      const style = img.getAttribute('style') || '';
      const bg = style.match(/url\(["']?(.*?)["']?\)/);
      thumbnail = bg?.[1] || img.getAttribute('src') || null;
      if (thumbnail && !/^https?:\/\//.test(thumbnail)) {
        try { thumbnail = new URL(thumbnail, baseUrl).href; } catch (e) { }
      }
      // Remove default placeholder
      if (thumbnail && thumbnail === DEFAULT_THUMBNAIL) {
        log('debug', 'Removed default thumbnail for:', title);
        thumbnail = '';
      }
    }

    const author = item.getAttribute('data-author') ||
      item.querySelector('.structItem-parts a[href*="/members/"]')?.textContent.trim() || null;

    const startTimeEl = item.querySelector('.structItem-startDate time');
    const start_date_iso = startTimeEl?.getAttribute('datetime') || null;
    const start_date_display = startTimeEl?.getAttribute('title') || startTimeEl?.textContent.trim() || null;


    const pageLinks = item.querySelectorAll('.structItem-pageJump a');
    const pages = pageLinks.length
      ? parseInt(pageLinks[pageLinks.length - 1].textContent.trim()) || 1
      : 1;

    let replies = null, views = null;
    const dls = item.querySelectorAll('dl.pairs');
    dls.forEach(dl => {
      const dt = dl.querySelector('dt');
      const dd = dl.querySelector('dd');
      if (!dt || !dd) return;
      const key = dt.textContent.toLowerCase();
      if (key.includes('repl')) replies = dd.textContent.trim();
      if (key.includes('view')) views = dd.textContent.trim();
    });

    const lastCommentBy = item.querySelector('.structItem-cell--latest .username')?.textContent.trim() || null;
    const lastTimeEl = item.querySelector('.structItem-cell--latest time');
    const last_comment_time_iso = lastTimeEl?.getAttribute('datetime') || null;
    const last_comment_time_display = lastTimeEl?.getAttribute('title') || lastTimeEl?.textContent.trim() || null;

    const latestLink = item.querySelector('.structItem-cell--latest a[href*="/threads/"]')?.getAttribute('href');
    const latest_url = latestLink ? new URL(latestLink, baseUrl).href : null;

    return {
      id,
      title,
      url,
      tags,
      thumbnail,
      author,
      start_date_iso,
      start_date_display,
      pages,
      replies,
      views,
      last_comment_by: lastCommentBy,
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
