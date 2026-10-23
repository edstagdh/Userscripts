// ==UserScript==
// @name         Example Userscript
// @namespace    https://github.com/edstagdh/Userscripts
// @version      1.0
// @match        *://example.com/*
// @require      https://raw.githubusercontent.com/edstagdh/userscripts/main/Telegram/telegram_notify_lib.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      api.telegram.org
// ==/UserScript==

(function () {
    'use strict';

    // One-time setup: run this once (e.g. via the menu command below),
    // then remove/comment it out. Credentials are stored in THIS script's
    // own GM storage, separate from any other script.
    GM_registerMenuCommand('Set Telegram credentials', () => {
        const token = prompt('Bot token:');
        const chatId = prompt('Chat ID:');
        if (token && chatId) {
            TelegramNotifier.setCredentials(token, chatId);
            alert('Saved.');
        }
    });

    // Example usage elsewhere in your script:
    async function onSomeEvent() {
        const ok = await TelegramNotifier.send('Something happened on example.com!');
        if (!ok) console.error('Notification failed to send.');
    }

    // e.g. trigger it on page load for demonstration
    // onSomeEvent();

})();