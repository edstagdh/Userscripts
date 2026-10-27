// [PBB] Cleaner Search — click-to-preview lightbox (Viewer.js)
// Part of pbb_cleaner_search.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install pbb_cleaner_search.user.js.
// Version 1.0
//
// Top-level code only declares things; anything from the main script is used inside functions.

// One gallery per post: { thumbs: [img...], viewer: Viewer }
const pbbGalleries = new Map();

// --------------------
// Full-size URL from a thumbnail (falls back to the thumbnail itself)
// --------------------
function fullImageUrl(img) {
    const src = img.currentSrc || img.src || '';
    const a = img.closest('a');
    const href = a ? a.href : '';
    let m;

    // pixhost: t3.pixhost.cc/thumbs/X/Y.jpg -> img3.pixhost.cc/images/X/Y.jpg
    if ((m = src.match(/^https?:\/\/t(\d+)\.(pixhost\.\w+)\/thumbs\/(.+)$/))) {
        return `https://img${m[1]}.${m[2]}/images/${m[3]}`;
    }
    // imx.to: image.imx.to/u/t/... -> image.imx.to/u/i/...
    if ((m = src.match(/^(https?:\/\/(?:image\.)?imx\.to\/u)\/t\/(.+)$/))) {
        return `${m[1]}/i/${m[2]}`;
    }
    // imagetwist: imgNN.imagetwist.com/th/DIR/ID.jpg -> imgNN.imagetwist.com/i/DIR/ID.<ext from link>
    if ((m = src.match(/^(https?:\/\/img\d+\.imagetwist\.com)\/th\/(\d+)\/(\w+)\.\w+$/))) {
        const ext = (href.match(/\.(jpe?g|png|gif|webp)$/i) || [, 'jpg'])[1];
        return `${m[1]}/i/${m[2]}/${m[3]}.${ext}`;
    }
    // Link points straight at an image file on an image server
    if (href && /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(href) && /^https?:\/\/(img|image|i)\d*[.-]/i.test(href)) {
        return href;
    }
    return src;
}

function postTitleFor(post) {
    const box = post.closest('.postbody') || post;
    const subj = box.querySelector('.search-post-subj a');
    if (subj) return subj.textContent.trim();
    const bold = post.querySelector('.bold');
    return bold ? bold.textContent.trim() : document.title;
}

function buildGallery(post) {
    const thumbs = Array.from(post.querySelectorAll('img.pbb-thumb'));
    const store = document.createElement('div');
    store.className = 'pbb-viewer-store';
    const title = postTitleFor(post);

    thumbs.forEach(function (t, i) {
        const im = document.createElement('img');
        im.src = t.currentSrc || t.src;      // navbar strip uses the small image
        im.dataset.full = fullImageUrl(t);   // the lightbox loads this
        im.alt = thumbs.length > 1 ? `${title} — ${i + 1}/${thumbs.length}` : title;
        store.appendChild(im);
    });
    document.body.appendChild(store);

    const multi = thumbs.length > 1;
    const viewer = new Viewer(store, {
        url: 'data-full',
        inline: false,
        navbar: multi,
        title: [1, (image, data) => `${image.alt} (${data.naturalWidth} × ${data.naturalHeight})`],
        toolbar: {
            zoomIn: 1, zoomOut: 1, oneToOne: 1, reset: 1,
            prev: multi ? 1 : 0, play: 0, next: multi ? 1 : 0,
            rotateLeft: 1, rotateRight: 1,
            flipHorizontal: 0, flipVertical: 0,
        },
        keyboard: true,
        backdrop: true,
        loop: true,
        zoomRatio: 0.3,
        minZoomRatio: 0.1,
        maxZoomRatio: 5,
        // If the guessed full-size URL fails, fall back to the thumbnail
        view(e) {
            const shown = e.detail.image;
            const fallback = e.detail.originalImage.src;
            if (!shown) return;
            shown.addEventListener('error', function () {
                if (shown.src !== fallback) shown.src = fallback;
            }, { once: true });
        },
    });
    return { thumbs, viewer };
}

function openViewerFor(img) {
    const post = img.closest('.post-text') || img.closest('.postbody') || document.body;
    let g = pbbGalleries.get(post);
    if (!g || !g.thumbs.includes(img)) {
        if (g) g.viewer.destroy();
        g = buildGallery(post);
        pbbGalleries.set(post, g);
    }
    g.viewer.view(Math.max(0, g.thumbs.indexOf(img)));
}

// Plain left click = preview; Ctrl/Shift/middle click still opens the original link
function initViewer() {
    if (typeof Viewer !== 'function') {
        console.error(`${LOG_PREFIX} Viewer.js is missing — check the @require line / reinstall the script.`);
        return;
    }
    document.addEventListener('click', function (e) {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        const img = e.target.closest && e.target.closest('img.pbb-thumb');
        if (!img) return;
        e.preventDefault();
        e.stopPropagation();
        openViewerFor(img);
    }, true);
}
