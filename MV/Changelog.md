## v1.0
- First release: an "▦ All videos" button on creator store pages (/Profile/<id>/<name>/Store/Videos) opens a full-screen viewer with every video of the store.
- Loads the full lists from the ManyVids API (regular videos, mobile/vertical videos and bundle membership) — no infinite scroll, nothing disappears.
- Mobile videos are merged into the same grid / table and marked with a "Mobile" badge.
- Grid: 5 per row by default (3–8 selectable), full titles, uncropped thumbnails, hover preview clip.
- Table: sortable columns (ID, title, kind, bundle, price, duration, views, likes, release date).
- Filters: title search (-word excludes), regular / mobile, bundle, free / paid / on sale, price range, duration range (minutes), release date range, hide AI.
- Details popup per video (ⓘ): teaser, resolution, file size / format, tags, description, flags, the API request URL and the raw JSON response with copy buttons.
- If the API can't be reached, falls back to the first page of each list embedded in the page and says so.
