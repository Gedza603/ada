# SECURITY_TESTS.md

This documents the Playwright end-to-end test suite in `tests/e2e/`, with
emphasis on the two mandatory security requirements: cross-account
authorization (brief §10, §11) and signed-out access control (brief §10).

All tests run against a real Next.js server (local dev, or a deployed URL
via `PLAYWRIGHT_BASE_URL`) and a real Supabase project — no mocking. Two
real accounts, User A and User B, are provisioned through the app's actual
`/signup` flow before every run; no service-role key is used anywhere in
this suite (see ARCHITECTURE.md §0.2, §7.2).

## How to run

```bash
# against local dev (starts `next dev` automatically)
npx playwright test

# against a deployed URL, e.g. the Vercel production deployment
$env:PLAYWRIGHT_BASE_URL = "https://<your-app>.vercel.app"
npx playwright test

# view the last HTML report
npx playwright show-report
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to be
available (loaded from `.env.local` automatically by `playwright.config.ts`).
Requires Supabase → Authentication → Providers → Email → **"Confirm email"
OFF** for this project, so `/signup` returns an active session immediately
and the `setup` project (`auth.setup.ts`) can provision User A / User B.

## Test files and what each proves

| File | Requirement covered |
|---|---|
| `auth.setup.ts` | Provisions User A and User B via the real `/signup` UI; saves a Playwright storage state and an independently-obtained bearer token per account. |
| `auth.spec.ts` | Sign up → dashboard → sign out → dashboard blocked again. Log in with valid credentials. Login fails with **one identical generic error** for a wrong password AND for a non-existent email (no account enumeration). Signed-out visitor redirected off `/dashboard`. |
| `access-control.spec.ts` | Signed-out requests to `/dashboard` and to a guessed `/habits/<uuid>` are asserted at the **response level** (`maxRedirects: 0`, status code, `Location` header, and body length) — not just "ended up on /login" after following redirects. Direct anonymous PostgREST calls (no bearer token) against `habits` and `habit_completions` return `401` or `[]`, never rows; an anonymous `INSERT` is rejected. |
| `habits-crud.spec.ts` | User A creates, views, edits, marks complete, and deletes a habit — end to end through the real UI and real database. |
| `isolation-ui.spec.ts` | **The required two-user test, UI path.** User A creates a private habit; User B's dashboard never contains its name; User B navigating directly to `/habits/<A's-id>` gets a `404 Not Found` page, not the habit. |
| `isolation-api.spec.ts` | **The required two-user test, direct database path.** With User B's own bearer token against Supabase's PostgREST API directly (bypassing the Next.js app entirely): User B cannot read, modify, or delete User A's habit; a `habit_completions` insert against User A's habit is rejected regardless of which `user_id` is sent. |
| `security-headers.spec.ts` | `/`, `/login`, `/signup`, and `/dashboard` all carry `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and a `Content-Security-Policy` whose `script-src` has a nonce + `'strict-dynamic'` and no `'unsafe-inline'`. |

## The required two-user authorization test, in detail

**Setup:** User A and User B are two distinct, independently-authenticated
accounts (`auth.setup.ts`). User A creates a habit only they should be able
to see, change, or remove.

**`isolation-ui.spec.ts` (browser, as User B):**
1. Direct URL access — `userBPage.goto('/habits/<A-id>')` → HTTP 404, page
   renders the generic "Page not found" boundary, and the response never
   contains User A's habit name.
2. User B's own dashboard is scanned for User A's habit name and must not
   contain it.

**`isolation-api.spec.ts` (direct PostgREST, as User B, bypassing the app):**
1. **Read** — `GET /rest/v1/habits?id=eq.<A-id>` with User B's token → `200`
   with an **empty array**, not a `403`. (RLS filters the row out entirely
   rather than revealing that it exists.)
2. **List** — every row returned by `GET /rest/v1/habits` for User B has
   `user_id === userB.id`; User A's habit id is absent.
3. **Modify** — `PATCH /rest/v1/habits?id=eq.<A-id>` with User B's token
   affects **zero rows**; re-checked as User A, the name is unchanged.
4. **Delete** — `DELETE /rest/v1/habits?id=eq.<A-id>` with User B's token
   affects **zero rows**; re-checked as User A, the habit still exists.
5. **Spoofed ownership on insert** — `POST /rest/v1/habit_completions` with
   `habit_id` = User A's habit, tried both with `user_id` = User A's id and
   with `user_id` = User B's id — both rejected (`enforce_completion_owner`
   trigger + RLS `WITH CHECK`, ARCHITECTURE.md §4.3).
6. **No token at all** — the same habit is unreachable via the anon key
   alone (`401` or `[]`).

**Expected result (all of the above):** User B cannot read, modify, or
delete User A's data, under any of: the UI, a direct URL, or a direct
database call with User B's own valid credentials. This is enforced by
Postgres Row Level Security (`supabase/migrations/0002_rls.sql`), not by
anything in the Next.js application layer — the isolation-api tests
deliberately bypass the app to prove that.

## Signed-out direct URL test

`access-control.spec.ts` covers this at the response level: a raw,
unauthenticated request to `/dashboard` or to a guessed `/habits/<uuid>`
(via Playwright's `request` fixture, `maxRedirects: 0`) returns a redirect
whose body is empty/minimal — never the rendered page — and a direct
PostgREST read with no bearer token returns `401`/`[]`.

## Status of this document

This file describes the test suite as implemented in `tests/e2e/`. The full
suite (all 32 tests) passed against both local dev and the live production
deployment — see [DEPLOYMENT_VERIFICATION.md](./DEPLOYMENT_VERIFICATION.md)
§3 for the actual run output. This document is the test catalog and
explanation of what each test proves; that file has the pass/fail record.
