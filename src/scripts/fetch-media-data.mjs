/**
 * fetch-media-data.mjs
 * 
 * Script tự động kéo metadata từ MAL (Jikan API) và TMDB API
 * để bổ sung vào các file markdown trong content/
 * 
 * Cách dùng:
 *   node src/scripts/fetch-media-data.mjs
 * 
 * Yêu cầu:
 *   - TMDB API key (miễn phí): đăng ký tại https://www.themoviedb.org/settings/api
 *   - MAL/Jikan: không cần key
 */

import fs from 'fs';
import path from 'path';

// ============================================
// CẤU HÌNH - Điền API key của bạn vào đây
// ============================================
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'YOUR_TMDB_API_KEY';
const JIKAN_BASE = 'https://api.jikan.moe/v4';
const TMDB_BASE = 'https://api.themoviedb.org/3';

// ============================================
// HELPER FUNCTIONS
// ============================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  
  const frontmatter = {};
  match[1].split('\n').forEach(line => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      let value = rest.join(':').trim();
      // Remove quotes
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      // Parse numbers
      if (!isNaN(value) && value !== '') {
        value = Number(value);
      }
      frontmatter[key.trim()] = value;
    }
  });
  
  return { frontmatter, body: match[2] };
}

function writeFrontmatter(frontmatter, body) {
  const lines = Object.entries(frontmatter).map(([key, value]) => {
    if (typeof value === 'string' && (value.includes(':') || value.includes(',') || value.includes(' '))) {
      return `${key}: "${value}"`;
    }
    return `${key}: ${value}`;
  });
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

// ============================================
// JIKAN API (MyAnimeList) - Miễn phí, không cần key
// ============================================

async function fetchAnimeFromMAL(malId) {
  try {
    const res = await fetch(`${JIKAN_BASE}/anime/${malId}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    
    return {
      cover: data.images?.jpg?.large_image_url || data.images?.jpg?.image_url,
      episodes: data.episodes,
      studio: data.studios?.[0]?.name,
      genre: data.genres?.map(g => g.name).join(', '),
      year: data.year || new Date(data.aired?.from).getFullYear(),
      synopsis: data.synopsis,
      mal_score: data.score,
    };
  } catch (err) {
    console.error(`  Lỗi khi fetch MAL ID ${malId}:`, err.message);
    return null;
  }
}

// ============================================
// TMDB API - Cần API key (miễn phí)
// ============================================

async function fetchFilmFromTMDB(tmdbId) {
  if (TMDB_API_KEY === 'YOUR_TMDB_API_KEY') {
    console.log('  Bỏ qua TMDB - chưa có API key');
    return null;
  }
  
  try {
    const res = await fetch(`${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=vi-VN`);
    if (!res.ok) return null;
    const data = await res.json();
    
    return {
      cover: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
      genre: data.genres?.map(g => g.name).join(', '),
      year: new Date(data.release_date).getFullYear(),
      synopsis: data.overview,
      tmdb_score: data.vote_average,
    };
  } catch (err) {
    console.error(`  Lỗi khi fetch TMDB ID ${tmdbId}:`, err.message);
    return null;
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🔄 Bắt đầu fetch media data...\n');
  
  // Process anime files
  const animeDir = path.resolve('src/content/anime');
  if (fs.existsSync(animeDir)) {
    const files = fs.readdirSync(animeDir).filter(f => f.endsWith('.md'));
    console.log(`📺 Tìm thấy ${files.length} anime files`);
    
    for (const file of files) {
      const filepath = path.join(animeDir, file);
      const content = fs.readFileSync(filepath, 'utf-8');
      const parsed = parseFrontmatter(content);
      if (!parsed) continue;
      
      const { frontmatter, body } = parsed;
      if (frontmatter.mal_id && !frontmatter.cover) {
        console.log(`  Fetching: ${frontmatter.title} (MAL: ${frontmatter.mal_id})`);
        const data = await fetchAnimeFromMAL(frontmatter.mal_id);
        
        if (data) {
          if (data.cover) frontmatter.cover = data.cover;
          if (data.episodes && !frontmatter.episodes) frontmatter.episodes = data.episodes;
          if (data.studio && !frontmatter.studio) frontmatter.studio = data.studio;
          
          fs.writeFileSync(filepath, writeFrontmatter(frontmatter, body));
          console.log(`  ✅ Đã cập nhật ${file}`);
        }
        
        await sleep(1000); // Rate limit: 1 req/sec cho Jikan
      }
    }
  }
  
  // Process film files
  const filmsDir = path.resolve('src/content/films');
  if (fs.existsSync(filmsDir)) {
    const files = fs.readdirSync(filmsDir).filter(f => f.endsWith('.md'));
    console.log(`\n🎬 Tìm thấy ${files.length} film files`);
    
    for (const file of files) {
      const filepath = path.join(filmsDir, file);
      const content = fs.readFileSync(filepath, 'utf-8');
      const parsed = parseFrontmatter(content);
      if (!parsed) continue;
      
      const { frontmatter, body } = parsed;
      if (frontmatter.tmdb_id && !frontmatter.cover) {
        console.log(`  Fetching: ${frontmatter.title} (TMDB: ${frontmatter.tmdb_id})`);
        const data = await fetchFilmFromTMDB(frontmatter.tmdb_id);
        
        if (data) {
          if (data.cover) frontmatter.cover = data.cover;
          
          fs.writeFileSync(filepath, writeFrontmatter(frontmatter, body));
          console.log(`  ✅ Đã cập nhật ${file}`);
        }
        
        await sleep(300);
      }
    }
  }
  
  console.log('\n✅ Hoàn tất fetch media data!');
}

main();
