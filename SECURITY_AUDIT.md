# SECURITY_AUDIT.md

## Process note: `/security-scan` substitution

The brief specifies running `/security-scan` — described as dispatching
three scanners in parallel. That command is **not available** in this
Claude Code environment; the closest available tool is the `security-review`
skill. The user was asked and explicitly approved substituting
`security-review` for both required passes. Where `security-review`'s
built-in diff-based framing didn't apply (there was no PR diff — everything
was already committed to `main`), the review was pointed at the entire
application's security-critical surface instead, following the skill's own
methodology and false-positive-filtering criteria.

---

## First pass

**Date:** 2026-09-16
**Method:** `security-review` skill, adapted to review the full codebase
(not a diff) via a dedicated review sub-task, following the skill's
standard categories, exclusions, and confidence bar (only report findings
where exploitability is >80% confident).

**Scope reviewed:** `ARCHITECTURE.md` (threat model), all four
`supabase/migrations/*.sql` files, `proxy.ts` and every `lib/supabase/*.ts`
file, `lib/auth/*.ts`, `lib/data/*.ts`, `lib/validation/schemas.ts`,
`lib/security/csp.ts`, every route under `app/(public)/`,
`app/(protected)/`, and `app/auth/*`, all `components/**`,
`next.config.ts`, and the Playwright suite in `tests/e2e/*.ts` (checked
for accidental test-only backdoors in shipped code).

**Result: 0 High, 0 Medium, 0 Low findings.**

Specifically checked and confirmed clean:

- RLS enabled **and forced** on all three tables; `anon` has zero table
  grants; every policy's `USING`/`WITH CHECK` matches `auth.uid()` against
  the correct column; `habit_completions` ownership is enforced three ways
  (RLS `= user_id`, RLS `EXISTS` sub-check on the habit, and the
  `enforce_completion_owner()` trigger).
- No Server Action or data-layer function ever takes `user_id`/ownership
  from client input; all derive it from `requireUser()` (`getUser()`,
  never `getSession()`).
- `/habits/[id]` IDOR: a foreign or nonexistent habit id is
  indistinguishable (`404`, no body leakage) — both auth (`requireUser()`)
  and DB authorization (RLS-scoped `getHabitById()`) are enforced.
- No service-role key anywhere in the codebase (grepped for
  `service_role`/`SERVICE_ROLE_KEY`; only doc/comment references explaining
  its absence).
- No XSS surface: no `dangerouslySetInnerHTML`/`eval`/`innerHTML`; the one
  user-controlled value reaching a `style` attribute (`habit.color`) is
  regex-constrained both client- and DB-side.
- CSP: nonce + `strict-dynamic`, no `unsafe-inline`/`unsafe-eval` in
  production, `frame-ancestors 'none'`, `connect-src` pinned to the exact
  Supabase origin.
- `safeRedirect()` blocks open redirects consistently across `/login`,
  `/signup`, `/auth/callback`, `/auth/confirm`.
- CSRF: mutations are Server Actions (same-origin enforced by Next.js);
  `/auth/signout` is POST-only, `SameSite=Lax`.
- No stale cross-user caching: protected pages are `force-dynamic` /
  `revalidate = 0` / `fetchCache: 'default-no-store'`;
  `Cache-Control: private, no-store` set on protected paths in `proxy.ts`.

**Dependency check:** `npm audit` — **0 vulnerabilities** across all
dependencies.

**Findings to fix:** none. No Critical or High findings were produced, so
no fix/re-test/re-verify/commit cycle was required for this pass.

---

## Second pass (fresh context)

**Date:** 2026-09-16
**Method:** A separate, freshly-spawned Claude Code session with no memory
of the first pass (or of this file) performed the review. It read the
codebase cold and formed its own conclusions first, and only opened this
file afterward to learn the "Second pass" section's expected shape —
deliberately to avoid anchoring on the first pass's clean result.

The session attempted to invoke the `security-review` skill directly but
hit the same substitution issue noted above (the skill's git-repo
precondition checks against a working directory outside this repo and
couldn't be redirected into it), so — per the same user-approved
substitution — it applied the skill's methodology manually: the standard
vulnerability categories, the standard exclusion list, and the same >80%
exploitability confidence bar before reporting anything.

**Scope reviewed:** `ARCHITECTURE.md`, all four `supabase/migrations/*.sql`
files plus `supabase/config.toml`, `proxy.ts` and every
`lib/supabase/*.ts` file, `lib/auth/*.ts`, `lib/data/*.ts`,
`lib/validation/schemas.ts`, `lib/security/csp.ts`, every route under
`app/(public)/`, `app/(protected)/`, and `app/auth/*`, all `components/**`,
`next.config.ts`, `package.json`, `.env.local`/`.env.example`/`.gitignore`,
and the full Playwright suite (`tests/e2e/*.spec.ts`, `auth.setup.ts`,
`fixtures.ts`) checked for shipped test-only backdoors. Also confirmed via
`git log --all -- .env.local` that no secret was ever committed.

**Result: 0 Critical, 0 High, 0 Medium, 0 Low findings.**

Beyond a surface read, this pass specifically stress-tested: CSRF-ability
of `/auth/signout` (a Route Handler, not a Server Action — verified
`SameSite=Lax` still blocks the cross-site POST case since it doesn't get
Next's automatic Server Action origin check); `safeRedirect()` against
backslash/double-slash/control-char/decode bypass variants; whether a user
can tamper with `habits`/`profiles` columns beyond what the app UI sends
via direct PostgREST calls (possible only against their own already-owned
rows — self-only data-integrity noise, not cross-user or privilege
escalation, so it doesn't clear the confidence bar); and whether the
unused browser Supabase client or `getProfile()` are reachable from any
live data path that could bypass the server-action-only architecture
(confirmed dead code, zero exploitable path).

It independently re-confirmed: RLS enabled and forced on all three tables
with `anon` fully revoked and no `BYPASSRLS`; every policy's
`USING`/`WITH CHECK` correctly scoped; `habit_completions` ownership
enforced three ways; no service-role key anywhere in the repo; no XSS
surface; CSP nonce + `strict-dynamic` with no `unsafe-inline`/`unsafe-eval`
in production; no shipped test-only backdoors in the e2e suite (users are
provisioned only through the real `/signup` UI flow).

Two items were called out as pre-existing, already-disclosed accepted
risk rather than new findings: `enable_confirmations = false` (documented
evaluation-only trade-off in `ARCHITECTURE.md`) and
`style-src 'self' 'unsafe-inline'` in the CSP (documented, justified —
style injection alone can't execute script or exfiltrate cookies).

**Dependency check:** `npm audit` — **0 vulnerabilities** (451 total
dependencies: 31 prod, 383 dev, 88 optional).

**Fixes applied:** none — no Critical or High findings were produced, so
the fix/re-verify cycle was not triggered.

**Final Critical count: 0**
**Final High count: 0**

**Caveat (explicitly flagged by the reviewing session, not verifiable
from static code):** two things live outside this repo and weren't and
couldn't be checked by either pass — the hosted Supabase project's
dashboard-configured password policy / email-confirmation setting, and a
live token-replay/session-fixation check against the actual deployed
production URL. Both are infra/config concerns rather than codebase
findings.

---

## Outcome

Two independent passes (different sessions, second with no reliance on
the first's context or conclusions) both confirm **0 Critical / 0 High**
findings, with a clean `npm audit` on both runs. Per the brief's
completion criterion, the project is considered finished from a security
standpoint, subject to the infra-level caveat above (Supabase dashboard
auth settings; production-only session checks) being out of scope for a
static codebase review.
