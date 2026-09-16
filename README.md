# Habitly

A personal habit tracker where every signed-in user has their own private
habits and habit-completion data — enforced at the database level, not just
in the UI.

Built with Next.js (App Router) + TypeScript, Tailwind CSS, Supabase
(Postgres, Auth, Row Level Security), and Playwright.

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — application architecture, database
  schema, authentication flow, and how RLS protects every table.
- [SECURITY_TESTS.md](./SECURITY_TESTS.md) — the two-user authorization test
  suite and how to run it.
- [DEPLOYMENT_VERIFICATION.md](./DEPLOYMENT_VERIFICATION.md) — post-deploy
  checklist and results.
- [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) — security scan results.

## Getting started locally

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Requires a Supabase project with the migrations in `supabase/migrations/`
applied (`supabase db push`), and **Authentication → Providers → Email →
"Confirm email"** turned off in that project so sign-up sessions activate
immediately (see ARCHITECTURE.md §3.2).

## Testing

```bash
npx playwright test
```

Runs the full end-to-end suite — authentication, habit CRUD, and the
required cross-account authorization tests — against a real Next.js server
and real Supabase project. See [SECURITY_TESTS.md](./SECURITY_TESTS.md).

## Project structure

See [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-project-folder-structure) for
the full annotated folder structure.

## Deployment

Deployed on [Vercel](https://vercel.com). Only
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`NEXT_PUBLIC_SITE_URL` are needed as environment variables — this project
never uses the Supabase service-role key at runtime (see ARCHITECTURE.md
§8).
