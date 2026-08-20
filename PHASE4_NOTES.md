# Dám Nói Classroom — Phase 4 Reports

Phase 4 is built on top of Phase 3 and adds reporting without changing the core mission/speaking engine.

## What changed

### 1. Student 7-day progress
`GET /api/classroom/student/home` now includes a privacy-safe progress object for the logged-in student.

Student Home shows:
- actual speaking time in the last 7 days
- completed missions
- practice sessions
- target-language coverage
- one positive achievement when available

### 2. Teacher class weekly insight
New endpoint:

`GET /api/classroom/classes/:id/report?days=7`

Shows:
- active students / total students
- actual speaking time
- student-mission completions
- current assignment completion rate
- target language that needs more practice
- students with no speaking practice in the period
- comparison with the previous period

There is deliberately **no student leaderboard/ranking**.

### 3. Teacher student progress report
New endpoint:

`GET /api/classroom/students/:id/progress?classId=...&days=7`

Teacher sees:
- speaking time
- missions completed
- practice sessions
- target coverage
- previous-period comparison
- recent mission results
- AI teacher notes already generated at mission finish
- positive learner achievements

### 4. Parent-friendly share report
Teacher can create a report snapshot from the student progress panel.

`POST /api/classroom/students/:id/reports/share`

Default expiry: 30 days. Maximum supported expiry: 90 days.

The backend creates a 24-byte random public token but stores **only SHA-256(token)** in the database. The public report is an immutable JSON snapshot.

Public endpoint:

`GET /api/classroom/reports/share/:token`

Frontend route:

`/report/:token`

The parent page includes:
- speaking time
- practice sessions
- completed missions
- target-language coverage
- recent mission summary
- positive achievements
- suggested next step
- all-time speaking summary
- print / Save PDF button

### Parent-report privacy boundary
The public snapshot intentionally does **not** contain:
- raw transcript
- raw audio
- grammar/error log
- teacher-only notes
- student code
- PIN / PIN hash
- email
- internal user IDs
- session IDs / attempt IDs

### 5. Report link revocation
Teacher can revoke an active share link.

`POST /api/classroom/reports/:id/revoke`

A teacher may revoke reports only for their own class. Center admins may revoke reports across the center.

Expired/revoked links return 404 and no snapshot.

## Database migration
`initClassroom()` automatically creates:

`report_shares`

Fields:
- id
- token_hash
- center_id
- class_id
- student_user_id
- created_by
- period_start
- period_end
- snapshot JSONB
- created_at
- expires_at
- revoked_at

No manual SQL migration is required with the current startup flow.

## New source files

- `backend/classroom/reporting.js`
- `backend/classroom/reporting.test.js`
- `frontend/src/reports/ParentReport.jsx`

## Test

Backend:

```bash
cd backend
npm ci
npm run test:classroom
npm start
```

`test:classroom` now covers:
- Kids / Junior / Teen prompts
- Mission Generator guardrails
- reporting period aggregation
- parent snapshot privacy boundary
- class insight aggregation

Frontend:

```bash
cd frontend
npm ci
npm run build
npm run dev
```

## Manual Phase 4 test flow

1. Teacher login at `/teacher`.
2. Open a class that already has student attempts.
3. Verify the “7 ngày gần đây” class card.
4. Click `📊 Báo cáo` on a student.
5. Verify speaking time / missions / target coverage / mission notes.
6. Click `Tạo link phụ huynh`.
7. Open the generated `/report/<token>` in an incognito browser without logging in.
8. Confirm the page shows only the snapshot and no transcript/login details.
9. Return to teacher portal and revoke the link.
10. Refresh the public link: it should return the expired/revoked error state.
11. Login as the student and verify “Hành trình speaking — 7 ngày của bạn”.

## Build validation in this delivery environment

Passed:
- `node --check backend/server.js`
- `node --check backend/classroom/classroomDb.js`
- `node --check backend/classroom/reporting.js`
- all JSX files parse with Babel parser
- `npm --prefix backend run test:classroom`
- no legacy `SpeechRecognition` references
- Netlify SPA fallback already supports direct `/report/:token` URLs

Full frontend `npm ci --offline` could not run because `yauzl-2.10.0.tgz` is not present in the environment npm cache. Run a normal `npm ci && npm run build` on Mac/CI with registry access.
