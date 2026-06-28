# Phieu.work

Personal media hub blog by **Phieu-Tran** (GitHub: [Phieu-Tran](https://github.com/Phieu-Tran)).

## Project overview

A static blog built with **Astro** that aggregates media tracking (anime, games, films) and personal blog posts. Auto-syncs from MAL, TMDB, Steam, and IGDB weekly; IMDb CSV imports are supported manually for bulk film updates.

- **Live site**: https://blog.workspacesbeat.site
- **Repo**: https://github.com/Phieu-Tran/blog
- **Hosting**: Cloudflare Pages (auto-deploy on push to `main`)
- **Domain**: `workspacesbeat.site` (DNS on Cloudflare, subdomain `blog`)

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
| `MAL_USERNAME` | Variable | MAL username |
| `TMDB_ACCOUNT_ID` | Variable | TMDB account ID |
| `STEAM_ID` | Variable | Steam user ID |
| `SYNC_DELETE_MISSING` | Env/Variable | Optional; set `false` to disable guarded MAL/TMDB local deletes |
| `SYNC_MAX_AUTO_DELETE` | Env/Variable | Optional; maximum guarded local deletes per source, default `20` |

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
| `npm run import-igdb-gdpr -- path/to/index.html` | `import-igdb-gdpr.mjs` | Import personal IGDB GDPR ratings/played export |
| `npm run fetch-data` | `fetch-media-data.mjs` | Fetch missing covers |

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
- **Weekly sync has guarded delete flow for MAL/TMDB only**: entries missing upstream are removed from local content only when the upstream list is non-empty and delete count is at or below `SYNC_MAX_AUTO_DELETE` (default `20`). Steam files are not auto-deleted.
- **IMDb/content can be pushed back to TMDB** with `sync-imdb-to-tmdb`. It plans changes by default; deleting old TMDB account ratings requires `--apply --delete-extra` and `CONFIRM_TMDB_DELETE=DELETE`.
- **Games source split**: Steam is the account/library/playtime source; IGDB is the metadata source. Steam recent activity is stored as `steam_recent`/`steam_recent_hours` and shown as "Recently Played", not as `status: playing`. IGDB metadata sync updates `igdb_id`, `igdb_slug`, external URLs, `genre`, `studio`, `publisher`, `year`, `cover`, and `igdb_score` by Steam AppID, existing `igdb_id`, or exact title match, but keeps local `rating`, `status`, and body notes. IGDB GDPR import can update personal `rating` and Played-list status.
- **Creator credits**: Detail pages for Anime, Games, and Films support optional manual `director`, `creator`, `writer`, `composer`, and `author` fields. Sync preserves local credit fields unless a trusted source explicitly fills them. TMDB fills film/TV `director`/creator automatically where available; IGDB fills game developer/publisher, not personal credits.
- **Post/media relations**: Blog posts can define `related_media` entries in the form `anime:slug`, `games:slug`, or `films:slug`. Anime/Game/Film detail pages only show related posts from this explicit field, avoiding fuzzy title matches that link the wrong article.
- **Game detail external links**: Game detail pages show IGDB, IGN, Metacritic, Steam, and Official links. IGDB/Steam/Official are metadata-backed when available; IGN/Metacritic fall back to search URLs. IGDB does not expose stable game director/composer/writer/creator fields, so automated sync fills developer/publisher and leaves optional creator credit fields for manual or future sources.
- **Steam page** (`/steam/`) has dedicated Steam-style UI separate from Games list.
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
