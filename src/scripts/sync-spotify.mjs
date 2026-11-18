/**
 * sync-spotify.mjs
 *
 * Sync Spotify "saved albums" (Your Library → Albums) into src/content/music/.
 *
 * - Identity anchor: spotify_id. Files are matched by it, never by title.
 * - Sync owns: title, artist, year, tracks, label, cover, spotify_id, source, spotify_recent.
 * - Sync never overwrites local: rating, favorite_tracks, soundtrack_of, aka, body notes,
 *   and only fills genre / kind when they are missing (so a manual "ost" stays "ost").
 * - Status: new albums start as "listened" ("listening" if played recently). An album Spotify
 *   reports in recently-played becomes "listening"; when it drops out of that list, a
 *   sync-set "listening" goes back to "listened". "plan" is never touched.
 * - Albums removed from the Spotify library are NOT deleted locally (like Steam): delete by hand.
 *
 * Needs SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN
 * (run `npm run spotify-auth` once to get the refresh token).
 *
 *   npm run sync-spotify            # write files
 *   npm run sync-spotify -- --dry   # report only
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const MUSIC_DIR = path.resolve('src/content/music');
const API = 'https://api.spotify.com/v1';

function slugify(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const fm = {};
  match[1].split(/\r?\n/).forEach(line => {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
    else if (val === 'true' || val === 'false') val = val === 'true';
    else if (!isNaN(val) && val !== '') val = Number(val);
    fm[key] = val;
  });
  return { frontmatter: fm, body: match[2] };
}

// Strings are always quoted so titles like "1989" or "Vol. 2: Live" stay strings.
function buildFrontmatter(data) {
  const lines = Object.entries(data).map(([k, v]) => {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${k}: "${v.replace(/"/g, '\\"')}"`;
    return `${k}: ${v}`;
  }).filter(Boolean);
  return `---\n${lines.join('\n')}\n---\n`;
}

async function getAccessToken() {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) return null;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: SPOTIFY_REFRESH_TOKEN }),
  });
  if (!res.ok) throw new Error(`Spotify token refresh failed: HTTP ${res.status}`);
  return (await res.json()).access_token;
}

async function api(token, url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url.startsWith('http') ? url : `${API}${url}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') || 2);
      await new Promise(r => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Spotify ${url} → HTTP ${res.status}`);
    return res.json();
  }
  throw new Error(`Spotify ${url} → rate limited`);
}

async function fetchSavedAlbums(token) {
  const items = [];
  let next = '/me/albums?limit=50';
  while (next) {
    const page = await api(token, next);
    items.push(...(page.items || []));
    next = page.next;
  }
  return items;
}

async function fetchRecentAlbumIds(token) {
  try {
    const page = await api(token, '/me/player/recently-played?limit=50');
    return new Set((page.items || []).map(item => item.track?.album?.id).filter(Boolean));
  } catch {
    return new Set();
  }
}

// Album genres are usually empty on Spotify; fall back to the artists' genres (best effort).
async function fetchArtistGenres(token, artistIds) {
  const genres = new Map();
  const ids = [...new Set(artistIds)];
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const page = await api(token, `/artists?ids=${ids.slice(i, i + 50).join(',')}`);
      (page.artists || []).forEach(artist => artist && genres.set(artist.id, artist.genres || []));
    } catch {
      return genres;
    }
  }
  return genres;
}

function guessKind(album) {
  if (/\b(soundtrack|o\.?s\.?t\.?|original score|サウンドトラック)\b/i.test(album.name)) return 'ost';
  if (album.album_type === 'compilation') return 'compilation';
  if (album.album_type === 'single') return album.total_tracks > 3 ? 'ep' : 'single';
  return 'album';
}

function titleCase(genre) {
  return genre.replace(/\b\w/g, c => c.toUpperCase());
}

function readExisting() {
  const bySpotifyId = new Map();
  if (!fs.existsSync(MUSIC_DIR)) return bySpotifyId;
  for (const file of fs.readdirSync(MUSIC_DIR).filter(f => f.endsWith('.md'))) {
    const parsed = parseFrontmatter(fs.readFileSync(path.join(MUSIC_DIR, file), 'utf-8'));
    if (parsed?.frontmatter.spotify_id) bySpotifyId.set(String(parsed.frontmatter.spotify_id), { file, ...parsed });
  }
  return bySpotifyId;
}

export async function syncSpotify({ dryRun = false } = {}) {
  const name = 'Music (Spotify)';
  const token = await getAccessToken();
  if (!token) return { name, success: false, message: 'Missing SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REFRESH_TOKEN' };

  const saved = await fetchSavedAlbums(token);
  const recent = await fetchRecentAlbumIds(token);
  const artistGenres = await fetchArtistGenres(token, saved.flatMap(item => item.album.artists.map(a => a.id)));
  const existing = readExisting();
  if (!fs.existsSync(MUSIC_DIR) && !dryRun) fs.mkdirSync(MUSIC_DIR, { recursive: true });

  let created = 0, updated = 0, unchanged = 0;
  for (const { added_at, album } of saved) {
    const isRecent = recent.has(album.id);
    const genres = [...new Set(album.artists.flatMap(a => artistGenres.get(a.id) || []))].slice(0, 3).map(titleCase);
    const synced = {
      title: album.name,
      artist: album.artists.map(a => a.name).join(', '),
      year: Number(String(album.release_date || '').slice(0, 4)) || new Date().getFullYear(),
      tracks: album.total_tracks || undefined,
      label: album.label || undefined,
      spotify_id: album.id,
      source: 'spotify',
      spotify_recent: isRecent,
      cover: album.images?.[0]?.url,
    };

    const prev = existing.get(album.id);
    let data;
    if (prev) {
      const fm = prev.frontmatter;
      let status = fm.status;
      if (isRecent && status !== 'plan') status = 'listening';
      else if (!isRecent && status === 'listening' && fm.spotify_recent === true) status = 'listened';
      data = {
        ...fm,
        ...synced,
        kind: fm.kind || guessKind(album),
        genre: fm.genre && fm.genre !== 'N/A' ? fm.genre : (genres.join(', ') || 'N/A'),
        status,
      };
    } else {
      data = {
        ...synced,
        kind: guessKind(album),
        rating: 0,
        genre: genres.join(', ') || 'N/A',
        status: isRecent ? 'listening' : 'listened',
        date: String(added_at || new Date().toISOString()).slice(0, 10),
      };
    }

    // Fixed key order keeps diffs readable.
    const order = ['title', 'original_title', 'en_title', 'aka', 'artist', 'kind', 'rating', 'genre', 'year', 'tracks', 'label',
      'favorite_tracks', 'soundtrack_of', 'spotify_id', 'youtube_url', 'status', 'source', 'spotify_recent', 'cover', 'updated_at', 'date'];
    const ordered = Object.fromEntries([...order.filter(k => k in data), ...Object.keys(data).filter(k => !order.includes(k))].map(k => [k, data[k]]));

    const file = prev?.file || (() => {
      let base = slugify(`${album.name}`) || `album-${album.id}`;
      if (fs.existsSync(path.join(MUSIC_DIR, `${base}.md`))) base = `${base}-${slugify(album.artists[0]?.name || album.id)}`;
      return `${base}.md`;
    })();
    const next = buildFrontmatter(ordered) + (prev?.body || '\n');
    const filePath = path.join(MUSIC_DIR, file);
    const before = prev ? fs.readFileSync(filePath, 'utf-8') : '';
    if (next === before) { unchanged++; continue; }
    if (!dryRun) fs.writeFileSync(filePath, next);
    if (prev) updated++; else created++;
  }

  return {
    name,
    success: true,
    message: `${saved.length} saved albums — ${created} new, ${updated} updated, ${unchanged} unchanged, ${recent.size} recently played${dryRun ? ' (dry run)' : ''}`,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  syncSpotify({ dryRun: process.argv.includes('--dry') })
    .then(result => {
      console.log(`${result.success ? 'OK' : 'SKIP'} ${result.name}: ${result.message}`);
      if (!result.success) process.exitCode = 1;
    })
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });
}
