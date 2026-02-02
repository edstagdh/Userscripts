// ==UserScript==
// @name        EMP Proper Advanced Viewer
// @description this script provides better browsing experience using images from torrents/requests.
// @namespace   tampermonkey
// @include     /https?://www\.empornium\.(is|sx)/torrents\.php.*/
// @exclude     /https?://www\.empornium\.(is|sx)/torrents\.php\?id.*/
// @include     /https?://www\.empornium\.(is|sx)/user\.php.*/
// @include     /https?://www\.empornium\.(is|sx)/top10\.php.*/
// @include     /https?://www\.empornium\.(is|sx)/collage*/
// @include     /https?://www\.empornium\.(is|sx)/requests*/
// @exclude     /https?://www\.empornium\.(is|sx)/requests\.php\?id.*/
// @include     /https?://www\.empornium\.(is|sx)/userhistory\.php.*/
// @version     1.5
// @author      edstagdh + Other contributors
// @icon        https://www.google.com/s2/favicons?sz=64&domain=empornium.is
// @require     https://code.jquery.com/jquery-2.1.1.js
// @updateURL   https://raw.githubusercontent.com/edstagdh/Userscripts/heads/master/EMP/.emp_proper_advanced_viewer.js
// @grant       GM_addStyle
// ==/UserScript==

// CHANGELOG:
// v1.5:
// -added lazy-load options, see below config - IMAGE_LOAD_MODE
// v1.4:
// -added overlib popup for the thumbnail
// -added category overlay hyperlink support.
// v1.3:
// -added 'userhistory' page support.
// -fixed remove_categories option.
// -removed replace_categories option.
// v1.2:
// -fixed requests image preview url
// v1.1:
// -added better lazy-load to images loading.


"use strict";

this.$ = this.jQuery = jQuery.noConflict(true);

const LOG_PREFIX = '[TM]';

// --------------------
// CONFIG - DO NOT CHANGE
// --------------------
const TABLE_MAX_IMAGE_SIZE = 250;
const REMOVE_CATEGORIES = false;
const SMALL_THUMBNAILS = true;

// --------------------
// LAZY LOAD MODE
// --------------------
// "lazy"      → load when visible
// "near"      → load ~1–2 screens away
// "disabled"  → load immediately
const IMAGE_LOAD_MODE = "near";

// --------------------
// CSS
// --------------------
GM_addStyle(`
.small-category { vertical-align: top !important; }
.overlay-category td > div[title],
.overlay-category .cats_col > div,
.overlay-category .cats_cols > div { position: absolute; overflow: hidden; }
.overlay-category-small td > div[title],
.overlay-category-small .cats_col > div,
.overlay-category-small .cats_cols > div { width: 11px; }
.remove-category td > div[title],
.remove-category .cats_col > div,
.remove-category .cats_cols > div { display: none; }

.category-overlay-wrapper {
    position: absolute;
    left: 0;
    top: 0;
    width: 50px;
    height: 100%;
    overflow: hidden;
    z-index: 2;
}
.category-overlay-wrapper img {
    display: block;
    max-width: none !important;
    max-height: none !important;
}
.center, .cats_col {
    position: relative;
}
`);

// --------------------
// HELPERS
// --------------------
function disable_images(html) { return html.replace(/ src=/g, ' data-src='); }

// --------------------
// COLLAGE PAGE HELPERS
// --------------------
function get_collage_category($row) { return $row.find('td.center'); }
function get_collage_title($row) { return $row.find('td').eq(1); }

// --------------------
// TORRENTS PAGE HELPERS
// --------------------
function get_torrent_category($row) { return $row.find('td').eq(0); }
function get_torrent_title($row) { return $row.find('td').eq(1); }

// --------------------
// CATEGORY MAPPING
// --------------------
const categoryMap = {
    1: ["amateur"],
    2: ["anal"],
    5: ["asian"],
    6: ["bbw"],
    30: ["bdsm"],
    36: ["big.ass"],
    8: ["big.tits"],
    7: ["black"],
    9: ["classic"],
    37: ["creampie"],
    10: ["cumshot"],
    11: ["dvdr"],
    12: ["fetish"],
    14: ["orgy"],
    39: ["gay"],
    56: ["hairy"],
    35: ["hardcore"],
    44: ["hd"],
    3: ["hentai"],
    25: ["homemade"],
    43: ["interracial"],
    16: ["latina"],
    23: ["lesbian"],
    52: ["lingerie"],
    27: ["magazines"],
    53: ["comic"],
    18: ["masturbation"],
    26: ["mature"],
    40: ["mega.pack"],
    41: ["natural.tits"],
    17: ["oral"],
    29: ["other"],
    47: ["oarody"],
    24: ["oaysite"],
    21: ["images"],
    50: ["piss"],
    55: ["porn.music.video"],
    46: ["pregnant"],
    51: ["scat"],
    22: ["siterip"],
    20: ["softcore"],
    49: ["squirting"],
    34: ["straight"],
    19: ["teen"],
    15: ["transgender"],
    45: ["voyeur"],
    13: ["games.apps"]
    // you can expand this array with multiple alternative names per category
};

// --------------------
// HELPER FUNCTION TO GET CATEGORY LINK
// --------------------
function getCategoryLink(catName) {
    catName = catName.toLowerCase().trim(); // normalize

    for (const catID in categoryMap) {
        const names = categoryMap[catID];
        if (names.some(name => name.toLowerCase() === catName)) {
            return `/torrents.php?filter_cat[${catID}]=1`;
        }
    }

    // fallback if no match
    return '/torrents.php';
}

// --------------------
// BACKEND (table thumbnails only)
// --------------------
function TableThumbnailBackend(isCollage, remove_categories) {
    this.isCollage = isCollage;
    this.remove_categories = remove_categories

    this.get_image_src = function ($row) {
        try {
            const scriptText = $row.find('script').text().trim();
            if (!scriptText) {
                // No script → definitely no image
                return "/static/common/noartwork/noimage.png";
            }

            const match = scriptText.match(/var\s+overlay\d+\s*=\s*"(.*)"/);
            if (!match || match.length < 2) {
                // Script exists but no overlay variable → no image
                return "/static/common/noartwork/noimage.png";
            }

            let html = match[1]
            .replace(/\\\//g, '/')
            .replace(/\\"/g, '"');

            const safe_html = disable_images(html);

            // Try normal extraction
            let src = jQuery('img', safe_html).data('src');

            // If empty/null/undefined → fallback
            if (!src) {
                src = "/static/common/noartwork/noimage.png";
            }

            return src;
        } catch (e) {
            console.error(`${LOG_PREFIX} get_image_src error:`, e, $row);

            // Even on error, return a safe fallback
            return "/static/common/noartwork/noimage.png";
        }
    };


    this.attach_image = function ($row, $img) {
        try {
            const $category = $row.find('td.center, td.cats_col').first();
            if (!$category.length) {
                console.error(`${LOG_PREFIX} category row is missing`, $row);
                return;
            }

            // --- Ensure site CSS (cats_col / overlay-category) doesn't clip the overlay ---
            // Only modify non-collage pages (torrents/top10). For collage we keep original behavior.
            if (!isCollage) {
                // remove known classes that add small widths / clipping
                $category.removeClass('cats_col overlay-category overlay-category-small');

                // force the cell to allow overflow & wrapping so the overlay is visible
                $category.css({
                    'overflow': 'visible',
                    'white-space': 'normal',
                    'padding-left': '',    // unset any left padding that might push things
                    'position': 'relative' // ensure positioning for absolute overlay
                });
            }


            // --------------------
            // EXTRACT CATEGORY NAME AND REMOVE OLD CATEGORY
            // --------------------
            let catName = '';
            // If user wants categories removed → wipe all category elements and skip extraction
            if (this.remove_categories) {
                // remove <img> categories
                $category.find('img[src*="cat_"]').remove();

                // remove <div title> categories
                $category.find('div[title]').remove();

                // no overlay
                catName = '';
            }
            else {
                // Extract category name from div[title] only
                let $div = $category.find('div[title]').first();
                if ($div.length) {
                    // Use the div's title as the category name
                    catName = $div.attr('title') || '';

                    // Remove any <img> inside the div (still removing the icon)
                    $div.find('img').remove();

                    // Remove wrapper div if empty
                    if ($div.children().length === 0) $div.remove();
                }
                if (isCollage) {
                    let $catImg = $category.children('img').filter((i, el) => /cat_.*\.png$/.test(el.src));
                    if ($catImg.length) {
                        const match = $catImg.attr('src').match(/cat_(.+)\.png$/);
                        if (match) catName = match[1];
                        $catImg.remove();
                    }
                }
            }
            let $titleLink = ''
            // wrap thumbnail in <a> if a link exists (torrents page link)
            if (location.pathname.includes("requests.php")) {
                $titleLink = $row.find('td').eq(1).find('a[href*="requests.php?action=view&id="]').first();
            }
            else
            {
                $titleLink = $row.find('td').eq(1).find('a[href*="torrents.php?id="]').first();
            }
            let $thumbnail = $img;
            if ($titleLink.length) {
                const href = $titleLink.attr('href');
                const $a = jQuery('<a>').attr('href', href).attr('target', '_blank');
                $a.append($img);
                $thumbnail = $a;
            }

            // ADD OVERLIB EVENTS TO THUMBNAIL
            const $textLink = $row.find('td').eq(1).find('a[onmouseover]').first();
            if ($textLink.length) {
                const mouseOverCode = $textLink.attr('onmouseover');
                const mouseOutCode  = $textLink.attr('onmouseout');

                if (mouseOverCode) $thumbnail.attr('onmouseover', mouseOverCode);
                if (mouseOutCode)  $thumbnail.attr('onmouseout', mouseOutCode);
            }

            // insert thumbnail first
            $category.prepend($thumbnail);
            $thumbnail.css({
                'display': 'block',
                'margin': '0 auto 5px',
                'max-width': TABLE_MAX_IMAGE_SIZE + 'px',
                'max-height': TABLE_MAX_IMAGE_SIZE + 'px',
                'position': 'relative',
                'z-index': 1
            });

            // Add text overlay with category name
            if (catName) {
                const overlayText = String(catName).replace(/\./g, ' ').toUpperCase().trim();

                let catHref = '#'; // default fallback

                // Find the category link on normal pages
                const $catDiv = $category.find('div[title]').first();
                if ($catDiv.length) {
                    const $catLink = $catDiv.find('a[href]').first();
                    if ($catLink.length) catHref = $catLink.attr('href');
                }

                // --- EXCEPTIONS FOR COLLAGE / TOP10 / USERHISTORY ---
                const path = location.pathname;
                if (path.includes('/collage') || path.includes('/top10') || path.includes('/userhistory')) {
                    // extract category ID from original href if possible
                    catHref = getCategoryLink(catName); // instead of relying on existing href
                    // console.log(`${LOG_PREFIX} Generated category link for '${catName}': ${catHref}`);
                }

                // create the overlay link
                const $link = jQuery('<a>')
                .text(overlayText)
                .attr('href', catHref)
                .css({
                    'color': 'white',
                    'text-decoration': 'none'
                });

                const $overlay = jQuery('<div>')
                .css({
                    'position': 'absolute',
                    'top': '5px',
                    'left': '5px',
                    'padding': '2px 6px',
                    'background': 'rgba(0,0,0,0.65)',
                    'color': 'white',
                    'font-size': '12px',
                    'font-weight': '700',
                    'line-height': '1.1',
                    'border-radius': '3px',
                    'z-index': 9999,
                    'pointer-events': 'auto',
                    'white-space': 'normal',
                    'max-width': (TABLE_MAX_IMAGE_SIZE - 20) + 'px',
                    'box-sizing': 'border-box'
                })
                .append($link);

                $category.css('position',
                              $category.css('position') === 'static'
                              ? 'relative'
                              : $category.css('position')
                             );

                $category.append($overlay);
            }

            // COLLAGE title fix
            if (isCollage) {
                const $title = get_collage_title($row);
                if ($title.length) $title.css({ 'vertical-align': 'top' });
            }
        } catch (e) {
            console.error(`${LOG_PREFIX} attach_image error:`, e, $row, $img);
        }
    };

}

// --------------------
// LAZY THUMBNAILS
// --------------------
function LazyThumbnails(progress, backend, small_thumbnails, remove_categories, max_image_size) {
    const self = this;
    this.$torrent_table = null;
    this.images = [];
    this.attach_image = backend.attach_image;
    this.get_image_src = backend.get_image_src;
    this.image_index = 0;
    this.preload_ratio = 0.8;
    this.isCollage = backend.isCollage;
    this.remove_categories = backend.remove_categories

    this.create_img = function (src, small) {
        if (!src) return null;
        return jQuery('<img>').data('src', src).css({
            'min-width': small ? '50px' : max_image_size + 'px',
            'min-height': small ? '50px' : max_image_size + 'px',
            'max-width': max_image_size + 'px',
            'max-height': max_image_size + 'px',
        });
    };

    this.show_img = async function ($img) {
        try {
            const src = $img.data('src');
            if (!src) return;

            let isImage = src.match(/\.(jpg|jpeg|png|gif|webp)$/i);

            if (!isImage) {
                try {
                    const response = await fetch(src, { method: 'HEAD' });
                    const contentType = response.headers.get('Content-Type') || '';
                    isImage = contentType.startsWith('image/');
                } catch {
                    isImage = false;
                }
            }

            // If NOT an image → replace src with fallback
            if (!isImage) {
                $img.prop('src', '/static/common/noartwork/noimage.png')
                    .css({ 'min-width': '', 'min-height': '' });
                return;
            }

            // Valid image → load normally
            $img.prop('src', src).css({ 'min-width': '', 'min-height': '' });

        } catch (e) {
            // On error → fallback image instead of removing
            $img.prop('src', '/static/common/noartwork/noimage.png')
                .css({ 'min-width': '', 'min-height': '' });
        }
    };

    this.fix_title = function ($row) {
        const $title = self.isCollage ? get_collage_title($row) : get_torrent_title($row);
        $title.css({ 'vertical-align': 'top' });
    };

    this.visible_area = function () { const w = jQuery(window); return [w.scrollTop(), w.height()]; };

    let observerOptions = null;

    if (IMAGE_LOAD_MODE === "lazy") {
        observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        };
    }
    else if (IMAGE_LOAD_MODE === "near") {
        observerOptions = {
            root: null,
            rootMargin: '150% 0px', // ~1–2 screens away
            threshold: 0.01
        };
    }

    // create observer only if needed
    this.lazyObserver = observerOptions
        ? new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const $img = jQuery(entry.target);
                self.show_img($img);
                self.lazyObserver.unobserve(entry.target);
            }
        });
    }, observerOptions)
    : null;


    this.attach_thumbnails_init = function () {
        try {
            if (location.pathname.includes("requests.php")) {
                self.$torrent_table = jQuery('#request_table, .request_table');
                self.row_selector = 'tr.rowa, tr.rowb';
                initThumbnails();
            } else {
                self.$torrent_table = jQuery('.torrent_table');
                self.row_selector = 'tr.torrent';
                initThumbnails();
            }

            function initThumbnails() {
                if (!self.$torrent_table.length) return;

                const interval = setInterval(() => {
                    let newRowsProcessed = false;
                    self.$torrent_table.find(self.row_selector).each(function () {
                        const $row = jQuery(this);
                        if ($row.data('thumbnail-attached')) return;

                        const src = self.get_image_src($row);
                        if (!src) return;

                        const $img = self.create_img(src, small_thumbnails);
                        if ($img) {
                            self.attach_image($row, $img);

                            if (IMAGE_LOAD_MODE === "disabled") {
                                // load immediately
                                self.show_img($img);
                            } else {
                                // lazy or near
                                self.lazyObserver.observe($img[0]);
                            }
                        }
                        self.fix_title($row);
                        $row.data('thumbnail-attached', true);
                        newRowsProcessed = true;
                    });
                    if (!self.$torrent_table.find(self.row_selector + ':not([data-thumbnail-attached])').length) {
                        clearInterval(interval);
                    }
                }, 200);

            }
        } catch (e) { console.error(`${LOG_PREFIX} attach_thumbnails_init error:`, e); }
    };

    this.attach_thumbnails_init();
}

// --------------------
// INIT
// --------------------
(function init() {
    const isCollage = location.pathname.includes("/collage");
    const backend = new TableThumbnailBackend(isCollage, REMOVE_CATEGORIES);
    window.lazyThumbsInstance = new LazyThumbnails(null, backend, SMALL_THUMBNAILS, REMOVE_CATEGORIES, TABLE_MAX_IMAGE_SIZE);
})();


// --------------------
// OVERLIB POPUP FIX WITH MAX HEIGHT
// --------------------
(function() {
    let mouseX = 0, mouseY = 0;
    document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

    function clampPopup() {
        const outer = document.getElementById('overDiv');
        if (!outer) return;

        const rect = outer.getBoundingClientRect();
        const pad = 10;
        let left = mouseX + 10;
        let top = mouseY + 10;

        if (left + rect.width + pad > window.innerWidth) left = Math.max(pad, window.innerWidth - rect.width - pad);
        if (left < pad) left = pad;
        if (top + rect.height + pad > window.innerHeight) top = Math.max(pad, window.innerHeight - rect.height - pad);
        if (top < pad) top = pad;

        outer.style.position = 'fixed';
        outer.style.left = left + 'px';
        outer.style.top = top + 'px';

        const img = outer.querySelector('img');
        if (img) {
            img.style.setProperty('max-width', '500px', 'important');
            img.style.setProperty('max-height', '500px', 'important');
            img.style.width = 'auto';
            img.style.height = 'auto';
        }
    }

    const obs = new MutationObserver(() => { requestAnimationFrame(clampPopup); });
    function waitForOverDiv() {
        const outer = document.getElementById('overDiv');
        if (!outer) return requestAnimationFrame(waitForOverDiv);
        obs.observe(outer, { childList: true, subtree: true, attributes: true });
    }
    waitForOverDiv();
})();
