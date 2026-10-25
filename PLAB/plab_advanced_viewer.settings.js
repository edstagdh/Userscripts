// [Pornolab] Advanced Viewer Experience — Viewer Settings overlay and the nav buttons (Grid/List, Viewer)
// Part of plab_advanced_viewer.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install plab_advanced_viewer.user.js.
// Version 1.5

// --------------------
// SETTINGS OVERLAY
// --------------------
function buildSettingsOverlay() {
    function toggle(id, checked) {
        return `<label class="vsm-toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="vsm-toggle-slider"></span></label>`;
    }
    function select(id, options, value) {
        const opts = options.map(([v, label]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${label}</option>`).join('');
        return `<select id="${id}">${opts}</select>`;
    }
    function row(labelText, hint, controlHtml) {
        return `<div class="vsm-row"><div class="vsm-label-wrap"><span class="vsm-label">${labelText}</span>${hint ? `<span class="vsm-hint">${hint}</span>` : ''}</div><div class="vsm-control">${controlHtml}</div></div>`;
    }

    const html = `
    <div id="viewer-settings-backdrop">
        <div id="viewer-settings-modal">
            <div class="vsm-header">
                <h2>&#9881; Viewer Settings ${SCRIPT_VERSION}</h2>
                <button class="vsm-close" id="vsm-close-btn">&#x2715;</button>
            </div>
            <div class="vsm-body">
                <div class="vsm-section">
                    <p class="vsm-section-title">Table View</p>
                    ${row('Preview Thumbnail Size', 'Max width/height of the Preview column thumbnail (px)',
                          `<input type="number" id="vsm-TABLE_THUMB_SIZE" min="40" max="300" step="10" value="${TABLE_THUMB_SIZE}">`)}
                </div>
                <div class="vsm-section">
                    <p class="vsm-section-title">Gallery View</p>
                    ${row('Gallery Mode', 'Display results as an image card grid instead of the table.', toggle('vsm-GALLERY_VIEW_MODE', GALLERY_VIEW_MODE))}
                    ${row('Card Dark Mode', 'Dark styling for the gallery cards.', toggle('vsm-GRID_DARK_MODE', GRID_DARK_MODE))}
                    ${row('Min Card Width', 'Minimum card width in the grid (px).',
                          `<input type="number" id="vsm-GALLERY_CARD_MIN_WIDTH" min="140" max="480" step="10" value="${GALLERY_CARD_MIN_WIDTH}">`)}
                </div>
                <div class="vsm-section">
                    <p class="vsm-section-title">Performance</p>
                    ${row('Image Load Mode', 'When preview images are fetched from inside each topic, relative to the viewport.',
                          select('vsm-IMAGE_LOAD_MODE', [['disabled','Immediate (no lazy load)'],['near','Near (~1–2 screens away)'],['lazy','Lazy (only when visible)']], IMAGE_LOAD_MODE))}
                    ${row('Max Concurrent Fetches', 'How many topic pages can be fetched for previews at the same time. Lower this if the page stalls or looks rate-limited.',
                          `<input type="number" id="vsm-FETCH_CONCURRENCY_LIMIT" min="1" max="12" step="1" value="${FETCH_CONCURRENCY_LIMIT}">`)}
                    ${row('Fetch Stagger (ms)', 'Delay between starting new preview fetches once a slot frees up.',
                          `<input type="number" id="vsm-FETCH_STAGGER_MS" min="0" max="2000" step="50" value="${FETCH_STAGGER_MS}">`)}
                    ${row('Fetch Timeout (ms)', 'How long to wait for a topic page before giving up on its preview.',
                          `<input type="number" id="vsm-FETCH_TIMEOUT_MS" min="2000" max="60000" step="1000" value="${FETCH_TIMEOUT_MS}">`)}
                    ${row('Remember Previews', 'Keep the preview image found for each topic between visits, so lists you come back to show their previews right away without fetching the topic pages again. Found images are re-checked after 30 days, and one that stops loading is forgotten.',
                          toggle('vsm-REMEMBER_PREVIEWS', REMEMBER_PREVIEWS))}
                    ${row('Remembered Previews', '<span id="vsm-preview-cache-count"></span>',
                          '<button class="vsm-btn vsm-btn-reset" id="vsm-preview-cache-clear" type="button">Clear</button>')}
                </div>
                <div class="vsm-section" id="vsm-forums-section">
                    <p class="vsm-section-title">Forum Blacklist</p>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Blacklisted Forums</span>
                        <span class="vsm-hint">Rows/cards from blacklisted forums are hidden immediately.</span>
                    </div>
                    <div id="vsm-forum-chips-container"></div>
                    <div id="vsm-forum-add-row">
                        <input type="text" id="vsm-forum-add-input" placeholder="e.g. Feature &amp; Vignettes" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-forum-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-forum-clear-btn" type="button">Clear all</button>
                    </div>
                </div>
                <div class="vsm-section" id="vsm-fav-forums-section">
                    <p class="vsm-section-title">Favorite Forums</p>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Glow Color</span>
                        <span class="vsm-hint">Color of the glow effect on rows/cards from a favorite forum.</span>
                    </div>
                    <div class="vsm-glow-swatches" id="vsm-glow-swatches"></div>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Favorited Forums</span>
                    </div>
                    <div id="vsm-fav-chips-container"></div>
                    <div id="vsm-fav-add-row">
                        <input type="text" id="vsm-fav-add-input" placeholder="e.g. SiteRip's 2026" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-fav-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-fav-clear-btn" type="button">Clear all</button>
                    </div>
                </div>
                <div class="vsm-section" id="vsm-uploaders-section">
                    <p class="vsm-section-title">Uploader Blacklist</p>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Blacklisted Uploaders</span>
                        <span class="vsm-hint">Click ⛔ next to an uploader name anywhere to block them instantly.</span>
                    </div>
                    <div id="vsm-uploader-chips-container"></div>
                    <div id="vsm-uploader-add-row">
                        <input type="text" id="vsm-uploader-add-input" placeholder="e.g. username123" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-uploader-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-uploader-clear-btn" type="button">Clear all</button>
                    </div>
                </div>
            </div>
            <div class="vsm-footer">
                <div style="display:flex;align-items:center">
                    <span class="vsm-saved-msg" id="vsm-saved-msg">&#x2713; Saved &mdash; reload to apply</span>
                </div>
                <div class="vsm-footer-btns">
                    <button class="vsm-btn vsm-btn-reset" id="vsm-reset-btn">Reset defaults</button>
                    <button class="vsm-btn vsm-btn-save"  id="vsm-save-btn">Save &amp; close</button>
                </div>
            </div>
        </div>
    </div>`;

    jQuery('body').append(html);

    jQuery('#viewer-settings-backdrop').on('click', function (e) { if (e.target === this) closeOverlay(); });
    jQuery('#vsm-close-btn').on('click', closeOverlay);
    jQuery(document).on('keydown.vsm', function (e) { if (e.key === 'Escape') closeOverlay(); });

    // Forum blacklist handlers
    jQuery(document).on('click', '#vsm-forum-add-btn', function () {
        const val = jQuery('#vsm-forum-add-input').val().trim();
        if (!val) return;
        const key = val.toLowerCase();
        if (FORUM_BLACKLIST.indexOf(key) === -1) FORUM_BLACKLIST.push(key);
        saveForumBlacklist(); applyAllFiltersToPage();
        jQuery('#vsm-forum-add-input').val('');
        refreshForumSettingsPanel();
    });
    jQuery(document).on('keydown', '#vsm-forum-add-input', function (e) { if (e.key === 'Enter') jQuery('#vsm-forum-add-btn').trigger('click'); });
    jQuery(document).on('click', '#vsm-forum-clear-btn', function () {
        if (!FORUM_BLACKLIST.length) return;
        if (!confirm('Remove all ' + FORUM_BLACKLIST.length + ' blacklisted forum(s)?')) return;
        FORUM_BLACKLIST = []; saveForumBlacklist(); applyAllFiltersToPage(); refreshForumSettingsPanel();
    });

    // Favorite forums handlers
    jQuery(document).on('click', '#vsm-fav-add-btn', function () {
        const val = jQuery('#vsm-fav-add-input').val().trim();
        if (!val) return;
        toggleForumInFavoritesIfAbsent(val);
        jQuery('#vsm-fav-add-input').val('');
        refreshFavoriteForumsPanel();
    });
    jQuery(document).on('keydown', '#vsm-fav-add-input', function (e) { if (e.key === 'Enter') jQuery('#vsm-fav-add-btn').trigger('click'); });
    jQuery(document).on('click', '#vsm-fav-clear-btn', function () {
        if (!FORUM_FAVORITES.length) return;
        if (!confirm('Remove all ' + FORUM_FAVORITES.length + ' favorite forum(s)?')) return;
        FORUM_FAVORITES = []; saveForumFavorites(); applyAllFiltersToPage(); refreshFavoriteForumsPanel();
    });

    // Uploader blacklist handlers
    jQuery(document).on('click', '#vsm-uploader-add-btn', function () {
        const val = jQuery('#vsm-uploader-add-input').val().trim().toLowerCase();
        if (!val) return;
        if (UPLOADER_BLACKLIST.indexOf(val) === -1) UPLOADER_BLACKLIST.push(val);
        saveUploaderBlacklist(); applyAllFiltersToPage();
        jQuery('#vsm-uploader-add-input').val('');
        refreshUploaderSettingsPanel();
    });
    jQuery(document).on('keydown', '#vsm-uploader-add-input', function (e) { if (e.key === 'Enter') jQuery('#vsm-uploader-add-btn').trigger('click'); });
    jQuery(document).on('click', '#vsm-uploader-clear-btn', function () {
        if (!UPLOADER_BLACKLIST.length) return;
        if (!confirm('Remove all ' + UPLOADER_BLACKLIST.length + ' blacklisted uploader(s)?')) return;
        UPLOADER_BLACKLIST = []; saveUploaderBlacklist(); applyAllFiltersToPage(); refreshUploaderSettingsPanel();
    });

    // Remember Previews applies right away
    jQuery(document).on('change', '#vsm-REMEMBER_PREVIEWS', function () {
        REMEMBER_PREVIEWS = this.checked;
        GM_setValue('REMEMBER_PREVIEWS', REMEMBER_PREVIEWS);
    });
    jQuery(document).on('click', '#vsm-preview-cache-clear', function () {
        if (!previewCacheCount()) return;
        if (!confirm('Forget all ' + previewCacheCount() + ' remembered preview(s)? Topic pages will be fetched again as you browse.')) return;
        previewCacheClear();
        refreshPreviewCacheInfo();
    });

    jQuery('#vsm-save-btn').on('click', function () {
        const prevGallery = GALLERY_VIEW_MODE;
        saveSettings();
        GALLERY_VIEW_MODE = jQuery('#vsm-GALLERY_VIEW_MODE').is(':checked');
        if (GALLERY_VIEW_MODE !== prevGallery) { if (GALLERY_VIEW_MODE) buildGalleryView(); else destroyGalleryView(); }
        closeOverlay();
        if (confirm('Settings saved!\n\nReload the page now for all changes (thumbnail size, dark mode, card width, image load mode, fetch throttling) to take effect?')) location.reload();
    });
    jQuery('#vsm-reset-btn').on('click', function () {
        if (!confirm('Reset all viewer settings to their defaults?')) return;
        applyDefaultsToForm(); saveSettings(); showSavedMsg();
    });
}

function toggleForumInFavoritesIfAbsent(forumName) {
    const key = forumName.toLowerCase().trim();
    if (!key) return;
    const blIdx = FORUM_BLACKLIST.indexOf(key);
    if (blIdx !== -1) { FORUM_BLACKLIST.splice(blIdx, 1); saveForumBlacklist(); }
    if (FORUM_FAVORITES.indexOf(key) === -1) FORUM_FAVORITES.push(key);
    saveForumFavorites();
    applyAllFiltersToPage();
}

function openOverlay() {
    if (!jQuery('#viewer-settings-backdrop').length) buildSettingsOverlay();   // built on first open
    jQuery('#viewer-settings-backdrop').addClass('active');
    refreshPreviewCacheInfo();
    refreshForumSettingsPanel();
    refreshFavoriteForumsPanel();
    refreshUploaderSettingsPanel();
    buildGlowSwatches();
}
function closeOverlay() { jQuery('#viewer-settings-backdrop').removeClass('active'); }
function showSavedMsg() {
    const $msg = jQuery('#vsm-saved-msg');
    $msg.addClass('visible');
    setTimeout(() => $msg.removeClass('visible'), 2500);
}
function applyDefaultsToForm() {
    jQuery('#vsm-TABLE_THUMB_SIZE').val(DEFAULTS.TABLE_THUMB_SIZE);
    jQuery('#vsm-GALLERY_VIEW_MODE').prop('checked', DEFAULTS.GALLERY_VIEW_MODE);
    jQuery('#vsm-GRID_DARK_MODE').prop('checked', DEFAULTS.GRID_DARK_MODE);
    jQuery('#vsm-GALLERY_CARD_MIN_WIDTH').val(DEFAULTS.GALLERY_CARD_MIN_WIDTH);
    jQuery('#vsm-IMAGE_LOAD_MODE').val(DEFAULTS.IMAGE_LOAD_MODE);
    jQuery('#vsm-FETCH_CONCURRENCY_LIMIT').val(DEFAULTS.FETCH_CONCURRENCY_LIMIT);
    jQuery('#vsm-FETCH_STAGGER_MS').val(DEFAULTS.FETCH_STAGGER_MS);
    jQuery('#vsm-FETCH_TIMEOUT_MS').val(DEFAULTS.FETCH_TIMEOUT_MS);
    jQuery('#vsm-REMEMBER_PREVIEWS').prop('checked', DEFAULTS.REMEMBER_PREVIEWS);
}
function saveSettings() {
    GM_setValue('TABLE_THUMB_SIZE', parseInt(jQuery('#vsm-TABLE_THUMB_SIZE').val(), 10) || DEFAULTS.TABLE_THUMB_SIZE);
    GM_setValue('GALLERY_VIEW_MODE', jQuery('#vsm-GALLERY_VIEW_MODE').is(':checked'));
    GM_setValue('GRID_DARK_MODE', jQuery('#vsm-GRID_DARK_MODE').is(':checked'));
    GM_setValue('GALLERY_CARD_MIN_WIDTH', parseInt(jQuery('#vsm-GALLERY_CARD_MIN_WIDTH').val(), 10) || DEFAULTS.GALLERY_CARD_MIN_WIDTH);
    GM_setValue('IMAGE_LOAD_MODE', jQuery('#vsm-IMAGE_LOAD_MODE').val());
    GM_setValue('FETCH_CONCURRENCY_LIMIT', parseInt(jQuery('#vsm-FETCH_CONCURRENCY_LIMIT').val(), 10) || DEFAULTS.FETCH_CONCURRENCY_LIMIT);
    GM_setValue('FETCH_STAGGER_MS', parseInt(jQuery('#vsm-FETCH_STAGGER_MS').val(), 10) || DEFAULTS.FETCH_STAGGER_MS);
    GM_setValue('FETCH_TIMEOUT_MS', parseInt(jQuery('#vsm-FETCH_TIMEOUT_MS').val(), 10) || DEFAULTS.FETCH_TIMEOUT_MS);
    REMEMBER_PREVIEWS = jQuery('#vsm-REMEMBER_PREVIEWS').is(':checked');
    GM_setValue('REMEMBER_PREVIEWS', REMEMBER_PREVIEWS);
}

function refreshPreviewCacheInfo() {
    const n = previewCacheCount();
    jQuery('#vsm-preview-cache-count').text(n ? n.toLocaleString() + ' topic' + (n === 1 ? '' : 's') + ' remembered.' : 'None yet.');
    jQuery('#vsm-preview-cache-clear').prop('disabled', !n);
}

function refreshForumSettingsPanel() {
    const $c = jQuery('#vsm-forum-chips-container');
    if (!$c.length) return;
    $c.empty();
    if (FORUM_BLACKLIST.length) {
        FORUM_BLACKLIST.forEach(function (name) {
            const $chip = jQuery('<span class="vsm-bl-chip">').text(name);
            jQuery('<button type="button" title="Remove">&times;</button>').on('click', function () { toggleForumInBlacklist(name); }).appendTo($chip);
            $c.append($chip);
        });
    } else {
        $c.append(jQuery('<span>').css({ color: '#555', fontSize: '11px' }).text('No forums blacklisted.'));
    }
}
function refreshFavoriteForumsPanel() {
    const $c = jQuery('#vsm-fav-chips-container');
    if (!$c.length) return;
    $c.empty();
    if (FORUM_FAVORITES.length) {
        FORUM_FAVORITES.forEach(function (name) {
            const $chip = jQuery('<span class="vsm-fav-chip">').text(name);
            jQuery('<button type="button" title="Remove">&times;</button>').on('click', function () { toggleForumInFavorites(name); }).appendTo($chip);
            $c.append($chip);
        });
    } else {
        $c.append(jQuery('<span>').css({ color: '#555', fontSize: '11px' }).text('No favorite forums.'));
    }
}
function refreshUploaderSettingsPanel() {
    const $c = jQuery('#vsm-uploader-chips-container');
    if (!$c.length) return;
    $c.empty();
    if (UPLOADER_BLACKLIST.length) {
        UPLOADER_BLACKLIST.forEach(function (name) {
            const $chip = jQuery('<span class="vsm-bl-chip">').text(name);
            jQuery('<button type="button" title="Remove">&times;</button>').on('click', function () { toggleUploaderInBlacklist(name); }).appendTo($chip);
            $c.append($chip);
        });
    } else {
        $c.append(jQuery('<span>').css({ color: '#555', fontSize: '11px' }).text('No uploaders blacklisted.'));
    }
}
function buildGlowSwatches() {
    const $wrap = jQuery('#vsm-glow-swatches');
    if (!$wrap.length) return;
    $wrap.empty();
    GLOW_COLORS.forEach(function (c) {
        const isSel = c.hex.toLowerCase() === FAVORITE_GLOW_COLOR.toLowerCase();
        jQuery('<div class="vsm-glow-swatch' + (isSel ? ' selected' : '') + '">')
            .css({ background: c.hex, 'box-shadow': '0 0 8px 2px ' + c.hex + '88' })
            .attr('title', c.name)
            .on('click', function () {
                FAVORITE_GLOW_COLOR = c.hex;
                GM_setValue('FAVORITE_GLOW_COLOR', c.hex);
                jQuery('.vsm-glow-swatch').removeClass('selected');
                jQuery(this).addClass('selected');
                applyAllFiltersToPage();
            })
            .appendTo($wrap);
    });
}

// --------------------
// NAV BUTTON INJECTION
// (Pornolab shows a "Опции показа" link above the results table — we hang our
//  Grid/List toggle and Settings gear right next to it)
// --------------------
function injectNavButtons() {
    const $anchor = jQuery('a.menu-root[href="#tr-options"]').first();
    if (!$anchor.length) { console.warn(`${LOG_PREFIX} nav anchor not found`); return; }

    const $wrap = jQuery('<span id="pl_viewer_nav_wrap" style="margin-left:10px;">');
    const $galleryBtn = jQuery('<a href="javascript:void(0)" id="pl-gallery-toggle-btn">')
        .html(GALLERY_VIEW_MODE ? '&#9776; List' : '&#10697; Grid')
        .attr('title', GALLERY_VIEW_MODE ? 'Switch to table view' : 'Switch to grid view');
    const $settingsBtn = jQuery('<a href="javascript:void(0)" id="pl-settings-open-btn">&#9881; Viewer</a>')
        .attr('title', 'Pornolab Viewer Settings');

    $wrap.append(' | ', $galleryBtn, ' | ', $settingsBtn);
    $anchor.after($wrap);

    jQuery('#pl-gallery-toggle-btn').on('click', toggleGalleryMode);
    jQuery('#pl-settings-open-btn').on('click', openOverlay);
}
