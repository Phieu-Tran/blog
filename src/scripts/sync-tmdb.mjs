/**
 * sync-tmdb.mjs
 *
 * Fetch metadata phim từ TMDB và tạo/cập nhật file .md trong src/content/films/.
 * Hỗ trợ 2 chế độ:
 *   1. Fetch theo TMDB list (nếu có TMDB_LIST_ID)
 *   2. Chỉ update metadata cho các file đã có tmdb_id
 *
 * Cách dùng:
 *   TMDB_API_KEY=xxx node src/scripts/sync-tmdb.mjs
 *   TMDB_API_KEY=xxx TMDB_LIST_ID=123 node src/scripts/sync-tmdb.mjs
 */

import fs from 'fs';
import path from 'path';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_LIST_ID = process.env.TMDB_LIST_ID;
const TMDB_BASE = 'https://api.themoviedb.org/3';
const FILMS_DIR = path.resolve('src/content/films');

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

function findExistingFile(tmdbId) {
  if (!fs.existsSync(FILMS_DIR)) return null;
  const files = fs.readdirSync(FILMS_DIR).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(FILMS_DIR, file), 'utf-8');
    const parsed = parseFrontmatter(content);
    if (parsed && Number(parsed.frontmatter.tmdb_id) === tmdbId) {
      return { file, ...parsed };
    }
  }
  return null;
}

async function fetchMovieDetails(tmdbId) {
  const url = `${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=vi-VN&append_to_response=credits`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function fetchList(listId) {
  const allMovies = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = `${TMDB_BASE}/list/${listId}?api_key=${TMDB_API_KEY}&page=${page}`;
    console.log(`  GET ${url}`);
    const res = await fetch(url);
    if (!res.ok) break;
    const json = await res.json();
    allMovies.push(...(json.items || []));
    totalPages = json.total_pages || 1;
    page++;
    await sleep(300);
  }

  return allMovies;
}

async function processMovie(tmdbId, existingRating) {
  const details = await fetchMovieDetails(tmdbId);
  if (!details) return null;

  const director = details.credits?.crew?.find(c => c.job === 'Director');

  return {
    title: details.title,
    tmdb_id: tmdbId,
    rating: existingRating || 0,
    genre: details.genres?.map(g => g.name).join(', ') || 'N/A',
    year: details.release_date ? new Date(details.release_date).getFullYear() : new Date().getFullYear(),
    director: director?.name || 'N/A',
    status: 'watched',
    cover: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : undefined,
    date: new Date().toISOString().split('T')[0],
  };
}

async function main() {
  if (!TMDB_API_KEY) {
    console.error('Cần set TMDB_API_KEY environment variable.');
    console.error('Cách dùng: TMDB_API_KEY=xxx node src/scripts/sync-tmdb.mjs');
    process.exit(1);
  }

  if (!fs.existsSync(FILMS_DIR)) {
    fs.mkdirSync(FILMS_DIR, { recursive: true });
  }

  let totalCreated = 0;
  let totalUpdated = 0;

  // Chế độ 1: Sync từ TMDB list
  if (TMDB_LIST_ID) {
    console.log(`\nSync từ TMDB list: ${TMDB_LIST_ID}\n`);
    const movies = await fetchList(TMDB_LIST_ID);
    console.log(`Tìm thấy ${movies.length} phim\n`);

    for (const movie of movies) {
      const tmdbId = movie.id;
      console.log(`Processing: ${movie.title} (TMDB: ${tmdbId})`);

      const existing = findExistingFile(tmdbId);
      const data = await processMovie(tmdbId, existing?.frontmatter?.rating);
      await sleep(300);

      if (!data) {
        console.log(`  Bỏ qua — không fetch được`);
        continue;
      }

      if (existing) {
        const merged = { ...existing.frontmatter };
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined && value !== null) {
            if (key === 'rating' && Number(merged.rating) > 0 && value === 0) continue;
            if (key === 'date' && merged.date) continue;
            merged[key] = value;
          }
        }
        fs.writeFileSync(path.join(FILMS_DIR, existing.file), buildFrontmatter(merged) + existing.body);
        console.log(`  Updated: ${existing.file}`);
        totalUpdated++;
      } else {
        const slug = slugify(data.title) || `film-${tmdbId}`;
        const filename = `${slug}.md`;
        fs.writeFileSync(path.join(FILMS_DIR, filename), buildFrontmatter(data) + '\n');
        console.log(`  Created: ${filename}`);
        totalCreated++;
      }
    }
  }

  // Chế độ 2: Update metadata cho các file đã có tmdb_id nhưng thiếu thông tin
  console.log('\nUpdate metadata cho films hiện có...');
  const files = fs.readdirSync(FILMS_DIR).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(FILMS_DIR, file), 'utf-8');
    const parsed = parseFrontmatter(content);
    if (!parsed || !parsed.frontmatter.tmdb_id) continue;
    if (parsed.frontmatter.cover) continue; // Đã có đủ thông tin

    const tmdbId = Number(parsed.frontmatter.tmdb_id);
    console.log(`  Fetching metadata: ${parsed.frontmatter.title} (TMDB: ${tmdbId})`);

    const data = await processMovie(tmdbId, parsed.frontmatter.rating);
    await sleep(300);

    if (data) {
      const merged = { ...parsed.frontmatter };
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null && !merged[key]) {
          merged[key] = value;
        }
      }
      if (data.cover) merged.cover = data.cover;
      fs.writeFileSync(path.join(FILMS_DIR, file), buildFrontmatter(merged) + parsed.body);
      console.log(`  Updated: ${file}`);
      totalUpdated++;
    }
  }

  console.log(`\nHoàn tất! Tạo mới: ${totalCreated}, Cập nhật: ${totalUpdated}`);
}

main().catch(err => {
  console.error('Lỗi:', err);
  process.exit(1);
});
