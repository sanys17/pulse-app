# Pulse Social — Community & Friends

**Date:** 2026-10-08
**Status:** Draft
**Scope:** Sub-project 3. A lightweight social layer: friends, activity feed, and shared events/plans. This is the "social accountability + planning" pillar of Pulse.

---

## Goal

Let users connect with friends inside Pulse so they can see each other's habit activity, celebrate streaks, and plan things together (trips, dates, hangouts). The social layer should feel like a natural extension of the personal dashboard — not a separate app. It should encourage without pressuring: friends see highlights, not surveillance.

## Success Criteria

1. Users can search for and add friends by username or invite link.
2. Friend requests require acceptance before any data is shared.
3. The Social tab shows a feed of friends' recent activity (streak milestones, new habits, completions).
4. Users control what is visible to friends (per-habit privacy toggle).
5. Users can create shared events/plans and invite friends.
6. Shared plans have a lightweight collaborative space (shared checklist, date/time, location).
7. Notifications for friend requests, plan invites, and streak milestones (integrates with the push notification system from sub-project 2 when ready).
8. The UI follows Apple design principles: glass surfaces, spring animations, 44pt touch targets, spatial consistency.

---

## Privacy Model

Privacy is the foundation. Users must feel safe connecting.

| Data | Default visibility | User control |
|------|-------------------|--------------|
| Profile name + avatar | Friends only | Always visible to friends |
| Individual habit names | Hidden | Per-habit toggle: "Share with friends" |
| Habit completions (today's ✓) | Hidden | Follows the habit's share toggle |
| Streak milestones (7-day, 30-day, etc.) | Shared | Opt-out per habit |
| Pulse Score | Hidden | Global toggle in Settings |
| Tasks | Always private | No toggle — tasks are never shared |
| Calendar events | Always private | Only shared plans are visible |
| Shared plans | Visible to plan members | Inherent — that's the point |

**Principle:** Nothing is shared by default except what the user explicitly opts in to. The activity feed shows only opted-in data.

---

## Database Schema

### Migration: `003_social.sql`

#### `usernames`

Unique, user-chosen handle for discovery. Separate from profile name (which can have spaces, duplicates).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default `gen_random_uuid()` |
| user_id | uuid | FK to auth.users, unique, not null |
| username | text | unique, not null, 3-24 chars, lowercase alphanumeric + underscores |
| created_at | timestamptz | default `now()` |

**RLS:** Users read any username (for search), insert/update their own.

**Index:** Unique index on `lower(username)` for case-insensitive lookups.

#### `friendships`

Bidirectional friendship model using a status enum.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| requester_id | uuid | FK to auth.users, not null |
| addressee_id | uuid | FK to auth.users, not null |
| status | text | not null — 'pending', 'accepted', 'declined', 'blocked' |
| created_at | timestamptz | default `now()` |
| updated_at | timestamptz | default `now()` |

**Unique constraint:** `(requester_id, addressee_id)` — one request per direction.

**RLS:**
- SELECT: user is requester or addressee
- INSERT: `auth.uid() = requester_id` and status = 'pending'
- UPDATE: `auth.uid() = addressee_id` (only the recipient can accept/decline)
- DELETE: either party can remove

**Check constraint:** `requester_id != addressee_id`

#### `habit_sharing`

Per-habit opt-in to the social feed.

| Column | Type | Notes |
|--------|------|-------|
| habit_id | uuid | PK, FK to habits(id) on delete cascade |
| user_id | uuid | FK to auth.users, not null |
| shared | boolean | default false |

**RLS:** Users manage their own rows.

#### `shared_plans`

A trip, date, hangout, or any shared event.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| creator_id | uuid | FK to auth.users, not null |
| title | text | not null |
| description | text | nullable |
| date | date | nullable — TBD plans have no date yet |
| time | time | nullable |
| location | text | nullable |
| status | text | default 'planning' — 'planning', 'confirmed', 'completed', 'cancelled' |
| created_at | timestamptz | default `now()` |
| updated_at | timestamptz | default `now()` |

**RLS:** Visible to plan members (via `plan_members` join).

#### `plan_members`

Who's part of a shared plan.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| plan_id | uuid | FK to shared_plans(id) on delete cascade |
| user_id | uuid | FK to auth.users, not null |
| rsvp | text | default 'pending' — 'pending', 'going', 'maybe', 'declined' |
| joined_at | timestamptz | default `now()` |

**Unique constraint:** `(plan_id, user_id)`

**RLS:** Users can read plans they're members of, update their own RSVP.

#### `plan_checklist`

Shared to-do items within a plan (e.g. "book restaurant", "buy tickets").

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| plan_id | uuid | FK to shared_plans(id) on delete cascade |
| label | text | not null |
| done | boolean | default false |
| assigned_to | uuid | nullable, FK to auth.users |
| created_by | uuid | FK to auth.users, not null |
| created_at | timestamptz | default `now()` |

**RLS:** Accessible to plan members.

#### `activity_feed`

Denormalized feed entries for fast reads. Written by triggers or application code when feed-worthy events happen.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK to auth.users, not null — the person who did the thing |
| type | text | not null — 'streak_milestone', 'habit_started', 'daily_complete', 'plan_created' |
| payload | jsonb | not null — type-specific data (habit name, streak count, plan title, etc.) |
| created_at | timestamptz | default `now()` |

**RLS:** Users can read feed entries where `user_id` is a friend with status 'accepted' and the relevant habit has sharing enabled. This requires a function-based policy:

```sql
create policy "Users read friends' feed" on public.activity_feed
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = activity_feed.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = activity_feed.user_id)
        )
    )
  );
```

**Cleanup:** Entries older than 30 days are deleted by a scheduled job.

---

## Features

### 1. Username Setup

On first visit to the Social tab (or prompted after sign-up), the user picks a username. This is their handle for friend discovery.

- Inline validation: 3-24 chars, lowercase, alphanumeric + underscores
- Real-time availability check (debounced Supabase query)
- Stored in `usernames` table
- Displayed as `@username` throughout the social UI

### 2. Friend Discovery & Requests

**Search:** Type a username in the search bar → live results from the `usernames` table → tap to send a friend request.

**Invite link:** Generate a shareable link (`https://pulse-app-habit.vercel.app/social?add=username`) that deep-links to the add-friend flow. Copy to clipboard with one tap.

**Request flow:**
1. Sender taps "Add Friend" → inserts a `friendships` row with status `pending`
2. Recipient sees a badge on the Social tab and a pending request card at the top of their feed
3. Recipient taps Accept or Decline → updates status to `accepted` or `declined`
4. On accept, both users appear in each other's friends list

**Friend list:** Accessible from a "Friends" button at the top of the Social tab. Shows avatars, names, usernames, and a "Remove" option (with confirmation).

### 3. Activity Feed

The main content of the Social tab. A reverse-chronological feed of friends' activity.

**Feed entry types:**

| Type | Example | Icon |
|------|---------|------|
| `streak_milestone` | "Alex hit a 30-day streak on Meditate 🔥" | Fire |
| `habit_started` | "Jordan started a new habit: Read" | Plant |
| `daily_complete` | "Sam completed all habits today ✨" | CheckCircle |
| `plan_created` | "Alex created a plan: Weekend Hike" | MapPin |

**Feed card design:**
- Avatar + name + timestamp
- Glass card surface (`rgba(20,20,30,0.75)`, backdrop blur)
- Subtle entry animation (spring, opacity + translateY)
- Tap a streak milestone to send a "🎉" reaction (single reaction, no reply — keep it lightweight)

**Empty state:** When the user has no friends yet, show an illustration with "Add friends to see their activity" and a prominent "Find Friends" button.

**When no friend activity:** "Your friends have been quiet. Check back later." with a subtle illustration.

### 4. Shared Plans

A card-based planning tool for trips, dates, and hangouts.

**Creating a plan:**
1. Tap "+" button on the Social tab (or a "New Plan" card)
2. Sheet slides up (spring animation, anchored to the button)
3. Enter: title (required), description, date, time, location
4. Invite friends from your friends list (multi-select with avatars)
5. Tap "Create" → inserts `shared_plans` + `plan_members` rows

**Plan card (in feed and plan list):**
- Title, date (or "TBD"), location
- Member avatars (stacked circles, max 5 shown + "+N")
- RSVP status pills: Going / Maybe / Pending
- Status badge: Planning → Confirmed → Completed

**Plan detail view:**
- Full info (title, description, date/time, location)
- Member list with RSVP status
- RSVP buttons for the current user (Going / Maybe / Can't make it)
- Shared checklist — tap to add items, tap to toggle done, swipe to delete
- Assign checklist items to members (tap the avatar picker next to each item)
- Only the creator can edit plan details or cancel the plan
- Any member can add/toggle checklist items

**Navigation:** Tapping a plan card pushes to `/social/plan/:id` with a right-to-left slide transition.

### 5. Reactions

Minimal social interaction — no comments, no messaging. Just reactions on feed entries.

- Tap a feed card to send a "🎉" (confetti/celebration reaction)
- Shows as a small reaction count + emoji below the card
- One reaction per user per feed entry
- Spring animation on the emoji when tapped

---

## UI Structure

### Social Tab Layout

```
┌──────────────────────────────────────┐
│  Social                    [Friends] │  ← header
├──────────────────────────────────────┤
│  [🔍 Find friends...]               │  ← search bar
├──────────────────────────────────────┤
│  ┌──── Pending Requests (2) ──────┐ │  ← collapsible, only when requests exist
│  │  @alex wants to be friends     │ │
│  │           [Accept] [Decline]   │ │
│  └────────────────────────────────┘ │
├──────────────────────────────────────┤
│  ┌──── Shared Plans ──────────────┐ │  ← horizontal scroll of plan cards
│  │ Weekend │ Movie  │  + New     │ │
│  │ Hike    │ Night  │  Plan      │ │
│  └────────────────────────────────┘ │
├──────────────────────────────────────┤
│  Activity                            │  ← section label
│  ┌────────────────────────────────┐ │
│  │ 🔥 Alex — 30-day streak       │ │
│  │    Meditate · 2h ago    🎉 3  │ │
│  └────────────────────────────────┘ │
│  ┌────────────────────────────────┐ │
│  │ ✨ Sam — All habits done       │ │
│  │    Today · 4h ago              │ │
│  └────────────────────────────────┘ │
│                                      │
│          ─── End of feed ───         │
└──────────────────────────────────────┘
```

### Friends View

Tapping "Friends" in the header opens a sheet (slides up from bottom, spring animation):

```
┌──────────────────────────────────────┐
│  Friends (12)              [Done]    │
│                                      │
│  [🔗 Copy invite link]              │
│                                      │
│  ┌────────────────────────────────┐ │
│  │ (avatar) Alex Chen    @alexc  │ │
│  │ (avatar) Sam Rivera   @samr   │ │
│  │ (avatar) Jordan Lee   @jlee   │ │
│  │ ...                           │ │
│  └────────────────────────────────┘ │
└──────────────────────────────────────┘
```

Swipe left on a friend row to reveal "Remove" (red, with confirmation).

---

## Client Data Layer

### New hooks

| Hook | Purpose |
|------|---------|
| `useUsername` | Get/set the current user's username, check availability |
| `useFriendships` | List friends, pending requests, send/accept/decline/remove |
| `useActivityFeed` | Paginated feed of friends' activity, reactions |
| `useSharedPlans` | List plans, create, update RSVP, manage checklist |

Each hook follows the existing pattern: fetch on mount, optimistic mutations, visibility-change refetch.

### Feed generation

Activity feed entries are created client-side when a user:
- Completes all habits for the day → insert `daily_complete` entry (only if any habits are shared)
- Hits a streak milestone (7, 14, 30, 60, 100, 365 days) → insert `streak_milestone` entry
- Creates a new shared habit → insert `habit_started` entry
- Creates a shared plan → insert `plan_created` entry

RLS on the `activity_feed` table ensures only friends with accepted status can read entries.

### Context

Add a `SocialProvider` wrapping the app (inside `AuthGate`, alongside other providers). It provides:
- Username state
- Friend count (for badge on Social tab in BottomNav)
- Pending request count (for badge)

---

## New & Modified Files

### New files

| File | Purpose |
|------|---------|
| `src/hooks/useUsername.ts` | Username CRUD + availability check |
| `src/hooks/useFriendships.ts` | Friend requests, list, remove |
| `src/hooks/useActivityFeed.ts` | Paginated feed + reactions |
| `src/hooks/useSharedPlans.ts` | Plans CRUD, RSVP, checklist |
| `src/context/SocialContext.tsx` | Social state provider (username, counts) |
| `src/pages/PlanDetail.tsx` | Shared plan detail view |
| `src/components/FriendRequestCard.tsx` | Pending request accept/decline card |
| `src/components/PlanCard.tsx` | Compact plan card for horizontal scroll |
| `src/components/FeedCard.tsx` | Activity feed entry card |
| `src/components/FriendsSheet.tsx` | Friends list bottom sheet |
| `src/components/UsernameSetup.tsx` | First-time username picker |
| `supabase/migrations/003_social.sql` | All social tables + RLS policies |

### Modified files

| File | Change |
|------|--------|
| `src/pages/Social.tsx` | Replace placeholder with full social UI |
| `src/App.tsx` | Add `SocialProvider`, add `/social/plan/:id` route |
| `src/components/BottomNav.tsx` | Badge for pending friend requests |
| `src/hooks/useHabits.ts` | Trigger feed entries on streak milestones and daily completion |

---

## Animations & Interactions (Apple Design Principles)

| Interaction | Animation |
|-------------|-----------|
| Feed card appear | Spring (damping 0.85, response 0.5), opacity 0→1 + translateY 12→0 |
| Friends sheet open | Spring (damping 0.9, response 0.45), slides up from bottom |
| Plan detail push | Right-to-left spring slide, interruptible (can swipe back mid-flight) |
| Reaction tap | Spring bounce (damping 0.6, response 0.3) on the emoji, scale 1→1.4→1 |
| Friend request accept | Card collapses with spring (damping 1.0, response 0.35), height→0 |
| Swipe to remove friend | Rubber-band resistance past threshold, spring snap to reveal/dismiss |
| Plan card horizontal scroll | Momentum-based, decelerates with friction, snaps to nearest card |

All animations respect `prefers-reduced-motion`: swap springs for cross-fades, skip spatial transitions.

---

## What This Spec Does NOT Cover

- **Direct messaging / chat** — out of scope for V1. Friends communicate via their existing messaging apps. Can be added in a future sub-project.
- **Groups / communities** — V1 is 1:1 friendships only. Group features later.
- **Public profiles** — no public-facing profile page. Everything is friends-only.
- **Habit challenges** — "compete with friends on a habit" is a great V2 feature but not in scope.
- **Push notifications for social events** — the hooks are designed to integrate with sub-project 2 (push notifications) but that wiring happens when both are built.
- **Real-time updates** — standard fetch-on-mount + visibility-change refetch. Supabase Realtime subscriptions could be added later for instant feed updates.
- **Blocking** — the friendship status supports 'blocked' but the UI for blocking is deferred.
