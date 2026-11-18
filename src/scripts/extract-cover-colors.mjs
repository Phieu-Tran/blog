// Extracts one accent color per cover image so detail pages can tint themselves to match the poster.
// Incremental: an entry is only re-fetched when its cover URL changes. Output: src/data/cover-colors.json
//   node src/scripts/extract-cover-colors.mjs [--force]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_FILE = 'src/data/cover-colors.json';
const COLLECTIONS = ['anime', 'games', 'films', 'books'];
const CONCURRENCY = 8;
const force = process.argv.includes('--force');

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.log('cover-colors: sharp is not available, skipping.');
  process.exit(0);
}

function readCover(path) {
  const match = readFileSync(path, 'utf8').match(/^cover:\s*["']?([^"'\r\n]+)["']?\s*$/m);
  return match ? match[1].trim() : '';
}

// Ask the CDNs for a small variant: we only need a handful of pixels.
function smallVariant(url) {
  return url
    .replace('image.tmdb.org/t/p/w500/', 'image.tmdb.org/t/p/w92/')
    .replace('/t_cover_big/', '/t_cover_small/');
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const channel = n => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

// Pick the dominant *colorful* hue (12 buckets, weighted by saturation), then normalize
// saturation/lightness so the accent reads well as text and borders on the dark theme.
async function accentFor(buffer) {
  const { data } = await sharp(buffer).resize(24, 24, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = Array.from({ length: 12 }, () => ({ weight: 0, x: 0, y: 0, s: 0 }));
  for (let i = 0; i < data.length; i += 3) {
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (s < 0.18 || l < 0.12 || l > 0.92) continue;
    const weight = s * (1 - Math.abs(l - 0.5));
    const bucket = buckets[Math.floor(h / 30) % 12];
    const rad = (h * Math.PI) / 180;
    bucket.weight += weight;
    bucket.x += Math.cos(rad) * weight;
    bucket.y += Math.sin(rad) * weight;
    bucket.s += s * weight;
  }
  const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a));
  if (best.weight < 1.5) return null; // near-monochrome cover: keep the section's default color
  const hue = ((Math.atan2(best.y, best.x) * 180) / Math.PI + 360) % 360;
  const saturation = Math.min(0.85, Math.max(0.55, best.s / best.weight));
  return hslToHex(hue, saturation, 0.68);
}

const previous = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) : {};
const next = {};
const jobs = [];

for (const collection of COLLECTIONS) {
  const dir = join('src/content', collection);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter(name => name.endsWith('.md'))) {
    const key = `${collection}/${file.replace(/\.md$/, '')}`;
    const cover = readCover(join(dir, file));
    if (!/^https?:\/\//.test(cover)) continue;
    const known = previous[key];
    if (!force && known && known.cover === cover) next[key] = known;
    else jobs.push({ key, cover });
  }
}

let done = 0, failed = 0;
async function worker() {
  for (;;) {
    const job = jobs.shift();
    if (!job) return;
    try {
      const response = await fetch(smallVariant(job.cover), { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const color = await accentFor(Buffer.from(await response.arrayBuffer()));
      next[job.key] = { cover: job.cover, color };
      done++;
    } catch {
      failed++; // not recorded, so the next run retries it
    }
  }
}

const total = jobs.length;
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

mkdirSync('src/data', { recursive: true });
const sorted = Object.fromEntries(Object.keys(next).sort().map(key => [key, next[key]]));
writeFileSync(OUT_FILE, `${JSON.stringify(sorted, null, 1)}\n`);
console.log(`cover-colors: ${Object.keys(sorted).length} entries (${done} extracted, ${failed} failed, ${total - done - failed} skipped of ${total} new).`);
