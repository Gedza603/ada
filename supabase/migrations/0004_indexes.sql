-- 0004_indexes.sql
-- RLS predicates are `user_id = auth.uid()`, so user_id must be indexed on
-- every table carrying it or each policy check is a sequential scan.

create index habits_user_id_idx        on public.habits (user_id);
create index habits_user_created_idx   on public.habits (user_id, created_at desc);

create index completions_user_id_idx   on public.habit_completions (user_id);
create index completions_habit_id_idx  on public.habit_completions (habit_id);
create index completions_user_date_idx on public.habit_completions (user_id, completed_date);
-- UNIQUE (habit_id, completed_date) from 0001_init.sql already provides an
-- index for per-habit calendar queries.
