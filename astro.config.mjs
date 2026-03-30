import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://blog.workspacesbeat.site',
  base: '/',
  build: {
    assets: '_assets'
  }
});
