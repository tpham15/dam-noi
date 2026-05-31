# Chạy thử Dám Nói trên máy (local) — hướng dẫn chi tiết

Bạn sẽ chạy 2 thứ cùng lúc, trong **2 cửa sổ Terminal**:
- **Backend** (cổng 8787) — giữ API key, gọi Claude, lưu dữ liệu.
- **Frontend** (cổng 5173) — giao diện, gọi sang backend.

Frontend gọi `/api/...`, Vite tự chuyển tiếp sang backend, nên key KHÔNG bao giờ lộ ra trình duyệt.

---

## 0. Chuẩn bị (làm 1 lần)

**a) Cài Node.js (>= 18).** Tải bản LTS ở https://nodejs.org. Kiểm tra:
```bash
node -v        # ví dụ v20.x
npm -v
```

**b) Lấy Anthropic API key.** Vào https://console.anthropic.com → API Keys → tạo key (dạng `sk-ant-...`). Cần nạp một ít credit để gọi được model.

**c) Lấy 2 thư mục này về cùng một chỗ**, ví dụ:
```
damnoi/
  backend/     (server.js, db.js, prompt.js, package.json, README.md)
  frontend/    (index.html, vite.config.js, package.json, src/...)
```

---

## 1. Chạy BACKEND (cửa sổ Terminal #1)

```bash
cd damnoi/backend
npm install
```
> `better-sqlite3` cần biên dịch — nếu báo lỗi build, xem mục Khắc phục sự cố bên dưới.

Khởi động server, gắn API key vào ngay câu lệnh:

**macOS / Linux:**
```bash
ANTHROPIC_API_KEY=sk-ant-... node server.js
```
**Windows (PowerShell):**
```powershell
$env:ANTHROPIC_API_KEY="sk-ant-..."; node server.js
```

Thấy dòng này là OK:
```
Dám Nói backend on http://localhost:8787
```
**Để nguyên cửa sổ này chạy**, mở cửa sổ Terminal mới cho frontend.

### Kiểm tra nhanh backend bằng curl (không bắt buộc)
```bash
# 1) Mở một buổi mới — lấy greeting + streak
curl -s -X POST http://localhost:8787/api/session/start \
  -H "Content-Type: application/json" -d '{}'

# 2) Thử một lượt nói qua endpoint test (không cần userId)
curl -s -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"[SESSION_START] [TOPIC: Free talk]"},{"role":"assistant","content":"Hi! I am Toki. How are you today?"},{"role":"user","content":"I fine. I go to work today"}]}'
```
Lượt 2 trả về JSON có `spoken_reply`, `vi_translation`, `scaffold_chips`, `errors_noticed`...
Nếu thấy JSON đó → backend + Claude chạy ngon.

---

## 2. Chạy FRONTEND (cửa sổ Terminal #2)

```bash
cd damnoi/frontend
npm install
npm run dev
```
Thấy dòng `Local: http://localhost:5173/` → mở link đó trong **Chrome** (Chrome hỗ trợ mic tốt nhất).

Giờ bạn có thể: bấm Bắt đầu → chọn chủ đề → nói (bấm mic) hoặc gõ. Mỗi câu của Toki có nút Nghe lại / Dịch, có nút Xong để xem màn kết thúc.

> Mic chỉ chạy trên `http://localhost` (được coi là an toàn) hoặc HTTPS. Nếu trình duyệt không hỗ trợ, cứ gõ chữ — đầy đủ tính năng.

---

## 3. Thử "đường dây nóng" tiếng Việt & các ca khó
Gõ thử để xem cơ chế hoạt động:
- `On weekend I go to... cửa hàng tiện lợi` → Toki cấp từ tiếng Anh, đi tiếp.
- `tôi dở quá` → Toki trấn an, hạ chuẩn, đưa một việc nhỏ dễ.
- Để yên ~27 giây không nhập gì → Toki tự thả "phao" theo nấc thang.
- Nói một tràng dài, nhiều lỗi → Toki khen "nói liền mạch", không sửa giữa chừng; lỗi nằm im trong nút Xem lại.

---

## Khắc phục sự cố

- **`npm install` ở backend lỗi build `better-sqlite3`:** cần công cụ biên dịch.
  - macOS: `xcode-select --install`
  - Windows: cài "Desktop development with C++" (Visual Studio Build Tools), rồi `npm install` lại.
  - Ngại cài? Tạm thời có thể bỏ phần lưu DB và chỉ dùng endpoint `/api/chat` (không đụng tới `db.js`) để test giao diện — nói mình biết, mình tách ra cho.
- **Frontend chạy nhưng Toki không trả lời / lỗi "api":** kiểm tra Terminal #1 còn chạy không, và bạn đã gắn `ANTHROPIC_API_KEY` đúng chưa. Xem log lỗi ở cửa sổ backend.
- **`429` hoặc lỗi credit:** tài khoản Anthropic chưa có credit hoặc bị giới hạn tần suất.
- **CORS / không gọi được /api:** đảm bảo bạn mở `http://localhost:5173` (không phải mở file index.html trực tiếp), vì proxy nằm trong Vite dev server.
- **Mic không bật:** dùng Chrome, cho phép quyền micro, và phải là `localhost`.

---

## Sơ đồ luồng
```
Trình duyệt (5173)
   │  fetch("/api/chat", {messages})
   ▼
Vite dev proxy  ──►  Backend (8787)  ──►  Claude API
                       (giữ API key)
```

## Khi muốn lên bản "thật" hơn
Endpoint `/api/chat` là bản test không lưu gì. Khi cần streak/lịch sử thật, đổi frontend
sang dùng `/api/session/start` + `/api/turn` + `/api/review` (đã có sẵn trong `server.js`,
mô tả trong `backend/README.md`).
