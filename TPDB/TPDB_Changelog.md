# ThePornDB - Enhanced Search Results — Changelog

## v3.0 - 2026-10-14
- Added Tampermonkey menu: set API key, set API timeout, filename mode, filename performer genders, show changelog, toggle debug logging.
- API key is now stored via GM storage instead of being hard-coded in the script, so updates no longer wipe it. You will be prompted on first use.
- Configurable timeout for all TPDB API requests (default 15s, set from the menu).
- API requests now go through GM_xmlhttpRequest, with clear timeout / network / HTTP error messages.
- Scene lookups are cached for 60 seconds, so using several buttons on one scene makes a single API call.
- Added a one-time "What's New" popup after a version bump, with the changelog loaded from this file.
- Filename mode and performer genders are now settings (previously constants in the script).
- Full code restructure: table-driven action buttons, a single debounced DOM observer, delegated hover preview for grid and table, and CSS-based image sizing.
- Copy actions use GM_setClipboard, which is more reliable after async requests.
- Errors now show as red toasts instead of alert() popups.
- Table view is rebuilt each time it is opened, so it is never stale; added a safety limit when waiting for lazy-loaded scenes.
- Site-parent lookup has a loop guard.
- Dates are formatted without timezone shifting.
- Fixed action button layout and the "Show Performers" tooltip.

## v2.1
- Updated script with install/update URL.
- Updated description.
- Added configuration for filename copy button mode.

## v2.0
- Big overhaul.

## v1.8
- Added show site parents hierarchy button (requires API key).
- Added collect scene button (requires API key).
- Added copy scene UUID button (requires API key).
- Fixed hover on scene image for larger preview.
- Fixed table view button.
- Fixed custom hide images button.
- Fixed custom table view button.