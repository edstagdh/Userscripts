# [Pornolab] Advanced Viewer Experience — Changelog

Format: each version is a `## v<version>` heading followed by a bullet list of
changes. The userscript parses this file directly, so keep that structure —
one `##` heading per version, one `-` bullet per change entry.

## v1.5
- Previews load faster and much lighter: topic pages are now read without loading any of their own images, so avatars, smilies, banners and signatures inside each topic are no longer downloaded in the background (on a typical list that's hundreds of image requests saved per page).
- Previews are remembered between visits: coming back to a list, or paging back, shows them right away without fetching the topic pages again. Found images are re-checked after 30 days, topics without an image after 3 days, and a remembered image that stops loading is forgotten. Turn it off or clear it in Viewer Settings → Performance.
- A topic-page fetch slot is freed as soon as the page arrives, instead of waiting while its images are size-checked, so the next topic starts sooner.
- Hover previews share one popup instead of creating one per thumbnail, and the settings panel is built the first time you open it.
- Fixed: forums or uploaders blacklisted (or forums favorited) while in grid view are now also applied to the table when you switch back to the list.
- The script is now split into several files so it's easier to maintain (no change in behavior): settings + nav buttons, gallery view and the "What's New" popup moved to their own files, and all CSS moved to a stylesheet. Tampermonkey downloads them once and caches them.
- Switched to the minified build of the same jQuery version (2.1.1), cutting the code parsed on every page by roughly a third.

## v1.4
- Fixed: the page could stall with no visible UI changes when many preview images loaded at once. Topic-page preview fetches (used to pull the preview image out of each topic) are now routed through a small request queue that caps how many run at the same time, staggers new ones as slots free up, and applies a timeout so a slow or rate-limited request can no longer hang forever and jam every other pending preview.
- Added new Performance settings: Max Concurrent Fetches, Fetch Stagger (ms), and Fetch Timeout (ms), so the throttling behavior can be tuned from the settings panel without editing the script.

## v1.3
- Fixed: manually opening "Show Changelog" from the GM menu now shows the changelog entry for the version you're actually running, instead of always showing the latest entry from GitHub.
- Added an "update available" notice in the changelog popup when a newer version exists in the remote CHANGELOG.md than the one currently installed.

## v1.2
- Table view: preview thumbnails are now centered in their cell instead of left-aligned when narrower than the max thumbnail size.
- Table view: removed the dedicated Download column — the existing Size column link already downloads the torrent, so it's now styled as the download button instead of duplicating it.
- Table view: column headers (Forum, Topic, Uploader, Size, Added, and the S/L/C/private-torrent tooltips) are now translated to English.

## v1.1
- Initial release: ported the [HF][EMP] Advanced Viewer Experience gallery/settings system to Pornolab.

## v1.0
- Initial release: ported the [HF][EMP] Advanced Viewer Experience gallery/settings system to Pornolab.
- Grid/List toggle button next to "Опции показа".
- Preview images are pulled live from inside each topic page (first valid image found), lazy-loaded via IntersectionObserver.
- Download button added to both table and grid views.
- Forum Blacklist & Favorite Forums (with configurable glow color) — since Pornolab rows have one forum instead of tags.
- Uploader Blacklist with inline ⛔ block buttons in both views.
- Table view: category text trimmed to English only, Russian month abbreviations translated.