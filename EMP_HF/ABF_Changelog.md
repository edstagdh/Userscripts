# Changelog

All notable changes to [HF][EMP] Advanced Better filelist are documented here.
This file is fetched at runtime by the script's "What's New" modal, so keep
each version as a `## vX.Y` header followed by a bullet list of changes.

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