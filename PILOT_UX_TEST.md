# Phase 5.2 — Pilot UX Test Script

Use this as an observation sheet for one real teacher + class. Do not explain the UI unless the user is actually stuck; the point is to find friction.

## Teacher — target < 10 minutes to first assignment

1. Teacher logs in.
2. Creates first center/class if needed.
3. Pastes 15–25 student names in bulk.
4. Clicks `In / Lưu PDF` for login cards.
5. Enters one Topic only in Mission Builder.
6. Reviews draft.
7. Clicks `Lưu & giao cho lớp`.

Record:

- total time from portal open → first assignment
- exact screens/questions where teacher pauses
- whether teacher opens Advanced options without prompting
- whether teacher understands login-card flow

## Student — one-PIN join

1. Give student their printed card/link.
2. Student opens `/join/...`.
3. Student enters PIN only.
4. Opens assigned mission.
5. Starts mic without adult explanation.
6. Completes at least 2 turns.

Record:

- needed adult help? yes/no
- login retry?
- understood Idle / Recording / Processing mic state?
- STT retry?
- tried to double tap processing mic?

## Kids specific

Confirm the child sees:

- max 3 playful vocab hints
- no target coverage percentage
- no target pattern checklist
- no red failure state
- `Kết thúc sớm` is secondary

## Parent

1. Teacher generates parent report link.
2. Parent opens on phone without login.
3. Ask only: `Cô/chú hiểu con đang tiến bộ thế nào không?`

Observe whether they first understand the Vietnamese progress message before looking at metrics.

## Founder metrics

```bash
curl -H "x-admin-key: $ADMIN_KEY" \
  "https://YOUR-BACKEND/api/admin/pilot?days=7"
```

Watch especially:

- `ux.medianTimeToFirstAssignmentSeconds` — target < 600
- `ux.studentLoginViaJoinLink`
- `assignmentCompletionRatePercent`
- `avgSpeakingSecondsPerActiveStudent`
- `sttRetryRatePercent`
- `ux.parentReportOpens`
- `teacherUnpromptedReuseCount`
