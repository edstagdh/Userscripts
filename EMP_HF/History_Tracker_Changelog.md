# Changelog

All notable changes to History Tracker are documented here.
This file is fetched at runtime by the script's "What's New" modal, so keep
each version as a `## vX.Y` header followed by a bullet list of changes.

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
- First version: recorded visits to a localstorage.
