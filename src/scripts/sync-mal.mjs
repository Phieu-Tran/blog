/**
 * sync-mal.mjs
 *
 * Sync anime list từ MyAnimeList bằng cách scrape trực tiếp trang animelist.
 * Không cần API key, không cần export thủ công.
 *
 * Cách dùng:
 *   node src/scripts/sync-mal.mjs <MAL_USERNAME>
 *   hoặc set env: MAL_USERNAME=username node src/scripts/sync-mal.mjs
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

const ANIME_DIR = path.resolve('src/content/anime');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = {};
  match[1].split('\n').forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (!isNaN(value) && value !== '') {
      value = Number(value);
    }
    frontmatter[key] = value;
  });

  return { frontmatter, body: match[2] };
}

function buildFrontmatter(data) {
  const lines = Object.entries(data).map(([key, value]) => {
    if (value === undefined || value === null) return null;
    if (key === 'title') return `${key}: "${String(value).replace(/"/g, '\\"')}"`;
    if (typeof value === 'string' && (value.includes(':') || value.includes(',') || value.includes(' ') || value.includes('"'))) {
      return `${key}: "${value.replace(/"/g, '\\"')}"`;
    }
    return `${key}: ${value}`;
  }).filter(Boolean);
  return `---\n${lines.join('\n')}\n---\n`;
}

// MAL status codes: 1=watching, 2=completed, 3=on_hold, 4=dropped, 6=plan_to_watch
function mapStatus(malStatus) {
  const map = { 1: 'watching', 2: 'completed', 3: 'on_hold', 4: 'dropped', 6: 'plan' };
  return map[malStatus] || 'plan';
}

function findExistingFileByMalId(malId) {
  if (!fs.existsSync(ANIME_DIR)) return null;
  const files = fs.readdirSync(ANIME_DIR).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(ANIME_DIR, file), 'utf-8');
    const parsed = parseFrontmatter(content);
    if (parsed && Number(parsed.frontmatter.mal_id) === malId) {
      return { file, ...parsed };
    }
  }
  return null;
}

async function fetchAnimeList(username) {
  const allItems = [];
  let offset = 0;

  while (true) {
    const url = `https://myanimelist.net/animelist/${username}?offset=${offset}`;
    console.log(`  GET ${url}`);
    const html = await fetchPage(url);

    const match = html.match(/data-items="([^"]*)"/);
    if (!match) break;

    const decoded = match[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    const items = JSON.parse(decoded);
    if (items.length === 0) break;

    allItems.push(...items);
    console.log(`  Got ${items.length} items (total: ${allItems.length})`);

    if (items.length < 300) break;
    offset += 300;
    await sleep(1000);
  }

  return allItems;
}

async function main() {
  const username = process.argv[2] || process.env.MAL_USERNAME;
  if (!username) {
    console.error('Usage: node src/scripts/sync-mal.mjs <MAL_USERNAME>');
    process.exit(1);
  }

  console.log(`\nSync anime list for: ${username}\n`);

  if (!fs.existsSync(ANIME_DIR)) {
    fs.mkdirSync(ANIME_DIR, { recursive: true });
  }

  const items = await fetchAnimeList(username);
  console.log(`\nTotal: ${items.length} anime\n`);

  let created = 0;
  let updated = 0;

  for (const item of items) {
    const malId = item.anime_id;
    const title = item.anime_title_eng || item.anime_title;
    const slug = slugify(title) || `anime-${malId}`;

    const genres = [
      ...(item.genres || []).map(g => g.name),
      ...(item.demographics || []).map(g => g.name),
    ].join(', ') || 'N/A';

    const studio = item.anime_studios?.[0]?.name || 'N/A';
    const year = item.anime_start_date_string
      ? new Date(item.anime_start_date_string).getFullYear()
      : new Date().getFullYear();

    const cover = item.anime_image_path
      ? item.anime_image_path.replace('/r/192x272', '').split('?')[0]
      : undefined;

    const frontmatterData = {
      title,
      mal_id: malId,
      rating: item.score || 0,
      mal_score: item.anime_score_val || 0,
      genre: genres,
      year: isNaN(year) ? new Date().getFullYear() : year,
      studio,
      status: mapStatus(item.status),
      episodes_watched: item.num_watched_episodes || 0,
      episodes_total: item.anime_num_episodes || 0,
      cover,
      updated_at: item.updated_at ? new Date(item.updated_at * 1000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      date: new Date().toISOString().split('T')[0],
    };

    const existing = findExistingFileByMalId(malId);

    if (existing) {
      const merged = { ...existing.frontmatter };
      for (const [key, value] of Object.entries(frontmatterData)) {
        if (value === undefined || value === null) continue;
        if (key === 'rating' && Number(merged.rating) > 0 && value === 0) continue;
        if (key === 'date' && merged.date) continue;
        // Always update cover from MAL
        merged[key] = value;
      }
      const newContent = buildFrontmatter(merged) + existing.body;
      fs.writeFileSync(path.join(ANIME_DIR, existing.file), newContent);
      updated++;
    } else {
      const filename = `${slug}.md`;
      fs.writeFileSync(path.join(ANIME_DIR, filename), buildFrontmatter(frontmatterData) + '\n');
      created++;
    }
  }

  console.log(`Done! Created: ${created}, Updated: ${updated}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
