-- Applied to the Supabase project on 2026-09-27.
-- One onboarding journal per user: the start of the coach's long-term memory.
create table public.journals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Row level security: a user can only see and change their own journal.
alter table public.journals enable row level security;

create policy "Users read own journal" on public.journals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own journal" on public.journals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own journal" on public.journals
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own journal" on public.journals
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Keep updated_at current on every change.
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger journals_set_updated_at before update on public.journals
  for each row execute function public.set_updated_at();
