-- Applied to the Supabase project on 2026-10-02.
-- The chat with the coach about the program. When the user and coach agree on
-- a change, the coach's message carries a `proposal`: the instruction the app
-- sends to the program writer if the user taps "Rewrite my program".
create table public.coach_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'coach')),
  content text not null,
  proposal text,
  created_at timestamptz not null default now()
);

create index coach_chats_user_created_idx on public.coach_chats (user_id, created_at);

alter table public.coach_chats enable row level security;

create policy "Users read own coach chats" on public.coach_chats
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own coach chats" on public.coach_chats
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users delete own coach chats" on public.coach_chats
  for delete to authenticated using ((select auth.uid()) = user_id);
