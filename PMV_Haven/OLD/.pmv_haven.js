// ==UserScript==
// @name         Better PMV Haven Experience
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Adds Duration, stars, and tags filter controls, saves to cookies, disables infinite scrolling, modifies API request to include filters
// @author       edstagdh
// @match        https://pmvhaven.com/
// @exclude      https://pmvhaven.com/{search,browse,star,video,trending,popular,discover,category,events,random,contribute,upload,profile,contact,csam,2257,privacy,dmca,policy}/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

        // === Override /api/v2/profileInput to clear watched ===
    let fetchNative = window.fetch;
    window.fetch = (resource, options) => {
        let request = fetchNative(resource, options);
        if (resource !== "/api/v2/profileInput") return request;

        return request.then(r => r.json()).then(response => {
            if (response.data?.watched !== undefined) {
                response.data.watched = [];
            }
            return { json: () => response };
        });
    };

    const targetAPIs = ['/api/videos','/api/getmorevideos'];
    const searchAPI = '/api/v2/search';

    // === Helper functions for cookies ===
    function setCookie(name, value, days=30) {
        const d = new Date();
        d.setTime(d.getTime() + (days*24*60*60*1000));
        document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
    }
    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    }

    // === Load duration, stars, tags from cookies ===
    let minDuration = parseInt(getCookie('tm_minDuration')) || 0;
    let maxDuration = parseInt(getCookie('tm_maxDuration')) || 999;

    let starList = [];
    const starCookie = getCookie('tm_starList');
    if (starCookie) {
        try { starList = JSON.parse(starCookie); } catch(e){ starList = []; }
    }

    let tagList = [];
    const tagCookie = getCookie('tm_tagList');
    if (tagCookie) {
        try { tagList = JSON.parse(tagCookie); } catch(e){ tagList = []; }
    }

    console.log(`[TM] Loaded settings: Min=${minDuration}, Max=${maxDuration}, stars=${starList.join(', ')}, tags=${tagList.join(', ')}`);

    // === Hook fetch for duration, stars, tags filtering ===
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : '';
        let options = args[1] || {};

        if (targetAPIs.some(api => url.includes(api))) {
            if (options.method === 'POST' && options.body) {
                try {
                    let bodyObj = JSON.parse(options.body);

                    // === Apply duration ===
                    bodyObj.activeLength = `${minDuration}+`;
                    bodyObj.range = [minDuration, maxDuration];

                    // === Apply stars ===
                    if (!Array.isArray(bodyObj.stars)) { bodyObj.stars = []; }
                    starList.forEach(star => { if (!bodyObj.stars.includes(star)) bodyObj.stars.push(star); });

                    // === Apply tags ===
                    if (!Array.isArray(bodyObj.tags)) { bodyObj.tags = []; }
                    tagList.forEach(tag => { if (!bodyObj.tags.includes(tag)) bodyObj.tags.push(tag); });

                    options.body = JSON.stringify(bodyObj);
                    console.log('[TM] Modified request body:', bodyObj);
                } catch(e) { console.error('[TM] Failed to modify fetch body:', e); }
            }
            return originalFetch.call(this, url, options);
        }

        if (url.includes(searchAPI)) {
            const response = await originalFetch.call(this, url, options);
            const data = await response.clone().json();

            if (data && data.data && Array.isArray(data.data)) {
                const originalCount = data.data.length;
                data.data = data.data.filter(video => {
                    const durationMinutes = video.duration / 60;
                    return durationMinutes >= minDuration && durationMinutes <= maxDuration;
                });
                console.log(`[TM] Filtered search results: ${originalCount} -> ${data.data.length}`);
            }

            const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
            return new Response(blob, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
            });
        }

        return originalFetch.apply(this, args);
    };

    // === Replace Duration Card and Add stars + tags Section ===
    function replaceDurationCard() {
        const cards = document.querySelectorAll('.v-card-title');
        cards.forEach(card => {
            if (card.textContent.includes('Duration')) {
                const parentCard = card.closest('.v-card');
                if (!parentCard) return;

                const headerHTML = `
                    <div style="background-color: rgb(29,29,29); font-size: 1rem; color: white; padding:8px;">
                        <span class="mr-1">Duration</span>
                        <span style="color: rgb(131,131,131); font-size: 0.7rem;">(Minutes)</span>
                    </div>
                `;

                parentCard.innerHTML = `
                    ${headerHTML}
                    <div style="padding: 15px; color: white; font-size: 14px;">
                        <label style="display:block; margin-bottom:8px;">
                            Min Duration:
                            <input type="number" id="tm-min-duration" value="${minDuration}" style="width:70px; margin-left:5px;">
                        </label>
                        <label style="display:block; margin-bottom:8px;">
                            Max Duration:
                            <input type="number" id="tm-max-duration" value="${maxDuration}" style="width:70px; margin-left:5px;">
                        </label>
                        <button id="tm-apply-duration" style="margin-top:10px; background-color:#ff6600; color:white; padding:6px 12px; border:none; border-radius:4px; cursor:pointer;">
                            Apply
                        </button>
                    </div>

                    <!-- Stars Section -->
                    <div style="background-color: rgb(29,29,29); font-size: 1rem; color: white; padding:8px; margin-top:10px;">
                        <span class="mr-1">Stars</span>
                    </div>
                    <div style="padding: 15px; color: white; font-size: 14px;">
                        <input type="text" id="tm-star-input" placeholder="Add star name" style="width:150px; margin-right:5px;">
                        <button id="tm-add-star" style="background-color:#ff6600; color:white; padding:4px 10px; border:none; border-radius:4px; cursor:pointer;">Add</button>
                        <ul id="tm-star-list" style="list-style:none; padding:10px 0 0 0; margin:0;">
                            ${starList.map(star => `
                                <li style="margin-bottom:5px;">
                                    ${star}
                                    <button data-star="${star}" class="tm-remove-star" style="margin-left:8px; background:#ff3333; color:white; border:none; border-radius:4px; padding:2px 6px; cursor:pointer;">Remove</button>
                                </li>`).join('')}
                        </ul>
                        <button id="tm-apply-stars" style="margin-top:10px; background-color:#ff6600; color:white; padding:6px 12px; border:none; border-radius:4px; cursor:pointer;">
                            Apply Stars
                        </button>
                    </div>

                    <!-- Tags Section -->
                    <div style="background-color: rgb(29,29,29); font-size: 1rem; color: white; padding:8px; margin-top:10px;">
                        <span class="mr-1">Tags</span>
                    </div>
                    <div style="padding: 15px; color: white; font-size: 14px;">
                        <input type="text" id="tm-tag-input" placeholder="Add tag" style="width:150px; margin-right:5px;">
                        <button id="tm-add-tag" style="background-color:#ff6600; color:white; padding:4px 10px; border:none; border-radius:4px; cursor:pointer;">Add</button>
                        <ul id="tm-tag-list" style="list-style:none; padding:10px 0 0 0; margin:0;">
                            ${tagList.map(tag => `
                                <li style="margin-bottom:5px;">
                                    ${tag}
                                    <button data-tag="${tag}" class="tm-remove-tag" style="margin-left:8px; background:#ff3333; color:white; border:none; border-radius:4px; padding:2px 6px; cursor:pointer;">Remove</button>
                                </li>`).join('')}
                        </ul>
                        <button id="tm-apply-tags" style="margin-top:10px; background-color:#ff6600; color:white; padding:6px 12px; border:none; border-radius:4px; cursor:pointer;">
                            Apply Tags
                        </button>
                    </div>
                `;

                // === Duration events ===
                const minInput = parentCard.querySelector('#tm-min-duration');
                const maxInput = parentCard.querySelector('#tm-max-duration');
                const applyButton = parentCard.querySelector('#tm-apply-duration');
                applyButton.addEventListener('click', () => {
                    let minVal = parseInt(minInput.value);
                    let maxVal = parseInt(maxInput.value);
                    if (isNaN(minVal) || isNaN(maxVal) || minVal < 0 || maxVal < 0 || minVal >= maxVal) {
                        alert('Please enter valid min and max duration values.');
                        return;
                    }
                    minDuration = minVal;
                    maxDuration = maxVal;
                    setCookie('tm_minDuration', minDuration);
                    setCookie('tm_maxDuration', maxDuration);
                    alert(`Duration updated: ${minDuration}-${maxDuration} minutes\nPage will refresh to apply.`);
                    location.reload();
                });

                // === Stars events ===
                const starInput = parentCard.querySelector('#tm-star-input');
                const addStarBtn = parentCard.querySelector('#tm-add-star');
                const starListContainer = parentCard.querySelector('#tm-star-list');
                const applyStarsBtn = parentCard.querySelector('#tm-apply-stars');
                function updateStarCookie(){ setCookie('tm_starList', JSON.stringify(starList)); }

                addStarBtn.addEventListener('click', () => {
                    const starName = starInput.value.trim();
                    if (starName && !starList.includes(starName)) {
                        starList.push(starName);
                        updateStarCookie();
                        const li = document.createElement('li');
                        li.style.marginBottom = '5px';
                        li.innerHTML = `${starName}<button data-star="${starName}" class="tm-remove-star" style="margin-left:8px; background:#ff3333; color:white; border:none; border-radius:4px; padding:2px 6px; cursor:pointer;">Remove</button>`;
                        starListContainer.appendChild(li);
                        starInput.value='';
                    }
                });
                starListContainer.addEventListener('click', (e) => {
                    if(e.target.classList.contains('tm-remove-star')){
                        const starToRemove = e.target.getAttribute('data-star');
                        starList = starList.filter(s => s !== starToRemove);
                        updateStarCookie();
                        e.target.parentElement.remove();
                    }
                });
                applyStarsBtn.addEventListener('click', ()=>{
                    updateStarCookie();
                    alert(`Stars updated: ${starList.join(', ')}\nPage will refresh to apply.`);
                    location.reload();
                });

                // === Tags events ===
                const tagInput = parentCard.querySelector('#tm-tag-input');
                const addTagBtn = parentCard.querySelector('#tm-add-tag');
                const tagListContainer = parentCard.querySelector('#tm-tag-list');
                const applyTagsBtn = parentCard.querySelector('#tm-apply-tags');
                function updateTagCookie(){ setCookie('tm_tagList', JSON.stringify(tagList)); }

                addTagBtn.addEventListener('click', () => {
                    const tagName = tagInput.value.trim();
                    if(tagName && !tagList.includes(tagName)){
                        tagList.push(tagName);
                        updateTagCookie();
                        const li = document.createElement('li');
                        li.style.marginBottom='5px';
                        li.innerHTML = `${tagName}<button data-tag="${tagName}" class="tm-remove-tag" style="margin-left:8px; background:#ff3333; color:white; border:none; border-radius:4px; padding:2px 6px; cursor:pointer;">Remove</button>`;
                        tagListContainer.appendChild(li);
                        tagInput.value='';
                    }
                });

                tagListContainer.addEventListener('click', (e)=>{
                    if(e.target.classList.contains('tm-remove-tag')){
                        const tagToRemove = e.target.getAttribute('data-tag');
                        tagList = tagList.filter(t=> t!==tagToRemove);
                        updateTagCookie();
                        e.target.parentElement.remove();
                    }
                });

                applyTagsBtn.addEventListener('click', ()=>{
                    updateTagCookie();
                    alert(`Tags updated: ${tagList.join(', ')}\nPage will refresh to apply.`);
                    location.reload();
                });

            }

            if (card.textContent.includes('Top Tags')) {
                const parentCard = card.closest('.v-card');
                if (parentCard) {
                    parentCard.remove();
                    console.log('[TM] Removed Top Tags card');
            }
            }
        });
    }

    replaceDurationCard();

    // === Disable Infinite Scrolling & Hide PMVArchive Switches ===
    function disableSwitches() {
        const switchLabels = ["Infinite Scrolling", "Hide PMVArchive"];
        switchLabels.forEach(label => {
            const switchInput = document.querySelector(`input[aria-label="${label}"]`);
            if (switchInput && !switchInput.disabled && switchInput.checked) {
                switchInput.checked = false;
                switchInput.dispatchEvent(new Event('input', { bubbles: true }));
                switchInput.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(`[TM] "${label}" switch disabled.`);
            }
        });
    }
    // === Set slider to 3% by default ===
    function setSliderDefault() {
        const sliderInput = document.querySelector('input[id^="input-"]'); // matches your slider input
        const sliderContainer = sliderInput?.closest('.v-slider__container');
        if (sliderInput && sliderContainer) {
            const value = 3; // default percent

            // Update input value
            sliderInput.value = value;

            // Update thumb position and aria-valuenow
            const thumb = sliderContainer.querySelector('.v-slider-thumb');
            if (thumb) {
                thumb.style.setProperty('--v-slider-thumb-position', `${value}%`);
                thumb.setAttribute('aria-valuenow', value);
            }

            // Update track fill
            const trackFill = sliderContainer.querySelector('.v-slider-track__fill');
            if (trackFill) {
                trackFill.style.width = `${value}%`;
            }

            console.log(`[TM] Slider set to ${value}%`);
        }
    }

    // Call once initially
    disableSwitches();
    setSliderDefault();

    // Observer for dynamically added elements
    const observer = new MutationObserver(() => {
        disableSwitches();
        replaceDurationCard();
        setSliderDefault(); // <-- add this
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Periodic check in case elements appear later
    setInterval(() => {
        disableSwitches();
        replaceDurationCard();
        setSliderDefault(); // <-- add this
    }, 2000);

})();
