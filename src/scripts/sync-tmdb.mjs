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
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = {};
  match[1].split(/\r?\n/).forEach(line => {
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

function normalizeTmdbType(type) {
  return type === 'tv' ? 'tv' : 'movie';
}

function tmdbEndpoint(type, tmdbId) {
  return `${TMDB_BASE}/${normalizeTmdbType(type)}/${tmdbId}`;
}

function findExistingFile(tmdbId, tmdbType = 'movie') {
  if (!fs.existsSync(FILMS_DIR)) return null;
  const expectedType = normalizeTmdbType(tmdbType);
  const files = fs.readdirSync(FILMS_DIR).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(FILMS_DIR, file), 'utf-8');
    const parsed = parseFrontmatter(content);
    const existingType = normalizeTmdbType(parsed?.frontmatter?.tmdb_type);
    if (parsed && Number(parsed.frontmatter.tmdb_id) === tmdbId && existingType === expectedType) {
      return { file, ...parsed };
    }
  }
  return null;
}

async function fetchTitleDetails(tmdbId, tmdbType = 'movie') {
  const url = `${tmdbEndpoint(tmdbType, tmdbId)}?api_key=${TMDB_API_KEY}&language=vi-VN&append_to_response=credits,external_ids`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

function getTitle(details, tmdbType) {
  return tmdbType === 'tv'
    ? details.name || details.original_name
    : details.title || details.original_title;
}

function getYear(details, tmdbType) {
  const date = tmdbType === 'tv' ? details.first_air_date : details.release_date;
  return date ? new Date(date).getFullYear() : new Date().getFullYear();
}

function getDirector(details, tmdbType) {
  if (tmdbType === 'tv' && details.created_by?.length) {
    return details.created_by.map(person => person.name).join(', ');
  }

  const director = details.credits?.crew?.find(c => c.job === 'Director');
  return director?.name || 'N/A';
}

function getImdbId(details, tmdbType) {
  return tmdbType === 'tv' ? details.external_ids?.imdb_id : details.imdb_id;
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

async function processTitle(tmdbId, existingRating, tmdbType = 'movie') {
  const details = await fetchTitleDetails(tmdbId, tmdbType);
  if (!details) return null;

  return {
    title: getTitle(details, tmdbType),
    imdb_id: getImdbId(details, tmdbType),
    tmdb_id: tmdbId,
    tmdb_type: normalizeTmdbType(tmdbType),
    rating: existingRating || 0,
    genre: details.genres?.map(g => g.name).join(', ') || 'N/A',
    year: getYear(details, tmdbType),
    director: getDirector(details, tmdbType),
    tmdb_score: details.vote_average ? Number(details.vote_average.toFixed(1)) : undefined,
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
      const tmdbType = normalizeTmdbType(movie.media_type);
      console.log(`Processing: ${movie.title || movie.name} (TMDB ${tmdbType}: ${tmdbId})`);

      const existing = findExistingFile(tmdbId, tmdbType);
      const data = await processTitle(tmdbId, existing?.frontmatter?.rating, tmdbType);
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
    const tmdbType = normalizeTmdbType(parsed.frontmatter.tmdb_type);
    console.log(`  Fetching metadata: ${parsed.frontmatter.title} (TMDB ${tmdbType}: ${tmdbId})`);

    const data = await processTitle(tmdbId, parsed.frontmatter.rating, tmdbType);
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
