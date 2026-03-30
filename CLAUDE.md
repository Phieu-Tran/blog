# mediaVault

Personal media hub blog by **Phieu-Tran** (GitHub: [Phieu-Tran](https://github.com/Phieu-Tran)).

## Project overview

A static blog built with **Astro** that aggregates media reviews (anime, games, films) and personal blog posts. Content is managed as Markdown files, compatible with Obsidian vault workflow.

- **Live site**: https://blog.workspacesbeat.site
- **Repo**: https://github.com/Phieu-Tran/blog
- **Hosting**: Cloudflare Pages (auto-deploy on push to `main`)
- **Domain**: `workspacesbeat.site` (DNS on Cloudflare)

## Tech stack

- Astro 5.x (static output)
- Vanilla CSS (dark theme, no Tailwind)
- TypeScript content collections
- `@astrojs/sitemap` + `@astrojs/rss`

## 4 content sections

| Section | Directory | Source | Color | API |
|---------|-----------|--------|-------|-----|
| **Anime** | `src/content/anime/` | MyAnimeList | `#A78BFA` (purple) | Scrape MAL page (no Jikan API — it caches 404s) |
| **Games** | `src/content/games/` | Manual / IGN | `#34D399` (green) | None yet |
| **Films** | `src/content/films/` | Manual / IMDB | `#FB923C` (orange) | IMDB blocks scraping; TMDB sync available |
| **Posts** | `src/content/posts/` | Obsidian | `#38BDF8` (blue) | N/A |

## Scripts

- `npm run sync-mal -- <username>` — Scrape MAL animelist page directly (not Jikan API). Creates/updates `.md` files, preserves review body.
- `npm run sync-tmdb` — Sync films from TMDB (needs `TMDB_API_KEY` env).
- `npm run fetch-data` — Fetch missing covers for files with `mal_id`/`tmdb_id`.

## Key decisions

- **MAL sync uses page scraping**, not Jikan API. Jikan caches private→public transitions for hours/days, returning 404. Direct scrape of `myanimelist.net/animelist/{username}` extracts `data-items` JSON reliably.
- **IMDB cannot be scraped** (WAF/bot protection). Films are managed manually or via TMDB.
- **No base path** — site runs at root `/` on custom domain, not `/media-vault/`.
- **GitHub Actions sync** runs weekly (Monday 6AM UTC+7), not daily.
- **User prefers no manual export** — automation or nothing.
- **UI language**: Vietnamese for site UI, English for README/code.

## MAL account

- Username: `Rinmatsouka`
- Profile: https://myanimelist.net/profile/Rinmatsouka
- 444 anime (433 completed, 4 watching, 7 plan to watch)

## IMDB account

- User ID: `ur200491176`
- Profile: https://www.imdb.com/user/ur200491176/
- Status: blocked by WAF, cannot auto-sync yet

## File structure

```
src/
├── content/
│   ├── anime/          ← 444 files from MAL sync
│   ├── games/          ← manual entries
│   ├── films/          ← manual entries (IMDB pending)
│   └── posts/          ← blog posts from Obsidian
├── components/
│   └── MediaCard.astro
├── layouts/
│   └── BaseLayout.astro
├── pages/
│   ├── index.astro     ← home (active, stats, recent posts, recent media)
│   ├── 404.astro
│   ├── anime/
│   ├── games/
│   ├── films/
│   └── posts/
├── scripts/
│   ├── sync-mal.mjs
│   ├── sync-tmdb.mjs
│   └── fetch-media-data.mjs
└── styles/
    └── global.css
```

## Workflows

- `.github/workflows/sync.yml` — Weekly MAL sync + metadata fetch + auto commit
