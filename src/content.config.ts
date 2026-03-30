import { defineCollection, z } from 'astro:content';

const anime = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    mal_id: z.number().optional(),
    rating: z.number().min(0).max(10),
    genre: z.string(),
    year: z.number(),
    studio: z.string(),
    status: z.enum(['watching', 'completed', 'plan', 'dropped']),
    episodes: z.number().optional(),
    cover: z.string().optional(),
    date: z.date(),
  }),
});

const games = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    rating: z.number().min(0).max(10),
    genre: z.string(),
    year: z.number(),
    studio: z.string(),
    status: z.enum(['playing', 'completed', 'plan', 'dropped']),
    platform: z.string(),
    cover: z.string().optional(),
    date: z.date(),
  }),
});

const films = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    tmdb_id: z.number().optional(),
    rating: z.number().min(0).max(10),
    genre: z.string(),
    year: z.number(),
    director: z.string(),
    status: z.enum(['watched', 'plan']),
    cover: z.string().optional(),
    date: z.date(),
  }),
});

export const collections = { anime, games, films };
