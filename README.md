# Phieu.work — Personal Media Hub

A personal media tracking blog built with Astro. Aggregates anime (MAL), films (IMDB/TMDB), games (Steam/IGN), and blog posts from Obsidian. Auto-syncs weekly, deployed on Cloudflare Pages.

**Live**: [blog.workspacesbeat.site](https://blog.workspacesbeat.site)

## Features

- **5 sections**: Anime, Films, Games, Posts, Steam — each with unique layout
- **Auto-sync**: Anime (MAL), Films (TMDB), Games (Steam) — weekly via GitHub Actions
- **3 film scores**: My Score, IMDB Score, TMDB Score
- **Steam profile page** with playtime bars and Steam-style UI
- **Dark theme** with per-section color coding
- **Obsidian compatible** — write posts in Obsidian, push to deploy
- **SEO ready** — Open Graph, sitemap, canonical URLs
- **Responsive** — mobile hamburger menu

## Quick Start

```bash
npm install
npm run dev          # http://localhost:4321/
npm run sync         # Sync all data with progress bar
```

## Scripts

```bash
npm run sync         # Sync all (MAL + TMDB + Steam + covers + build check)
npm run sync-mal     # Sync anime from MAL
npm run sync-tmdb    # Sync films from TMDB
npm run sync-steam   # Sync games from Steam
npm run fetch-data   # Fetch missing covers
npm run build        # Build site
```

## Content

| Section | Directory | Frontmatter |
|---------|-----------|-------------|
| Anime | `src/content/anime/` | `title, mal_id, rating, mal_score, genre, year, studio, status, episodes_watched, episodes_total, cover, updated_at, date` |
| Films | `src/content/films/` | `title, imdb_id, tmdb_id, rating, imdb_score, tmdb_score, genre, year, director, status, cover, date` |
| Games | `src/content/games/` | `title, steam_appid, rating, genre, year, studio, status, platform, playtime_hours, cover, date` |
| Posts | `src/content/posts/` | `title, description, tags, cover, date, draft` |

## Weekly Auto-Sync

The `sync.yml` workflow runs every Monday at 6 AM (UTC+7):

1. Syncs anime from MAL (page scrape)
2. Syncs rated films from TMDB account
3. Syncs games from Steam library
4. Fetches missing covers
5. Runs build check
6. Auto commits and pushes → Cloudflare Pages deploys

**Required GitHub Secrets/Variables:**

| Name | Type | Purpose |
|------|------|---------|
| `TMDB_API_KEY` | Secret | TMDB API key |
| `TMDB_SESSION_ID` | Secret | TMDB session |
| `STEAM_API_KEY` | Secret | Steam Web API key |
| `OMDB_API_KEY` | Secret | OMDB API key (IMDB scores) |
| `MAL_USERNAME` | Variable | MAL username |
| `TMDB_ACCOUNT_ID` | Variable | TMDB account ID |
| `STEAM_ID` | Variable | Steam user ID |

## Deploy (Cloudflare Pages)

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → Pages → Connect to Git
2. Select repo → Build command: `npm run build` → Output: `dist`
3. Add custom domain in Pages settings

## Tech Stack

- [Astro](https://astro.build/) — Static site generator
- Vanilla CSS — Dark theme, responsive
- [MAL](https://myanimelist.net/) — Anime data (page scrape)
- [TMDB API](https://www.themoviedb.org/) — Film metadata + ratings
- [OMDB API](https://www.omdbapi.com/) — IMDB scores
- [Steam API](https://steamcommunity.com/dev) — Game library + playtime
- [Cloudflare Pages](https://pages.cloudflare.com/) — Hosting
- [GitHub Actions](https://github.com/features/actions) — Weekly auto-sync
