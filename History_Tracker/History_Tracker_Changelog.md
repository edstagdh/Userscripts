# Changelog

All notable changes to [HF][EMP][PLAB][SC] History Tracker are documented here.
This file is fetched at runtime by the script's "What's New" modal, so keep
each version as a `## vX.Y` header followed by a bullet list of changes.

## v4.7 - 2026-10-26
- New: daily backup to your own Filester account (Settings & data → Backup to Filester). Enter your API key (filester.me → Account settings) and turn it on.
  - Once a day it uploads your whole history, compressed: the same data as "Export JSON", but without your settings or the key. It goes into a private folder ("History Tracker backups", created if missing).
  - Backups beyond the number you choose (30) are deleted. Filester also removes files nobody opened for 45 days.
  - Buttons: Test connection, Back up now, and Show backups (with links).
  - To restore: download a backup, then use ⬆️ Import JSON…, which now reads .json.gz files too.
- History window: Torrents (HappyFappy, Empornium, Pornolab) and Threads (SimpCity) are now separate tabs. The Threads tab also shows each thread's forum, pages, and pages saved.
- "Save all pages" panel: the "All N pages" / "Missing" buttons for a second thread sometimes didn't react while another thread was being saved. The panel was redrawn several times a second and replaced the button under the mouse; now only the progress text updates.
- "Save all pages" panel: drag it anywhere by its title bar (the position is remembered), and collapse it to a one-line progress bar with "–", so it doesn't cover the History window.

## v4.6 - 2026-10-26
- SimpCity: search inside a thread. A thread's details (🕘 History → ℹ️) have a search box above its saved pages. It finds text (or an author) in all saved pages of the thread and lists the matching posts with page, post number, author, date and a highlighted snippet. Click one to open that page at the post. The text is highlighted in every saved page you open while the search is on. Works in the offline viewer too.
- SimpCity: the thread image in a thread's details is twice as big.
- New in Settings & data: an "Interface size" slider (70–200%) for the History window, the What's New window and the "Save all pages" panel. It previews live as you drag.

## v4.5 - 2026-10-26
- History window: the buttons on each row (🕘 times, ℹ️ details, ✕ forget / remove) are bigger and outlined, and ✕ sits further away from the others, so it's harder to hit by mistake.

## v4.4 - 2026-10-26
- Fixed: "📥 Save all pages" from the Watched Threads list stopped with "SimpCity answered 404 on page 2". The list's links go to a thread's latest post (…/latest?new=1), and the page addresses were built from that. They're now built from the thread's own address (…/threads/name.123/page-2), also for threads already in your saved watched list.

## v4.3 - 2026-10-26
- New on SimpCity: "📥 Save all pages" saves every page of a thread, to read the whole thread later in 🕘 History (also in the offline viewer). It's next to the 👁 button on a thread, and on each row of your Watched Threads list, with how many pages are saved already ("📥 3/24 pages").
- Choose "Missing + last page" (pages not saved yet, plus the last one for new posts) or "All pages". Several threads can be queued.
- It goes one page at a time with random waits: 1–3 s between pages, and a longer 3–5 s pause every 5–10 pages, all adjustable in Settings & data. It stops at the first error, check page, rate limit or sign of being logged out, and never retries. Only one tab runs it at a time.
- A panel at the bottom right shows the progress (page, countdown to the next one, queued threads), with Pause and Stop. Closing or leaving the tab while it runs asks first. Everything saved until then is kept, and "Missing + last page" carries on from there.
- Pages saved this way are kept apart from the "saved thread pages kept" limit. A thread's details have a new "Delete saved pages" button.
- Hover enlarging now has two switches: covers & thumbnails (on), and images inside rendered presentations / saved posts (now off by default, since those are shown full size).

## v4.2 - 2026-10-26
- Saved SimpCity pages now show embedded videos as players (loaded when you scroll to them) instead of only their address. Players run sandboxed: they can't open pop-ups or leave the page. Direct video files get the browser's own player.
- Offline viewer: images from hosts that only serve visitors of the forum (SimpCity's) were blocked there. When an image fails, it's now fetched again through Tampermonkey with your normal cookies, and with the forum as referrer. Tampermonkey asks once to allow those image hosts. This works for saved pages, thread thumbnails and the enlarged hover view.

## v4.1 - 2026-10-25
- New: SimpCity support (simpcity.cr). Opening a thread records a visit with the page number, and searches (/search/…) are recorded, including searches inside one thread ("1 · in “Zarina Noir”").
- SimpCity watched threads: each page of your Watched Threads list you open is saved: thumbnail, prefixes, forum, starter, replies, views, pages, and the last post's date and author. The History window has a new ⭐ Watched tab, sorted by last post, that marks threads with new posts since your last visit and shows how far you've read.
- SimpCity thread pages: the posts of each page you open are saved (that page only), cleaned like Pornolab's first post: text, images, spoilers, quotes, link previews as plain links, embedded players as links, and the forum's /redirect/ links turned back into the real addresses. "🖼 Read" in the thread's details shows them, even in the offline viewer. The newest 200 pages are kept (configurable).
- The script never sends a request to SimpCity: it only reads the pages you open, so its rate limits aren't touched.
- SimpCity lists: thread links get the 👁 badge, which turns amber ("👁 3 · new") when the thread has posts newer than your last visit.
- New in Settings & data: turn recording on or off per site (HappyFappy, Empornium, Pornolab, SimpCity). A site that's off records nothing new, but its badges and History window keep working.
- Pornolab now has its own PLAB tag color, and SimpCity's is SC.
- Fixed: importing a backup now also replaces the Pornolab history in the file.
- Renamed to "[HF][EMP][PLAB][SC] History Tracker".

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
