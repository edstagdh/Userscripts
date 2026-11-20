# ThePornDB - Enhanced Search Results — Changelog

## v3.2 - 2026-11-20
- Site's own Table mode (Card/Table switch): hovering a scene image now shows the large preview, like in the grid.
- Site's Table mode: added a ⋮ menu in the Actions column with the script's actions (copy UUID / URL / filename, external ID, site parents, open in background tab, collect).
- Site's Table mode: the "Show Performers" button is now in the Performers column.

## v3.1 - 2026-11-20
- Fixed the scene grid after the site redesign: cards now fill the row instead of stopping at 3 per row (5 per row at 1080p / 100% by default).
- Added a "Set grid card minimum width (px)" menu command — smaller values fit more cards per row.
- Fixed hover preview and table thumbnails: they now use the site's full-size image (the grid image itself is now only a placeholder until it loads).
- Hover preview no longer pops up over the small site logos on the cards.
- Table thumbnails load lazily.
- The changelog popup can now be closed with Escape.
- Code split into files like the other scripts: main script, table view module, changelog module and a separate stylesheet (all in TPDB/, loaded automatically).

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