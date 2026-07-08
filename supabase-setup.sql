-- FretLab sync: one row per user, whole app state as a JSON blob.
-- Paste this into the Supabase SQL editor and run it once.

create table if not exists public.fretlab_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.fretlab_state enable row level security;

create policy "select own row" on public.fretlab_state
  for select using (auth.uid() = user_id);
create policy "insert own row" on public.fretlab_state
  for insert with check (auth.uid() = user_id);
create policy "update own row" on public.fretlab_state
  for update using (auth.uid() = user_id);
