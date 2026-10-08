-- Profiles
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  name text,
  avatar_url text,
  created_at timestamptz default now() not null
);

alter table public.profiles enable row level security;
create policy "Users read own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = user_id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Habits
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  icon text not null,
  color text not null,
  frequency text not null,
  created_at timestamptz default now() not null
);

alter table public.habits enable row level security;
create policy "Users manage own habits" on public.habits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Completions
create table public.completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  habit_id uuid references public.habits(id) on delete cascade not null,
  date date not null,
  unique (user_id, habit_id, date)
);

alter table public.completions enable row level security;
create policy "Users manage own completions" on public.completions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  label text not null,
  done boolean default false not null,
  created_at timestamptz default now() not null
);

alter table public.tasks enable row level security;
create policy "Users manage own tasks" on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Calendar Events
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  date date not null,
  time time,
  location text,
  created_at timestamptz default now() not null
);

alter table public.calendar_events enable row level security;
create policy "Users manage own calendar_events" on public.calendar_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
