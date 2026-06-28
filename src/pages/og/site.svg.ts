import type { APIRoute } from 'astro';
import { renderOgImage } from '../../lib/og';

export const GET: APIRoute = ({ site }) => {
  const svg = renderOgImage({
    title: 'Phieu.work',
    eyebrow: 'Personal Media Hub',
    subtitle: 'Anime, games, films, posts - all in one place.',
    accent: '#34D399',
  }, site);

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
