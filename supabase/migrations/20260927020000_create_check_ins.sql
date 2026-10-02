-- Applied to the Supabase project on 2026-09-27.
-- Morning check-in: one per user per day.
create table public.check_ins (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  sleep_hours numeric(3, 1) not null check (sleep_hours between 0 and 16),
  sleep_quality smallint not null check (sleep_quality between 1 and 5),
  feeling smallint not null check (feeling between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.check_ins enable row level security;

create policy "Users read own check-ins" on public.check_ins
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own check-ins" on public.check_ins
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own check-ins" on public.check_ins
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own check-ins" on public.check_ins
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger check_ins_set_updated_at before update on public.check_ins
  for each row execute function public.set_updated_at();

-- The coach now explains itself, and rewrites the day's message once a check-in arrives.
alter table public.coach_messages
  add column why text,
  add column check_in_updated_at timestamptz;

create policy "Users update own coach messages" on public.coach_messages
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
