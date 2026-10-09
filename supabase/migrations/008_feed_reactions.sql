-- One-tap "cheer" on activity feed entries. A user can cheer an entry at most
-- once (primary key), can only see/add reactions on entries they can already
-- see (activity_feed's own SELECT policy applies inside the subquery), and can
-- only remove their own. Table references are qualified on purpose: an
-- unqualified column inside a policy subquery resolves to the inner table.

create table public.feed_reactions (
  entry_id uuid references public.activity_feed(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  primary key (entry_id, user_id)
);

alter table public.feed_reactions enable row level security;

create policy "See reactions on visible entries" on public.feed_reactions for select using (
  exists (select 1 from public.activity_feed af where af.id = feed_reactions.entry_id)
);
create policy "Cheer visible entries as yourself" on public.feed_reactions for insert with check (
  auth.uid() = feed_reactions.user_id
  and exists (select 1 from public.activity_feed af where af.id = feed_reactions.entry_id)
);
create policy "Remove own reaction" on public.feed_reactions for delete using (
  auth.uid() = feed_reactions.user_id
);

do $$
begin
  alter publication supabase_realtime add table public.feed_reactions;
exception when duplicate_object then null;
end $$;
