-- 0002_rls.sql
-- THE SECURITY BOUNDARY. Every table's row-level access is decided here.
-- See ARCHITECTURE.md §4 for the full rationale and attack-combo table.

-- 1. Enable AND force RLS on every table, so even the table owner role is
--    subject to policies (defense in depth against future SECURITY DEFINER
--    code or a superuser connection).
alter table public.profiles          enable row level security;
alter table public.habits            enable row level security;
alter table public.habit_completions enable row level security;

alter table public.profiles          force row level security;
alter table public.habits            force row level security;
alter table public.habit_completions force row level security;

-- 2. The anon role gets no table privileges at all: an unauthenticated
--    PostgREST call returns 401 / no rows, never data, independent of policies.
revoke all on public.profiles, public.habits, public.habit_completions from anon;

-- 3. The authenticated role relies entirely on RLS for row scoping. It has
--    no BYPASSRLS attribute, so these grants are only as permissive as the
--    policies below allow.
grant select, update                 on public.profiles          to authenticated;
grant select, insert, update, delete on public.habits            to authenticated;
grant select, insert, update, delete on public.habit_completions to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- No INSERT policy: rows are created only by the handle_new_user() trigger.
-- No DELETE policy: profile lifetime is bound to auth.users via ON DELETE CASCADE.

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ( (select auth.uid()) = id );

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using      ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

-- ---------------------------------------------------------------------------
-- habits
-- ---------------------------------------------------------------------------

create policy "habits_select_own"
  on public.habits for select
  to authenticated
  using ( (select auth.uid()) = user_id );

create policy "habits_insert_own"
  on public.habits for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "habits_update_own"
  on public.habits for update
  to authenticated
  using      ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "habits_delete_own"
  on public.habits for delete
  to authenticated
  using ( (select auth.uid()) = user_id );

-- ---------------------------------------------------------------------------
-- habit_completions
-- ---------------------------------------------------------------------------
-- The completion's user_id is guaranteed to match the owner of habit_id by
-- THREE independent mechanisms: (1) auth.uid() = user_id below, (2) the
-- EXISTS sub-check that the referenced habit is owned by the caller, and
-- (3) the enforce_completion_owner() BEFORE trigger in 0003_triggers.sql.

create policy "completions_select_own"
  on public.habit_completions for select
  to authenticated
  using ( (select auth.uid()) = user_id );

create policy "completions_insert_own"
  on public.habit_completions for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.habits h
      where h.id = habit_id
        and h.user_id = (select auth.uid())
    )
  );

create policy "completions_update_own"
  on public.habit_completions for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.habits h
      where h.id = habit_id
        and h.user_id = (select auth.uid())
    )
  );

create policy "completions_delete_own"
  on public.habit_completions for delete
  to authenticated
  using ( (select auth.uid()) = user_id );
