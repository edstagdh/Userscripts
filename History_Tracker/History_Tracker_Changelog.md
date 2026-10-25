# Changelog

All notable changes to [HF][EMP][PLAB] History Tracker are documented here.
This file is fetched at runtime by the script's "What's New" modal, so keep
each version as a `## vX.Y` header followed by a bullet list of changes.

## v4.0 - 2026-10-25
- New: Pornolab support. Topic pages you open (viewtopic.php) are recorded as visits, and searches on the tracker (tracker.php) are recorded with their search text. Later result pages of the same search aren't counted again.
- Pornolab search results get the 👁 badge and "hide visited", in list view and in [Pornolab] Advanced Viewer Experience's grid view. Rows hidden by its forum / uploader blacklist aren't counted as "visited hidden".
- Pornolab has no BBCode, so a cleaned copy of the topic's first post is saved instead: text formatting, images, spoilers, quotes and links. 🖼 Render shows it in the History window, and "</> Source" shows what was saved.
- Pornolab topics also keep the torrent's size, registration date and status, a "⬇ Download .torrent" link (dl.php holds no passkey; it needs you to be logged in), and the file list, fetched once a week like the site's "Список файлов" button. File lists can be turned off in Settings & data.
- The History window, the search banners, the "↔ Seen on …" button and the offline viewer now cover all three sites, with a PLAB tag and chip.
- Renamed to "[HF][EMP][PLAB] History Tracker". Update the existing script in Tampermonkey's editor to keep your history.

## v3.5 - 2026-10-25
- Offline viewer: torrent details get more of the page. "← Back to the list" (or Esc) now sits in the row with the Searches / Torrents / Settings buttons instead of its own bar.
- Offline viewer: "View on GitHub" moved to the top bar next to 📜 Changelog, and the bottom bar only appears when there's something to save in Settings.
- On the sites themselves the History window is unchanged.

## v3.4 - 2026-10-25
- New offline viewer: open https://edstagdh.github.io/Userscripts/history_tracker_viewer/ to browse your saved history even when both sites are down. The History window opens full-screen there, with both sites' searches and torrents, torrent details and rendered presentations.
- The viewer page is an empty page on GitHub Pages; your history stays in your browser and is only read by the userscript.
- In the viewer, links and searches open the sites in a new tab, and Settings & data shows both sites' storage.

## v3.3 - 2026-10-25
- The History window is much wider (about 90% of the page) and taller, so a rendered presentation shows at full width.
- A rendered presentation no longer scrolls inside the window's own scroll bar: it shows at full length and the window scrolls. The raw BBCode view is taller too.
- Removed the "📋 Copy" buttons (torrent details and the Torrents list); presentations are for rendering here. The script no longer asks for clipboard access.

## v3.2 - 2026-10-23
- Advanced Viewer Experience's Poster Wall: the info pane under the poster in focus now shows a "👁 Visited 3× · last 2 days ago" chip for torrents you've opened, like the badge in list and grid view (grey when the last visit is over 30 days ago).
- Poster Wall: the outline on visited posters now follows the right torrent as the wall reuses posters while you glide, and the hover card no longer pops up over the wall.
- Renamed to "[HF][EMP] History Tracker", like the other EMP_HF scripts.
- The script is now split into files, like Advanced Viewer Experience: history_tracker.user.js plus history_tracker.presentation.js, history_tracker.window.js, history_tracker.changelog.js and history_tracker.styles.css, all loaded and cached by Tampermonkey.

## v3.1 - 2026-10-23
- Settings: "💾 Save & reload" now appears next to the Close button at the bottom of the window as soon as you change something (and disappears if you change it back). While there are unsaved changes, "Close" reads "Close without saving".
- Closing the window with ✕, Esc or a click outside it, or switching to another tab, now asks first when there are unsaved settings.

## v3.0 - 2026-10-23
- Fixed: torrents hidden by Advanced Viewer Experience's blacklists (tags, uploaders, uploader + tag rules) were still counted in "🙈 N visited hidden". Anything another script or the site already hides is no longer counted, in list and grid view.
- The count updates right away when you blacklist (or un-blacklist) something while the page is open.

## v2.9 - 2026-10-23
- Console logging with a level setting (🕘 History → Settings & data → Advanced): Off, Errors only, Warnings and errors (default), Info, or Debug.
- Messages start with the same "[TM]" prefix as Advanced Viewer Experience, followed by "History Tracker:", so you can filter all the scripts' output together or this one alone.
- Info shows what was recorded and saved (visits, searches, presentations with their stored size, imports / exports); Debug adds page detection, reload skipping, time on page, link marking, hiding counts and updates from other tabs.

## v2.8 - 2026-10-23
- New option: hide torrents you've already opened from the site's lists — search results, notifications, top 10, user pages, user history and collages. Turn it on in 🕘 History → Settings & data or from the Tampermonkey menu ("Hide Visited Torrents in Lists"). Off by default.
- Works in both list and grid view of Advanced Viewer Experience, including when you switch between them: visited cards are hidden as soon as they're built.
- A "🙈 N visited hidden · show" switch at the bottom left shows how many are hidden and brings them back on the current page with one click.
- Torrents you open from the page you're on stay visible until the next page load, so the list doesn't shift while you're going through it.
- Fixed: with "Dim the link" chosen as the marking style, dimmed links weren't updated again after the first pass.

## v2.7 - 2026-10-23
- Fixed: the title of the History and What's New windows sat between left and center, because the site's own heading style (centered) leaked in. Titles and subtitles are now aligned to the left.

## v2.6 - 2026-10-23
- Advanced Viewer Experience grid view: the 👁 badge now sits with the card's other badges (▲ seeders ▼ leechers ⤓ snatched size), sized to match them. Cards without those get a row of their own under the title.
- List view: the 👁 badge is back at the end of the title.

## v2.5 - 2026-10-23
- Fixed: the 👁 badge was cut off for torrents with long titles in Advanced Viewer Experience's grid view (titles there are clipped after 3 lines). When a title's container cuts the text short — a line clamp or a single line ending in "…" — the badge now goes in front of the title so it's always visible; elsewhere it stays after the title.

## v2.4 - 2026-10-23
- The History window now shows both sites together: searches and torrents from HappyFappy and Empornium in one list, each tagged HF or EMP, with All / HF / EMP chips to narrow it down (the chip you pick is remembered).
- Typing a search in the History window tells you how often you ran it on each site ("12× on HF, 3× on EMP"). The hint next to the site's search box and the repeat-search notice mention the other site too.
- On a torrent page, a second button shows when a torrent with the same title was opened on the other site; click it for that torrent's history.
- Links to the other site open in a new tab, on the domain you last used for it.
- 👁 badges on torrent links stay per site, since torrent ids aren't shared between the trackers.
- Can be turned off in Settings & data ("Show both sites' history").

## v2.3 - 2026-10-23
- The "← Back to the list" button in torrent details is now amber, so it stands apart from the Searches / Torrents / Settings tabs.

## v2.2 - 2026-10-23
- Saved presentations can now be rendered: "🖼 Render" shows the BBCode formatted (text styles, colors, images, links, spoilers, tables, mediainfo) right in the History window. Hover an image in it to enlarge it. "</> BBCode" still shows the raw code.
- Opening a torrent's details (ℹ️) from History → Torrents now stays inside the History window, with a "← Back to the list" button (or Esc) that returns to the list exactly as you left it: same filter, sort, loaded rows and scroll position.
- Torrent details now show the torrent's title as a link to its page.

## v2.1 - 2026-10-23
- Renamed from "[HF] Visit Tracker" to "History Tracker". Tampermonkey treats a renamed script as a new one with its own storage: export your history from the old script (Settings & data → Export JSON) and import it here; old exports are accepted.
- Added Empornium support (empornium.sx and emparadise.rs, which share one history). HappyFappy keeps its own separate history.
- The History window, buttons and badges now use the look and colors of Advanced Better filelist.
- "🕘 History" moved to the end of the site menu and is highlighted, so it stands apart from the site's own pages.
- Hovering a cover in the History window shows it enlarged (full-size for hamsterimg / imgbox / pixhost thumbnails). Can be turned off in Settings & data.
- New: saves each visited torrent's presentation as BBCode (on by default, from your latest visit only). Can be set to keep a new copy whenever the presentation changed, up to N copies per torrent. Stored compressed and limited to the 300 most recently visited torrents (configurable).
- Copy or view a saved presentation from the torrent's details (ℹ️ in History → Torrents, or the 👁 button on its page), or copy it straight from the 📋 button in the list.
- Added this changelog: a "What's New" window after updates, the 📜 Changelog button in the History window and the "📜 Show Changelog" menu command.

## v2.0 - 2026-10-23
- History is now stored locally in Tampermonkey; no server needed.
- 👁 button on torrent pages: how often and when you opened it before, with every visit and the time spent on the page.
- 👁 badges on links to torrents you've opened; hovering a badge shows your last visit.
- "History" in the site menu: searchable search history (run a search again or search for something new), the torrents you've opened, settings, and export / import.
- Notice when you repeat a search, and a "searched before" hint next to the site's search box.

## v1.0 - 2026-10-22
- First version: recorded visits to localstorage.
