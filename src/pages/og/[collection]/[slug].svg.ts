import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { firstMarkdownImage } from '../../../lib/mediaRelations';
import { renderOgImage, type OgImageItem } from '../../../lib/og';

const accents = {
  anime: '#A78BFA',
  games: '#34D399',
  films: '#FB923C',
  posts: '#38BDF8',
};

export async function getStaticPaths() {
  const [posts, anime, games, films] = await Promise.all([
    getCollection('posts'),
    getCollection('anime'),
    getCollection('games'),
    getCollection('films'),
  ]);

  const postPaths = posts
    .filter(entry => !entry.data.draft)
    .map(entry => ({
      params: { collection: 'posts', slug: entry.id },
      props: {
        item: {
          title: entry.data.title,
          eyebrow: 'Post',
          description: entry.data.description || (entry.data.tags || []).join(', '),
          cover: entry.data.cover || firstMarkdownImage(entry.body),
          accent: accents.posts,
        } satisfies OgImageItem,
      },
    }));

  const animePaths = anime.map(entry => ({
    params: { collection: 'anime', slug: entry.id },
    props: {
      item: {
        title: entry.data.title,
        eyebrow: 'Anime',
        subtitle: `${entry.data.genre} - ${entry.data.year} - ${entry.data.studio}`,
        cover: entry.data.cover,
        accent: accents.anime,
        metric: entry.data.rating > 0 ? String(entry.data.rating) : undefined,
      } satisfies OgImageItem,
    },
  }));

  const gamePaths = games.map(entry => ({
    params: { collection: 'games', slug: entry.id },
    props: {
      item: {
        title: entry.data.title,
        eyebrow: 'Game',
        subtitle: `${entry.data.genre} - ${entry.data.year} - ${entry.data.studio}`,
        cover: entry.data.cover,
        accent: accents.games,
        metric: entry.data.rating > 0 ? String(entry.data.rating) : undefined,
      } satisfies OgImageItem,
    },
  }));

  const filmPaths = films.map(entry => ({
    params: { collection: 'films', slug: entry.id },
    props: {
      item: {
        title: entry.data.title,
        eyebrow: entry.data.tmdb_type === 'tv' ? 'TV' : 'Film',
        subtitle: `${entry.data.genre} - ${entry.data.year} - ${entry.data.director}`,
        cover: entry.data.cover,
        accent: accents.films,
        metric: entry.data.rating > 0 ? String(entry.data.rating) : undefined,
      } satisfies OgImageItem,
    },
  }));

  return [...postPaths, ...animePaths, ...gamePaths, ...filmPaths];
}

export const GET: APIRoute = ({ props, site }) => {
  const svg = renderOgImage(props.item as OgImageItem, site);

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
