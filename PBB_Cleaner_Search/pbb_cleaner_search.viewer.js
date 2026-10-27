// [PBB] Cleaner Search — click-to-preview lightbox (Viewer.js)
// Part of pbb_cleaner_search.user.js, loaded via @require (runs before the main script,
// in the same scope). Not a standalone userscript — install pbb_cleaner_search.user.js.
// Version 1.3
//
// Top-level code only declares things; anything from the main script is used inside functions.

// One gallery per post: { thumbs: [img...], viewer: Viewer }
const pbbGalleries = new Map();
// First candidate URL -> the candidate that actually loaded (this page view), so re-opening
// an image doesn't retry addresses that already failed.
const pbbResolvedUrl = new Map();

// --------------------
// Full-size URL from a thumbnail (falls back to the thumbnail itself)
// --------------------
// Thumbnail → full-size rules, one per image host. To add a host, add an entry:
//   re: matched against the thumbnail's src;  to(m, href): returns the full-size URL, or an
//   array of URLs to try in order (m = regex match, href = the link the thumbnail is wrapped
//   in, or ''). First matching rule wins. If every URL fails, the thumbnail is shown.
const FULL_SIZE_RULES = [
    {   // pixhost: t3.pixhost.cc/thumbs/X/Y.jpg -> img3.pixhost.cc/images/X/Y.jpg
        host: 'pixhost',
        re: /^https?:\/\/t(\d+)\.(pixhost\.\w+)\/thumbs\/(.+)$/,
        to: m => `https://img${m[1]}.${m[2]}/images/${m[3]}`,
    },
    {   // imx.to: image.imx.to/u/t/... -> image.imx.to/u/i/...
        host: 'imx.to',
        re: /^(https?:\/\/(?:image\.)?imx\.to\/u)\/t\/(.+)$/,
        to: m => `${m[1]}/i/${m[2]}`,
    },
    {   // imagetwist: imgNN.imagetwist.com/th/DIR/ID.jpg -> imgNN.imagetwist.com/i/DIR/ID.jpg/<original file name>
        // The original file name comes from the link around the thumbnail: imagetwist.com/ID/<name>.
        // Without such a link, fall back to the name "ID.jpg".
        host: 'imagetwist',
        re: /^(https?:\/\/img\d+\.imagetwist\.com)\/th\/(\d+)\/((\w+)\.\w+)$/,
        to: (m, href) => {
            const link = href.match(/^https?:\/\/(?:www\.)?imagetwist\.com\/\w+\/([^/?#]+)$/i);
            return `${m[1]}/i/${m[2]}/${m[3]}/${link ? link[1] : m[3]}`;
        },
    },
    {   // picstate: picstate.com/thumbs/small/ID_HASH/NAME.jpg -> picstate.com/files/ID_HASH/NAME.jpg
        // (any thumbnail size folder, not only "small")
        host: 'picstate',
        re: /^(https?:\/\/(?:www\.)?picstate\.com)\/thumbs\/[^/]+\/(.+)$/,
        to: m => `${m[1]}/files/${m[2]}`,
    },
    {   // pimpandhost (images on filesor.com):
        // istN-N.filesor.com/pimpandhost.com/…/NAME_s.jpg (or _m / _l) -> …/NAME.jpeg
        // The original's extension isn't in the thumbnail URL: try .jpeg first (seen so far),
        // then .jpg, .png, .gif.
        host: 'pimpandhost',
        re: /^(https?:\/\/[^/]+\.filesor\.com\/pimpandhost\.com\/.+\/[^/]+?)_[sml]\.\w+$/i,
        to: m => ['jpeg', 'jpg', 'png', 'gif'].map(ext => `${m[1]}.${ext}`),
    },
];

// Returns the URLs to try for the full-size image, best first; the thumbnail is always last.
function fullImageCandidates(img) {
    const src = img.currentSrc || img.src || '';
    const a = img.closest('a');
    const href = a ? a.href : '';
    let list = [];

    for (const rule of FULL_SIZE_RULES) {
        const m = src.match(rule.re);
        if (m) { list = [].concat(rule.to(m, href)); break; }
    }
    // Link points straight at an image file on an image server
    if (!list.length && href && /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(href) && /^https?:\/\/(img|image|i)\d*[.-]/i.test(href)) {
        list = [href];
    }
    list.push(src);
    list = list.filter((u, i) => u && list.indexOf(u) === i);
    const known = pbbResolvedUrl.get(list[0]);
    return known ? [known] : list;
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
        const urls = fullImageCandidates(t);
        im.dataset.full = urls[0];           // the lightbox loads this
        im.dataset.fallbacks = JSON.stringify(urls.slice(1)); // tried in order if it fails
        im.dataset.first = urls[0];
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
        // If the full-size URL fails, try the next candidate, ending with the thumbnail
        view(e) {
            const shown = e.detail.image;
            const orig = e.detail.originalImage;
            if (!shown || !orig) return;
            let rest = [];
            try { rest = JSON.parse(orig.dataset.fallbacks || '[]'); } catch (err) { /* none */ }
            const onError = function () {
                const next = rest.shift();
                if (!next) return;
                shown.addEventListener('error', onError, { once: true });
                shown.src = next;
            };
            shown.addEventListener('error', onError, { once: true });
            shown.addEventListener('load', function () {
                // Remember the address that worked: for this gallery and for galleries rebuilt later
                pbbResolvedUrl.set(orig.dataset.first, shown.src);
                orig.dataset.full = shown.src;
                orig.dataset.fallbacks = '[]';
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
