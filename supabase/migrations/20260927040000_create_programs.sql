-- Applied to the Supabase project on 2026-09-27.
-- A 4-week training block written by the coach. 'draft' until the user approves it.
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'active', 'replaced', 'completed')),
  name text not null,
  plan jsonb not null,
  starts_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index programs_user_id_idx on public.programs (user_id, created_at desc);

alter table public.programs enable row level security;
create policy "Users manage own programs" on public.programs
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create trigger programs_set_updated_at before update on public.programs
  for each row execute function public.set_updated_at();

-- Program workouts remember which program day they came from, and every
-- finished workout keeps its results (with PR flags) for the summary screen.
alter table public.workouts
  add column program_id uuid references public.programs (id) on delete cascade,
  add column program_week smallint,
  add column program_day smallint,
  add column results jsonb;
create index workouts_program_id_idx on public.workouts (program_id);
create unique index workouts_one_per_program_day on public.workouts (program_id, program_week, program_day)
  where program_id is not null;
