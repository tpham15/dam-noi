# Dám Nói Classroom — 2-week Pilot Runbook

## Scope

- 1 center
- 1 teacher
- 1 class
- ideally 15–25 students
- Grade 4–8 preferred
- 2 weeks
- use the center's real curriculum; do not invent a special Dám Nói syllabus

## Before Day 1

- teacher can login
- class + students exist
- Azure STT/TTS verified on at least one iPhone and one Android/Chrome device available to the class
- one mission created from the exact current lesson
- founder has `ADMIN_KEY`

## Week 1

Teacher assigns 2 short missions.

Observe, do not coach excessively:

- time from opening teacher portal → assignment sent
- where teacher hesitates
- whether students understand how to start
- STT retries
- how many students finish without live help
- whether teacher opens results after completion

## Week 2

The key test: do not proactively create the next mission for the teacher.

Watch whether the teacher independently:

- opens the portal
- creates/reuses a mission
- assigns it
- checks results
- creates/shares a parent report

## Founder check once per day

```text
GET /api/admin/pilot?days=7
Header: x-admin-key: <ADMIN_KEY>
```

Track only a few numbers:

- activeTeachers
- activeStudents
- assignmentCompletionRatePercent
- avgSpeakingSecondsPerActiveStudent
- sttRetryRatePercent
- teacherUnpromptedReuseCount
- parentReportLinksCreated
- ai.errorCount

## Interviews

Teacher after week 1:

1. Phần nào làm cô/thầy mất thời gian nhất?
2. Nếu tuần sau không có tôi hỗ trợ, cô/thầy có tự giao bài này nữa không? Vì sao?
3. Dữ liệu nào thực sự giúp ích, dữ liệu nào không cần?
4. Nếu bỏ Dám Nói khỏi lớp tuần sau, cô/thầy sẽ tiếc điều gì nhất?

Students: keep it short.

1. Em có biết hôm nay phải làm gì ngay khi mở app không?
2. Có lúc nào app nghe sai làm em bực không?
3. Em thích nói với Toki hơn hay gửi recording cho cô? Vì sao?

Center owner / parent workflow:

1. Report này có đủ giá trị để gửi phụ huynh không?
2. Nếu có, trung tâm muốn gửi bao lâu một lần?
3. Điều gì trong report khiến phụ huynh hiểu “con đang tiến bộ” rõ nhất?

## Do not do during pilot

- do not add a new game because one child asks for it
- do not add full LMS features
- do not rewrite the dashboard mid-week unless the workflow is blocked
- do not change STT thresholds from one anecdote; inspect aggregate retry data
- do not measure success by compliments alone
