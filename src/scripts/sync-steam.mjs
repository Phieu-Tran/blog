/**
 * sync-steam.mjs
 *
 * Sync game library từ Steam API.
 * Tạo/cập nhật file .md trong src/content/games/ với playtime, cover.
 *
 * Cách dùng:
 *   STEAM_API_KEY=xxx STEAM_ID=xxx node src/scripts/sync-steam.mjs
 */

import fs from 'fs';
import path from 'path';

const STEAM_API_KEY = process.env.STEAM_API_KEY || '';
const STEAM_ID = process.env.STEAM_ID || '';
const GAMES_DIR = path.resolve('src/content/games');

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

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const fm = {};
  match[1].split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (!isNaN(val) && val !== '') val = Number(val);
    fm[key] = val;
  });
  return { frontmatter: fm, body: match[2] };
}

function buildFrontmatter(data) {
  const lines = Object.entries(data).map(([k, v]) => {
    if (v === undefined || v === null || v === '') return null;
    if (k === 'title') return `${k}: "${String(v).replace(/"/g, '\\"')}"`;
    if (typeof v === 'string' && (v.includes(':') || v.includes(',') || v.includes(' ') || v.includes('"')))
      return `${k}: "${v.replace(/"/g, '\\"')}"`;
    return `${k}: ${v}`;
  }).filter(Boolean);
  return `---\n${lines.join('\n')}\n---\n`;
}

function findExistingFile(steamAppId) {
  if (!fs.existsSync(GAMES_DIR)) return null;
  for (const file of fs.readdirSync(GAMES_DIR).filter(f => f.endsWith('.md'))) {
    const content = fs.readFileSync(path.join(GAMES_DIR, file), 'utf-8');
    const parsed = parseFrontmatter(content);
    if (parsed && Number(parsed.frontmatter.steam_appid) === steamAppId) {
      return { file, ...parsed };
    }
  }
  return null;
}

function getStatus(playtimeMinutes, recentPlaytime) {
  if (recentPlaytime > 0) return 'playing';
  if (playtimeMinutes > 60) return 'completed'; // >1h = likely played
  if (playtimeMinutes > 0) return 'playing';
  return 'plan';
}

async function main() {
  if (!STEAM_API_KEY || !STEAM_ID) {
    console.error('Usage: STEAM_API_KEY=xxx STEAM_ID=xxx node src/scripts/sync-steam.mjs');
    process.exit(1);
  }

  console.log(`\nSync Steam library for: ${STEAM_ID}\n`);

  if (!fs.existsSync(GAMES_DIR)) fs.mkdirSync(GAMES_DIR, { recursive: true });

  // Fetch owned games
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&format=json&include_appinfo=true&include_played_free_games=true`;
  const res = await fetch(url);
  const data = await res.json();
  const games = data.response?.games || [];

  console.log(`Found ${games.length} games\n`);

  // Fetch recent games for "playing" status
  const recentUrl = `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&format=json`;
  const recentRes = await fetch(recentUrl);
  const recentData = await recentRes.json();
  const recentAppIds = new Set((recentData.response?.games || []).map(g => g.appid));

  let created = 0, updated = 0;

  for (const game of games) {
    const appId = game.appid;
    const title = game.name;
    const slug = slugify(title) || `game-${appId}`;
    const playtimeHours = Math.round(game.playtime_forever / 60);
    const isRecent = recentAppIds.has(appId);
    const status = getStatus(game.playtime_forever, isRecent ? 1 : 0);

    const cover = `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/header.jpg`;

    const frontmatterData = {
      title,
      steam_appid: appId,
      rating: 0,
      genre: 'N/A',
      year: new Date().getFullYear(),
      studio: 'N/A',
      status,
      platform: 'Steam',
      playtime_hours: playtimeHours,
      cover,
      date: new Date().toISOString().split('T')[0],
    };

    const existing = findExistingFile(appId);

    if (existing) {
      const merged = { ...existing.frontmatter };
      // Always update playtime and status
      merged.playtime_hours = playtimeHours;
      if (isRecent) merged.status = 'playing';
      // Update cover if missing
      if (!merged.cover) merged.cover = cover;
      // Don't overwrite manual fields
      if (merged.rating > 0) frontmatterData.rating = merged.rating;
      if (merged.genre !== 'N/A') frontmatterData.genre = merged.genre;
      if (merged.studio !== 'N/A') frontmatterData.studio = merged.studio;

      for (const [k, v] of Object.entries(frontmatterData)) {
        if (v === undefined || v === null) continue;
        if (k === 'rating' && Number(merged.rating) > 0) continue;
        if (k === 'genre' && merged.genre !== 'N/A') continue;
        if (k === 'studio' && merged.studio !== 'N/A') continue;
        if (k === 'date' && merged.date) continue;
        merged[k] = v;
      }

      fs.writeFileSync(path.join(GAMES_DIR, existing.file), buildFrontmatter(merged) + existing.body);
      updated++;
    } else {
      fs.writeFileSync(path.join(GAMES_DIR, `${slug}.md`), buildFrontmatter(frontmatterData) + '\n');
      created++;
    }

    console.log(`  ${title} — ${playtimeHours}h ${isRecent ? '(playing)' : ''}`);
  }

  console.log(`\nDone! Created: ${created}, Updated: ${updated}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
