/**
 * import-igdb-gdpr.mjs
 *
 * Import personal IGDB GDPR export data into src/content/games.
 *
 * Usage:
 *   node src/scripts/import-igdb-gdpr.mjs path/to/index.html
 */

import fs from 'fs';
import path from 'path';

const GAMES_DIR = path.resolve('src/content/games');
const inputPath = process.argv[2];

function decodeHtml(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function stripTags(value = '') {
  return decodeHtml(value.replace(/<[^>]+>/g, ''));
}

function slugify(text) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function romanToArabicToken(token) {
  const map = {
    i: '1',
    ii: '2',
    iii: '3',
    iv: '4',
    v: '5',
    vi: '6',
    vii: '7',
    viii: '8',
    ix: '9',
    x: '10',
  };
  return map[token.toLowerCase()] || token;
}

function normalizeTitle(title) {
  return decodeHtml(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/g, romanToArabicToken)
    .replace(/^marvel'?s\s+/, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^marvels\s+/, '')
    .trim();
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  const fm = {};
  match[1].split(/\r?\n/).forEach(line => {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
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

function listMarkdownEntries(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.md'))
    .map(file => {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      const parsed = parseFrontmatter(content);
      return parsed ? { file, ...parsed } : null;
    })
    .filter(Boolean);
}

function extractSection(html, startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  if (start === -1) return '';
  const end = html.indexOf(endMarker, start + startMarker.length);
  return html.slice(start, end === -1 ? html.length : end);
}

function extractRows(sectionHtml) {
  return [...sectionHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(rowMatch => (
    [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(cellMatch => {
      const html = cellMatch[1];
      const time = html.match(/datetime="([^"]+)"/)?.[1];
      return { text: stripTags(html), time };
    })
  ));
}

function parseRatings(html) {
  const section = extractSection(html, '<h2>Ratings</h2>', '<h2>Hypes');
  const rows = extractRows(section);
  const byTitle = new Map();

  for (const cells of rows) {
    if (cells.length < 4 || cells[0].text === 'Game') continue;

    const title = cells[0].text;
    const rating = Number(cells[1].text);
    if (!title || !Number.isFinite(rating)) continue;

    const createdAt = cells[2].time;
    const updatedAt = cells[3].time || createdAt;
    const existing = byTitle.get(normalizeTitle(title));
    if (!existing || new Date(updatedAt) >= new Date(existing.updatedAt || existing.createdAt || 0)) {
      byTitle.set(normalizeTitle(title), { title, rating, createdAt, updatedAt });
    }
  }

  return byTitle;
}

function parsePlayed(html) {
  const section = extractSection(html, '<h3>Played</h3>', '<h2>Friendships');
  const rows = extractRows(section);
  const played = new Map();

  for (const cells of rows) {
    if (cells.length < 5 || cells[0].text === 'Position') continue;
    if (!/^\d+$/.test(cells[0].text)) continue;
    const title = cells[2].text;
    if (title) played.set(normalizeTitle(title), title);
  }

  return played;
}

function existingGameIndex() {
  const entries = listMarkdownEntries(GAMES_DIR);
  const index = new Map();
  for (const entry of entries) {
    const title = entry.frontmatter.title || path.basename(entry.file, '.md');
    index.set(normalizeTitle(title), entry);
    index.set(normalizeTitle(path.basename(entry.file, '.md').replace(/-/g, ' ')), entry);
  }
  return index;
}

function writeGame(file, frontmatter, body) {
  fs.writeFileSync(path.join(GAMES_DIR, file), buildFrontmatter(frontmatter) + body);
}

function main() {
  if (!inputPath) {
    console.error('Usage: node src/scripts/import-igdb-gdpr.mjs path/to/index.html');
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(GAMES_DIR)) fs.mkdirSync(GAMES_DIR, { recursive: true });

  const html = fs.readFileSync(inputPath, 'utf-8');
  const ratings = parseRatings(html);
  const played = parsePlayed(html);
  const existing = existingGameIndex();
  const keys = new Set([...ratings.keys(), ...played.keys()]);

  let created = 0;
  let updated = 0;

  for (const key of [...keys].sort()) {
    const rating = ratings.get(key);
    const playedTitle = played.get(key);
    const title = rating?.title || playedTitle;
    if (!title) continue;

    const current = existing.get(key);
    const date = (rating?.createdAt || rating?.updatedAt || new Date().toISOString()).slice(0, 10);

    if (current) {
      const merged = { ...current.frontmatter };
      if (rating) merged.rating = rating.rating;
      if (played.has(key) && (!merged.status || merged.status === 'plan')) merged.status = 'completed';
      if (!merged.platform) merged.platform = 'IGDB';
      if (!merged.date) merged.date = date;
      writeGame(current.file, merged, current.body);
      updated++;
      continue;
    }

    const filename = `${slugify(title) || `igdb-game-${created + 1}`}.md`;
    const frontmatter = {
      title,
      rating: rating?.rating ?? 0,
      genre: 'N/A',
      year: new Date().getFullYear(),
      studio: 'N/A',
      status: played.has(key) ? 'completed' : 'plan',
      platform: 'IGDB',
      date,
    };
    writeGame(filename, frontmatter, '\n');
    existing.set(key, { file: filename, frontmatter, body: '\n' });
    created++;
  }

  console.log(`Imported IGDB GDPR export: ${ratings.size} ratings, ${played.size} played entries.`);
  console.log(`Games updated: ${updated}, created: ${created}.`);
}

main();
