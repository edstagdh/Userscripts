## v1.7
- Like / dislike / follow moved next to the playlist's title (left side) and now look like the Details / Tags / Stars buttons, so nothing overlaps at higher browser zoom (e.g. 120%).
- The header adapts to narrow windows and browser zoom: the filter buttons wrap onto the next line instead of being cut off, and "Open playlist" becomes an icon button.
- Table view: hovering a thumbnail plays the preview in a popup 150% the size of the thumbnail, with the sound / volume controls. Clicking it opens the video; moving away or scrolling closes it.
- Preview volume now changes in 1% steps (on the preview and in Settings); the slider on the preview is a bit wider.

## v1.6
- Like, dislike and follow playlists right from the popup header, with live counts. Click again to remove your like / dislike or to unfollow. Uses the same requests as the site's own playlist page.
- Your current vote and follow state are shown when the popup opens (when you're signed in).
- If you're signed out, the buttons tell you to sign in instead of failing silently.
- Requests now go out like the site's own (with your login), so your vote / follow state is known.
- Playlists are always loaded in full: the site's playlist data can arrive in pages of 50, and the script now asks for the full list when that happens.
- Slightly faster loading: the details of the first videos that come with the playlist are used directly instead of being looked up again.

## v1.5
- Much lighter on the GPU / CPU while the popup is open; nothing removed.
- The site behind the popup is no longer drawn while the popup is open (its animations, ads and videos kept the GPU busy underneath); it comes back exactly as it was when you close the popup.
- No more blur effects: the popup backdrop and the buttons on the site's playlist cards used a live blur, which the GPU recalculates on every frame.
- No more endless shimmer animations on loading placeholders and the loading bar (up to 100+ animations running at once on a page of placeholders).
- The loading bar no longer forces the page to be re-laid-out ~60 times a second while a playlist loads.
- Cards that are scrolled out of view aren't drawn (big pages such as 500 per page stay smooth).
- Icons are much simpler (about 25% fewer page elements per card).
- No zoom / lift animation on card hover (it rescaled full-size thumbnails); the border highlight stays.
- Less background work: the script no longer re-scans the page because of its own changes, and the header's tag / star / uploader counts refresh at most every 1.5 s while a playlist is loading.

## v1.4
- Preview volume now defaults to 20% (was 50%; if you never changed it, it moves to the new default).
- The preview keeps your volume even if the site tries to change it (previews could start at 100%).
- Volume slider on the playing preview: hover the speaker button to open it. Changes are saved and used for every preview.
- Settings → Hover preview: the volume slider comes first; "Start previews muted" stays available.
- Filter lists (Tags, Stars, Uploaders, Music, Creators): entries no longer squeeze together or overlap in long lists; more spacing and the counts sit in their own badge.

## v1.3
- Hovering a video's thumbnail plays its preview clip (in the grid, the table and the playlist player's side list).
- Settings → Hover preview: turn it on / off, play muted or with sound, preview volume, and how long to hover before it starts.
- A speaker button on the playing preview toggles the sound (and remembers it).
- Videos without a preview clip simply keep their thumbnail.

## v1.2
- "What's New" now works like the other scripts: same design, shows on first install and after every update, and "📋 Show Changelog" in the Tampermonkey menu.
- Video links now use the site's own format (/video/title-slug_id); the slug matches the site's exactly.
- Repairs the site's playlist player (/video/…?playlist=…&index=…), which only knows the first 50 videos of a playlist:
- Counter shows the real position ("Video 722 of 1,234" instead of "Video 722 of 50").
- Previous / Next work across the whole playlist (the site disabled Next past video 50).
- Theater button toggles the site's theater mode (the site's link led to a "page not found").
- The side list shows the videos around the current one (current video highlighted) with "Show earlier" / "Show more", instead of always videos 1–50.
- Goes to the next playlist video when one ends.
- "All videos" button on the player opens the viewer on the page of the current video, highlighted.
- New settings to turn the player repair and the auto-advance off.

## v1.1
- Clicking a playlist card now opens the viewer. A small "Playlist" button on the card opens the playlist itself (Ctrl / middle click on the card also still open it in a new tab). Can be switched back in Settings.
- "Open playlist" button in the popup header.
- Popup is now 95% of the page.
- Much thinner header: title, owner and key stats on two lines. Details, Tags, Stars, Uploaders, Music and Creators are dropdowns — hover for the top 15, click for the full list (filter, sort by count or A–Z, click to add / remove a filter).
- Counts in the tag / star lists no longer touch the names.
- Text size moved to Settings and now only scales the videos (grid / table), so the slider stays in place while you drag it.

## v1.0
- First release.
- "Videos" button on every playlist card (Playlists page, profiles and anywhere else cards appear), plus an "All videos" button on a playlist's own page. Works with the site's in-page navigation.
- Popup (90% of the page) with the playlist's info: thumbnail, owner, description, video count, total length, views, score, creation date, top tags / stars / uploaders.
- Grid view (cards like the site's) and table view (sortable columns).
- Search across the whole playlist, not just the current page: title, uploader, tags, stars, creators, music, description. Supports "exact phrases", -exclude and tag: / star: / by: / music: / creator: / title: filters. Click any tag, star or uploader to filter by it.
- Sort by playlist order, title, uploader, length, views, likes, score or upload date.
- Pagination (24–500 per page) with first / last, page numbers and go-to-page. ← / → change page, / focuses search, Esc closes.
- Built for very large playlists (10k+): videos load in batches of 100 and appear as they arrive; search and sort work on what's loaded so far. Loading can be stopped and resumes where it left off.
- Text size slider (70–200%).
- Each video links to the video on its own and inside the playlist; link formats are editable in Settings.
- "What's New" popup after updates.
