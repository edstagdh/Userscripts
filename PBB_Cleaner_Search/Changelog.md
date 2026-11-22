# [PBB] Cleaner Search — Changelog

Format: each version is a `## v<version>` heading followed by a bullet list of
changes. The userscript parses this file directly, so keep that structure —
one `##` heading per version, one `-` bullet per change entry, newest first.

## v1.5
- All results now fills the whole window.
- New grid view (default): one card per post with the cover image, a few smaller images, the post title (opens the post in a new tab), and its duration, size, resolution and date. "Post text & links" folds out the full post text with its download links. Switch between Grid and List at the top; the choice is remembered.
- The list view now shows only the posts — the topic line and the uploader column with its stats are gone.
- New filter box: type one or more comma-separated keywords and choose "match all" or "match any". It searches the post title and text, and also applies to pages loaded later.
- Durations match in any form: 00:02:42, 0:02:42, 2:42 and 2 min 42 s all find each other. A duration without seconds, like "2 min", matches anything from 2:00 to 2:59.

## v1.4
- New: "View all results in one list" button above the search results (also in the Tampermonkey menu). It opens a popup that loads every page of the search into one scrollable list, one page at a time with a short pause between pages so the site doesn't rate-limit you. Results appear as each page arrives.
- The popup stops every 10 pages; click "Load next pages" to continue. Stop pauses at any time, and closing the popup pauses too — reopening keeps what was already loaded. A page that fails is retried once, then a Retry button is shown.
- Results whose topic name matches your collapse keywords are left out of the popup (the count is shown at the bottom). Images in the popup are thumbnails with the same click-to-preview, and load only when you scroll to them.
- imagetwist: clicking a thumbnail now opens the image's imagetwist page in a new tab, because imagetwist blocks showing its full-size images on other sites (the preview only showed a "hotlinking disabled" placeholder). These images are skipped when browsing a post's images in the preview.

## v1.3
- pimpandhost thumbnails (hosted on filesor.com) now open full-size in the preview (…/NAME_s.jpg, _m.jpg or _l.jpg → …/NAME.jpeg).
- When a full-size address doesn't load, the preview now tries the other likely addresses for that host (e.g. .jpg / .png instead of .jpeg) before falling back to the thumbnail, and remembers the one that worked while the page is open.

## v1.2
- Fixed: imagetwist thumbnails now open the actual full-size image in the preview (imagetwist's full-size address ends with the original file name, which is taken from the link around the thumbnail).

## v1.1
- picstate.com thumbnails now open full-size in the preview (picstate.com/thumbs/small/… → picstate.com/files/…).

## v1.0
- First release.
- Every image inside a post is shrunk to a small thumbnail (max 350×350 by default; change it from the Tampermonkey menu → Thumbnail max size). Smilies and other tiny images are left alone.
- Click a thumbnail to open it in a lightbox with zoom, 1:1, reset and rotate. Posts with several images can be browsed with the arrows, the arrow keys or the thumbnail strip. Ctrl-click or middle-click still opens the original link.
- The lightbox loads the full-size image for pixhost, imx.to and imagetwist thumbnails, and falls back to the thumbnail if the full-size image can't be loaded.
- Search results whose topic name contains one of your keywords are collapsed automatically, with a Show button per result and a Show all / Collapse again bar above the list. Set the keywords from the Tampermonkey menu → Collapse keywords (comma-separated, case-insensitive).
