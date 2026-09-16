-- 0003_triggers.sql
-- updated_at maintenance, profile auto-creation, and completion-ownership
-- enforcement. See ARCHITECTURE.md §2.3-§2.5.
--
-- All SECURITY DEFINER functions here use `set search_path = ''` and fully
-- qualified names, per Supabase's hardening guidance (prevents search_path
-- hijacking). They run as their owner (the migration role, which has
-- BYPASSRLS), which is why they can act across the RLS boundary despite
-- FORCE ROW LEVEL SECURITY on every table — the `authenticated` app role
-- never has that bypass.

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger habits_set_updated_at
  before update on public.habits
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile auto-creation on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

-- ---------------------------------------------------------------------------
-- Completion ownership enforcement (defense in depth alongside RLS §4.3)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_completion_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
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
