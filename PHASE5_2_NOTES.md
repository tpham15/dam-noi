# Phase 5.2 — Pilot UX Hardening

## Goal

Giảm ma sát trước pilot, bám theo senior UX review. Không thêm learning feature/LMS mới.

## P0 implemented

### 1. Bulk student creation + printable login cards

Teacher Class Detail có hai chế độ:

- `⚡ Thêm cả lớp`: dán mỗi dòng một tên, tối đa 60 em/lần.
- `+ Thêm 1 em`: giữ flow cũ cho trường hợp lẻ.

Backend endpoint mới:

```http
POST /api/classroom/classes/:id/students/bulk
```

Bulk insert chạy trong một PostgreSQL transaction. Backend tạo mã học sinh + PIN 4 số, chỉ lưu `pin_hash`; PIN plaintext chỉ trả lại một lần trong response để tạo login cards.

Login cards hiển thị:

- tên học sinh
- class code
- student code
- PIN
- one-PIN join link

Teacher có thể `Sao chép` hoặc `In / Lưu PDF`.

Với học sinh đã tồn tại từ phase trước, teacher có nút `🔑 Tạo lại thẻ`. Backend sinh PIN mới, hash lại trong DB và trả plaintext PIN đúng một lần; PIN cũ ngừng hoạt động.

### 2. One-PIN join link

Education route mới:

```text
/join/:classCode/:studentCode
```

Khi mở link này, class code + student code đã được prefill/ẩn khỏi form. Student chỉ nhập PIN.

Student auth token vẫn được lưu trong `localStorage`; backend token TTL giữ 90 ngày để giảm login lặp lại trên thiết bị quen.

Login error đổi sang message thân thiện:

```text
Mã chưa đúng rồi — kiểm tra lại giúp Toki nhé!
```

### 3. Clear mic state pattern — cả Speaking + Education

Ba trạng thái:

```text
Idle       → coral → Bấm mic để nói
Recording  → pulse → 🔴 Đang ghi… bấm lại để gửi
Processing → gray + spinner → Toki đang nghe…
```

Processing button bị disabled, chặn double tap trong STT/AI round trip.

Speaking app thêm first-use mic tooltip:

```text
Bấm đây rồi nói tiếng Anh nhé!
```

Tooltip chỉ hiện đến lần user bắt đầu ghi âm đầu tiên trên thiết bị.

### 4. Mission Builder Quick Mode

Default input chỉ còn:

```text
Hôm nay lớp đang học chủ đề gì?
[ At the restaurant ]

✨ Tạo mission
```

Vocabulary / target patterns / mission type / duration / teacher note được gập trong `Tuỳ chọn nâng cao`.

Review draft và teacher override vẫn giữ nguyên.

## P1 implemented

### Teacher onboarding checklist

Class Detail hiện checklist đến khi teacher hoàn tất:

1. ✓ Tạo lớp
2. Thêm học sinh
3. Tạo mission đầu
4. Giao bài

Copy nhấn mạnh mục tiêu pilot: first assignment < 10 phút.

### Kids target pressure reduced

Trong mission chat Kids:

- chỉ tối đa 3 target vocab
- label thành `💡 Toki gợi ý`
- không hiện pattern target
- không hiện target coverage % ở 7-day student journey
- finish screen Kids không hiện target ratio

Backend vẫn track target metrics cho teacher.

### Early finish clarity

- chưa đạt: `Kết thúc sớm` dạng phụ
- đạt: `Hoàn thành 🎉`
- nếu < 2 lượt, kết thúc sớm có confirm nhẹ

### Parent report hierarchy

Parent report dẫn bằng `messageVi`, sau đó mới đến KPI.

`targetCoveragePercent` không show trực tiếp dưới dạng %; UI chuyển thành phrase đời thường như `Đã dùng phần lớn từ cô giao`.

`nextStepVi` được đưa lên trước danh sách mission.

### Teacher actionable insight

Danh sách `chưa có speaking trong 7 ngày` có nút `Sao chép tin nhắn nhắc` để teacher paste vào Zalo/group chat; chưa tích hợp messaging platform trước pilot.

Assignment result nổi bật learner achievement bên cạnh AI teacher note.

### Single-center simplification

Nếu teacher chỉ thuộc 1 center, dropdown center được ẩn; chỉ hiện tên center.

## Pilot UX analytics

Table mới:

```text
pilot_ux_events
```

Chỉ lưu event metadata, không lưu transcript/audio/PIN.

Tracked events:

- teacher_portal_open
- center_created
- class_created
- students_added
- mission_generated
- assignment_created
- student_login_success (`manual` / `join_link`)
- student_mission_opened
- student_mission_finished
- parent_report_open

Founder endpoint vẫn là:

```http
GET /api/admin/pilot?days=7
x-admin-key: ...
```

`ux` mới gồm:

- `medianTimeToFirstAssignmentSeconds`
- `studentLoginSuccesses`
- `studentLoginViaJoinLink`
- `studentMissionOpens`
- `studentMissionFinishes`
- `parentReportOpens`
- event map

## Explicitly NOT added

- Zalo/email automation
- QR-code dependency
- parent account/app
- LMS/course content
- ranking/leaderboard
- phoneme scoring
- new learning modes

Those stay out until pilot evidence asks for them.
