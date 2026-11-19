// The full song library: every song in a Spotify playlist / Liked Songs / saved album
// (src/data/spotify-tracks.json, written by sync-spotify) plus every song ever played according to
// the listening log (Last.fm scrobbles + the one-off YouTube Music import, src/lib/listening.ts).
// Both sources are optional so the site builds before any sync.

import { plays } from './listening';

export type TrackRow = { id: string; name: string; artists: string; album?: string; cover?: string; duration_ms?: number };

const files = import.meta.glob<{ default: Record<string, TrackRow[]> }>('../data/spotify-tracks.json', { eager: true });
export const tracksByPlaylist: Record<string, TrackRow[]> = Object.values(files)[0]?.default || {};

export type Song = {
  key: string;
  name: string;
  artists: string;
  album?: string;
  cover?: string;
  duration_ms?: number;
  spotify_id?: string;
  youtube_id?: string;
  /** Spotify playlist / album ids containing the song. */
  playlists: string[];
  /** Plays in the listening log. */
  plays: number;
};

const fold = (value: string) => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd');

// Title noise from Spotify (remaster, live…) and YouTube uploads (Official MV, lyrics, "| …", prod. …).
const cleanTitle = (value: string) => fold(value)
  .replace(/\s*[([【][^)\]】]*(official|mv|m\/v|lyric|audio|video|visuali[sz]er|remaster|version|ver\.|live|edit|remix|feat|ft\.|from|lofi|acoustic|prod|karaoke|cover|performance|vietsub|engsub)[^)\]】]*[)\]】]/g, '')
  .replace(/\s*[|｜].*$/, '')
  .replace(/\s+-\s+.*(remaster|version|live|edit|remix|lofi|acoustic|official).*$/, '')
  .replace(/\s+(feat|ft|prod)\.?\s.*$/, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

// Main artist only; YouTube channel suffixes ("Obito Official", "… VEVO") are dropped.
const artistKey = (artists: string) => cleanTitle(String(artists).split(/,|&| x | ft\.? /i)[0])
  .replace(/\s*(official|music|channel|tv|entertainment|records|vevo)$/, '') // "Obito Official", "JustaTeeMusic"
  .trim();

/**
 * One song = same cleaned title + same main artist, so a single, an album cut, a remaster and the
 * YouTube MV of the same track count once. Unicode letters are kept so Japanese / Korean titles
 * never collapse into one empty key. "Artist - Title" uploads are split on the dash.
 */
export function songKey(name: string, artists: string) {
  const artist = artistKey(artists);
  let title = cleanTitle(name);
  const parts = fold(name).split(/\s+-\s+/);
  if (parts.length > 1 && artist) {
    if (cleanTitle(parts[0]).includes(artist)) title = cleanTitle(parts.slice(1).join(' - ')); // "Artist - Title"
    else if (cleanTitle(parts[1]).startsWith(artist)) title = cleanTitle(parts[0]); // "Title - Artist feat …"
  }
  return title ? `${title}|${artist}` : null;
}

export const songs: Song[] = (() => {
  const byKey = new Map<string, Song>();

  for (const [listId, rows] of Object.entries(tracksByPlaylist)) {
    for (const row of rows) {
      const key = songKey(row.name, row.artists) || `spotify:${row.id}`;
      const song = byKey.get(key);
      if (song) {
        if (!song.playlists.includes(listId)) song.playlists.push(listId);
      } else {
        byKey.set(key, {
          key, name: row.name, artists: row.artists, album: row.album, cover: row.cover,
          duration_ms: row.duration_ms, spotify_id: row.id, playlists: [listId], plays: 0,
        });
      }
    }
  }

  for (const play of plays as Array<{ name: string; artist: string; album?: string; video_id?: string }>) {
    if (/^https?:/.test(play.name)) continue; // removed YouTube videos keep only their URL as title
    const key = songKey(play.name, play.artist) || (play.video_id ? `youtube:${play.video_id}` : null);
    if (!key) continue;
    const song = byKey.get(key);
    if (song) {
      song.plays++;
      if (!song.youtube_id && play.video_id) song.youtube_id = play.video_id;
    } else {
      byKey.set(key, {
        key, name: play.name, artists: play.artist, album: play.album, youtube_id: play.video_id,
        cover: play.video_id ? `https://i.ytimg.com/vi/${play.video_id}/default.jpg` : undefined,
        playlists: [], plays: 1,
      });
    }
  }

  return [...byKey.values()];
})();

export const songStats = {
  songs: songs.length,
  /** Songs with at least one play in the listening log. */
  listened: songs.filter(song => song.plays > 0).length,
  inPlaylists: songs.filter(song => song.playlists.length > 0).length,
  artists: new Set(songs.flatMap(song => song.artists.split(', ').filter(Boolean))).size,
  /** Only Spotify reports durations, so this covers playlist songs. */
  hours: Math.round(songs.reduce((sum, song) => sum + (song.duration_ms || 0), 0) / 3600000),
};
