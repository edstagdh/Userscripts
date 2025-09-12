// ==UserScript==
// @name         PMV Haven - Inbox Sender & Video Link Enhancer
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Make sender names and video titles clickable in inbox popup (with logging & error handling)
// @author       edstagdh
// @match        https://pmvhaven.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pmvhaven.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const apiUrl = "https://pmvhaven.com/api/v2/profileInput";
    const videoBaseUrl = "https://pmvhaven.com/video/";

    console.log("[PMV Haven] Inbox Enhancer script loaded.");

    // Replace sender with link in "From:" field
    function replaceSenderLink(titleDiv) {
        try {
            const span = titleDiv.querySelector('span[style*="color: orange"]');
            if (span && !titleDiv.querySelector('a')) {
                const username = span.textContent.trim();
                const link = document.createElement('a');
                link.href = `https://pmvhaven.com/profile/${encodeURIComponent(username)}`;
                link.textContent = username;
                link.style.color = 'orange';
                link.style.textDecoration = 'underline';
                span.replaceWith(link);

                console.log(`[PMV Haven] Replaced sender span with profile link: ${username}`);
            }
        } catch (err) {
            console.error("[PMV Haven] Error replacing sender link:", err);
        }
    }

    // Handle body text: replace username + make title clickable
    async function handleBodyText(bodySpan) {
        if (!bodySpan || bodySpan.dataset.enhanced) return;
        bodySpan.dataset.enhanced = "true";

        try {
            let text = bodySpan.textContent.trim();

            // Extract video title inside quotes
            const titleMatch = text.match(/'([^']+)'/);
            if (!titleMatch) {
                console.warn("[PMV Haven] No video title found in body text.");
                return;
            }
            const videoTitle = titleMatch[1];
            console.log(`[PMV Haven] Found video title: '${videoTitle}'`);

            // Extract username after "by "
            const userMatch = text.match(/by\s+(\w+)/i);
            if (!userMatch) {
                console.warn("[PMV Haven] No username found in body text.");
                return;
            }
            const username = userMatch[1];
            console.log(`[PMV Haven] Found username: ${username}`);

            // Replace username with profile link
            bodySpan.innerHTML = text.replace(
                new RegExp(`(${username})`),
                `<a href="https://pmvhaven.com/profile/${encodeURIComponent(username)}" style="color: orange; text-decoration: underline;">$1</a>`
            );

            console.log(`[PMV Haven] Username replaced with profile link: ${username}`);

            // Fetch profile videos
            try {
                console.log(`[PMV Haven] Fetching videos for user: ${username}`);
                const res = await fetch(apiUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "text/plain;charset=UTF-8",
                        "Accept": "*/*"
                    },
                    body: JSON.stringify({ user: username, mode: "getProfileVideos" })
                });

                if (!res.ok) {
                    console.warn(`[PMV Haven] API request failed with status ${res.status}`);
                    return;
                }

                const data = await res.json();
                if (data && Array.isArray(data.videos)) {
                    const match = data.videos.find(v => v.title === videoTitle);
                    if (match && match._id) {
                        const videoUrl = `${videoBaseUrl}${encodeURIComponent(videoTitle)}_${match._id}`;
                        bodySpan.innerHTML = bodySpan.innerHTML.replace(
                            new RegExp(`'${videoTitle}'`),
                            `<a href="${videoUrl}" target="_blank" style="color: orange; font-weight: bold; text-decoration: underline;">${videoTitle}</a>`
                        );
                        console.log(`[PMV Haven] Video linked: ${videoUrl}`);
                    } else {
                        console.warn(`[PMV Haven] No matching video found for title: '${videoTitle}'`);
                    }
                } else {
                    console.warn("[PMV Haven] API response did not contain videos array.");
                }
            } catch (err) {
                console.error("[PMV Haven] Error fetching videos:", err);
            }
        } catch (err) {
            console.error("[PMV Haven] Error handling body text:", err);
        }
    }

    // Watch for inbox popups
    const observer = new MutationObserver(() => {
        try {
            const titleDiv = document.querySelector('.v-overlay__content .v-card-title');
            if (titleDiv) replaceSenderLink(titleDiv);

            const bodySpan = document.querySelector('.v-overlay__content span.ma-4');
            if (bodySpan) handleBodyText(bodySpan);
        } catch (err) {
            console.error("[PMV Haven] MutationObserver error:", err);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[PMV Haven] MutationObserver started.");
})();
