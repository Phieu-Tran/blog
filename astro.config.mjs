import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://blog.workspacesbeat.site',
  base: '/',
  integrations: [sitemap()],
  build: {
    assets: '_assets'
  }
});
