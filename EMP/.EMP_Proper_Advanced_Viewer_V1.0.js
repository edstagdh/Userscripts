// ==UserScript==
// @name        EMP_HF — Proper Advanced Viewer
// @description this script provides better browsing experience using images from torrents/requests.
// @namespace   tampermonkey
// @include     /https?://www\.empornium\.(is|sx)/torrents\.php.*/
// @exclude     /https?://www\.empornium\.(is|sx)/torrents\.php\?id.*/
// @include     /https?://www\.empornium\.(is|sx)/user\.php.*/
// @include     /https?://www\.empornium\.(is|sx)/top10\.php.*/
// @include     /https?://www\.empornium\.(is|sx)/collage*/
// @include     /https?://www\.empornium\.(is|sx)/requests*/
// @exclude     /https?://www\.empornium\.(is|sx)/requests\.php\?id.*/
// @include     /https?://www\.happyfappy\.(org)/torrents\.php.*/
// @exclude     /https?://www\.happyfappy\.(org)/torrents\.php\?id.*/
// @include     /https?://www\.happyfappy\.(org)/user\.php.*/
// @include     /https?://www\.happyfappy\.(org)/top10\.php.*/
// @include     /https?://www\.happyfappy\.(org)/collage*/
// @include     /https?://www\.happyfappy\.(org)/requests*/
// @exclude     /https?://www\.happyfappy\.(org)/requests\.php\?id.*/
// @version     1.1
// @icon        https://www.google.com/s2/favicons?sz=64&domain=empornium.is
// @require     https://code.jquery.com/jquery-2.1.1.js
// @updateURL   https://raw.githubusercontent.com/edstagdh/Userscripts/heads/master/EMP/.EMP_Proper_Advanced_Viewer_V1.0.js
// @grant       GM_addStyle
// ==/UserScript==

// CHANGELOG:
// v1.1:
// -added better lazy-load to images loading.


"use strict";

this.$ = this.jQuery = jQuery.noConflict(true);

const LOG_PREFIX = '[TM]';

// --------------------
// CONFIG - DO NOT CHANGE
// --------------------
const TABLE_MAX_IMAGE_SIZE = 250;
const REPLACE_CATEGORIES = true;
const REMOVE_CATEGORIES = false;
const SMALL_THUMBNAILS = true;

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
// BACKEND (table thumbnails only)
// --------------------
function TableThumbnailBackend(isCollage, replace_categories) {
    this.isCollage = isCollage;

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

            // 1. Direct <img> inside td (collage)
            let $catImg = $category.children('img').filter((i, el) => /cat_.*\.png$/.test(el.src));
            if ($catImg.length) {
                const match = $catImg.attr('src').match(/cat_(.+)\.png$/);
                if (match) catName = match[1];
                $catImg.remove();
            }

            // 2. <div title> containing <img> (requests/top10/torrents)
            if (!catName) {
                let $div = $category.find('div[title]').first();
                if ($div.length) {
                    // fallback to div title
                    catName = $div.attr('title') || '';

                    // check for img inside div (nested or wrapped in <a>)
                    const $imgInside = $div.find('img').first();
                    if ($imgInside.length) {
                        const match = $imgInside.attr('src').match(/cat_(.+)\.png$/);
                        if (match) catName = match[1];
                        $imgInside.remove();
                    }

                    // remove div if it's now empty
                    if ($div.children().length === 0) $div.remove();
                }
            }

            // wrap thumbnail in <a> if a link exists (torrents page link)
            const $titleLink = $row.find('td').eq(1).find('a[href*="torrents.php?id="]').first();
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

            // Add text overlay with category name
            if (catName) {
                // uppercase for nicer presentation
                const overlayText = String(catName).toUpperCase();

                const $overlay = jQuery('<div>')
                .text(overlayText)
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
                    'pointer-events': 'none',
                    'white-space': 'normal',
                    'max-width': (TABLE_MAX_IMAGE_SIZE - 20) + 'px', // prevent overflow beyond thumb
                    'box-sizing': 'border-box'
                });


                // Append overlay to the category cell (safer for requests/top10)
                // Ensure the category cell is positioned (your CSS already does this)
                $category.css('position', $category.css('position') === 'static' ? 'relative' : $category.css('position'));
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
function LazyThumbnails(progress, backend, small_thumbnails, replace_categories, remove_categories, max_image_size) {
    const self = this;
    this.$torrent_table = null;
    this.images = [];
    this.attach_image = backend.attach_image;
    this.get_image_src = backend.get_image_src;
    this.image_index = 0;
    this.preload_ratio = 0.8;
    this.isCollage = backend.isCollage;

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

    this.lazyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const $img = jQuery(entry.target);
                self.show_img($img); // load the actual src
                self.lazyObserver.unobserve(entry.target); // stop observing after load
            }
        });
    }, {
        root: null, // viewport
        rootMargin: '0px',
        threshold: 0.1 // triggers when 10% of the image is visible
    });

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

                if (replace_categories && !self.isCollage) self.$torrent_table.addClass('overlay-category-small overlay-category');
                if (remove_categories && !self.isCollage) self.$torrent_table.addClass('remove-category');

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
                            self.lazyObserver.observe($img[0]); // observe the DOM element
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
    const backend = new TableThumbnailBackend(isCollage, REPLACE_CATEGORIES);
    window.lazyThumbsInstance = new LazyThumbnails(null, backend, SMALL_THUMBNAILS, REPLACE_CATEGORIES, REMOVE_CATEGORIES, TABLE_MAX_IMAGE_SIZE);
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
