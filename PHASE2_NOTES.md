# Dám Nói Classroom — Phase 2

Phase 2 upgrades the Phase 1 Classroom workflow into an age-aware learning engine.

## What changed

### 1. Separate Classroom AI engine
New: `backend/classroom/classroomPrompt.js`

Classroom no longer uses the B2C roast/persona prompt. It has three explicit modes:

- `kids` — Grade 1-4: tiny responses, one instruction/question, no roast/sarcasm, conservative correction, heavy scaffold.
- `junior` — Grade 5-8: mission-oriented role-play, short natural English, target-language opportunities, scaffold when stuck.
- `teen` — Grade 9-12: natural connected speaking, reasons/examples/presentation/debate, supportive tone.

The prompt also changes behavior by mission type: guided, roleplay, story, presentation, conversation.

### 2. Structured target detection
Classroom AI now returns:

- `target_vocab_detected`
- `target_patterns_detected`
- `mission_progress.objective_reached`
- `mission_progress.should_finish`

The server filters detections against the mission's allowed target lists. A deterministic transcript pass is also used so obvious target words/patterns are not missed.

### 3. Server-side mission progress
`mission_attempts` now includes:

- `objective_reached BOOLEAN`
- `mission_progress JSONB`

Live progress combines:

- learner turns
- actual speaking seconds
- target language used
- AI-confirmed objective

AI cannot finish a mission just because it says so. `shouldFinish` is gated by meaningful participation (roughly >=60% of target engagement).

### 4. Completion rules
When the learner taps Finish:

- zero turns -> `abandoned`
- enough engagement + objective evidence -> `completed`
- otherwise -> `incomplete`

An incomplete attempt is saved but the assignment stays available for another try.

Stars reward participation/completion, not pronunciation accuracy.

### 5. Mission summary
After Finish, backend performs one structured AI summary pass from learner turns only.

Saved summary contains:

- `strength`
- `nextFocus`
- `teacherNoteVi`
- `learnerAchievementVi`

If the AI summary call fails, deterministic metrics still complete and a fallback summary is saved.

### 6. Student UX
Student mission flow is now:

`Assignment -> Mission Intro -> Speaking -> Live Mission Progress -> Finish`

New UX includes:

- age-band mission intro
- target vocabulary/pattern chips
- live checkmarks when target language is used
- server-calculated progress bar
- "Mission đạt mục tiêu" signal
- age-adjusted TTS speed
- learner achievement after mission
- incomplete/retry state

### 7. Teacher results
Assignment results now show:

- completed / total
- total speaking minutes
- students who practiced
- target vocabulary coverage
- target pattern coverage
- AI teacher note per student

### 8. Grade safety
Backend now enforces mission/class compatibility. A teacher cannot assign a Kids/Teen mission to the wrong age band by bypassing the UI.

### 9. Classroom quota behavior
The B2C daily free-turn cap no longer applies to authenticated Classroom assignment sessions.

## Seed missions
Existing seed missions remain and a canonical Teen mission was added:

- Grade 3: `My Pets`
- Grade 6: `At the Restaurant`
- Grade 10: `School Debate`

Seed missions are now updated on startup with `ON CONFLICT DO UPDATE`, so Phase 2 changes apply to an existing Phase 1 database.

## Database migration
No manual SQL migration is required. `initClassroom()` adds the new columns with `IF NOT EXISTS`.

## Validation performed

- `node -c backend/server.js` ✅
- `node -c backend/classroom/classroomDb.js` ✅
- `node -c backend/classroom/classroomPrompt.js` ✅
- `npm run test:classroom` ✅
- JSX syntax check via TypeScript parser ✅
- Canonical prompt tests for Kids / Junior / Teen ✅

A full clean frontend `npm ci` could not run in this execution environment because an npm tarball (`yauzl-2.10.0`) was not present in the offline cache. This is an environment/cache limitation, not a source parse failure.

## Local smoke test

1. Start backend and frontend as in Phase 1.
2. Teacher creates:
   - Grade 3 class -> assign `My Pets`
   - Grade 6 class -> assign `At the Restaurant`
   - Grade 10 class -> assign `School Debate`
3. Student completes at least 3 turns in each.
4. Verify Toki behavior is visibly different by age band.
5. Verify target chips gain checkmarks after the learner uses target language.
6. Finish too early -> status should be `incomplete` and assignment remains retryable.
7. Complete target engagement/objective -> status `completed`.
8. Teacher opens assignment results and sees target coverage + AI note.

## Not in Phase 2

- Teacher AI Mission Generator (Phase 3)
- Parent/share reports (Phase 4)
- Full textbook import
- Pronunciation phoneme scoring
- LMS/CRM/payment features
