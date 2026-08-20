# Dám Nói Classroom — Phase 4.1 Pilot Hardening

Phase 4.1 intentionally adds **no new learning feature**. It hardens Phase 4 for a real-center pilot.

## What changed

### 1) Server-side AI mission-generation limits

`POST /api/classroom/missions/generate` is now protected per teacher:

- default: **10 AI generations / 1 hour**
- default: **30 AI generations / 24 hours**
- limits are enforced in Postgres with an advisory transaction lock, so simultaneous requests cannot race past the quota
- HTTP `429` is returned when the quota is reached
- limits are configurable by env

```env
AI_MISSION_GEN_HOURLY_LIMIT=10
AI_MISSION_GEN_DAILY_LIMIT=30
```

The limits count actual AI-call reservations. A cached result does not consume another call.

### 2) Duplicate/cost protection

Identical teacher + class + normalized mission input is cached for 5 minutes by default.

```env
AI_MISSION_GEN_CACHE_MINUTES=5
```

Normal `Generate` reuses the cached draft. `Generate lại` sends `forceNew=true`, intentionally requesting a new variation and consuming quota.

The frontend also uses an immediate `useRef` generation lock in addition to the disabled button, preventing a true double-submit before React has re-rendered.

### 3) Claude usage/error/latency logging

All important Anthropic calls now log into `ai_usage_events`:

- `consumer_turn`
- `classroom_turn`
- `classroom_summary`
- `mission_generate`
- `dev_chat`

Logged fields:

- endpoint
- model
- center/user identifiers (when applicable)
- status: reserved / success / error
- input tokens
- output tokens
- latency ms
- optional estimated USD cost
- truncated error message

No transcript or prompt body is stored in this telemetry table.

### 4) Cost estimates are configuration-driven

Provider pricing changes. Phase 4.1 deliberately does **not** hard-code a token price.

Set the current rates yourself, in USD per 1,000,000 tokens:

```env
AI_INPUT_COST_PER_MTOK=0
AI_OUTPUT_COST_PER_MTOK=0
```

If both are `0`, token counts and latency are still recorded but the dashboard reports `costConfigured=false`.

### 5) AI timeout

Anthropic calls are aborted instead of hanging indefinitely:

```env
AI_TIMEOUT_MS=25000
```

Valid server range is clamped to 5–60 seconds.

### 6) Founder pilot analytics

New founder-only endpoint:

```http
GET /api/admin/pilot?days=7
Header: x-admin-key: <ADMIN_KEY>
```

It returns aggregate, non-PII metrics such as:

- active centers / teachers / students / classes
- missions saved
- assignments created
- active teachers
- active students
- assignment slots (`student × assignment`)
- completed assignment slots
- assignment completion rate
- attempts started/completed
- actual speaking seconds
- average speaking seconds / active student
- teachers who created 2+ custom missions in the period (`teacherUnpromptedReuseCount`)
- parent-report links created
- STT attempts / retries / retry rate / low-confidence count
- AI calls / input tokens / output tokens / latency / errors / estimated cost

Example:

```bash
curl -H "x-admin-key: YOUR_ADMIN_KEY" "https://YOUR-BACKEND/api/admin/pilot?days=7"
```

Important: `teacherUnpromptedReuseCount` is only a **proxy** for reuse. During the first pilot, still observe whether the teacher creates the second mission without you prompting them.

### 7) Frontend debt reduction

`TeacherApp.jsx` had the highest-churn Mission Builder embedded in a very dense file.

It is now extracted to:

```text
frontend/src/teacher/MissionBuilder.jsx
```

The component is formatted/readable and owns:

- generator input
- double-submit guard
- generation quota display
- cache/source display
- draft review/edit
- save / save+assign / regenerate

This is intentionally **not** a full frontend rewrite. Remaining dense components should only be refactored when pilot bugs force us to touch them.

## New database tables

Created automatically on backend boot:

```text
ai_usage_events
mission_generation_cache
```

No manual SQL migration is required when the normal startup chain runs:

```text
db.init()
→ classroom.initClassroom()
→ pilot.initPilotMetrics()
→ app.listen()
```

## Required / recommended env for pilot

```env
# existing
DATABASE_URL=...
ANTHROPIC_API_KEY=...
TOKI_MODEL=claude-haiku-4-5-20251001
AUTH_SECRET=...
GOOGLE_CLIENT_ID=...
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=southeastasia
STT_CONFIDENCE_THRESHOLD=0.55

# Phase 4.1
ADMIN_KEY=<long-random-founder-secret>
AI_MISSION_GEN_HOURLY_LIMIT=10
AI_MISSION_GEN_DAILY_LIMIT=30
AI_MISSION_GEN_CACHE_MINUTES=5
AI_TIMEOUT_MS=25000
AI_INPUT_COST_PER_MTOK=0
AI_OUTPUT_COST_PER_MTOK=0
```

Generate secrets, for example:

```bash
openssl rand -hex 32
```

Do not commit real secrets to `.env.example`.

## Pilot smoke test

### Teacher

1. Login at `/teacher`.
2. Open a Grade 5–8 class.
3. Open `Tạo bằng AI`.
4. Generate `At the Restaurant` once.
5. Close/reopen generator and submit identical inputs: verify response reports `source=cache` / UI says cached and no new AI quota is consumed.
6. In review, click `Generate lại`: verify a new AI call is used and quota increases.
7. Save + assign.

### Student

1. Login at `/student`.
2. Start the assigned mission.
3. Speak 5–6 turns.
4. Finish.
5. Verify speaking duration and result appear in teacher report.

### Founder

Open:

```text
/api/admin/pilot?days=7 with header `x-admin-key`
```

Verify:

- activeStudents > 0
- attemptsStarted > 0
- actualSpeakingSeconds > 0
- ai.inputTokens / outputTokens increase after Claude use
- sttAttemptCount increases after voice use

## Pilot KPI watchlist

Do not add product features to “fix” these numbers before observing the real behavior.

Primary:

- teacher creates/assigns a second mission without founder prompting
- assignment completion rate
- actual speaking minutes / active student / week
- STT retry rate
- parent report link creation/use in the real center workflow

Initial warning thresholds:

- STT retry rate > 15%: investigate voice before adding learning features
- assignment completion < 50%: investigate homework/activation workflow
- teacher never creates a second mission: investigate teacher workflow/value proposition

## Validation performed in this delivery

- `node -c backend/server.js` ✅
- `node -c backend/classroom/classroomDb.js` ✅
- `node -c backend/classroom/pilotMetrics.js` ✅
- all frontend `src/*.js|jsx` parsed with Babel parser ✅
- Kids / Junior / Teen prompt tests ✅
- Mission Generator tests ✅
- Reporting/privacy tests ✅
- no new npm dependency added ✅

A full Vite production build still requires a clean frontend install on your Mac/CI because the execution environment used to patch this project does not have the complete platform-native npm dependency cache.

## Phase 4.1 stop condition

After this phase, do **not** build a Phase 5 from assumptions.

Run a real pilot:

```text
1 center
1 teacher
1 class
15–25 students
2 weeks
```

The next product phase should be based on observed pilot friction, not an imagined roadmap.
