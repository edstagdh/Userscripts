# [HF][EMP] Advanced Viewer Experience — Changelog

Format: each version is a `## v<version>` heading followed by a bullet list of
changes. The userscript parses this file directly, so keep that structure —
one `##` heading per version, one `-` bullet per change entry.

## v3.8 - 2026-10-22
- Toned down the uploader name and button badges: muted dark teal/red backgrounds with softer text, no glow; they brighten slightly on hover.

## v3.7 - 2026-10-22
- Uploader name is now a bright cyan badge, matching the tag-block button (gallery cards and list view).
- The block-uploader button is now a bright red "✕" badge, same size and style as the tag-block button.
- List view: the two uploader buttons are now grouped, equally sized and vertically aligned next to the name instead of sitting loosely after it.

## v3.6 - 2026-10-22
- The per-uploader tag-block button is now a bright cyan "#" badge that stays fully visible regardless of the site theme (previously a faint emoji icon).

## v3.5 - 2026-10-22
- New tag-block icon next to the uploader name (gallery cards and table view): opens a dropdown filled with that item's tags, plus a free-text field, to block tags for that uploader only.
- The popup asks for a duration (permanent, 1, 3, 7, 30 days or custom) and lists the uploader's existing tag rules so they can be removed in place.
- On pages without an uploader column (e.g. notifications), the icon is placed after the uploader's profile link in the title cell when one exists.

## v3.4 - 2026-10-21
- New "Uploader + Tag Rules": block a tag for one specific uploader only. A tag listed under an uploader hides only items uploaded by that uploader.
- Rules are applied in order: global Tag Blacklist (everyone) first, then the Uploader Blacklist, then per-uploader tag rules.
- Add rules from Viewer Settings, or from the gallery Tags popup: set the click action to "Blacklist tag for this uploader only", or Shift+click a tag in the normal blacklist mode.
- Per-uploader tag rules support the same durations as uploader blocks (permanent, 1, 3, 7, 30 days or custom) and expire automatically.
- Uploader detection now also falls back to the profile link in the title cell, for pages without an uploader column (e.g. the notifications page).

## v3.3 - 2026-10-15
- Uploader blacklist now supports timed blocks: clicking the block button (or adding an uploader in Viewer Settings) opens a duration popup — Permanent (default), 1, 3, 7, 30 days or a custom number of days.
- Timed blocks expire automatically; the uploader's rows/cards reappear without needing a reload.
- Viewer Settings now shows the time remaining next to each timed uploader block (hover for the exact expiry date).
- Existing blacklisted uploaders are kept and remain permanent.

## v3.2 - 2026-07-28
- Fixed Manual "Show Changelog" menu.

## v3.1 - 2026-07-28
- Split Changelog into external file. 

## v3.0
- Fixed small issue with gallery grid view when hovering on cards title on the bottom right corner of the viewport.

## v2.9
- Added version number to settings menu header.

## v2.8
- Changed font size of title in cards in Gallery View.
- Added Dark Mode toggle to Gallery View cards, Enabled by default.

## v2.7
- Added Favorite Tags list: rows/cards whose tags include any favorite tag glow in a custom color.
- Glow color is configurable from a palette of 9 glow-friendly colors (gold, cyan, green, pink, purple, orange, red, teal, white) in Viewer Settings.
- New setting: Tag Click Action — choose whether clicking a tag chip in the Tags popup blacklists it (default behavior) or adds it to favorites. The popup shows a hint and three chip states: red=blacklisted, gold=favorite, grey=neutral.
- Tags are mutually exclusive between blacklist and favorites — adding to one removes from the other.
- Gallery cards now always show the uploader name, even on pages with no dedicated uploader column (collage, notifications), extracted from the torrent overlay data.
- Added guard: "anon" can never be blacklisted or blocked as an uploader.
- Username Link: in pages where no uploader name is displayed, the hyperlink to the uploader profile page will have cooldown.

## v2.6
- Added Uploader Blacklist: uploads from blacklisted uploaders will be hidden in both list and grid view.
- Gallery grid card footer: uploader name shows a ⛔ block button on hover. Click it to instantly blacklist that uploader.
- Table list view (pages with an uploader column): a ⛔ block button appears next to each uploader name.
- Uploader names extracted from the overlay script on pages without a dedicated uploader column (collage, notifications) so blocking works everywhere.
- New Uploader Blacklist section in Viewer Settings: manually add usernames, remove via chips, or clear all.

## v2.5
- Added Tag Blacklist feature: rows whose tags match any blacklisted tag are hidden in both list and grid view. Blacklist data is stored persistently via GM_setValue and is saved across configured domains.
- Added Tags hover button in gallery cards: hovering shows a popup of all tags for that torrent. Clicking a tag name chip in the popup toggles its blacklist state and refreshes the results for that page.
- Added Tag Blacklist section in Viewer Settings: add/remove tags, clear all, live chip editor. Controls are disabled with a note on pages with no tags, meaning this feature requires tags to be enabled in settings.
- Download and Tags buttons now share the same button row in gallery cards.
- Added change log notice on updates.

## v2.4
- Fixed missing/invalid categories on items in userhistory.php (subscribed collages) for both list and grid mode.
- Added blue Download button in gallery cards (separate from the icon that can be obscured by the thumbnail).
- Fixed top10.php grid view which showed incorrect data values in cards.

## v2.3
- Fixed gallery column mapping for torrents.php?action=notify (leading checkbox column was shifting cat/title offsets).
- Fixed gallery showing only the first filter group on the notify page (now renders one grid per filter group).
- Fixed gallery column mapping for requests.php (votes, bounty, filled status now display correctly).
- Gallery grid container changed from ID to class so multiple grids can coexist on one page.

## v2.2
- Added quick-edit Viewer Settings button next to username in the nav bar.
- Renamed script, updated namespace, added installURL, updated domain URLs.