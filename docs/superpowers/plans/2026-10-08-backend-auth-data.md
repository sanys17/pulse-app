# Backend, Auth & Data Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace localStorage with a Supabase backend, add user authentication, and migrate all existing data — so the app supports multiple users with persistent, server-side data.

**Architecture:** Supabase provides Postgres (with Row-Level Security), Auth (Google OAuth + email/password), and a JS client SDK that talks directly to the database from the React app. No custom API routes needed for CRUD. The existing Vercel serverless functions (Ultrahuman proxy) stay unchanged.

**Tech Stack:** Supabase (Postgres + Auth), `@supabase/supabase-js`, React 19, TypeScript, Vite 8, Vercel

**Spec:** `docs/superpowers/specs/2026-10-08-backend-auth-data-design.md`

## Global Constraints

- React 19, TypeScript 6, Vite 8 — do not downgrade.
- All Supabase tables must have RLS enabled with `auth.uid() = user_id` policies.
- The Supabase anon key is the only key used client-side. Never use the service role key in frontend code.
- Environment variables for Supabase use the `VITE_` prefix: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- All existing UI behavior and visual design must be preserved — this is a data layer change only.
- The `Habit` type's `id` field changes from `string` (client-generated) to `string` (UUID from Supabase). All other fields stay the same.
- The `Completion` type gains an `id` field (UUID). The `habitId` field remains `string`.
- No test framework is currently configured in this project. Testing is manual (run the app, exercise the feature).

## Review Focus

1. **Double-completion race:** Two rapid taps on a habit card could fire two inserts before the optimistic state updates. The `(user_id, habit_id, date)` unique constraint on `completions` will reject the duplicate, but the UI must handle the Supabase conflict error (code `23505`) gracefully — ignore it and keep the single completion, rather than showing an error.
2. **Migration with empty localStorage:** A brand-new user with no localStorage data should not trigger the migration flow at all — the `pulse-habits` key won't exist, so the migration check (`localStorage.getItem("pulse-habits")` returns `null`) must short-circuit cleanly.
3. **Google OAuth redirect callback:** After Google redirects back to the app, Supabase exchanges the code for a session. The React Router must not intercept the `?code=` query params before Supabase processes them. `supabase.auth.getSession()` in the `AuthContext` effect handles this, but the sign-in page must not re-render or redirect before the session is established.
4. **Stale optimistic state after tab sleep:** If the user leaves the app in the background for hours, the in-memory state diverges from the database (other devices, or the migration completing). On `visibilitychange` back to `visible`, hooks should refetch from Supabase.
5. **Profile trigger failure on signup:** The `handle_new_user` database trigger runs in Supabase's context. If it fails (e.g., unique constraint on `user_id`), the user signup still succeeds but the profile row is missing. The `useProfile` hook must handle a missing profile gracefully — show empty name, don't crash.

---

### Task 1: Supabase Project Setup & Client SDK

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `.env.local`
- Modify: `package.json` (add dependency)
- Modify: `.gitignore` (ensure `.env.local` is ignored)
- Create: `supabase/migrations/001_initial_schema.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `supabase` client instance exported from `src/lib/supabase.ts`; database types in `src/lib/database.types.ts`

- [ ] **Step 1: Install Supabase SDK**

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Create environment file**

Create `.env.local`:
```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Verify `.gitignore` contains `.env.local` (Vite projects typically include it already — check, and add if missing).

- [ ] **Step 3: Create database types**

Create `src/lib/database.types.ts`:

```ts
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          name: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          name?: string | null;
          avatar_url?: string | null;
        };
      };
      habits: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          icon: string;
          color: string;
          frequency: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          icon: string;
          color: string;
          frequency: string;
        };
        Update: {
          name?: string;
          icon?: string;
          color?: string;
          frequency?: string;
        };
      };
      completions: {
        Row: {
          id: string;
          user_id: string;
          habit_id: string;
          date: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          habit_id: string;
          date: string;
        };
        Update: never;
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          done: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label: string;
          done?: boolean;
        };
        Update: {
          label?: string;
          done?: boolean;
        };
      };
      calendar_events: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          date: string;
          time: string | null;
          location: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          date: string;
          time?: string | null;
          location?: string | null;
        };
        Update: {
          title?: string;
          date?: string;
          time?: string | null;
          location?: string | null;
        };
      };
    };
  };
}
```

- [ ] **Step 4: Create Supabase client**

Create `src/lib/supabase.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 5: Write the SQL migration**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
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
```

- [ ] **Step 6: Apply the migration in Supabase**

Go to the Supabase dashboard → SQL Editor → paste and run `supabase/migrations/001_initial_schema.sql`. Then enable Google OAuth in Authentication → Providers → Google (requires Google Cloud OAuth client ID and secret — configure the redirect URL as `https://YOUR_PROJECT.supabase.co/auth/v1/callback`).

- [ ] **Step 7: Verify the build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/supabase.ts src/lib/database.types.ts supabase/migrations/001_initial_schema.sql .gitignore package.json package-lock.json
git commit -m "feat: add Supabase client, database types, and schema migration"
```

---

### Task 2: Auth Context & Sign-In Screen

**Files:**
- Create: `src/context/AuthContext.tsx`
- Create: `src/pages/SignIn.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`
- Produces: `AuthProvider` component, `useAuth()` hook returning `{ user: User | null, loading: boolean, signInWithGoogle, signInWithEmail, signUp, signOut }`

- [ ] **Step 1: Create AuthContext**

Create `src/context/AuthContext.tsx`:

```tsx
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signInWithEmail, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 2: Create Sign-In page**

Create `src/pages/SignIn.tsx`:

```tsx
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export function SignIn() {
  const { signInWithGoogle, signInWithEmail, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const geist = "Geist, Inter, system-ui, sans-serif";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "signup") {
        await signUp(email, password);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100dvh",
      padding: "0 24px",
      fontFamily: geist,
    }}>
      <h1 style={{
        fontSize: 48,
        fontWeight: 700,
        letterSpacing: "-0.04em",
        color: "#EAECF4",
        marginBottom: 8,
      }}>
        Pulse
      </h1>
      <p style={{
        fontSize: 16,
        color: "rgba(234,236,244,0.5)",
        marginBottom: 40,
      }}>
        Personal dashboard & habit tracker
      </p>

      <button
        onClick={signInWithGoogle}
        style={{
          width: "100%",
          maxWidth: 320,
          height: 48,
          borderRadius: 12,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "#EAECF4",
          fontSize: 16,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
          <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        width: "100%",
        maxWidth: 320,
        margin: "24px 0",
      }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
        <span style={{ fontSize: 13, color: "rgba(234,236,244,0.3)" }}>or</span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
      </div>

      <form onSubmit={handleSubmit} style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "100%",
        maxWidth: 320,
      }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          style={{
            height: 48,
            borderRadius: 12,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
            padding: "0 16px",
            fontSize: 16,
            color: "#EAECF4",
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          minLength={6}
          style={{
            height: 48,
            borderRadius: 12,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
            padding: "0 16px",
            fontSize: 16,
            color: "#EAECF4",
            outline: "none",
            fontFamily: "inherit",
          }}
        />

        {error && (
          <p style={{ fontSize: 14, color: "#E5484D", margin: 0 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            height: 48,
            borderRadius: 12,
            background: "rgba(167, 139, 250, 0.25)",
            border: "1px solid rgba(167, 139, 250, 0.3)",
            color: "#A78BFA",
            fontSize: 16,
            fontWeight: 600,
            cursor: submitting ? "wait" : "pointer",
            fontFamily: "inherit",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "..." : mode === "signup" ? "Create Account" : "Sign In"}
        </button>
      </form>

      <button
        onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
        style={{
          marginTop: 16,
          background: "transparent",
          border: "none",
          color: "rgba(234,236,244,0.4)",
          fontSize: 14,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Wire auth into App.tsx**

Replace the contents of `src/App.tsx`:

```tsx
import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { HabitsProvider, useHabitsContext } from "./context/HabitsContext";
import { HabitForm } from "./components/HabitForm";
import { QuickLog } from "./components/QuickLog";
import { useTheme } from "./hooks/useTheme";
import { Home } from "./pages/Home";
import { Habits } from "./pages/Habits";
import { Social } from "./pages/Social";
import { Calendar } from "./pages/Calendar";
import { Tasks } from "./pages/Tasks";
import { Settings } from "./pages/Settings";
import { SignIn } from "./pages/SignIn";
import type { Habit, HabitColor } from "./types";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100dvh", color: "rgba(234,236,244,0.4)",
        fontFamily: "Geist, Inter, system-ui, sans-serif",
      }}>
        Loading...
      </div>
    );
  }

  if (!user) return <SignIn />;

  return <>{children}</>;
}

function AppContent() {
  useTheme();
  const { addHabit, updateHabit, deleteHabit } = useHabitsContext();
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [showNewHabit, setShowNewHabit] = useState(false);
  const [showQuickLog, setShowQuickLog] = useState(false);

  const handleEditFromHome = (habit: Habit) => {
    setEditingHabit(habit);
  };

  const handleSaveEdit = (data: {
    name: string;
    icon: string;
    color: HabitColor;
    frequency: "daily" | "weekly";
  }) => {
    if (editingHabit) {
      updateHabit(editingHabit.id, data);
      setEditingHabit(null);
    }
  };

  const handleSaveNew = (data: {
    name: string;
    icon: string;
    color: HabitColor;
    frequency: "daily" | "weekly";
  }) => {
    addHabit(data);
    setShowNewHabit(false);
  };

  const handleDeleteFromHome = () => {
    if (editingHabit) {
      deleteHabit(editingHabit.id);
      setEditingHabit(null);
    }
  };

  return (
    <>
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          margin: "0 auto",
          minHeight: "100dvh",
          padding: "calc(env(safe-area-inset-top, 0px) + var(--space-6)) var(--space-4)",
          paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <Routes>
          <Route path="/" element={<Home onEditHabit={handleEditFromHome} />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/social" element={<Social />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>

      <BottomNav
        onAddHabit={() => setShowNewHabit(true)}
        onQuickLog={() => setShowQuickLog(true)}
      />

      {editingHabit && (
        <HabitForm
          habit={editingHabit}
          onSave={handleSaveEdit}
          onDelete={handleDeleteFromHome}
          onClose={() => setEditingHabit(null)}
        />
      )}

      {showNewHabit && (
        <HabitForm
          onSave={handleSaveNew}
          onClose={() => setShowNewHabit(false)}
        />
      )}

      {showQuickLog && (
        <QuickLog onClose={() => setShowQuickLog(false)} />
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <HabitsProvider>
          <AppContent />
        </HabitsProvider>
      </AuthGate>
    </AuthProvider>
  );
}
```

- [ ] **Step 4: Verify the build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual test**

Run the dev server. Verify:
- The sign-in screen appears (no session).
- "Continue with Google" redirects to Google OAuth (if Supabase Google provider is configured).
- Email/password form submits and shows errors for bad credentials.
- After signing in, the normal app renders with the bottom nav.
- Signing out (to be added in Task 5) returns to sign-in.

- [ ] **Step 6: Commit**

```bash
git add src/context/AuthContext.tsx src/pages/SignIn.tsx src/App.tsx
git commit -m "feat: add auth context, sign-in screen, and auth gate"
```

---

### Task 3: Refactor Habits & Completions to Supabase

**Files:**
- Modify: `src/hooks/useHabits.ts`
- Modify: `src/types.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`, `useAuth()` from `src/context/AuthContext.tsx`
- Produces: Same `useHabits()` return shape (all existing consumers stay unchanged), but backed by Supabase

- [ ] **Step 1: Update Completion type**

In `src/types.ts`, add `id` to the `Completion` interface:

```ts
export interface Completion {
  id?: string;
  habitId: string;
  date: string;
}
```

The `id` is optional because existing code creates completions without an `id` (the DB generates it). All reads from Supabase will include it.

- [ ] **Step 2: Rewrite useHabits to use Supabase**

Replace the contents of `src/hooks/useHabits.ts`:

```ts
import { useState, useCallback, useMemo, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type { Habit, Completion, HabitColor } from "../types";

function toDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function useHabits() {
  const { user } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch habits and completions on mount and when user changes
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function fetchAll() {
      const [habitsRes, completionsRes] = await Promise.all([
        supabase.from("habits").select("*").eq("user_id", user!.id).order("created_at"),
        supabase.from("completions").select("*").eq("user_id", user!.id),
      ]);

      if (cancelled) return;

      if (habitsRes.data) {
        setHabits(habitsRes.data.map((h) => ({
          id: h.id,
          name: h.name,
          icon: h.icon,
          color: h.color as HabitColor,
          frequency: h.frequency as "daily" | "weekly",
          createdAt: h.created_at.slice(0, 10),
        })));
      }

      if (completionsRes.data) {
        setCompletions(completionsRes.data.map((c) => ({
          id: c.id,
          habitId: c.habit_id,
          date: c.date,
        })));
      }

      setLoading(false);
    }

    fetchAll();

    // Refetch on tab focus (handles stale state after sleep)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchAll();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user]);

  const addHabit = useCallback(
    async (data: { name: string; icon: string; color: HabitColor; frequency: "daily" | "weekly" }) => {
      if (!user) return;

      // Optimistic: add with temp id
      const tempId = crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const optimistic: Habit = {
        id: tempId,
        ...data,
        createdAt: toDateKey(),
      };
      setHabits((prev) => [...prev, optimistic]);

      const { data: inserted, error } = await supabase
        .from("habits")
        .insert({ user_id: user.id, name: data.name, icon: data.icon, color: data.color, frequency: data.frequency })
        .select()
        .single();

      if (inserted) {
        // Replace temp with real
        setHabits((prev) =>
          prev.map((h) => h.id === tempId
            ? { ...h, id: inserted.id, createdAt: inserted.created_at.slice(0, 10) }
            : h
          )
        );
      } else if (error) {
        // Rollback
        setHabits((prev) => prev.filter((h) => h.id !== tempId));
      }

      return optimistic;
    },
    [user]
  );

  const updateHabit = useCallback(
    async (id: string, data: Partial<Omit<Habit, "id" | "createdAt">>) => {
      // Optimistic update
      setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, ...data } : h)));

      const updateData: Record<string, string> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.icon !== undefined) updateData.icon = data.icon;
      if (data.color !== undefined) updateData.color = data.color;
      if (data.frequency !== undefined) updateData.frequency = data.frequency;

      await supabase.from("habits").update(updateData).eq("id", id);
    },
    []
  );

  const deleteHabit = useCallback(
    async (id: string) => {
      setHabits((prev) => prev.filter((h) => h.id !== id));
      setCompletions((prev) => prev.filter((c) => c.habitId !== id));

      await supabase.from("habits").delete().eq("id", id);
      // Completions cascade-delete via FK
    },
    []
  );

  const toggleCompletion = useCallback(
    async (habitId: string, date: string = toDateKey()) => {
      if (!user) return;

      const exists = completions.some(
        (c) => c.habitId === habitId && c.date === date
      );

      if (exists) {
        // Optimistic remove
        setCompletions((prev) =>
          prev.filter((c) => !(c.habitId === habitId && c.date === date))
        );
        await supabase
          .from("completions")
          .delete()
          .eq("user_id", user.id)
          .eq("habit_id", habitId)
          .eq("date", date);
      } else {
        // Optimistic add
        const tempCompletion: Completion = { habitId, date };
        setCompletions((prev) => [...prev, tempCompletion]);

        const { error } = await supabase
          .from("completions")
          .insert({ user_id: user.id, habit_id: habitId, date });

        // Handle duplicate (race condition): ignore conflict
        if (error && error.code !== "23505") {
          setCompletions((prev) =>
            prev.filter((c) => !(c.habitId === habitId && c.date === date))
          );
        }
      }
    },
    [user, completions]
  );

  const isCompleted = useCallback(
    (habitId: string, date: string = toDateKey()) => {
      return completions.some(
        (c) => c.habitId === habitId && c.date === date
      );
    },
    [completions]
  );

  const getCompletionsForHabit = useCallback(
    (habitId: string): Completion[] => {
      return completions.filter((c) => c.habitId === habitId);
    },
    [completions]
  );

  const getStreak = useCallback(
    (habitId: string): number => {
      const habitCompletions = completions
        .filter((c) => c.habitId === habitId)
        .map((c) => c.date)
        .sort()
        .reverse();

      if (habitCompletions.length === 0) return 0;

      let streak = 0;
      const today = new Date();

      for (let i = 0; i < 365; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() - i);
        const key = toDateKey(checkDate);

        if (habitCompletions.includes(key)) {
          streak++;
        } else if (i === 0) {
          continue;
        } else {
          break;
        }
      }

      return streak;
    },
    [completions]
  );

  const getWeeklyData = useCallback(
    (habitId: string, weeks: number = 4): { date: string; completed: boolean }[][] => {
      const result: { date: string; completed: boolean }[][] = [];
      const today = new Date();
      const dayOfWeek = today.getDay();

      for (let w = weeks - 1; w >= 0; w--) {
        const week: { date: string; completed: boolean }[] = [];
        for (let d = 0; d < 7; d++) {
          const offset = w * 7 + (dayOfWeek - d);
          const date = new Date(today);
          date.setDate(today.getDate() - offset);
          const key = toDateKey(date);
          week.push({
            date: key,
            completed: completions.some(
              (c) => c.habitId === habitId && c.date === key
            ),
          });
        }
        result.push(week.reverse());
      }

      return result;
    },
    [completions]
  );

  const [todayKey, setTodayKey] = useState(() => toDateKey());

  useEffect(() => {
    const check = () => {
      const now = toDateKey();
      if (now !== todayKey) setTodayKey(now);
    };
    document.addEventListener("visibilitychange", check);
    const interval = setInterval(check, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", check);
      clearInterval(interval);
    };
  }, [todayKey]);

  const todaysHabits = useMemo(() => {
    return habits.filter((h) => {
      if (h.frequency === "daily") return true;
      const day = new Date().getDay();
      return day === 1;
    });
  }, [habits, todayKey]);

  const todaysProgress = useMemo(() => {
    if (todaysHabits.length === 0) return { done: 0, total: 0 };
    const done = todaysHabits.filter((h) =>
      completions.some((c) => c.habitId === h.id && c.date === todayKey)
    ).length;
    return { done, total: todaysHabits.length };
  }, [todaysHabits, completions, todayKey]);

  const hasHiddenWeekly = useMemo(() => {
    const day = new Date().getDay();
    return day !== 1 && habits.some((h) => h.frequency === "weekly");
  }, [habits, todayKey]);

  const bestStreak = useMemo(() => {
    if (habits.length === 0) return 0;
    return Math.max(...habits.map((h) => getStreak(h.id)), 0);
  }, [habits, getStreak]);

  const weeklyPerfectDays = useMemo(() => {
    if (todaysHabits.length === 0) return { perfect: 0, total: 7 };
    const today = new Date();
    const dayOfWeek = today.getDay();
    let perfect = 0;

    for (let i = 0; i <= dayOfWeek; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - (dayOfWeek - i));
      const key = toDateKey(d);
      const allDone = todaysHabits.every((h) =>
        completions.some((c) => c.habitId === h.id && c.date === key)
      );
      if (allDone) perfect++;
    }

    return { perfect, total: dayOfWeek + 1 };
  }, [todaysHabits, completions, todayKey]);

  const recentActivity = useMemo(() => {
    const today = new Date();
    return habits.map((h) => {
      const days: { date: string; done: boolean }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = toDateKey(d);
        days.push({
          date: key,
          done: completions.some((c) => c.habitId === h.id && c.date === key),
        });
      }
      return { habit: h, days };
    });
  }, [habits, completions, todayKey]);

  return {
    habits,
    completions,
    loading,
    addHabit,
    updateHabit,
    deleteHabit,
    toggleCompletion,
    isCompleted,
    getCompletionsForHabit,
    getStreak,
    getWeeklyData,
    todaysHabits,
    todaysProgress,
    todayKey,
    hasHiddenWeekly,
    bestStreak,
    weeklyPerfectDays,
    recentActivity,
  };
}
```

Note: the return shape is the same plus `loading`. All existing consumers (`useHabitsContext()`) continue to work unchanged.

- [ ] **Step 3: Verify the build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual test**

Sign in, create a habit, toggle completions. Verify in Supabase dashboard that rows appear in `habits` and `completions` tables. Refresh the page — data should persist from the server.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useHabits.ts src/types.ts
git commit -m "feat: refactor habits and completions to use Supabase"
```

---

### Task 4: Extract & Migrate Tasks and Calendar Events

**Files:**
- Create: `src/hooks/useTasks.ts`
- Create: `src/hooks/useCalendarEvents.ts`
- Create: `src/context/TasksContext.tsx`
- Create: `src/context/CalendarEventsContext.tsx`
- Modify: `src/pages/Home.tsx`
- Modify: `src/pages/Calendar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`, `useAuth()` from `src/context/AuthContext.tsx`
- Produces: `useTasks()` returning `{ tasks, loading, addTask, toggleTask, deleteTask }`; `useCalendarEvents()` returning `{ events, loading, addEvent, removeEvent }`

- [ ] **Step 1: Create useTasks hook**

Create `src/hooks/useTasks.ts`:

```ts
import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

export interface Task {
  id: string;
  label: string;
  done: boolean;
}

export function useTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetch() {
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at");

      if (cancelled) return;
      if (data) {
        setTasks(data.map((t) => ({ id: t.id, label: t.label, done: t.done })));
      }
      setLoading(false);
    }

    fetch();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetch();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user]);

  const addTask = useCallback(async (label: string) => {
    if (!user) return;
    const tempId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    setTasks((prev) => [...prev, { id: tempId, label, done: false }]);

    const { data } = await supabase
      .from("tasks")
      .insert({ user_id: user.id, label })
      .select()
      .single();

    if (data) {
      setTasks((prev) => prev.map((t) => t.id === tempId ? { ...t, id: data.id } : t));
    }
  }, [user]);

  const toggleTask = useCallback(async (id: string) => {
    let newDone = false;
    setTasks((prev) => prev.map((t) => {
      if (t.id === id) {
        newDone = !t.done;
        return { ...t, done: newDone };
      }
      return t;
    }));

    await supabase.from("tasks").update({ done: newDone }).eq("id", id);
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await supabase.from("tasks").delete().eq("id", id);
  }, []);

  return { tasks, loading, addTask, toggleTask, deleteTask };
}
```

- [ ] **Step 2: Create TasksContext**

Create `src/context/TasksContext.tsx`:

```tsx
import { createContext, useContext } from "react";
import { useTasks } from "../hooks/useTasks";

type TasksContextValue = ReturnType<typeof useTasks>;

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const tasks = useTasks();
  return <TasksContext.Provider value={tasks}>{children}</TasksContext.Provider>;
}

export function useTasksContext(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error("useTasksContext must be used within TasksProvider");
  return ctx;
}
```

- [ ] **Step 3: Create useCalendarEvents hook**

Create `src/hooks/useCalendarEvents.ts`:

```ts
import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
}

export function useCalendarEvents() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetch() {
      const { data } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("user_id", user!.id)
        .order("date")
        .order("time");

      if (cancelled) return;
      if (data) {
        setEvents(data.map((e) => ({
          id: e.id,
          title: e.title,
          date: e.date,
          time: e.time ?? "",
          location: e.location ?? "",
        })));
      }
      setLoading(false);
    }

    fetch();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetch();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user]);

  const addEvent = useCallback(async (data: { title: string; date: string; time: string; location: string }) => {
    if (!user) return;
    const tempId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const optimistic: CalendarEvent = { id: tempId, ...data };
    setEvents((prev) => [...prev, optimistic]);

    const { data: inserted } = await supabase
      .from("calendar_events")
      .insert({
        user_id: user.id,
        title: data.title,
        date: data.date,
        time: data.time || null,
        location: data.location || null,
      })
      .select()
      .single();

    if (inserted) {
      setEvents((prev) => prev.map((e) => e.id === tempId ? { ...e, id: inserted.id } : e));
    }
  }, [user]);

  const removeEvent = useCallback(async (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    await supabase.from("calendar_events").delete().eq("id", id);
  }, []);

  return { events, loading, addEvent, removeEvent };
}
```

- [ ] **Step 4: Create CalendarEventsContext**

Create `src/context/CalendarEventsContext.tsx`:

```tsx
import { createContext, useContext } from "react";
import { useCalendarEvents } from "../hooks/useCalendarEvents";

type CalendarEventsContextValue = ReturnType<typeof useCalendarEvents>;

const CalendarEventsContext = createContext<CalendarEventsContextValue | null>(null);

export function CalendarEventsProvider({ children }: { children: React.ReactNode }) {
  const cal = useCalendarEvents();
  return <CalendarEventsContext.Provider value={cal}>{children}</CalendarEventsContext.Provider>;
}

export function useCalendarEventsContext(): CalendarEventsContextValue {
  const ctx = useContext(CalendarEventsContext);
  if (!ctx) throw new Error("useCalendarEventsContext must be used within CalendarEventsProvider");
  return ctx;
}
```

- [ ] **Step 5: Add providers to App.tsx**

In `src/App.tsx`, wrap `AppContent` inside `TasksProvider` and `CalendarEventsProvider` (inside `AuthGate`, alongside `HabitsProvider`):

```tsx
import { TasksProvider } from "./context/TasksContext";
import { CalendarEventsProvider } from "./context/CalendarEventsContext";

// In the App component's return:
export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <HabitsProvider>
          <TasksProvider>
            <CalendarEventsProvider>
              <AppContent />
            </CalendarEventsProvider>
          </TasksProvider>
        </HabitsProvider>
      </AuthGate>
    </AuthProvider>
  );
}
```

- [ ] **Step 6: Update Home.tsx to use TasksContext and CalendarEventsContext**

In `src/pages/Home.tsx`:
1. Remove the inline `tasks` state, the `localStorage.getItem("pulse-tasks")` initializer, the `localStorage.setItem` effect, and the `toggleTask` function.
2. Remove `loadLocalEvents`, the `LocalEvent` interface, and the `localEvents`/`selectedLocalEvents` useMemo calls.
3. Import and use the contexts:

```ts
import { useTasksContext } from "../context/TasksContext";
import { useCalendarEventsContext } from "../context/CalendarEventsContext";
```

Inside the component:
```ts
const { tasks, toggleTask } = useTasksContext();
const { events: allCalendarEvents } = useCalendarEventsContext();
const selectedLocalEvents = useMemo(
  () => allCalendarEvents.filter((e) => e.date === selectedDate),
  [allCalendarEvents, selectedDate],
);
```

The rest of the rendering code stays the same — `tasks.map(...)`, `toggleTask(id)`, and `selectedLocalEvents.map(...)` already match the shapes.

- [ ] **Step 7: Update Calendar.tsx to use CalendarEventsContext**

In `src/pages/Calendar.tsx`:
1. Remove the `LocalEvent` interface, `LOCAL_EVENTS_KEY`, `loadLocalEvents`, `saveLocalEvents`.
2. Remove the inline `localEvents` state, `addLocalEvent`, and `removeLocalEvent`.
3. Import and use the context:

```ts
import { useCalendarEventsContext } from "../context/CalendarEventsContext";
```

Inside the component:
```ts
const { events: localEvents, addEvent, removeEvent } = useCalendarEventsContext();
```

Update `addLocalEvent` call in the form submit to:
```ts
onSubmit={(e) => {
  e.preventDefault();
  if (!newEventTitle.trim()) return;
  addEvent({
    title: newEventTitle.trim(),
    date: selectedDate,
    time: newEventTime,
    location: newEventLocation.trim(),
  });
  setNewEventTitle("");
  setNewEventTime("");
  setNewEventLocation("");
  setShowAddForm(false);
}}
```

Update `removeLocalEvent(event.id)` calls to `removeEvent(event.id)`.

The `selectedLocalEvents` useMemo stays the same shape — it filters `localEvents` by `selectedDate`.

- [ ] **Step 8: Verify the build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Manual test**

Sign in. Add a task, toggle it, verify it persists across refresh. Add a calendar event, verify it appears on the calendar and home page. Check Supabase dashboard for rows.

- [ ] **Step 10: Commit**

```bash
git add src/hooks/useTasks.ts src/hooks/useCalendarEvents.ts src/context/TasksContext.tsx src/context/CalendarEventsContext.tsx src/pages/Home.tsx src/pages/Calendar.tsx src/App.tsx
git commit -m "feat: extract tasks and calendar events to Supabase-backed hooks"
```

---

### Task 5: Profile Hook, Settings Sign-Out & Data Reset

**Files:**
- Create: `src/hooks/useProfile.ts`
- Modify: `src/pages/Settings.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`, `useAuth()` from `src/context/AuthContext.tsx`
- Produces: `useProfile()` returning `{ name, avatarUrl, loading, updateName }`

- [ ] **Step 1: Create useProfile hook**

Create `src/hooks/useProfile.ts`:

```ts
import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

export function useProfile() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetch() {
      const { data } = await supabase
        .from("profiles")
        .select("name, avatar_url")
        .eq("user_id", user!.id)
        .single();

      if (cancelled) return;
      if (data) {
        setName(data.name ?? "");
        setAvatarUrl(data.avatar_url);
      }
      setLoading(false);
    }

    fetch();
    return () => { cancelled = true; };
  }, [user]);

  const updateName = useCallback(async (newName: string) => {
    if (!user) return;
    setName(newName);
    await supabase
      .from("profiles")
      .update({ name: newName })
      .eq("user_id", user.id);
  }, [user]);

  return { name, avatarUrl, loading, updateName };
}
```

- [ ] **Step 2: Update Settings.tsx**

In `src/pages/Settings.tsx`:

1. Remove `PROFILE_KEY`, `getStoredName`, and the `saveName` callback.
2. Add imports:

```ts
import { useProfile } from "../hooks/useProfile";
import { useAuth } from "../context/AuthContext";
```

3. Inside `Settings()`:

```ts
const profile = useProfile();
const { signOut } = useAuth();
const [name, setName] = useState("");

// Sync local name state when profile loads
useEffect(() => { setName(profile.name); }, [profile.name]);

const saveName = useCallback((value: string) => {
  setName(value);
  profile.updateName(value);
}, [profile.updateName]);
```

4. Update the avatar `<img>` src to use `profile.avatarUrl || "/assets/profile-avatar.png"`.

5. Update `handleReset` to delete all user data from Supabase instead of clearing localStorage:

```ts
const handleReset = useCallback(async () => {
  await Promise.all([
    supabase.from("habits").delete().neq("id", ""),
    supabase.from("tasks").delete().neq("id", ""),
    supabase.from("calendar_events").delete().neq("id", ""),
    supabase.from("completions").delete().neq("id", ""),
  ]);
  setShowReset(false);
  window.location.reload();
}, []);
```

Add `import { supabase } from "../lib/supabase";` at the top.

6. Add a sign-out button in the About section, below the version:

```tsx
<button
  onClick={signOut}
  style={{
    width: "100%",
    height: 44,
    borderRadius: "var(--radius-sm)",
    background: "transparent",
    border: "1px solid var(--color-border)",
    color: "var(--color-text-secondary)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    marginTop: "var(--space-3)",
  }}
>
  Sign Out
</button>
```

- [ ] **Step 3: Add useState/useEffect import if not already present**

Ensure `useState` and `useEffect` are imported from React in Settings.tsx (currently only `useState` and `useCallback` are imported — add `useEffect`).

- [ ] **Step 4: Verify the build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual test**

Sign in. Go to Settings. Verify:
- Name loads from Supabase (or shows empty for new user).
- Editing name persists after refresh.
- Avatar shows Google profile picture if signed in with Google.
- "Reset All Data" clears data from Supabase (verify in dashboard).
- "Sign Out" returns to the sign-in screen.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useProfile.ts src/pages/Settings.tsx
git commit -m "feat: profile hook, sign-out button, and Supabase data reset"
```

---

### Task 6: localStorage-to-Supabase Data Migration

**Files:**
- Create: `src/lib/migrate.ts`
- Modify: `src/context/AuthContext.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`, `User` from `@supabase/supabase-js`
- Produces: `migrateLocalData(user: User): Promise<void>`

- [ ] **Step 1: Create migration module**

Create `src/lib/migrate.ts`:

```ts
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const MIGRATED_FLAG = "pulse-migrated";

export async function migrateLocalData(user: User): Promise<void> {
  // Already migrated
  try {
    if (localStorage.getItem(MIGRATED_FLAG) === "true") return;
  } catch {
    return;
  }

  // Check if user has any data on server already
  const { count } = await supabase
    .from("habits")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (count && count > 0) {
    // User already has server data — mark migrated and skip
    try { localStorage.setItem(MIGRATED_FLAG, "true"); } catch {}
    return;
  }

  // Read localStorage data
  let habits: { id: string; name: string; icon: string; color: string; frequency: string; createdAt: string }[] = [];
  let completions: { habitId: string; date: string }[] = [];
  let tasks: { id: string; label: string; done: boolean }[] = [];
  let events: { id: string; title: string; date: string; time: string; location: string }[] = [];
  let profileName = "";

  try {
    const h = localStorage.getItem("pulse-habits");
    if (h) habits = JSON.parse(h);
  } catch {}
  try {
    const c = localStorage.getItem("pulse-completions");
    if (c) completions = JSON.parse(c);
  } catch {}
  try {
    const t = localStorage.getItem("pulse-tasks");
    if (t) tasks = JSON.parse(t);
  } catch {}
  try {
    const e = localStorage.getItem("pulse-calendar-events");
    if (e) events = JSON.parse(e);
  } catch {}
  try {
    profileName = localStorage.getItem("pulse-profile-name") || "";
  } catch {}

  // Nothing to migrate
  if (habits.length === 0 && tasks.length === 0 && events.length === 0 && !profileName) {
    try { localStorage.setItem(MIGRATED_FLAG, "true"); } catch {}
    return;
  }

  try {
    // Build ID mapping for habits (old client ID -> new UUID)
    const idMap = new Map<string, string>();

    if (habits.length > 0) {
      const { data: insertedHabits } = await supabase
        .from("habits")
        .insert(
          habits.map((h) => ({
            user_id: user.id,
            name: h.name,
            icon: h.icon,
            color: h.color,
            frequency: h.frequency,
          }))
        )
        .select();

      if (insertedHabits) {
        // Map old IDs to new UUIDs in insertion order
        habits.forEach((h, i) => {
          if (insertedHabits[i]) {
            idMap.set(h.id, insertedHabits[i].id);
          }
        });
      }
    }

    // Migrate completions with mapped habit IDs
    if (completions.length > 0) {
      const mapped = completions
        .map((c) => {
          const newHabitId = idMap.get(c.habitId);
          if (!newHabitId) return null;
          return { user_id: user.id, habit_id: newHabitId, date: c.date };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

      if (mapped.length > 0) {
        await supabase.from("completions").insert(mapped);
      }
    }

    // Migrate tasks
    if (tasks.length > 0) {
      await supabase.from("tasks").insert(
        tasks.map((t) => ({ user_id: user.id, label: t.label, done: t.done }))
      );
    }

    // Migrate calendar events
    if (events.length > 0) {
      await supabase.from("calendar_events").insert(
        events.map((e) => ({
          user_id: user.id,
          title: e.title,
          date: e.date,
          time: e.time || null,
          location: e.location || null,
        }))
      );
    }

    // Migrate profile name
    if (profileName) {
      await supabase
        .from("profiles")
        .update({ name: profileName })
        .eq("user_id", user.id);
    }

    // Mark as migrated and clean up
    localStorage.setItem(MIGRATED_FLAG, "true");
    localStorage.removeItem("pulse-habits");
    localStorage.removeItem("pulse-completions");
    localStorage.removeItem("pulse-tasks");
    localStorage.removeItem("pulse-calendar-events");
    localStorage.removeItem("pulse-profile-name");
  } catch {
    // Migration failed — set pending flag for retry
    try { localStorage.setItem("pulse-migration-pending", "true"); } catch {}
  }
}
```

- [ ] **Step 2: Call migration from AuthContext**

In `src/context/AuthContext.tsx`, add the migration call after session is established. Add a `migrating` state:

```tsx
import { migrateLocalData } from "../lib/migrate";

// Inside AuthProvider, add:
const [migrating, setMigrating] = useState(false);

// Replace the getSession call:
useEffect(() => {
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    const currentUser = session?.user ?? null;
    setUser(currentUser);
    if (currentUser) {
      setMigrating(true);
      await migrateLocalData(currentUser);
      setMigrating(false);
    }
    setLoading(false);
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser && _event === "SIGNED_IN") {
        setMigrating(true);
        await migrateLocalData(currentUser);
        setMigrating(false);
      }
    }
  );

  return () => subscription.unsubscribe();
}, []);
```

Update the `loading` value in the provider to include migration:
```tsx
value={{ user, loading: loading || migrating, signInWithGoogle, signInWithEmail, signUp, signOut }}
```

- [ ] **Step 3: Verify the build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual test**

1. Before signing in, add some habits, tasks, and events via the old localStorage flow (or pre-populate localStorage manually).
2. Sign in. The migration should run — check Supabase dashboard for the migrated data.
3. Refresh the page — data should load from Supabase. localStorage keys should be cleared (except `pulse-migrated`).
4. Sign out, sign in again — migration should skip (already migrated flag).

- [ ] **Step 5: Commit**

```bash
git add src/lib/migrate.ts src/context/AuthContext.tsx
git commit -m "feat: localStorage-to-Supabase data migration on first login"
```

---

### Task 7: Cleanup & Final Verification

**Files:**
- Modify: `src/pages/Home.tsx` (remove dead localStorage imports/code)
- Modify: `src/pages/Calendar.tsx` (remove dead localStorage imports/code)

**Interfaces:**
- Consumes: all prior tasks
- Produces: clean build, no dead code

- [ ] **Step 1: Remove dead code from Home.tsx**

Remove the `LocalEvent` interface and `loadLocalEvents` function from the top of `src/pages/Home.tsx` (these were defined locally and are now replaced by the context).

- [ ] **Step 2: Remove dead code from Calendar.tsx**

Verify that `loadLocalEvents`, `saveLocalEvents`, the old `LocalEvent` interface, and `LOCAL_EVENTS_KEY` have been fully removed in Task 4. If any remain, remove them.

- [ ] **Step 3: Full build check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: End-to-end manual test**

Run the dev server. Test the full flow:
1. Open the app — sign-in screen appears.
2. Sign in with Google (or email) — app loads, empty state.
3. Add a habit, toggle completion, add a task, add a calendar event.
4. Go to Settings — name shows (from Google profile or empty), sign-out button works.
5. Refresh — all data persists.
6. Open Supabase dashboard — all rows present with correct `user_id`.
7. Sign out, sign in as a different user — that user sees their own empty data (RLS working).
8. Test migration: clear `pulse-migrated` flag from localStorage, add some localStorage data manually, sign in — data should migrate.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove dead localStorage code, final cleanup"
```
