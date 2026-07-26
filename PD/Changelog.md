# [Pixeldrain] Gallery View — Changelog

Format: each version is a `## v<version> - <date>` heading followed by a bullet list
of changes. The userscript parses this file directly, so keep that structure — one
`##` heading per version (newest first), one `-` bullet per change entry.

## v1.5 - 2026-07-26
- Changelog moved out of the script into this file, fetched on demand instead of being bundled inline.
- Manually opening "Version History / Changelog" now shows the entry for the version you're actually running, plus a notice if a newer version is available on GitHub.

## v1.4 - 2026-07-22
- Added Bypass logic.

## v1.3 - 2026-07-20
- Removed single file links match.

## v1.2 - 2026-07-20
- Removed redundant file size overlay on thumbnails.
- Changed Hover Preview to apply only when hovering the thumbnails in both grid and table view.
- Changed preview scale to 150%.

## v1.1 - 2026-07-20
- Added Version History modal and automatic update detection.
- Added item size, upload date, and view count to grid view cards.
- Fixed text horizontal and vertical truncation in both Grid and Table views.
- Added Tampermonkey menu command to manually view changelog anytime.

## v1.0 - 2026-07-20
- Initial release with Grid & Table gallery views, lightbox modal, and hover previews.