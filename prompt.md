Mình muốn bạn dựng cho mình một personal media hub blog tên "mediaVault" bằng Astro, deploy lên Cloudflare Pages, kết nối với Obsidian vault của mình. Đây là yêu cầu chi tiết:

## Tổng quan
- Blog cá nhân tập hợp review/tracking game, anime, film
- Dữ liệu lưu dưới dạng file Markdown (.md) — chính là "database"
- Không cần server, không cần database truyền thống
- Deploy miễn phí trên Cloudflare Pages
- Mình đã có domain riêng trên Cloudflare

## Tech stack
- Astro (latest) — static site generator
- Vanilla CSS (dark theme, không dùng Tailwind)
- TypeScript cho content collections
- Jikan API (MAL, miễn phí không cần key) cho anime data
- TMDB API (miễn phí, cần key) cho film data

## Giao diện yêu cầu
- Dark theme chủ đạo (#0a0a14 background)
- Font: DM Sans (body) + Space Mono (monospace/labels)
- Mỗi loại media có màu riêng:
  - Anime: tím (#A78BFA)
  - Game: xanh lá (#34D399)
  - Film: cam (#FB923C)
- Card grid responsive với cover art, rating sao, genre, năm
- Hover animation mượt trên card (translateY + scale cover)
- Badge hiển thị status (đang xem/chơi, đã xong, dự định)
- Pulse animation cho items đang active (watching/playing)

## Cấu trúc trang
1. **Trang chủ (/)**: 
   - "Now active" section — hiển thị anime đang xem, game đang chơi
   - Stats tổng hợp (số lượng anime/game/film/total)
   - "Recently added" — grid 8 items mới nhất từ tất cả collections
   
2. **Trang Anime (/anime/)**: Grid tất cả anime, sort theo ngày thêm
3. **Trang Games (/games/)**: Grid tất cả games
4. **Trang Films (/films/)**: Grid tất cả films
5. **Trang chi tiết (/anime/[slug], /games/[slug], /films/[slug])**: 
   - Cover lớn bên trái + thông tin bên phải
   - Badge type + status
   - Star rating + score number
   - Metadata (genre, year, studio/director, episodes/platform)
   - Nội dung review từ Markdown

## Content Collections (Astro Content Layer)
Tạo 3 collections với schema:

**anime** (src/content/anime/):
```
title: string (required)
mal_id: number (optional — dùng để fetch data từ Jikan API)
rating: number 0-10
genre: string
year: number
studio: string
status: enum [watching, completed, plan, dropped]
episodes: number (optional)
cover: string URL (optional)
date: date
```

**games** (src/content/games/):
```
title: string (required)
rating: number 0-10
genre: string
year: number  
studio: string (developer)
status: enum [playing, completed, plan, dropped]
platform: string (PC, PS5, Switch, Xbox)
cover: string URL (optional)
date: date
```

**films** (src/content/films/):
```
title: string (required)
tmdb_id: number (optional — dùng để fetch data từ TMDB API)
rating: number 0-10
genre: string
year: number
director: string
status: enum [watched, plan]
cover: string URL (optional)
date: date
```

## Script sync MAL (quan trọng)
Tạo script `src/scripts/sync-mal.mjs` làm các việc sau:
1. Nhận MAL username làm parameter
2. Gọi Jikan API v4: `https://api.jikan.moe/v4/users/{username}/animelist?status=watching` (và completed, plan_to_watch)
3. Với mỗi anime trong list, tạo/cập nhật file .md trong src/content/anime/ với:
   - Frontmatter đầy đủ (title, mal_id, rating, genre, year, studio, status, episodes, cover, date)
   - Nếu file đã tồn tại (match theo mal_id hoặc slug) → chỉ update frontmatter, KHÔNG ghi đè body (giữ nguyên review của mình)
   - Nếu file chưa tồn tại → tạo mới với body rỗng
4. Rate limit: sleep 1 giây giữa mỗi request (Jikan giới hạn)
5. Thêm npm script: `"sync-mal": "node src/scripts/sync-mal.mjs"`

Tương tự tạo `src/scripts/sync-tmdb.mjs` cho phim (cần TMDB_API_KEY từ env).

## Script fetch metadata
Tạo script `src/scripts/fetch-media-data.mjs`:
- Quét tất cả file .md trong content/
- Nếu file có mal_id nhưng chưa có cover → gọi Jikan API lấy cover
- Nếu file có tmdb_id nhưng chưa có cover → gọi TMDB API lấy cover
- Update frontmatter, giữ nguyên body
- npm script: `"fetch-data": "node src/scripts/fetch-media-data.mjs"`

## GitHub Actions — Auto sync hàng ngày
Tạo `.github/workflows/sync.yml`:
- Cron chạy mỗi ngày lúc 6h sáng UTC+7
- Steps: checkout → setup node → npm install → npm run sync-mal → npm run fetch-data → git commit & push nếu có thay đổi
- Cần secrets: MAL_USERNAME, TMDB_API_KEY

## Deploy config
- Tạo file `wrangler.toml` hoặc config phù hợp cho Cloudflare Pages
- astro.config.mjs:
  ```
  site: 'https://domain-cua-minh.com'
  base: '/'
  ```
- Cloudflare Pages build settings: command `npm run build`, output `dist`

## Sample content
Tạo ít nhất 2 file mẫu cho mỗi collection (6 file tổng) với data thật từ các title phổ biến (Dandadan, Frieren, Elden Ring Nightreign, Baldur's Gate 3, Dune Part Two, Oppenheimer...). Mỗi file có đầy đủ frontmatter + vài dòng review mẫu bằng tiếng Việt.

## Kết nối Obsidian
Thêm hướng dẫn trong README về cách symlink folder `src/content` vào Obsidian vault để mình viết bài trực tiếp trong Obsidian.

## Lưu ý quan trọng
- Responsive design — mobile friendly
- Lazy loading ảnh cover
- SEO cơ bản (meta tags, Open Graph)
- 404 page
- Navigation sticky header
- Nút "Back to list" trong trang chi tiết
- Tất cả text UI bằng tiếng Việt
- File README.md hướng dẫn chi tiết bằng tiếng Việt (cách cài, thêm bài, sync MAL, deploy Cloudflare Pages)
