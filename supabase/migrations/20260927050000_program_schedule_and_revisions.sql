-- Applied to the Supabase project on 2026-09-27.
-- The user's real weekly schedule, so the coach never has to guess it.
alter table public.training_goals
  add column lift_days smallint[] not null default '{}',
  add column class_days smallint[] not null default '{}',
  add column class_time text not null default '',
  add column session_minutes smallint not null default 75;

-- Programs are written in the background ('generating'), can fail ('failed'),
-- and can be a revision of another program (the user's change request).
alter table public.programs drop constraint programs_status_check;
alter table public.programs add constraint programs_status_check
  check (status in ('generating', 'failed', 'draft', 'active', 'replaced', 'completed'));
alter table public.programs
  add column error text,
  add column revision_of uuid references public.programs (id) on delete cascade,
  add column request text;
create index programs_revision_of_idx on public.programs (revision_of);
