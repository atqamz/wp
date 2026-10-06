# WP

Mobile-first PWA that tracks a household's planning in one place.
React + TypeScript SPA served by a Cloudflare Worker with D1.

## Run locally

CI uses the newest Node release: `.node-version` is `latest`, and `actions/setup-node` resolves it from nodejs.org on every run. mise ignores `.node-version` by default; run `mise settings add idiomatic_version_file_enable_tools node` to read it, or `mise use node@latest`. `latest` means the newest installed version, so run `mise install node@latest` to move it forward; a local machine can lag CI until you do.

```sh
npm ci
npm run dev
npm run check
```

`npm run dev` serves the SPA and `/api/health` with a local D1. `npm run preview` serves the production build. The local D1 state lives in `.wrangler`. `npm run dev` does not apply the migration: on a fresh `.wrangler`, run `npx wrangler d1 migrations apply wp --local --env dev` once, otherwise `/api/sync` returns 500. After a change to `migrations/0001_init.sql` (it is the initial schema and is edited in place) delete `.wrangler` and apply the migration again.

## Bootstrap

The top-level D1 binding in `wrangler.jsonc` holds the real production `database_id`. Only `env.dev` keeps the all-zero placeholder, which must never reach production. The bootstrap that created the database is in section 8 of `docs/infra.md` on the `docs` branch (`git show docs:docs/infra.md`).
