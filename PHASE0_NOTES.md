# Dám Nói — Phase 0 Core Reliability

## Implemented

1. **Azure STT is the primary/only recognition path**
   - Removed the legacy `SpeechRecognition` / `webkitSpeechRecognition` flow from `frontend/src/App.jsx`.
   - Browser mic support now checks `navigator.mediaDevices.getUserMedia` + `MediaRecorder`.
   - Unsupported devices fall back to typing instead of being misclassified by Web Speech support.

2. **Actual speaking time**
   - Voice duration is measured from recording start to recording stop.
   - `/api/turn` receives the measured `secondsSpoken` for voice turns only.
   - Typed/chip turns contribute `0` speaking seconds.
   - Finish/share UI now uses actual speaking time, not total time spent on the chat screen.
   - Backend clamps client-provided speech duration to `0..120` seconds per turn.

3. **STT confidence gate**
   - `/api/stt` reads Azure detailed `NBest[0].Confidence`.
   - Default threshold: `STT_CONFIDENCE_THRESHOLD=0.55`.
   - Low-confidence or empty recognition is never sent to Claude, so it cannot become a grammar correction/error.
   - UI asks the learner to speak again or type instead.

4. **STT telemetry**
   - Added `stt_attempt_count`, `stt_retry_count`, and `stt_low_confidence_count` to users and sessions.
   - `/api/admin/stats` now includes:
     - `sttAttemptCount`
     - `sttRetryCount`
     - `sttRetryRatePercent`
     - `sttLowConfidenceCount`
     - `totalActualSpeakingSeconds`

5. **Source hygiene**
   - Delivery package excludes `.git`, `.env`, `node_modules`, `dist`, local DB files, `.DS_Store`, and macOS metadata.
   - Added `frontend/.env.example` and `backend/.env.example`.

## Database migration

No manual SQL is required. Existing `db.init()` uses `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to add Phase 0 telemetry columns at backend startup.

## Manual test matrix before deploy

### Chrome desktop
- Open a topic.
- Record ~3 seconds and stop.
- Transcript should reach Toki.
- Finish screen should show approximately 3 seconds of speaking, not the full session duration.
- Type a sentence: speaking time must not increase.

### Low-confidence voice
- Speak very quietly / far from the mic.
- App should display `Toki chưa nghe rõ...`.
- No user bubble should be sent to Claude for that attempt.
- Admin STT retry counters should increase.

### Safari / iPhone
- Grant microphone permission.
- Mic should remain available based on MediaRecorder support even though Web Speech API may be absent.
- If audio conversion/recognition cannot complete, app must show a retry/typing fallback and never hang the mic.

### Backend
- Verify `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, and `DATABASE_URL` are configured.
- Optionally set `STT_CONFIDENCE_THRESHOLD`; otherwise `0.55` is used.
