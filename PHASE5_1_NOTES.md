# Phase 5.1 — Product Split

## Goal

Tách Dám Nói thành **hai sản phẩm user-facing độc lập** nhưng không nhân đôi backend/infrastructure:

1. **Dám Nói — Speaking Practice** (B2C)
2. **Dám Nói Education** (B2B2C cho trung tâm)

Backend, Claude, Azure Speech, PostgreSQL/Supabase và classroom data model vẫn dùng chung.

## New structure

```text
dam-noi/
├── apps/
│   ├── speaking/
│   │   ├── src/consumer/ConsumerApp.jsx
│   │   ├── public/toki.png
│   │   └── ... Vite/Netlify/Capacitor config
│   └── education/
│       ├── src/student/
│       ├── src/teacher/
│       ├── src/reports/
│       ├── src/api/
│       ├── src/hooks/
│       └── ... Vite/Netlify config
├── backend/
└── package.json
```

Old mixed `frontend/` was removed intentionally so it cannot accidentally be deployed again.

## Speaking Practice boundary

Speaking app now contains only ConsumerApp.

User-facing brand cleanup:

- `MoHo AI` → `Dám Nói`
- tagline → `Speaking Practice`
- share attribution → `by Dám Nói`
- Capacitor app name → `Dám Nói`

It does not expose `/teacher`, `/student`, `/report`, or Education navigation.

Local URL: `http://localhost:5173`.

## Education boundary

Education app contains only:

- Education landing
- Teacher portal
- Student portal
- Parent report
- Mission builder
- Classroom voice recorder/API client

User-facing `Dám Nói Classroom` text was renamed to **Dám Nói Education**.

Internal backend route names `/api/classroom/*` remain unchanged intentionally. Renaming API/database modules provides no user value and would create unnecessary migration risk before pilot.

Local URL: `http://localhost:5174`.

## Shared backend

No backend split.

Both products use port `8787` locally and the same production API host.

Phase 5.1 adds optional `CORS_ORIGINS`. If unset, previous permissive CORS behavior remains. In production it can be set to both frontend origins.

## Local env fix

Phase 4.1 documentation made `npm start` look like it loaded `.env`, but `server.js` only reads `process.env`.

Phase 5.1 adds:

```bash
npm run start:local
npm run dev:local
```

which explicitly use Node `--env-file=.env`.

Production `npm start` remains unchanged for Render/hosting platforms that inject environment variables.

## Deployment model

Recommended:

```text
Speaking Netlify site
  base: apps/speaking
      ↓
Shared Backend / Render
      ↑
Education Netlify site
  base: apps/education
```

Both sites set `VITE_API_BASE` to the same backend URL.

## No Phase 5 feature creep

Phase 5.1 does NOT add:

- new missions
- parent app
- LMS features
- new gamification
- new reports
- billing
- center CRM

This phase is architecture/product separation only.
