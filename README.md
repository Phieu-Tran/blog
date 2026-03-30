# mediaVault — Personal Media Hub

A personal blog that aggregates reviews for games, anime, and films from an Obsidian vault, with auto-fetched metadata from MyAnimeList & TMDB, deployed on Cloudflare Pages.

## Requirements

- **Node.js** 18+ → [Download](https://nodejs.org/)
- **Git** → [Download](https://git-scm.com/)
- **GitHub account** → [Sign up](https://github.com/)
- **TMDB API key** (free, optional) → [Register](https://www.themoviedb.org/settings/api)

## Getting Started

### Step 1: Install

```bash
cd media-vault
npm install
```

### Step 2: Local development

```bash
npm run dev
```

Open `http://localhost:4321/` in your browser.

### Step 3: Add content

Create `.md` files in the corresponding directory:

**Add anime** → `src/content/anime/my-anime.md`

```markdown
---
title: "Anime Title"
mal_id: 12345
rating: 8.5
genre: "Action, Drama"
year: 2025
studio: "Studio Name"
status: watching
episodes: 24
cover: "image-url"
date: 2025-03-30
---

Your review here.
```

**Add game** → `src/content/games/my-game.md`

```markdown
---
title: "Game Title"
rating: 9.0
genre: "Action RPG, Soulslike"
year: 2025
studio: "Developer Name"
status: playing
platform: "PC"
cover: "image-url"
date: 2025-03-30
---

Your review here.
```

**Add film** → `src/content/films/my-film.md`

```markdown
---
title: "Film Title"
tmdb_id: 693134
rating: 8.5
genre: "Sci-Fi, Drama"
year: 2024
director: "Director Name"
status: watched
cover: "image-url"
date: 2025-03-30
---

Your review here.
```

### Step 4: Sync anime from MyAnimeList (optional)

```bash
npm run sync-mal -- YOUR_MAL_USERNAME
```

Automatically creates/updates `.md` files for each anime in your MAL list. Existing reviews are preserved.

### Step 5: Sync films from TMDB (optional)

```bash
export TMDB_API_KEY=your_api_key_here
npm run sync-tmdb

# With a TMDB list:
export TMDB_LIST_ID=your_list_id
npm run sync-tmdb
```

### Step 6: Fetch missing metadata (optional)

```bash
npm run fetch-data
```

Scans content files with `mal_id`/`tmdb_id` and auto-fetches missing covers from APIs.

### Step 7: Obsidian integration

Symlink the content folder into your Obsidian vault:

```bash
# macOS/Linux:
ln -s /path/to/media-vault/src/content /path/to/obsidian-vault/media-vault

# Windows (CMD as Admin):
mklink /D "C:\obsidian-vault\media-vault" "C:\media-vault\src\content"
```

Write in Obsidian → push to GitHub → site auto-updates.

### Step 8: Deploy to Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → Pages → Create → Connect to Git
2. Select your GitHub repo
3. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Add custom domain in Pages settings

**Daily auto-sync (optional):**

In GitHub repo → Settings → Secrets and variables:
- Variables: `MAL_USERNAME` = your MAL username
- Variables: `TMDB_LIST_ID` = TMDB list ID (optional)
- Secrets: `TMDB_API_KEY` = your TMDB API key

The `sync.yml` workflow runs daily at 6 AM (UTC+7).

## Project Structure

```
media-vault/
├── src/
│   ├── content/           ← YOUR CONTENT HERE
│   │   ├── anime/
│   │   ├── games/
│   │   └── films/
│   ├── components/
│   ├── layouts/
│   ├── pages/
│   ├── styles/
│   └── scripts/
├── public/
├── .github/workflows/
├── astro.config.mjs
└── package.json
```

## Finding MAL ID / TMDB ID

- **MAL ID**: Go to MyAnimeList → find anime → URL `myanimelist.net/anime/55701/Dandadan` → ID is `55701`
- **TMDB ID**: Go to themoviedb.org → find movie → URL `themoviedb.org/movie/693134` → ID is `693134`

## Tech Stack

- [Astro](https://astro.build/) — Static site generator
- Vanilla CSS — Dark theme
- [Jikan API](https://jikan.moe/) — MyAnimeList data (free, no key needed)
- [TMDB API](https://www.themoviedb.org/) — Movie data (free key)
- Cloudflare Pages — Hosting
- GitHub Actions — Auto sync
