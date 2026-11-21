-- Workout tracker schema. Run once in the Supabase SQL editor.
-- Tables are prefixed with gym_ so they can live in a new project or next to other tables.

create table if not exists gym_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  position int not null default 0,
  default_sets int not null default 3,
  start_weight numeric,
  start_reps int,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists gym_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_sec int not null default 0
);

create table if not exists gym_workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references gym_workouts on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  exercise_id uuid references gym_exercises on delete set null,
  exercise_name text not null,
  set_number int not null,
  reps int not null,
  weight numeric not null,
  rest_before_sec int,
  completed_at timestamptz
);

-- The workout in progress, one row per user, so it survives closing the browser.
create table if not exists gym_drafts (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table gym_drafts enable row level security;
create policy "own rows" on gym_drafts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists gym_workouts_user_started on gym_workouts (user_id, started_at desc);
create index if not exists gym_sets_workout on gym_workout_sets (workout_id);

alter table gym_exercises enable row level security;
alter table gym_workouts enable row level security;
alter table gym_workout_sets enable row level security;

create policy "own rows" on gym_exercises for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on gym_workouts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on gym_workout_sets for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
