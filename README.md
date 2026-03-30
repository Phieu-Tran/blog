# mediaVault — Personal Media Hub

A personal media tracking blog built with Astro. Aggregates anime (MyAnimeList), films (IMDB/TMDB), games, and blog posts from Obsidian. Auto-syncs weekly, deployed on Cloudflare Pages.

**Live**: [blog.workspacesbeat.site](https://blog.workspacesbeat.site)

## Features

- **4 sections**: Anime, Films, Games, Posts — each with unique layout
- **Auto-sync**: Anime from MAL, films from TMDB — weekly via GitHub Actions
- **Dark theme** with per-section color coding
- **Obsidian compatible** — write posts in Obsidian, push to deploy
- **SEO ready** — Open Graph, sitemap, canonical URLs
- **Responsive** — mobile hamburger menu

## Quick Start

```bash
npm install
npm run dev          # http://localhost:4321/
```

## Content

Create `.md` files in `src/content/`:

| Section | Directory | Frontmatter |
|---------|-----------|-------------|
| Anime | `src/content/anime/` | `title, mal_id, rating, mal_score, genre, year, studio, status, episodes_watched, episodes_total, cover, date` |
| Films | `src/content/films/` | `title, imdb_id, tmdb_id, rating, genre, year, director, status, cover, date` |
| Games | `src/content/games/` | `title, rating, genre, year, studio, status, platform, cover, date` |
| Posts | `src/content/posts/` | `title, description, tags, cover, date, draft` |

## Scripts

```bash
npm run sync         # Sync all (MAL + TMDB + covers + build check) with progress bar
npm run sync-mal     # Sync anime from MAL only
npm run sync-tmdb    # Sync films from TMDB only
npm run fetch-data   # Fetch missing covers
npm run build        # Build site
```

## Sync Setup

### Anime (MyAnimeList)

```bash
npm run sync-mal -- YOUR_MAL_USERNAME
```

Scrapes MAL animelist page directly. Creates/updates `.md` files with score, episodes, cover. Preserves existing review body.

### Films (IMDB → TMDB)

Films are sourced from IMDB ratings (imported via CSV) and enriched with TMDB metadata (poster, genre, director). Each film has both IMDB and TMDB links.

For new films, rate on [TMDB](https://www.themoviedb.org/) and the weekly sync picks them up automatically.

### Weekly Auto-Sync (GitHub Actions)

The `sync.yml` workflow runs every Monday at 6 AM (UTC+7):

1. Syncs anime from MAL
2. Syncs rated films from TMDB account
3. Fetches missing covers
4. Auto commits and pushes → Cloudflare Pages auto-deploys

**Required GitHub Secrets/Variables:**

| Name | Type | Purpose |
|------|------|---------|
| `TMDB_API_KEY` | Secret | TMDB API key |
| `TMDB_SESSION_ID` | Secret | TMDB session |
| `MAL_USERNAME` | Variable | MAL username |
| `TMDB_ACCOUNT_ID` | Variable | TMDB account ID |

## Deploy (Cloudflare Pages)

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → Pages → Connect to Git
2. Select repo → Build command: `npm run build` → Output: `dist`
3. Add custom domain in Pages settings

## Obsidian Integration

```bash
# Windows (CMD as Admin):
mklink /D "C:\obsidian-vault\media-vault" "C:\media-vault\src\content"

# macOS/Linux:
ln -s /path/to/media-vault/src/content /path/to/obsidian-vault/media-vault
```

## Tech Stack

- [Astro](https://astro.build/) — Static site generator
- Vanilla CSS — Dark theme, responsive
- [MAL](https://myanimelist.net/) — Anime data (page scrape)
- [TMDB API](https://www.themoviedb.org/) — Film metadata (free key)
- [Cloudflare Pages](https://pages.cloudflare.com/) — Hosting
- [GitHub Actions](https://github.com/features/actions) — Weekly auto-sync
