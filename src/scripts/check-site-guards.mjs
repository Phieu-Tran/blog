import { existsSync, readFileSync } from 'node:fs';

const checks = [];

function pass(message) {
  checks.push({ ok: true, message });
}

function fail(message) {
  checks.push({ ok: false, message });
}

function requireFile(path) {
  if (existsSync(path)) {
    pass(`${path} exists`);
    return readFileSync(path, 'utf8');
  }

  fail(`${path} is missing`);
  return '';
}

function requireIncludes(source, needle, message) {
  if (source.includes(needle)) {
    pass(message);
  } else {
    fail(message);
  }
}

function requireOrder(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);

  if (firstIndex !== -1 && secondIndex !== -1 && firstIndex < secondIndex) {
    pass(message);
  } else {
    fail(message);
  }
}

requireFile('src/pages/index.astro');
const baseLayout = requireFile('src/layouts/BaseLayout.astro');
const searchIndex = requireFile('src/pages/search-index.json.ts');
requireIncludes(baseLayout, 'data-search-open', 'Global search can be opened from shared navigation');
requireIncludes(baseLayout, 'data-search-index-url', 'Global search lazy-loads its search index');
requireIncludes(baseLayout, 'openGlobalSearch', 'Global search client script is present');
requireIncludes(searchIndex, "getCollection('anime')", 'Search index includes anime');
requireIncludes(searchIndex, "getCollection('games')", 'Search index includes games');
requireIncludes(searchIndex, "getCollection('films')", 'Search index includes films');
requireIncludes(searchIndex, 'Content-Type', 'Search index is served as JSON');

const syncWorkflow = requireFile('.github/workflows/sync.yml');
requireIncludes(syncWorkflow, 'node src/scripts/sync-all.mjs', 'Weekly sync runs the unified media sync');
requireIncludes(
  syncWorkflow,
  'node src/scripts/sync-imdb.mjs --enrich-existing',
  'Weekly sync refreshes IMDb-backed TMDB metadata',
);
requireIncludes(syncWorkflow, 'npm run build', 'Weekly sync ends with a production build check');
requireIncludes(syncWorkflow, 'SYNC_MAX_AUTO_DELETE', 'Weekly sync keeps the delete safety guard');

const astroConfig = requireFile('astro.config.mjs');
requireIncludes(
  astroConfig,
  "site: 'https://blog.workspacesbeat.site'",
  'Astro site URL stays absolute for sitemap and OG metadata',
);

requireFile('src/pages/rss.xml.ts');
requireFile('src/pages/robots.txt.ts');
requireFile('src/pages/og/[collection]/[slug].svg.ts');
requireFile('src/pages/404.astro');

const failed = checks.filter(check => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.message}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} site guard check(s) failed.`);
  process.exit(1);
}

console.log('\nSite guard checks passed.');
