-- TwinMind Database Schema
-- Create profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  avatar_config jsonb default '{}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create twin_profiles table for storing digital twin configuration
create table if not exists public.twin_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  age integer,
  goals text[] default '{}',
  personality_traits text[] default '{}',
  daily_habits text[] default '{}',
  interests text[] default '{}',
  ai_personality_model jsonb default '{}',
  voice_preference text default 'female' check (voice_preference in ('male', 'female')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id)
);

-- Create memory_logs table for continuous learning
create table if not exists public.memory_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  log_type text default 'daily' check (log_type in ('daily', 'reflection', 'decision', 'mood')),
  sentiment text,
  processed boolean default false,
  created_at timestamp with time zone default now()
);

-- Create insights table for AI-generated insights
create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  summary text not null,
  insight_type text default 'behavior' check (insight_type in ('behavior', 'habit', 'goal', 'recommendation')),
  data jsonb default '{}',
  created_at timestamp with time zone default now()
);

-- Create chat_messages table for conversation history
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  audio_url text,
  created_at timestamp with time zone default now()
);

-- Enable Row Level Security on all tables
alter table public.profiles enable row level security;
alter table public.twin_profiles enable row level security;
alter table public.memory_logs enable row level security;
alter table public.insights enable row level security;
alter table public.chat_messages enable row level security;

-- Profiles RLS Policies
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles for delete using (auth.uid() = id);

-- Twin Profiles RLS Policies
create policy "twin_profiles_select_own" on public.twin_profiles for select using (auth.uid() = user_id);
create policy "twin_profiles_insert_own" on public.twin_profiles for insert with check (auth.uid() = user_id);
create policy "twin_profiles_update_own" on public.twin_profiles for update using (auth.uid() = user_id);
create policy "twin_profiles_delete_own" on public.twin_profiles for delete using (auth.uid() = user_id);

-- Memory Logs RLS Policies
create policy "memory_logs_select_own" on public.memory_logs for select using (auth.uid() = user_id);
create policy "memory_logs_insert_own" on public.memory_logs for insert with check (auth.uid() = user_id);
create policy "memory_logs_update_own" on public.memory_logs for update using (auth.uid() = user_id);
create policy "memory_logs_delete_own" on public.memory_logs for delete using (auth.uid() = user_id);

-- Insights RLS Policies
create policy "insights_select_own" on public.insights for select using (auth.uid() = user_id);
create policy "insights_insert_own" on public.insights for insert with check (auth.uid() = user_id);
create policy "insights_update_own" on public.insights for update using (auth.uid() = user_id);
create policy "insights_delete_own" on public.insights for delete using (auth.uid() = user_id);

-- Chat Messages RLS Policies
create policy "chat_messages_select_own" on public.chat_messages for select using (auth.uid() = user_id);
create policy "chat_messages_insert_own" on public.chat_messages for insert with check (auth.uid() = user_id);
create policy "chat_messages_update_own" on public.chat_messages for update using (auth.uid() = user_id);
create policy "chat_messages_delete_own" on public.chat_messages for delete using (auth.uid() = user_id);

-- Create trigger function for auto-creating profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Create trigger for auto-creating profiles on user signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Create indexes for better query performance
create index if not exists idx_twin_profiles_user_id on public.twin_profiles(user_id);
create index if not exists idx_memory_logs_user_id on public.memory_logs(user_id);
create index if not exists idx_memory_logs_created_at on public.memory_logs(created_at desc);
create index if not exists idx_insights_user_id on public.insights(user_id);
create index if not exists idx_chat_messages_user_id on public.chat_messages(user_id);
create index if not exists idx_chat_messages_created_at on public.chat_messages(created_at desc);
