/**
 * Normalize game frontmatter after the source/platform split.
 *
 * source   = where the personal/library entry came from: steam, igdb, manual
 * platform = where the game runs: PC, PlayStation, Xbox, Nintendo, Multi-platform, ...
 */

import fs from 'fs';
import path from 'path';

const GAMES_DIR = path.resolve('src/content/games');

function parseFrontmatterBlock(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  return { frontmatter: match[1], body: match[2] };
}

function readValue(frontmatter, key) {
  const match = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(frontmatter);
  if (!match) return '';
  return match[1].trim().replace(/^"|"$/g, '');
}

function inferSource(frontmatter) {
  const platform = readValue(frontmatter, 'platform');
  if (readValue(frontmatter, 'steam_appid')) return 'steam';
  if (readValue(frontmatter, 'igdb_id') || platform === 'IGDB' || platform === 'Multi') return 'igdb';
  return 'manual';
}

function quoteYamlValue(value) {
  return /[:#,[\]{}]|\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function normalizePlatform(platform) {
  if (platform === 'Steam') return 'PC';
  if (platform === 'IGDB') return 'Unknown';
  if (platform === 'Multi') return 'Multi-platform';
  return platform;
}

function normalizeFrontmatter(frontmatter) {
  let next = frontmatter;

  if (!/^source:/m.test(next)) {
    const sourceLine = `source: ${inferSource(next)}`;
    if (/^status:/m.test(next)) {
      next = next.replace(/^(status:\s*.*)$/m, `$1\n${sourceLine}`);
    } else if (/^platform:/m.test(next)) {
      next = next.replace(/^(platform:\s*.*)$/m, `${sourceLine}\n$1`);
    } else {
      next = `${next}\n${sourceLine}`;
    }
  }

  const platform = readValue(next, 'platform');
  const normalizedPlatform = normalizePlatform(platform);
  if (normalizedPlatform && normalizedPlatform !== platform) {
    next = next.replace(/^platform:\s*.*$/m, `platform: ${quoteYamlValue(normalizedPlatform)}`);
  }

  return next;
}

function main() {
  if (!fs.existsSync(GAMES_DIR)) {
    console.log('No games directory found.');
    return;
  }

  let changed = 0;
  const files = fs.readdirSync(GAMES_DIR).filter(file => file.endsWith('.md'));
  for (const file of files) {
    const filepath = path.join(GAMES_DIR, file);
    const content = fs.readFileSync(filepath, 'utf-8');
    const parsed = parseFrontmatterBlock(content);
    if (!parsed) continue;

    const frontmatter = normalizeFrontmatter(parsed.frontmatter);
    const next = `---\n${frontmatter}\n---\n${parsed.body}`;
    if (next === content) continue;

    fs.writeFileSync(filepath, next);
    changed++;
  }

  console.log(`Normalized ${changed} game files.`);
}

main();
