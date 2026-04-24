-- Calendar events table with RLS policies for per-user access

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  tag text not null default 'casual' check (tag in ('casual','important','super_important','health','study','work','social')),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  reminder_minutes integer not null default 60 check (reminder_minutes >= 0 and reminder_minutes <= 10080),
  recurrence text not null default 'none' check (recurrence in ('none','daily','weekly','monthly')),
  location text,
  notes text,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_time_check check (ends_at > starts_at)
);

create index if not exists calendar_events_user_starts_idx on public.calendar_events(user_id, starts_at);
create index if not exists calendar_events_user_ends_idx on public.calendar_events(user_id, ends_at);

alter table public.calendar_events enable row level security;

drop policy if exists "calendar_events_select_own" on public.calendar_events;
drop policy if exists "calendar_events_insert_own" on public.calendar_events;
drop policy if exists "calendar_events_update_own" on public.calendar_events;
drop policy if exists "calendar_events_delete_own" on public.calendar_events;

create policy "calendar_events_select_own"
on public.calendar_events
for select
using (auth.uid() = user_id);

create policy "calendar_events_insert_own"
on public.calendar_events
for insert
with check (auth.uid() = user_id);

create policy "calendar_events_update_own"
on public.calendar_events
for update
using (auth.uid() = user_id);

create policy "calendar_events_delete_own"
on public.calendar_events
for delete
using (auth.uid() = user_id);

