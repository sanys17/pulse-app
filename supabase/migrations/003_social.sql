-- Usernames (unique handles for friend discovery)
create table public.usernames (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  username text not null unique,
  created_at timestamptz default now() not null,
  constraint username_format check (username ~ '^[a-z0-9_]{3,24}$')
);

create unique index usernames_lower_idx on public.usernames (lower(username));

alter table public.usernames enable row level security;
create policy "Anyone can search usernames" on public.usernames for select using (true);
create policy "Users insert own username" on public.usernames for insert with check (auth.uid() = user_id);
create policy "Users update own username" on public.usernames for update using (auth.uid() = user_id);

-- Friendships
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references auth.users(id) on delete cascade not null,
  addressee_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'pending',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (requester_id, addressee_id),
  constraint no_self_friend check (requester_id != addressee_id),
  constraint valid_status check (status in ('pending', 'accepted', 'declined', 'blocked'))
);

alter table public.friendships enable row level security;
create policy "Users see own friendships" on public.friendships for select using (auth.uid() in (requester_id, addressee_id));
create policy "Users send friend requests" on public.friendships for insert with check (auth.uid() = requester_id and status = 'pending');
create policy "Addressee can respond" on public.friendships for update using (auth.uid() = addressee_id);
create policy "Either party can remove" on public.friendships for delete using (auth.uid() in (requester_id, addressee_id));

-- Habit sharing (per-habit opt-in to social feed)
create table public.habit_sharing (
  habit_id uuid primary key references public.habits(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade not null,
  shared boolean default false not null
);

alter table public.habit_sharing enable row level security;
create policy "Users manage own habit sharing" on public.habit_sharing for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Shared plans
create table public.shared_plans (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  date date,
  time time,
  location text,
  status text default 'planning' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint valid_plan_status check (status in ('planning', 'confirmed', 'completed', 'cancelled'))
);

alter table public.shared_plans enable row level security;
create policy "Members see plans" on public.shared_plans for select using (
  exists (select 1 from public.plan_members pm where pm.plan_id = id and pm.user_id = auth.uid())
);
create policy "Creator manages plan" on public.shared_plans for update using (auth.uid() = creator_id);
create policy "Users create plans" on public.shared_plans for insert with check (auth.uid() = creator_id);
create policy "Creator deletes plan" on public.shared_plans for delete using (auth.uid() = creator_id);

-- Plan members
create table public.plan_members (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.shared_plans(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  rsvp text default 'pending' not null,
  joined_at timestamptz default now() not null,
  unique (plan_id, user_id),
  constraint valid_rsvp check (rsvp in ('pending', 'going', 'maybe', 'declined'))
);

alter table public.plan_members enable row level security;
create policy "Members see plan members" on public.plan_members for select using (
  exists (select 1 from public.plan_members pm2 where pm2.plan_id = plan_id and pm2.user_id = auth.uid())
);
create policy "Creator adds members" on public.plan_members for insert with check (
  exists (select 1 from public.shared_plans sp where sp.id = plan_id and sp.creator_id = auth.uid())
  or auth.uid() = user_id
);
create policy "Users update own rsvp" on public.plan_members for update using (auth.uid() = user_id);
create policy "Creator or self removes" on public.plan_members for delete using (
  auth.uid() = user_id
  or exists (select 1 from public.shared_plans sp where sp.id = plan_id and sp.creator_id = auth.uid())
);

-- Plan checklist
create table public.plan_checklist (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.shared_plans(id) on delete cascade not null,
  label text not null,
  done boolean default false not null,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now() not null
);

alter table public.plan_checklist enable row level security;
create policy "Members see checklist" on public.plan_checklist for select using (
  exists (select 1 from public.plan_members pm where pm.plan_id = plan_id and pm.user_id = auth.uid())
);
create policy "Members add checklist items" on public.plan_checklist for insert with check (
  exists (select 1 from public.plan_members pm where pm.plan_id = plan_id and pm.user_id = auth.uid())
);
create policy "Members update checklist" on public.plan_checklist for update using (
  exists (select 1 from public.plan_members pm where pm.plan_id = plan_id and pm.user_id = auth.uid())
);
create policy "Creator or item creator deletes" on public.plan_checklist for delete using (
  auth.uid() = created_by
  or exists (select 1 from public.shared_plans sp where sp.id = plan_id and sp.creator_id = auth.uid())
);

-- Activity feed
create table public.activity_feed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz default now() not null,
  constraint valid_feed_type check (type in ('streak_milestone', 'habit_started', 'daily_complete', 'plan_created'))
);

alter table public.activity_feed enable row level security;
create policy "Users read own and friends feed" on public.activity_feed for select using (
  user_id = auth.uid()
  or exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = auth.uid() and f.addressee_id = activity_feed.user_id)
        or (f.addressee_id = auth.uid() and f.requester_id = activity_feed.user_id)
      )
  )
);
create policy "Users insert own feed entries" on public.activity_feed for insert with check (auth.uid() = user_id);
create policy "Users delete own feed entries" on public.activity_feed for delete using (auth.uid() = user_id);
