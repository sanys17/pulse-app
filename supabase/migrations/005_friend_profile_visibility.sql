-- Let users read the profile (name, avatar) of people they are connected to.
-- Before this, profiles was own-row-only, so friends, friend requests, plan
-- members and feed authors all showed up with blank names and no avatar.
--
-- Visible: yourself, anyone you have a pending or accepted friendship with
-- (either direction), and anyone who shares a plan with you.
-- Not visible: strangers, and declined or blocked friendships.
-- Only user_id, name and avatar_url exist on profiles; no email is exposed.

create or replace function public.can_view_profile(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    p_user_id = auth.uid()
    or exists (
      select 1 from public.friendships f
      where f.status in ('pending', 'accepted')
        and (
          (f.requester_id = auth.uid() and f.addressee_id = p_user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = p_user_id)
        )
    )
    or exists (
      select 1
      from public.plan_members mine
      join public.plan_members theirs on theirs.plan_id = mine.plan_id
      where mine.user_id = auth.uid()
        and theirs.user_id = p_user_id
    );
$$;

create policy "Connected users read profiles" on public.profiles for select using (
  public.can_view_profile(user_id)
);
