import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'src', 'content');
const CACHE_DIR = path.join(ROOT, 'public', 'media-cache');
const MANIFEST_PATH = path.join(CACHE_DIR, 'manifest.json');
const IMAGE_URL_RE = /https?:\/\/[^\s"'<>)]*\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>)]*)?/gi;

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const checkOnly = args.has('--check') || !apply;
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

function sha1(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 18);
}

function extensionFor(url, contentType = '') {
  const fromPath = new URL(url).pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i)?.[1]?.toLowerCase();
  if (fromPath) return fromPath === 'jpeg' ? 'jpg' : fromPath;
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
}

function cachePathFor(url, contentType = '') {
  const { hostname } = new URL(url);
  const ext = extensionFor(url, contentType);
  const localDir = path.join(CACHE_DIR, hostname.replace(/^www\./, ''));
  const localFile = `${sha1(url)}.${ext}`;
  return {
    diskDir: localDir,
    diskPath: path.join(localDir, localFile),
    publicPath: `/media-cache/${hostname.replace(/^www\./, '')}/${localFile}`,
  };
}

async function listMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(fullPath);
    if (entry.isFile() && /\.mdx?$/i.test(entry.name)) return [fullPath];
    return [];
  }));
  return files.flat();
}

async function readManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function writeManifest(manifest) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function downloadImage(url) {
  const existing = manifest[url];
  if (existing?.path) {
    const diskPath = path.join(ROOT, 'public', existing.path.replace(/^\/+/, ''));
    try {
      await fs.access(diskPath);
      return existing.path;
    } catch {
      // Manifest exists but file is gone; download again.
    }
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Phieu.work image cache/1.0',
      Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Unexpected content-type ${contentType || 'unknown'}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const target = cachePathFor(url, contentType);
  await fs.mkdir(target.diskDir, { recursive: true });
  await fs.writeFile(target.diskPath, buffer);

  manifest[url] = {
    path: target.publicPath,
    bytes: buffer.length,
    contentType,
    cachedAt: new Date().toISOString(),
  };

  return target.publicPath;
}

const manifest = await readManifest();
const files = await listMarkdownFiles(CONTENT_DIR);
const remoteUrls = new Map();

for (const file of files) {
  const content = await fs.readFile(file, 'utf8');
  for (const match of content.matchAll(IMAGE_URL_RE)) {
    const url = match[0];
    if (!remoteUrls.has(url)) remoteUrls.set(url, new Set());
    remoteUrls.get(url).add(file);
  }
}

console.log(`Found ${remoteUrls.size} unique remote image URLs in content.`);

if (checkOnly) {
  const cached = [...remoteUrls.keys()].filter(url => manifest[url]?.path).length;
  console.log(`${cached} already mapped in ${path.relative(ROOT, MANIFEST_PATH)}.`);
  console.log('Run npm run cache-images to download and rewrite content to local /media-cache paths.');
  process.exit(0);
}

let downloaded = 0;
let rewritten = 0;
let failed = 0;
const urlToLocal = new Map();

for (const url of remoteUrls.keys()) {
  if (downloaded >= limit) break;
  try {
    const localPath = await downloadImage(url);
    urlToLocal.set(url, localPath);
    downloaded++;
    console.log(`cached ${downloaded}/${Math.min(remoteUrls.size, limit)} ${url} -> ${localPath}`);
  } catch (error) {
    failed++;
    console.warn(`failed ${url}: ${error.message}`);
  }
}

for (const file of files) {
  let content = await fs.readFile(file, 'utf8');
  let next = content;
  for (const [url, localPath] of urlToLocal) {
    next = next.split(url).join(localPath);
  }
  if (next !== content) {
    await fs.writeFile(file, next);
    rewritten++;
  }
}

await writeManifest(manifest);

console.log(`Done. Cached/mapped: ${urlToLocal.size}. Rewritten files: ${rewritten}. Failed: ${failed}.`);
