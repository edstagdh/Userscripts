// ==UserScript==
// @name         PMV Haven - Remove watched videos list
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  removes watched videos from response, faster page loading (with logging & error handling)
// @author       edstagdh
// @match        https://pmvhaven.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pmvhaven.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const LOG_PREFIX = '[TM]';
    console.log(`${LOG_PREFIX} Script loaded.`);

    if (window._fetchPatched) {
        console.warn(`${LOG_PREFIX} Fetch already patched — skipping.`);

        return;
    }
    window._fetchPatched = true;

    const originalFetch = window.fetch;
    window.fetch = async (resource, options) => {
        let url = typeof resource === "string" ? resource : resource?.url;
        if (!url) {
            console.debug(`${LOG_PREFIX} Unknown fetch resource type, skipping:`, resource);
            return originalFetch(resource, options);
        }

        // Pass through if it's not the profileInput API
        if (!url.includes("/api/v2/profileInput")) {
            return originalFetch(resource, options);
        }

        console.log(`${LOG_PREFIX} Intercepting request:`, url);

        try {
            const response = await originalFetch(resource, options);

            if (!response.ok) {
                console.warn(`${LOG_PREFIX} Response not OK, status:`, response.status);
                return response;
            }

            let data;
            try {
                data = await response.clone().json();
            } catch (err) {
                console.error(`${LOG_PREFIX} Failed to parse JSON:`, err);
                return response;
            }

            if (data?.data?.watched !== undefined) {
                console.log(`${LOG_PREFIX} Clearing watch history, original length:`, data.data.watched.length);
                data.data.watched = [];
            } else {
                console.debug(`${LOG_PREFIX} No 'watched' field found in response.`);
            }

            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            return new Response(blob, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
            });

        } catch (err) {
            console.error(`${LOG_PREFIX} Error during fetch interception:`, err);
            return originalFetch(resource, options);
        }
    };

    console.log(`${LOG_PREFIX} Fetch successfully patched.`);
})();
