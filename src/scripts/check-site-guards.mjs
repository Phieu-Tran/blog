import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (!key || !value) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }

  return frontmatter;
}

function checkUniqueGameField(field, label) {
  const gamesDir = 'src/content/games';
  if (!existsSync(gamesDir)) {
    fail(`${gamesDir} is missing`);
    return;
  }

  const seen = new Map();
  const duplicates = [];
  for (const file of readdirSync(gamesDir).filter(item => item.endsWith('.md'))) {
    const path = join(gamesDir, file);
    const frontmatter = parseFrontmatter(readFileSync(path, 'utf8'));
    const rawValue = frontmatter[field];
    if (!rawValue || rawValue === '0') continue;
    const value = String(rawValue).trim().toLowerCase();
    const previous = seen.get(value);
    if (previous) duplicates.push(`${label} ${value}: ${previous} + ${file}`);
    else seen.set(value, file);
  }

  if (duplicates.length) {
    fail(`Game ${label} values are unique (${duplicates.join('; ')})`);
  } else {
    pass(`Game ${label} values are unique`);
  }
}

requireFile('src/pages/index.astro');
const baseLayout = requireFile('src/layouts/BaseLayout.astro');
const searchIndex = requireFile('src/pages/search-index.json.ts');
requireIncludes(baseLayout, 'data-search-open', 'Global search can be opened from shared navigation');
requireIncludes(baseLayout, 'data-search-index-url', 'Global search lazy-loads its search index');
requireIncludes(baseLayout, 'openGlobalSearch', 'Global search client script is present');
requireIncludes(baseLayout, 'deploy-marker', 'Footer exposes the deploy marker');
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
  "site: 'https://blog.workspacesbeat.io.vn'",
  'Astro site URL stays absolute for sitemap and OG metadata',
);

requireFile('src/pages/rss.xml.ts');
requireFile('src/pages/robots.txt.ts');
requireFile('src/pages/og/[collection]/[slug].svg.ts');
requireFile('src/pages/404.astro');

checkUniqueGameField('steam_appid', 'Steam AppID');
checkUniqueGameField('igdb_id', 'IGDB ID');

const failed = checks.filter(check => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'fail'} - ${check.message}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} site guard check(s) failed.`);
  process.exit(1);
}

console.log('\nSite guard checks passed.');
