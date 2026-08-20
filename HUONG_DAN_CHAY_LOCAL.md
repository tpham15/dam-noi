# Chạy local Dám Nói Phase 5.1 — 2 app, 1 backend

Phase 5.1 tách sản phẩm thành hai frontend độc lập:

- **Dám Nói — Speaking Practice**: `apps/speaking` — B2C, port `5173`.
- **Dám Nói Education**: `apps/education` — trung tâm/teacher/student/parent report, port `5174`.
- **Shared backend**: `backend` — Claude + Azure + PostgreSQL/Supabase, port `8787`.

Không còn thư mục `frontend/` hỗn hợp như Phase 4.1.

## 1. Backend

Tạo env:

```bash
cd backend
cp .env.example .env
```

Điền key/DB thật. Với Supabase, dùng connection string thật từ Dashboard; không để placeholder `localhost`.

Local startup:

```bash
npm ci
npm run start:local
```

`start:local` dùng `node --env-file=.env server.js`, nên `.env` được load tự động.

Backend OK khi thấy:

```text
Dám Nói backend on http://localhost:8787
```

Health check:

```bash
curl http://localhost:8787/api/health
```

## 2. Speaking Practice

Terminal mới:

```bash
cd apps/speaking
cp .env.example .env
npm ci
npm run dev
```

Mở:

```text
http://localhost:5173
```

Đây chỉ là app consumer. Không có Teacher/Student/Parent routes.

## 3. Dám Nói Education

Terminal thứ ba:

```bash
cd apps/education
cp .env.example .env
npm ci
npm run dev
```

Mở:

```text
http://localhost:5174
```

Routes:

```text
http://localhost:5174/           Education landing
http://localhost:5174/teacher   Teacher portal
http://localhost:5174/student   Student portal
http://localhost:5174/report/... Parent report
```

## 4. Chạy từ root

Sau khi đã `npm ci` trong từng app/backend, có thể dùng helper scripts:

```bash
npm run start:backend
npm run dev:speaking
npm run dev:education
```

Mỗi command chạy ở một Terminal riêng.

## 5. Supabase sanity check

Trước khi start backend, kiểm tra Node đang đọc đúng `.env`:

```bash
cd backend
node --env-file=.env -e '
const u=new URL(process.env.DATABASE_URL);
console.log("DB host:",u.hostname);
console.log("DB port:",u.port);
console.log("PGSSL:",process.env.PGSSL);
console.log("AUTH_SECRET:",process.env.AUTH_SECRET && !process.env.AUTH_SECRET.startsWith("replace-") ? "✅" : "❌");
console.log("ADMIN_KEY:",process.env.ADMIN_KEY && !process.env.ADMIN_KEY.startsWith("replace-") ? "✅" : "❌");
'
```

Nếu bạn dùng Supabase mà `DB host` vẫn là `localhost`, bạn đang sửa nhầm `.env` hoặc chưa thay placeholder.

## 6. Google OAuth local origins

Nếu Teacher Google Login được dùng local, Google OAuth client cần cho phép JavaScript origin:

```text
http://localhost:5173
http://localhost:5174
```

Production cần thêm origin của cả Speaking và Education.

## 7. Optional production CORS

Backend mặc định vẫn allow-all nếu `CORS_ORIGINS` để trống để không phá deploy cũ.

Khi production ổn định, nên set:

```env
CORS_ORIGINS=https://<speaking-domain>,https://<education-domain>
```

## 8. Build riêng

```bash
npm run build:speaking
npm run build:education
```

Hoặc chạy trong từng app:

```bash
cd apps/speaking && npm run build
cd apps/education && npm run build
```

Mỗi app tạo `dist/` riêng.
