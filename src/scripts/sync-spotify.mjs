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

const TRACKS_FILE = path.resolve('src/data/spotify-tracks.json');
const LIKED_ID = 'liked';
// Fixed key order keeps diffs readable.
const ORDER = ['title', 'original_title', 'en_title', 'aka', 'artist', 'kind', 'rating', 'genre', 'year', 'tracks', 'label',
  'favorite_tracks', 'soundtrack_of', 'spotify_id', 'youtube_url', 'status', 'source', 'spotify_recent', 'cover', 'updated_at', 'date'];

async function fetchRecent(token) {
  try {
    const page = await api(token, '/me/player/recently-played?limit=50');
    const albums = new Set();
    const playlists = new Set();
    (page.items || []).forEach(item => {
      if (item.track?.album?.id) albums.add(item.track.album.id);
      const uri = item.context?.uri || '';
      if (uri.startsWith('spotify:playlist:')) playlists.add(uri.split(':')[2]);
      if (uri.endsWith(':collection')) playlists.add(LIKED_ID);
    });
    return { albums, playlists };
  } catch {
    return { albums: new Set(), playlists: new Set() };
  }
}

// Newer Spotify apps read playlist contents from ".../items"; older ones from ".../tracks". Accept either.
async function fetchPlaylistTracks(token, playlistId) {
  const tracks = [];
  let next = `/playlists/${playlistId}/items?limit=100`;
  let triedLegacy = false;
  while (next) {
    let page;
    try {
      page = await api(token, next);
    } catch (err) {
      if (triedLegacy || tracks.length) throw err;
      triedLegacy = true;
      next = `/playlists/${playlistId}/tracks?limit=100`;
      continue;
    }
    (page.items || []).forEach(entry => {
      const track = entry.track || entry.item;
      if (track && track.type === 'track' && track.id) tracks.push({ added_at: entry.added_at, track });
    });
    next = page.next;
  }
  return tracks;
}

async function fetchLikedTracks(token) {
  const tracks = [];
  let next = '/me/tracks?limit=50';
  while (next) {
    const page = await api(token, next);
    (page.items || []).forEach(entry => entry.track?.id && tracks.push({ added_at: entry.added_at, track: entry.track }));
    next = page.next;
  }
  return tracks;
}

async function fetchOwnPlaylists(token, myId) {
  const playlists = [];
  let next = '/me/playlists?limit=50';
  while (next) {
    const page = await api(token, next);
    (page.items || []).forEach(p => p && p.owner?.id === myId && playlists.push(p));
    next = page.next;
  }
  return playlists;
}

function slimTrack({ track }) {
  const images = track.album?.images || [];
  return {
    id: track.id,
    name: track.name,
    artists: (track.artists || []).map(a => a.name).join(', '),
    album: track.album?.name,
    cover: (images[images.length - 1] || images[0])?.url,
    duration_ms: track.duration_ms,
  };
}

function topArtists(tracks, limit = 3) {
  const counts = new Map();
  tracks.forEach(({ track }) => (track.artists || []).forEach(a => counts.set(a.name, (counts.get(a.name) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([artistName]) => artistName);
}

function genresFor(artistIds, artistGenres) {
  const counts = new Map();
  artistIds.forEach(id => (artistGenres.get(id) || []).forEach(g => counts.set(g, (counts.get(g) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => titleCase(g));
}

/** Create or update one entry; local rating / notes / favorites / links always survive. */
function upsert(existing, stats, dryRun, { spotifyId, synced, kind, genres, isRecent, slugBase, date }) {
  const prev = existing.get(spotifyId);
  let data;
  if (prev) {
    const fm = prev.frontmatter;
    let status = fm.status;
    if (isRecent && status !== 'plan') status = 'listening';
    else if (!isRecent && status === 'listening' && fm.spotify_recent === true) status = 'listened';
    data = {
      ...fm,
      ...synced,
      kind: fm.kind || kind,
      genre: fm.genre && fm.genre !== 'N/A' ? fm.genre : (genres.join(', ') || 'N/A'),
      status,
    };
  } else {
    data = { ...synced, kind, rating: 0, genre: genres.join(', ') || 'N/A', status: isRecent ? 'listening' : 'listened', date };
  }

  const ordered = Object.fromEntries([...ORDER.filter(k => k in data), ...Object.keys(data).filter(k => !ORDER.includes(k))].map(k => [k, data[k]]));
  const file = prev?.file || (() => {
    let base = slugify(slugBase.name) || `spotify-${spotifyId}`;
    if (fs.existsSync(path.join(MUSIC_DIR, `${base}.md`))) base = `${base}-${slugify(slugBase.suffix || spotifyId)}`;
    return `${base}.md`;
  })();
  const body = prev?.body || '\n';
  const next = buildFrontmatter(ordered) + body;
  const filePath = path.join(MUSIC_DIR, file);
  const before = prev ? fs.readFileSync(filePath, 'utf-8') : '';
  if (next === before) { stats.unchanged++; return; }
  if (!dryRun) fs.writeFileSync(filePath, next);
  existing.set(spotifyId, { file, frontmatter: ordered, body });
  if (prev) stats.updated++; else stats.created++;
}

export async function syncSpotify({ dryRun = false } = {}) {
  const name = 'Music (Spotify)';
  const token = await getAccessToken();
  if (!token) return { name, success: false, message: 'Missing SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REFRESH_TOKEN' };

  const me = await api(token, '/me');
  const saved = await fetchSavedAlbums(token);
  const recent = await fetchRecent(token);

  // Playlists need the playlist-read-private scope; a token issued without it just skips them.
  let playlists = [];
  let playlistNote = '';
  try {
    playlists = await fetchOwnPlaylists(token, me.id);
  } catch {
    playlistNote = ' (playlists skipped: re-run npm run spotify-auth to grant playlist access)';
  }
  const playlistTracks = new Map();
  for (const playlist of playlists) playlistTracks.set(playlist.id, await fetchPlaylistTracks(token, playlist.id));
  const liked = await fetchLikedTracks(token);

  const allArtistIds = [
    ...saved.flatMap(item => item.album.artists.map(a => a.id)),
    ...[...playlistTracks.values(), liked].flat().flatMap(({ track }) => (track.artists || []).map(a => a.id)),
  ].filter(Boolean);
  const artistGenres = await fetchArtistGenres(token, allArtistIds);
  const existing = readExisting();
  if (!fs.existsSync(MUSIC_DIR) && !dryRun) fs.mkdirSync(MUSIC_DIR, { recursive: true });

  const stats = { created: 0, updated: 0, unchanged: 0 };
  const tracklists = {};

  for (const { added_at, album } of saved) {
    upsert(existing, stats, dryRun, {
      spotifyId: album.id,
      synced: {
        title: album.name,
        artist: album.artists.map(a => a.name).join(', '),
        year: Number(String(album.release_date || '').slice(0, 4)) || new Date().getFullYear(),
        tracks: album.total_tracks || undefined,
        label: album.label || undefined,
        spotify_id: album.id,
        source: 'spotify',
        spotify_recent: recent.albums.has(album.id),
        cover: album.images?.[0]?.url,
      },
      kind: guessKind(album),
      genres: genresFor(album.artists.map(a => a.id), artistGenres),
      isRecent: recent.albums.has(album.id),
      slugBase: { name: album.name, suffix: album.artists[0]?.name },
      date: String(added_at || new Date().toISOString()).slice(0, 10),
    });
  }

  const playlistSources = [
    ...playlists.map(p => ({ id: p.id, title: p.name, cover: p.images?.[0]?.url, tracks: playlistTracks.get(p.id) || [] })),
    ...(liked.length ? [{ id: LIKED_ID, title: 'Bài hát đã thích', cover: undefined, tracks: liked }] : []),
  ];
  for (const source of playlistSources) {
    const addedDates = source.tracks.map(t => t.added_at).filter(Boolean).sort();
    tracklists[source.id] = source.tracks.map(slimTrack);
    upsert(existing, stats, dryRun, {
      spotifyId: source.id,
      synced: {
        title: source.title,
        artist: topArtists(source.tracks).join(', ') || 'Nhiều nghệ sĩ',
        year: Number(String(addedDates[addedDates.length - 1] || new Date().toISOString()).slice(0, 4)),
        tracks: source.tracks.length,
        spotify_id: source.id,
        source: 'spotify',
        spotify_recent: recent.playlists.has(source.id),
        // Liked Songs has no image of its own: borrow the newest track's album art.
        cover: source.cover || source.tracks[0]?.track?.album?.images?.[0]?.url,
      },
      kind: 'playlist',
      genres: genresFor(source.tracks.flatMap(({ track }) => (track.artists || []).map(a => a.id)), artistGenres),
      isRecent: recent.playlists.has(source.id),
      slugBase: { name: source.id === LIKED_ID ? 'bai-hat-da-thich' : source.title, suffix: 'playlist' },
      date: String(addedDates[0] || new Date().toISOString()).slice(0, 10),
    });
  }

  // Tracklists live in a data file so the markdown body stays free for your own notes.
  const tracksJson = `${JSON.stringify(tracklists, null, 2)}\n`;
  const tracksBefore = fs.existsSync(TRACKS_FILE) ? fs.readFileSync(TRACKS_FILE, 'utf-8') : '';
  if (!dryRun && tracksJson !== tracksBefore) fs.writeFileSync(TRACKS_FILE, tracksJson);

  return {
    name,
    success: true,
    message: `${saved.length} saved albums + ${playlistSources.length} playlists — ${stats.created} new, ${stats.updated} updated, ${stats.unchanged} unchanged, recent: ${recent.albums.size} albums / ${recent.playlists.size} playlists${playlistNote}${dryRun ? ' (dry run)' : ''}`,
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
