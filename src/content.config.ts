import { defineCollection, z } from 'astro:content';

const anime = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
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
  type: 'content',
  schema: z.object({
    title: z.string(),
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
  type: 'content',
  schema: z.object({
    title: z.string(),
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
  type: 'content',
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

export const collections = { anime, games, films, posts };
