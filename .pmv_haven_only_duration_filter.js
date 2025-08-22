// ==UserScript==
// @name         PMV Haven Enhanced Controls + Watch History Slowdown Fix
// @namespace    http://tampermonkey.net/
// @version      3.3
// @description  Replaces duration filter, fixes watch history slowdown bug
// @author       edstagdh
// @match        https://pmvhaven.com/
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const targetAPIs = ['/api/videos','/api/getmorevideos'];
    const searchAPI = '/api/v2/search';
    const profileAPI = '/api/v2/profileInput';

    // --- Cookie helpers ---
    function setCookie(name, value, days=365) {
        const d = new Date();
        d.setTime(d.getTime() + (days*24*60*60*1000));
        document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/`;
    }
    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? match[2] : null;
    }

    // --- Load durations from cookie ---
    let minCookie = getCookie('tm_minDuration');
    let maxCookie = getCookie('tm_maxDuration');
    let minDuration = minCookie !== null ? parseInt(minCookie) : 0;
    let maxDuration = maxCookie !== null ? (parseInt(maxCookie) || 999) : 999;
    console.log(`[TM] Loaded durations from cookie: Min=${minDuration}, Max=${maxDuration}`);

    // --- Unified fetch hook ---
    const originalFetch = window.fetch;
    window.fetch = async function(resource, options) {
        let url = typeof resource === 'string' ? resource : '';
        let opts = options || {};

        // --- Duration control for v1 APIs ---
        if (targetAPIs.some(api => url.includes(api))) {
            if (opts.method === 'POST' && opts.body) {
                try {
                    let bodyObj = JSON.parse(opts.body);
                    bodyObj.activeLength = `${minDuration}+`;
                    bodyObj.range = [minDuration, maxDuration];
                    opts.body = JSON.stringify(bodyObj);
                    console.log('[TM] Modified range for v1 API:', bodyObj.range);
                } catch(e) {
                    console.error('[TM] Failed to modify fetch body:', e);
                }
            }
            return originalFetch.call(this, resource, opts);
        }

        // --- Duration filtering for search API ---
        if (url.includes(searchAPI)) {
            const response = await originalFetch.call(this, resource, opts);
            const data = await response.clone().json();

            if (data && data.data && Array.isArray(data.data)) {
                const originalCount = data.data.length;
                data.data = data.data.filter(video => {
                    const durationMinutes = video.duration / 60;
                    return durationMinutes >= minDuration && durationMinutes <= maxDuration;
                });
                console.log(`[TM] Filtered search results (seconds → minutes): ${originalCount} -> ${data.data.length}`);
            }

            const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
            const init = { status: response.status, statusText: response.statusText, headers: response.headers };
            return new Response(blob, init);
        }

        // --- Watch history fix ---
        if (url.includes(profileAPI)) {
            const request = originalFetch.call(this, resource, opts);
            return request.then(async r => {
                // Clone original response
                const data = await r.clone().json();

                //console.log(`[TM] Response Data: ${data.data?.watched}`);
                // Remove watched history
                if (data.data?.watched !== undefined) data.data.watched = [];
                //console.log(`[TM] Response Data: ${data.data?.watched}`);

                // Create a new Response with modified body
                const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });

                return new Response(blob, {
                    status: r.status,
                    statusText: r.statusText,
                    headers: r.headers
                });
            });
        }

        return originalFetch.apply(this, arguments);
    };

    // --- Replace Duration Filter Card ---
    function replaceDurationCard() {
        const cards = document.querySelectorAll('.v-card-title');
        cards.forEach(card => {
            if (card.textContent.includes('Duration')) {
                const parentCard = card.closest('.v-card');
                if (!parentCard) return;

                // Remove slider
                const slider = parentCard.querySelector('.v-slider');
                if (slider) slider.remove();

                // Remove the min/max labels row (v-row with no-gutters)
                const minMaxRow = parentCard.querySelector('.v-row.v-row--no-gutters');
                if (minMaxRow) minMaxRow.remove();

                // Prevent inserting multiple times
                if (!parentCard.querySelector('.tm-duration-container')) {
                    const container = document.createElement('div');
                    container.className = 'tm-duration-container';
                    container.style.cssText = 'padding: 10px; color: white; font-size: 14px;';
                    container.innerHTML = `
                    <label style="display:block; margin-bottom:8px;">
                        Min Duration:
                        <input type="number" id="tm-min-duration" value="${minDuration}" step="1" style="width:70px; margin-left:5px;">
                        <span title="Minimum duration in minutes(no decimal). Enter 0 to include all videos from 0 minutes." style="cursor:help; color:#ffcc00; margin-left:5px;">?</span>
                    </label>
                    <label style="display:block; margin-bottom:8px;">
                        Max Duration:
                        <input type="number" id="tm-max-duration" value="${maxDuration === 999 ? 0 : maxDuration}" step="1" style="width:70px; margin-left:5px;">
                        <span title="Maximum duration in minutes(no decimal). Enter 0 to treat as unlimited (no upper limit)." style="cursor:help; color:#ffcc00; margin-left:5px;">?</span>
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
                            (!Number.isInteger(minVal) || !Number.isInteger(maxVal)) ||
                            (maxVal !== 0 && minVal > maxVal)
                        ) {
                            alert('Please enter valid integer min and max durations(non-decimal, Min ≤ Max, non-negative). Use 0 for unlimited max.');
                            return;
                        }

                        if (minVal === maxVal && maxVal !== 0) {
                            maxVal = minVal + 1;  // ✅ adjust before using it
                        }

                        minDuration = minVal;
                        maxDuration = maxVal === 0 ? 999 : maxVal; // ✅ now reflects the change

                        setCookie('tm_minDuration', minDuration);
                        setCookie('tm_maxDuration', maxDuration);
                        console.log(`[TM] Duration updated: Min=${minDuration}, Max=${maxDuration}`);
                        alert(`Duration updated: ${minDuration}-${maxDuration} minutes\nPage will refresh to apply.`);
                        location.reload();
                    });

                }
            }
        });
    }

    // --- Observers & intervals ---
    replaceDurationCard();

    const observer = new MutationObserver(() => {
        replaceDurationCard();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setInterval(() => {
        replaceDurationCard();
    }, 2000);

})();
