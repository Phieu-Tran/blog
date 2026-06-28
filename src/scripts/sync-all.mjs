/**
 * sync-all.mjs
 *
 * Sync automated data: Anime (MAL), Films/TV (TMDB), Steam games, IGDB metadata, and covers.
 * IMDb CSV imports can also seed films; TMDB identity is always tmdb_id + tmdb_type.
 *
 * Cách dùng:
 *   node src/scripts/sync-all.mjs
 *
 * Environment variables:
 *   MAL_USERNAME        — MAL username (required for anime)
 *   TMDB_API_KEY        — TMDB API key (required for films)
 *   TMDB_SESSION_ID     — TMDB session ID (required for TMDB account ratings)
 *   TMDB_ACCOUNT_ID     — TMDB account ID (required for TMDB account ratings)
 *   STEAM_API_KEY       — Steam Web API key (required for games)
 *   STEAM_ID            — Steam user ID (required for games)
 *   IGDB_CLIENT_ID      — Twitch/IGDB client ID (optional for game metadata; TWITCH_CLIENT_ID also works)
 *   IGDB_CLIENT_SECRET  — Twitch/IGDB client secret (optional for game metadata; TWITCH_CLIENT_SECRET also works)
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

// ============================================
// CONFIG
// ============================================
const MAL_USERNAME = process.env.MAL_USERNAME || process.argv[2] || '';
const STEAM_API_KEY = process.env.STEAM_API_KEY || '';
const STEAM_ID = process.env.STEAM_ID || '';
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID || process.env.TWITCH_CLIENT_ID || '';
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET || '';
const IGDB_ACCESS_TOKEN = process.env.IGDB_ACCESS_TOKEN || '';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_SESSION_ID = process.env.TMDB_SESSION_ID || '';
const TMDB_ACCOUNT_ID = process.env.TMDB_ACCOUNT_ID || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const SYNC_DELETE_MISSING = String(process.env.SYNC_DELETE_MISSING || 'true').toLowerCase() !== 'false';
const SYNC_DELETE_DRY_RUN = String(process.env.SYNC_DELETE_DRY_RUN || 'false').toLowerCase() === 'true';
const parsedMaxAutoDelete = Number(process.env.SYNC_MAX_AUTO_DELETE || 20);
const SYNC_MAX_AUTO_DELETE = Number.isFinite(parsedMaxAutoDelete) ? Math.max(0, Math.floor(parsedMaxAutoDelete)) : 20;
const SYNC_REPORT_DIR = process.env.SYNC_REPORT_DIR || '.sync';
const syncDeleteEvents = [];

const ANIME_DIR = path.resolve('src/content/anime');
const FILMS_DIR = path.resolve('src/content/films');
const GAMES_DIR = path.resolve('src/content/games');

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

function statsFromMessage(message = '') {
  const stats = {};
  const upstream = message.match(/^(\d+)\s+(?:anime|items|games)/i);
  const created = message.match(/(\d+)\s+(?:new|created)/i);
  const updated = message.match(/(\d+)\s+updated/i);
  const skipped = message.match(/(\d+)\s+skipped/i);
  const deleted = message.match(/(\d+)\s+deleted/i);
  const covers = message.match(/(\d+)\s+covers fetched/i);

  if (upstream) stats.upstream = Number(upstream[1]);
  if (created) stats.created = Number(created[1]);
  if (updated) stats.updated = Number(updated[1]);
  if (skipped) stats.skipped = Number(skipped[1]);
  if (deleted) stats.deleted = Number(deleted[1]);
  if (covers) stats.updated = Number(covers[1]);
  return stats;
}

function writeSyncReport(results, elapsedSeconds) {
  const reportDir = path.resolve(SYNC_REPORT_DIR);
  const generatedAt = new Date().toISOString();
  const normalizedResults = results.map(result => {
    const deleteEvent = syncDeleteEvents.find(event => event.source === result.name);
    const stats = {
      ...statsFromMessage(result.message),
      ...(result.stats || {}),
    };

    if (deleteEvent) {
      stats.deleteCandidates = deleteEvent.candidates.length;
      stats.deleteSkipped = deleteEvent.skipped;
      stats.deleteReason = deleteEvent.reason;
      stats.deleteFiles = deleteEvent.candidates;
      if (deleteEvent.deleted != null) stats.deleted = deleteEvent.deleted;
    }

    return {
      name: result.name,
      success: Boolean(result.success),
      message: result.message,
      stats,
    };
  });

  const report = {
    generatedAt,
    elapsedSeconds: Number(elapsedSeconds),
    deleteMissing: {
      enabled: SYNC_DELETE_MISSING,
      dryRun: SYNC_DELETE_DRY_RUN,
      maxAutoDelete: SYNC_MAX_AUTO_DELETE,
    },
    results: normalizedResults,
  };

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'sync-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  const lines = [
    '# Sync report',
    '',
    `Generated: ${generatedAt}`,
    `Elapsed: ${elapsedSeconds}s`,
    `Delete guard: enabled=${SYNC_DELETE_MISSING}, dry_run=${SYNC_DELETE_DRY_RUN}, max_auto_delete=${SYNC_MAX_AUTO_DELETE}`,
    '',
    '| Source | Status | Upstream | Created | Updated | Skipped | Deleted | Notes |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];

  for (const result of normalizedResults) {
    const stats = result.stats || {};
    const status = result.success ? 'OK' : 'FAIL';
    const notes = [
      stats.deleteSkipped ? `delete skipped: ${stats.deleteReason || 'unknown'}` : '',
      stats.deleteCandidates ? `delete candidates: ${stats.deleteCandidates}` : '',
      result.success ? '' : result.message,
    ].filter(Boolean).join('; ').replace(/\|/g, '/');

    lines.push([
      result.name,
      status,
      stats.upstream ?? '',
      stats.created ?? '',
      stats.updated ?? '',
      stats.skipped ?? '',
      stats.deleted ?? '',
      notes,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  const deleteRows = normalizedResults
    .flatMap(result => (result.stats?.deleteFiles || []).map(file => ({ source: result.name, file })));
  if (deleteRows.length) {
    lines.push('', '## Delete candidates', '');
    for (const row of deleteRows) lines.push(`- ${row.source}: ${row.file}`);
  }

  fs.writeFileSync(path.join(reportDir, 'sync-report.md'), `${lines.join('\n')}\n`);
  printStep('REPORT', `Wrote ${path.relative(process.cwd(), reportDir)}${path.sep}sync-report.md`);
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

async function fetchIgdbAccessToken() {
  if (IGDB_ACCESS_TOKEN) return IGDB_ACCESS_TOKEN;
  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) return '';

  const tokenUrl = new URL('https://id.twitch.tv/oauth2/token');
  tokenUrl.searchParams.set('client_id', IGDB_CLIENT_ID);
  tokenUrl.searchParams.set('client_secret', IGDB_CLIENT_SECRET);
  tokenUrl.searchParams.set('grant_type', 'client_credentials');

  const res = await fetch(tokenUrl, { method: 'POST' });
  if (!res.ok) throw new Error(`IGDB token request failed: ${res.status}`);
  const data = await res.json();
  return data.access_token || '';
}

async function igdbPost(endpoint, query, accessToken) {
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': IGDB_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'text/plain',
    },
    body: query,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IGDB ${endpoint} failed: ${res.status} ${text.slice(0, 120)}`);
  }

  return res.json();
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  const fm = {};
  match[1].split(/\r?\n/).forEach(line => {
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

function listMarkdownEntries(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.md'))
    .map(file => {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      const parsed = parseFrontmatter(content);
      return parsed ? { file, ...parsed } : null;
    })
    .filter(Boolean);
}

function describeManagedEntry(entry) {
  const frontmatter = entry.frontmatter || {};
  const refs = [];
  if (frontmatter.tmdb_id) refs.push(`tmdb:${frontmatter.tmdb_type || 'movie'}:${frontmatter.tmdb_id}`);
  if (frontmatter.mal_id) refs.push(`mal:${frontmatter.mal_id}`);
  return [entry.file, frontmatter.title, ...refs].filter(Boolean).join(' | ');
}

function deleteMissingManagedEntries({ dir, label, currentKeys, isManaged, keyFor }) {
  const recordDeleteEvent = event => {
    syncDeleteEvents.push({ source: label, ...event });
    return event;
  };

  if (!SYNC_DELETE_MISSING) {
    printStep('SKIP', `${label}: delete-missing disabled.`);
    return recordDeleteEvent({ deleted: 0, skipped: true, reason: 'disabled', candidates: [] });
  }

  if (!currentKeys.size) {
    printStep('SKIP', `${label}: delete-missing skipped because upstream returned 0 items.`);
    return recordDeleteEvent({ deleted: 0, skipped: true, reason: 'empty upstream', candidates: [] });
  }

  const candidates = listMarkdownEntries(dir).filter(entry => {
    if (!isManaged(entry.frontmatter)) return false;
    const key = keyFor(entry.frontmatter);
    return key && !currentKeys.has(key);
  });

  if (candidates.length) {
    printStep('INFO', `${label}: delete candidates:`);
    for (const entry of candidates) {
      printStep('-', describeManagedEntry(entry));
    }
  }

  if (candidates.length > SYNC_MAX_AUTO_DELETE) {
    printStep('SKIP', `${label}: delete-missing skipped (${candidates.length} candidates exceeds SYNC_MAX_AUTO_DELETE=${SYNC_MAX_AUTO_DELETE}).`);
    return recordDeleteEvent({ deleted: 0, skipped: true, reason: 'delete guard', candidates: candidates.map(entry => entry.file) });
  }

  if (SYNC_DELETE_DRY_RUN) {
    printStep('DRY', `${label}: would delete ${candidates.length} entries no longer present upstream.`);
    return recordDeleteEvent({ deleted: 0, skipped: true, reason: 'dry-run', candidates: candidates.map(entry => entry.file) });
  }

  for (const entry of candidates) {
    fs.unlinkSync(path.join(dir, entry.file));
  }

  if (candidates.length) {
    printStep('DEL', `${label}: deleted ${candidates.length} entries no longer present upstream.`);
  }

  return recordDeleteEvent({ deleted: candidates.length, skipped: false, candidates: candidates.map(entry => entry.file) });
}

function normalizeTmdbType(type) {
  return type === 'tv' ? 'tv' : 'movie';
}

function findFilmByTmdbRef(tmdbId, tmdbType = 'movie') {
  if (!fs.existsSync(FILMS_DIR)) return null;
  const expectedType = normalizeTmdbType(tmdbType);
  for (const file of fs.readdirSync(FILMS_DIR).filter(f => f.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(FILMS_DIR, file), 'utf-8');
    const parsed = parseFrontmatter(content);
    if (!parsed || Number(parsed.frontmatter.tmdb_id) !== Number(tmdbId)) continue;

    const existingType = normalizeTmdbType(parsed.frontmatter.tmdb_type);
    if (existingType === expectedType) return { file, ...parsed };
  }
  return null;
}

function findFilmByIdentity(data) {
  if (data.imdb_id) {
    const byImdb = findFileByField(FILMS_DIR, 'imdb_id', data.imdb_id);
    if (byImdb) return byImdb;
  }

  if (data.tmdb_id) {
    const byTmdb = findFilmByTmdbRef(data.tmdb_id, data.tmdb_type);
    if (byTmdb) return byTmdb;
  }

  return null;
}

function mergeFrontmatter(existingFrontmatter, data) {
  const merged = { ...existingFrontmatter };
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    if (k === 'rating' && Number(merged.rating) > 0 && v === 0) continue;
    if (k === 'date' && merged.date) continue;
    merged[k] = v;
  }
  return merged;
}

function saveEntry(dir, slug, data, existingField, existingValue) {
  const existing = findFileByField(dir, existingField, existingValue);
  if (existing) {
    const merged = mergeFrontmatter(existing.frontmatter, data);
    fs.writeFileSync(path.join(dir, existing.file), buildFrontmatter(merged) + existing.body);
    return 'updated';
  } else {
    const filename = `${slug}.md`;
    fs.writeFileSync(path.join(dir, filename), buildFrontmatter(data) + '\n');
    return 'created';
  }
}

function saveFilmEntry(slug, data) {
  const existing = findFilmByIdentity(data);
  if (existing) {
    const merged = mergeFrontmatter(existing.frontmatter, data);
    fs.writeFileSync(path.join(FILMS_DIR, existing.file), buildFrontmatter(merged) + existing.body);
    return 'updated';
  }

  let filename = `${slug}.md`;
  if (fs.existsSync(path.join(FILMS_DIR, filename))) {
    filename = `${slug}-${normalizeTmdbType(data.tmdb_type)}-${data.tmdb_id}.md`;
  }
  fs.writeFileSync(path.join(FILMS_DIR, filename), buildFrontmatter(data) + '\n');
  return 'created';
}

function tmdbEndpoint(type, tmdbId) {
  return `${TMDB_BASE}/${normalizeTmdbType(type)}/${tmdbId}`;
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
  let upstreamComplete = true;
  while (true) {
    printStep('📡', `Fetching page offset=${offset}...`);
    const html = await fetchPage(`https://myanimelist.net/animelist/${MAL_USERNAME}?offset=${offset}`);
    const match = html.match(/data-items="([^"]*)"/);
    if (!match) {
      upstreamComplete = false;
      break;
    }
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

  const currentMalIds = new Set(allItems.map(item => Number(item.anime_id)));
  const statusMap = { 1: 'watching', 2: 'completed', 3: 'on_hold', 4: 'dropped', 6: 'plan' };

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

  const deletion = upstreamComplete
    ? deleteMissingManagedEntries({
        dir: ANIME_DIR,
        label: 'Anime (MAL)',
        currentKeys: currentMalIds,
        isManaged: frontmatter => Number.isFinite(Number(frontmatter.mal_id)),
        keyFor: frontmatter => Number(frontmatter.mal_id),
      })
    : { deleted: 0, skipped: true, reason: 'incomplete upstream' };

  if (!upstreamComplete) {
    printStep('SKIP', 'Anime (MAL): delete-missing skipped because MAL list fetch was incomplete.');
  }

  printResult(created, updated);
  return { name: 'Anime (MAL)', success: true, message: `${allItems.length} anime — ${created} new, ${updated} updated, ${deletion.deleted} deleted${deletion.skipped ? ` (${deletion.reason})` : ''}` };
}

// ============================================
// SYNC: FILMS (TMDB account rated, movies + TV)
// ============================================
async function fetchRatedTmdbItems(tmdbType) {
  const endpoint = tmdbType === 'tv' ? 'tv' : 'movies';
  const allItems = [];
  let complete = true;
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    printStep('📡', `Fetching ${tmdbType} page ${page}/${totalPages}...`);
    const url = `${TMDB_BASE}/account/${TMDB_ACCOUNT_ID}/rated/${endpoint}?api_key=${TMDB_API_KEY}&session_id=${TMDB_SESSION_ID}&page=${page}&sort_by=created_at.desc`;
    const res = await fetch(url);
    if (!res.ok) {
      complete = false;
      break;
    }
    const json = await res.json();
    totalPages = json.total_pages || 1;
    allItems.push(...(json.results || []).map(item => ({ ...item, tmdb_type: tmdbType })));
    printStep('📦', `Got ${json.results?.length || 0} ${tmdbType} items (total: ${allItems.length})`);
    page++;
    await sleep(300);
  }

  return { items: allItems, complete };
}

async function fetchTmdbDetails(tmdbId, tmdbType) {
  const url = `${tmdbEndpoint(tmdbType, tmdbId)}?api_key=${TMDB_API_KEY}&language=vi-VN&append_to_response=credits,external_ids`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

function tmdbTitle(details, tmdbType, fallback) {
  return tmdbType === 'tv'
    ? details.name || details.original_name || fallback.name || fallback.original_name
    : details.title || details.original_title || fallback.title || fallback.original_title;
}

function tmdbYear(details, tmdbType, fallback) {
  const date = tmdbType === 'tv'
    ? details.first_air_date || fallback.first_air_date
    : details.release_date || fallback.release_date;
  const year = date ? new Date(date).getFullYear() : undefined;
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

function tmdbDirector(details, tmdbType) {
  if (tmdbType === 'tv' && details.created_by?.length) {
    return details.created_by.map(person => person.name).join(', ');
  }

  const director = details.credits?.crew?.find(person => person.job === 'Director');
  return director?.name || 'N/A';
}

function tmdbImdbId(details, tmdbType) {
  return tmdbType === 'tv'
    ? details.external_ids?.imdb_id
    : details.imdb_id || details.external_ids?.imdb_id;
}

async function syncFilms() {
  if (!TMDB_API_KEY || !TMDB_SESSION_ID || !TMDB_ACCOUNT_ID) {
    return { name: 'Films/TV (TMDB)', success: false, message: 'Missing TMDB_API_KEY, TMDB_SESSION_ID, or TMDB_ACCOUNT_ID' };
  }

  printHeader('FILMS & TV - TMDB', COLORS.yellow);
  printStep('👤', `Account ID: ${TMDB_ACCOUNT_ID}`);

  if (!fs.existsSync(FILMS_DIR)) fs.mkdirSync(FILMS_DIR, { recursive: true });

  const movieRatings = await fetchRatedTmdbItems('movie');
  const tvRatings = await fetchRatedTmdbItems('tv');
  const upstreamComplete = movieRatings.complete && tvRatings.complete;
  const allItems = [
    ...movieRatings.items,
    ...tvRatings.items,
  ];

  if (allItems.length === 0) {
    printStep('ℹ️', 'No rated movies or TV shows found on TMDB.');
    return { name: 'Films/TV (TMDB)', success: true, message: '0 rated items' };
  }

  printStep('🔄', `Processing ${allItems.length} TMDB-rated items...\n`);
  let created = 0, updated = 0, skipped = 0;
  const currentTmdbKeys = new Set(allItems.map(item => `${normalizeTmdbType(item.tmdb_type)}:${Number(item.id)}`));

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    const tmdbId = item.id;
    const tmdbType = normalizeTmdbType(item.tmdb_type);

    const details = await fetchTmdbDetails(tmdbId, tmdbType);
    await sleep(300);

    if (!details) {
      skipped++;
      printProgress('Films/TV', i + 1, allItems.length);
      continue;
    }

    const title = tmdbTitle(details, tmdbType, item);
    const slug = slugify(title) || `film-${tmdbType}-${tmdbId}`;
    const data = {
      title,
      imdb_id: tmdbImdbId(details, tmdbType),
      tmdb_id: tmdbId,
      tmdb_type: tmdbType,
      rating: item.rating || 0,
      genre: details.genres?.map(g => g.name).join(', ') || 'N/A',
      year: tmdbYear(details, tmdbType, item),
      director: tmdbDirector(details, tmdbType),
      tmdb_score: details.vote_average ? Number(details.vote_average.toFixed(1)) : undefined,
      status: 'watched',
      cover: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : undefined,
      date: new Date().toISOString().split('T')[0],
    };

    const result = saveFilmEntry(slug, data);
    if (result === 'created') created++;
    else updated++;

    printProgress('Films/TV', i + 1, allItems.length);
  }

  const deletion = upstreamComplete
    ? deleteMissingManagedEntries({
        dir: FILMS_DIR,
        label: 'Films/TV (TMDB)',
        currentKeys: currentTmdbKeys,
        isManaged: frontmatter => (
          frontmatter.status === 'watched' &&
          Number.isFinite(Number(frontmatter.tmdb_id)) &&
          ['movie', 'tv'].includes(frontmatter.tmdb_type)
        ),
        keyFor: frontmatter => `${normalizeTmdbType(frontmatter.tmdb_type)}:${Number(frontmatter.tmdb_id)}`,
      })
    : { deleted: 0, skipped: true, reason: 'incomplete upstream' };

  if (!upstreamComplete) {
    printStep('SKIP', 'Films/TV (TMDB): delete-missing skipped because TMDB rated list fetch was incomplete.');
  }

  printResult(created, updated, skipped);
  return { name: 'Films/TV (TMDB)', success: true, message: `${allItems.length} items — ${created} new, ${updated} updated, ${skipped} skipped, ${deletion.deleted} deleted${deletion.skipped ? ` (${deletion.reason})` : ''}` };
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
      const tmdbType = normalizeTmdbType(parsed.frontmatter.tmdb_type);
      if (!tmdbId) continue;

      try {
        const res = await fetch(`${tmdbEndpoint(tmdbType, tmdbId)}?api_key=${TMDB_API_KEY}`);
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
// SYNC: GAMES (Steam)
// ============================================
async function syncSteam() {
  if (!STEAM_API_KEY || !STEAM_ID) {
    return { name: 'Games (Steam)', success: false, message: 'Missing STEAM_API_KEY or STEAM_ID' };
  }

  printHeader('GAMES — Steam', COLORS.green);
  printStep('👤', `Steam ID: ${STEAM_ID}`);

  if (!fs.existsSync(GAMES_DIR)) fs.mkdirSync(GAMES_DIR, { recursive: true });

  // Fetch owned games
  const ownedRes = await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&format=json&include_appinfo=true&include_played_free_games=true`);
  const ownedData = await ownedRes.json();
  const games = ownedData.response?.games || [];

  // Fetch recent games
  const recentRes = await fetch(`https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&format=json`);
  const recentData = await recentRes.json();
  const recentGames = recentData.response?.games || [];
  const recentByAppId = new Map(recentGames.map(game => [Number(game.appid), game]));
  const recentAppIds = new Set(recentGames.map(g => Number(g.appid)));

  printStep('📦', `Found ${games.length} games (${recentAppIds.size} recently played)\n`);

  let created = 0, updated = 0;

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const appId = game.appid;
    const title = game.name;
    const slug = slugify(title) || `game-${appId}`;
    const playtimeHours = Math.round(game.playtime_forever / 60);
    const isRecent = recentAppIds.has(appId);
    const recentMinutes = Number(recentByAppId.get(appId)?.playtime_2weeks || 0);
    const recentHours = Math.round(recentMinutes / 60);
    const status = game.playtime_forever > 60 ? 'completed' : 'plan';
    const cover = `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/header.jpg`;
    const steamUrl = `https://store.steampowered.com/app/${appId}`;

    const data = {
      title, steam_appid: appId, steam_url: steamUrl, rating: 0, genre: 'N/A',
      year: new Date().getFullYear(), studio: 'N/A', status,
      source: 'steam', platform: 'PC', playtime_hours: playtimeHours, steam_recent: isRecent,
      steam_recent_hours: recentHours, cover,
      date: new Date().toISOString().split('T')[0],
    };

    const existing = findFileByField(GAMES_DIR, 'steam_appid', appId);
    if (existing) {
      const merged = { ...existing.frontmatter };
      merged.playtime_hours = playtimeHours;
      merged.steam_recent = isRecent;
      merged.steam_recent_hours = recentHours;
      if (!merged.cover) merged.cover = cover;
      for (const [k, v] of Object.entries(data)) {
        if (v === undefined || v === null) continue;
        if (k === 'rating' && Number(merged.rating) > 0) continue;
        if (k === 'genre' && merged.genre !== 'N/A') continue;
        if (k === 'studio' && merged.studio !== 'N/A') continue;
        if (k === 'platform' && merged.platform && !['Steam', 'IGDB', 'N/A'].includes(merged.platform)) continue;
        if (k === 'date' && merged.date) continue;
        merged[k] = v;
      }
      fs.writeFileSync(path.join(GAMES_DIR, existing.file), buildFrontmatter(merged) + existing.body);
      updated++;
    } else {
      fs.writeFileSync(path.join(GAMES_DIR, `${slug}.md`), buildFrontmatter(data) + '\n');
      created++;
    }

    printProgress('Steam', i + 1, games.length);
  }

  printResult(created, updated);
  return { name: 'Games (Steam)', success: true, message: `${games.length} games — ${created} new, ${updated} updated` };
}

// ============================================
// SYNC: GAME METADATA (IGDB)
// ============================================
function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function igdbCoverUrl(game) {
  const imageId = game.cover?.image_id;
  return imageId ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg` : undefined;
}

function igdbYear(game) {
  if (!game.first_release_date) return undefined;
  const year = new Date(Number(game.first_release_date) * 1000).getUTCFullYear();
  return Number.isFinite(year) ? year : undefined;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function igdbStudio(game) {
  const companies = game.involved_companies || [];
  const developers = companies
    .filter(item => item.developer)
    .map(item => item.company?.name)
    .filter(Boolean);
  const publishers = companies
    .filter(item => item.publisher)
    .map(item => item.company?.name)
    .filter(Boolean);
  const names = developers.length ? developers : publishers;
  return names.length ? [...new Set(names)].join(', ') : undefined;
}

function igdbPublisher(game) {
  const names = (game.involved_companies || [])
    .filter(item => item.publisher)
    .map(item => item.company?.name)
    .filter(Boolean);
  return names.length ? uniqueValues(names).join(', ') : undefined;
}

function igdbScore(game) {
  const raw = game.total_rating || game.aggregated_rating || game.rating;
  if (!Number.isFinite(Number(raw))) return undefined;
  return Number((Number(raw) / 10).toFixed(1));
}

function inferGameSource(existing) {
  if (existing.source) return existing.source;
  if (Number.isFinite(Number(existing.steam_appid))) return 'steam';
  if (Number.isFinite(Number(existing.igdb_id)) || existing.platform === 'IGDB') return 'igdb';
  return 'manual';
}

function normalizePlatformName(name) {
  const value = String(name || '').trim();
  const aliases = {
    'PC (Microsoft Windows)': 'PC',
    'Mac': 'PC',
    'Linux': 'PC',
    'PlayStation 3': 'PlayStation',
    'PlayStation 4': 'PlayStation',
    'PlayStation 5': 'PlayStation',
    'PlayStation Network': 'PlayStation',
    'Xbox 360': 'Xbox',
    'Xbox One': 'Xbox',
    'Xbox Series X|S': 'Xbox',
    'Nintendo Switch': 'Nintendo',
    'Wii': 'Nintendo',
    'Wii U': 'Nintendo',
    'Nintendo 3DS': 'Nintendo',
    'New Nintendo 3DS': 'Nintendo',
    'Android': 'Mobile',
    'iOS': 'Mobile',
  };
  return aliases[value] || value;
}

function igdbPlatform(game, existing) {
  const names = uniqueValues((game.platforms || [])
    .map(item => normalizePlatformName(item.name))
    .filter(Boolean));

  if (!names.length) {
    if (existing.platform === 'Steam') return 'PC';
    if (existing.platform === 'IGDB') return 'Unknown';
    return existing.platform;
  }

  if (names.length > 3) return 'Multi-platform';
  return names.join(', ');
}

function normalizeUrl(url) {
  if (!url) return undefined;
  const value = String(url).trim();
  if (!value) return undefined;
  return value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
}

function urlsFromIgdbLinks(game) {
  return [
    ...(game.websites || []).map(item => ({ url: normalizeUrl(item.url), category: Number(item.category) })),
    ...(game.external_games || []).map(item => ({ url: normalizeUrl(item.url), category: Number(item.category), uid: item.uid })),
  ].filter(item => item.url);
}

function findUrlByHost(game, hosts) {
  const needles = hosts.map(host => host.toLowerCase());
  return urlsFromIgdbLinks(game).find(item => {
    const url = item.url.toLowerCase();
    return needles.some(host => url.includes(host));
  })?.url;
}

function findWebsiteUrlByCategory(game, category) {
  return (game.websites || []).find(item => Number(item.category) === category)?.url;
}

function igdbSteamUrl(game, existing) {
  return findUrlByHost(game, ['store.steampowered.com']) ||
    (existing.steam_appid ? `https://store.steampowered.com/app/${existing.steam_appid}` : undefined);
}

function igdbMetadata(game, existing) {
  return {
    title: game.name || existing.title,
    source: inferGameSource(existing),
    igdb_id: Number(game.id),
    igdb_slug: game.slug,
    igdb_url: game.url || (game.slug ? `https://www.igdb.com/games/${game.slug}` : undefined),
    steam_url: igdbSteamUrl(game, existing),
    ign_url: findUrlByHost(game, ['ign.com']),
    metacritic_url: findUrlByHost(game, ['metacritic.com']),
    official_url: normalizeUrl(findWebsiteUrlByCategory(game, 1)),
    genre: game.genres?.length ? game.genres.map(item => item.name).filter(Boolean).join(', ') : undefined,
    year: igdbYear(game),
    studio: igdbStudio(game),
    publisher: igdbPublisher(game),
    platform: igdbPlatform(game, existing),
    cover: igdbCoverUrl(game),
    igdb_score: igdbScore(game),
    igdb_updated_at: new Date().toISOString().split('T')[0],
  };
}

function romanToArabicToken(token) {
  const map = {
    i: '1',
    ii: '2',
    iii: '3',
    iv: '4',
    v: '5',
    vi: '6',
    vii: '7',
    viii: '8',
    ix: '9',
    x: '10',
  };
  return map[token.toLowerCase()] || token;
}

function normalizeGameTitle(title) {
  return String(title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/g, romanToArabicToken)
    .replace(/^marvel'?s\s+/, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^marvels\s+/, '')
    .trim();
}

function escapeIgdbString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const IGDB_GAME_FIELDS = 'name,slug,url,category,cover.image_id,genres.name,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,first_release_date,total_rating,aggregated_rating,rating,websites.url,websites.category,external_games.url,external_games.category,external_games.uid';

function compareIgdbTitleCandidates(a, b) {
  const categoryA = Number.isFinite(Number(a.category)) ? Number(a.category) : 0;
  const categoryB = Number.isFinite(Number(b.category)) ? Number(b.category) : 0;
  if (categoryA !== categoryB) return categoryA - categoryB;

  const releaseA = Number(a.first_release_date || Number.MAX_SAFE_INTEGER);
  const releaseB = Number(b.first_release_date || Number.MAX_SAFE_INTEGER);
  if (releaseA !== releaseB) return releaseA - releaseB;

  return Number(b.total_rating || b.aggregated_rating || b.rating || 0) -
    Number(a.total_rating || a.aggregated_rating || a.rating || 0);
}

function shouldResolveByTitle(entry) {
  const appId = Number(entry.frontmatter.steam_appid);
  const igdbId = Number(entry.frontmatter.igdb_id);
  const source = String(entry.frontmatter.source || '').toLowerCase();
  const legacyPlatform = String(entry.frontmatter.platform || '').toLowerCase();
  return !Number.isFinite(appId) &&
    !Number.isFinite(igdbId) &&
    (source === 'igdb' || legacyPlatform === 'igdb');
}

async function mapSteamAppIdsToIgdbIds(appIds, accessToken) {
  const mapping = new Map();
  const uniqueAppIds = [...new Set(appIds.map(id => String(id)).filter(Boolean))];

  for (const group of chunkArray(uniqueAppIds, 100)) {
    const quoted = group.map(id => `"${id.replace(/"/g, '\\"')}"`).join(',');
    const rows = await igdbPost(
      'external_games',
      `fields game,uid,category,url; where category = 1 & uid = (${quoted}); limit 500;`,
      accessToken,
    );

    for (const row of rows) {
      if (row.uid && row.game && !mapping.has(String(row.uid))) {
        mapping.set(String(row.uid), Number(row.game));
      }
    }

    await sleep(250);
  }

  return mapping;
}

async function fetchIgdbGames(igdbIds, accessToken) {
  const games = new Map();
  const uniqueIds = [...new Set(igdbIds.map(id => Number(id)).filter(id => Number.isFinite(id)))];

  for (const group of chunkArray(uniqueIds, 100)) {
    const ids = group.join(',');
    const rows = await igdbPost(
      'games',
      `fields ${IGDB_GAME_FIELDS}; where id = (${ids}); limit 500;`,
      accessToken,
    );

    for (const row of rows) {
      if (row.id) games.set(Number(row.id), row);
    }

    await sleep(250);
  }

  return games;
}

async function findIgdbGameByTitle(title, accessToken) {
  if (!title) return null;
  const rows = await igdbPost(
    'games',
    `search "${escapeIgdbString(title)}"; fields ${IGDB_GAME_FIELDS}; limit 10;`,
    accessToken,
  );

  const expected = normalizeGameTitle(title);
  const exactMatches = rows.filter(row => normalizeGameTitle(row.name) === expected);
  return exactMatches.sort(compareIgdbTitleCandidates)[0] || null;
}

async function syncIgdb() {
  if (!IGDB_CLIENT_ID || (!IGDB_CLIENT_SECRET && !IGDB_ACCESS_TOKEN)) {
    return { name: 'Games metadata (IGDB)', success: true, message: 'Skipped: missing IGDB/Twitch client credentials' };
  }

  printHeader('GAMES METADATA - IGDB', COLORS.green);

  if (!fs.existsSync(GAMES_DIR)) {
    return { name: 'Games metadata (IGDB)', success: true, message: '0 games' };
  }

  const entries = listMarkdownEntries(GAMES_DIR);
  const accessToken = await fetchIgdbAccessToken();
  if (!accessToken) {
    return { name: 'Games metadata (IGDB)', success: false, message: 'Could not get IGDB access token' };
  }

  const steamEntries = entries.filter(entry => Number.isFinite(Number(entry.frontmatter.steam_appid)));
  const appIds = steamEntries.map(entry => Number(entry.frontmatter.steam_appid));
  printStep('ID', `Mapping ${appIds.length} Steam app IDs to IGDB...`);

  const appToIgdb = await mapSteamAppIdsToIgdbIds(appIds, accessToken);
  const entryToIgdb = new Map();

  for (const entry of entries) {
    if (shouldResolveByTitle(entry)) continue;

    const existingIgdbId = Number(entry.frontmatter.igdb_id);
    const appId = Number(entry.frontmatter.steam_appid);
    const mappedIgdbId = Number.isFinite(appId) ? appToIgdb.get(String(appId)) : undefined;
    const igdbId = mappedIgdbId || (Number.isFinite(existingIgdbId) ? existingIgdbId : undefined);
    if (igdbId) entryToIgdb.set(entry.file, igdbId);
  }

  const igdbIds = [...entryToIgdb.values()];
  printStep('DB', `Fetching ${new Set(igdbIds).size} IGDB game records...`);
  const igdbGames = await fetchIgdbGames(igdbIds, accessToken);
  const titleMatchedGames = new Map();

  const titleLookupEntries = entries.filter(entry => !entryToIgdb.has(entry.file));
  if (titleLookupEntries.length) {
    printStep('TITLE', `Resolving ${titleLookupEntries.length} games by exact IGDB title...`);
  }

  for (const entry of titleLookupEntries) {
    const game = await findIgdbGameByTitle(entry.frontmatter.title, accessToken);
    if (game) titleMatchedGames.set(entry.file, game);
    await sleep(250);
  }

  let updated = 0, skipped = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const igdbId = entryToIgdb.get(entry.file);
    const game = igdbId ? igdbGames.get(Number(igdbId)) : titleMatchedGames.get(entry.file);

    if (!game) {
      skipped++;
      printProgress('IGDB', i + 1, entries.length);
      continue;
    }

    const merged = { ...entry.frontmatter };
    const metadata = igdbMetadata(game, merged);
    for (const [key, value] of Object.entries(metadata)) {
      if (value === undefined || value === null || value === '') continue;
      merged[key] = value;
    }

    fs.writeFileSync(path.join(GAMES_DIR, entry.file), buildFrontmatter(merged) + entry.body);
    updated++;
    printProgress('IGDB', i + 1, entries.length);
  }

  printResult(0, updated, skipped);
  return { name: 'Games metadata (IGDB)', success: true, message: `${updated} updated, ${skipped} skipped` };
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
  printHeader('Phieu.work — SYNC ALL', COLORS.cyan);

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
    results.push({ name: 'Films/TV (TMDB)', success: false, message: err.message });
  }

  // Step 3: Games (Steam)
  try {
    results.push(await syncSteam());
  } catch (err) {
    results.push({ name: 'Games (Steam)', success: false, message: err.message });
  }

  // Step 4: Game metadata (IGDB)
  try {
    results.push(await syncIgdb());
  } catch (err) {
    results.push({ name: 'Games metadata (IGDB)', success: false, message: err.message });
  }

  // Step 5: Missing covers
  try {
    results.push(await fetchMissingCovers());
  } catch (err) {
    results.push({ name: 'Cover fetch', success: false, message: err.message });
  }

  // Step 6: Build check
  try {
    results.push(await buildCheck());
  } catch (err) {
    results.push({ name: 'Build', success: false, message: err.message });
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  printSummary(results);
  writeSyncReport(results, elapsed);
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
