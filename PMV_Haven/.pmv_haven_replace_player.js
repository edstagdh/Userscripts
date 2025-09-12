// ==UserScript==
// @name         PMV Haven - Fluid Player Button Enhancer with Persistent Loop & AJAX Support
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Replace Fluid Player with Plyr, add persistent loop button, fix fullscreen, and handle SPA navigation reliably with volume persistence
// @author       edstagdh
// @match        https://pmvhaven.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pmvhaven.com
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    const LOG_PREFIX = '[TM]';
    console.log(`${LOG_PREFIX} Script loaded.`);

    // Load Plyr CSS
    const plyrCss = document.createElement('link');
    plyrCss.rel = 'stylesheet';
    plyrCss.href = 'https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.css';
    document.head.appendChild(plyrCss);

    // Load Plyr JS
    const plyrScript = document.createElement('script');
    plyrScript.src = 'https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.min.js';
    plyrScript.onload = () => console.log(`${LOG_PREFIX} Plyr script loaded.`);
    plyrScript.onerror = () => console.error(`${LOG_PREFIX} Failed to load Plyr script.`);
    document.head.appendChild(plyrScript);

    function initVideoReplacement(retryCount = 0) {
        if (!location.href.includes('/video/')) return;

        try {
            const wrappers = document.querySelectorAll('.fluid_video_wrapper');
            if (!wrappers.length) {
                if (retryCount < 10) {
                    console.log(`${LOG_PREFIX} No video wrapper found, retrying (${retryCount + 1}/10)...`);
                    setTimeout(() => initVideoReplacement(retryCount + 1), 500);
                } else {
                    console.warn(`${LOG_PREFIX} Video wrapper not found after multiple attempts.`);
                }
                return;
            }

            wrappers.forEach(wrapper => {
                try {
                    if (wrapper.dataset.replaced) return;

                    const oldVideo = wrapper.querySelector('video');
                    if (!oldVideo) return;

                    const videoUrl = oldVideo.currentSrc || oldVideo.src;
                    if (!videoUrl) return;

                    console.log(`${LOG_PREFIX} Replacing Fluid Player with Plyr: ${videoUrl}`);

                    wrapper.dataset.replaced = true;
                    wrapper.innerHTML = '';

                    const plyrVideo = document.createElement('video');
                    plyrVideo.setAttribute('controls', '');
                    plyrVideo.setAttribute('crossorigin', '');
                    plyrVideo.setAttribute('playsinline', '');
                    plyrVideo.setAttribute('allow', 'picture-in-picture');
                    plyrVideo.style.width = '100%';
                    plyrVideo.style.height = 'auto';
                    plyrVideo.style.maxHeight = '80vh';
                    plyrVideo.style.objectFit = 'contain';
                    plyrVideo.style.backgroundColor = '#000';

                    const source = document.createElement('source');
                    source.src = videoUrl;
                    source.type = 'video/mp4';
                    plyrVideo.appendChild(source);
                    wrapper.appendChild(plyrVideo);

                    const initPlyrInstance = () => {
                        if (typeof Plyr === 'undefined') {
                            setTimeout(initPlyrInstance, 200);
                            return;
                        }

                        try {
                            const player = new Plyr(plyrVideo, {
                                controls: [
                                    'play-large','play','progress','current-time','mute','volume',
                                    'settings','fullscreen','download','pip'
                                ],
                                settings: ['speed','quality'],
                                disableContextMenu: false
                            });

                            plyrVideo.addEventListener('loadedmetadata', () => {
                                const savedVolume = localStorage.getItem('plyr_volume');
                                const savedMuted = localStorage.getItem('plyr_muted');
                                player.volume = savedVolume !== null ? parseFloat(savedVolume) : 0.05;
                                player.muted = savedMuted === 'true';
                                console.log(`${LOG_PREFIX} Volume restored: ${player.volume * 100}% | Muted: ${player.muted}`);
                            });

                            plyrVideo.addEventListener('volumechange', () => {
                                localStorage.setItem('plyr_volume', player.volume);
                                localStorage.setItem('plyr_muted', player.muted);
                            });

                            plyrVideo.addEventListener('contextmenu', e => e.stopPropagation(), true);

                            const plyrContainer = plyrVideo.closest('.plyr');
                            document.addEventListener('fullscreenchange', () => {
                                const fs = document.fullscreenElement;
                                if (fs === plyrContainer || plyrContainer.contains(fs)) {
                                    plyrContainer.style.maxHeight = 'none';
                                    plyrContainer.style.height = '100%';
                                    plyrVideo.style.maxHeight = 'none';
                                    plyrVideo.style.height = '100%';
                                } else {
                                    plyrContainer.style.maxHeight = '';
                                    plyrContainer.style.height = '';
                                    plyrVideo.style.maxHeight = '80vh';
                                    plyrVideo.style.height = 'auto';
                                }
                            });

                            // Loop button
                            const loopBtn = document.createElement('button');
                            loopBtn.className = 'plyr__control';
                            loopBtn.type = 'button';
                            loopBtn.title = 'Toggle Loop';
                            loopBtn.innerHTML = `
                                <svg role="presentation" focusable="false" height="24" width="24" viewBox="0 0 24 24">
                                    <path d="M7 7h10v3l4-4-4-4v3H6c-1.1 0-2 .9-2 2v5h2V7zm10 10H7v-3l-4 4 4 4v-3h11c1.1 0 2-.9 2-2v-5h-2v5z"></path>
                                </svg>`;
                            loopBtn.style.marginLeft = '5px';

                            let looping = localStorage.getItem('plyr_loop') === null ? true : localStorage.getItem('plyr_loop') === 'true';
                            loopBtn.style.opacity = looping ? '1' : '0.5';

                            plyrVideo.addEventListener('ended', () => {
                                if (looping) plyrVideo.play();
                            });

                            loopBtn.addEventListener('click', () => {
                                looping = !looping;
                                loopBtn.style.opacity = looping ? '1' : '0.5';
                                localStorage.setItem('plyr_loop', looping);
                                console.log(`${LOG_PREFIX} Loop toggled: ${looping}`);
                            });

                            plyrContainer.querySelector('.plyr__controls').appendChild(loopBtn);
                            console.log(`${LOG_PREFIX} Plyr initialized successfully.`);
                        } catch (err) {
                            console.error(`${LOG_PREFIX} Error initializing Plyr:`, err);
                        }
                    };

                    initPlyrInstance();
                } catch (err) {
                    console.error(`${LOG_PREFIX} Error replacing wrapper:`, err);
                }
            });
        } catch (err) {
            console.error(`${LOG_PREFIX} initVideoReplacement error:`, err);
        }
    }

    // Initial run
    initVideoReplacement();

    // SPA navigation handling
    (function(history){
        const pushState = history.pushState;
        history.pushState = function(state, title, url) {
            pushState.apply(history, arguments);
            window.dispatchEvent(new Event('locationchange'));
        };
        const replaceState = history.replaceState;
        history.replaceState = function(state, title, url) {
            replaceState.apply(history, arguments);
            window.dispatchEvent(new Event('locationchange'));
        };
    })(window);

    window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
    window.addEventListener('locationchange', () => {
        console.log(`${LOG_PREFIX} URL changed: ${location.href}`);
        if (location.href.includes('/video/')) {
            setTimeout(() => initVideoReplacement(), 500);
            setTimeout(() => initVideoReplacement(), 1500);
        }
    });

    // DOM changes observer
    const observer = new MutationObserver(() => {
        if (location.href.includes('/video/')) initVideoReplacement();
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
