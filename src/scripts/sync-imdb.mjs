/**
 * sync-imdb.mjs
 *
 * Import IMDb ratings CSV into src/content/films.
 *
 * Usage:
 *   node src/scripts/sync-imdb.mjs "C:\path\ratings.csv"
 *   IMDB_CSV_PATH="C:\path\ratings.csv" TMDB_API_KEY=xxx node src/scripts/sync-imdb.mjs
 *
 * IMDb is the source of truth for identity, title, user rating, IMDb score,
 * year, title type, and rated date. TMDB is only used for enrichment through
 * the external IMDb ID endpoint, never through title search.
 */

import fs from 'fs';
import path from 'path';

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const FILMS_DIR = path.resolve('src/content/films');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || process.env.DRY_RUN === '1';
const ENRICH_EXISTING = args.includes('--enrich-existing') || process.env.ENRICH_EXISTING === '1';
const csvPath = args.find(arg => !arg.startsWith('--')) || process.env.IMDB_CSV_PATH || process.env.IMDB_CSV;

const FRONTMATTER_ORDER = [
  'title',
  'imdb_id',
  'tmdb_id',
  'tmdb_type',
  'rating',
  'imdb_score',
  'tmdb_score',
  'genre',
  'year',
  'director',
  'status',
  'date',
  'cover',
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
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
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
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

  return { frontmatter, body: match[2] };
}

function quoteYaml(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function buildFrontmatter(data) {
  const keys = [
    ...FRONTMATTER_ORDER,
    ...Object.keys(data).filter(key => !FRONTMATTER_ORDER.includes(key)),
  ];

  const lines = [];
  for (const key of keys) {
    const value = data[key];
    if (value === undefined || value === null || value === '') continue;

    if (key === 'title') {
      lines.push(`${key}: ${quoteYaml(value)}`);
    } else if (typeof value === 'string' && /[:,"\s]/.test(value)) {
      lines.push(`${key}: ${quoteYaml(value)}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  return `---\n${lines.join('\n')}\n---\n`;
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

function filmDataFromRow(row) {
  return {
    title: row.Title?.trim() || row['Original Title']?.trim() || row.Const,
    imdb_id: row.Const?.trim(),
    tmdb_type: tmdbTypeFromImdbType(row['Title Type']),
    rating: toNumber(row['Your Rating']) || 0,
    imdb_score: toNumber(row['IMDb Rating']),
    genre: row.Genres?.trim() || 'N/A',
    year: toNumber(row.Year) || new Date().getFullYear(),
    director: row.Directors?.trim() || 'N/A',
    status: 'watched',
    date: row['Date Rated']?.trim() || new Date().toISOString().split('T')[0],
  };
}

function normalizeTitle(title) {
  return String(title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function looksStaleTmdbMetadata(existing, imdbData) {
  if (!existing) return false;

  const titleChanged = normalizeTitle(existing.title) !== normalizeTitle(imdbData.title);
  const oldYear = toNumber(existing.year);
  const newYear = toNumber(imdbData.year);
  const yearChanged = oldYear && newYear ? Math.abs(oldYear - newYear) > 1 : false;

  if (imdbData.tmdb_type === 'tv') return titleChanged || yearChanged;
  return yearChanged;
}

function readExistingFilms() {
  const byImdbId = new Map();
  if (!fs.existsSync(FILMS_DIR)) return byImdbId;

  for (const file of fs.readdirSync(FILMS_DIR).filter(name => name.endsWith('.md'))) {
    const filePath = path.join(FILMS_DIR, file);
    const parsed = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'));
    if (!parsed?.frontmatter?.imdb_id) continue;

    byImdbId.set(String(parsed.frontmatter.imdb_id), {
      file,
      path: filePath,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
    });
  }

  return byImdbId;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

function tmdbEndpoint(type, tmdbId) {
  return `${TMDB_BASE}/${type === 'tv' ? 'tv' : 'movie'}/${tmdbId}`;
}

function getTmdbDirector(details, type) {
  if (type === 'tv' && details.created_by?.length) {
    return details.created_by.map(person => person.name).join(', ');
  }

  const director = details.credits?.crew?.find(person => person.job === 'Director');
  return director?.name;
}

async function findTmdbByImdbId(imdbId, expectedType) {
  if (!TMDB_API_KEY) return null;

  const findUrl = `${TMDB_BASE}/find/${encodeURIComponent(imdbId)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
  const found = await fetchJson(findUrl);
  if (!found) return null;

  const results = expectedType === 'tv' ? found.tv_results || [] : found.movie_results || [];
  const match = results[0];
  if (!match?.id) return null;

  await sleep(250);
  const detailsUrl = `${tmdbEndpoint(expectedType, match.id)}?api_key=${TMDB_API_KEY}&language=vi-VN&append_to_response=credits,external_ids`;
  const details = await fetchJson(detailsUrl);
  if (!details) return null;

  return {
    tmdb_id: match.id,
    tmdb_type: expectedType,
    tmdb_score: details.vote_average ? Number(details.vote_average.toFixed(1)) : undefined,
    cover: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : undefined,
    director: getTmdbDirector(details, expectedType),
  };
}

function mergeFilmData(existing, imdbData, tmdbData) {
  const merged = {
    ...(existing?.frontmatter || {}),
    ...imdbData,
  };

  if (tmdbData) {
    for (const [key, value] of Object.entries(tmdbData)) {
      if (value !== undefined && value !== null && value !== '') merged[key] = value;
    }
    if (imdbData.director !== 'N/A') merged.director = imdbData.director;
  } else if (looksStaleTmdbMetadata(existing?.frontmatter, imdbData)) {
    delete merged.cover;
    delete merged.tmdb_score;
  }

  return merged;
}

function mergeTmdbData(existing, tmdbData) {
  const merged = { ...existing.frontmatter };

  for (const [key, value] of Object.entries(tmdbData)) {
    if (value !== undefined && value !== null && value !== '') merged[key] = value;
  }

  if (existing.frontmatter.director && existing.frontmatter.director !== 'N/A') {
    merged.director = existing.frontmatter.director;
  }

  return merged;
}

function writeFilm(filePath, data, body) {
  if (DRY_RUN) return;
  fs.writeFileSync(filePath, buildFrontmatter(data) + (body || '\n'));
}

async function enrichExistingFilms() {
  if (!TMDB_API_KEY) {
    console.error('Missing TMDB_API_KEY. Existing-film enrichment needs TMDB API access.');
    process.exit(1);
  }

  const existingFilms = readExistingFilms();
  let checked = 0;
  let enriched = 0;
  let updated = 0;
  let unchanged = 0;
  let missing = 0;

  for (const existing of existingFilms.values()) {
    const { imdb_id, tmdb_type } = existing.frontmatter;
    if (!imdb_id) continue;

    checked++;
    const expectedType = tmdb_type === 'tv' ? 'tv' : 'movie';
    const tmdbData = await findTmdbByImdbId(String(imdb_id), expectedType);

    if (!tmdbData) {
      missing++;
      continue;
    }

    enriched++;
    const merged = mergeTmdbData(existing, tmdbData);
    const nextContent = buildFrontmatter(merged) + (existing.body || '\n');
    const prevContent = fs.readFileSync(existing.path, 'utf-8');

    if (nextContent === prevContent) {
      unchanged++;
    } else {
      writeFilm(existing.path, merged, existing.body);
      updated++;
    }

    await sleep(250);
  }

  console.log(`Existing IMDb films checked: ${checked}`);
  console.log(`TMDB enriched: ${enriched}`);
  console.log(`Updated: ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Missing on TMDB: ${missing}`);
  if (DRY_RUN) console.log('Dry run only; no files written.');
}

async function importImdbCsv() {
  if (!fs.existsSync(FILMS_DIR) && !DRY_RUN) {
    fs.mkdirSync(FILMS_DIR, { recursive: true });
  }

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf-8'));
  const existingFilms = readExistingFilms();

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let enriched = 0;
  let staleCleared = 0;

  for (const row of rows) {
    const imdbData = filmDataFromRow(row);
    if (!imdbData.imdb_id) continue;

    const existing = existingFilms.get(imdbData.imdb_id);
    const tmdbData = await findTmdbByImdbId(imdbData.imdb_id, imdbData.tmdb_type);
    if (tmdbData) enriched++;

    const staleBeforeMerge = !tmdbData && looksStaleTmdbMetadata(existing?.frontmatter, imdbData);
    const merged = mergeFilmData(existing, imdbData, tmdbData);

    const filename = existing?.file || `${slugify(imdbData.title) || imdbData.imdb_id}.md`;
    const filePath = existing?.path || path.join(FILMS_DIR, filename);
    const body = existing?.body || '\n';
    const nextContent = buildFrontmatter(merged) + body;
    const prevContent = existing ? fs.readFileSync(existing.path, 'utf-8') : '';

    if (nextContent === prevContent) {
      unchanged++;
    } else {
      writeFilm(filePath, merged, body);
      if (existing) updated++;
      else created++;
      if (staleBeforeMerge) staleCleared++;
    }

    await sleep(TMDB_API_KEY ? 250 : 0);
  }

  console.log(`IMDb rows: ${rows.length}`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`TMDB enriched: ${enriched}${TMDB_API_KEY ? '' : ' (no TMDB_API_KEY set)'}`);
  console.log(`Stale TMDB cover/score cleared: ${staleCleared}`);
  if (DRY_RUN) console.log('Dry run only; no files written.');
}

async function main() {
  if (ENRICH_EXISTING) {
    await enrichExistingFilms();
    return;
  }

  if (!csvPath) {
    console.error('Missing IMDb CSV path. Pass it as an argument, set IMDB_CSV_PATH, or use --enrich-existing.');
    process.exit(1);
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`IMDb CSV not found: ${csvPath}`);
    process.exit(1);
  }

  await importImdbCsv();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
