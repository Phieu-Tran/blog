/**
 * sync-mal.mjs
 *
 * Sync anime list từ MyAnimeList thông qua Jikan API v4.
 * Tạo/cập nhật file .md trong src/content/anime/.
 * Giữ nguyên body (review) nếu file đã tồn tại.
 *
 * Cách dùng:
 *   node src/scripts/sync-mal.mjs <MAL_USERNAME>
 *   hoặc set env: MAL_USERNAME=username node src/scripts/sync-mal.mjs
 */

import fs from 'fs';
import path from 'path';

const JIKAN_BASE = 'https://api.jikan.moe/v4';
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
    .trim();
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
    if (typeof value === 'string' && (value.includes(':') || value.includes(',') || value.includes(' ') || value.includes('"'))) {
      return `${key}: "${value.replace(/"/g, '\\"')}"`;
    }
    return `${key}: ${value}`;
  }).filter(Boolean);
  return `---\n${lines.join('\n')}\n---\n`;
}

// Map MAL status codes → our status enum
function mapStatus(malStatus) {
  const map = {
    watching: 'watching',
    completed: 'completed',
    on_hold: 'watching',
    dropped: 'dropped',
    plan_to_watch: 'plan',
  };
  return map[malStatus] || 'plan';
}

// Tìm file hiện có theo mal_id
function findExistingFile(malId) {
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

async function fetchUserAnimeList(username, status) {
  const allEntries = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const url = `${JIKAN_BASE}/users/${username}/animelist?status=${status}&page=${page}`;
    console.log(`  GET ${url}`);
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`  Lỗi ${res.status}: ${res.statusText}`);
      break;
    }

    const json = await res.json();
    allEntries.push(...(json.data || []));
    hasNext = json.pagination?.has_next_page || false;
    page++;
    await sleep(1000); // Rate limit Jikan
  }

  return allEntries;
}

async function fetchAnimeDetails(malId) {
  const url = `${JIKAN_BASE}/anime/${malId}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const { data } = await res.json();
  return data;
}

async function main() {
  const username = process.argv[2] || process.env.MAL_USERNAME;
  if (!username) {
    console.error('Cách dùng: node src/scripts/sync-mal.mjs <MAL_USERNAME>');
    console.error('Hoặc set env: MAL_USERNAME=username');
    process.exit(1);
  }

  console.log(`\nSync anime list cho user: ${username}\n`);

  if (!fs.existsSync(ANIME_DIR)) {
    fs.mkdirSync(ANIME_DIR, { recursive: true });
  }

  const statuses = ['watching', 'completed', 'plantowatch'];
  let totalCreated = 0;
  let totalUpdated = 0;

  for (const status of statuses) {
    console.log(`\nFetching list: ${status}...`);
    const entries = await fetchUserAnimeList(username, status);
    console.log(`  Tìm thấy ${entries.length} anime`);

    for (const entry of entries) {
      const anime = entry.anime || entry;
      const malId = anime.mal_id;
      const title = anime.title;
      const slug = slugify(title) || `anime-${malId}`;

      console.log(`  Processing: ${title} (MAL: ${malId})`);

      // Fetch thêm detail để lấy studio, genre, episodes
      const details = await fetchAnimeDetails(malId);
      await sleep(1000);

      const frontmatterData = {
        title,
        mal_id: malId,
        rating: entry.score || 0,
        genre: details?.genres?.map(g => g.name).join(', ') || 'N/A',
        year: details?.year || (details?.aired?.from ? new Date(details.aired.from).getFullYear() : new Date().getFullYear()),
        studio: details?.studios?.[0]?.name || 'N/A',
        status: mapStatus(status === 'plantowatch' ? 'plan_to_watch' : status),
        episodes: details?.episodes || undefined,
        cover: details?.images?.jpg?.large_image_url || anime.images?.jpg?.large_image_url || undefined,
        date: new Date().toISOString().split('T')[0],
      };

      const existing = findExistingFile(malId);

      if (existing) {
        // Update frontmatter, giữ nguyên body
        const merged = { ...existing.frontmatter };
        for (const [key, value] of Object.entries(frontmatterData)) {
          if (value !== undefined && value !== null) {
            // Giữ nguyên rating nếu user đã tự set (khác 0)
            if (key === 'rating' && Number(merged.rating) > 0 && value === 0) continue;
            // Giữ nguyên date gốc
            if (key === 'date' && merged.date) continue;
            merged[key] = value;
          }
        }
        const newContent = buildFrontmatter(merged) + existing.body;
        fs.writeFileSync(path.join(ANIME_DIR, existing.file), newContent);
        console.log(`    Updated: ${existing.file}`);
        totalUpdated++;
      } else {
        // Tạo file mới
        const filename = `${slug}.md`;
        const content = buildFrontmatter(frontmatterData) + '\n';
        fs.writeFileSync(path.join(ANIME_DIR, filename), content);
        console.log(`    Created: ${filename}`);
        totalCreated++;
      }
    }
  }

  console.log(`\nHoàn tất! Tạo mới: ${totalCreated}, Cập nhật: ${totalUpdated}`);
}

main().catch(err => {
  console.error('Lỗi:', err);
  process.exit(1);
});
