# ARCHITECTURE.md — Secure Per-User Habit Tracker

> **Status:** Approved design baseline for implementation.
> **Stack (mandatory):** Next.js (App Router) + TypeScript, Tailwind CSS, Supabase (Postgres + Auth + Row Level Security), Playwright, Vercel.
> **Process note:** This document was produced by consulting an architecture subagent, then reviewed line-by-line against every requirement in the project brief. Corrections made during review are listed in [§0.2](#02-review-corrections-applied).
> **Runtime note:** Scaffolded with Next.js 16.3.5, which renamed the `middleware.ts` convention to `proxy.ts` (exported function `proxy`, not `middleware`; `nodejs` runtime only, no `edge`) and fully removed synchronous `cookies()`/`headers()`. Every mention of `middleware.ts` / "middleware" below refers to this file under its Next 16 name, `proxy.ts`; behavior described is unchanged, only the filename and export name differ.

---

## 0. Review summary

### 0.1 Requirement traceability

| Brief section | Where addressed here |
|---|---|
| 1. App concept | §1, §2 |
| 2. Database design (migrations for everything) | §2, §6 (`supabase/migrations/`), §8.7 |
| 3. RLS security (mandatory) | §4 — RLS enabled **and forced** on all 3 tables, owner-scoped `USING`/`WITH CHECK` with `auth.uid()` |
| 4. Authentication | §3 |
| 5. Authorization (record-level) | §1.2, §1.3, §4, §5 (IDOR row) |
| 6. Migrations reproducible | §2, §8.7 — hand-written SQL in `supabase/migrations/`, replayable with `supabase db reset` / `db push` |
| 7. Environment variables | §8.1–§8.4 — anon key is the **only** key the app uses; service-role key is **not in this project at all** |
| 8. Security headers | §9 — CSP, X-Frame-Options, X-Content-Type-Options (+ Referrer-Policy, Permissions-Policy, HSTS) |
| 9. UI / pages | §1.1, §6, §7 |
| 10. Playwright testing | §7 |
| 11. Two-user RLS test | §7.4 groups D & E; documented in `SECURITY_TESTS.md` |
| 12. Git hygiene | §10 |
| 13. Vercel deployment | §8.5, §8.6 |
| 14. Live deployment verification | §8, `DEPLOYMENT_VERIFICATION.md` |
| 15. Security scan | §11 |
| 16. Fresh-context second scan | §11 |
| 17. Final checklist | Appendix B + `SECURITY_AUDIT.md` |
| 18. Verify, don't assume | §12 (required external actions) |
| 19. Build strategy / phases | §13 |

### 0.2 Review corrections applied

The subagent proposal was sound. The following changes were made during review to make it stricter and to reduce project scope to what the brief requires:

1. **The service-role key is removed from the project entirely.** The subagent proposed keeping it in `.env.local` / CI for a Playwright user-provisioning script. Instead, **test users are created through the real `/signup` UI flow** (email confirmation disabled in the eval Supabase project). No file in the repo, the test harness, or CI ever references `SUPABASE_SERVICE_ROLE_KEY`. This satisfies brief §7 with zero residual risk and avoids security-scanner findings. The key stays only in the Supabase dashboard, never downloaded.
2. **No Redis / Upstash dependency for rate limiting.** Rely on Supabase Auth's built-in per-IP auth rate limits; an optional in-memory per-IP throttle in middleware is a nice-to-have, not a dependency.
3. **Single Supabase project.** Preview deployments are protected by Vercel Deployment Protection (Vercel Authentication) so they are not publicly reachable. A separate Supabase project for Preview is noted as optional hardening, not required.
4. Added an explicit **Git & commit hygiene** section (§10) and a **Required external actions** section (§12) covering Supabase dashboard toggles, Vercel setup, and the two security scans.
5. Noted that the `SECURITY DEFINER` triggers work under `FORCE ROW LEVEL SECURITY` because migrations run as the `postgres` role (which has `BYPASSRLS`); the app's `authenticated` role never does.

### 0.3 Toolchain prerequisites (not yet present on the build machine)

Implementation cannot begin until these are installed locally: **Node.js 20 LTS + npm**, **Git**, and the **Supabase CLI**. Vercel deployment additionally needs either the **Vercel CLI** or a GitHub repo connected to Vercel. See §12.

---

## Guiding security principles

1. **The database is the security boundary.** RLS on every table is the primary, sufficient control. Middleware and server guards are UX and defense-in-depth — never the only thing between User B and User A's rows.
2. **The app never holds a key that can bypass RLS.** The anon key is the only Supabase key the deployed app (and the test suite) uses.
3. **`user_id` is never accepted from the client.** It is always derived server-side from a verified session — `auth.uid()` in the database, `getUser()` in Next.js.
4. **Every read path assumes the layer above it failed.** A page that forgets its auth check still returns nothing, because the query runs as the user and RLS filters it.
5. **Tests assert on data, not on redirects.** A test that only checks "bounced to /login" is a failing test design.

---

## 1. Overall application architecture

### 1.1 Rendering strategy

| Route | Component model | Rendering | Auth check location |
|---|---|---|---|
| `/` landing | Server Component | Dynamic; reads `getUser()` only to toggle a CTA. **Contains zero private data.** | none required |
| `/login`, `/signup` | Server shell + Client form | Dynamic | If already authenticated → `redirect('/dashboard')` |
| `(protected)/layout.tsx` | Server Component | Dynamic (reads cookies) | `requireUser()` → `redirect('/login?next=…')` |
| `/dashboard` | Server data fetch + Client forms/checkboxes | Dynamic, `no-store` | `requireUser()` at top of page + RLS on every query |
| `/habits/[id]` | Server Component + Client edit form | Dynamic, `no-store` | `requireUser()` + `getHabitById(id)` returns `null` under RLS → `notFound()` |
| Server Actions (`actions.ts`) | — | — | `requireUser()` + zod validation + RLS; `user_id` from session only |

Rationale:

- **Server Components for all data reads.** The browser never runs a Supabase data query; it receives an already-authorized RSC/HTML payload. The anon key's only client-side job is auth (`signIn` / `signUp` / `signOut`).
- **Client Components only for interactivity** — auth forms, "add habit" form, completion checkboxes, date picker. They call **Server Actions**, never Supabase directly, so validation and authorization run on the server.
- **No static generation of any authenticated route.** Reading cookies forces dynamic rendering; protected segments additionally set explicit segment config (§1.4).
- **Mutations are Server Actions** co-located in `actions.ts`, each ending with `revalidatePath()` so the dashboard reflects changes without a client Supabase call.

### 1.2 Where auth is checked (three independent layers)

1. **`middleware.ts`** — runs on every matched request. Calls `supabase.auth.getUser()` (network-verified), refreshes the session cookie, and for protected prefixes (`/dashboard`, `/habits`) redirects unauthenticated requests to `/login?next=<path>`. Also redirects authenticated users away from `/login` and `/signup`. This is **UX / fast bounce**, not the security boundary.
2. **`(protected)/layout.tsx`** — calls `requireUser()`; on `null` calls `redirect('/login?next=…')`. Covers a middleware matcher gap or middleware being disabled.
3. **Per-query / per-action** — every function in `lib/data/*` builds a request-scoped server client carrying the user's JWT; every query is RLS-filtered. Data-access functions also add an explicit `.eq('user_id', user.id)` for index usage and readability, but correctness does not depend on it. Every Server Action re-runs `requireUser()` before touching data.

If layers 1 and 2 are both removed, an unauthenticated request to `/dashboard` still renders **no habits** (RLS returns zero rows for an anon JWT), and `/habits/[id]` still 404s.

### 1.3 Data-access layer (`lib/data/`)

- One module per aggregate: `habits.ts`, `completions.ts`, `stats.ts`, `profile.ts`.
- Each exported function:
  - Imports `createClient()` from `lib/supabase/server` (request-scoped; never a singleton, never service-role).
  - Calls `requireUser()` (or accepts a `User` from the caller) so it is safe in isolation.
  - Selects **explicit columns only** (never `select('*')`), returns typed DTOs.
  - Never takes a `userId` from client-derived input. Ownership is `auth.uid()` in the DB + `user.id` in the filter.
- Mutations (`createHabit`, `updateHabit`, `deleteHabit`, `toggleCompletion`) live here and are invoked only by Server Actions after zod validation.
- No `unstable_cache` keyed without the user id. `React.cache` (per-request only) is acceptable.

### 1.4 Supabase client structure

| File | Factory | Used by | Key |
|---|---|---|---|
| `lib/supabase/client.ts` | `createBrowserClient(URL, ANON_KEY)` | Client Components (auth only) | anon |
| `lib/supabase/server.ts` | `createServerClient(URL, ANON_KEY, { cookies })` over `next/headers` | Server Components, Actions, Route Handlers, `lib/data/*` | anon |
| `lib/supabase/middleware.ts` | `createServerClient(...)` bridging `NextRequest`/`NextResponse` cookies; exports `updateSession(request)` | `middleware.ts` | anon |
| ~~`lib/supabase/admin.ts`~~ | **not created** | — | — |

**No service-role client anywhere.** Justification: all user CRUD runs as the authenticated user through RLS; profile rows are created by a DB trigger; stats are ordinary `SELECT … GROUP BY` under RLS; there is no admin surface and no background job in v1. Not provisioning the key on Vercel removes the single most dangerous secret from the runtime blast radius.

`server.ts`'s cookie `setAll` is wrapped in `try/catch` (writing cookies during RSC render throws — harmless; middleware performs the refresh).

---

## 2. Supabase database schema

Changes vs. the brief's suggested schema, with justification:

| Change | Why |
|---|---|
| `profiles`: add `display_name`, `timezone` (default `'UTC'`), `updated_at` | `timezone` makes "complete for a date" and streak math correct per user. Email is **not** copied into `profiles` (stays in `auth.users`) — no second place to leak PII. |
| `habits`: `color` constrained to `^#[0-9A-Fa-f]{6}$`; `category` ≤ 40 chars; `name` 1–120; `description` ≤ 2000; add `updated_at` | Input hardening at the DB, independent of the app's zod layer. |
| `habit_completions`: `completed_date` default `current_date`; `UNIQUE (habit_id, completed_date)` | `habit_id` already determines the owner, so `(habit_id, completed_date)` is the minimal correct uniqueness key. `user_id` is kept (denormalized) so RLS policies stay simple and index-friendly. |
| `BEFORE INSERT/UPDATE` trigger `enforce_completion_owner` on `habit_completions` | Defense-in-depth: guarantees `user_id` equals `habits.user_id` for the referenced `habit_id`. Also auto-fills `user_id` from the habit when omitted. |
| `ON DELETE CASCADE` from `auth.users` and from `habits` | Deleting a user or a habit leaves no orphaned private rows. |

### 2.1 `supabase/migrations/0001_init.sql`

```sql
create extension if not exists pgcrypto;   -- gen_random_uuid()

-- profiles: 1:1 with auth.users
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 80),
  timezone     text not null default 'UTC',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- habits: owned by a user
create table public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 2000),
  color       text not null default '#4F46E5' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  category    text check (char_length(category) <= 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- habit_completions: one row per (habit, date)
create table public.habit_completions (
  id             uuid primary key default gen_random_uuid(),
  habit_id       uuid not null references public.habits (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  completed_date date not null default current_date,
  created_at     timestamptz not null default now(),
  constraint habit_completions_unique_per_day unique (habit_id, completed_date)
);
```

### 2.2 `supabase/migrations/0004_indexes.sql`

```sql
create index habits_user_id_idx        on public.habits (user_id);
create index habits_user_created_idx   on public.habits (user_id, created_at desc);
create index completions_user_id_idx   on public.habit_completions (user_id);
create index completions_habit_id_idx  on public.habit_completions (habit_id);
create index completions_user_date_idx on public.habit_completions (user_id, completed_date);
-- UNIQUE (habit_id, completed_date) already indexes per-habit calendar queries.
```

RLS predicates are `user_id = auth.uid()`, so `user_id` **must** be indexed on both data tables or every policy check is a seq scan. `completions_user_date_idx` powers stats/calendar queries; `completions_habit_id_idx` powers `/habits/[id]` and the RLS `EXISTS` sub-check.

### 2.3 `updated_at` trigger — `supabase/migrations/0003_triggers.sql`

```sql
create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger habits_set_updated_at   before update on public.habits
  for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
```

### 2.4 Profile auto-creation trigger on `auth.users`

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- `security definer` + `set search_path = ''` + fully-qualified names is the Supabase-recommended hardening.
- Because it runs as the function owner (`postgres`, which has `BYPASSRLS`), it can insert the profile without an INSERT policy — so **no INSERT policy on `profiles` is needed**, and the client can never create arbitrary profile rows.
- The app treats a missing profile as non-fatal (renders the dashboard regardless).

### 2.5 Completion ownership trigger

```sql
create or replace function public.enforce_completion_owner()
returns trigger language plpgsql
security definer set search_path = '' as $$
declare owner uuid;
begin
  select h.user_id into owner from public.habits h where h.id = new.habit_id;
  if owner is null then
    raise exception 'habit % not found', new.habit_id using errcode = '23503';
  end if;
  if new.user_id is null then
    new.user_id := owner;
  elsif new.user_id <> owner then
    raise exception 'completion.user_id % does not own habit %', new.user_id, new.habit_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger habit_completions_enforce_owner
  before insert or update on public.habit_completions
  for each row execute function public.enforce_completion_owner();
```

Redundant with the RLS `WITH CHECK` in §4.3 on purpose — either alone is sufficient; both together mean a single-line mistake in a future migration cannot open ownership spoofing on completions.

---

## 3. Authentication flow

Session transport: **cookie-based** via `@supabase/ssr`, PKCE flow. Auth cookies (`sb-<ref>-auth-token`, chunked) are set `Path=/`, `SameSite=Lax`, `Secure` in production. They are not `HttpOnly` in the cookie-based SSR model (the browser client reads them); the compensating control is a strict nonce `script-src` CSP (§9) so an injected script cannot exfiltrate them.

### 3.1 Signup

- `/signup` renders a Client form (email, password, optional display name).
- Submits to a **Server Action** that:
  1. Validates with zod (email format, password ≥ 10 chars).
  2. Calls `supabase.auth.signUp({ email, password, options: { data: { display_name }, emailRedirectTo: `${SITE_URL}/auth/confirm` } })`.
  3. On success with email confirmation **disabled** (the eval setting): a session is returned, cookies are set → `redirect(safeNext ?? '/dashboard')`. With confirmation enabled: render "check your email".
- The `on_auth_user_created` trigger creates the `profiles` row transactionally.

### 3.2 Email confirmation

**Eval setting: disable "Confirm email"** in Supabase → Authentication → Providers → Email. This makes signup immediately usable and lets Playwright provision test users through the real UI (see §7.2). Trade-off documented: production would enable it.

If confirmation stays enabled, both callback styles are implemented and tested:

- `app/auth/confirm/route.ts` — reads `token_hash` + `type`, calls `verifyOtp`, then `redirect(safeNext ?? '/dashboard')`.
- `app/auth/callback/route.ts` — PKCE `code` flow: `exchangeCodeForSession(code)`, then redirect.
- Both pass the redirect target through `safeRedirect()`.

### 3.3 Login

- `/login` form → Server Action → `supabase.auth.signInWithPassword({ email, password })`.
- On error: a **single generic** message ("Invalid email or password.") regardless of whether the email exists (§5, enumeration).
- On success: cookies set by the server client → `redirect(safeNext ?? '/dashboard')`.
- A signed-in user visiting `/login` or `/signup` is redirected to `/dashboard` by middleware.

### 3.4 Logout

- `app/auth/signout/route.ts` — **POST only** (a form button, not a link), to avoid CSRF-via-GET and prefetch logout.
- Calls `supabase.auth.signOut()` (clears server cookies) → `redirect('/')`.

### 3.5 Token refresh & where each layer gets the session

| Layer | How it gets the session | Verification |
|---|---|---|
| **Middleware** | `createServerClient` reads request cookies; `await supabase.auth.getUser()` | `getUser()` verifies the JWT against the Auth server and refreshes if needed; new tokens written to request + response cookies. |
| **Server Components / Actions / Route Handlers** | `createServerClient` over `next/headers` cookies | Always `getUser()` — never `getSession()` — for authz decisions. |
| **Client Components** | `createBrowserClient` reads `document.cookie`; auto-refresh timer | Auth actions only; never gates data. |

### 3.6 Redirect flow for unauthenticated users hitting protected routes

1. `GET /habits/123`.
2. Middleware: `getUser()` → `null`, path matches `/habits` → `NextResponse.redirect('/login?next=%2Fhabits%2F123')` (307). `next` is pathname+search only, URL-encoded.
3. `/login` runs `next` through `safeRedirect()` (must start with a single `/`, no `//`, no `/\`, no scheme, no control chars). Invalid → `/dashboard`.
4. After login the Server Action calls `redirect(safeNext)`.
5. If middleware is bypassed, `(protected)/layout.tsx` performs the same redirect; if that is bypassed too, the page renders zero rows (RLS) and `/habits/[id]` calls `notFound()`.

---

## 4. How RLS protects every table

### 4.0 Enablement — `supabase/migrations/0002_rls.sql`

```sql
alter table public.profiles          enable row level security;
alter table public.habits            enable row level security;
alter table public.habit_completions enable row level security;

-- FORCE so even the table owner is subject to policies.
alter table public.profiles          force row level security;
alter table public.habits            force row level security;
alter table public.habit_completions force row level security;

-- anon gets no table privileges at all.
revoke all on public.profiles, public.habits, public.habit_completions from anon;

grant select, update                 on public.profiles          to authenticated;
grant select, insert, update, delete on public.habits            to authenticated;
grant select, insert, update, delete on public.habit_completions to authenticated;
```

- **RLS is enabled AND forced** on all three tables.
- The **`anon` role has no table privileges** — an unauthenticated PostgREST call returns `401` / `[]`, never data.
- The **`authenticated` role has no bypass** (`nobypassrls`). Only `service_role` (never used) and the Postgres superuser have `BYPASSRLS`.
- All policies are `to authenticated`, so `anon` matches no policy → default deny.
- `auth.uid()` is written as `(select auth.uid())` so Postgres evaluates it once per statement (Supabase's documented RLS performance pattern).

### 4.1 `profiles`

```sql
create policy "profiles_select_own" on public.profiles for select
  to authenticated using ( (select auth.uid()) = id );

create policy "profiles_update_own" on public.profiles for update
  to authenticated
  using      ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );
```

- **No INSERT policy** — rows are created only by the `handle_new_user()` trigger.
- **No DELETE policy** — profile lifetime is bound to `auth.users` via `ON DELETE CASCADE`.
- Predicate is `auth.uid() = id` because `profiles.id` *is* the user id (contrast with `habits`, where it is `auth.uid() = user_id` — see §5 / Appendix A for this classic mixup).

### 4.2 `habits`

```sql
create policy "habits_select_own" on public.habits for select
  to authenticated using ( (select auth.uid()) = user_id );

create policy "habits_insert_own" on public.habits for insert
  to authenticated with check ( (select auth.uid()) = user_id );

create policy "habits_update_own" on public.habits for update
  to authenticated
  using      ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "habits_delete_own" on public.habits for delete
  to authenticated using ( (select auth.uid()) = user_id );
```

- `WITH CHECK` on INSERT blocks inserting a habit with someone else's `user_id`.
- `WITH CHECK` on UPDATE blocks re-homing a habit to another user; `USING` blocks editing a habit you don't own.
- Guessing another user's `habits.id`: `SELECT` policy filters it out → `getHabitById()` returns `null` → `/habits/[id]` renders `notFound()`.

### 4.3 `habit_completions`

```sql
create policy "completions_select_own" on public.habit_completions for select
  to authenticated using ( (select auth.uid()) = user_id );

create policy "completions_insert_own" on public.habit_completions for insert
  to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.user_id = (select auth.uid())
    )
  );

create policy "completions_update_own" on public.habit_completions for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.user_id = (select auth.uid())
    )
  );

create policy "completions_delete_own" on public.habit_completions for delete
  to authenticated using ( (select auth.uid()) = user_id );
```

The completion's `user_id` is guaranteed to match the habit owner by **three** independent mechanisms: (1) `WITH CHECK ((select auth.uid()) = user_id)`; (2) the `EXISTS` sub-check that the referenced habit is owned by the caller; (3) the `enforce_completion_owner()` BEFORE trigger.

| User B sends | Result |
|---|---|
| `{ habit_id: <A's habit>, user_id: <B> }` | `EXISTS` fails (habit not owned by B) → 403 |
| `{ habit_id: <A's habit>, user_id: <A> }` | `auth.uid() = user_id` fails → 403 |
| `{ habit_id: <B's habit>, user_id: <A> }` | `auth.uid() = user_id` fails; trigger also fails → 403 |
| `{ habit_id: <B's habit>, user_id: <B> }` | Allowed (legitimate) |

### 4.4 App reads

Every `lib/data` query runs with the user's JWT, so `select('id, name, color, …')` is automatically row-filtered. There is no code path that selects with the service role, so there is no code path that bypasses RLS.

### 4.5 Service-role key

Not referenced by any file in this repository — not under `app/`, `lib/`, `components/`, `tests/`, or CI config. Not set as a Vercel environment variable. A CI grep fails the build if `service_role` / `SERVICE_ROLE_KEY` appears anywhere in the repo or if any `NEXT_PUBLIC_*` value matches a JWT shape.

---

## 5. Security vulnerabilities & mitigations

| # | Vulnerability | Vector | Mitigation |
|---|---|---|---|
| 1 | **IDOR on `/habits/[id]`** | User B navigates to `/habits/<A's id>` | `getHabitById()` under RLS → `null` → `notFound()`. Direct PostgREST with B's token → `[]`. E2E asserts 404 + empty body, not just redirect. |
| 2 | **Trusting client `user_id`** | Form / action payload includes `user_id` | Actions ignore any `user_id` in input; zod schema omits it; data layer sets `user_id: user.id` from `getUser()`. RLS `WITH CHECK` rejects mismatches regardless. |
| 3 | **Service-role key leakage** | Key in bundle / `NEXT_PUBLIC_*` / logs / a route handler | App never instantiates a service client; key never in the repo or Vercel env; CI grep + `.gitignore` + history scan. |
| 4 | **RLS disabled / not forced** | Forgotten `ENABLE`/`FORCE`; new table without policies | `0002_rls.sql` enables + forces all three; CI SQL assertion over `pg_class.relrowsecurity`/`relforcerowsecurity`; anon E2E expects `[]`. |
| 5 | **Missing `WITH CHECK`** | `update habits set user_id = <victim>`; insert completion for others | Every INSERT/UPDATE policy has explicit `WITH CHECK`; completions also trigger-guarded; E2E attempts re-homing → 403. |
| 6 | **XSS** | Malicious habit `name`/`description` | React auto-escapes; no `dangerouslySetInnerHTML`; strict CSP `script-src 'self' 'nonce-…' 'strict-dynamic'` (no `unsafe-inline`); DB length checks. |
| 7 | **SSRF** | App fetching a user-supplied URL | App makes no outbound request to user-controlled URLs; `color` is hex-constrained; no avatar-by-URL feature. |
| 8 | **CSP gaps** | `unsafe-inline`/`unsafe-eval`; missing `frame-ancestors` / `connect-src` lockdown | Full policy in §9; nonce-based; `frame-ancestors 'none'`; `connect-src` pinned to `'self'` + the Supabase origin; Playwright asserts the exact header. |
| 9 | **Session fixation** | Attacker pre-sets a session cookie | Supabase issues fresh JWT + refresh token on login; `@supabase/ssr` overwrites cookies on auth-state change; `signOut` clears them; `Secure` + `SameSite=Lax`. |
| 10 | **Data leak before the auth check** | Page fetches data, then layout redirect fires | `requireUser()` is the first statement in every protected `page.tsx` and every action; every query is RLS-scoped so an unauthenticated render yields no rows. |
| 11 | **Next.js caching cross-user data** | Data Cache / Full Route Cache / Router Cache | Protected segments: `dynamic = 'force-dynamic'`, `revalidate = 0`, `fetchCache = 'default-no-store'`; Supabase server client `fetch` set `cache: 'no-store'`; `Cache-Control: private, no-store`; `revalidatePath()` + `router.refresh()` after mutations. E2E asserts freshness in a fresh context. |
| 12 | **Open redirect on `next`** | `/login?next=https://evil.com` or `next=//evil.com` | `safeRedirect()`: accept only `^/(?!/)`, reject backslashes and control chars, re-check after `decodeURIComponent`; fallback `/dashboard`. E2E with hostile values. |
| 13 | **Email enumeration** | Different responses for existing vs. unknown email | Login returns one generic error; signup returns success UI regardless; reset says "if an account exists…". |
| 14 | **No auth rate limiting** | Credential stuffing on `/login` | Supabase Auth built-in per-IP limits; optional in-memory middleware throttle; hCaptcha/Turnstile toggle available in Supabase if abuse appears. |
| 15 | **CSRF on state-changing routes** | Cross-site POST to `/auth/signout` or an action | Next.js Server Actions' built-in Origin/Host check + action id; `SameSite=Lax` cookie; `signout` is POST with a same-origin form; no state-changing GET endpoints. |
| 16 | **PII in `profiles`** | A future "sharing" feature adds a broad SELECT policy | `profiles` stays strictly self-only; email never stored there; any directory feature must go through a whitelisted view. |
| 17 | **Verbose errors** | Postgres/PostgREST error text leaks policy/column names | App catches data-layer errors, returns generic messages; full error only to server logs; `notFound()` (plain 404) for unauthorized `/habits/[id]`. |
| 18 | **Preview deployments exposed** | Vercel preview URL hit by anyone | Vercel Deployment Protection (Vercel Authentication) on Preview. |

---

## 6. Project folder structure

```
habit-tracker/
├── app/
│   ├── layout.tsx                     # root layout; no session read
│   ├── globals.css                    # Tailwind directives
│   ├── error.tsx                      # generic error boundary (no raw error text)
│   ├── not-found.tsx
│   │
│   ├── (public)/
│   │   ├── page.tsx                   # "/" landing (signed-out copy + Login/Sign Up; signed-in → dashboard link)
│   │   ├── login/
│   │   │   ├── page.tsx
│   │   │   ├── login-form.tsx         # client component
│   │   │   └── actions.ts             # 'use server' signInWithPassword + safeRedirect
│   │   └── signup/
│   │       ├── page.tsx
│   │       ├── signup-form.tsx
│   │       └── actions.ts
│   │
│   ├── (protected)/
│   │   ├── layout.tsx                 # requireUser() or redirect('/login?next=…'); nav + <SignOutButton/>
│   │   ├── dashboard/
│   │   │   ├── page.tsx               # dynamic, no-store; habits + today's completions + stats
│   │   │   ├── loading.tsx
│   │   │   ├── habit-list.tsx         # client: rows, completion checkboxes
│   │   │   ├── habit-form.tsx         # client: add/edit
│   │   │   └── actions.ts             # 'use server': createHabit / updateHabit / deleteHabit / toggleCompletion
│   │   └── habits/
│   │       └── [id]/
│   │           ├── page.tsx           # requireUser() + getHabitById(id) ?? notFound(); calendar + stats
│   │           ├── edit-form.tsx
│   │           └── actions.ts
│   │
│   └── auth/
│       ├── callback/route.ts          # PKCE: exchangeCodeForSession → safeRedirect
│       ├── confirm/route.ts           # OTP: verifyOtp({ token_hash, type }) → safeRedirect
│       └── signout/route.ts           # POST only: signOut → redirect('/')
│
├── middleware.ts                      # updateSession() + protected-route redirect + per-request CSP nonce
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                  # createBrowserClient (anon)
│   │   ├── server.ts                  # createServerClient over next/headers cookies (anon)
│   │   └── middleware.ts              # updateSession(request)
│   ├── data/
│   │   ├── habits.ts
│   │   ├── completions.ts
│   │   ├── stats.ts
│   │   └── profile.ts
│   ├── auth/
│   │   ├── require-user.ts
│   │   └── safe-redirect.ts
│   ├── validation/
│   │   └── schemas.ts                 # zod: habitInput, completionInput, authInput
│   └── security/
│       └── csp.ts                     # buildCsp(nonce): single source of the CSP string
│
├── components/
│   ├── ui/                            # Button, Input, Card, Dialog (Tailwind)
│   ├── auth/                          # SignOutButton (form → POST /auth/signout)
│   └── habits/                        # HabitCard, CompletionCheckbox, ColorPicker, StatTile
│
├── supabase/
│   ├── config.toml                   # local dev; auth.email.enable_confirmations = false for eval
│   ├── migrations/
│   │   ├── 0001_init.sql             # extensions + tables + constraints
│   │   ├── 0002_rls.sql              # enable + force + revoke/grant + all policies
│   │   ├── 0003_triggers.sql         # set_updated_at, handle_new_user, enforce_completion_owner
│   │   └── 0004_indexes.sql
│   └── seed.sql                      # optional local-only demo data (never run against prod)
│
├── tests/
│   ├── e2e/
│   │   ├── auth.setup.ts             # provisions User A + User B via the /signup UI; writes storage states
│   │   ├── fixtures.ts              # typed fixtures: userA page, userB page, anon request, apiAs(token)
│   │   ├── auth.spec.ts             # signup / login / bad-login / logout
│   │   ├── access-control.spec.ts  # signed-out cannot reach /dashboard or /habits/[id]; body has no private data
│   │   ├── habits-crud.spec.ts     # User A: create / read / edit / complete / stats / delete
│   │   ├── isolation-ui.spec.ts    # User B cannot see/edit/delete User A's habit via UI or /habits/[A-id]
│   │   ├── isolation-api.spec.ts   # User B token vs PostgREST: select/patch/delete/insert → [] or 403
│   │   └── security-headers.spec.ts
│   └── .auth/                        # gitignored: userA.json, userB.json storage states
│
├── playwright.config.ts             # projects: setup → chromium(userA) / chromium(userB) / anon
├── next.config.ts                   # headers(): static security headers (non-nonce)
├── tailwind.config.ts
├── postcss.config.mjs
├── tsconfig.json                    # strict: true
├── .env.local                       # gitignored — NEXT_PUBLIC_* values only
├── .env.example                     # committed — public var names only
├── .gitignore
├── package.json
│
├── ARCHITECTURE.md                  # this document
├── SECURITY_TESTS.md               # two-user test catalog + how to run + expected results
├── DEPLOYMENT_VERIFICATION.md       # post-deploy checklist
└── SECURITY_AUDIT.md               # threat/control matrix + first & fresh-context scan results
```

---

## 7. Testing strategy (Playwright)

### 7.1 Environment

- CI runs against **`supabase start`** (local Docker stack); `supabase db reset` applies `supabase/migrations/*` so RLS in tests is exactly what ships. Also runnable against the hosted eval project.
- `config.toml` sets `auth.email.enable_confirmations = false` locally so programmatic/UI logins work.
- `.env.test` (gitignored) holds only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### 7.2 Provisioning two real users — no service-role key

`tests/e2e/auth.setup.ts` (a Playwright "setup" project, runs once):

- For User A (`a+<runId>@habit.test`) and User B (`b+<runId>@habit.test`), unique per run:
  - Drive the real `/signup` UI → lands authenticated → `page.context().storageState({ path: 'tests/.auth/userX.json' })`.
  - Obtain each user's `access_token` + `id` via a throwaway `supabase.auth.signInWithPassword` using the **anon** client, and write them to a gitignored JSON for the direct-API tests.
- No teardown needed: unique per-run emails; test rows are harmless and RLS-isolated. (Optional: a local `psql` cleanup script run manually against the local stack.)

### 7.3 Playwright projects

```
setup            → auth.setup.ts
chromium-userA   → storageState: tests/.auth/userA.json   depends: [setup]
chromium-userB   → storageState: tests/.auth/userB.json   depends: [setup]
anon             → no storageState                        depends: [setup]
```

Fixtures expose `userAPage`, `userBPage`, `anonRequest`, and `apiAs(token)` — a raw `request` context with header `apikey: <ANON>` + `Authorization: Bearer <token>`.

### 7.4 Test cases

**A. Auth (`auth.spec.ts`)**
1. Signup with a fresh email → authenticated on `/dashboard`; `apiAs(newToken).get('/rest/v1/profiles?select=id')` returns exactly that id.
2. Login with valid credentials → `/dashboard`.
3. Login with wrong password → stays on `/login`, generic error, no `sb-` auth cookie.
4. Login with a non-existent email → **identical** generic error (enumeration check).
5. Logout → POST `/auth/signout` → `/`; then `goto('/dashboard')` ends on `/login`; auth cookie cleared.

**B. Signed-out access control (`access-control.spec.ts`)**
6. `anonRequest.get('/dashboard', { maxRedirects: 0 })` → 307, `Location` = `/login?…`, **and** `response.text()` contains no seeded habit name.
7. `anon` browser `goto('/dashboard')` → final URL `/login`.
8. `anonRequest.get('/habits/<A-id>', { maxRedirects: 0 })` → redirect; body has no habit data.
9. `apiAs(null)` `GET /rest/v1/habits?select=*` → 200 with body `[]` (or 401), never rows.

**C. CRUD for User A (`habits-crud.spec.ts`)**
10. Create habit "Read 30 min" → appears; capture its `id`.
11. Edit name/color → persists after reload.
12. Mark complete for today → checkbox checked; `GET /rest/v1/habit_completions?habit_id=eq.<id>` (as A) → 1 row, `completed_date = today`.
13. Toggle twice for the same date → still exactly 1 row (UNIQUE), no 500.
14. Stats tile reflects the completion (streak = 1).
15. Delete habit → gone; completions cascade-gone (`[]` as A).

**D. Cross-account isolation — UI (`isolation-ui.spec.ts`, User B)**
Precondition: User A has habit `A-id` named `"A-SECRET-HABIT"`.
16. User B dashboard: `body` does not contain `A-SECRET-HABIT`.
17. User B `goto('/habits/<A-id>')` → 404/not-found; page content has no `A-SECRET-HABIT`.
18. User B invokes the edit action with a crafted `id` → error/no-op; verify via API as A the name is unchanged.
19. User B invokes delete of `A-id` → no-op; verify via API as A the habit still exists.

**E. Cross-account isolation — direct API with User B's token (`isolation-api.spec.ts`)**
20. `GET /habits?select=*&id=eq.<A-id>` → 200, `body.length === 0`.
21. `GET /habits?select=*` → only rows with `user_id === userB.id` (assert every row).
22. `GET /habit_completions?habit_id=eq.<A-id>` → `[]`.
23. `PATCH /habits?id=eq.<A-id>` `{ "name": "HACKED" }` → `[]` (0 rows); as A confirm unchanged.
24. `DELETE /habits?id=eq.<A-id>` → 0 rows; as A confirm still present.
25. `POST /habit_completions` `{ habit_id: <A-id>, user_id: <B-id> }` → 403.
26. `POST /habit_completions` `{ habit_id: <A-id>, user_id: <A-id> }` → 403.
27. `POST /habits` `{ name: "x", user_id: <A-id> }` → 403 (`WITH CHECK`).
28. Repeat 20 / 23 / 25 with **no bearer token** → `[]` / 401 / 403.

**F. Caching / freshness**
29. As A: create a habit via UI, reload `/dashboard` in the same context → visible. Open a fresh User A context → also visible (no stale Full Route Cache).

**G. Security headers (`security-headers.spec.ts`)**
30. `request.get('/')` and `/dashboard` → `content-security-policy` contains `script-src 'self' 'nonce-` and `'strict-dynamic'`, does **not** contain `unsafe-inline` in `script-src`, contains `frame-ancestors 'none'`, `connect-src` includes the Supabase origin; `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy`, `permissions-policy` present.

### 7.5 Assertion discipline

- Every isolation test asserts on `response.status()` and parsed JSON length/contents — never only on URL or redirect.
- UI isolation tests also assert absence of the victim's data string in `page.content()`.
- `maxRedirects: 0` so the pre-redirect body itself is inspected for leakage.
- A shared `expectNoLeak(text)` helper centralizes the "must not contain User A private data" check.

---

## 8. Deployment & environment variables

### 8.1 Variables

| Variable | Public? | Where it lives | Needed by the running app? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Vercel (Prod + Preview), `.env.local`, CI | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Vercel (Prod + Preview), `.env.local`, CI | Yes — the only Supabase key the app uses |
| `NEXT_PUBLIC_SITE_URL` | Public | Vercel (per environment), `.env.local` | Yes — builds `emailRedirectTo` / callback URLs |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | **Nowhere in this project.** Stays in the Supabase dashboard only. | **No** |
| `SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_PASSWORD` | Secret | CI only (migration job), if CI runs `supabase db push` | Build/CI only |

**Why the service-role key is not needed at runtime:** every runtime operation is a per-user CRUD/read expressible as the authenticated user under RLS; profile creation is a DB trigger; there is no admin/reporting surface and no background job in v1. Not provisioning it on Vercel removes the most dangerous secret from the runtime blast radius.

### 8.2 `.env.example` (committed)

```
# Public — safe for the browser bundle
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 8.3 `.gitignore` (key entries)

```
.env
.env.local
.env.*.local
.env.test
!.env.example
/.vercel
/node_modules
/.next
/test-results
/playwright-report
/tests/.auth
```

### 8.4 Verifying `.env.local` is untracked and clean

- `git check-ignore -v .env.local` → prints a rule (ignored).
- `git ls-files | Select-String '\.env'` → only `.env.example`.
- `git log --all --full-history -- .env.local .env .env.test` → **no output** (never committed).
- If a secret is ever found in history: rotate the affected keys in Supabase immediately, then purge history (`git filter-repo`) and force-push — and **stop and report**, per brief §7.

### 8.5 Setting vars in Vercel

- Vercel → Project → Settings → Environment Variables.
- Set the three `NEXT_PUBLIC_*` vars for **Production** and **Preview**.
- `NEXT_PUBLIC_SITE_URL` (Prod) = the production domain; (Preview) = the Vercel deployment URL.
- **Do not** add `SUPABASE_SERVICE_ROLE_KEY` in any environment.
- Supabase → Authentication → URL Configuration: Site URL = production domain; Redirect URLs include `https://<prod-domain>/auth/callback`, `https://<prod-domain>/auth/confirm`, and `http://localhost:3000/**`.

### 8.6 Preview protection

Enable **Vercel Deployment Protection → Vercel Authentication** for **Preview** deployments so anonymous users cannot load a preview URL. Production stays public (it is the app) and is covered by the app's own auth + RLS.

### 8.7 Migration workflow (Supabase CLI)

- Schema lives **only** in `supabase/migrations/*.sql`, hand-written so reviewers read intent.
- Local: `supabase start` then `supabase db reset` applies every migration + `seed.sql` from scratch — this is what CI does before Playwright.
- New change: `supabase migration new <slug>` → edit SQL → `supabase db reset` to test.
- Deploy to the hosted project: `supabase link --project-ref <ref>` then `supabase db push`. Production DB changes never happen through the dashboard SQL editor without a matching migration file.
- Any developer reconstructs the schema with `supabase db reset` (local) or `supabase db push` (remote). RLS, triggers, grants, and indexes are all in migrations.

---

## 9. Security headers

**Where configured:**

- **`middleware.ts`** owns `Content-Security-Policy` — it needs a fresh per-request nonce. Each request: `nonce = base64(crypto.getRandomValues(16))`, set on the forwarded request header `x-nonce` (Server Components / `next/script` read it) and used to build the CSP response header via `lib/security/csp.ts`.
- **`next.config.ts` `headers()`** owns the static headers: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`.
- Protected routes additionally get `Cache-Control: private, no-store`.

**Content-Security-Policy (production):**

```
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self' 'nonce-<PER_REQUEST_NONCE>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' https://<PROJECT_REF>.supabase.co wss://<PROJECT_REF>.supabase.co;
worker-src 'self' blob:;
manifest-src 'self';
upgrade-insecure-requests;
```

- **`script-src`: nonce + `'strict-dynamic'`, no `'unsafe-inline'`, no `'unsafe-eval'`** — the strict posture. Next.js App Router propagates the nonce to its bootstrap inline scripts when a nonce is present. In **development** only, `csp.ts` adds `'unsafe-eval'` (React Refresh needs it); production must not have it. If a nonce-CSP proves incompatible with a required Next feature during implementation, the documented fallback is hash-based `script-src` for the framework bootstrap — never `'unsafe-inline'`.
- **`style-src 'self' 'unsafe-inline'`** — a deliberate, documented concession: Next/Tailwind inject inline `<style>` and Next does not reliably nonce styles. Style injection cannot execute script or steal cookies, so this is an accepted residual risk.
- **`connect-src`** pinned to `'self'` + the exact Supabase origin — the anti-exfiltration control.
- **`frame-ancestors 'none'`** + **`X-Frame-Options: DENY`** — clickjacking (old browsers honor only the header).

**Other headers:**

| Header | Value |
|---|---|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

`security-headers.spec.ts` (case #30) fetches `/` and `/dashboard` and asserts each value, specifically that `script-src` contains `'nonce-'` and `'strict-dynamic'` and not `'unsafe-inline'` / `'unsafe-eval'` in production.

---

## 10. Git & commit hygiene

- One Git repo at `habit-tracker/`, initialized before any code.
- **`.env.local` is never committed** (see §8.3–§8.4). First commit adds `.gitignore` before anything else.
- **Conventional, descriptive commit messages.** Examples for this project:
  - `feat: scaffold Next.js app with TypeScript and Tailwind`
  - `feat: add Supabase SSR clients and env wiring`
  - `feat: add RLS-protected habit and completion migrations`
  - `feat: add authentication (signup, login, logout, protected routes)`
  - `feat: add habit CRUD and completion tracking on the dashboard`
  - `feat: add habit detail page with auth + RLS authorization`
  - `test: add auth, CRUD, and cross-account authorization E2E tests`
  - `security: add CSP nonce middleware and static security headers`
  - `deploy: add Vercel config and environment documentation`
- **Never** `update`, `fix stuff`, `changes`, `test`, `wip`.
- Commit at the end of each phase / major feature, after its tests pass.

---

## 11. Security scan workflow (brief §15–§16)

1. When the app is built, deployed, and verified, run **`/security-scan`** (the full scan dispatching all three scanners in parallel).
2. Fix **every** Critical and every High finding — investigate each, do not dismiss.
3. Re-run the E2E suite, re-verify the production deployment, commit the fixes with a `security:` message.
4. **STOP.** Do not run the second scan in this context. Report that the first pass is complete and a fresh Claude Code context is required.
5. In a new session, run `/security-scan` again against the repo with no reliance on prior context. Require **0 Critical, 0 High**. Repeat with another fresh context if anything remains.
6. Record dates, both scan results, and findings fixed in `SECURITY_AUDIT.md`.

---

## 12. Required external / manual actions (cannot be done from code)

These are the user's to perform; each is called out again in the relevant phase.

| # | Action | Needed for |
|---|---|---|
| 1 | Install **Node.js 20 LTS + npm**, **Git**, **Supabase CLI** on the build machine | All of Phase 2+ |
| 2 | Provide the **Supabase project URL** and **anon key** (Project Settings → API) for `.env.local` and Vercel | Phase 2, 5 |
| 3 | Supabase → Authentication → Providers → Email: **disable "Confirm email"** | Signup/login flow, Playwright user provisioning |
| 4 | Supabase → Authentication → URL Configuration: set **Site URL** + **Redirect URLs** (localhost now; prod domain after first deploy) | Auth redirects, email links |
| 5 | Apply migrations to the hosted project: `supabase login`, `supabase link --project-ref <ref>`, `supabase db push` (or run each migration file in order via the SQL editor if CLI is unavailable — the files remain the source of truth) | Phase 2 |
| 6 | Create a **GitHub repo** and push, **or** install the **Vercel CLI** | Phase 5 |
| 7 | Vercel: create project, set the three `NEXT_PUBLIC_*` env vars for Production + Preview, deploy | Phase 5 |
| 8 | Vercel: enable **Deployment Protection (Vercel Authentication)** for Preview | Brief §13 |
| 9 | After deploy: provide the **production URL** | Phase 5–6 verification |
| 10 | Run **`/security-scan`** (first pass, this session) and **again in a fresh session** (second pass) | Phase 6 |
| 11 | Confirm the **incognito live verification** steps (brief §14) or let me drive them with Playwright against the prod URL and review the output | Phase 5 |

I will not mark any dashboard-, deployment-, git-history-, or scan-dependent requirement complete without evidence (command output, screenshots, or your confirmation).

---

## 13. Build strategy (phases)

| Phase | Contents | Exit criteria |
|---|---|---|
| **1. Architecture** | Consult subagent, review vs. brief, write this file | ARCHITECTURE.md approved by the user |
| **2. Foundation** | `create-next-app` (TS, Tailwind, App Router); `@supabase/ssr` + `@supabase/supabase-js`; three Supabase clients; `.env.local` + `.env.example` + `.gitignore`; `git init` + first commit; migrations `0001`–`0004`; RLS enabled + forced immediately; apply to hosted project | `supabase db reset` clean; RLS assertion passes; app builds |
| **3. Core features** | `requireUser` + `safeRedirect`; `(public)` landing/login/signup + auth actions; `(protected)` layout; dashboard habit CRUD; completion tracking; stats; `/habits/[id]`; middleware (redirect + CSP nonce); `next.config.ts` headers | All pages work locally; every data op behind auth + RLS |
| **4. Testing** | Playwright config + projects + fixtures; specs A–G from §7.4; run green locally / CI | Full suite green, including two-user isolation (D, E) |
| **5. Deployment** | Push to GitHub; Vercel project + env vars; deploy; set Supabase URL config to prod; preview protection; live verification as a fresh incognito visitor; write `DEPLOYMENT_VERIFICATION.md` | Public URL works; incognito checks pass with evidence |
| **6. Security** | `/security-scan`; fix all Critical/High; re-test; re-verify prod; commit; **STOP**; fresh-context `/security-scan`; require 0/0; write `SECURITY_AUDIT.md` | Second scan (fresh context) reports 0 Critical, 0 High |

Documentation deliverables: `ARCHITECTURE.md` (this), `SECURITY_TESTS.md` (Phase 4), `DEPLOYMENT_VERIFICATION.md` (Phase 5), `SECURITY_AUDIT.md` (Phase 6).

---

## Appendix A — `requireUser()` and `safeRedirect()` contracts

- **`requireUser(): Promise<User>`** — builds the request-scoped server client, calls `supabase.auth.getUser()`. On `null`/error: `redirect('/login?next=' + encodeURIComponent(currentPathWithSearch))`. On success: returns the `User`. Never returns `null`.
- **`safeRedirect(raw, fallback = '/dashboard'): string`** — returns `fallback` unless `raw`, after `decodeURIComponent`, starts with a single `/` (not `//`, not `/\`), contains no backslash and no control chars (`\r \n \t \0`), and has no scheme. Guarantees an internal, same-origin path.

## Appendix B — Threat-to-control matrix (for SECURITY_AUDIT.md)

| Requirement | Primary control | Backup control(s) | Verified by |
|---|---|---|---|
| User B cannot read User A's habits | `habits_select_own` RLS | data layer `.eq('user_id', user.id)`; `notFound()` | E2E #16, #17, #20, #21 |
| User B cannot modify/delete User A's habits | `habits_update_own` / `habits_delete_own` RLS `USING` + `WITH CHECK` | Server Action `requireUser()` + ownership | E2E #18, #19, #23, #24 |
| No ownership spoofing on completions | `completions_insert/update_own` `WITH CHECK` (uid + habit `EXISTS`) | `enforce_completion_owner` trigger | E2E #25, #26, #27 |
| Signed-out cannot reach `/dashboard` or private data | RLS returns zero rows | middleware redirect; protected layout guard | E2E #6, #7, #9 |
| `/habits/[id]` protected by auth AND DB authz | `requireUser()` + RLS `SELECT` → `notFound()` | middleware `/habits` matcher | E2E #8, #17 |
| Service-role key never exposed | Not present in the repo; not in Vercel env | CI grep; `.gitignore` + history scan | DEPLOYMENT_VERIFICATION.md; CI |
| No XSS-driven session theft | Strict nonce CSP `script-src` | React escaping; DB length limits | E2E #30 |
| No stale cross-user cache | `force-dynamic` + `no-store` fetch | `Cache-Control: private, no-store`; `revalidatePath` | E2E #29 |
| No open redirect | `safeRedirect()` allowlist | — | E2E (hostile `next` values) |

---

## Appendix C — Critical files for implementation

- `supabase/migrations/0002_rls.sql` — the security boundary: enable/force RLS, revoke `anon`, and the full SELECT/INSERT/UPDATE/DELETE policy set with `USING`/`WITH CHECK` for all three tables.
- `supabase/migrations/0001_init.sql` + `0003_triggers.sql` — schema/constraints/indexes plus `handle_new_user`, `set_updated_at`, `enforce_completion_owner`.
- `lib/supabase/server.ts` + `lib/supabase/middleware.ts` — request-scoped anon clients, cookie bridging, `getUser()`-based sessions; where "no service-role client" is enforced by construction.
- `middleware.ts` — protected-route matcher/redirect, session refresh, per-request nonce CSP.
- `lib/data/habits.ts` + `lib/data/completions.ts` — `user_id` always from the verified session, never from client input.
- `tests/e2e/isolation-api.spec.ts` + `tests/e2e/isolation-ui.spec.ts` — cross-account tests asserting at the network/response level (status + JSON contents).
