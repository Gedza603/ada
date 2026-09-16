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

## Second pass (fresh context) — REQUIRED, not yet run

Per the brief's fresh-context requirement, this session must **not** run
the second pass itself. **A new Claude Code session must independently run
the security review** (again substituting `security-review` for
`/security-scan`, per the same user-approved substitution above, unless a
real `/security-scan` becomes available) against the current state of the
repository, with no reliance on this session's context or conclusions.

**Status:** ⏳ Pending. To be filled in by the fresh-context session:

- Date:
- Findings:
- Fixes applied (if any):
- Final Critical count:
- Final High count:

This file should be updated (not replaced) once that pass completes.
