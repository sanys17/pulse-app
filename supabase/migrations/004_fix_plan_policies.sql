-- Fix shared plan RLS from 003_social.sql.
-- Bugs: (1) shared_plans SELECT policy only allowed members, so the creator's
-- INSERT ... RETURNING failed before they were a member; (2) inside subqueries
-- `id` / `plan_id` resolved to the inner table's column, so the policies never
-- matched correctly (and the checklist policies matched any plan the user is in);
-- (3) plan_members SELECT policy queried plan_members itself (infinite recursion).

create or replace function public.is_plan_member(p_plan_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.plan_members
    where plan_id = p_plan_id and user_id = auth.uid()
  );
$$;

drop policy if exists "Members see plans" on public.shared_plans;
create policy "Members and creator see plans" on public.shared_plans for select using (
  creator_id = auth.uid() or public.is_plan_member(id)
);

drop policy if exists "Members see plan members" on public.plan_members;
create policy "Members see plan members" on public.plan_members for select using (
  user_id = auth.uid() or public.is_plan_member(plan_id)
);

drop policy if exists "Members see checklist" on public.plan_checklist;
create policy "Members see checklist" on public.plan_checklist for select using (
  public.is_plan_member(plan_id)
);

drop policy if exists "Members add checklist items" on public.plan_checklist;
create policy "Members add checklist items" on public.plan_checklist for insert with check (
  public.is_plan_member(plan_id)
);

drop policy if exists "Members update checklist" on public.plan_checklist;
create policy "Members update checklist" on public.plan_checklist for update using (
  public.is_plan_member(plan_id)
);
