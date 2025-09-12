// ==UserScript==
// @name         PMV Haven - Enhanced Filter Controls
// @namespace    http://tampermonkey.net/
// @version      3.4
// @description  Replaces duration filter with accurate filter (with logging & error handling)
// @author       edstagdh
// @match        https://pmvhaven.com/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pmvhaven.com
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const targetAPIs = ['/api/videos', '/api/getmorevideos'];
    const searchAPI = '/api/v2/search';

    console.log("[PMV Haven] Enhanced Filter Controls script loaded.");

    // --- Cookie helpers ---
    function setCookie(name, value, days = 365) {
        try {
            const d = new Date();
            d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
            document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/`;
            console.log(`[PMV Haven] Cookie set: ${name}=${value}`);
        } catch (err) {
            console.error("[PMV Haven] Error setting cookie:", err);
        }
    }

    function getCookie(name) {
        try {
            const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
            return match ? match[2] : null;
        } catch (err) {
            console.error("[PMV Haven] Error getting cookie:", err);
            return null;
        }
    }

    // --- Load durations from cookie ---
    let minCookie = getCookie('tm_minDuration');
    let maxCookie = getCookie('tm_maxDuration');
    let minDuration = minCookie !== null ? parseInt(minCookie) : 0;
    let maxDuration = maxCookie !== null ? (parseInt(maxCookie) || 999) : 999;
    console.log(`[PMV Haven] Loaded durations: Min=${minDuration}, Max=${maxDuration}`);

    // --- Unified fetch hook ---
    if (!window._fetchPatched) {
        window._fetchPatched = true;

        const originalFetch = window.fetch;
        window.fetch = async function(resource, options) {
            let url = typeof resource === 'string' ? resource : resource?.url || '';
            let opts = options || {};

            // --- Duration control for v1 APIs ---
            if (targetAPIs.some(api => url.includes(api))) {
                try {
                    if (opts.method === 'POST' && opts.body) {
                        let bodyObj = JSON.parse(opts.body);
                        bodyObj.activeLength = `${minDuration}+`;
                        bodyObj.range = [minDuration, maxDuration];
                        opts.body = JSON.stringify(bodyObj);
                        console.log(`[PMV Haven] Modified v1 API body with range: ${bodyObj.range}`);
                    }
                } catch (e) {
                    console.error("[PMV Haven] Failed to modify fetch body:", e);
                }
                return originalFetch.call(this, resource, opts);
            }

            // --- Duration filtering for search API ---
            if (url.includes(searchAPI)) {
                try {
                    const response = await originalFetch.call(this, resource, opts);
                    const data = await response.clone().json();

                    if (data && Array.isArray(data.data)) {
                        const originalCount = data.data.length;
                        data.data = data.data.filter(video => {
                            const durationMinutes = video.duration / 60;
                            return durationMinutes >= minDuration && durationMinutes <= maxDuration;
                        });
                        console.log(`[PMV Haven] Filtered search results: ${originalCount} → ${data.data.length}`);
                    } else {
                        console.warn("[PMV Haven] Unexpected search API response format.");
                    }

                    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
                    const init = { status: response.status, statusText: response.statusText, headers: response.headers };
                    return new Response(blob, init);
                } catch (err) {
                    console.error("[PMV Haven] Error handling search API response:", err);
                    return originalFetch.call(this, resource, opts);
                }
            }

            return originalFetch.apply(this, arguments);
        };

        console.log("[PMV Haven] Fetch successfully patched.");
    } else {
        console.warn("[PMV Haven] Fetch already patched, skipping.");
    }

    // --- Replace Duration Filter Card ---
    function replaceDurationCard() {
        try {
            const cards = document.querySelectorAll('.v-card-title');
            cards.forEach(card => {
                if (card.textContent.includes('Duration')) {
                    const parentCard = card.closest('.v-card');
                    if (!parentCard) return;

                    // Remove slider
                    const slider = parentCard.querySelector('.v-slider');
                    if (slider) {
                        slider.remove();
                        console.log("[PMV Haven] Removed default slider.");
                    }

                    // Remove the min/max labels row
                    const minMaxRow = parentCard.querySelector('.v-row.v-row--no-gutters');
                    if (minMaxRow) {
                        minMaxRow.remove();
                        console.log("[PMV Haven] Removed default min/max labels row.");
                    }

                    // Prevent inserting multiple times
                    if (!parentCard.querySelector('.tm-duration-container')) {
                        const container = document.createElement('div');
                        container.className = 'tm-duration-container';
                        container.style.cssText = 'padding: 10px; color: white; font-size: 14px;';
                        container.innerHTML = `
                        <label style="display:block; margin-bottom:8px;">
                            Min Duration:
                            <input type="number" id="tm-min-duration" value="${minDuration}" step="1" style="width:70px; margin-left:5px;">
                            <span title="Minimum duration in minutes (no decimal). Enter 0 to include all videos from 0 minutes." style="cursor:help; color:#ffcc00; margin-left:5px;">?</span>
                        </label>
                        <label style="display:block; margin-bottom:8px;">
                            Max Duration:
                            <input type="number" id="tm-max-duration" value="${maxDuration === 999 ? 0 : maxDuration}" step="1" style="width:70px; margin-left:5px;">
                            <span title="Maximum duration in minutes (no decimal). Enter 0 to treat as unlimited." style="cursor:help; color:#ffcc00; margin-left:5px;">?</span>
                        </label>
                        <button id="tm-apply-duration" style="margin-top:10px; background-color:#ff6600; color:white; padding:6px 12px; border:none; border-radius:4px; cursor:pointer;">
                            Apply
                        </button>
                        `;
                        card.parentNode.insertBefore(container, card.nextElementSibling);

                        const minInput = container.querySelector('#tm-min-duration');
                        const maxInput = container.querySelector('#tm-max-duration');
                        const applyButton = container.querySelector('#tm-apply-duration');

                        applyButton.addEventListener('click', () => {
                            let minVal = Number(minInput.value);
                            let maxVal = Number(maxInput.value);

                            if (
                                isNaN(minVal) || isNaN(maxVal) ||
                                minVal < 0 || maxVal < 0 ||
                                !Number.isInteger(minVal) || !Number.isInteger(maxVal) ||
                                (maxVal !== 0 && minVal > maxVal)
                            ) {
                                alert("Invalid duration values. Use non-negative integers. Min ≤ Max. Use 0 for unlimited max.");
                                console.warn("[PMV Haven] Invalid duration input:", { minVal, maxVal });
                                return;
                            }

                            if (minVal === maxVal && maxVal !== 0) {
                                maxVal = minVal + 1; // adjust before using it
                                console.log(`[PMV Haven] Adjusted maxVal to avoid equal min/max: ${maxVal}`);
                            }

                            minDuration = minVal;
                            maxDuration = maxVal === 0 ? 999 : maxVal;

                            setCookie('tm_minDuration', minDuration);
                            setCookie('tm_maxDuration', maxDuration);

                            console.log(`[PMV Haven] Duration updated: Min=${minDuration}, Max=${maxDuration}`);
                            alert(`Duration updated: ${minDuration}-${maxDuration} minutes\nPage will refresh to apply.`);
                            location.reload();
                        });

                        console.log("[PMV Haven] Custom duration controls injected.");
                    }
                }
            });
        } catch (err) {
            console.error("[PMV Haven] Error in replaceDurationCard:", err);
        }
    }

    // --- Observers & intervals ---
    replaceDurationCard();

    const observer = new MutationObserver(() => {
        replaceDurationCard();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[PMV Haven] MutationObserver started.");

    setInterval(() => {
        replaceDurationCard();
    }, 2000);

})();
