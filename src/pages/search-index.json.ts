import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

type SearchType = 'anime' | 'game' | 'film';

type SearchItem = {
  title: string;
  type: SearchType;
  url: string;
  rating: number;
  year: number;
  genre: string;
  status: string;
  cover?: string;
};

const base = import.meta.env.BASE_URL;

function itemUrl(type: SearchType, id: string) {
  const segment = type === 'anime' ? 'anime' : type === 'game' ? 'games' : 'films';
  return `${base}${segment}/${id}/`;
}

export const GET: APIRoute = async () => {
  const [anime, games, films] = await Promise.all([
    getCollection('anime'),
    getCollection('games'),
    getCollection('films'),
  ]);

  const items: SearchItem[] = [
    ...anime.map(item => ({
      title: item.data.title,
      type: 'anime' as const,
      url: itemUrl('anime', item.id),
      rating: item.data.rating,
      year: item.data.year,
      genre: item.data.genre,
      status: item.data.status,
      cover: item.data.cover,
    })),
    ...games.map(item => ({
      title: item.data.title,
      type: 'game' as const,
      url: itemUrl('game', item.id),
      rating: item.data.rating,
      year: item.data.year,
      genre: item.data.genre,
      status: item.data.status,
      cover: item.data.cover,
    })),
    ...films.map(item => ({
      title: item.data.title,
      type: 'film' as const,
      url: itemUrl('film', item.id),
      rating: item.data.rating,
      year: item.data.year,
      genre: item.data.genre,
      status: item.data.status,
      cover: item.data.cover,
    })),
  ].sort((a, b) => a.title.localeCompare(b.title));

  return new Response(JSON.stringify({ items }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
