-- Enable Realtime on friendships so incoming requests and acceptances show up
-- without a page reload. Realtime applies the table's SELECT policy, so users
-- only receive changes to rows they can see. Safe to run more than once.
do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception
  when duplicate_object then null;
end $$;
