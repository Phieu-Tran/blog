// Songs across every synced playlist and saved album (src/data/spotify-tracks.json, written by sync-spotify).
// Optional: the site builds before the first Spotify sync.

export type TrackRow = { id: string; name: string; artists: string; album?: string; cover?: string; duration_ms?: number };

const files = import.meta.glob<{ default: Record<string, TrackRow[]> }>('../data/spotify-tracks.json', { eager: true });
export const tracksByPlaylist: Record<string, TrackRow[]> = Object.values(files)[0]?.default || {};

export type Song = TrackRow & { playlists: string[] };

/**
 * One song = same title + same main artist. Spotify often has several ids for one song
 * (single vs album release, remaster, "(Live)", "- Acoustic"…), so ids alone over-count.
 * Unicode letters are kept so Japanese / Korean titles never collapse into one empty key.
 */
function songKey(row: TrackRow) {
  const norm = (value: string) => value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s*[([][^)\]]*(remaster|version|ver\.|live|edit|remix|feat|ft\.|from|lofi|acoustic)[^)\]]*[)\]]/g, '')
    .replace(/\s+-\s+.*(remaster|version|live|edit|remix|lofi|acoustic).*$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const title = norm(row.name);
  // A title made only of symbols has nothing to compare on: fall back to the Spotify id.
  return title ? `${title}|${norm(row.artists.split(', ')[0] || '')}` : `id:${row.id}`;
}

/** Unique songs with the ids of every playlist / album that contains them. */
export const songs: Song[] = (() => {
  const byKey = new Map<string, Song>();
  for (const [listId, rows] of Object.entries(tracksByPlaylist)) {
    for (const row of rows) {
      const key = songKey(row);
      const song = byKey.get(key);
      if (song) {
        if (!song.playlists.includes(listId)) song.playlists.push(listId);
      } else {
        byKey.set(key, { ...row, playlists: [listId] });
      }
    }
  }
  return [...byKey.values()];
})();

export const songStats = {
  songs: songs.length,
  artists: new Set(songs.flatMap(song => song.artists.split(', ').filter(Boolean))).size,
  hours: Math.round(songs.reduce((sum, song) => sum + (song.duration_ms || 0), 0) / 3600000),
};
