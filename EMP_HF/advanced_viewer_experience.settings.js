// [HF][EMP] Advanced Viewer Experience — Viewer Settings overlay and the nav-bar buttons (Grid/List, Wall, Viewer)
// Part of advanced_viewer_experience.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install advanced_viewer_experience.user.js.
// Version 3.15

// --------------------
// SETTINGS OVERLAY — BUILD & INJECT
// --------------------
function buildSettingsOverlay() {

    function toggle(id, checked, hint) {
        return `
        <label class="vsm-toggle" title="${hint || ''}">
            <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
            <span class="vsm-toggle-slider"></span>
        </label>`;
    }

    function select(id, options, value) {
        const opts = options.map(([v, label]) =>
                                 `<option value="${v}" ${v === value ? 'selected' : ''}>${label}</option>`
        ).join('');
        return `<select id="${id}">${opts}</select>`;
    }

    function row(labelText, hint, controlHtml) {
        return `
        <div class="vsm-row">
            <div class="vsm-label-wrap">
                <span class="vsm-label">${labelText}</span>
                ${hint ? `<span class="vsm-hint">${hint}</span>` : ''}
            </div>
            <div class="vsm-control">${controlHtml}</div>
        </div>`;
    }

    const html = `
    <div id="viewer-settings-backdrop">
        <div id="viewer-settings-modal">
            <div class="vsm-header">
                <h2>&#9881; Viewer Settings ${SCRIPT_VERSION}</h2>
                <button class="vsm-close" id="vsm-close-btn" title="Close">&#x2715;</button>
            </div>
            <div class="vsm-body">

                <div class="vsm-section">
                    <p class="vsm-section-title">Table / Torrent List</p>
                    ${row('Max Thumbnail Size',
                          'Maximum width &amp; height of thumbnails in the torrent table (px)',
                          `<input type="number" id="vsm-TABLE_MAX_IMAGE_SIZE" min="50" max="600" step="10" value="${TABLE_MAX_IMAGE_SIZE}">`)}
                    ${row('Small Thumbnails',
                          'Use compact thumbnail size (50×50 placeholder before load)',
                          toggle('vsm-SMALL_THUMBNAILS', SMALL_THUMBNAILS))}
                    ${row('Wider Table View',
                          'Expands #content to 99% width, up to 1500px',
                          toggle('vsm-ENABLE_WIDER_TABLE_VIEW', ENABLE_WIDER_TABLE_VIEW))}
                    ${row('Remove Category Labels',
                          'Hides the category div/icon overlay on each row',
                          toggle('vsm-REMOVE_CATEGORIES', REMOVE_CATEGORIES))}
                </div>

                <div class="vsm-section">
                    <p class="vsm-section-title">Gallery View</p>
                    ${row('Gallery Mode',
                          'Display results as an image card grid instead of the table. Toggle instantly with the Grid/List button in the nav bar.',
                          toggle('vsm-GALLERY_VIEW_MODE', GALLERY_VIEW_MODE))}
                    ${row('Card Dark Mode',
                          'Display Toggle Dark Mode for the cards in grid view.',
                          toggle('vsm-GRID_DARK_MODE', GRID_DARK_MODE))}
                    ${row('Min Card Width',
                          'Minimum card width in the gallery grid (px). Affects how many columns fit.',
                          `<input type="number" id="vsm-GALLERY_CARD_MIN_WIDTH" min="140" max="480" step="10" value="${GALLERY_CARD_MIN_WIDTH}">`)}
                </div>

                <div class="vsm-section">
                    <p class="vsm-section-title">Collage Page</p>
                    ${row('Text Trim Mode',
                          'Controls how torrent titles are displayed in the collage grid',
                          select('vsm-TRIM_TEXT_COLLAGE_PAGE_MODE',
                                 [['nothing','Nothing (default)'],['small_text','Small text'],
                                  ['smaller_text','Smaller text'],['small_text_wrap','Small text + wrap'],
                                  ['smaller_text_wrap','Smaller text + wrap']],
                                 TRIM_TEXT_COLLAGE_PAGE_MODE))}
                    ${row('Fit Vertical Images',
                          'Adjusts the SVG viewBox to better fill tall/portrait cover images',
                          select('vsm-FIT_VERTICAL_IMAGES_GRID_BETTER',
                                 [['nothing','Nothing (default)'],['half','Half width'],['full','Full width']],
                                 FIT_VERTICAL_IMAGES_GRID_BETTER))}
                    ${row('Remove Cover Images',
                          'Hides the .torrent__cover background image on collage pages',
                          toggle('vsm-REMOVE_MAIN_IMAGES_COLLAGE_PAGE', REMOVE_MAIN_IMAGES_COLLAGE_PAGE))}
                </div>

                <div class="vsm-section">
                    <p class="vsm-section-title">Performance</p>
                    ${row('Image Load Mode',
                          'When thumbnail images are fetched relative to the viewport',
                          select('vsm-IMAGE_LOAD_MODE',
                                 [['disabled','Immediate (no lazy load)'],
                                  ['near','Near (~1–2 screens away)'],
                                  ['lazy','Lazy (only when visible)']],
                                 IMAGE_LOAD_MODE))}
                </div>

                <div class="vsm-section" id="vsm-wall-section">
                    <p class="vsm-section-title">Poster Wall</p>
                    ${row('Group Duplicate Images',
                          'Torrents that use the same image link (usually different resolutions) appear as one poster; clicking it lets you pick which torrent to open. Also switchable on the wall with D.',
                          toggle('vsm-WALL_GROUP_DUP_IMAGES', WALL_GROUP_DUP_IMAGES))}
                    ${row('Auto-close When Idle',
                          'Closes the Poster Wall after this long without mouse, wheel or keyboard activity (a 30-second warning appears first). The wall can be heavy on some PCs, so it is best not left open in the background.',
                          select('vsm-WALL_IDLE_CLOSE_MIN',
                                 [['0','Never'],['5','After 5 minutes'],['10','After 10 minutes'],['15','After 15 minutes'],['30','After 30 minutes']],
                                 String(WALL_IDLE_CLOSE_MIN)))}
                    ${row('Show Notice on Open',
                          'Show the note about resource use and image hosts when the Poster Wall opens. It is always available from the ⓘ button on the wall.',
                          toggle('vsm-WALL_NOTICE_SHOW', WALL_NOTICE_SHOW))}
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">"Image unavailable" examples</span>
                        <span class="vsm-hint">Links to images the host has replaced with an "image unavailable" template. Each one is downloaded once to learn the template; posters showing the same template are left out of the wall. Press U on the wall to add the highlighted poster. Changes apply without saving.</span>
                    </div>
                    <div id="vsm-unavail-container"></div>
                    <div id="vsm-unavail-add-row">
                        <input type="text" id="vsm-unavail-add-input" placeholder="https://… (several separated by spaces)" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-unavail-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-unavail-reset-btn" type="button">Defaults</button>
                    </div>
                </div>

                <div class="vsm-section" id="vsm-tags-section">
                    <p class="vsm-section-title">Tag Blacklist</p>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Blacklisted Tags</span>
                        <span class="vsm-hint">Rows/cards containing ANY blacklisted tag are hidden immediately. Changes apply instantly without saving.</span>
                    </div>
                    <div id="vsm-tag-chips-container"></div>
                    <div id="vsm-tag-add-row">
                        <input type="text" id="vsm-tag-add-input" placeholder="e.g. scat  or  natural.tits" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-tag-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-tag-clear-btn" type="button">Clear all</button>
                    </div>
                    <div id="vsm-tags-disabled-msg" class="vsm-tags-disabled-note" style="display:none;">
                        No tags found on this page — add/remove is disabled until you visit a page with tags.
                    </div>
                </div>

                <div class="vsm-section" id="vsm-fav-tags-section">
                    <p class="vsm-section-title">Favorite Tags</p>
                    ${row('Tag Popup Click Action',
                          'What clicking a tag chip in the Tags popup does. Popup shows current mode. Shift+click in blacklist mode blocks the tag for just that uploader. Tags are mutually exclusive between the global lists.',
                          select('vsm-TAG_CLICK_ACTION',
                                 [['blacklist','Blacklist tag (everyone)'],['uploader_tag','Blacklist tag for this uploader only'],['favorite','Add to favorites']],
                                 TAG_CLICK_ACTION))}
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Glow Color</span>
                        <span class="vsm-hint">Color of the glow effect on rows/cards that match a favorite tag.</span>
                    </div>
                    <div class="vsm-glow-swatches" id="vsm-glow-swatches"></div>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Favorited Tags</span>
                        <span class="vsm-hint">Rows/cards containing ANY favorite tag glow in the chosen color. Changes apply instantly.</span>
                    </div>
                    <div id="vsm-fav-chips-container"></div>
                    <div id="vsm-fav-add-row">
                        <input type="text" id="vsm-fav-add-input" placeholder="e.g. lesbian  or  big.tits" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-fav-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-fav-clear-btn" type="button">Clear all</button>
                    </div>
                    <div id="vsm-fav-disabled-msg" class="vsm-tags-disabled-note" style="display:none;">
                        No tags found on this page — add is disabled until you visit a page with tags.
                    </div>
                </div>

                <div class="vsm-section" id="vsm-uploaders-section">
                    <p class="vsm-section-title">Uploader Blacklist</p>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Blacklisted Uploaders</span>
                        <span class="vsm-hint">Rows/cards from blacklisted uploaders are hidden. Click the red ✕ next to an uploader name to block them — you'll be asked for a duration (permanent by default). Timed blocks show their remaining time and expire automatically. Changes apply without saving.</span>
                    </div>
                    <div id="vsm-uploader-chips-container"></div>
                    <div id="vsm-uploader-add-row">
                        <input type="text" id="vsm-uploader-add-input" placeholder="e.g. username123" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-uploader-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-uploader-clear-btn" type="button">Clear all</button>
                    </div>
                </div>

                <div class="vsm-section" id="vsm-utr-section">
                    <p class="vsm-section-title">Uploader + Tag Rules</p>
                    <div class="vsm-row" style="border-bottom:none;flex-direction:column;align-items:flex-start;gap:4px;">
                        <span class="vsm-label">Tags blocked per uploader</span>
                        <span class="vsm-hint">A tag listed under an uploader hides only items uploaded by that uploader. These rules are checked after the global Tag Blacklist and the Uploader Blacklist, so a tag on the global list always applies to everyone. Separate several tags with spaces or commas. In gallery view you can also Shift+click a tag in the Tags popup.</span>
                    </div>
                    <div id="vsm-utr-container"></div>
                    <div id="vsm-utr-add-row">
                        <input type="text" id="vsm-utr-user-input" placeholder="uploader" autocomplete="off">
                        <input type="text" id="vsm-utr-tags-input" placeholder="e.g. oral  or  big.tits scat" autocomplete="off">
                        <button class="vsm-btn vsm-btn-save" id="vsm-utr-add-btn" type="button">Add</button>
                        <button class="vsm-btn vsm-btn-reset" id="vsm-utr-clear-btn" type="button">Clear all</button>
                    </div>
                </div>

            </div>
            <div class="vsm-footer">
                <div style="display:flex;align-items:center">
                    <span class="vsm-saved-msg" id="vsm-saved-msg">&#x2713; Saved &mdash; reload to apply</span>
                    <span class="vsm-footer-note">Settings are shared across all supported domains.</span>
                </div>
                <div class="vsm-footer-btns">
                    <button class="vsm-btn vsm-btn-reset" id="vsm-reset-btn">Reset defaults</button>
                    <button class="vsm-btn vsm-btn-save"  id="vsm-save-btn">Save &amp; close</button>
                </div>
            </div>
        </div>
    </div>`;

    jQuery('body').append(html);

    jQuery('#viewer-settings-backdrop').on('click', function(e) { if (e.target === this) closeOverlay(); });

    // Poster Wall settings apply immediately
    jQuery(document).on('change', '#vsm-WALL_GROUP_DUP_IMAGES', function () {
        WALL_GROUP_DUP_IMAGES = this.checked;
        GM_setValue('WALL_GROUP_DUP_IMAGES', WALL_GROUP_DUP_IMAGES);
    });
    jQuery(document).on('change', '#vsm-WALL_IDLE_CLOSE_MIN', function () {
        WALL_IDLE_CLOSE_MIN = parseInt(this.value, 10) || 0;
        GM_setValue('WALL_IDLE_CLOSE_MIN', WALL_IDLE_CLOSE_MIN);
    });
    jQuery(document).on('change', '#vsm-WALL_NOTICE_SHOW', function () {
        WALL_NOTICE_SHOW = this.checked;
        GM_setValue('WALL_NOTICE_SHOW', WALL_NOTICE_SHOW);
    });
    const addUnavail = function () {
        const urls = (jQuery('#vsm-unavail-add-input').val() || '').split(/\s+/).filter(u => /^https?:\/\//i.test(u));
        if (!urls.length) return;
        urls.forEach(u => { u = wallAbsUrl(u); if (WALL_UNAVAIL_URLS.indexOf(u) === -1) WALL_UNAVAIL_URLS.push(u); });
        jQuery('#vsm-unavail-add-input').val('');
        wallSaveUnavail();
        refreshUnavailSettingsPanel();
        wallLearnUnavail();
    };
    jQuery(document).on('click', '#vsm-unavail-add-btn', addUnavail);
    jQuery(document).on('keydown', '#vsm-unavail-add-input', function (e) { if (e.key === 'Enter') { e.preventDefault(); addUnavail(); } });
    jQuery(document).on('click', '#vsm-unavail-reset-btn', function () {
        if (!confirm('Replace the "image unavailable" examples with the built-in defaults?')) return;
        WALL_UNAVAIL_URLS = WALL_UNAVAIL_DEFAULT_URLS.slice();
        Object.keys(WALL_UNAVAIL_SIGS).forEach(u => { if (WALL_UNAVAIL_URLS.indexOf(u) === -1) delete WALL_UNAVAIL_SIGS[u]; });
        wallSaveUnavail();
        refreshUnavailSettingsPanel();
        wallLearnUnavail();
    });
    jQuery('#vsm-close-btn').on('click', closeOverlay);

    jQuery(document).on('click', '#vsm-tag-add-btn', function() {
        const val = jQuery('#vsm-tag-add-input').val().trim().toLowerCase();
        if (!val) return;
        val.split(/[\s,]+/).forEach(function(t) {
            t = t.trim();
            if (t && TAG_BLACKLIST.indexOf(t) === -1) TAG_BLACKLIST.push(t);
        });
        saveTagBlacklist();
        applyBlacklistsToPage();
        jQuery('#vsm-tag-add-input').val('');
        refreshTagSettingsPanel();
    });
    jQuery(document).on('keydown', '#vsm-tag-add-input', function(e) {
        if (e.key === 'Enter') jQuery('#vsm-tag-add-btn').trigger('click');
    });
    jQuery(document).on('click', '#vsm-tag-clear-btn', function() {
        if (!TAG_BLACKLIST.length) return;
        if (!confirm('Remove all ' + TAG_BLACKLIST.length + ' blacklisted tag(s)?')) return;
        TAG_BLACKLIST = [];
        saveTagBlacklist();
        applyBlacklistsToPage();
        refreshTagSettingsPanel();
    });

    // Uploader blacklist handlers
    // Adding opens the duration dialog; the chosen duration applies to every name entered.
    jQuery(document).on('click', '#vsm-uploader-add-btn', function() {
        const val = jQuery('#vsm-uploader-add-input').val().trim().toLowerCase();
        if (!val) return;
        const names = [];
        val.split(/[\s,]+/).forEach(function(u) {
            u = u.trim();
            if (u && u !== 'anon' && u !== 'anonymous' &&
                names.indexOf(u) === -1 && !isUploaderBlacklisted(u)) names.push(u);
        });
        if (!names.length) { jQuery('#vsm-uploader-add-input').val(''); return; }
        showBlockDurationDialog(names, function (durationMs) {
            names.forEach(n => addUploaderToBlacklist(n, durationMs));
            applyBlacklistsToPage();
            jQuery('#vsm-uploader-add-input').val('');
            refreshUploaderSettingsPanel();
        });
    });
    jQuery(document).on('keydown', '#vsm-uploader-add-input', function(e) {
        if (e.key === 'Enter') jQuery('#vsm-uploader-add-btn').trigger('click');
    });
    jQuery(document).on('click', '#vsm-uploader-clear-btn', function() {
        if (!UPLOADER_BLACKLIST.length) return;
        if (!confirm('Remove all ' + UPLOADER_BLACKLIST.length + ' blacklisted uploader(s)?')) return;
        UPLOADER_BLACKLIST = [];
        UPLOADER_BLACKLIST_EXPIRY = {};
        saveUploaderBlacklist();
        applyBlacklistsToPage();
        refreshUploaderSettingsPanel();
    });

    // Uploader + tag rule handlers
    jQuery(document).on('click', '#vsm-utr-add-btn', function() {
        const uploader = jQuery('#vsm-utr-user-input').val().trim().toLowerCase();
        const raw      = jQuery('#vsm-utr-tags-input').val().trim().toLowerCase();
        if (!uploader || !raw || uploader === 'anon' || uploader === 'anonymous') return;
        const tags = [];
        raw.split(/[\s,]+/).forEach(function (t) {
            t = t.trim();
            if (t && tags.indexOf(t) === -1) tags.push(t);
        });
        if (!tags.length) return;
        showBlockDurationDialog(tags, function (durationMs) {
            tags.forEach(t => addUploaderTagRule(uploader, t, durationMs));
            applyBlacklistsToPage();
            jQuery('#vsm-utr-tags-input').val('');
            refreshUploaderTagRulesPanel();
        }, { title: '\u26D4 Block tags for uploader', target: uploader + ': ' + tags.join(', ') });
    });
    jQuery(document).on('keydown', '#vsm-utr-user-input, #vsm-utr-tags-input', function(e) {
        if (e.key === 'Enter') jQuery('#vsm-utr-add-btn').trigger('click');
    });
    jQuery(document).on('click', '#vsm-utr-clear-btn', function() {
        const n = countUploaderTagRules();
        if (!n) return;
        if (!confirm('Remove all ' + n + ' uploader + tag rule(s)?')) return;
        UPLOADER_TAG_RULES = {};
        saveUploaderTagRules();
        applyBlacklistsToPage();
        refreshUploaderTagRulesPanel();
    });

    // Favorite tags handlers
    jQuery(document).on('click', '#vsm-fav-add-btn', function() {
        const val = jQuery('#vsm-fav-add-input').val().trim().toLowerCase();
        if (!val) return;
        val.split(/[\s,]+/).forEach(function(t) {
            t = t.trim();
            if (t) addTagToFavorites(t);
        });
        jQuery('#vsm-fav-add-input').val('');
        refreshFavoriteTagsPanel();
    });
    jQuery(document).on('keydown', '#vsm-fav-add-input', function(e) {
        if (e.key === 'Enter') jQuery('#vsm-fav-add-btn').trigger('click');
    });
    jQuery(document).on('click', '#vsm-fav-clear-btn', function() {
        if (!TAG_FAVORITES.length) return;
        if (!confirm('Remove all ' + TAG_FAVORITES.length + ' favorite tag(s)?')) return;
        TAG_FAVORITES = [];
        saveFavoriteTags();
        applyFavoriteGlowToPage();
        refreshFavoriteTagsPanel();
    });

    jQuery('#vsm-save-btn').on('click', function() {
        const prevGallery = GALLERY_VIEW_MODE;
        saveSettings();
        GALLERY_VIEW_MODE = jQuery('#vsm-GALLERY_VIEW_MODE').is(':checked');
        if (GALLERY_VIEW_MODE !== prevGallery) {
            if (GALLERY_VIEW_MODE) buildGalleryView();
            else destroyGalleryView();
        }
        closeOverlay();
        if (confirm('Settings saved!\n\nReload the page now for all changes to take effect?')) {
            location.reload();
        }
    });

    jQuery('#vsm-reset-btn').on('click', function() {
        if (!confirm('Reset all viewer settings to their defaults?')) return;
        applyDefaultsToForm();
        saveSettings();
        showSavedMsg();
    });

    jQuery(document).on('keydown.vsm', function(e) { if (e.key === 'Escape') closeOverlay(); });
}

function openOverlay()  {
    jQuery('#viewer-settings-backdrop').addClass('active');
    refreshTagSettingsPanel();
    refreshUploaderSettingsPanel();
    refreshUploaderTagRulesPanel();
    refreshFavoriteTagsPanel();
    refreshUnavailSettingsPanel();
    buildGlowSwatches();
}
function closeOverlay() { jQuery('#viewer-settings-backdrop').removeClass('active'); }

function showSavedMsg() {
    const $msg = jQuery('#vsm-saved-msg');
    $msg.addClass('visible');
    setTimeout(() => $msg.removeClass('visible'), 2500);
}

function applyDefaultsToForm() {
    jQuery('#vsm-TABLE_MAX_IMAGE_SIZE').val(DEFAULTS.TABLE_MAX_IMAGE_SIZE);
    jQuery('#vsm-SMALL_THUMBNAILS').prop('checked', DEFAULTS.SMALL_THUMBNAILS);
    jQuery('#vsm-ENABLE_WIDER_TABLE_VIEW').prop('checked', DEFAULTS.ENABLE_WIDER_TABLE_VIEW);
    jQuery('#vsm-REMOVE_CATEGORIES').prop('checked', DEFAULTS.REMOVE_CATEGORIES);
    jQuery('#vsm-TRIM_TEXT_COLLAGE_PAGE_MODE').val(DEFAULTS.TRIM_TEXT_COLLAGE_PAGE_MODE);
    jQuery('#vsm-FIT_VERTICAL_IMAGES_GRID_BETTER').val(DEFAULTS.FIT_VERTICAL_IMAGES_GRID_BETTER);
    jQuery('#vsm-REMOVE_MAIN_IMAGES_COLLAGE_PAGE').prop('checked', DEFAULTS.REMOVE_MAIN_IMAGES_COLLAGE_PAGE);
    jQuery('#vsm-IMAGE_LOAD_MODE').val(DEFAULTS.IMAGE_LOAD_MODE);
    jQuery('#vsm-GALLERY_VIEW_MODE').prop('checked', DEFAULTS.GALLERY_VIEW_MODE);
    jQuery('#vsm-GRID_DARK_MODE').prop('checked', DEFAULTS.GRID_DARK_MODE);
    jQuery('#vsm-GALLERY_CARD_MIN_WIDTH').val(DEFAULTS.GALLERY_CARD_MIN_WIDTH);
}

function saveSettings() {
    GM_setValue('TABLE_MAX_IMAGE_SIZE',            parseInt(jQuery('#vsm-TABLE_MAX_IMAGE_SIZE').val(), 10) || DEFAULTS.TABLE_MAX_IMAGE_SIZE);
    GM_setValue('SMALL_THUMBNAILS',                jQuery('#vsm-SMALL_THUMBNAILS').is(':checked'));
    GM_setValue('ENABLE_WIDER_TABLE_VIEW',         jQuery('#vsm-ENABLE_WIDER_TABLE_VIEW').is(':checked'));
    GM_setValue('REMOVE_CATEGORIES',               jQuery('#vsm-REMOVE_CATEGORIES').is(':checked'));
    GM_setValue('TRIM_TEXT_COLLAGE_PAGE_MODE',     jQuery('#vsm-TRIM_TEXT_COLLAGE_PAGE_MODE').val());
    GM_setValue('FIT_VERTICAL_IMAGES_GRID_BETTER', jQuery('#vsm-FIT_VERTICAL_IMAGES_GRID_BETTER').val());
    GM_setValue('REMOVE_MAIN_IMAGES_COLLAGE_PAGE', jQuery('#vsm-REMOVE_MAIN_IMAGES_COLLAGE_PAGE').is(':checked'));
    GM_setValue('IMAGE_LOAD_MODE',                 jQuery('#vsm-IMAGE_LOAD_MODE').val());
    GM_setValue('GALLERY_VIEW_MODE',               jQuery('#vsm-GALLERY_VIEW_MODE').is(':checked'));
    GM_setValue('GRID_DARK_MODE',                  jQuery('#vsm-GRID_DARK_MODE').is(':checked'));
    GM_setValue('GALLERY_CARD_MIN_WIDTH',          parseInt(jQuery('#vsm-GALLERY_CARD_MIN_WIDTH').val(), 10) || DEFAULTS.GALLERY_CARD_MIN_WIDTH);
    // Tag click action — saved immediately on change but also here for consistency
    TAG_CLICK_ACTION = jQuery('#vsm-TAG_CLICK_ACTION').val() || 'blacklist';
    GM_setValue('TAG_CLICK_ACTION', TAG_CLICK_ACTION);
}

// --------------------
// NAV BUTTON INJECTION
// --------------------
function injectNavButton() {
    const $majorStats = jQuery('#major_stats');
    if (!$majorStats.length) return;

    const isCollagePage = location.pathname.includes('/collage');

    const $settingsLi = jQuery(`
        <li id="nav_viewer_settings" class="brackets">
            <a href="javascript:void(0)" id="viewer-settings-open-btn" title="EMP/HF Viewer Settings">
                <span class="viewer-gear-icon">&#9881;</span>Viewer
            </a>
        </li>
    `);

    const $ul  = jQuery('<ul>').append($settingsLi);
    const $div = jQuery('<div id="viewer_settings_nav_wrap">').append($ul);

    if (!isCollagePage) {
        const $galleryLi = jQuery(`
            <li id="nav_gallery_toggle" class="brackets">
                <a href="javascript:void(0)" id="gallery-toggle-btn"
                   title="${GALLERY_VIEW_MODE ? 'Switch to table view' : 'Switch to grid view'}">
                    <span class="viewer-gear-icon">${GALLERY_VIEW_MODE ? '&#9776;' : '&#10697;'}</span>${GALLERY_VIEW_MODE ? 'List' : 'Grid'}
                </a>
            </li>
        `);
        $ul.prepend($galleryLi);
        jQuery(document).on('click', '#gallery-toggle-btn', toggleGalleryMode);
    }

    // Poster Wall: torrent listings only (not collages / requests)
    if (!isCollagePage && !location.pathname.includes('/requests')) {
        const $wallLi = jQuery(`
            <li id="nav_poster_wall" class="brackets">
                <a href="javascript:void(0)" id="poster-wall-open-btn" title="Full-screen endless poster wall">
                    <span class="viewer-gear-icon">&#9638;</span>Wall
                </a>
            </li>
        `);
        $settingsLi.before($wallLi);
        jQuery(document).on('click', '#poster-wall-open-btn', openPosterWall);
    }

    $majorStats.before($div);
    jQuery('#viewer-settings-open-btn').on('click', openOverlay);
}
