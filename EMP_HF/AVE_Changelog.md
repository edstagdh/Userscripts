# [HF][EMP] Advanced Viewer Experience — Changelog

Format: each version is a `## v<version>` heading followed by a bullet list of
changes. The userscript parses this file directly, so keep that structure —
one `##` heading per version, one `-` bullet per change entry.

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