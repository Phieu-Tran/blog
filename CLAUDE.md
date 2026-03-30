# mediaVault

Personal media hub blog by **Phieu-Tran** (GitHub: [Phieu-Tran](https://github.com/Phieu-Tran)).

## Project overview

A static blog built with **Astro** that aggregates media reviews (anime, games, films) and personal blog posts. Content is managed as Markdown files, compatible with Obsidian vault workflow.

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
| **Anime** | `src/content/anime/` | MyAnimeList | `#A78BFA` (purple) | My Score vs MAL Score, progress bar, MAL link |
| **Games** | `src/content/games/` | Manual | `#34D399` (green) | IGN-style score badge, platform, review |
| **Films** | `src/content/films/` | TMDB (rated) | `#FB923C` (orange) | My Score, director, IMDB link, no review |
| **Posts** | `src/content/posts/` | Obsidian | `#38BDF8` (blue) | Blog list, tags, prose content |

## Accounts & APIs

- **MAL**: username `Rinmatsouka` — 444 anime, sync via page scrape
- **TMDB**: username `Rinmatsouka`, account ID `22939480` — film ratings sync via API
- **IMDB**: user `ur200491176` — data being migrated to TMDB, IMDB blocked for auto-sync

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
| `npm run sync` | `sync-all.mjs` | **Main script** — sync all data with progress bar (MAL + TMDB + covers) |
| `npm run sync-mal` | `sync-mal.mjs` | Sync anime only from MAL (scrape, not Jikan API) |
| `npm run sync-tmdb` | `sync-tmdb.mjs` | Sync films from TMDB list |
| `npm run import-imdb` | `import-imdb.mjs` | One-time CSV import from IMDB |
| `npm run fetch-data` | `fetch-media-data.mjs` | Fetch missing covers |

## Key decisions

- **MAL sync uses page scraping**, not Jikan API. Jikan caches private→public transitions for hours/days, returning 404. Direct scrape of `myanimelist.net/animelist/{username}` extracts `data-items` JSON reliably.
- **Films use TMDB as primary source**. User rates on TMDB, script syncs rated movies weekly. IMDB data imported once via CSV.
- **IMDB cannot be auto-synced** (WAF + Google login, no password). IMDB serves as backup only.
- **Each section has unique layout**: Anime (dual score + progress), Games (IGN-style), Films (minimal + IMDB link), Posts (blog).
- **No base path** — site runs at root `/` on custom domain.
- **GitHub Actions sync** runs weekly (Monday 6AM UTC+7).
- **User prefers no manual export** — all sync automated.
- **UI text**: English for nav/labels. Vietnamese for dates and some content.

## Automation flow

```
Weekly (GitHub Actions):
  sync-all.mjs
    ├─ Scrape MAL → src/content/anime/ (444+ files)
    ├─ TMDB rated movies → src/content/films/
    ├─ Fetch missing covers
    └─ Auto commit & push → CF Pages auto-deploy
```

## File structure

```
src/
├── content/
│   ├── anime/          ← 444+ files from MAL sync
│   ├── games/          ← manual entries
│   ├── films/          ← TMDB rated movies
│   └── posts/          ← blog posts from Obsidian
├── components/
│   └── MediaCard.astro
├── layouts/
│   └── BaseLayout.astro
├── pages/
│   ├── index.astro     ← home (active, stats, recent posts, recent media)
│   ├── 404.astro
│   ├── anime/          ← list + detail (MAL score, progress)
│   ├── games/          ← list + detail (IGN-style)
│   ├── films/          ← list + detail (IMDB link)
│   └── posts/          ← list + detail (prose)
├── scripts/
│   ├── sync-all.mjs    ← main sync with progress bar
│   ├── sync-mal.mjs
│   ├── sync-tmdb.mjs
│   ├── import-imdb.mjs
│   └── fetch-media-data.mjs
└── styles/
    └── global.css
```
