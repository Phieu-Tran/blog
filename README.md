# Phieu.work — Personal Media Hub

A personal media tracking blog built with Astro. Aggregates anime (MAL), films (IMDb CSV + TMDB), games (Steam + IGDB), and blog posts from Obsidian. Auto-syncs weekly, deployed on Cloudflare Pages.

**Live**: [blog.workspacesbeat.site](https://blog.workspacesbeat.site)

## Features

- **5 sections**: Anime, Films, Games, Posts, Steam — each with unique layout
- **Auto-sync**: Anime (MAL), TMDB rated movies/TV, Games (Steam + IGDB) — weekly via GitHub Actions
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
npm run sync         # Sync all (MAL + TMDB movies/TV + Steam + IGDB + covers + build check)
npm run sync-mal     # Sync anime from MAL
npm run sync-imdb    # Import films/TV from an IMDb ratings CSV; use -- --enrich-existing to refresh TMDB metadata
npm run sync-imdb-to-tmdb # Dry-run sync IMDb-backed repo ratings back to TMDB account
npm run sync-tmdb    # Sync/enrich films from TMDB
npm run sync-steam   # Sync games from Steam
npm run sync-igdb    # Enrich games from IGDB metadata
npm run import-igdb-gdpr -- path/to/index.html # Import IGDB GDPR ratings/played export
npm run fetch-data   # Fetch missing covers
npm run build        # Build site
```

## Content

| Section | Directory | Frontmatter |
|---------|-----------|-------------|
| Anime | `src/content/anime/` | `title, mal_id, rating, mal_score, genre, year, studio, director, creator, writer, composer, author, status, episodes_watched, episodes_total, cover, updated_at, date` |
| Films | `src/content/films/` | `title, imdb_id, tmdb_id, tmdb_type, rating, imdb_score, tmdb_score, genre, year, director, creator, writer, composer, author, status, cover, date` |
| Games | `src/content/games/` | `title, steam_appid, igdb_id, igdb_slug, igdb_url, steam_url, ign_url, metacritic_url, official_url, rating, igdb_score, genre, year, studio, publisher, director, creator, writer, composer, author, status, platform, playtime_hours, steam_recent, steam_recent_hours, cover, igdb_updated_at, date` |
| Posts | `src/content/posts/` | `title, description, tags, related_media, cover, date, draft` |

## Film Sync Notes

- IMDb ratings CSV import is a bulk source for film identity, title, user rating, IMDb score, year, and whether an entry is a movie or TV series.
- TMDB account ratings are also a live source. Weekly sync reads both rated movies and rated TV, then stores `tmdb_id` with `tmdb_type`.
- TMDB enrichment resolves existing IMDb-backed entries by IMDb ID through TMDB's external ID endpoint, not by title search.
- `tmdb_type` is stored as `movie` or `tv` so TMDB links and covers do not confuse TV IDs with movie IDs.
- The weekly sync can create/update films from TMDB ratings and enrich IMDb-backed entries with TMDB IDs, TMDB scores, and poster covers using the GitHub `TMDB_API_KEY` secret.
- TMDB/MAL delete flow is guarded: items removed from TMDB ratings or the MAL list are removed from local content only when the upstream list is non-empty and the delete count is at or below `SYNC_MAX_AUTO_DELETE` (default `20`). Disable with `SYNC_DELETE_MISSING=false`.
- Steam sync does not auto-delete local game files because Steam library visibility and ownership data can be noisy.
- `sync-imdb-to-tmdb` syncs IMDb-backed repo ratings back to the TMDB account. It is dry-run by default; deleting extra TMDB ratings requires `--apply --delete-extra` plus `CONFIRM_TMDB_DELETE=DELETE`.
- Detail pages support optional manual creator credits across Anime, Films, and Games: `director`, `creator`, `writer`, `composer`, and `author`. Sync keeps these local fields unless a trusted source explicitly updates them.
- Blog posts can use `related_media` values like `anime:ajin-demi-human`, `games:god-of-war`, or `films:donnie-darko`. Media detail pages use this explicit relation for related posts instead of fuzzy title matching.

## Game Sync Notes

- Steam is the account/library source for games. It provides owned games, playtime, recent play activity, and Steam AppIDs.
- Steam recent activity is stored as `steam_recent`/`steam_recent_hours` and rendered as "Recently Played". It is not treated as the personal `status: playing`.
- IGDB is the metadata source for games. Weekly sync maps `steam_appid` through IGDB `external_games`, stores `igdb_id`, and refreshes `title`, `genre`, `studio`, `publisher`, `year`, `cover`, `igdb_score`, `igdb_url`, `steam_url`, `official_url`, and any IGN/Metacritic links IGDB exposes.
- IGDB GDPR export imports personal `rating` and `Played` list data into local game markdown. The metadata sync can then exact-match titles against IGDB to fill missing `igdb_id`.
- Local markdown remains where the site stores `rating`, `status`, and notes/body content. IGDB metadata sync does not overwrite those fields.
- Non-Steam games are enriched by IGDB when an `igdb_id` exists, or by exact title match for imported IGDB GDPR entries.
- Game detail pages show external links for IGDB, IGN, Metacritic, Steam, and Official. IGDB/Steam/Official are filled from metadata when available; IGN and Metacritic fall back to search links when exact URLs are not present.
- Creator credit fields are optional for manual entries or future sources. Current IGDB metadata does not expose stable game director/composer/writer/creator fields, so the automated sync fills developer/publisher instead.
- Steam sync does not auto-delete local game files because Steam library visibility and ownership data can be noisy.

## Weekly Auto-Sync

The `sync.yml` workflow runs every Monday at 6 AM (UTC+7):

1. Syncs anime from MAL (page scrape)
2. Syncs rated movies and rated TV from TMDB account
3. Syncs games from Steam library
4. Enriches game metadata from IGDB
5. Deletes missing MAL/TMDB-managed entries within the safety guard
6. Fetches missing covers
7. Enriches IMDb-backed films/TV with TMDB metadata
8. Runs final build check
9. Auto commits and pushes → Cloudflare Pages deploys

**Required GitHub Secrets/Variables:**

| Name | Type | Purpose |
|------|------|---------|
| `TMDB_API_KEY` | Secret | TMDB API key |
| `TMDB_SESSION_ID` | Secret | TMDB session |
| `STEAM_API_KEY` | Secret | Steam Web API key |
| `IGDB_CLIENT_ID` or `TWITCH_CLIENT_ID` | Secret | Twitch/IGDB client ID for game metadata |
| `IGDB_CLIENT_SECRET` or `TWITCH_CLIENT_SECRET` | Secret | Twitch/IGDB client secret for game metadata |
| `MAL_USERNAME` | Variable | MAL username |
| `TMDB_ACCOUNT_ID` | Variable | TMDB account ID |
| `STEAM_ID` | Variable | Steam user ID |
| `SYNC_DELETE_MISSING` | Env/Variable | Optional; set `false` to disable guarded MAL/TMDB local deletes |
| `SYNC_MAX_AUTO_DELETE` | Env/Variable | Optional; maximum guarded local deletes per source, default `20` |

## Deploy (Cloudflare Pages)

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → Pages → Connect to Git
2. Select repo → Build command: `npm run build` → Output: `dist`
3. Add custom domain in Pages settings

## Tech Stack

- [Astro](https://astro.build/) — Static site generator
- Vanilla CSS — Dark theme, responsive
- [MAL](https://myanimelist.net/) — Anime data (page scrape)
- IMDb ratings export — Film and TV ratings source
- [TMDB API](https://www.themoviedb.org/) — Film/TV metadata + ratings
- [Steam API](https://steamcommunity.com/dev) — Game library + playtime
- [IGDB API](https://api-docs.igdb.com/) — Game metadata
- [Cloudflare Pages](https://pages.cloudflare.com/) — Hosting
- [GitHub Actions](https://github.com/features/actions) — Weekly auto-sync
