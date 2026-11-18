/**
 * spotify-auth.mjs — one-time Spotify login to get a refresh token for sync-spotify.
 *
 * 1. Create an app at https://developer.spotify.com/dashboard and add this Redirect URI:
 *      http://127.0.0.1:8888/callback
 * 2. Put SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env (gitignored).
 * 3. npm run spotify-auth   → open the printed link, log in, approve.
 *
 * The refresh token is written to .env as SPOTIFY_REFRESH_TOKEN. It is never printed.
 * Scopes are read-only: saved albums, liked songs, recently played, playlists.
 */

import fs from 'fs';
import http from 'http';
import crypto from 'crypto';

const PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
// Read-only. Playlist scopes let sync collect albums that live in playlists rather than "saved albums".
const SCOPES = ['user-library-read', 'user-read-recently-played', 'playlist-read-private', 'playlist-read-collaborative', 'user-top-read'];
const ENV_FILE = '.env';

const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error('Thiếu SPOTIFY_CLIENT_ID hoặc SPOTIFY_CLIENT_SECRET trong .env.');
  console.error('Mở .env và thêm 2 dòng:\n  SPOTIFY_CLIENT_ID=...\n  SPOTIFY_CLIENT_SECRET=...');
  process.exit(1);
}

function saveEnv(key, value) {
  const lines = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf-8').split(/\r?\n/) : [];
  const kept = lines.filter(line => line.trim() && !line.startsWith(`${key}=`));
  kept.push(`${key}=${value}`);
  fs.writeFileSync(ENV_FILE, `${kept.join('\n')}\n`);
}

const state = crypto.randomBytes(16).toString('hex');
const authorizeUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
  response_type: 'code',
  client_id: SPOTIFY_CLIENT_ID,
  scope: SCOPES.join(' '),
  redirect_uri: REDIRECT_URI,
  state,
})}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== '/callback') {
    res.writeHead(404).end();
    return;
  }

  const finish = (status, message) => {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<p style="font:16px system-ui;padding:24px">${message}</p>`);
  };

  if (url.searchParams.get('state') !== state) return finish(400, 'Sai state, hãy chạy lại npm run spotify-auth.');
  if (url.searchParams.get('error')) {
    finish(400, `Spotify báo lỗi: ${url.searchParams.get('error')}`);
    server.close();
    process.exitCode = 1;
    return;
  }

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: REDIRECT_URI }),
    });
    if (!tokenRes.ok) throw new Error(`HTTP ${tokenRes.status}`);
    const json = await tokenRes.json();
    if (!json.refresh_token) throw new Error('không có refresh_token');
    saveEnv('SPOTIFY_REFRESH_TOKEN', json.refresh_token);
    finish(200, 'Xong! Đã lưu token vào .env. Bạn có thể đóng tab này.');
    console.log('✓ Đã lưu SPOTIFY_REFRESH_TOKEN vào .env. Giờ chạy: npm run sync-spotify -- --dry');
  } catch (err) {
    finish(500, `Đổi token thất bại: ${err.message}`);
    console.error(`Đổi token thất bại: ${err.message}`);
    process.exitCode = 1;
  }
  server.close();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Mở link này trong trình duyệt, đăng nhập Spotify và bấm Đồng ý (Agree):\n');
  console.log(authorizeUrl);
  console.log('\nĐang chờ Spotify gọi về http://127.0.0.1:8888/callback ...');
});
