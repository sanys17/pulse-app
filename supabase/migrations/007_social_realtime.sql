-- Enable Realtime on the remaining social tables so plans, members, checklist
-- items and the activity feed update live. Realtime applies each table's SELECT
-- policy, so users only receive changes to rows they can see. Safe to re-run.
do $$
begin
  alter publication supabase_realtime add table public.shared_plans;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.plan_members;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.plan_checklist;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.activity_feed;
exception when duplicate_object then null;
end $$;
