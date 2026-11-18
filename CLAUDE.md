# Phieu.work

Personal media hub blog by **Phieu-Tran** (GitHub: [Phieu-Tran](https://github.com/Phieu-Tran)).

## Project overview

A static blog built with **Astro** that aggregates media tracking (anime, games, films) and personal blog posts. Auto-syncs from MAL, TMDB, Steam, and IGDB weekly; IMDb CSV imports are supported manually for bulk film updates.

- **Live site**: https://blog.workspacesbeat.io.vn
- **Repo**: https://github.com/Phieu-Tran/blog
- **Hosting**: Cloudflare Pages (auto-deploy on push to `main`)
- **Domain**: `workspacesbeat.io.vn` (DNS on Cloudflare, subdomain `blog`)

## Tech stack

- Astro 5.x (static output)
- Vanilla CSS (dark theme, no Tailwind)
- TypeScript content collections
- `@astrojs/sitemap` + `@astrojs/rss`

## 5 sections + Steam page

| Section | Directory | Source | Color | Layout |
|---------|-----------|--------|-------|--------|
| **Anime** | `src/content/anime/` | MAL (scrape) | `#A78BFA` | My Score vs MAL Score, progress bar, MAL link |
| **Games** | `src/content/games/` | Steam + IGDB | `#34D399` | IGN-style score, playtime, IGDB/IGN/Metacritic/Steam links |
| **Films** | `src/content/films/` | IMDb CSV + TMDB account | `#FB923C` | 3 scores (My/IMDB/TMDB), IMDB+TMDB links |
| **Books** | `src/content/books/` | Manual (Goodreads planned) | `#F472B6` | My Score + Goodreads score, author/translator, Goodreads/Open Library links |
| **Music** | `src/content/music/` | Spotify saved albums + manual (YouTube Music) | `#FACC15` | Square album art, My Score, favorite tracks, Spotify/YouTube Music links, OST ↔ source media |
| **Posts** | `src/content/posts/` | Obsidian | `#38BDF8` | Blog list, tags, prose |
| **Steam** | `/steam/` page | Steam API | Steam blue | Steam-style profile, playtime bars |

## Accounts & APIs

| Platform | Username/ID | Purpose |
|----------|-------------|---------|
| MAL | `Rinmatsouka` | 444+ anime, sync via page scrape |
| TMDB | `Rinmatsouka` (ID: 22939480) | Rated movies/TV, metadata enrichment |
| IMDB | `ur200491176` | Ratings imported from CSV when available, including movie/TV type |
| Steam | `76561198436321684` | 61 games, playtime, library sync |
| IGDB | Twitch API app | Game metadata enrichment by Steam AppID / IGDB ID / exact title |

### GitHub Secrets & Variables

| Name | Type | Purpose |
|------|------|---------|
| `TMDB_API_KEY` | Secret | TMDB API v3 key |
| `TMDB_SESSION_ID` | Secret | TMDB authenticated session |
| `STEAM_API_KEY` | Secret | Steam Web API key |
| `IGDB_CLIENT_ID` or `TWITCH_CLIENT_ID` | Secret | Twitch/IGDB client ID for game metadata |
| `IGDB_CLIENT_SECRET` or `TWITCH_CLIENT_SECRET` | Secret | Twitch/IGDB client secret for game metadata |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Secret | Spotify Developer app (redirect URI `http://127.0.0.1:8888/callback`) |
| `SPOTIFY_REFRESH_TOKEN` | Secret | From `npm run spotify-auth`; read-only scopes `user-library-read user-read-recently-played playlist-read-private playlist-read-collaborative user-top-read` |
| `LASTFM_API_KEY` | Secret | Last.fm read-only API key (listening history) |
| `LASTFM_USERNAME` | Variable | Last.fm user (`Phieuwork`) |
| `MAL_USERNAME` | Variable | MAL username |
| `TMDB_ACCOUNT_ID` | Variable | TMDB account ID |
| `STEAM_ID` | Variable | Steam user ID |
| `SYNC_DELETE_MISSING` | Env/Variable | Optional; set `false` to disable guarded MAL/TMDB local deletes |
| `SYNC_MAX_AUTO_DELETE` | Env/Variable | Optional; maximum guarded local deletes per source, default `20` |
| `SYNC_DELETE_DRY_RUN` | Env/Variable | Optional; set `true` to report delete candidates without removing files |
| `SYNC_REPORT_DIR` | Env/Variable | Optional; sync report output directory, default `.sync` |

## Scripts

| Command | Script | Description |
|---------|--------|-------------|
| `npm run sync` | `sync-all.mjs` | **Main** — sync all (MAL + TMDB movies/TV + Steam + IGDB + covers + build check) with progress bar |
| `npm run sync-mal` | `sync-mal.mjs` | Anime only (MAL scrape) |
| `npm run sync-imdb` | `sync-imdb.mjs` | Import films/TV from an IMDb ratings CSV; `--enrich-existing` refreshes TMDB metadata by IMDb ID |
| `npm run sync-imdb-to-tmdb` | `sync-imdb-to-tmdb.mjs` | Dry-run sync IMDb-backed repo ratings back to TMDB account; destructive deletes require explicit confirmation |
| `npm run sync-tmdb` | `sync-tmdb.mjs` | TMDB list/metadata helper for films |
| `npm run sync-steam` | `sync-steam.mjs` | Games from Steam library |
| `npm run sync-igdb` | `sync-igdb.mjs` | Enrich games from IGDB metadata |
| `npm run import-igdb-gdpr -- path/to/index.html` | `import-igdb-gdpr.mjs` | Import personal IGDB GDPR ratings/played export; `--delete-missing` prunes only IGDB-personal non-Steam games absent from the export |
| `npm run normalize-games` | `normalize-game-frontmatter.mjs` | Normalize game `source`/`platform` frontmatter |
| `npm run fetch-data` | `fetch-media-data.mjs` | Fetch missing covers |
| `npm run spotify-auth` | `spotify-auth.mjs` | One-time Spotify login; writes `SPOTIFY_REFRESH_TOKEN` to `.env` (never printed) |
| `npm run sync-spotify` | `sync-spotify.mjs` | Spotify saved albums, own playlists and Liked Songs → `src/content/music/` (`-- --dry` to preview); also step 4b of `sync-all` |
| `npm run sync-lastfm` | `sync-lastfm.mjs` | Last.fm scrobbles → `src/data/listening/<year>.jsonl` (incremental); also step 4c of `sync-all` |

### sync-all.mjs flow

```
1. Anime (MAL)     — scrape animelist page
2. Films/TV (TMDB) — fetch rated movies and rated TV from TMDB account
3. Games (Steam)   — fetch owned games + playtime
4. Games (IGDB)    — map Steam AppIDs through IGDB and refresh game metadata
5. Guarded deletes — remove missing MAL/TMDB-managed files only when upstream is non-empty and the count is safe
6. Missing covers  — scan files → fetch from TMDB
7. Build check     — run astro build → pass/fail
8. Summary         — print all results + total time
9. Sync report     — write `.sync/sync-report.md` and `.sync/sync-report.json`

The GitHub workflow then runs `sync-imdb --enrich-existing` and a final `npm run build`
before committing changes.
```

## Key decisions

- **MAL sync uses page scraping**, not Jikan API (Jikan caches 404s for hours).
- **Films have 3 scores**: My Score (from IMDb CSV or TMDB account rating), IMDB Score (from IMDb CSV), TMDB Score (from TMDB vote_average).
- **IMDb CSV and TMDB account ratings are both valid film sources**. IMDb CSV is best for bulk import; TMDB keeps weekly automatic updates working when no CSV export is available.
- **IMDb ID is the identity anchor for CSV imports**. `sync-imdb` uses TMDB `/find/{imdb_id}` for enrichment, never title search.
- **TMDB identity is `tmdb_id` + `tmdb_type`** (`movie` or `tv`) so TV IDs do not resolve through TMDB movie endpoints.
- **Weekly sync reads both TMDB rated movies and rated TV**, then enriches IMDb-backed films/TV with TMDB IDs, TMDB scores, and poster covers using the GitHub `TMDB_API_KEY` secret.
- **Weekly sync has guarded delete flow for MAL/TMDB only**: entries missing upstream are removed from local content only when the upstream list is non-empty and delete count is at or below `SYNC_MAX_AUTO_DELETE` (default `20`). Use `SYNC_DELETE_DRY_RUN=true` to report candidates without removing files. Steam files are not auto-deleted.
- **Sync report**: weekly GitHub Actions uploads `.sync/sync-report.md/json` as an artifact and appends the Markdown report to the run summary.
- **IMDb/content can be pushed back to TMDB** with `sync-imdb-to-tmdb`. It plans changes by default; deleting old TMDB account ratings requires `--apply --delete-extra` and `CONFIRM_TMDB_DELETE=DELETE`.
- **Games source/platform split**: `source` is the personal/library source (`steam`, `igdb`, or `manual`); `platform` is the game platform shown on the site (`PC`, `PlayStation`, `Xbox`, `Nintendo`, `Multi-platform`, etc.). Steam sync sets `source: steam` and updates AppID/playtime/recent activity; it must not write `platform: Steam`. IGDB is the metadata source and updates `igdb_id`, `igdb_slug`, external URLs, `genre`, `studio`, `publisher`, `year`, `platform`, `cover`, and `igdb_score` by Steam AppID, existing `igdb_id`, or exact title match, while keeping local `rating`, `status`, and body notes. IGDB GDPR import can update personal `rating`, `source: igdb`, `igdb_personal`, and Played-list status.
- **IGDB personal import workflow**: IGDB has no official user-library API for automatic list/rating sync. Use the GDPR export `index.html` as the personal game input: `npm run import-igdb-gdpr -- path/to/index.html --delete-missing --max-delete=200`, then run `npm run sync-igdb` where IGDB/Twitch credentials are available to enrich new entries. Use `--delete-dry-run` before pruning when auditing candidates. Pruning only removes IGDB-personal non-Steam entries, and preserves Steam-backed games (`source: steam` or `steam_appid`) because Steam remains a separate library source.
- **Creator credits**: Detail pages for Anime, Games, and Films support optional manual `director`, `creator`, `writer`, `composer`, and `author` fields. Sync preserves local credit fields unless a trusted source explicitly fills them. TMDB fills film/TV `director`/creator automatically where available; IGDB fills game developer/publisher, not personal credits.
- **Post/media relations**: Blog posts can define `related_media` entries in the form `anime:slug`, `games:slug`, or `films:slug`. Anime/Game/Film detail pages only show related posts from this explicit field, avoiding fuzzy title matches that link the wrong article.
- **Game detail external links**: Game detail pages show IGDB, IGN, Metacritic, Steam, and Official links. IGDB/Steam/Official are metadata-backed when available; IGN/Metacritic fall back to search URLs. IGDB does not expose stable game director/composer/writer/creator fields, so automated sync fills developer/publisher and leaves optional creator credit fields for manual or future sources.
- **Steam page** (`/steam/`) has dedicated Steam-style UI separate from Games list.
- **Steam recent behavior**: `sync-steam` updates Steam-backed games whenever `npm run sync-steam` or the main weekly `npm run sync` runs. It fetches owned games plus Steam recently played data; `steam_recent` is `true` only when Steam returns that AppID in the recent list for that sync, and `steam_recent_hours` is derived from recent playtime. If an owned game is no longer returned as recent, the next Steam sync sets `steam_recent: false`. Steam-backed files are not auto-deleted when absent from Steam results; deletion is manual.
- **List filter URLs**: Anime, Games, and Films list filters write their state into the URL (`q`, `genre`, `status`, `source`, `platform`, `sort`, `quick`) using `history.replaceState`, so refresh/back/share keeps the current view without adding noisy browser history entries.
- **Game duplicate guard**: `npm run check:site` fails if two game files share the same `steam_appid` or `igdb_id`. This prevents Steam/IGDB syncs from silently recreating duplicates such as separate Disco Elysium entries.
- **Deploy marker**: The shared footer prints the short Cloudflare/GitHub commit SHA and UTC build time. On Cloudflare Pages it reads `CF_PAGES_COMMIT_SHA`; local builds fall back to `local`.
- **Clean detail URLs**: collections use the `glob` loader in `src/content.config.ts`, so entry ids and URLs have no `.md` suffix (`/anime/akira/`). `public/_redirects` holds a frozen 301 list for the 993 old `.../slug.md/` URLs; new entries never need one.
- **Cloudflare Pages headers**: `public/_headers` caches hashed `/_assets/*` as immutable and post/crowd images for a week.
- **Post hero image**: a post only renders a hero when frontmatter `cover` is set and differs from the first body image; otherwise the first body image doubles as OG image only.
- **Obsidian callouts**: `src/lib/remarkCallouts.mjs` (registered in `astro.config.mjs`) renders `> [!info] Title` blockquotes as styled `.callout` boxes.
- **UI language**: navigation chrome (filters, quick filters, section labels, back links, search) is Vietnamese; data labels and the Steam page stay English.
- **Card covers**: `MediaCard` swaps Steam landscape `header.jpg` for the portrait `library_600x900.jpg` and falls back to the original on error. Unrated items (`rating: 0`) show "Chưa chấm" instead of empty stars. The "Thiếu ảnh bìa" quick filter only renders when some entry lacks a cover.
- **Cover accent colors**: `npm run cover-colors` (`extract-cover-colors.mjs`, also run by the weekly sync) samples one accent per cover into `src/data/cover-colors.json`, keyed by `collection/id` and re-fetched only when the cover URL changes. Detail pages apply it as `--accent` via `src/lib/coverColors.ts`; near-monochrome covers store `null` and fall back to the section color.
- **Cover morph transition**: the detail poster has `view-transition-name: media-cover`; `BaseLayout` assigns the same name to the clicked card image on demand (and to the matching card when navigating back), because a title can appear twice on one page and duplicate names cancel the transition.
- **Homepage layout**: hero (title, 5 stat cards incl. Books, cover crowd) is fixed; below it come the "Đang theo dõi" strip, 3 featured posts (lead card + 2), then one horizontal shelf per collection (Anime/Games/Films/Sách) with a "Mới thêm / Điểm cao" toggle, then projects + contact. Shelf cards (`ShelfCard.astro`) glow with the cover's accent from `cover-colors.json`. Homepage-only styles live in `src/styles/home.css`.
- **Books collection**: `src/content/books/` (kept in git via `.gitkeep`; the empty-collection build warning is expected until the first book is added). Status `reading|read|plan|dropped`; `goodreads_id` is the reserved identity anchor for a future Goodreads CSV/RSS import. Books join search, OG images, cover colors and `related_media` (`books:slug`).
- **Stats page** (`/stats/`, `src/pages/stats.astro`): build-time personal stats for Anime/Games/Films/Books (score distribution, top genres, release decades, my score vs community, plus top authors for books) as CSS-only charts in small multiples, one section color each, with hover/focus tooltips and a table view. No chart library.
- **Post images are WebP**: images referenced by posts live in `public/posts/` as `.webp` (max 1600px wide, quality 80). Convert new Obsidian exports before committing. `src/lib/rehypeLazyImages.mjs` lazy-loads every markdown image after the first.
- **Spotify top page** (`/music/top/`): Top tracks / artists / genres for 4 weeks, 6 months, 12 months from Spotify's `/me/top` API (the same source Stats for Spotify uses), written by sync-spotify to `src/data/spotify-top.json`. Each item keeps `prev` (rank at the previous sync) for ↑/↓ arrows; history of rankings only starts from our first sync. Empty ranges mean too little recent listening. Spotify no longer returns artist genres to new apps, so genres come from Last.fm `artist.getTopTags` (cached 90 days in `src/data/artist-tags.json`, max 400 lookups per run, variants like Vietnam/Vietnamese and RnB/R&B folded together).
- **Listening history** comes from Last.fm, not Spotify: Spotify's API only exposes the last 50 plays, while Last.fm keeps every scrobble (Spotify, plus YouTube Music via the Web Scrobbler extension). History before Last.fm was connected needs a one-off import of Spotify's "Extended streaming history" export.
- **Music collection**: one entry per album/EP/OST/playlist (`kind`); Spotify sync also creates one `playlist` entry per own playlist plus Liked Songs (`spotify_id: liked`), with tracklists in `src/data/spotify-tracks.json`, identity anchor `spotify_id`. Spotify sync owns title/artist/year/tracks/label/cover/`spotify_recent`, fills `genre`/`kind` only when missing (titles with Soundtrack/OST become `kind: ost`), and never touches `rating`, `favorite_tracks` (`;`-separated), `soundtrack_of`, `aka` or body notes. Recently played albums become `listening`; a sync-set `listening` returns to `listened` when it drops out. Albums removed from the Spotify library are not auto-deleted. YouTube Music has no library API, so those albums are manual (`source: youtube`, `youtube_url`). `soundtrack_of: "anime:your-name; films:x"` links an OST both ways: the album shows "Nhạc của" chips and the source detail page shows a "Nhạc phim" block (`SoundtrackLinks.astro`). Posts can use `related_media: ["music:slug"]`.
- **Alternate titles**: every collection accepts `original_title`, `en_title` and `aka` (manual, names separated by `;`); the schema coerces numbers to strings. Sync fills them only when they differ from `title`: MAL romaji `anime_title` → anime `original_title`; TMDB `original_title/name` + English translation (`append_to_response=translations`) → films; IMDb CSV "Original Title" → films. Helpers: `src/scripts/alt-titles.mjs` (sync) and `src/lib/altTitles.ts` (site). Global search, list filters (`data-search`) and the "Also known as" meta card all use them, so "Love Letter" finds "Thư Tình".
- **Post reading aids**: post pages show "N phút đọc" (~220 words/min) and, when a post has ≥3 h2 headings, a table of contents: sticky sidebar with scroll-spy at ≥1180px, collapsible block between header and body on smaller screens.
- **Frontmatter title always quoted** — prevents YAML numeric title parsing.
- **sync-all includes build check** — exits with error code if build fails.
- **on_hold status** separated from watching for anime.
- **updated_at** field for anime — Now Active sorted by most recent update.
- **Obsidian posts** imported from the local Obsidian media vault — Obsidian links cleaned.

## File structure

```
src/
├── content/
│   ├── anime/          ← 444+ files (MAL sync)
│   ├── games/          ← Steam library + IGDB metadata + manual ratings
│   ├── films/          ← 240+ files (IMDb CSV import + TMDB account/enrich + 3 scores)
│   └── posts/          ← 23 files (Obsidian import)
├── components/
│   └── MediaCard.astro
├── layouts/
│   └── BaseLayout.astro  ← SEO, OG tags, hamburger nav, 6 nav items
├── pages/
│   ├── index.astro       ← home (active, stats, posts, recent media)
│   ├── 404.astro
│   ├── steam.astro       ← Steam-style profile page
│   ├── anime/            ← list + detail (dual score, progress, MAL link)
│   ├── games/            ← list + detail (IGN-style, playtime, Steam link)
│   ├── films/            ← list + detail (3 scores, IMDB+TMDB links)
│   └── posts/            ← list + detail (tags, prose)
├── scripts/
│   ├── sync-all.mjs      ← main sync (MAL + TMDB + Steam + IGDB + covers + build)
│   ├── sync-mal.mjs
│   ├── sync-imdb.mjs
│   ├── sync-tmdb.mjs
│   ├── sync-steam.mjs
│   ├── sync-igdb.mjs
│   ├── import-igdb-gdpr.mjs
│   └── fetch-media-data.mjs
└── styles/
    └── global.css
```
