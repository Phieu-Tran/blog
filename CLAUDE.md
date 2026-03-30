# mediaVault

Personal media hub blog by **Phieu-Tran** (GitHub: [Phieu-Tran](https://github.com/Phieu-Tran)).

## Project overview

A static blog built with **Astro** that aggregates media tracking (anime, games, films) and personal blog posts. Content is Markdown files, compatible with Obsidian vault workflow. Auto-syncs from MAL + TMDB weekly.

- **Live site**: https://blog.workspacesbeat.site
- **Repo**: https://github.com/Phieu-Tran/blog
- **Hosting**: Cloudflare Pages (auto-deploy on push to `main`)
- **Domain**: `workspacesbeat.site` (DNS on Cloudflare, subdomain `blog`)

## Tech stack

- Astro 5.x (static output)
- Vanilla CSS (dark theme, no Tailwind)
- TypeScript content collections
- `@astrojs/sitemap` + `@astrojs/rss`

## 4 content sections

| Section | Directory | Source | Color | Layout style |
|---------|-----------|--------|-------|-------------|
| **Anime** | `src/content/anime/` | MyAnimeList (scrape) | `#A78BFA` (purple) | My Score vs MAL Score, progress bar, MAL link |
| **Games** | `src/content/games/` | Manual | `#34D399` (green) | IGN-style score badge, platform, review |
| **Films** | `src/content/films/` | IMDB (imported) + TMDB (enriched) | `#FB923C` (orange) | My Score, IMDB link + TMDB link, no review |
| **Posts** | `src/content/posts/` | Obsidian | `#38BDF8` (blue) | Blog list, tags, prose content |

## Accounts & APIs

- **MAL**: username `Rinmatsouka` — 444+ anime, sync via page scrape (not Jikan API)
- **TMDB**: username `Rinmatsouka`, account ID `22939480` — enriches film metadata (poster, genre, director)
- **IMDB**: user `ur200491176` — 204 ratings imported via CSV, IMDB IDs stored in frontmatter for direct linking

### GitHub Secrets & Variables

| Name | Type | Purpose |
|------|------|---------|
| `TMDB_API_KEY` | Secret | TMDB API v3 key |
| `TMDB_SESSION_ID` | Secret | TMDB authenticated session |
| `MAL_USERNAME` | Variable | MAL username for anime sync |
| `TMDB_ACCOUNT_ID` | Variable | TMDB account ID for rated movies |

## Scripts

| Command | Script | Description |
|---------|--------|-------------|
| `npm run sync` | `sync-all.mjs` | **Main script** — sync all (MAL + TMDB + covers + build check) with progress bar |
| `npm run sync-mal` | `sync-mal.mjs` | Sync anime only from MAL page scrape |
| `npm run sync-tmdb` | `sync-tmdb.mjs` | Sync films from TMDB list/account |
| `npm run fetch-data` | `fetch-media-data.mjs` | Fetch missing covers from APIs |

### sync-all.mjs flow

```
1. Anime (MAL)     — scrape animelist page → create/update .md files
2. Films (TMDB)    — fetch rated movies from TMDB account → create/update .md files
3. Missing covers  — scan files without cover → fetch from TMDB
4. Build check     — run astro build → report pass/fail
5. Summary         — print results for all steps
```

## Key decisions

- **MAL sync uses page scraping**, not Jikan API. Jikan caches private→public transitions returning 404. Direct scrape of `myanimelist.net/animelist/{username}` extracts `data-items` JSON.
- **Films have both IMDB + TMDB links**. IMDB IDs from initial CSV import, TMDB IDs from API enrichment. Both links shown on detail page.
- **IMDB cannot be auto-synced** (WAF + Google login). 204 ratings imported once via CSV. User rates new films on TMDB for auto-sync.
- **Each section has unique layout**: Anime (dual score + progress), Games (IGN-style badge), Films (IMDB+TMDB links), Posts (blog prose).
- **Frontmatter title always quoted** — prevents YAML parsing numeric titles (e.g. "1899") as numbers.
- **sync-all includes build check** — runs `astro build` after sync, exits with error if build fails.
- **No base path** — site at root `/` on custom domain.
- **GitHub Actions sync** runs weekly (Monday 6AM UTC+7).
- **User prefers full automation** — no manual export/import steps.

## File structure

```
src/
├── content/
│   ├── anime/          ← 444+ files from MAL sync
│   ├── games/          ← manual entries (2 files)
│   ├── films/          ← 204 files from IMDB import + TMDB enrichment
│   └── posts/          ← blog posts from Obsidian
├── components/
│   └── MediaCard.astro
├── layouts/
│   └── BaseLayout.astro  ← SEO meta, OG tags, hamburger nav, 5 nav items
├── pages/
│   ├── index.astro       ← home (active, stats, recent posts, recent media)
│   ├── 404.astro
│   ├── anime/            ← list + detail (MAL score, progress bar, MAL link)
│   ├── games/            ← list + detail (IGN-style score, platform, review)
│   ├── films/            ← list + detail (IMDB link + TMDB link)
│   └── posts/            ← list + detail (tags, prose)
├── scripts/
│   ├── sync-all.mjs      ← main sync with progress bar + build check
│   ├── sync-mal.mjs      ← MAL page scrape
│   ├── sync-tmdb.mjs     ← TMDB list/account sync
│   └── fetch-media-data.mjs ← fetch missing covers
└── styles/
    └── global.css        ← dark theme, 4 color schemes, responsive, hamburger menu
```
