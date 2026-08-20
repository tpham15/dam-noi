# Deploy Dám Nói Phase 5.1

## Site A — Speaking Practice

Create a Netlify site from the same repository.

Recommended settings:

```text
Base directory: apps/speaking
Build command: npm run build
Publish directory: dist
```

Environment variables:

```text
VITE_API_BASE=https://<your-backend-domain>
VITE_GOOGLE_CLIENT_ID=<google-client-id>
```

Suggested domain later:

```text
speaking.damnoi.vn
```

or keep the existing consumer domain until branding/domain migration is ready.

## Site B — Dám Nói Education

Create a second Netlify site from the same repository.

```text
Base directory: apps/education
Build command: npm run build
Publish directory: dist
```

Environment variables:

```text
VITE_API_BASE=https://<same-backend-domain>
VITE_GOOGLE_CLIENT_ID=<google-client-id>
```

Suggested domain:

```text
edu.damnoi.vn
```

The included `netlify.toml` provides SPA fallback for `/teacher`, `/student`, and `/report/:token`.

## Backend

Keep one deployment.

Set all existing backend env vars plus, once both production domains are known:

```env
CORS_ORIGINS=https://speaking.damnoi.vn,https://edu.damnoi.vn
```

If CORS causes trouble during migration, leave `CORS_ORIGINS` unset temporarily; behavior falls back to Phase 4.1 allow-all.

## Google OAuth

In Google Cloud Console, add both deployed frontend origins to the OAuth Client's Authorized JavaScript origins.

Example:

```text
https://speaking.damnoi.vn
https://edu.damnoi.vn
```

Teacher Google Login on Education will fail if the Education origin is not allowed.

## Supabase

No second Supabase project is required.

Both products share the same backend, and only the backend connects to PostgreSQL/Supabase.

Do NOT expose `DATABASE_URL`, Anthropic key, Azure key, AUTH_SECRET, or ADMIN_KEY to either Vite app.
