/**
 * sync-igdb.mjs
 *
 * Enrich game frontmatter from IGDB.
 *
 * Steam-backed games are matched by steam_appid through IGDB external_games.
 * Non-Steam games are matched by igdb_id, then exact IGDB title search.
 *
 * Required:
 *   IGDB_CLIENT_ID or TWITCH_CLIENT_ID
 *   IGDB_CLIENT_SECRET, TWITCH_CLIENT_SECRET, or IGDB_ACCESS_TOKEN
 */

import fs from 'fs';
import path from 'path';

const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID || process.env.TWITCH_CLIENT_ID || '';
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET || '';
const IGDB_ACCESS_TOKEN = process.env.IGDB_ACCESS_TOKEN || '';
const GAMES_DIR = path.resolve('src/content/games');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    if (k === 'title') return `${k}: "${String(v).replace(/"/g, '\\"')}"`;
    if (typeof v === 'string' && (v.includes(':') || v.includes(',') || v.includes(' ') || v.includes('"')))
      return `${k}: "${v.replace(/"/g, '\\"')}"`;
    return `${k}: ${v}`;
  }).filter(Boolean);
  return `---\n${lines.join('\n')}\n---\n`;
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

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
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

function igdbCoverUrl(game) {
  const imageId = game.cover?.image_id;
  return imageId ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg` : undefined;
}

function igdbYear(game) {
  if (!game.first_release_date) return undefined;
  const year = new Date(Number(game.first_release_date) * 1000).getUTCFullYear();
  return Number.isFinite(year) ? year : undefined;
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

function igdbScore(game) {
  const raw = game.total_rating || game.aggregated_rating || game.rating;
  if (!Number.isFinite(Number(raw))) return undefined;
  return Number((Number(raw) / 10).toFixed(1));
}

function igdbMetadata(game, existing) {
  return {
    title: game.name || existing.title,
    igdb_id: Number(game.id),
    genre: game.genres?.length ? game.genres.map(item => item.name).filter(Boolean).join(', ') : undefined,
    year: igdbYear(game),
    studio: igdbStudio(game),
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

const IGDB_GAME_FIELDS = 'name,category,cover.image_id,genres.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,first_release_date,total_rating,aggregated_rating,rating';

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

async function main() {
  if (!IGDB_CLIENT_ID || (!IGDB_CLIENT_SECRET && !IGDB_ACCESS_TOKEN)) {
    console.error('Usage: IGDB_CLIENT_ID=xxx IGDB_CLIENT_SECRET=xxx node src/scripts/sync-igdb.mjs');
    console.error('       TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET also work.');
    process.exit(1);
  }

  const entries = listMarkdownEntries(GAMES_DIR);
  const accessToken = await fetchIgdbAccessToken();
  if (!accessToken) throw new Error('Could not get IGDB access token');

  const steamEntries = entries.filter(entry => Number.isFinite(Number(entry.frontmatter.steam_appid)));
  const appToIgdb = await mapSteamAppIdsToIgdbIds(
    steamEntries.map(entry => Number(entry.frontmatter.steam_appid)),
    accessToken,
  );

  const entryToIgdb = new Map();
  for (const entry of entries) {
    const existingIgdbId = Number(entry.frontmatter.igdb_id);
    const appId = Number(entry.frontmatter.steam_appid);
    const mappedIgdbId = Number.isFinite(appId) ? appToIgdb.get(String(appId)) : undefined;
    const igdbId = mappedIgdbId || (Number.isFinite(existingIgdbId) ? existingIgdbId : undefined);
    if (igdbId) entryToIgdb.set(entry.file, igdbId);
  }

  const igdbGames = await fetchIgdbGames([...entryToIgdb.values()], accessToken);
  const titleMatchedGames = new Map();
  const titleLookupEntries = entries.filter(entry => !entryToIgdb.has(entry.file));

  for (const entry of titleLookupEntries) {
    const game = await findIgdbGameByTitle(entry.frontmatter.title, accessToken);
    if (game) titleMatchedGames.set(entry.file, game);
    await sleep(250);
  }

  let updated = 0;
  let skipped = 0;

  for (const entry of entries) {
    const game = igdbGames.get(Number(entryToIgdb.get(entry.file))) || titleMatchedGames.get(entry.file);
    if (!game) {
      skipped++;
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
  }

  console.log(`IGDB sync done: ${updated} updated, ${skipped} skipped.`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
