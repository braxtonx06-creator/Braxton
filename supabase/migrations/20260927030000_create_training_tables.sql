-- Applied to the Supabase project on 2026-09-27.
-- What the user is training for (picked after the journal).
create table public.training_goals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  focuses text[] not null check (cardinality(focuses) > 0),
  primary_focus text not null,
  updated_at timestamptz not null default now()
);

-- A workout: the plan the coach wrote plus what the user logged.
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('test', 'program')),
  title text not null,
  plan jsonb not null,
  log jsonb not null default '{}'::jsonb,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workouts_user_id_idx on public.workouts (user_id, created_at desc);

-- Tested numbers (estimated maxes, jump distance, sprint time...).
create table public.baselines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid references public.workouts (id) on delete set null,
  metric text not null,
  name text not null,
  value numeric not null,
  unit text not null,
  better text not null check (better in ('higher', 'lower')),
  measured_on date not null,
  created_at timestamptz not null default now()
);
create index baselines_user_id_idx on public.baselines (user_id, metric, measured_on desc);
create index baselines_workout_id_idx on public.baselines (workout_id);

alter table public.training_goals enable row level security;
alter table public.workouts enable row level security;
alter table public.baselines enable row level security;

create policy "Users manage own training goals" on public.training_goals
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own workouts" on public.workouts
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own baselines" on public.baselines
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger training_goals_set_updated_at before update on public.training_goals
  for each row execute function public.set_updated_at();
create trigger workouts_set_updated_at before update on public.workouts
  for each row execute function public.set_updated_at();
