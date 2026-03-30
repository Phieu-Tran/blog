/**
 * sync-all.mjs
 *
 * Đồng bộ tất cả dữ liệu: Anime (MAL) + Films (TMDB)
 * Hiển thị progress bar và tiến trình chi tiết.
 *
 * Cách dùng:
 *   node src/scripts/sync-all.mjs
 *
 * Environment variables:
 *   MAL_USERNAME        — MAL username (required for anime)
 *   TMDB_API_KEY        — TMDB API key (required for films)
 *   TMDB_SESSION_ID     — TMDB session ID (required for films)
 *   TMDB_ACCOUNT_ID     — TMDB account ID (required for films)
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

// ============================================
// CONFIG
// ============================================
const MAL_USERNAME = process.env.MAL_USERNAME || process.argv[2] || '';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_SESSION_ID = process.env.TMDB_SESSION_ID || '';
const TMDB_ACCOUNT_ID = process.env.TMDB_ACCOUNT_ID || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';

const ANIME_DIR = path.resolve('src/content/anime');
const FILMS_DIR = path.resolve('src/content/films');

// ============================================
// UI — Progress bar
// ============================================
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bgGreen: '\x1b[42m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
};

function progressBar(current, total, width = 30) {
  const pct = total > 0 ? current / total : 0;
  const filled = Math.round(width * pct);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const pctStr = `${Math.round(pct * 100)}%`.padStart(4);
  return `${bar} ${pctStr} (${current}/${total})`;
}

function printHeader(text, color = COLORS.cyan) {
  const line = '─'.repeat(50);
  console.log(`\n${color}${line}${COLORS.reset}`);
  console.log(`${color}${COLORS.bright}  ${text}${COLORS.reset}`);
  console.log(`${color}${line}${COLORS.reset}\n`);
}

function printStep(icon, text) {
  console.log(`  ${icon}  ${text}`);
}

function printProgress(label, current, total) {
  process.stdout.write(`\r  ${COLORS.dim}${label}${COLORS.reset} ${progressBar(current, total)}`);
  if (current === total) process.stdout.write('\n');
}

function printResult(created, updated, skipped = 0) {
  console.log(`\n  ${COLORS.green}✓ Created: ${created}${COLORS.reset}  ${COLORS.yellow}↻ Updated: ${updated}${COLORS.reset}${skipped ? `  ${COLORS.dim}○ Skipped: ${skipped}${COLORS.reset}` : ''}`);
}

function printSummary(results) {
  printHeader('SYNC COMPLETE', COLORS.green);
  for (const r of results) {
    const status = r.success ? `${COLORS.green}✓` : `${COLORS.red}✗`;
    console.log(`  ${status} ${r.name}${COLORS.reset} — ${r.message}`);
  }
  console.log('');
}

// ============================================
// HELPERS
// ============================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const fm = {};
  match[1].split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (!isNaN(val) && val !== '') val = Number(val);
    fm[key] = val;
  });
  return { frontmatter: fm, body: match[2] };
}

function buildFrontmatter(data) {
  const lines = Object.entries(data).map(([k, v]) => {
    if (v === undefined || v === null || v === '') return null;
    // Always quote title to avoid YAML parsing numbers as non-string
    if (k === 'title') return `${k}: "${String(v).replace(/"/g, '\\"')}"`;
    if (typeof v === 'string' && (v.includes(':') || v.includes(',') || v.includes(' ') || v.includes('"')))
      return `${k}: "${v.replace(/"/g, '\\"')}"`;
    return `${k}: ${v}`;
  }).filter(Boolean);
  return `---\n${lines.join('\n')}\n---\n`;
}

function findFileByField(dir, field, value) {
  if (!fs.existsSync(dir)) return null;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    const parsed = parseFrontmatter(content);
    if (parsed && parsed.frontmatter[field] == value) return { file, ...parsed };
  }
  return null;
}

function saveEntry(dir, slug, data, existingField, existingValue) {
  const existing = findFileByField(dir, existingField, existingValue);
  if (existing) {
    const merged = { ...existing.frontmatter };
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined || v === null) continue;
      if (k === 'rating' && Number(merged.rating) > 0 && v === 0) continue;
      if (k === 'date' && merged.date) continue;
      merged[k] = v;
    }
    fs.writeFileSync(path.join(dir, existing.file), buildFrontmatter(merged) + existing.body);
    return 'updated';
  } else {
    const filename = `${slug}.md`;
    fs.writeFileSync(path.join(dir, filename), buildFrontmatter(data) + '\n');
    return 'created';
  }
}

// ============================================
// SYNC: ANIME (MAL)
// ============================================
async function syncAnime() {
  if (!MAL_USERNAME) return { name: 'Anime (MAL)', success: false, message: 'No MAL_USERNAME set' };

  printHeader('ANIME — MyAnimeList', COLORS.magenta);
  printStep('👤', `User: ${MAL_USERNAME}`);

  if (!fs.existsSync(ANIME_DIR)) fs.mkdirSync(ANIME_DIR, { recursive: true });

  // Fetch all pages
  const allItems = [];
  let offset = 0;
  while (true) {
    printStep('📡', `Fetching page offset=${offset}...`);
    const html = await fetchPage(`https://myanimelist.net/animelist/${MAL_USERNAME}?offset=${offset}`);
    const match = html.match(/data-items="([^"]*)"/);
    if (!match) break;
    const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const items = JSON.parse(decoded);
    if (items.length === 0) break;
    allItems.push(...items);
    printStep('📦', `Got ${items.length} items (total: ${allItems.length})`);
    if (items.length < 300) break;
    offset += 300;
    await sleep(1000);
  }

  printStep('🔄', `Processing ${allItems.length} anime...\n`);
  let created = 0, updated = 0;

  const statusMap = { 1: 'watching', 2: 'completed', 3: 'watching', 4: 'dropped', 6: 'plan' };

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    const malId = item.anime_id;
    const title = item.anime_title_eng || item.anime_title;
    const slug = slugify(title) || `anime-${malId}`;
    const genres = [...(item.genres || []).map(g => g.name), ...(item.demographics || []).map(g => g.name)].join(', ') || 'N/A';
    const studio = item.anime_studios?.[0]?.name || 'N/A';
    const yearStr = item.anime_start_date_string;
    const year = yearStr ? new Date(yearStr).getFullYear() : new Date().getFullYear();
    const cover = item.anime_image_path ? item.anime_image_path.replace('/r/192x272', '').split('?')[0] : undefined;

    const data = {
      title, mal_id: malId, rating: item.score || 0, mal_score: item.anime_score_val || 0,
      genre: genres, year: isNaN(year) ? new Date().getFullYear() : year, studio,
      status: statusMap[item.status] || 'plan',
      episodes_watched: item.num_watched_episodes || 0,
      episodes_total: item.anime_num_episodes || 0,
      cover, date: new Date().toISOString().split('T')[0],
    };

    const result = saveEntry(ANIME_DIR, slug, data, 'mal_id', malId);
    if (result === 'created') created++;
    else updated++;

    printProgress('Anime', i + 1, allItems.length);
  }

  printResult(created, updated);
  return { name: 'Anime (MAL)', success: true, message: `${allItems.length} anime — ${created} new, ${updated} updated` };
}

// ============================================
// SYNC: FILMS (TMDB account rated)
// ============================================
async function syncFilms() {
  if (!TMDB_API_KEY || !TMDB_SESSION_ID || !TMDB_ACCOUNT_ID) {
    return { name: 'Films (TMDB)', success: false, message: 'Missing TMDB_API_KEY, TMDB_SESSION_ID, or TMDB_ACCOUNT_ID' };
  }

  printHeader('FILMS — TMDB', COLORS.yellow);
  printStep('👤', `Account ID: ${TMDB_ACCOUNT_ID}`);

  if (!fs.existsSync(FILMS_DIR)) fs.mkdirSync(FILMS_DIR, { recursive: true });

  // Fetch all rated movies
  const allMovies = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    printStep('📡', `Fetching page ${page}/${totalPages}...`);
    const url = `${TMDB_BASE}/account/${TMDB_ACCOUNT_ID}/rated/movies?api_key=${TMDB_API_KEY}&session_id=${TMDB_SESSION_ID}&page=${page}&sort_by=created_at.desc`;
    const res = await fetch(url);
    if (!res.ok) break;
    const json = await res.json();
    totalPages = json.total_pages || 1;
    allMovies.push(...(json.results || []));
    printStep('📦', `Got ${json.results?.length || 0} movies (total: ${allMovies.length})`);
    page++;
    await sleep(300);
  }

  if (allMovies.length === 0) {
    printStep('ℹ️', 'No rated movies found. Rate movies on TMDB to start syncing!');
    return { name: 'Films (TMDB)', success: true, message: '0 rated movies — rate on TMDB to start' };
  }

  printStep('🔄', `Processing ${allMovies.length} films...\n`);
  let created = 0, updated = 0;

  for (let i = 0; i < allMovies.length; i++) {
    const movie = allMovies[i];
    const tmdbId = movie.id;
    const title = movie.title;
    const slug = slugify(title) || `film-${tmdbId}`;

    // Fetch details for director
    let director = 'N/A';
    try {
      const detailRes = await fetch(`${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits`);
      if (detailRes.ok) {
        const detail = await detailRes.json();
        const dir = detail.credits?.crew?.find(c => c.job === 'Director');
        if (dir) director = dir.name;
      }
      await sleep(300);
    } catch (e) {}

    const data = {
      title,
      tmdb_id: tmdbId,
      rating: movie.rating || 0,
      genre: movie.genre_ids ? 'N/A' : 'N/A', // will be enriched
      year: movie.release_date ? new Date(movie.release_date).getFullYear() : new Date().getFullYear(),
      director,
      status: 'watched',
      cover: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
      date: new Date().toISOString().split('T')[0],
    };

    // Enrich genre
    try {
      const genreRes = await fetch(`${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=vi-VN`);
      if (genreRes.ok) {
        const genreData = await genreRes.json();
        data.genre = genreData.genres?.map(g => g.name).join(', ') || 'N/A';
      }
    } catch (e) {}

    const result = saveEntry(FILMS_DIR, slug, data, 'tmdb_id', tmdbId);
    if (result === 'created') created++;
    else updated++;

    printProgress('Films', i + 1, allMovies.length);
  }

  printResult(created, updated);
  return { name: 'Films (TMDB)', success: true, message: `${allMovies.length} films — ${created} new, ${updated} updated` };
}

// ============================================
// SYNC: Fetch missing covers
// ============================================
async function fetchMissingCovers() {
  if (!TMDB_API_KEY) return { name: 'Cover fetch', success: false, message: 'No TMDB_API_KEY' };

  printHeader('FETCH MISSING COVERS', COLORS.blue);

  let fetched = 0;

  // Anime covers from MAL data (already in frontmatter)
  // Films covers from TMDB
  if (fs.existsSync(FILMS_DIR)) {
    const files = fs.readdirSync(FILMS_DIR).filter(f => f.endsWith('.md'));
    for (let i = 0; i < files.length; i++) {
      const filepath = path.join(FILMS_DIR, files[i]);
      const content = fs.readFileSync(filepath, 'utf-8');
      const parsed = parseFrontmatter(content);
      if (!parsed || parsed.frontmatter.cover) continue;

      const tmdbId = parsed.frontmatter.tmdb_id;
      if (!tmdbId) continue;

      try {
        const res = await fetch(`${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_API_KEY}`);
        if (res.ok) {
          const data = await res.json();
          if (data.poster_path) {
            parsed.frontmatter.cover = `https://image.tmdb.org/t/p/w500${data.poster_path}`;
            fs.writeFileSync(filepath, buildFrontmatter(parsed.frontmatter) + parsed.body);
            fetched++;
          }
        }
        await sleep(300);
      } catch (e) {}

      printProgress('Covers', i + 1, files.length);
    }
  }

  printResult(fetched, 0);
  return { name: 'Cover fetch', success: true, message: `${fetched} covers fetched` };
}

// ============================================
// BUILD CHECK
// ============================================
async function buildCheck() {
  printHeader('BUILD CHECK', COLORS.green);
  printStep('🔨', 'Running astro build...\n');

  const { execSync } = await import('child_process');
  try {
    execSync('npx astro build', {
      cwd: path.resolve('.'),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300000,
    });
    printStep('✅', 'Build successful!\n');
    return { name: 'Build', success: true, message: 'Build passed' };
  } catch (err) {
    const stderr = err.stderr?.toString() || '';
    const match = stderr.match(/\[InvalidContentEntryDataError\].*$/m) || stderr.match(/Error:.*/m);
    const errorMsg = match ? match[0] : 'Build failed (check logs)';
    printStep('❌', `Build FAILED: ${errorMsg}\n`);
    return { name: 'Build', success: false, message: errorMsg };
  }
}

// ============================================
// MAIN
// ============================================
async function main() {
  console.clear();
  printHeader('mediaVault — SYNC ALL', COLORS.cyan);

  const startTime = Date.now();
  const results = [];

  // Step 1: Anime
  try {
    results.push(await syncAnime());
  } catch (err) {
    results.push({ name: 'Anime (MAL)', success: false, message: err.message });
  }

  // Step 2: Films
  try {
    results.push(await syncFilms());
  } catch (err) {
    results.push({ name: 'Films (TMDB)', success: false, message: err.message });
  }

  // Step 3: Missing covers
  try {
    results.push(await fetchMissingCovers());
  } catch (err) {
    results.push({ name: 'Cover fetch', success: false, message: err.message });
  }

  // Step 4: Build check
  try {
    results.push(await buildCheck());
  } catch (err) {
    results.push({ name: 'Build', success: false, message: err.message });
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  printSummary(results);
  console.log(`  ${COLORS.dim}Total time: ${elapsed}s${COLORS.reset}\n`);

  // Exit with error if build failed
  const buildResult = results.find(r => r.name === 'Build');
  if (buildResult && !buildResult.success) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n${COLORS.red}Fatal error: ${err.message}${COLORS.reset}`);
  process.exit(1);
});
