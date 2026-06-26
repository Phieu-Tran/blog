/**
 * sync-imdb-to-tmdb.mjs
 *
 * Sync IMDb-backed film ratings from this repo (or an IMDb CSV export) to the
 * TMDB account. Dry-run by default. Use --apply to write ratings. Use
 * --delete-extra plus CONFIRM_TMDB_DELETE=DELETE to remove TMDB account ratings
 * that are not present in the IMDb source.
 *
 * Usage:
 *   TMDB_API_KEY=xxx TMDB_SESSION_ID=xxx TMDB_ACCOUNT_ID=123 \
 *     node src/scripts/sync-imdb-to-tmdb.mjs
 *
 *   node src/scripts/sync-imdb-to-tmdb.mjs "C:\path\ratings.csv" --apply
 *   CONFIRM_TMDB_DELETE=DELETE node src/scripts/sync-imdb-to-tmdb.mjs --apply --delete-extra
 */

import fs from 'fs';
import path from 'path';

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_SESSION_ID = process.env.TMDB_SESSION_ID || '';
const TMDB_ACCOUNT_ID = process.env.TMDB_ACCOUNT_ID || '';
const CONFIRM_TMDB_DELETE = process.env.CONFIRM_TMDB_DELETE || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const FILMS_DIR = path.resolve('src/content/films');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DELETE_EXTRA = args.includes('--delete-extra');
const INCLUDE_NON_IMDB_SCORE = args.includes('--include-non-imdb-score');
const csvPath = args.find(arg => !arg.startsWith('--'));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift()?.map(header => header.replace(/^\uFEFF/, '').trim()) || [];
  return rows
    .filter(values => values.some(value => value.trim() !== ''))
    .map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const frontmatter = {};
  match[1].split(/\r?\n/).forEach(line => {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    } else if (!Number.isNaN(Number(value)) && value !== '') {
      value = Number(value);
    }
    frontmatter[key] = value;
  });

  return frontmatter;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function tmdbTypeFromImdbType(titleType) {
  const type = String(titleType || '').toLowerCase();
  if (type === 'tv series' || type === 'tv mini series') return 'tv';
  return 'movie';
}

function normalizeTmdbType(type) {
  return type === 'tv' ? 'tv' : 'movie';
}

function itemKey(type, tmdbId) {
  return `${normalizeTmdbType(type)}:${tmdbId}`;
}

function tmdbEndpoint(type, tmdbId) {
  return `${TMDB_BASE}/${normalizeTmdbType(type)}/${tmdbId}`;
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${data.status_message || text}`);
  }
  return data;
}

async function findTmdbByImdbId(imdbId, expectedType) {
  const url = `${TMDB_BASE}/find/${encodeURIComponent(imdbId)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
  const found = await fetchJson(url);
  const results = expectedType === 'tv' ? found.tv_results || [] : found.movie_results || [];
  const match = results[0];
  return match?.id ? { tmdb_id: match.id, tmdb_type: expectedType } : null;
}

function readDesiredFromCsv(filePath) {
  const rows = parseCsv(fs.readFileSync(filePath, 'utf-8'));
  return rows.map(row => ({
    title: row.Title?.trim() || row['Original Title']?.trim() || row.Const,
    imdb_id: row.Const?.trim(),
    tmdb_type: tmdbTypeFromImdbType(row['Title Type']),
    rating: toNumber(row['Your Rating']) || 0,
  })).filter(item => item.imdb_id && item.rating > 0);
}

function readDesiredFromContent() {
  if (!fs.existsSync(FILMS_DIR)) return [];

  const desired = [];
  for (const file of fs.readdirSync(FILMS_DIR).filter(name => name.endsWith('.md'))) {
    const filePath = path.join(FILMS_DIR, file);
    const frontmatter = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'));
    if (!frontmatter?.imdb_id || !frontmatter.rating) continue;
    if (!INCLUDE_NON_IMDB_SCORE && !frontmatter.imdb_score) continue;

    desired.push({
      file,
      title: frontmatter.title,
      imdb_id: String(frontmatter.imdb_id),
      tmdb_id: frontmatter.tmdb_id ? Number(frontmatter.tmdb_id) : undefined,
      tmdb_type: normalizeTmdbType(frontmatter.tmdb_type),
      rating: Number(frontmatter.rating),
    });
  }

  return desired;
}

async function resolveDesiredItems(items) {
  const desired = new Map();
  const missing = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let tmdb = item.tmdb_id
      ? { tmdb_id: item.tmdb_id, tmdb_type: normalizeTmdbType(item.tmdb_type) }
      : null;

    if (!tmdb) {
      tmdb = await findTmdbByImdbId(item.imdb_id, normalizeTmdbType(item.tmdb_type));
      await sleep(250);
    }

    if (!tmdb) {
      missing.push(item);
      continue;
    }

    desired.set(itemKey(tmdb.tmdb_type, tmdb.tmdb_id), {
      ...item,
      tmdb_id: tmdb.tmdb_id,
      tmdb_type: tmdb.tmdb_type,
    });

    if ((i + 1) % 25 === 0) {
      console.log(`Resolved ${i + 1}/${items.length} desired ratings...`);
    }
  }

  return { desired, missing };
}

async function fetchRatedItems(type) {
  const endpoint = type === 'tv' ? 'tv' : 'movies';
  const rated = new Map();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = `${TMDB_BASE}/account/${TMDB_ACCOUNT_ID}/rated/${endpoint}?api_key=${TMDB_API_KEY}&session_id=${TMDB_SESSION_ID}&page=${page}&sort_by=created_at.desc`;
    const data = await fetchJson(url);
    totalPages = data.total_pages || 1;

    for (const item of data.results || []) {
      rated.set(itemKey(type, item.id), {
        title: item.title || item.name || item.original_title || item.original_name,
        tmdb_id: item.id,
        tmdb_type: type,
        rating: Number(item.rating) || 0,
      });
    }

    page++;
    await sleep(250);
  }

  return rated;
}

async function fetchCurrentRatings() {
  return new Map([
    ...(await fetchRatedItems('movie')),
    ...(await fetchRatedItems('tv')),
  ]);
}

function buildPlan(desired, current) {
  const toRate = [];
  const unchanged = [];
  const toDelete = [];

  for (const [key, item] of desired) {
    const currentItem = current.get(key);
    if (!currentItem || Number(currentItem.rating) !== Number(item.rating)) {
      toRate.push({ ...item, current_rating: currentItem?.rating || null });
    } else {
      unchanged.push(item);
    }
  }

  if (DELETE_EXTRA) {
    for (const [key, item] of current) {
      if (!desired.has(key)) toDelete.push(item);
    }
  }

  return { toRate, unchanged, toDelete };
}

async function rateItem(item) {
  const url = `${tmdbEndpoint(item.tmdb_type, item.tmdb_id)}/rating?api_key=${TMDB_API_KEY}&session_id=${TMDB_SESSION_ID}`;
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
    body: JSON.stringify({ value: item.rating }),
  });
}

async function deleteRating(item) {
  const url = `${tmdbEndpoint(item.tmdb_type, item.tmdb_id)}/rating?api_key=${TMDB_API_KEY}&session_id=${TMDB_SESSION_ID}`;
  return fetchJson(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
  });
}

function printList(label, items) {
  console.log(`\n${label}: ${items.length}`);
  for (const item of items.slice(0, 40)) {
    const current = item.current_rating == null ? '' : ` current=${item.current_rating}`;
    console.log(`  - [${item.tmdb_type}:${item.tmdb_id}] ${item.title} -> ${item.rating || 'delete'}${current}`);
  }
  if (items.length > 40) console.log(`  ... ${items.length - 40} more`);
}

async function applyPlan(plan) {
  if (!APPLY) return;

  let rated = 0;
  for (const item of plan.toRate) {
    await rateItem(item);
    rated++;
    await sleep(250);
  }

  let deleted = 0;
  if (plan.toDelete.length) {
    if (CONFIRM_TMDB_DELETE !== 'DELETE') {
      throw new Error('Refusing to delete TMDB ratings without CONFIRM_TMDB_DELETE=DELETE.');
    }

    for (const item of plan.toDelete) {
      await deleteRating(item);
      deleted++;
      await sleep(250);
    }
  }

  console.log(`\nApplied rating updates: ${rated}`);
  console.log(`Applied rating deletes: ${deleted}`);
}

async function main() {
  if (!TMDB_API_KEY || !TMDB_SESSION_ID || !TMDB_ACCOUNT_ID) {
    console.error('Missing TMDB_API_KEY, TMDB_SESSION_ID, or TMDB_ACCOUNT_ID.');
    process.exit(1);
  }

  const sourceItems = csvPath ? readDesiredFromCsv(csvPath) : readDesiredFromContent();
  console.log(`Source: ${csvPath || 'src/content/films IMDb-backed entries'}`);
  console.log(`Source ratings: ${sourceItems.length}`);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Delete extra TMDB ratings: ${DELETE_EXTRA ? 'yes' : 'no'}`);

  const { desired, missing } = await resolveDesiredItems(sourceItems);
  const current = await fetchCurrentRatings();
  const plan = buildPlan(desired, current);

  console.log(`\nResolved desired ratings: ${desired.size}`);
  console.log(`Current TMDB account ratings: ${current.size}`);
  console.log(`Missing on TMDB: ${missing.length}`);
  printList('Ratings to add/update on TMDB', plan.toRate);
  printList('Ratings to delete from TMDB', plan.toDelete);
  console.log(`\nUnchanged ratings: ${plan.unchanged.length}`);

  if (missing.length) {
    console.log('\nMissing IMDb IDs:');
    for (const item of missing.slice(0, 40)) {
      console.log(`  - ${item.imdb_id} ${item.title}`);
    }
    if (missing.length > 40) console.log(`  ... ${missing.length - 40} more`);
  }

  await applyPlan(plan);

  if (!APPLY) {
    console.log('\nDry run only; no TMDB account changes were made.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
