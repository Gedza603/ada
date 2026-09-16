-- 0001_init.sql
-- Core schema: profiles, habits, habit_completions.
-- See ARCHITECTURE.md §2 for the full design rationale.

create extension if not exists pgcrypto; -- gen_random_uuid()

-- profiles: 1:1 with auth.users. Rows are created only by the
-- handle_new_user() trigger (0003_triggers.sql) — never by the client.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 80),
  timezone     text not null default 'UTC',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth.users, created by the on_auth_user_created trigger. Never insertable by the client.';

-- habits: owned by a user. Ownership is enforced by RLS in 0002_rls.sql.
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

comment on table public.habits is 'One habit per row, owned by user_id. RLS restricts every operation to the owning user.';

-- habit_completions: one row per (habit, date). user_id is denormalized from
-- habits.user_id for simple, index-friendly RLS predicates, and is kept in
-- sync by the enforce_completion_owner() trigger in 0003_triggers.sql.
create table public.habit_completions (
  id             uuid primary key default gen_random_uuid(),
  habit_id       uuid not null references public.habits (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  completed_date date not null default current_date,
  created_at     timestamptz not null default now(),
  constraint habit_completions_unique_per_day unique (habit_id, completed_date)
);

comment on table public.habit_completions is 'A completion of a habit on a given date. user_id must equal the owning habit''s user_id (enforced by RLS + trigger).';
