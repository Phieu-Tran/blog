# mediaVault — Personal Media Hub

Blog cá nhân tập hợp review game, anime, film từ Obsidian vault, tự động kéo metadata từ MyAnimeList & TMDB, deploy trên Cloudflare Pages.

## Yêu cầu

- **Node.js** 18+ → [Tải tại đây](https://nodejs.org/)
- **Git** → [Tải tại đây](https://git-scm.com/)
- **GitHub account** → [Đăng ký miễn phí](https://github.com/)
- **TMDB API key** (miễn phí, optional) → [Đăng ký](https://www.themoviedb.org/settings/api)

## Hướng dẫn từng bước

### Bước 1: Cài đặt project

```bash
cd media-vault
npm install
```

### Bước 2: Chạy thử trên máy

```bash
npm run dev
```

Mở trình duyệt tại `http://localhost:4321/` để xem site.

### Bước 3: Thêm bài viết mới

Tạo file `.md` trong thư mục tương ứng:

**Thêm anime** → `src/content/anime/ten-anime.md`

```markdown
---
title: "Tên Anime"
mal_id: 12345
rating: 8.5
genre: "Action, Drama"
year: 2025
studio: "Studio Name"
status: watching
episodes: 24
cover: "link-ảnh"
date: 2025-03-30
---

Nội dung review của bạn ở đây.
```

**Thêm game** → `src/content/games/ten-game.md`

```markdown
---
title: "Tên Game"
rating: 9.0
genre: "Action RPG, Soulslike"
year: 2025
studio: "Developer Name"
status: playing
platform: "PC"
cover: "link-ảnh"
date: 2025-03-30
---

Review game ở đây...
```

**Thêm film** → `src/content/films/ten-film.md`

```markdown
---
title: "Tên Film"
tmdb_id: 693134
rating: 8.5
genre: "Sci-Fi, Drama"
year: 2024
director: "Director Name"
status: watched
cover: "link-ảnh"
date: 2025-03-30
---

Review phim ở đây...
```

### Bước 4: Sync anime từ MyAnimeList (optional)

```bash
# Sync toàn bộ anime list từ MAL
npm run sync-mal -- YOUR_MAL_USERNAME
```

Script sẽ tự tạo file .md cho mỗi anime trong list, kéo cover + metadata từ Jikan API. Nếu file đã tồn tại, chỉ update frontmatter, giữ nguyên review.

### Bước 5: Sync film từ TMDB (optional)

```bash
# Set API key và chạy
export TMDB_API_KEY=your_api_key_here
npm run sync-tmdb

# Nếu có TMDB list:
export TMDB_LIST_ID=your_list_id
npm run sync-tmdb
```

### Bước 6: Fetch metadata bổ sung (optional)

```bash
npm run fetch-data
```

Quét các file có `mal_id`/`tmdb_id` nhưng chưa có cover → tự động kéo từ API.

### Bước 7: Kết nối với Obsidian

Symlink folder content vào Obsidian vault:

```bash
# macOS/Linux:
ln -s /đường-dẫn/media-vault/src/content /đường-dẫn/obsidian-vault/media-vault

# Windows (CMD as Admin):
mklink /D "C:\obsidian-vault\media-vault" "C:\media-vault\src\content"
```

Viết bài trong Obsidian → file nằm trong project → push lên GitHub là xong.

### Bước 8: Deploy lên Cloudflare Pages

**Cách 1: Connect trực tiếp GitHub (khuyến nghị)**

1. Vào [Cloudflare Dashboard](https://dash.cloudflare.com/) → Pages → Create a project
2. Kết nối GitHub repo `media-vault`
3. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Thêm custom domain trong Pages settings nếu có

**Cách 2: Deploy qua GitHub Actions**

1. Tạo API token trên Cloudflare: My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"
2. Trong GitHub repo → Settings → Secrets and variables → Actions:
   - `CLOUDFLARE_API_TOKEN`: API token vừa tạo
   - `CLOUDFLARE_ACCOUNT_ID`: tìm trong Cloudflare Dashboard → bên phải
3. Push code lên, workflow tự deploy

**Auto sync hàng ngày:**

Trong GitHub repo → Settings → Secrets and variables:
- Variables: `MAL_USERNAME` = username MAL của bạn
- Variables: `TMDB_LIST_ID` = ID list TMDB (optional)
- Secrets: `TMDB_API_KEY` = API key TMDB

Workflow `sync.yml` sẽ chạy mỗi ngày lúc 6h sáng (UTC+7), auto sync và commit.

**Mỗi khi thêm bài mới:**

```bash
git add .
git commit -m "Thêm review Dandadan"
git push
```

Site tự động cập nhật trong ~1 phút.

## Cấu trúc project

```
media-vault/
├── src/
│   ├── content/           ← BÀI VIẾT CỦA BẠN Ở ĐÂY
│   │   ├── anime/         ← File .md cho anime
│   │   ├── games/         ← File .md cho game
│   │   └── films/         ← File .md cho film
│   ├── components/        ← UI components
│   ├── layouts/           ← Layout chung
│   ├── pages/             ← Các trang web
│   ├── styles/            ← CSS
│   └── scripts/           ← Script sync & fetch
├── public/                ← Static files (favicon, ảnh...)
├── .github/workflows/     ← Deploy + auto sync
├── astro.config.mjs       ← Config (sửa domain ở đây)
└── package.json
```

## Tìm MAL ID / TMDB ID ở đâu?

- **MAL ID**: Vào MyAnimeList, tìm anime → URL `myanimelist.net/anime/55701/Dandadan` → ID là `55701`
- **TMDB ID**: Vào themoviedb.org, tìm phim → URL `themoviedb.org/movie/693134` → ID là `693134`

## FAQ

**Q: Có tốn tiền không?**
A: Hoàn toàn miễn phí. Cloudflare Pages free, API miễn phí, không cần server.

**Q: Có cần biết code không?**
A: Chỉ cần biết viết Markdown và dùng Git cơ bản.

**Q: Bao nhiêu bài thì site chậm?**
A: Static site nên rất nhanh. Vài nghìn bài vẫn ok.

**Q: Muốn thêm comment?**
A: Thêm Giscus (miễn phí, dùng GitHub Discussions).
