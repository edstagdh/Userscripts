// [Pornolab] Advanced Viewer Experience — Gallery (grid) view: cards built from the tracker table rows
// Part of plab_advanced_viewer.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install plab_advanced_viewer.user.js.
// Version 1.5

// --------------------
// GALLERY — BUILD A SINGLE CARD FROM A TABLE ROW
// --------------------
function buildGalleryCard($row) {
    try {
        const topicId    = getTopicIdFromRow($row);
        const forumName  = getForumFromRow($row);
        const forumHref  = getForumHrefFromRow($row);
        const titleInfo  = getTitleFromRow($row);
        const authorInfo = getAuthorFromRow($row);
        const sizeInfo   = getSizeAndDownloadFromRow($row);
        const seeders    = getSeedersFromRow($row);
        const leechers   = getLeechersFromRow($row);
        const completed  = getCompletedFromRow($row);
        const dateInfo   = getDateFromRow($row);

        const $card    = jQuery('<div class="vg-card">');
        const $imgWrap = jQuery('<div class="vg-img-wrap">');

        if (forumName) {
            const $badgeWrap = jQuery('<div class="vg-cat-badge" style="display:flex;gap:3px;align-items:center;">');
            jQuery('<a>').attr('href', forumHref).text(forumName.toUpperCase()).appendTo($badgeWrap);

            const isFav = FORUM_FAVORITES.indexOf(forumName.toLowerCase()) !== -1;
            const isBl  = FORUM_BLACKLIST.indexOf(forumName.toLowerCase()) !== -1;
            const $favBtn = jQuery('<button type="button" class="vg-forum-fav-btn">').html(isFav ? '&#9733;' : '&#9734;')
                .attr('title', isFav ? 'Remove favorite forum' : 'Mark forum as favorite (glow)');
            const $blBtn  = jQuery('<button type="button" class="vg-forum-bl-btn">&#9940;</button>')
                .attr('title', isBl ? 'Un-blacklist this forum' : 'Blacklist this forum');
            $favBtn.on('click', function (e) { e.preventDefault(); e.stopPropagation(); toggleForumInFavorites(forumName); });
            $blBtn.on('click',  function (e) { e.preventDefault(); e.stopPropagation(); toggleForumInBlacklist(forumName); });
            $badgeWrap.append($favBtn, $blBtn);
            $imgWrap.append($badgeWrap);
        }

        const $img = jQuery('<img class="vg-img" alt="">');
        $img.one('error', function () { this.src = FALLBACK_IMG; });
        const $imgLink = jQuery('<a class="vg-img-link" target="_blank">').attr('href', titleInfo.href).append($img);
        $imgWrap.append($imgLink);

        if (topicId) {
            if (IMAGE_LOAD_MODE !== 'disabled' && galleryLazyObserver) {
                $img.attr('data-topic-id', topicId).attr('data-topic-href', titleInfo.href);
                setTimeout(() => { if ($img[0]) galleryLazyObserver.observe($img[0]); }, 0);
            } else {
                loadImageForImgElement($img[0], topicId, titleInfo.href, $img);
            }
        } else {
            $img.attr('src', FALLBACK_IMG);
        }

        const $info = jQuery('<div class="vg-info">');
        const $titleDiv = jQuery('<div class="vg-title">');
        jQuery('<a target="_blank">').attr('href', titleInfo.href).text(titleInfo.text).appendTo($titleDiv);
        $info.append($titleDiv);

        if (sizeInfo.downloadHref) {
            const $btnRow = jQuery('<div class="vg-dl-row">');
            jQuery('<a>').attr('href', sizeInfo.downloadHref).addClass('vg-download-btn')
                .html('&#11015; ' + (sizeInfo.sizeText || 'Download')).appendTo($btnRow);
            $info.append($btnRow);
        }

        const $stats = jQuery('<div class="vg-stats">');
        if (seeders   !== '') $stats.append(jQuery('<span class="vg-stat vg-stat-seed"  title="Seeders">').text('▲ ' + seeders));
        if (leechers  !== '') $stats.append(jQuery('<span class="vg-stat vg-stat-leech" title="Leechers">').text('▼ ' + leechers));
        if (completed !== '') $stats.append(jQuery('<span class="vg-stat vg-stat-snatch" title="Completed">').text('⤓ ' + completed));
        if ($stats.children().length) $info.append($stats);

        const $footer = jQuery('<div class="vg-footer">');
        if (authorInfo.text) {
            const key = authorInfo.text.toLowerCase();
            const isUlBl = UPLOADER_BLACKLIST.indexOf(key) !== -1;
            const $ulWrap = jQuery('<span style="display:inline-flex;align-items:center;gap:1px;">');
            const $uploaderA = jQuery('<a>').attr('href', authorInfo.href).text('👤 ' + authorInfo.text)
                .toggleClass('vg-uploader-bl', isUlBl);
            $ulWrap.append($uploaderA);
            const $blockBtn = jQuery('<button class="vg-footer-block-btn" type="button">⛔</button>')
                .attr('title', isUlBl ? 'Blocked — click to unblock ' + authorInfo.text : 'Block uploader: ' + authorInfo.text);
            $blockBtn.on('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                toggleUploaderInBlacklist(key);
                const nowBl = UPLOADER_BLACKLIST.indexOf(key) !== -1;
                $uploaderA.toggleClass('vg-uploader-bl', nowBl);
                jQuery(this).attr('title', nowBl ? 'Blocked — click to unblock ' + authorInfo.text : 'Block uploader: ' + authorInfo.text);
            });
            $ulWrap.append($blockBtn);
            $footer.append($ulWrap);
        }
        if (dateInfo.combined) {
            jQuery('<span class="vg-time">').text(dateInfo.combined).appendTo($footer);
        }
        $info.append($footer);

        $card.append($imgWrap, $info);
        if (rowMatchesFavoriteForum($row)) applyGlowToCard($card);
        return $card;
    } catch (e) {
        console.error(`${LOG_PREFIX} buildGalleryCard error:`, e, $row);
        return null;
    }
}

// --------------------
// GALLERY — BUILD / DESTROY / TOGGLE
// --------------------
function buildGalleryView() {
    const $table = jQuery('#tor-tbl');
    if (!$table.length) { console.warn(`${LOG_PREFIX} buildGalleryView: #tor-tbl not found`); return; }

    jQuery('.viewer-gallery-grid').remove();

    if (galleryLazyObserver) galleryLazyObserver.disconnect();
    if (IMAGE_LOAD_MODE !== 'disabled') {
        const rootMargin = IMAGE_LOAD_MODE === 'lazy' ? '0px' : '150% 0px';
        const threshold  = IMAGE_LOAD_MODE === 'lazy' ? 0.1 : 0.01;
        galleryLazyObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const img = entry.target;
                const topicId   = img.getAttribute('data-topic-id');
                const topicHref = img.getAttribute('data-topic-href');
                galleryLazyObserver.unobserve(img);
                if (topicId) loadImageForImgElement(img, topicId, topicHref, jQuery(img));
            });
        }, { root: null, rootMargin, threshold });
    } else {
        galleryLazyObserver = null;
    }

    const $grid = jQuery('<div class="viewer-gallery-grid">');
    getRows().each(function () {
        const $r = jQuery(this);
        if (rowMatchesForumBlacklist($r) || rowMatchesUploaderBlacklist($r)) return;
        const $card = buildGalleryCard($r);
        if ($card) $grid.append($card);
    });

    if ($grid.children().length) {
        $table.hide();
        $table.after($grid);
    }
    updateGalleryToggleLabel(true);
}

function destroyGalleryView() {
    jQuery('.viewer-gallery-grid').remove();
    jQuery('#tor-tbl').show();
    applyAllFiltersToPage();   // blacklist / favorite changes made in grid view apply to the table too
    if (galleryLazyObserver) { galleryLazyObserver.disconnect(); galleryLazyObserver = null; }
    updateGalleryToggleLabel(false);
}

function toggleGalleryMode() {
    GALLERY_VIEW_MODE = !GALLERY_VIEW_MODE;
    GM_setValue('GALLERY_VIEW_MODE', GALLERY_VIEW_MODE);
    if (GALLERY_VIEW_MODE) buildGalleryView(); else destroyGalleryView();
}

function updateGalleryToggleLabel(isGrid) {
    const $btn = jQuery('#pl-gallery-toggle-btn');
    if ($btn.length) {
        $btn.html(isGrid ? '&#9776; List' : '&#10697; Grid');
        $btn.attr('title', isGrid ? 'Switch to table view' : 'Switch to grid view');
    }
    jQuery('#vsm-GALLERY_VIEW_MODE').prop('checked', isGrid);
}
