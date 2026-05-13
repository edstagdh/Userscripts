// ==UserScript==
// @name         [EMP][HF] Auto Thank Uploader
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Automatically clicks "Thank the uploader!" when a torrent download link is triggered
// @author       edstagdh
// @include     /https?://www\.empornium\.(is|sx)/torrents\.php.*/
// @include     /https?://www\.empornium\.(is|sx)/user\.php.*/
// @include     /https?://www\.empornium\.(is|sx)/top10\.php.*/
// @include     /https?://www\.empornium\.(is|sx)/collage*/
// @include     /https?://www\.empornium\.(is|sx)/requests*/
// @exclude     /https?://www\.empornium\.(is|sx)/requests\.php\?id.*/
// @include     /https?://www\.empornium\.(is|sx)/userhistory\.php.*/
// @include     /https?://emparadise\.(rs|sx)/torrents\.php.*/
// @include     /https?://emparadise\.(rs|sx)/user\.php.*/
// @include     /https?://emparadise\.(rs|sx)/top10\.php.*/
// @include     /https?://emparadise\.(rs|sx)/collage*/
// @include     /https?://emparadise\.(rs|sx)/requests*/
// @exclude     /https?://emparadise\.(rs|sx)/requests\.php\?id.*/
// @include     /https?://emparadise\.(rs|sx)/userhistory\.php.*/
// @include     /https?://www\.happyfappy\.(org|net)/torrents\.php.*/
// @include     /https?://www\.happyfappy\.(org|net)/user\.php.*/
// @include     /https?://www\.happyfappy\.(org|net)/top10\.php.*/
// @include     /https?://www\.happyfappy\.(org|net)/collage*/
// @include     /https?://www\.happyfappy\.(org|net)/requests*/
// @exclude     /https?://www\.happyfappy\.(org|net)/requests\.php\?id.*/
// @include     /https?://www\.happyfappy\.(org|net)/userhistory\.php.*/
// @match       https://www.happyfappy.net/torrents.php?action=download*
// @match       https://emparadise.rs/torrents.php?action=download*
// @match       https://www.empornium.rs/torrents.php?action=download*
// @icon        https://www.google.com/s2/favicons?sz=64&domain=www.happyfappy.net
// @icon        https://www.google.com/s2/favicons?sz=64&domain=www.empornium.rs
// @icon        https://www.google.com/s2/favicons?sz=64&domain=emparadise.rs
// @installURL  https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/auto_thank_uploader.user.js
// @updateURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/auto_thank_uploader.user.js
// @grant        GM_xmlhttpRequest
// ==/UserScript==

// CHANGELOG
// v1.1:
// -added toast notifications
// v1.0:
// -added Auto Thank Uploader

(function () {
    'use strict';

    // =========================================================================
    // DOMAIN CONFIGS
    // Each entry defines how to extract form fields and build the POST for that
    // specific site. Add new domains here as needed.
    //
    // extractFormData(doc) : parse the fetched page, return { actionVal, groupId, auth }
    //                        return null if form is absent (already thanked / N/A)
    // buildPostBody(fields): turn those fields into a URL-encoded POST body string
    // postPath             : the path to POST to (relative to domain root)
    // =========================================================================

    // ── Shared helpers (reused across domains with the same HTML structure) ──

    function extractStandardThankForm(doc) {
        const form = doc.getElementById('thanksform');
        if (!form) return null;

        const actionVal = form.querySelector('input[name="action"]')?.value;
        const groupId   = form.querySelector('input[name="groupid"]')?.value;
        const auth      = form.querySelector('input[name="auth"]')?.value;

        if (!actionVal || !groupId || !auth) {
            console.warn('[AutoThank] Found form but missing fields:', { actionVal, groupId, auth });
            return null;
        }
        return { actionVal, groupId, auth };
    }

    function buildStandardPostBody({ actionVal, groupId, auth }) {
        return [
            `action=${encodeURIComponent(actionVal)}`,
            `groupid=${encodeURIComponent(groupId)}`,
            `auth=${encodeURIComponent(auth)}`,
        ].join('&');
    }

    // ── Domain config map ────────────────────────────────────────────────────

    const DOMAIN_CONFIGS = {

        // Domain A
        'www.happyfappy.net': {
            torrentPageParam: 'id',              // torrents.php?id=XXXXX
            postPath:         '/torrents.php',
            extractFormData:  extractStandardThankForm,
            buildPostBody:    buildStandardPostBody,
        },

        // Domain B
        'emparadise.rs': {
            torrentPageParam: 'torrentid',       // torrents.php?torrentid=XXXXX
            postPath:         '/torrents.php',
            extractFormData:  extractStandardThankForm,
            buildPostBody:    buildStandardPostBody,
        },

        // Domain C (same backend as B)
        'www.empornium.rs': {
            torrentPageParam: 'torrentid',       // torrents.php?torrentid=XXXXX
            postPath:         '/torrents.php',
            extractFormData:  extractStandardThankForm,
            buildPostBody:    buildStandardPostBody,
        },

    };


    // =========================================================================
    // CLICK LISTENER
    // =========================================================================

    document.addEventListener('click', function (e) {

        const anchor = e.target.closest('a[href]');
        if (!anchor) return;

        let clickedURL;
        try {
            clickedURL = new URL(anchor.href);
        } catch (_) {
            return;
        }

        // Only act on known domains
        const config = DOMAIN_CONFIGS[clickedURL.host];
        if (!config) return;

        const params = clickedURL.searchParams;

        if (!clickedURL.pathname.endsWith('torrents.php')) return;
        if (params.get('action') !== 'download') return;

        const torrentId = params.get('id');
        if (!torrentId) return;

        const domain        = `${clickedURL.protocol}//${clickedURL.host}`;
        const torrentPageURL = `${domain}/torrents.php?${config.torrentPageParam}=${torrentId}`;

        console.log(`[AutoThank] Click on ${clickedURL.host} — torrent ID: ${torrentId}`);

        autoThank(torrentPageURL, domain, config);

    }, true);

    // =========================================================================
    // TOAST NOTIFICATION
    // =========================================================================

    function showToast(message, duration = 5000) {
        const toast = document.createElement('div');
        toast.className = 'autothank-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #1a1a1a;
            color: #ffa500;
            padding: 16px 20px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 700;
            line-height: 1.4;
            min-width: 280px;
            max-width: 500px;
            border: 2px solid #ffa500;
            box-shadow: 0 6px 18px rgba(255,165,0,0.35);
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.25s ease, transform 0.25s ease;
            transform: translateY(10px);
            white-space: pre-line;
        `;

        // Stack above any existing toasts
        const existing = document.querySelectorAll('.autothank-toast');
        toast.style.bottom = `${20 + existing.length * 80}px`;

        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    // =========================================================================
    // CORE LOGIC
    // =========================================================================

    function gmFetch(url, options = {}) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method:          options.method  || 'GET',
                url:             url,
                data:            options.body    || null,
                headers:         options.headers || {},
                withCredentials: true,
                onload:  (r) => resolve(r),
                onerror: (r) => reject(new Error(`GM request error: ${r.statusText}`)),
            });
        });
    }

    async function autoThank(torrentPageURL, domain, config) {
        try {
            // ── Step 1: Fetch the torrent page ───────────────────────────────
            console.log(`[AutoThank] Fetching: ${torrentPageURL}`);
            const response = await gmFetch(torrentPageURL);

            if (response.status < 200 || response.status >= 300) {
                console.warn(`[AutoThank] Fetch failed (HTTP ${response.status})`);
                return;
            }

            // ── Step 2: Parse using this domain's extractor ──────────────────
            const parser = new DOMParser();
            const doc    = parser.parseFromString(response.responseText, 'text/html');
            const fields = config.extractFormData(doc);

            if (!fields) {
                console.log('[AutoThank] No thank form found — already thanked or not applicable.');
                return;
            }

            console.log(`[AutoThank] Fields extracted:`, fields);

            // ── Step 3: POST using this domain's body builder ─────────────────
            const postURL  = `${domain}${config.postPath}`;
            const postBody = config.buildPostBody(fields);

            const postResponse = await gmFetch(postURL, {
                method:  'POST',
                body:    postBody,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });

            if (postResponse.status >= 200 && postResponse.status < 300) {
                console.log(`[AutoThank] ✅ Successfully thanked uploader on ${domain}`);
                showToast(`✅ AutoThank\nThanked uploader!\nTorrent ID: ${fields.groupId}\n${domain}`);
            } else {
                console.warn(`[AutoThank] POST failed (HTTP ${postResponse.status})`);
                showToast(`❌ AutoThank\nPOST failed (HTTP ${postResponse.status})\n${domain}`);
            }

        } catch (err) {
            console.error('[AutoThank] Unexpected error:', err);
        }
    }

})();