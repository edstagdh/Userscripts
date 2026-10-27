# [PBB] Cleaner Search — Changelog

Format: each version is a `## v<version>` heading followed by a bullet list of
changes. The userscript parses this file directly, so keep that structure —
one `##` heading per version, one `-` bullet per change entry, newest first.

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
