# [Filester] Advanced Viewer Experience — Changelog

<!--
Format (parsed by the userscript, newest first):
  ## vX.Y — YYYY-MM-DD
  - one bullet per change
Every version bump needs a new entry with its release date, and the version must
match @version / SCRIPT_VERSION in filester_advanced_viewer_experience.user.js.
-->

## v1.3 — 2026-10-18
- Updated for the redesigned site: the view buttons no longer live in a ".view-controls" container, so the table-view and search buttons are now attached next to the grid/list buttons again.
- The ℹ changelog button now sits in the header next to the login button, and the page is widened to use the full screen again.
- The changelog now lives in this file (AVE_Changelog.md) and is fetched from GitHub; the "What's New" popup shows once per version bump, with a banner when a newer version is listed.
- Added a "📋 Show Changelog" command to the Tampermonkey menu (next to the ℹ header button), showing the 3 most recent versions from the installed one.
- Fixed saved table/list/grid view being overwritten with "grid" by the site's own startup code.
- Auto "Load all pages" now clicks the site's own button and waits for it to finish (also catches manual clicks), then rebuilds everything.
- Search now indexes the files already loaded on the page (no more background page crawling); the "Page" column was removed.
- The site's new "Copy URLs" button keeps working with the converted real links.
- Dates are shown in UTC so they match the site's data (no off-by-one day), and the script now waits for the DOM before touching it.

## v1.2
- Folder pages now auto-load every page on open (using the site's own "Load all pages" feature) instead of showing only the first page.
- Fixed persisted table/list/grid view and sort order being silently reset by the site's own defaults, which used to require a manual page refresh to fix.
- Search index now builds directly from the fully-loaded folder once all pages are in, instead of re-crawling pages over the network.
- Table view, search, and the changelog button now rebuild themselves defensively after the folder finishes loading, so the toolbar reliably reappears.
- Fixed download links in search results, matching the site's newer button-based download control.

## v1.1
- Domain canonicalization: opening a filester.sh / .si / .gg link now automatically redirects to filester.me, so your login session is always active.

## v1.0
- Introduced version tracking: a "What's New" popup now appears automatically after an update.
- Added a changelog button (ℹ) in the site's header nav with script info and a link to the GitHub repo.
- Search is now the leftmost button in the toolbar, ahead of the grid/list/table-view buttons.
- Hardened table view toggling when the page's own setViewMode() isn't available yet.
- Wrapped all localStorage reads/writes in try/catch so the script keeps working if storage is blocked.
- Added a page-count safety cap to the cross-page search crawler.
- Grid view now shows each file's date underneath its name, reusing the same data-date attribute the table view already relies on.