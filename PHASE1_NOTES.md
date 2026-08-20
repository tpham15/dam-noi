# Dám Nói Classroom — Phase 1 Foundation

Phase 1 is built directly on the Phase 0 source. The consumer Dám Nói app is preserved at `/`.

## New routes

- `/classroom` — portal chooser
- `/teacher` — teacher portal
- `/student` — student portal

Netlify already has SPA fallback, so these routes work after deploy.

## Implemented

### Backend / data
- `centers`
- `center_members`
- `classes`
- `class_students`
- student fields on `users`: role, display_name, grade, age_band, student_code, pin_hash
- `missions`
- `assignments`
- `mission_attempts`
- classroom context fields on `sessions`
- 10 seeded missions
- automatic DB migration on startup

### Auth
- Teacher: Google ID token -> backend verification -> signed Classroom token
- Student: class code + student code + 4–6 digit PIN -> signed Classroom token
- Student PINs are scrypt-hashed; plaintext PIN is never stored.
- Classroom sessions require student auth for `/api/turn` and `/api/stt`.
- Teacher queries are scoped to center membership and class ownership/admin role.

Set a strong `AUTH_SECRET` in production.

### Teacher MVP
Teacher can:
1. Sign in with Google.
2. Create a center if they do not have one.
3. Create Grade 1–12 classes.
4. See generated class code.
5. Add students with student code + PIN.
6. Browse seeded missions filtered by class age band / grade.
7. Assign a mission.
8. Open assignment results and see completion, actual speaking time, turns, and stars.

### Student MVP
Student can:
1. Log in without Google/email.
2. See assigned missions.
3. Start a mission in <=2 taps from home.
4. Speak using Phase 0 MediaRecorder -> Azure STT path.
5. Low-confidence STT stays blocked before Claude.
6. Receive Toki reply + optional scaffold chips.
7. Hear Toki through Azure TTS, with browser TTS fallback.
8. Finish the mission and see speaking time / turns / stars.

### Existing B2C
The previous app was moved to:
- `frontend/src/consumer/ConsumerApp.jsx`

It remains the default `/` experience.

## Phase 1 intentionally does NOT include
- Kids/Junior/Teen-specific AI prompt architecture (Phase 2)
- AI Mission Generator (Phase 3)
- Parent reports (Phase 4)
- Pronunciation scoring
- LMS, tuition, scheduling, attendance

The seeded mission context is injected into conversation history now, so role-play works, but strict age-adaptive Toki behavior should be implemented in Phase 2 before a broad Grade 1–12 rollout.

## Environment

Backend now additionally needs:

```env
AUTH_SECRET=replace-with-a-long-random-secret
```

Existing variables remain required:
- DATABASE_URL
- ANTHROPIC_API_KEY
- GOOGLE_CLIENT_ID
- AZURE_SPEECH_KEY
- AZURE_SPEECH_REGION

Frontend:
- VITE_API_BASE
- VITE_GOOGLE_CLIENT_ID

## Local test

Backend:

```bash
cd backend
npm ci
npm start
```

Frontend:

```bash
cd frontend
npm ci
npm run dev
```

### End-to-end checklist

1. Open `/teacher`.
2. Google sign in.
3. Create center.
4. Create a Grade 5 class.
5. Note generated class code.
6. Add student, e.g. `MINH01`, PIN `1234`.
7. Assign `At the Restaurant`.
8. Open `/student` in another browser/private window.
9. Enter class code + `MINH01` + `1234`.
10. Confirm mission appears.
11. Start mission.
12. Speak at least 3 turns using the mic.
13. Finish.
14. Return to teacher -> class -> assignment results.
15. Confirm actual speaking seconds and turn count appear.

## Validation performed in this environment

- `node --check backend/server.js` PASS
- `node --check backend/db.js` PASS
- `node --check backend/classroom/classroomDb.js` PASS
- `node --check backend/classroom/auth.js` PASS
- Babel JSX parse for App/Consumer/Teacher/Student/hooks/api PASS
- no `SpeechRecognition` / `webkitSpeechRecognition` remains in frontend source

A full `npm ci && npm run build` could not be completed here because the execution environment cannot fetch all npm tarballs and the original uploaded `node_modules` was macOS-specific. The delivery archive intentionally excludes `node_modules` and `dist`; run a clean install on your Mac/CI.
