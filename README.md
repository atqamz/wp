# WP

Mobile-first PWA that tracks a household's planning in one place.
React + TypeScript SPA served by a Cloudflare Worker with D1.

## Run locally

Node 24 (see `.node-version`).

```sh
npm ci
npm run dev
npm run check
```

`npm run dev` serves the SPA and `/api/health` with a local D1. `npm run preview` serves the production build.

## Bootstrap

`wrangler.jsonc` holds a placeholder `database_id`. The real ID comes from `wrangler d1 create wp` during the bootstrap: see section 8 of `docs/infra.md` on the `docs` branch (`git show docs:docs/infra.md`).
