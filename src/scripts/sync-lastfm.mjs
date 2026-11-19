/**
 * sync-lastfm.mjs — pull Last.fm scrobbles into a per-year listening log.
 *
 * Last.fm keeps every scrobble (Spotify, YouTube Music via Web Scrobbler, phone apps…), so this is
 * the complete listening history from the day scrobbling was connected. Incremental: only plays newer
 * than the last logged one are fetched. Deduplicated by timestamp + track, so re-runs are harmless.
 *
 * Output: src/data/listening/<year>.jsonl, one play per line, oldest first:
 *   {"ts":1763467200,"name":"…","artist":"…","album":"…","mbid":"…","loved":false}
 *
 * Needs LASTFM_API_KEY (read-only API key) and LASTFM_USERNAME.
 *   npm run sync-lastfm            # write
 *   npm run sync-lastfm -- --dry   # report only
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const LOG_DIR = path.resolve(process.env.LISTENING_LOG_DIR || 'src/data/listening');
const API = 'https://ws.audioscrobbler.com/2.0/';

function playKey(play) {
  return `${play.ts}|${play.artist}|${play.name}`;
}

function readLog() {
  const known = new Set();
  let latest = 0;
  if (!fs.existsSync(LOG_DIR)) return { known, latest };
  for (const file of fs.readdirSync(LOG_DIR).filter(f => /^\d{4}\.jsonl$/.test(f))) {
    for (const line of fs.readFileSync(path.join(LOG_DIR, file), 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const play = JSON.parse(line);
        known.add(playKey(play));
        // Only Last.fm's own scrobbles move the incremental cursor; imported YouTube plays must not.
        if (play.source !== 'youtube') latest = Math.max(latest, Number(play.ts) || 0);
      } catch {
        // skip a corrupt line rather than stop the sync
      }
    }
  }
  return { known, latest };
}

async function call(params) {
  const url = `${API}?${new URLSearchParams({ ...params, api_key: process.env.LASTFM_API_KEY, format: 'json' })}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'media-vault-sync/1.0' } });
    const json = await res.json().catch(() => null);
    // Last.fm signals rate limiting with error 29 and transient failures with 8/16.
    if (json?.error && [8, 16, 29].includes(json.error)) {
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok || json?.error) throw new Error(`Last.fm ${params.method}: ${json?.message || `HTTP ${res.status}`}`);
    return json;
  }
  throw new Error(`Last.fm ${params.method}: rate limited`);
}

export async function syncLastfm({ dryRun = false } = {}) {
  const name = 'Listening history (Last.fm)';
  const user = process.env.LASTFM_USERNAME;
  if (!process.env.LASTFM_API_KEY || !user) return { name, success: false, message: 'Missing LASTFM_API_KEY or LASTFM_USERNAME' };

  const { known, latest } = readLog();
  const fresh = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const json = await call({
      method: 'user.getrecenttracks',
      user,
      limit: '200',
      page: String(page),
      extended: '1',
      ...(latest ? { from: String(latest + 1) } : {}),
    });
    const block = json.recenttracks || {};
    totalPages = Number(block['@attr']?.totalPages || 1);
    for (const track of [].concat(block.track || [])) {
      if (track['@attr']?.nowplaying === 'true' || !track.date?.uts) continue; // still playing, not a scrobble yet
      const play = {
        ts: Number(track.date.uts),
        name: track.name,
        artist: track.artist?.name || track.artist?.['#text'] || '',
        album: track.album?.['#text'] || undefined,
        mbid: track.mbid || undefined,
        loved: track.loved === '1',
      };
      if (!known.has(playKey(play))) fresh.push(play);
    }
    page++;
    if (page <= totalPages) await new Promise(r => setTimeout(r, 250));
  }

  fresh.sort((a, b) => a.ts - b.ts);
  if (fresh.length && !dryRun) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const byYear = new Map();
    fresh.forEach(play => {
      const year = new Date(play.ts * 1000).getUTCFullYear();
      byYear.set(year, [...(byYear.get(year) || []), play]);
    });
    for (const [year, plays] of byYear) {
      fs.appendFileSync(path.join(LOG_DIR, `${year}.jsonl`), plays.map(p => JSON.stringify(p)).join('\n') + '\n');
    }
  }

  const range = fresh.length
    ? ` (${new Date(fresh[0].ts * 1000).toISOString().slice(0, 10)} → ${new Date(fresh[fresh.length - 1].ts * 1000).toISOString().slice(0, 10)})`
    : '';
  return { name, success: true, message: `${fresh.length} new scrobbles${range}${dryRun ? ' (dry run)' : ''}` };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  syncLastfm({ dryRun: process.argv.includes('--dry') })
    .then(result => {
      console.log(`${result.success ? 'OK' : 'SKIP'} ${result.name}: ${result.message}`);
      if (!result.success) process.exitCode = 1;
    })
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });
}
