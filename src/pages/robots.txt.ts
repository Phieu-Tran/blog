import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const origin = site?.toString().replace(/\/$/, '') || 'https://blog.workspacesbeat.site';

  return new Response(`User-agent: *
Allow: /

Sitemap: ${origin}/sitemap-index.xml
`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
