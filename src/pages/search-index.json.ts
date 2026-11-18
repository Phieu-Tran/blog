import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { altNames } from '../lib/altTitles';

type SearchType = 'anime' | 'game' | 'film' | 'book' | 'music';

type SearchItem = {
  title: string;
  /** Other names (original/English title, manual aka), so "Love Letter" finds "Thư Tình". */
  alt?: string[];
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
  const segment = type === 'anime' ? 'anime' : type === 'game' ? 'games' : type === 'book' ? 'books' : type === 'music' ? 'music' : 'films';
  return `${base}${segment}/${id}/`;
}

export const GET: APIRoute = async () => {
  const [anime, games, films, books, music] = await Promise.all([
    getCollection('anime'),
    getCollection('games'),
    getCollection('films'),
    getCollection('books'),
    getCollection('music'),
  ]);

  const items: SearchItem[] = [
    ...anime.map(item => ({
      title: item.data.title,
      alt: altNames(item.data),
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
      alt: altNames(item.data),
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
      alt: altNames(item.data),
      type: 'film' as const,
      url: itemUrl('film', item.id),
      rating: item.data.rating,
      year: item.data.year,
      genre: item.data.genre,
      status: item.data.status,
      cover: item.data.cover,
    })),
    ...books.map(item => ({
      title: item.data.title,
      alt: altNames(item.data),
      type: 'book' as const,
      url: itemUrl('book', item.id),
      rating: item.data.rating,
      year: item.data.year,
      genre: `${item.data.genre}, ${item.data.author}`,
      status: item.data.status,
      cover: item.data.cover,
    })),
    ...music.map(item => ({
      title: item.data.title,
      alt: altNames(item.data),
      type: 'music' as const,
      url: itemUrl('music', item.id),
      rating: item.data.rating,
      year: item.data.year,
      genre: `${item.data.genre}, ${item.data.artist}`,
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
