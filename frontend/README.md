# ThreadGogh — frontend

The Next.js app (UI + API routes) for ThreadGogh. See the
[root README](../README.md) for the project overview, architecture, and setup.

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000  (next dev --webpack)
npm run build                # next build --webpack
npm test                     # vitest run
npm run lint
```

> **Webpack only** — `dev`/`build` use `--webpack`; Turbopack breaks
> `@stacks/transactions`. Don't remove the flag.

Requires `.env.local` (see `.env.example`). Apply `supabase/schema.sql` and the files
in `supabase/migrations/` in the Supabase SQL editor.
