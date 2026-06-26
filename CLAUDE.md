# Phieu.work

Personal media hub blog by **Phieu-Tran** (GitHub: [Phieu-Tran](https://github.com/Phieu-Tran)).

## Project overview

A static blog built with **Astro** that aggregates media tracking (anime, games, films) and personal blog posts. Auto-syncs from MAL, TMDB, Steam weekly; IMDb CSV imports are supported manually.

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
| **Games** | `src/content/games/` | Steam + IGN | `#34D399` | IGN-style score, playtime, Steam link |
| **Films** | `src/content/films/` | IMDB + TMDB | `#FB923C` | 3 scores (My/IMDB/TMDB), IMDB+TMDB links |
| **Posts** | `src/content/posts/` | Obsidian | `#38BDF8` | Blog list, tags, prose |
| **Steam** | `/steam/` page | Steam API | Steam blue | Steam-style profile, playtime bars |

## Accounts & APIs

| Platform | Username/ID | Purpose |
|----------|-------------|---------|
| MAL | `Rinmatsouka` | 444+ anime, sync via page scrape |
| TMDB | `Rinmatsouka` (ID: 22939480) | Rated movies, metadata enrichment |
| IMDB | `ur200491176` | 211 ratings imported from CSV, including movie/TV type |
| Steam | `76561198436321684` | 61 games, playtime, library sync |
| IGN | `Rinmatsuka` | 76 games imported once (no API) |

### GitHub Secrets & Variables

| Name | Type | Purpose |
|------|------|---------|
| `TMDB_API_KEY` | Secret | TMDB API v3 key |
| `TMDB_SESSION_ID` | Secret | TMDB authenticated session |
| `STEAM_API_KEY` | Secret | Steam Web API key |
| `MAL_USERNAME` | Variable | MAL username |
| `TMDB_ACCOUNT_ID` | Variable | TMDB account ID |
| `STEAM_ID` | Variable | Steam user ID |

## Scripts

| Command | Script | Description |
|---------|--------|-------------|
| `npm run sync` | `sync-all.mjs` | **Main** — sync all (MAL + TMDB + Steam + covers + build check) with progress bar |
| `npm run sync-mal` | `sync-mal.mjs` | Anime only (MAL scrape) |
| `npm run sync-imdb` | `sync-imdb.mjs` | Import films/TV from an IMDb ratings CSV; TMDB enriches by IMDb ID |
| `npm run sync-tmdb` | `sync-tmdb.mjs` | Films from TMDB account |
| `npm run sync-steam` | `sync-steam.mjs` | Games from Steam library |
| `npm run fetch-data` | `fetch-media-data.mjs` | Fetch missing covers |

### sync-all.mjs flow

```
1. Anime (MAL)     — scrape animelist page
2. Films (TMDB)    — fetch rated movies from TMDB account
3. Games (Steam)   — fetch owned games + playtime
4. Missing covers  — scan files → fetch from TMDB
5. Build check     — run astro build → pass/fail
6. Summary         — print all results + total time
```

## Key decisions

- **MAL sync uses page scraping**, not Jikan API (Jikan caches 404s for hours).
- **Films have 3 scores**: My Score (from IMDb CSV or TMDB account rating), IMDB Score (from IMDb CSV), TMDB Score (from TMDB vote_average).
- **IMDb ID is the identity anchor for imports**. `sync-imdb` uses TMDB `/find/{imdb_id}` for enrichment, never title search.
- **Film entries store `tmdb_type`** (`movie` or `tv`) so TV IDs do not resolve through TMDB movie endpoints.
- **Games from 2 sources**: Steam (playtime, auto-sync) + IGN (imported once via browser scrape).
- **Steam page** (`/steam/`) has dedicated Steam-style UI separate from Games list.
- **Frontmatter title always quoted** — prevents YAML numeric title parsing.
- **sync-all includes build check** — exits with error code if build fails.
- **on_hold status** separated from watching for anime.
- **updated_at** field for anime — Now Active sorted by most recent update.
- **Obsidian posts** imported from the local Obsidian media vault — Obsidian links cleaned.
- **IGDB/Twitch API** pending — needs 2FA on Twitch account first.

## File structure

```
src/
├── content/
│   ├── anime/          ← 444+ files (MAL sync)
│   ├── games/          ← 127 files (Steam 61 + IGN 64 + manual 2)
│   ├── films/          ← 211 files (IMDb CSV import + TMDB enrich + 3 scores)
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
│   ├── sync-all.mjs      ← main sync (MAL + TMDB + Steam + covers + build)
│   ├── sync-mal.mjs
│   ├── sync-imdb.mjs
│   ├── sync-tmdb.mjs
│   ├── sync-steam.mjs
│   └── fetch-media-data.mjs
└── styles/
    └── global.css
```
