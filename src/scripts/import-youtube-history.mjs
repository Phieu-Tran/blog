/**
 * import-youtube-history.mjs — add YouTube Music plays from a Google Takeout watch history
 * to the listening log (src/data/listening/<year>.jsonl), next to the Last.fm scrobbles.
 *
 *   npm run import-youtube-history -- "D:/…/Takeout/YouTube và YouTube Music/lịch sử/nhật ký xem.html"
 *   npm run import-youtube-history -- <file> --dry
 *
 * - Only entries whose product header is "YouTube Âm nhạc" / "YouTube Music" are imported;
 *   ordinary YouTube videos are ignored.
 * - Artist = the channel name without " - Topic" / "VEVO" (official auto-generated music channels).
 * - Re-running with a newer Takeout is safe: plays are keyed by timestamp + artist + title.
 * - A play already scrobbled to Last.fm (same title within ±5 minutes, e.g. via Web Scrobbler) is skipped.
 * Takeout must be exported as HTML in Vietnamese or English.
 */

import fs from 'fs';
import path from 'path';

const LOG_DIR = path.resolve(process.env.LISTENING_LOG_DIR || 'src/data/listening');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const input = args.find(a => !a.startsWith('--'));

if (!input || !fs.existsSync(input)) {
  console.error('Usage: npm run import-youtube-history -- "<path to nhật ký xem.html / watch-history.html>" [--dry]');
  process.exit(1);
}

const decode = s => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .trim();

const MONTHS_EN = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

/** "09:15:44 17 thg 11, 2026 GMT+07:00" or "Nov 17, 2026, 9:15:44 AM GMT+07:00" → unix seconds. */
function parseDate(text) {
  let m = text.match(/(\d{1,2}):(\d{2}):(\d{2}) (\d{1,2}) thg (\d{1,2}), (\d{4}) GMT([+-]\d{2}):?(\d{2})/);
  if (m) {
    const [, hh, mi, ss, dd, mo, yy, oh, om] = m.map(Number);
    return Date.UTC(yy, mo - 1, dd, hh, mi, ss) / 1000 - (oh * 3600 + Math.sign(oh || 1) * om * 60);
  }
  m = text.match(/([A-Z][a-z]{2}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}):(\d{2}) ([AP]M) GMT([+-]\d{2}):?(\d{2})/);
  if (m) {
    const [, mon, dd, yy, hhRaw, mi, ss, ampm, oh, om] = m;
    let hh = Number(hhRaw) % 12;
    if (ampm === 'PM') hh += 12;
    const offset = Number(oh) * 3600 + Math.sign(Number(oh) || 1) * Number(om) * 60;
    return Date.UTC(Number(yy), MONTHS_EN[mon] - 1, Number(dd), hh, Number(mi), Number(ss)) / 1000 - offset;
  }
  return null;
}

function cleanArtist(channel) {
  return channel.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
}

const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function parsePlays(html) {
  const plays = [];
  let skipped = 0;
  for (const cell of html.split('<div class="outer-cell').slice(1)) {
    const header = (cell.match(/mdl-typography--title">([^<]*)/) || [])[1] || '';
    if (!/Âm nhạc|YouTube Music/i.test(header)) continue;
    const content = (cell.match(/content-cell[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
    const links = [...content.matchAll(/<a href="([^"]+)">([^<]*)<\/a>/g)];
    const video = links.find(l => /watch\?v=/.test(l[1]));
    const channel = links.find(l => /\/channel\/|\/@/.test(l[1]));
    const ts = parseDate(content.replace(/<[^>]+>/g, ' '));
    if (!video || !ts) { skipped++; continue; } // removed / private videos have no title link
    const name = decode(video[2]);
    plays.push({
      ts,
      name,
      artist: channel ? cleanArtist(decode(channel[2])) : 'Không rõ',
      source: 'youtube',
      video_id: (video[1].match(/v=([\w-]{6,})/) || [])[1],
    });
  }
  return { plays, skipped };
}

function readLog() {
  const byYear = new Map();
  if (!fs.existsSync(LOG_DIR)) return byYear;
  for (const file of fs.readdirSync(LOG_DIR).filter(f => /^\d{4}\.jsonl$/.test(f))) {
    const rows = fs.readFileSync(path.join(LOG_DIR, file), 'utf-8').split('\n').filter(l => l.trim()).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    byYear.set(file.slice(0, 4), rows);
  }
  return byYear;
}

const html = fs.readFileSync(input, 'utf-8');
const { plays, skipped } = parsePlays(html);
const byYear = readLog();
const all = [...byYear.values()].flat();
const exact = new Set(all.map(p => `${p.ts}|${norm(p.artist)}|${norm(p.name)}`));
// Last.fm scrobbles by title, to drop YouTube plays that Web Scrobbler already sent to Last.fm.
const lastfmByTitle = new Map();
all.filter(p => p.source !== 'youtube').forEach(p => {
  const key = norm(p.name);
  if (!lastfmByTitle.has(key)) lastfmByTitle.set(key, []);
  lastfmByTitle.get(key).push(p.ts);
});

let added = 0, duplicate = 0, scrobbled = 0;
for (const play of plays) {
  if (exact.has(`${play.ts}|${norm(play.artist)}|${norm(play.name)}`)) { duplicate++; continue; }
  if ((lastfmByTitle.get(norm(play.name)) || []).some(ts => Math.abs(ts - play.ts) <= 300)) { scrobbled++; continue; }
  const year = String(new Date(play.ts * 1000).getUTCFullYear());
  if (!byYear.has(year)) byYear.set(year, []);
  byYear.get(year).push(play);
  added++;
}

if (!DRY && added) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  for (const [year, rows] of byYear) {
    rows.sort((a, b) => a.ts - b.ts);
    fs.writeFileSync(path.join(LOG_DIR, `${year}.jsonl`), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  }
}

const perYear = {};
plays.forEach(p => { const y = new Date(p.ts * 1000).getUTCFullYear(); perYear[y] = (perYear[y] || 0) + 1; });
console.log(`YouTube Music plays found: ${plays.length} ${JSON.stringify(perYear)} (unparseable/removed: ${skipped})`);
console.log(`Added: ${added} · already imported: ${duplicate} · already on Last.fm: ${scrobbled}${DRY ? ' (dry run)' : ''}`);
