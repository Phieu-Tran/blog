import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://blog.workspacesbeat.site',
  base: '/',
  integrations: [
    sitemap({
      filter: page => !page.includes('/og/') && !page.endsWith('/rss.xml') && !page.endsWith('/search-index.json'),
      serialize(item) {
        if (item.url === 'https://blog.workspacesbeat.site/' || item.url.endsWith('/posts/')) {
          item.changefreq = 'weekly';
          item.priority = 0.9;
        } else if (item.url.includes('/posts/')) {
          item.changefreq = 'monthly';
          item.priority = 0.75;
        } else if (item.url.includes('/anime/') || item.url.includes('/games/') || item.url.includes('/films/')) {
          item.changefreq = 'weekly';
          item.priority = item.url.endsWith('/anime/') || item.url.endsWith('/games/') || item.url.endsWith('/films/') ? 0.85 : 0.7;
        } else {
          item.changefreq = 'monthly';
          item.priority = 0.6;
        }
        return item;
      },
    }),
  ],
  build: {
    assets: '_assets'
  }
});
