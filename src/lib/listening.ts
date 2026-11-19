// Play counts from the listening log (src/data/listening/<year>.jsonl): Last.fm scrobbles (sync-lastfm)
// plus YouTube Music plays imported from Google Takeout (import-youtube-history, source: 'youtube').
// Periods follow the Vietnamese calendar (UTC+7): week starts Monday 00:00.

type Play = { ts: number; name: string; artist: string; album?: string; source?: 'youtube' };

const files = import.meta.glob<string>('../data/listening/*.jsonl', { query: '?raw', import: 'default', eager: true });

export const plays: Play[] = Object.values(files)
  .flatMap(raw => raw.split('\n'))
  .filter(line => line.trim())
  .map(line => {
    try {
      return JSON.parse(line) as Play;
    } catch {
      return null;
    }
  })
  .filter((p): p is Play => Boolean(p?.ts))
  .sort((a, b) => a.ts - b.ts);

const OFFSET = 7 * 3600; // UTC+7, no DST

/** Start (unix seconds) of the current week / month / year in UTC+7, relative to `now`. */
export function periodStart(period: 'week' | 'month' | 'year' | 'all', now = Date.now() / 1000) {
  if (period === 'all') return 0;
  const local = new Date((now + OFFSET) * 1000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  let start: number;
  if (period === 'year') start = Date.UTC(y, 0, 1);
  else if (period === 'month') start = Date.UTC(y, m, 1);
  else start = Date.UTC(y, m, d - ((local.getUTCDay() + 6) % 7)); // back to Monday
  return start / 1000 - OFFSET;
}

export type Ranked = { key: string; title: string; subtitle?: string; count: number };

/** Top tracks / artists / albums by play count since `since`. */
export function topByPlays(kind: 'tracks' | 'artists' | 'albums', since: number, limit = 50): Ranked[] {
  const counts = new Map<string, Ranked>();
  for (const play of plays) {
    if (play.ts < since) continue;
    let key: string;
    let row: Omit<Ranked, 'count'>;
    if (kind === 'tracks') {
      key = `${play.artist}\u0000${play.name}`.toLowerCase();
      row = { key, title: play.name, subtitle: play.artist };
    } else if (kind === 'artists') {
      key = play.artist.toLowerCase();
      row = { key, title: play.artist };
    } else {
      if (!play.album) continue;
      key = `${play.artist}\u0000${play.album}`.toLowerCase();
      row = { key, title: play.album, subtitle: play.artist };
    }
    const current = counts.get(key);
    if (current) current.count++;
    else counts.set(key, { ...row, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)).slice(0, limit);
}

/** Where the plays come from, for the page caption. */
export const playSources = {
  lastfm: plays.filter(p => p.source !== 'youtube').length,
  youtube: plays.filter(p => p.source === 'youtube').length,
};

export function playCount(since: number) {
  return plays.filter(p => p.ts >= since).length;
}
