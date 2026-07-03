// ==UserScript==
// @name         Telegram Notifier Lib
// @namespace    https://github.com/edstagdh/Userscripts
// @version      1.0
// @description  Library for sending Telegram notifications. Meant to be @required by other userscripts, not installed standalone.
// @author       edstagdh
// ==/UserScript==

/**
 * Library-only build: no menu commands, no listeners, no side effects.
 * The script that @requires this file must declare its own @grants:
 *   @grant GM_xmlhttpRequest
 *   @grant GM_setValue
 *   @grant GM_getValue
 * and its own:
 *   @connect api.telegram.org
 *
 * Credentials (tg_bot_token / tg_chat_id) are read/written via GM_setValue
 * / GM_getValue, which are scoped to whichever script @requires this file
 * (since @require merges this code into that script at load time).
 */

const TelegramNotifier = (function () {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000;

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function gmRequest(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                timeout: 10000,
                onload: (response) => resolve(response),
                onerror: (err) => reject(err),
                ontimeout: () => reject(new Error('Request timed out')),
            });
        });
    }

    function getCredentials() {
        return {
            botToken: GM_getValue('tg_bot_token', ''),
            chatId: GM_getValue('tg_chat_id', ''),
        };
    }

    function setCredentials(botToken, chatId) {
        GM_setValue('tg_bot_token', botToken.trim());
        GM_setValue('tg_chat_id', String(chatId).trim());
    }

    async function send(message, options = {}) {
        const { botToken, chatId } = getCredentials();

        if (!botToken || !chatId) {
            console.error('[TelegramNotifier] Bot token or chat ID missing. Call TelegramNotifier.setCredentials(token, chatId) once, or set them manually.');
            return false;
        }

        const label = options.label || location.hostname || 'browser';
        const fullMessage = `[${label}] ${message}`;
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`
            + `?chat_id=${encodeURIComponent(chatId)}`
            + `&text=${encodeURIComponent(fullMessage)}`;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await gmRequest(url);

                if (response.status === 200) {
                    let result;
                    try {
                        result = JSON.parse(response.responseText);
                    } catch (e) {
                        console.error('[TelegramNotifier] Failed to parse response JSON:', response.responseText);
                        result = null;
                    }
                    if (result && result.ok) {
                        return true;
                    } else {
                        console.error('[TelegramNotifier] Telegram API error:', result);
                    }
                } else {
                    console.error(`[TelegramNotifier] HTTP ${response.status}: ${response.responseText}`);
                }
            } catch (err) {
                console.error(`[TelegramNotifier] Request error on attempt ${attempt}:`, err);
            }

            if (attempt < MAX_RETRIES) {
                console.info(`[TelegramNotifier] Retrying (${attempt}/${MAX_RETRIES})...`);
                await sleep(RETRY_DELAY_MS);
            }
        }

        return false;
    }

    return { send, getCredentials, setCredentials };
})();