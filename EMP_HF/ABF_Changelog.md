# Changelog

All notable changes to [HF][EMP] Advanced Better filelist are documented here.
This file is fetched at runtime by the script's "What's New" modal, so keep
each version as a `## vX.Y` header followed by a bullet list of changes.

## v1.5 - 2026-10-22
- Added thumbnail hover preview: hovering a thumbnail from hamsterimg.net, imgbox.com or pixhost (pixhost.to, pixhost.cc and pixho.st) pops up the full-size image next to the cursor, scaled to fit the screen.
- The preview is off by default and can be toggled via the Tampermonkey menu ("✅ Thumbnail Hover Preview" → click to disable, reloads the page).
- Restyled the "What's New" window to match the one in Advanced Viewer Experience; the manual "Show Changelog" view now shows the last 3 versions, and Esc closes it.
- Added a "Full-Size Images Instead of Thumbnails" option (off by default, Tampermonkey menu): swaps hamsterimg / imgbox / pixhost thumbnails on the page for their full-size images. While it's on, the hover preview is paused.
- Full-size images are shown inside a max box (800x800 by default, change it via "📐 Full-Size Images Max Size" in the Tampermonkey menu). Their links to the image host's page are removed; clicking an image shown smaller than its real size opens it in the site's own full-view lightbox instead.

## v1.4 - 2026-08-04
- The tag list columns feature is now toggleable and off by default. Enable it via the Tampermonkey menu ("⬜ Tag List Columns" → click to enable, reloads the page).

## v1.3 - 2026-08-04
- Added an in-script changelog / "What's New" modal, opened from a new 📜 toolbar button or the Tampermonkey menu command.
- The script now checks for a newer local version on load and automatically shows what changed since your last update.

## v1.2 - 2026-08-04
- Merged in tag list columns logic: moves the tag list into the middle column and lays it out in columns instead of a single vertical list, re-applying itself whenever the tag list is updated (e.g. after voting on or adding a tag).

## v1.1
- Replaced the view filelist action link with a more visible button and added spacing between it and "[Mass PM Snatchers]".

## v1.0
- Added a case-sensitive search toggle.
- Added multi-keyword search logic toggle (space-separated terms = AND).
- Added a file size filter, text based.
- Added a file types filter, toggle-based.
- Added a filename search link to the filename on site, toggle-based.