// [HF][EMP] Advanced Viewer Experience — Gallery (grid) view: cards built from the torrent table rows
// Part of advanced_viewer_experience.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install advanced_viewer_experience.user.js.
// Version 3.18

// --------------------
// GALLERY — TOGGLE
// --------------------
function toggleGalleryMode() {
    GALLERY_VIEW_MODE = !GALLERY_VIEW_MODE;
    GM_setValue('GALLERY_VIEW_MODE', GALLERY_VIEW_MODE);
    if (GALLERY_VIEW_MODE) buildGalleryView();
    else destroyGalleryView();
}

// --------------------
// GALLERY — UPDATE NAV BUTTON LABEL
// --------------------
function updateGalleryToggleLabel(isGrid) {
    const $btn = jQuery('#gallery-toggle-btn');
    if ($btn.length) {
        $btn.html(`<span class="viewer-gear-icon">${isGrid ? '&#9776;' : '&#10697;'}</span>${isGrid ? 'List' : 'Grid'}`);
        $btn.attr('title', isGrid ? 'Switch to table view' : 'Switch to grid view');
    }
    jQuery('#vsm-GALLERY_VIEW_MODE').prop('checked', isGrid);
}

// --------------------
// GALLERY — COLUMN OFFSETS PER PAGE TYPE
//
// Each page type has its own table layout. We return an object describing
// which td() index holds each field, plus a pageType string used for
// conditional rendering inside buildGalleryCard.
//
// Standard torrents.php layout (no extra leading columns):
//   [0]=cat  [1]=title  [2]=files  [3]=comments  [4]=time  [5]=size
//   [6]=snatched  [7]=seeders  [8]=leechers  [9]=uploader
//
// Notify page (torrents.php?action=notify) layout — EXTRA leading checkbox col:
//   [0]=checkbox  [1]=cat  [2]=title  [3]=files  [4]=time  [5]=size
//   [6]=snatched  [7]=seeders  [8]=leechers
//   Note: no comments column, no uploader column.
//
// Top10 / userhistory / subscribed_collages — EXTRA leading column (rank/date):
//   [0]=extra  [1]=cat  [2]=title  [3]=files  [4]=comments  [5]=time  [6]=size
//   [7]=snatched  [8]=seeders  [9]=leechers  [10]=uploader
//
// Requests page:
//   [0]=cat  [1]=title  [2]=votes  [3]=bounty  [4]=filled  [5]=filled_by
//   [6]=requester  [7]=created  [8]=last_vote
// --------------------
function getGalleryColOffsets() {
    const params        = new URLSearchParams(location.search);
    const isTop10       = location.pathname.includes('/top10');
    const isNotify      = location.pathname === '/torrents.php' && params.get('action') === 'notify';
    const isSubCollages = location.pathname.includes('/userhistory') && params.get('action') === 'subscribed_collages';
    const isUserHistory = location.pathname.includes('/userhistory') && !isSubCollages;
    const isRequests    = location.pathname.includes('/requests.php');

    // ── Notify: leading checkbox col shifts cat to [1], no comments/uploader ──
    if (isNotify) {
        return {
            pageType: 'notify',
            cat: 1, title: 2,
            files: 3, comments: -1,
            time: 4, size: 5,
            snatches: 6, seeders: 7, leechers: 8,
            uploader: -1,
            extra: -1,
        };
    }

    // ── Subscribed collages ──
    if (isSubCollages) {
        return {
            pageType: 'torrents',
            cat: 1,
            title: 2,

            files: -1,
            comments: -1,
            time: -1,

            size: 3,
            snatches: 4,
            seeders: 5,
            leechers: 6,

            uploader: -1,
            extra: -1,
        };
    }

    // ── Top10: rank | cat | title | data | size | snatches | seeders | leechers | peers | uploader ──
    if (isTop10) {
        return {
            pageType: 'torrents',
            cat: 1, title: 2,
            files: -1, comments: -1,
            time: -1, size: 4,
            snatches: 5, seeders: 6, leechers: 7,
            uploader: 9,
            extra: 8,   // Peers — shown as a meta chip
        };
    }

    // ── Userhistory: date | cat | title | files | comments | time | size | snatches | seeders | leechers | uploader ──
    if (isUserHistory) {
        return {
            pageType: 'torrents',
            cat: 1, title: 2,
            files: 3, comments: 4,
            time: 5, size: 6,
            snatches: 7, seeders: 8, leechers: 9,
            uploader: 10,
            extra: -1,
        };
    }

    // ── Requests: completely different column set ──
    if (isRequests) {
        return {
            pageType: 'requests',
            cat: 0, title: 1,
            files: -1, comments: -1,
            time: 7,      // "created" date — most useful for display
            size: 3,      // "bounty"
            snatches: 2,  // "votes"
            seeders: -1, leechers: -1,
            uploader: 6,  // "requested by"
            extra: 4,     // "filled" status (td text is a date link or "No")
        };
    }

    // ── Standard torrents listing ──
    return {
        pageType: 'torrents',
        cat: 0, title: 1,
        files: 2, comments: 3,
        time: 4, size: 5,
        snatches: 6, seeders: 7, leechers: 8,
        uploader: 9,
        extra: -1,
    };
}

// --------------------
// GALLERY — BUILD A SINGLE CARD FROM A TABLE ROW
// --------------------
function buildGalleryCard($row) {
    try {
        const cols = getGalleryColOffsets();
        const $tds = $row.find('> td');

        // Helper: safe text from a td by index (-1 → empty string)
        function tdText(idx) {
            if (idx < 0) return '';
            const $td = $tds.eq(idx);
            return $td.length ? $td.text().trim() : '';
        }

        // ── Image src ──
        const imgSrc = globalBackend
        ? globalBackend.get_image_src($row)
        : '/static/common/noartwork/noimage.png';

        // ── Category ──
        let catName = '';
        let catHref = '#';
        if (cols.cat >= 0) {
            const $catTd  = $tds.eq(cols.cat);
            const $catDiv = $catTd.find('div[title]').first();
            if ($catDiv.length) {
                catName = $catDiv.attr('title') || '';
                // Prefer the anchor href from the DOM (preserves site-specific filter URLs)
                const $catLink = $catDiv.find('a[href]').first();
                if ($catLink.length) catHref = $catLink.attr('href');
            }
            // Fallback after attach_image has already processed the row:
            // the original div[title] is removed and replaced by an injected
            // position:absolute overlay div containing an <a> with the category.
            if (!catName) {
                const $overlayBadge = $catTd.find('div[style*="position: absolute"]').first();
                if ($overlayBadge.length) {
                    catName = $overlayBadge.text().trim();
                    const $ol = $overlayBadge.find('a[href]').first();
                    if ($ol.length) catHref = $ol.attr('href');
                }
            }
            // If we have a name but still no valid href, derive one from the category map
            if (catName && (catHref === '#' || !catHref)) {
                catHref = getCategoryLink(catName, currentCategoryMap);
            }
            // Subscribed collages: override with the real category from the pre-fetched cache
            if (location.pathname.includes('/userhistory') &&
                new URLSearchParams(location.search).get('action') === 'subscribed_collages') {
                const tid = getTorrentIdFromRow($row);
                if (tid && subCollagesCatCache[tid]) {
                    catName = subCollagesCatCache[tid];
                    catHref = getCategoryLink(catName, currentCategoryMap);
                }
            }
        }

        // ── Title + torrent/request link ──
        const $titleTd = cols.title >= 0 ? $tds.eq(cols.title) : jQuery();
        let $titleLink = jQuery();
        if ($titleTd.length) {
            if (cols.pageType === 'requests') {
                $titleLink = $titleTd.find('a[href*="requests.php?action=view&id="]').first();
            } else {
                $titleLink = $titleTd.find('a[href*="torrents.php?id="]').first();
            }
        }
        const title      = $titleLink.length ? $titleLink.text().trim() : '(unknown)';
        const titleHref  = $titleLink.length ? ($titleLink.attr('href') || '#') : '#';
        const onmouseover = $titleLink.length ? ($titleLink.attr('onmouseover') || '') : '';
        const onmouseout  = $titleLink.length ? ($titleLink.attr('onmouseout')  || '') : '';

        // ── Download link ──
        const $downloadLink = $row.find('a[href*="action=download"]').first();

        const downloadHref = $downloadLink.length
        ? ($downloadLink.attr('href') || '')
        : '';
        // ── Torrent icons (freeleech, staff-ok, etc.) — not present on requests ──
        const $iconsClone = $titleTd.find('.torrent_icon_container').clone();

        // ── Stats ──
        const files    = tdText(cols.files);
        const comments = tdText(cols.comments);
        const size     = tdText(cols.size);
        const snatches = tdText(cols.snatches);
        const seeders  = tdText(cols.seeders);
        const leechers = tdText(cols.leechers);

        // Time: prefer the relative string from the .time span's alt/title attribute
        let timeDisplay  = '';
        let timeRelative = '';
        if (cols.time >= 0) {
            const $timeTd   = $tds.eq(cols.time);
            const $timeSpan = $timeTd.find('.time, .nobr').first();
            // For requests "filled" td, the link wraps the span; handle both cases
            const $spanActual = $timeTd.find('span.time').first();
            if ($spanActual.length) {
                timeDisplay  = $spanActual.text().trim();
                timeRelative = $spanActual.attr('title') || $spanActual.attr('alt') || '';
            } else if ($timeSpan.length) {
                timeDisplay  = $timeSpan.text().trim();
                timeRelative = $timeSpan.attr('title') || $timeSpan.attr('alt') || '';
            } else {
                timeDisplay = $timeTd.text().trim();
            }
        }

        // Uploader / requester — use column when available, fall back to overlay script
        let uploaderText = '';
        let uploaderHref = '#';
        if (cols.uploader >= 0) {
            const $uploaderTd   = $tds.eq(cols.uploader);
            const $uploaderLink = $uploaderTd.find('a').first();

            uploaderText = $uploaderLink.length
                ? $uploaderLink.text().trim()
            : $uploaderTd.text().trim();

            uploaderHref = $uploaderLink.length
                ? ($uploaderLink.attr('href') || '#')
            : '#';

        } else {
            // pages without uploader column
            const fallbackName = getUploaderFromRow($row);

            if (fallbackName) {
                uploaderText = fallbackName;

                const token =
                      document.querySelector('#searchbar_users input[name="token"]')?.value ||
                      '';

                uploaderHref =
                    '/user.php?action=search&search=' +
                    encodeURIComponent(fallbackName) +
                    '&token=' +
                    encodeURIComponent(token);
            }
        }

        const rowTags = getTagsFromRow($row);

        // ── Build the card ──
        const $card = jQuery('<div class="vg-card">');

        // Image wrap
        const $imgWrap = jQuery('<div class="vg-img-wrap">');

        if (catName) {
            const $catBadge = jQuery('<div class="vg-cat-badge">');
            jQuery('<a>')
                .attr('href', catHref)
                .text(catName.replace(/\./g, ' ').toUpperCase().trim())
                .appendTo($catBadge);
            $imgWrap.append($catBadge);
        }

        if ($iconsClone.length) {
            $imgWrap.append(jQuery('<div class="vg-icons-overlay">').append($iconsClone));
        }

        const $img = jQuery('<img class="vg-img" alt="">').attr('data-src', imgSrc);
        $img.one('error', function() { this.src = '/static/common/noartwork/noimage.png'; });

        if (IMAGE_LOAD_MODE === 'disabled') {
            $img.attr('src', imgSrc).removeAttr('data-src');
        } else if (galleryLazyObserver) {
            setTimeout(() => { if ($img[0]) galleryLazyObserver.observe($img[0]); }, 0);
        }

        const $imgLink = jQuery('<a class="vg-img-link">').attr('href', titleHref).attr('target', '_blank');
        if (onmouseover) $imgLink.attr('onmouseover', onmouseover);
        if (onmouseout)  $imgLink.attr('onmouseout',  onmouseout);
        $imgLink.append($img);
        $imgWrap.append($imgLink);

        // Info section
        const $info = jQuery('<div class="vg-info">');

        const $titleDiv = jQuery('<div class="vg-title">');

        const $titleA = jQuery('<a>')
        .attr('href', titleHref)
        .text(title);

        if (onmouseover) $titleA.attr('onmouseover', onmouseover);
        if (onmouseout)  $titleA.attr('onmouseout',  onmouseout);

        $titleDiv.append($titleA);
        $info.append($titleDiv);

        // ── Button row: Download + Tags ──
        if (downloadHref || rowTags.length) {
            const $btnRow = jQuery('<div class="vg-dl-row">');
            if (downloadHref) {
                jQuery('<a>')
                    .attr('href', downloadHref)
                    .attr('title', 'Download torrent')
                    .addClass('vg-download-btn')
                    .html('&#11015; Download')
                    .appendTo($btnRow);
            }
            if (rowTags.length) {
                const $tagsBtn = jQuery('<button class="vg-download-btn vg-tags-btn" type="button">').html('🏷 Tags');
                const rowUploader = getUploaderFromRow($row);
                $tagsBtn.on('mouseenter', function () { showTagsPopup(jQuery(this), rowTags, rowUploader); });
                $tagsBtn.on('mouseleave', scheduleHideTagsPopup);
                $btnRow.append($tagsBtn);
            }
            $info.append($btnRow);
        }

        // Stats chips — layout differs between requests and torrents
        const $stats = jQuery('<div class="vg-stats">');
        if (cols.pageType === 'requests') {
            // Filled status from the "extra" column
            let isFilled = false;

            if (cols.extra >= 0) {
                const $filledTd  = $tds.eq(cols.extra);
                const filledText = $filledTd.text().trim();

                // Filled if there's a link inside the td (links to the torrent); "No" or "--" means unfilled
                isFilled = $filledTd.find('a').length > 0 && filledText !== 'No';
            }

            // Remove " (+)" from votes when request is unfilled
            let displaySnatches = snatches;

            if (!isFilled && typeof displaySnatches === 'string') {
                displaySnatches = displaySnatches.replace(/\s*\(\+\)\s*$/, '');
            }

            // requests: votes | bounty | filled status
            if (displaySnatches !== '')
                $stats.append(
                    jQuery('<span class="vg-stat vg-stat-snatch" title="Votes">')
                    .text('Votes: ' + displaySnatches)
                );

            if (size !== '')
                $stats.append(
                    jQuery('<span class="vg-stat vg-stat-size" title="Bounty">')
                    .text('Bounty: ' + size)
                );

            if (cols.extra >= 0) {
                const cls   = isFilled ? 'vg-stat-seed' : 'vg-stat-leech';
                const label = isFilled ? '&#x2713; Filled' : '&#x2717; Unfilled';

                $stats.append(
                    jQuery(`<span class="vg-stat ${cls}" title="Fill status">`).html(label)
                );
            }
        } else {
            // torrents/notify: seeders | leechers | snatched | size
            if (seeders  !== '') $stats.append(jQuery('<span class="vg-stat vg-stat-seed"  title="Seeders">').text('▲ '  + seeders));
            if (leechers !== '') $stats.append(jQuery('<span class="vg-stat vg-stat-leech" title="Leechers">').text('▼ ' + leechers));
            if (snatches !== '') $stats.append(jQuery('<span class="vg-stat vg-stat-snatch" title="Snatched">').text('⤓ ' + snatches));
            if (size     !== '') $stats.append(jQuery('<span class="vg-stat vg-stat-size"  title="Size">').text(size));
        }
        if ($stats.children().length) $info.append($stats);

        // Meta (files, comments)
        const $meta = jQuery('<div class="vg-meta">');
        if (files    !== '') $meta.append(jQuery('<span>').attr('title', 'Files').text('📄 ' + files));
        if (comments !== '') $meta.append(jQuery('<span>').attr('title', 'Comments').text('💬 ' + comments));
        if ($meta.children().length) $info.append($meta);

        // Footer: uploader + time
        if (uploaderText || timeDisplay) {
            const $footer = jQuery('<div class="vg-footer">');
            if (uploaderText) {
                const uploaderKey = uploaderText.toLowerCase();
                const isUlBl = isUploaderBlacklisted(uploaderKey);
                const $ulWrap = jQuery('<span style="display:inline-flex;align-items:center;gap:5px;">');
                const $uploaderAnchor = jQuery('<a class="vg-uname">')
                .attr('href', uploaderHref)
                .attr('title', uploaderText)
                .text(uploaderText)
                .toggleClass('vg-uploader-bl', isUlBl);

                if (cols.uploader < 0) {
                    // fallback uploader search links are rate limited
                    $uploaderAnchor.on('click', function (e) {
                        e.preventDefault();

                        const now = Date.now();
                        const elapsed = now - lastUserSearchTimestamp;

                        if (elapsed < USER_SEARCH_COOLDOWN_MS) {
                            const remaining = Math.ceil(
                                (USER_SEARCH_COOLDOWN_MS - elapsed) / 1000
                            );

                            alert(
                                'User search cooldown active.\n\n' +
                                'Please wait ' + remaining + ' more seconds.'
                            );

                            return;
                        }

                        lastUserSearchTimestamp = now;

                        window.location.href = uploaderHref;
                    });
                }

                $uploaderAnchor.appendTo($ulWrap);
                const $blockBtn = jQuery('<button class="vg-footer-block-btn" type="button">')
                .attr('title', isUlBl ? 'Blocked — click to unblock ' + uploaderText : 'Block uploader: ' + uploaderText)
                .text('✕');
                $blockBtn.on('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const $btn = jQuery(this);
                    // Opens the duration dialog when blocking; unblocks immediately otherwise
                    toggleUploaderInBlacklist(uploaderKey, function () {
                        const nowBl = isUploaderBlacklisted(uploaderKey);
                        $ulWrap.find('a').toggleClass('vg-uploader-bl', nowBl);
                        $btn.attr('title', nowBl ? 'Blocked — click to unblock ' + uploaderText : 'Block uploader: ' + uploaderText);
                    });
                });
                $ulWrap.append($blockBtn);
                if (uploaderKey !== 'anon' && uploaderKey !== 'anonymous') {
                    const $utagBtn = jQuery('<button class="vg-footer-utag-btn" type="button">')
                    .attr('title', 'Block a tag for ' + uploaderText + ' only')
                    .text('#');
                    $utagBtn.on('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        showUploaderTagPopup(jQuery(this), uploaderKey, rowTags);
                    });
                    $ulWrap.append($utagBtn);
                }
                $footer.append($ulWrap);
            }
            if (timeDisplay) {
                jQuery('<span class="vg-time">')
                    .text(timeRelative || timeDisplay)
                    .attr('title', timeDisplay)
                    .appendTo($footer);
            }
            $info.append($footer);
        }

        $card.append($imgWrap, $info);

        // Apply favorite glow if any tag matches
        if (rowMatchesFavorites($row)) applyGlowToCard($card);

        return $card;

    } catch (e) {
        console.error(`${LOG_PREFIX} buildGalleryCard error:`, e, $row);
        return null;
    }
}

// --------------------
// GALLERY — BUILD GRIDS FROM ALL MATCHING TABLES
//
// On most pages there is a single table, but on torrents.php?action=notify
// the page renders one .torrent_table per notification filter group.
// We iterate every table and insert an independent grid after each one.
// --------------------
function buildGalleryView() {
    // Subscribed collages: pre-fetch all categories into cache before building cards.
    // If any are missing we fire the requests and return; the last callback re-calls
    // this function, at which point the cache is full and we fall through normally.
    if (location.pathname.includes('/userhistory') &&
        new URLSearchParams(location.search).get('action') === 'subscribed_collages') {
        const $scRows = jQuery('.torrent_table').find('tr.torrent');
        let pending = 0;
        $scRows.each(function () {
            const tid = getTorrentIdFromRow(jQuery(this));
            if (tid && !subCollagesCatCache.hasOwnProperty(tid)) pending++;
        });
        if (pending > 0) {
            $scRows.each(function () {
                const tid = getTorrentIdFromRow(jQuery(this));
                if (tid && !subCollagesCatCache.hasOwnProperty(tid)) {
                    fetchCategoryForTorrent(tid, function () {
                        if (--pending === 0) buildGalleryView(); // recurse once cache is full
                    });
                }
            });
            return; // wait for all fetches to complete
        }
        // pending === 0 means everything is already cached — fall through and build
    }
    let $tables, rowSelector;
    if (location.pathname.includes('requests.php')) {
        $tables      = jQuery('#request_table, .request_table');
        rowSelector  = 'tr.rowa, tr.rowb';
    } else {
        $tables      = jQuery('.torrent_table');
        rowSelector  = 'tr.torrent';
    }

    if (!$tables.length) {
        console.warn(`${LOG_PREFIX} buildGalleryView: no table found`);
        return;
    }

    // Remove any stale grids from a previous call
    jQuery('.viewer-gallery-grid').remove();

    // Create a fresh IntersectionObserver shared across all grids on this page
    if (galleryLazyObserver) galleryLazyObserver.disconnect();
    if (IMAGE_LOAD_MODE !== 'disabled') {
        const rootMargin = IMAGE_LOAD_MODE === 'lazy' ? '0px' : '150% 0px';
        const threshold  = IMAGE_LOAD_MODE === 'lazy' ? 0.1 : 0.01;
        galleryLazyObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const img = entry.target;
                const src = img.getAttribute('data-src');
                if (src) { img.src = src; img.removeAttribute('data-src'); }
                galleryLazyObserver.unobserve(img);
            });
        }, { root: null, rootMargin, threshold });
    } else {
        galleryLazyObserver = null;
    }

    let totalCards = 0;

    $tables.each(function () {
        const $table = jQuery(this);
        const $rows  = $table.find(rowSelector);
        if (!$rows.length) return; // skip header-only tables

        const $grid = jQuery('<div class="viewer-gallery-grid">');

        $rows.each(function () {
            const $r = jQuery(this);
            if (rowIsBlacklisted($r)) return; // hidden by a blacklist rule
            const $card = buildGalleryCard($r);
            if ($card) $grid.append($card);
        });

        if ($grid.children().length) {
            $table.hide();
            $table.after($grid);
            totalCards += $grid.children().length;
        }
    });

    // If no rows were found yet (table is still loading), retry
    if (!totalCards) {
        console.log(`${LOG_PREFIX} buildGalleryView: no rows yet — retrying`);
        $tables.show();
        const retryInterval = setInterval(() => {
            const hasRows = $tables.toArray().some(t => jQuery(t).find(rowSelector).length > 0);
            if (hasRows) { clearInterval(retryInterval); buildGalleryView(); }
        }, 300);
        return;
    }

    updateGalleryToggleLabel(true);
}

// --------------------
// GALLERY — DESTROY ALL GRIDS, RESTORE ALL TABLES
// --------------------
function destroyGalleryView() {
    jQuery('.viewer-gallery-grid').remove();
    if (location.pathname.includes('requests.php')) {
        jQuery('#request_table, .request_table').show();
    } else {
        jQuery('.torrent_table').show();
    }
    if (galleryLazyObserver) {
        galleryLazyObserver.disconnect();
        galleryLazyObserver = null;
    }
    updateGalleryToggleLabel(false);
}
