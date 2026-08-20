# Dám Nói Classroom — Phase 3

## Scope
Phase 3 adds the **Teacher Mission Generator** on top of Phase 2. It does not change the Student mission engine, Azure voice path, or B2C experience.

Core workflow:

`Teacher input → AI Draft → Teacher Review/Edit → Save → Assign`

AI generation is deliberately **draft-only**. The generator never auto-publishes or auto-assigns a mission.

## What changed

### Backend
- New `backend/classroom/missionGenerator.js`
  - grade → age-band normalization
  - age-aware generation rules for Kids / Junior / Teen
  - structured Anthropic tool schema
  - teacher-target preservation
  - deterministic fallback draft if Anthropic is unavailable
  - mission save normalization / clamps
- New tests: `backend/classroom/missionGenerator.test.js`
- `npm run test:classroom` now runs both Phase 2 prompt tests and Phase 3 generator tests.
- New teacher APIs:
  - `POST /api/classroom/missions/generate` — returns draft only
  - `POST /api/classroom/missions` — save reviewed mission
  - `PUT /api/classroom/missions/:id` — edit center-owned mission only before it has been assigned
- New DB helpers:
  - `createMission`
  - `getOwnedMission`
  - `updateMission`
- Center-created missions are listed before global seed missions.

### Teacher UI
Inside a class, teacher can click **✨ Tạo bằng AI** and provide:
- Topic
- Vocabulary
- Target patterns
- Mission type
- Duration
- Optional note to AI

Draft review supports editing:
- Mission title
- Description
- Learning objective
- Mission type
- Target vocabulary
- Target patterns
- English opening
- Vietnamese help translation
- AI role
- Scene prompt
- Target turns
- Target speaking seconds
- Difficulty

Actions:
- **Lưu & giao bài**
- **Lưu vào thư viện**
- **Generate lại**

Saved center missions are labelled `⭐ Tự tạo`; seed missions remain labelled `Mẫu`.

## Important guardrails

### Teacher controls curriculum
If teacher supplies vocabulary or patterns, AI must preserve those exact target items. It may design a scenario around them, but may not silently replace the curriculum target.

If targets are blank, AI may suggest age-appropriate targets.

### Draft-first
`/missions/generate` writes nothing to the database. A teacher must explicitly save after reviewing the draft.

### Multi-tenant protection
Generation/save/update all verify:
- Google teacher authentication
- center membership
- class ownership unless center admin

Student tokens cannot use these routes.

### Age/grade cannot be spoofed by draft
The server derives grade and age band from the selected class when generating and saving. AI/client cannot change a Grade 3 mission into Teen content by sending another age band.

### Assigned missions are immutable
Once a mission has an assignment, `PUT /api/classroom/missions/:id` rejects edits. This prevents historical/in-progress homework from changing under students. Create a new mission version instead.

### AI outage fallback
If `ANTHROPIC_API_KEY` is missing or generation fails, the endpoint returns a conservative deterministic draft with `meta.source = "fallback"`. Teacher can edit it and continue working.

## Manual test flow

1. Start backend/frontend using Phase 2 environment variables.
2. Go to `/teacher` and login with Google.
3. Open a Grade 6 class.
4. Click **✨ Tạo bằng AI**.
5. Enter:
   - Topic: `At the Restaurant`
   - Vocabulary: `noodles`, `chicken`, `juice`, `delicious`
   - Pattern: `I'd like...`
   - Mission type: `Role-play`
   - Duration: `4 phút`
6. Click **Generate Mission Draft**.
7. Verify the draft still contains the exact teacher vocabulary/pattern.
8. Edit at least the title or opening line.
9. Click **Lưu & giao bài**.
10. Login at `/student` as a student in that class.
11. Verify the new mission appears and runs through the existing Phase 2 age-aware mission engine.
12. Complete it and verify assignment results in Teacher Portal.

## Automated validation run

```bash
cd backend
npm run test:classroom
node --check server.js
node --check classroom/classroomDb.js
node --check classroom/missionGenerator.js
```

Expected:

- `Classroom prompt tests passed: Kids / Junior / Teen`
- `Mission generator tests passed: input guardrails / target preservation / save normalization`

Frontend JSX was parsed with the installed TypeScript JSX parser for:
- `TeacherApp.jsx`
- `StudentApp.jsx`
- `App.jsx`

A full Vite build could not be completed in this execution environment because frontend dependencies are not available from the local npm cache. Run a clean install/build on the deployment machine:

```bash
cd frontend
npm ci
npm run build
```

## Non-goals in Phase 3
- textbook/PDF import
- automatic curriculum mapping
- mission marketplace
- parent reports
- bulk assignment scheduling
- mission version-history UI
- auto-grading/pronunciation scoring

Those remain later phases. Phase 3 is intentionally only the teacher-controlled mission creation workflow.
