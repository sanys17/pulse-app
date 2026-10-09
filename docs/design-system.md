# Pulse Design System

Written for: anyone (human or Claude) building or changing Pulse UI. Source of truth for tokens is `src/index.css`; this document says how to use them and records the current drift.

## 1. Principles

1. **Dark, OLED-first.** The app is always dark (`useTheme` forces it). Pure-ish black canvas `#07070C`, content floats on glass.
2. **Calm, not loud.** One muted accent, color used for meaning (habit color, status), never decoration.
3. **Direct and instant.** Respond on press, animate with springs, never block input during a transition.
4. **Thumb-first.** Every tap target is at least 44x44px. Primary actions sit in the lower half of the screen.
5. **Forgiving.** Optimistic updates, easy undo, confirm only for destructive actions (Reset All Data).

## 2. Color

Use semantic tokens (`--color-*`), never raw hex, in new code.

| Role | Token | Value (dark) |
|---|---|---|
| Canvas | `--color-canvas` | `#07070C` |
| Surface | `--color-surface` | `#12121C` |
| Raised surface | `--color-surface-dim` | `#1C1C2A` |
| Border | `--color-border` | `#2A2A3A` |
| Text | `--color-text` | `#EAECF4` |
| Secondary text | `--color-text-secondary` | `#626880` |
| Tertiary text | `--color-text-tertiary` | `#9496A8` |
| Accent / completion | `--color-accent`, `--color-complete` | `#8E9BC4` (Moonstone) |
| Completion tint | `--color-complete-bg` | `rgba(142,155,196,0.14)` |

**Habit colors** (six, from `HABIT_COLORS` in `src/types.ts`): Rose, Sky, Sage, Amber, Iris, Clay. Each has `bg` (tint), `text`, and `fill` (solid). Use `bg` + `text` for chips and icons, `fill` for progress and bars.

**Status colors** (hard-coded today, see Known drift): success `#66BB6A`, info/Google Calendar `#64B5F6`, destructive `#E5484D`.

**Heatmap:** `--color-heat-0..4`, the accent at 0 / 14 / 30 / 52 / 78% opacity.

Light theme tokens exist under `[data-theme="light"]` but the light theme is not shipped. Do not design for it, but keep using tokens so it stays possible.

## 3. Typography

Font: **Geist**, falling back to the system stack. Smoothing is antialiased.

| Use | Size | Weight | Tracking |
|---|---|---|---|
| Page title | 24px (`--text-2xl`) | 700 | -0.03em |
| Section heading | 16-17px | 700 | 0 |
| Body / row title | 14-15px | 500-600 | 0 |
| Secondary / meta | 12-13px | 400-500 | 0 |
| Section label | 13px, uppercase | 600 | +0.05em |
| Stat value | 18px | 700 | 0 |
| Micro label | 11px | 500 | +0.02em |

Rules: large text gets negative tracking, small uppercase text gets positive tracking. **Form inputs must render at 16px on touch devices** (global CSS rule; iOS zooms the page otherwise).

## 4. Spacing, radius, size

- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48 (`--space-1..12`). Page gutter is `--space-4`, section gap `--space-5/6`.
- Radius: 8 (`--radius-sm`, inputs and buttons), 12 (`--radius-md`, cards), 16 (`--radius-lg`, sheets), 9999 (pills, chips), 50% (icon buttons).
- App column: max-width 430px, centered. Bottom padding clears the nav: `calc(80px + env(safe-area-inset-bottom))`. Top uses `env(safe-area-inset-top)`.
- Touch targets: minimum 44x44. A visually smaller icon still gets a 44px hit area.

## 5. Surfaces

Two surfaces are canonical. Pick by what the surface is.

**Card (default content surface):** `background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-4)`. Nested/raised areas inside a card use `--color-surface-dim`.

**Glass (floating chrome: bottom nav, FAB, sheets, popovers):**
```
background: rgba(20,20,30,0.75);
backdrop-filter: blur(20px) saturate(180%);
-webkit-backdrop-filter: blur(20px) saturate(180%);
border: 1px solid rgba(255,255,255,0.08);
box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.4);
```
Never stack a light translucent surface on another. Always include the `-webkit-` prefix. Bigger surfaces read as thicker: stronger blur and deeper shadow.

**Backdrop for sheets:** dim scrim behind a modal task; non-blocking panels get no scrim.

## 6. Motion

- Press feedback on pointer-down, not release: `scale(0.97)`, 100-150ms ease-out.
- Default state change: `200ms ease`, and transition only the properties that change (not `all` in new code).
- Springs for anything physical (FAB, sheets, toggles): `cubic-bezier(0.34, 1.56, 0.64, 1)`, 250-300ms. Add overshoot only when the gesture had momentum.
- Never lock input during an animation; animate from the current value.
- Honor `prefers-reduced-motion`: replace slides and springs with a short opacity fade.

## 7. Components

| Component | File | Notes |
|---|---|---|
| Bottom nav | `components/BottomNav.tsx` | Glass pill, 4 icon tabs at 44px + separate FAB (44px circle). Active = filled icon + `rgba(255,255,255,0.08)` pill |
| Habit card | `components/HabitCard.tsx` | Habit color tint + icon, tap toggles completion |
| Habit form | `components/HabitForm.tsx` | Sheet; icon picker + six color swatches |
| Quick log | `components/QuickLog.tsx` | Fast completion list for today |
| Weekly heatmap | `components/WeeklyHeatmap.tsx` | Uses `--color-heat-*` |
| Plan / feed / friend cards | `PlanCard`, `FeedCard`, `FriendRequestCard` | Card surface, 12px radius |
| Sheets | `CreatePlanSheet`, `FriendsSheet`, `UsernameSetup` | Glass/sheet surface, `--radius-lg` top corners |
| Integration row | in `pages/Settings.tsx` | Card + status pill (green connected / neutral connect) |

**Buttons:** primary action 44px high, radius 8, accent tint background (`rgba(167,139,250,0.25)` today) with accent text; secondary is transparent with a 1px `--color-border`; destructive is `#E5484D` fill with white text, shown only after a confirm step.

**Forms:** 44px high inputs, `--color-surface` background, 1px border, 8px radius. **Date and time inputs must show a placeholder overlay while empty** (iOS renders them blank): wrap in a `position: relative` div, make the input text transparent when empty, and overlay a `pointer-events: none` label ("Date (optional)").

**Empty states:** one short secondary-text line ("Nothing scheduled"), no illustration.

## 8. Accessibility

- Text contrast (measured): primary text on cards is 15.8:1, accent 6.8:1, `--color-text-tertiary` (`#9496A8`) 6.4:1, all passing AA. `--color-text-secondary` (`#626880`) is only 3.7:1 on the canvas and 3.4:1 on cards, which fails AA for body text. Use it for decorative or non-essential meta only; use tertiary for anything the user needs to read, especially under 14px.
- Icon-only buttons need `aria-label`; decorative icons get `aria-hidden`.
- Don't disable pinch-zoom (no `maximum-scale`).
- Respect `prefers-reduced-motion`; add `prefers-reduced-transparency` fallback (solid `--color-surface`) when touching glass.

## 9. Known drift (cleanup backlog)

1. **Two glass recipes.** Light glass `rgba(98,104,128,0.20)` + `blur(4px) saturate(120%)` is used about 14 times (cards on the home dashboard); dark glass above is used about 8 times. Decide per surface and migrate toward the canonical dark glass for floating chrome.
2. **Two accents.** Moonstone `#8E9BC4` is the token; violet `#A78BFA` is hard-coded in the calendar, sign-in, and buttons. Pick one as `--color-accent` (recommended: keep Moonstone for chrome, define violet as `--color-event` for user-created events) and replace raw hex.
3. **Raw hex for status colors** (`#66BB6A`, `#64B5F6`, `#E5484D`) should become `--color-success`, `--color-info`, `--color-danger`.
4. **Inline styles everywhere.** Tailwind is imported but barely used. New shared patterns (card, glass, primary button, field) should become small components or CSS classes instead of copy-pasted style objects.
5. **`transition: all`** appears in about 9 places; narrow to the changed properties.
6. **Sub-13px text** (9-12px) appears in about 22 places; keep 11px only for uppercase micro labels.

## 10. Checklist for a new screen

1. Page wrapper: 430px column, safe-area padding, `--space-4` gutter, title 24px/700/-0.03em.
2. Content in cards (`--color-surface`); floating controls in glass.
3. Colors from tokens; habit color via `HABIT_COLORS`.
4. All tap targets 44px, press feedback on pointer-down.
5. Inputs 16px on touch; date/time have placeholder overlays.
6. Empty, loading, and error states handled (hooks currently swallow errors; surface them).
7. Verify on a real iPhone as an installed PWA (keyboard, safe areas, glass blur), then run `npm run build`.
