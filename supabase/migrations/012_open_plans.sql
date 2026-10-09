-- Open plans: a creator can let any accepted friend join without being invited one by one.
-- Run in the SQL Editor (after 011), right before deploying the matching app version.

-- 1) Columns
alter table public.shared_plans add column if not exists open boolean not null default false;
alter table public.plan_members add column if not exists self_joined boolean not null default false;

-- 2) Helpers (security definer so policies never recurse into the tables they guard)
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- Can the signed-in user see this plan because it is open and its creator is their friend?
create or replace function public.can_see_open_plan(p_plan_id uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.shared_plans sp
    where sp.id = p_plan_id and sp.open
      and (sp.creator_id = auth.uid() or public.are_friends(sp.creator_id, auth.uid()))
  );
$$;

-- Open plans stop accepting new people at 20 members.
create or replace function public.can_join_plan(p_plan_id uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select auth.uid() is not null
     and public.can_see_open_plan(p_plan_id)
     and (select count(*) from public.plan_members pm where pm.plan_id = p_plan_id) < 20;
$$;

grant execute on function public.are_friends(uuid, uuid), public.can_see_open_plan(uuid), public.can_join_plan(uuid) to authenticated;

-- 3) Visibility: friends of the creator can see an open plan and who is in it
drop policy if exists "Members and creator see plans" on public.shared_plans;
create policy "Members and creator see plans" on public.shared_plans for select using (
  creator_id = auth.uid() or public.is_plan_member(id) or public.can_see_open_plan(id)
);

drop policy if exists "Members see plan members" on public.plan_members;
create policy "Members see plan members" on public.plan_members for select using (
  user_id = auth.uid() or public.is_plan_member(plan_id) or public.can_see_open_plan(plan_id)
);

-- 4) Joining. The old policy let anyone add themselves to any plan they knew the id of; now only
--    the creator adds others, and you can add yourself only to an open plan of a friend (as 'going').
drop policy if exists "Creator adds members" on public.plan_members;
create policy "Creator adds members" on public.plan_members for insert with check (
  exists (select 1 from public.shared_plans sp where sp.id = plan_id and sp.creator_id = auth.uid())
  or (user_id = auth.uid() and rsvp = 'going' and public.can_join_plan(plan_id))
);

-- The server decides whether a row was a self-join (clients cannot fake it); it drives the creator's notification.
create or replace function public.mark_self_joined() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.self_joined := new.user_id = auth.uid()
    and not exists (select 1 from public.shared_plans sp where sp.id = new.plan_id and sp.creator_id = new.user_id);
  return new;
end;
$$;
drop trigger if exists plan_members_mark_self_joined on public.plan_members;
create trigger plan_members_mark_self_joined before insert on public.plan_members
  for each row execute function public.mark_self_joined();

-- 5) Tell the creator when someone joins (uses their "plan invitations" switch).
--    Keep the 011 rules as they are and add one more source of notifications on top.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'pending_notifications_base' and pronamespace = 'public'::regnamespace) then
    alter function public.pending_notifications(timestamptz) rename to pending_notifications_base;
  end if;
end $$;

create or replace function public.pending_notifications(p_now timestamptz default now())
returns table (user_id uuid, kind text, reference_id text, title text, body text, url text, tag text)
language sql
stable
security definer
set search_path = public
as $$
  with join_due as (
    select sp.creator_id as user_id, 'join'::text as kind, pm.id::text as reference_id,
           'New member'::text as title,
           coalesce(nullif(jp.name, ''), '@' || jun.username, 'Someone') || ' joined ' || sp.title as body,
           ('/social/plan/' || sp.id::text) as url,
           ('join-' || pm.id::text) as tag
    from public.plan_members pm
    join public.shared_plans sp on sp.id = pm.plan_id
    join public.notification_preferences np on np.user_id = sp.creator_id
    left join public.profiles jp on jp.user_id = pm.user_id
    left join public.usernames jun on jun.user_id = pm.user_id
    where pm.self_joined
      and np.plan_invites
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = sp.creator_id)
      and pm.joined_at <= p_now
      and pm.joined_at > p_now - interval '15 minutes'
  )
  select * from public.pending_notifications_base(p_now)
  union all
  select j.user_id, j.kind, j.reference_id, j.title, j.body, j.url, j.tag
  from join_due j
  where not exists (
    select 1 from public.notification_log nl
    where nl.user_id = j.user_id and nl.kind = j.kind and nl.reference_id = j.reference_id
  );
$$;

revoke all on function public.pending_notifications(timestamptz) from public, anon, authenticated;
grant execute on function public.pending_notifications(timestamptz) to service_role;
revoke all on function public.pending_notifications_base(timestamptz) from public, anon, authenticated;
grant execute on function public.pending_notifications_base(timestamptz) to service_role;
