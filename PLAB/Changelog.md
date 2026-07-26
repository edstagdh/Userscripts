# [Pornolab] Advanced Viewer Experience — Changelog

Format: each version is a `## v<version>` heading followed by a bullet list of
changes. The userscript parses this file directly, so keep that structure —
one `##` heading per version, one `-` bullet per change entry.

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