# [Pornolab] Advanced Viewer Experience — Changelog

Format: each version is a `## v<version>` heading followed by a bullet list of
changes. The userscript parses this file directly, so keep that structure —
one `##` heading per version, one `-` bullet per change entry.

## v1.1
- Moved Changelog to external file hosted in GitHub.

## v1.0
- Initial release: ported the [HF][EMP] Advanced Viewer Experience gallery/settings system to Pornolab.
- Grid/List toggle button next to "Опции показа".
- Preview images are pulled live from inside each topic page (first valid image found), lazy-loaded via IntersectionObserver.
- Download button added to both table and grid views.
- Forum Blacklist & Favorite Forums (with configurable glow color) — since Pornolab rows have one forum instead of tags.
- Uploader Blacklist with inline ⛔ block buttons in both views.
- Table view: category text trimmed to English only, Russian month abbreviations translated.