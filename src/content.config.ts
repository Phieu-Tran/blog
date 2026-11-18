import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// glob loader gives ids without the ".md" suffix, so URLs are /anime/slug/ not /anime/slug.md/
const markdown = (dir: string) => glob({ pattern: '**/*.md', base: `./src/content/${dir}` });

// Alternate names for search. Sync may write numeric-looking titles unquoted (e.g. 1917), so accept numbers too.
const altTitle = z.union([z.string(), z.number()]).transform(String).optional();
const altTitles = {
  original_title: altTitle, // filled by sync (TMDB/MAL/IMDb) when it differs from title
  en_title: altTitle,       // films: English title from TMDB translations
  aka: altTitle,            // manual: extra names separated by ";"
};

const anime = defineCollection({
  loader: markdown('anime'),
  schema: z.object({
    title: z.string(),
    ...altTitles,
    mal_id: z.number().optional(),
    rating: z.number().min(0).max(10),
    mal_score: z.number().optional(),
    genre: z.string(),
    year: z.number(),
    studio: z.string(),
    director: z.string().optional(),
    creator: z.string().optional(),
    writer: z.string().optional(),
    composer: z.string().optional(),
    author: z.string().optional(),
    status: z.enum(['watching', 'completed', 'on_hold', 'plan', 'dropped']),
    episodes_watched: z.number().optional(),
    episodes_total: z.number().optional(),
    episodes: z.number().optional(),
    cover: z.string().optional(),
    updated_at: z.date().optional(),
    date: z.date(),
  }),
});

const games = defineCollection({
  loader: markdown('games'),
  schema: z.object({
    title: z.string(),
    ...altTitles,
    steam_appid: z.number().optional(),
    igdb_id: z.number().optional(),
    igdb_slug: z.string().optional(),
    igdb_url: z.string().optional(),
    steam_url: z.string().optional(),
    ign_url: z.string().optional(),
    metacritic_url: z.string().optional(),
    official_url: z.string().optional(),
    rating: z.number().min(0).max(10),
    igdb_score: z.number().optional(),
    genre: z.string(),
    year: z.number(),
    studio: z.string(),
    publisher: z.string().optional(),
    director: z.string().optional(),
    creator: z.string().optional(),
    writer: z.string().optional(),
    composer: z.string().optional(),
    author: z.string().optional(),
    status: z.enum(['playing', 'completed', 'plan', 'dropped']),
    source: z.enum(['steam', 'igdb', 'manual']).default('manual'),
    igdb_personal: z.boolean().optional(),
    platform: z.string(),
    playtime_hours: z.number().optional(),
    steam_recent: z.boolean().optional(),
    steam_recent_hours: z.number().optional(),
    cover: z.string().optional(),
    igdb_updated_at: z.date().optional(),
    date: z.date(),
  }),
});

const films = defineCollection({
  loader: markdown('films'),
  schema: z.object({
    title: z.string(),
    ...altTitles,
    imdb_id: z.string().optional(),
    tmdb_id: z.number().optional(),
    tmdb_type: z.enum(['movie', 'tv']).optional(),
    rating: z.number().min(0).max(10),
    imdb_score: z.number().optional(),
    tmdb_score: z.number().optional(),
    genre: z.string(),
    year: z.number(),
    director: z.string(),
    creator: z.string().optional(),
    writer: z.string().optional(),
    composer: z.string().optional(),
    author: z.string().optional(),
    status: z.enum(['watched', 'plan']),
    cover: z.string().optional(),
    date: z.date(),
  }),
});

const posts = defineCollection({
  loader: markdown('posts'),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    related_media: z.array(z.string()).optional(),
    cover: z.string().optional(),
    date: z.date(),
    draft: z.boolean().optional(),
  }),
});

// Books: personal reading log. Source is manual for now; goodreads_id is reserved for a future
// Goodreads CSV/RSS import (same identity-anchor idea as imdb_id for films).
const books = defineCollection({
  loader: markdown('books'),
  schema: z.object({
    title: z.string(),
    ...altTitles,
    author: z.string(),
    translator: z.string().optional(),
    publisher: z.string().optional(),
    rating: z.number().min(0).max(10),
    goodreads_score: z.number().optional(),
    genre: z.string(),
    year: z.number(),
    pages: z.number().optional(),
    isbn: z.string().optional(),
    goodreads_id: z.string().optional(),
    status: z.enum(['reading', 'read', 'plan', 'dropped']),
    source: z.enum(['manual', 'goodreads']).default('manual'),
    cover: z.string().optional(),
    updated_at: z.date().optional(),
    date: z.date(),
  }),
});

// Music: one entry per album / EP / OST. Spotify and YouTube Music are both listening sources;
// spotify_id is reserved as the identity anchor for a future Spotify saved-albums sync.
// soundtrack_of links an OST to its source media, ";"-separated "anime:slug" / "games:slug" / "films:slug".
const music = defineCollection({
  loader: markdown('music'),
  schema: z.object({
    title: z.string(),
    ...altTitles,
    artist: z.string(),
    kind: z.enum(['album', 'ep', 'single', 'ost', 'compilation']).default('album'),
    rating: z.number().min(0).max(10),
    genre: z.string(),
    year: z.number(),
    tracks: z.number().optional(),
    label: z.string().optional(),
    favorite_tracks: altTitle, // ";"-separated
    soundtrack_of: altTitle,
    spotify_id: z.string().optional(),
    youtube_url: z.string().optional(),
    status: z.enum(['listening', 'listened', 'plan']),
    source: z.enum(['spotify', 'youtube', 'manual']).default('manual'),
    spotify_recent: z.boolean().optional(),
    cover: z.string().optional(),
    updated_at: z.date().optional(),
    date: z.date(),
  }),
});

export const collections = { anime, games, films, books, music, posts };
