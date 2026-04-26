// ==UserScript==
// @name        EMP/HF Proper Advanced Viewer
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
// @include     /https?://emparadise\.(rs|sx)/torrents\.php.*/
// @exclude     /https?://emparadise\.(rs|sx)/torrents\.php\?id.*/
// @include     /https?://emparadise\.(rs|sx)/user\.php.*/
// @include     /https?://emparadise\.(rs|sx)/top10\.php.*/
// @include     /https?://emparadise\.(rs|sx)/collage*/
// @include     /https?://emparadise\.(rs|sx)/requests*/
// @exclude     /https?://emparadise\.(rs|sx)/requests\.php\?id.*/
// @include     /https?://emparadise\.(rs|sx)/userhistory\.php.*/
// @include     /https?://www\.happyfappy\.(org|net)/torrents\.php.*/
// @exclude     /https?://www\.happyfappy\.(org|net)/torrents\.php\?id.*/
// @include     /https?://www\.happyfappy\.(org|net)/user\.php.*/
// @include     /https?://www\.happyfappy\.(org|net)/top10\.php.*/
// @include     /https?://www\.happyfappy\.(org|net)/collage*/
// @include     /https?://www\.happyfappy\.(org|net)/requests*/
// @exclude     /https?://www\.happyfappy\.(org|net)/requests\.php\?id.*/
// @include     /https?://www\.happyfappy\.(org|net)/userhistory\.php.*/
// @version     2.0
// @author      edstagdh + Other contributors
// @icon        https://www.google.com/s2/favicons?sz=64&domain=www.empornium.sx
// @icon        https://www.google.com/s2/favicons?sz=64&domain=www.happyfappy.net
// @require     https://code.jquery.com/jquery-2.1.1.js
// @updateURL   https://raw.githubusercontent.com/edstagdh/Userscripts/master/EMP_HF/.emp_hf_proper_advanced_viewer.js
// @grant       GM_addStyle
// ==/UserScript==

// CHANGELOG:
// v2.0:
// -added emparadise domain
// v1.9:
// -Fixed Notifications & Subscribed collages pages, thumbnails are now also hyper links to torrents.
// -Removed categories from Subscribed collages page("userhistory.php?action=subscribed_collages"), since the categories are not exposed in this page.
// v1.8:
// -Fixed some EMP categories links(spelled different in some pages ¯\_(ツ)_/¯)
// -Fixed top10 page and collage page for hover image preview in torrent list
// -Added better grid options in collage page, see config below - "COLLAGE PAGE CONFIG"
// -split EMP/HF categories links maps.
// v1.7:
// -added wider table view configurable.
// v1.6:
// -removed head requests and changed handling of image requests, this should fix caching issues
// -added HF domains
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
const ENABLE_WIDER_TABLE_VIEW = true;

// --------------------
// COLLAGE PAGE CONFIG - by default shows full image contained not overflow regardless of images being removed or text being modified.
// --------------------
// TRIM TEXT MODE
// --------------------
// "small_text"         → just makes the text small
// "smaller_text"       → just makes the text smaller
// "small_text_wrap"    → makes the text small and wrap text
// "smaller_text_wrap"  → makes the text smaller and wrap text
// "nothing"            → keeps the original behavior
const TRIM_TEXT_COLLAGE_PAGE_MODE = "smaller_text_wrap";
const REMOVE_MAIN_IMAGES_COLLAGE_PAGE = false;
// --------------------
// FIT VERTICAL IMAGES MODE
// --------------------
// "half"     → attempt to fit the image at half width
// "full"     → attempt to fit the image at full width
// "nothing"  → keeps the original behavior
const FIT_VERTICAL_IMAGES_GRID_BETTER = "half";

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
// ADDITIONAL CSS INJECTION
// --------------------
if (ENABLE_WIDER_TABLE_VIEW) {
    GM_addStyle(`
        #content {
            width: 99%;
            max-width: 1500px;
        }
    `);
}


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
const EMPcategoryMap = {
    1: ["amateur"],
    2: ["anal"],
    5: ["asian"],
    6: ["bbw"],
    30: ["bdsm"],
    36: ["big.ass", "big-ass"],
    8: ["big.tits", "big-tits"],
    7: ["black"],
    9: ["classic"],
    37: ["creampie"],
    10: ["cumshot"],
    11: ["dvdr"],
    12: ["fetish"],
    14: ["orgy", "gangbang"],
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
    40: ["mega.pack", "megapack"],
    41: ["natural.tits", "natural-tits"],
    17: ["oral"],
    29: ["other"],
    47: ["parody"],
    24: ["paysite"],
    21: ["images", "pictures"],
    50: ["piss"],
    55: ["porn.music.video", "music-video"],
    46: ["pregnant"],
    51: ["scat"],
    22: ["siterip"],
    20: ["softcore"],
    49: ["squirting"],
    34: ["straight"],
    19: ["teen"],
    15: ["transgender", "shemale"],
    45: ["voyeur"],
    13: ["games.apps", "xxx_games", "xxx-games"]
    // you can expand this array with multiple alternative names per category
};
const HFcategoryMap = {
    15: ["ai"],
    11: ["asian"],
    6: ["fansite"],
    13: ["games"],
    3: ["gay"],
    4: ["interracial"],
    5: ["lesbian"],
    9: ["packs"],
    10: ["pics"],
    1: ["pron"],
    8: ["retro"],
    14: ["scat"],
    12: ["transexual", "trans"],
    7: ["vr"],

    // you can expand this array with multiple alternative names per category
};

// --------------------
// SELECT CATEGORY MAP BASED ON URL
// --------------------
let currentCategoryMap = EMPcategoryMap; // default

if (location.href.includes("empornium")) {
    currentCategoryMap = EMPcategoryMap; // you need to define EMPcategoryMap1
} else if (location.href.includes("happyfappy")) {
    currentCategoryMap = HFcategoryMap; // define EMPcategoryMap2
}

// --------------------
// HELPER FUNCTION TO GET CATEGORY LINK
// --------------------
function getCategoryLink(catName, categoryMap = currentCategoryMap) {
    catName = catName.toLowerCase().trim(); // normalize

    for (const catID in categoryMap) {
        const names = categoryMap[catID];
        if (names.some(name => name.toLowerCase() === catName)) {
            return `/torrents.php?filter_cat[${catID}]=1`;
        }
    }

    return '/torrents.php'; // fallback
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
                if (!(location.pathname === "/userhistory.php" && new URLSearchParams(location.search).get("action") === "subscribed_collages")) {
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
                    if (isCollage || (location.pathname === "/torrents.php" && new URLSearchParams(location.search).get("action") === "notify")){
                        let $catImg = $category.children('img').filter((i, el) => /cat_.*\.png$/.test(el.src));
                        if ($catImg.length) {
                            const match = $catImg.attr('src').match(/cat_(.+)\.png$/);
                            if (match) catName = match[1];
                            $catImg.remove();
                        }
                    }
                }
            }
            // console.log(`${LOG_PREFIX} Category Name: ${catName}`);
            let $titleLink = ''
            // wrap thumbnail in <a> if a link exists (torrents page link)
            if (location.pathname.includes("requests.php")) {
                $titleLink = $row.find('td').eq(1).find('a[href*="requests.php?action=view&id="]').first();
            }
            else if (isCollage) {
                $titleLink = $row.find('td').eq(1).find('a[href*="torrents.php?id="]').first();
            }
            else if (location.pathname === "/userhistory.php" && new URLSearchParams(location.search).get("action") === "subscribed_collages") {
                $titleLink = $row.find('td').eq(2).find('a[href*="torrents.php?id="]').first();
            }
            else if (location.pathname === "/torrents.php" && new URLSearchParams(location.search).get("action") === "notify") {
                $titleLink = $row.find('td').eq(2).find('a[href*="torrents.php?id="]').first();
            } else
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

            // Add OVERLIB events to thumbnail
            let $textLink = null;

            if (isCollage) {
                // On collage or top10 or userhistory pages, enforce hover from title link
                $textLink = $row.find('td').eq(1).find('a[onmouseover]').first();
            } else if (location.pathname === "/torrents.php" && new URLSearchParams(location.search).get("action") === "notify") {
                $textLink = $row.find('td').eq(2).find('a[onmouseover]').first();
            } else if (location.pathname.includes("/top10")) {
                $textLink = $row.find('td').eq(2).find('a[onmouseover]').first();
            } else if (location.pathname.includes("/requests.php")) {
                $textLink = $row.find('td').eq(1).find('a[onmouseover]').first();
            } else if (location.pathname.includes("/userhistory.php")) {
                $textLink = $row.find('td').eq(2).find('a[onmouseover]').first();
            } else {
                $textLink = $row.find('td').eq(1).find('a[onmouseover]').first();
            }


            if ($textLink && $textLink.length) {
                const mouseOverCode = $textLink.attr('onmouseover');
                const mouseOutCode  = $textLink.attr('onmouseout');

                if (mouseOverCode) $thumbnail.attr('onmouseover', mouseOverCode);
                if (mouseOutCode)  $thumbnail.attr('onmouseout', mouseOutCode);
            }

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
                if (path.includes('/collage') || path.includes('/top10') || path.includes('/userhistory') ||
                    (location.pathname === "/torrents.php" &&
                     new URLSearchParams(location.search).get("action") === "notify")
                   ) {
                    // extract category ID from original href if possible
                    catHref = getCategoryLink(catName, currentCategoryMap); // instead of relying on existing href
                    console.log(`${LOG_PREFIX} Generated category link for '${catName}': ${catHref}`);
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

    this.show_img = function ($img) {
        const src = $img.data('src');
        if (!src) return;

        $img
            .one('error', function () {
            this.src = '/static/common/noartwork/noimage.png';
        })
            .prop('src', src)
            .css({
            'min-width': '',
            'min-height': ''
        });
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

    if (isCollage) {
        jQuery('.torrent_grid__torrent').each(function() {
            const $torrentDiv = jQuery(this);

            // Remove the cover image div
            if (REMOVE_MAIN_IMAGES_COLLAGE_PAGE) {
                $torrentDiv.find('.torrent__cover').remove();

                // Wait a tick, then update the svg
                setTimeout(() => {
                    $torrentDiv.find('svg').each(function () {
                        this.setAttribute('viewBox', '0 0 1.5 1');
                    });
                }, 0);
            }
            else {
                // Update the CSS for all torrent__cover divs on collage page
                image_css = `
                    .torrent__cover {
                        background-size: contain !important;  /* show full image */
                        background-repeat: no-repeat !important;
                        background-position: center 30px !important;
                `
                image_css += `}`;
                GM_addStyle(image_css);

                // Wait a tick, then update the svg
                if (FIT_VERTICAL_IMAGES_GRID_BETTER == "half") {
                    setTimeout(() => {
                        $torrentDiv.find('svg').each(function () {
                            this.setAttribute('viewBox', '0 0 0.75 1');
                        });
                    }, 0);
                }
                else if (FIT_VERTICAL_IMAGES_GRID_BETTER === "full") {
                    setTimeout(() => {
                        $torrentDiv.find('svg').each(function () {
                            this.setAttribute('viewBox', '0 0 0.5 1');
                        });
                    }, 0);
                }
            }

            // Untrim the title and apply word-wrap & smaller font
            if (TRIM_TEXT_COLLAGE_PAGE_MODE=== "small_text_wrap") {
                $torrentDiv.find('h3.trim').each(function() {
                    const $h3 = jQuery(this);
                    $h3.removeClass('trim');
                    $h3.css({
                        'white-space': 'normal',   // allow wrapping
                        'overflow': 'visible',     // no cutting
                        'text-overflow': 'clip',   // remove ellipsis
                        'font-size': '13px',       // smaller font
                        'line-height': '1.2',      // tighter spacing
                        'word-break': 'break-word' // wrap long words
                    });
                });
            }
            else if (TRIM_TEXT_COLLAGE_PAGE_MODE=== "smaller_text_wrap") {
                $torrentDiv.find('h3.trim').each(function() {
                    const $h3 = jQuery(this);
                    $h3.removeClass('trim');
                    $h3.css({
                        'white-space': 'normal',   // allow wrapping
                        'overflow': 'visible',     // no cutting
                        'text-overflow': 'clip',   // remove ellipsis
                        'font-size': '10px',       // smaller font
                        'line-height': '1.0',      // tighter spacing
                        'word-break': 'break-word' // wrap long words
                    });
                });
            }
            else if (TRIM_TEXT_COLLAGE_PAGE_MODE=== "small_text") {
                $torrentDiv.find('h3.trim').each(function() {
                    const $h3 = jQuery(this);
                    $h3.css({
                        'font-size': '13px',       // smaller font
                        'line-height': '1.2',      // tighter spacing
                    });
                });
            }
            else if (TRIM_TEXT_COLLAGE_PAGE_MODE=== "smaller_text") {
                $torrentDiv.find('h3.trim').each(function() {
                    const $h3 = jQuery(this);
                    $h3.css({
                        'font-size': '10px',       // smaller font
                        'line-height': '1.0',      // tighter spacing
                    });
                });
            }
        });
    }
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
