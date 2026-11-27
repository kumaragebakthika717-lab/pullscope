-- Strength Vault: daily workout scheduling linked to the "Ultimate Strength Vault" chat.
-- One plan per user per day. Each plan owns an ordered list of exercises.

create table public.vault_context (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  context jsonb not null default '{}'::jsonb,
  transcript_tail text,
  transcript_exported_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_date date not null,
  title text not null,
  focus text not null default '',
  day_type text not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'completed', 'skipped')),
  source text not null default 'program' check (source in ('ai', 'program', 'manual')),
  rationale text,
  warnings jsonb not null default '[]'::jsonb,
  duration_min int,
  notes text,
  session_notes text,
  context_exported_at timestamptz,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  unique (user_id, plan_date)
);
create index on public.workout_plans (user_id, plan_date desc);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  position int not null,
  block text not null default 'main'
    check (block in ('warmup', 'jump', 'main', 'accessory', 'conditioning', 'cooldown')),
  name text not null,
  sets int,
  mass_kg numeric(6, 2),
  mass_note text,
  reps int,
  hold_seconds int,
  rest_seconds int,
  intensity_type text not null default 'rpe' check (intensity_type in ('rpe', 'percent_1rm', 'none')),
  rpe numeric(4, 1),
  percent_1rm numeric(5, 1),
  notes text,
  actual_sets int,
  actual_reps int,
  actual_mass_kg numeric(6, 2),
  actual_hold_seconds int,
  actual_rpe numeric(4, 1),
  done boolean not null default false
);
create index on public.workout_exercises (plan_id, position);

-- Ownership helper for child rows (security definer avoids RLS recursion).
create or replace function public.owns_plan(p_plan uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workout_plans where id = p_plan and user_id = auth.uid());
$$;

alter table public.vault_context enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_exercises enable row level security;

create policy "vault_context: own" on public.vault_context
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "workout_plans: own" on public.workout_plans
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "workout_exercises: own" on public.workout_exercises
  for all to authenticated
  using (public.owns_plan(plan_id))
  with check (public.owns_plan(plan_id));