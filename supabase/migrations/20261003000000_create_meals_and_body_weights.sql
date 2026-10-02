-- Applied to the Supabase project on 2026-10-02.
-- Meal logging: one row per meal, optionally with a photo the coach analysed.
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  title text not null default '',
  -- [{ name, portion, calories, protein_g, carbs_g, fat_g }], as estimated then corrected by the user
  items jsonb not null default '[]'::jsonb,
  calories integer not null default 0 check (calories between 0 and 20000),
  protein_g numeric(6, 1) not null default 0,
  carbs_g numeric(6, 1) not null default 0,
  fat_g numeric(6, 1) not null default 0,
  photo_path text, -- object in the meal-photos bucket, "<user id>/<file>"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meals_user_day_idx on public.meals (user_id, day desc);

-- Body weight: one number per user per day.
create table public.body_weights (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  pounds numeric(5, 1) not null check (pounds between 50 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.meals enable row level security;
alter table public.body_weights enable row level security;

create policy "Users manage own meals" on public.meals
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own body weights" on public.body_weights
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger meals_set_updated_at before update on public.meals
  for each row execute function public.set_updated_at();
create trigger body_weights_set_updated_at before update on public.body_weights
  for each row execute function public.set_updated_at();

-- Meal photos: private bucket, each user only reaches files in their own folder ("<user id>/...").
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'image/webp']);

create policy "Users read own meal photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users upload own meal photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users delete own meal photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
