-- Applied to the Supabase project on 2026-09-27.
-- The coach's one sentence per user per day. Stored so reopening the app
-- shows the same sentence instead of calling Claude again.
create table public.coach_messages (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  sentence text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.coach_messages enable row level security;

create policy "Users read own coach messages" on public.coach_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own coach messages" on public.coach_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users delete own coach messages" on public.coach_messages
  for delete to authenticated using ((select auth.uid()) = user_id);
