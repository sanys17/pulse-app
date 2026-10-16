# Animated sky backgrounds for the Home screen

Design document. Written 2026-10-15. Status: reviewed, ready to plan.

Supersedes the "Background direction" paragraph in `handoff.md` (2026-10-15), which recorded
the decision to go sky-only but left the content and motion unspecified.

## Intent

The Home screen hero currently sits on a photograph of a mountain under open sky. The arc and
the streak number straddle two surfaces — open sky above, textured rock below — so neither
element looks like it belongs to one thing. The fix agreed with the user is to remove the
horizon entirely: **sky only, no landmass**.

Once the background is pure sky, it can do a second job. The user opens Pulse at different
points in the day for different reasons, and the sky can meet them where they are:

- **Morning** should energize. The user's words: "nice and energizing — the shines from the
  sun should do that."
- **Afternoon** should sustain. "Busy day, keep me energized till night."
- **Night** should calm. "Calming feel, beautiful stars."

This is the emotional spine of the feature. Every decision below serves it. A sky that is
merely decorative has failed even if it is beautiful.

The night sky additionally reflects **the real sky above the user** — actual star positions
and actual planet visibility for their location and the current time. This was the user's own
idea and it is a goal, not a nice-to-have.

## Goals

1. Three distinct skies — morning, afternoon, night — each photographic, each with its own
   motion, switching automatically by time of day.
2. Motion that reads as *light behaving*, not as objects sliding around.
3. Night reproduces the real star pattern for the user's location and time.
4. A rare night event — either a galaxy **or** a planet, never both — derived from the real
   sky but filtered to genuinely striking occasions, landing near once a month.
5. Negligible battery cost. No WebGL.
6. Degrades sensibly: no location, reduced motion, offline, older devices.

## Non-goals

- Any landscape, horizon, mountain or foreground. The sky fills the frame.
- A fourth sky (dawn, dusk, golden hour). Three only.
- User-selectable skies or a manual override. The time of day decides.
- Astronomical accuracy beyond what the eye can judge. This is an ambient background, not a
  planetarium. A degree or two of error is invisible and acceptable.
- Constellation lines, star names, labels, or any educational layer.
- Weather. The sky does not reflect real conditions outside.

## Anti-goals

These would make the feature a failure even if it shipped and worked:

- **A background that competes with the data.** The streak number and arc are what the user
  came for. If the eye goes to the sky first, the sky is wrong.
- **Anything that looks like a screensaver.** Constant, regular, loop-obvious motion.
  Rhythm must be irregular and interruptible by long stretches of stillness.
- **Visible discrete particles.** The user rejected round glints explicitly ("just not the
  little balls"). Anything that reads as a countable object floating in front of the sky is
  wrong. Light may move; things may not.
- **Motion detached from the sun.** Also rejected explicitly: "I want the veils to come out of
  the sun, not randomly scatter across the screen." Every daytime light effect originates at
  the sun and radiates outward.
- **Measurable battery drain.** The arc already runs a WebGL shader. The sky must not add a
  second continuous GPU cost.

## Constraints

From `CLAUDE.md`, `docs/design-system.md` and the existing Home implementation:

- React 19 + TypeScript + Vite. Installed iPhone PWA is the primary target; always dark.
- App column is max-width 430px, centred. Safe-area insets at top and bottom.
- `prefers-reduced-motion` must be honoured — springs and slides become a short fade or stop.
- `prefers-reduced-transparency` fallbacks already exist for glass; the sky is not glass but
  should not fight them.
- No new `localStorage` entries. Only the Google Calendar token and the migration flag live
  there.
- Pure modules in `src/lib` are testable with `npm test` (`node --test`) **only if** they
  import nothing but other pure modules, using `.ts` extensions. The sky maths must be written
  as such a module to be testable.
- The dev server runs over plain HTTP on the LAN, which is **not a secure context**. Any
  browser API gated on HTTPS — `navigator.geolocation` among them — cannot be tested in
  development at all, only on the deployed site.
- `profiles.timezone` already exists and is validated by a database trigger.
- The hero arc's geometry derives from module constants in `src/pages/Home.tsx` and its shader
  clip uses `clipPathUnits="userSpaceOnUse"` in raw CSS pixels. The sky sits *behind* all of
  that and must not change the arc's layout or sizing assumptions.

## The design

### Architecture: still photograph, light painted on top

Every sky is a **still photographic image**. All motion is a thin layer rendered over it in
CSS. Nothing in the photograph itself moves.

This is the central structural decision and everything else follows from it. It preserves the
photographic depth and grain the user asked for, costs nothing on the GPU, and lets one motion
system serve all three times of day at different intensities.

The single exception is afternoon cloud (below), which is an object rather than light and
therefore needs its own layer.

Layer order, back to front:

1. Sky photograph (`<img>`, WebP)
2. Motion layers (CSS; per time of day)
3. Rendered stars and planets (SVG; night only)
4. Scrim
5. Existing hero content — arc, streak number, toggle

### Where the sky lives

The sky replaces the photograph **inside the existing hero panel** — today a `position: fixed`
block 520px tall with a rounded bottom, fading into `--color-canvas`, with page content
scrolling over it (`src/pages/Home.tsx`). It does not become a full-viewport background.

*(Decided by the user.)* The alternative — sky behind the entire screen — would force every
card and row to stay legible over a photograph, which means adding scrims or glass to content
that currently needs neither. "The sky fills the frame" throughout this document means that
panel, and "stars reach the full width and height" means the panel's bounds.

### The scrim gets lighter

The current heavy scrim exists only because the mountain photograph was visually busy. An even
sky does not need that much help separating text from background.

Two separate layers are involved, and the builder should know which is which:

- the radial scrim behind the hero text, currently
  `rgba(7,7,12,0.82) → rgba(7,7,12,0.45) → transparent` (`Home.tsx:510`)
- the bottom fade into the canvas, currently
  `0 → rgba(7,7,12,0.4) → rgba(7,7,12,0.85) → #07070C` (`Home.tsx:434`)

Only the **radial scrim** is in scope. The bottom fade exists to join the panel to the page
and should be left alone. Reduce the radial scrim's inner stop first — it is the one sitting
directly behind the streak number — and leave the outer stops roughly as they are.

**How to tell whether it still passes.** `docs/design-system.md` §8 gives ratios against flat
tokens, which does not translate to text over a photograph. Use this instead: for each text
element inside the panel, sample the **brightest** pixel region of the composited background
within that element's bounding box, and measure the ratio against it — worst case, not average.
The elements that must pass are the streak number and every text row inside the 520px panel.
Afternoon is the brightest sky and therefore the binding case. If it fails only there, keep the
heavier scrim on afternoon alone rather than raising it across all three.

### Morning — energizing

Sun positioned upper right. Two effects, both anchored at the sun:

**Breathing glow.** A soft radial halo centred on the sun, scaling roughly 1.00 → 1.09 and
varying in opacity on a slow cycle of about 11 seconds. Always running.

**Reaching beams.** Wedges of light whose point sits exactly on the sun. Each one fades in,
grows outward away from the sun, and dissolves as it travels — light pushing out into the sky.
Implemented as a conic gradient on an element centred on the sun, masked with a radial
gradient so it fades with distance, animated by scaling the element from its centre.

The rhythm matters more than the geometry. Each beam's visible pass occupies a small fraction
of its animation cycle, leaving the sky genuinely still in between. Two or three beams at
different angles on cycles of different lengths (around 23s and 31s, deliberately not
multiples of one another) mean the pattern never repeats audibly. Often nothing is happening.

This was chosen from three candidates. The rejected two: a single beam *pivoting* around the
sun, and a fan of beams fading in place. "Reaching out" won.

### Afternoon — sustaining

Sun higher and brighter, sky bluer. Same two effects as morning, with two changes:

**Beams fire far more often** — cycles around 13s, 17s and 21s rather than 23s and 31s — and
overlap, so the sky is rarely at rest. This is the difference between waking someone and
keeping them going.

**Clouds drift, minimally.** The user's words: "I want a movement of the clouds, but minimal."
Slow enough that it is only noticeable on a second look — a full traverse should take on the
order of three minutes or more. Builder should tune to taste, erring slower.

Because a cloud is an object rather than light, it cannot be painted over a flat photo. The
afternoon sky therefore needs **two assets**: a cloudless sky photograph, and a separate
transparent cloud layer that translates across it. The cloud layer must tile horizontally or
be wide enough to loop without a visible seam.

### Night — calming

Deep sky, stars edge to edge, nothing else on an ordinary night.

**Stars are real.** Positions are computed from a star catalogue for the user's location and
the current time, not painted into the photograph. The photographic asset for night is
therefore a *base* — atmospheric gradient, grain, perhaps faint airglow — with no stars in it.

**Twinkle is grouped, not per-star.** Stars are divided into three groups, each group's opacity
animated on its own slow cycle (around 6.5s, 9s and 12s, offset). This gives the appearance of
independent twinkling while animating three elements rather than several hundred. This is a
performance requirement, not a stylistic one.

**Stars must reach the full width and height of the frame.** An early mockup clustered them to
one side and the user caught it.

### The rare night

On most nights there is nothing but stars. Occasionally — the user's figure was "maybe once a
month" — the sky shows **either** the Milky Way **or** a planet. Never both.

**Rarity is the requirement, not raw visibility.** Plain astronomical visibility does not
produce rarity: for a mid-latitude observer at least one bright planet is above a modest
altitude on a large share of nights, and the Milky Way core is up during evening hours for
several months a year. Using visibility alone, something would appear most nights and the rare
night would become ordinary scenery — which defeats the point.

*(This tension was raised in review and settled by the user: rarity wins.)*

So the event stays real but is filtered to genuinely striking occasions:

- **Galaxy night**: the Milky Way core is not merely up but **well placed** — comfortably high
  during evening hours, not skimming the horizon.
- **Planet night**: a planet that is both **unusually bright and unusually high** after dark,
  not merely present.
- If both qualify, show one only. *(Builder's call: fixed precedence or apparent magnitude.)*

The thresholds are the lever, and they are the builder's to tune, with a stated target: **a
rare night should land somewhere near monthly over a year** — a handful to a dozen times, not
weekly and not twice a year. Verify by running the predicate across a simulated year for a
mid-latitude location and counting, before trusting any single threshold value. That count is
the acceptance test.

Because the decision still derives from the real sky and the date rather than from chance, it
is stable for a whole night and identical on every open — a refresh cannot spoil it, which was
an explicit requirement.

**What they look like.** Neither needs a photographic asset.

- The Milky Way is a **band**, and its angle across a zenith-centred projection changes with
  the hour and the observer's latitude. It is drawn as a soft SVG band positioned and rotated
  from the computed galactic plane, not pinned at a fixed angle. A static decorative glow would
  be wrong in exactly the way the clustered star field was wrong.
- The planet is a single dot, larger than any star, with a faint glow and a colour of its own
  so it reads as a planet rather than a bright star.

### Computing the sky

**Split into two modules**, because `CLAUDE.md` requires anything testable under `npm test` to
import nothing but other pure modules with `.ts` extensions — and the catalogue JSON and
`astronomy-engine` both violate that.

- `src/lib/sky.ts` — **pure and testable.** Takes positions as *injected inputs* and does all
  the reasoning: horizon culling, projection to screen coordinates, magnitude→size/opacity
  mapping, galaxy band placement, and the rare-night predicate. This is where every bug that
  matters would live, and all of it is testable without a catalogue or a dependency.
- A thin adapter outside that boundary loads the committed catalogue and calls
  `astronomy-engine` for planet and galactic-plane positions, then hands the results to
  `sky.ts`.

The pure module exposes roughly:

```
(date, observer, bodies) → {
  stars: [{x, y, magnitude}],
  planet: {x, y, magnitude, colour} | null,
  galaxy: {x, y, angle, length} | null,
}
```

Note that `galaxy` carries a position and an **angle**, not a boolean — the band's orientation
changes with the hour and the latitude, so a boolean would not be enough to draw it.

- **Catalogue**: the Yale Bright Star Catalogue, trimmed at build time to naked-eye brightness
  (magnitude ≤ 4.5, roughly 500 stars) and committed as JSON. Per star: right ascension,
  declination, magnitude, optionally colour index. The catalogue is effectively public domain,
  which avoids the share-alike condition attached to the HYG database. *(This choice is mine,
  made to keep licensing simple; HYG is also usable with attribution if the builder prefers
  its data.)*
- **Stars**: convert catalogue coordinates to altitude and azimuth for the observer and time,
  discard anything below the horizon, project the rest to screen coordinates. Since the design
  is sky-only with no horizon, the view looks upward — a stereographic projection centred near
  the zenith is the natural fit. Magnitude maps to radius and opacity.
- **Planets**: via `astronomy-engine` (npm, MIT, no dependencies, v2.1.19 at time of writing).
  Its `Equator` → `Horizon` pair gives altitude and azimuth for a body. Planetary ephemerides
  are not worth hand-rolling; this is the one place a dependency earns its keep. Stars alone
  would not need it.
- **Recompute cadence**: every few minutes. The sky turns 15° per hour, so anything under five
  minutes is wasted work.
- **Rendering**: SVG circles, not canvas, at these counts — cheaper to reason about and keeps
  the twinkle in CSS where the rest of the app's animation already lives.

### Location

Derived from the **timezone read directly from the browser** —
`Intl.DateTimeFormat().resolvedOptions().timeZone` — via a timezone→coordinates table.
**No geolocation permission is requested.**

Read it from the browser, not from `profiles.timezone`. The profile column exists, but it is
itself written from that same browser API by `usePushSync`, so going via the database would add
a fetch, a loading state and a failure mode to get a value already in hand. Reading it locally
means the sky is correct on first paint.

The lookup table is derived from the tz database's `zone.tab`, which is public domain and lists
representative coordinates for every zone — roughly 450 entries, trimmed and committed as data
rather than pulled in as a dependency.

Reasons for avoiding geolocation, in order: a habit tracker asking for your location on first
run is a bad trade; the sky needs no precision, so a degree or two of error is invisible; it
adds no new personal data and leaves the locked-down monitoring configuration untouched; and
`navigator.geolocation` cannot be tested on the LAN dev server at all, since that is not a
secure context.

*(This is my call, not the user's. A later "set your location" control in Settings would be a
clean refinement if the approximation ever proves unsatisfying — most relevant for users in
geographically large timezones, where the representative coordinate can be well off.)*

### Switching between skies

Boundaries: **morning 05:00–11:00, afternoon 11:00–18:00, night 18:00–05:00**, in the user's
local time. Crossfade at each boundary rather than cutting.

*(Boundaries proposed by me and approved by the user. Crossfade duration is left to the
builder; it should be slow enough not to read as a glitch if the app is open across a
boundary, and instant if the app is opened fresh after one.)*

### Keeping it cheap

The anti-goal says "no measurable battery drain," but the breathing glow runs continuously and
the afternoon beams are designed to overlap. Two rules make that safe, and both have to be in
the layer design from the start rather than retrofitted:

1. **Nothing animates while it cannot be seen.** Suspend all sky animation when the document is
   hidden (`visibilitychange`) and when the hero panel is scrolled out of view
   (`IntersectionObserver`). Since the panel is `position: fixed` it rarely leaves the viewport,
   but the hidden-document case is the common one and costs nothing to handle.
2. **Animate layers, never elements.** Opacity and transform on a handful of composited layers.
   No animation frame loop, no WebGL, no per-star animation, and no animating properties that
   force layout.

Honest limit on verification: a build cannot measure battery. What can be checked is that no
`requestAnimationFrame` loop and no second GPU context were introduced, that animated layer
count stays in single digits, and that the device does not warm noticeably during a few minutes
on the Home screen. If it does, rule 1 is the lever.

### Degradation

- **`prefers-reduced-motion`**: all beams, drift, twinkle and cloud movement stop. The sky
  remains, still. Stars still render in their correct positions.
- **No usable location**: fall back to a sensible default latitude rather than an empty sky.
  The sky is ambient; a wrong-but-plausible star field is better than none.
- **Offline**: everything is local. No behaviour change.
- **Image not yet loaded**: the canvas colour (`--color-canvas`) shows through. No layout
  shift — the sky is absolutely positioned behind content that does not depend on it.

## Asset requirements

Four images, all WebP, sized for a 430px column at 3× device pixel ratio:

| Asset | Content | Notes |
|---|---|---|
| Morning sky | Warm low sun, upper right. No horizon, no land. | Sun position must match where the beams are anchored in code. |
| Afternoon sky | Bright high sun, blue. **No clouds.** No horizon. | Clouds ship separately. |
| Afternoon clouds | Transparent cloud layer. | Must loop horizontally without a visible seam. |
| Night base | Deep atmospheric gradient, grain, optional airglow. **No stars.** | Stars are rendered, not photographed. |

The user generates these with Nano Banana Pro. Photographic depth and film grain are explicit
requirements — the user rejected flat gradients early on.

**The sun-position contract runs image-first.** An image generator cannot be asked to place the
sun at precise coordinates, so do not try. The user generates a sky they like; the builder then
measures where the sun actually sits, as a normalized fraction of the image, and sets the beam
anchor constant to match. One constant per daytime sky, named and commented next to the arc
geometry constants it will sit beside.

**If the seamless cloud layer proves impractical**, which is the likeliest asset to fail —
transparent, horizontally tileable cloud is a hard ask of any image generator — do not drop
cloud drift and do not ship a visible seam. Fall back to hand-authored cloud: a few large,
heavily blurred soft shapes in SVG or CSS at low opacity. At the brief's "minimal" drift speed
and behind a scrim, crude shapes are sufficient; the mockups in `.superpowers/brainstorm/`
already demonstrate this reads acceptably.

**Sequencing.** The night path needs no new photography — stars are rendered and the night base
may not be needed at all. It can therefore be built and verified before any asset exists.
Morning and afternoon are gated on asset delivery. Plan in that order so the feature is not
entirely unverifiable until the last asset lands.

The existing `public/assets` photographs (morning, afternoon, night, mount, mount_day,
mount_night) are superseded. They cannot be cropped to pure sky, which is why new assets are
needed. Removing them is out of scope for this document but should follow once the new ones
land.

## Left to the builder

- All timing, angle and opacity values given above are starting points, not specifications.
  Tune them on a real device; the brief is the feel, not the numbers.
- The projection's exact centre and field of view.
- Crossfade duration and easing.
- Whether the cloud layer is one wide image or a tiled pattern.
- How `astronomy-engine` is imported to keep the bundle cost down, and what that cost actually
  is — measure it rather than assuming.
- Resolving "more prominent" when a galaxy night and a planet night coincide.
- The actual altitude and magnitude thresholds for a rare night. The target is near-monthly;
  the simulated-year count described under Verification is how you know you've hit it.
- Whether the night base image is needed at all, or whether a CSS gradient plus grain is
  indistinguishable once hundreds of stars are over it. Worth testing before commissioning the
  asset.

## Verification

- `npm run build` (`tsc -b && vite build`) is the real check; there is no test runner beyond
  `npm test` for pure modules.
- `src/lib/sky.ts` must have tests under `npm test`. A sign error in the coordinate transform
  is the failure this is defending against, because it would not look like a crash — it would
  look like "the sky seems a bit wrong," which nobody can act on.
- **The fixtures have to come from outside the implementation, or the tests prove nothing.**
  Asserting the module against values the module itself produced would be self-consistent and
  catch exactly the bug it exists to catch — none of it. Acceptable sources, in order of
  preference: positions read off Stellarium for a few named stars at a few fixed dates and
  locations; published almanac or worked textbook examples of a right-ascension/declination to
  altitude/azimuth conversion; or cross-checking against `astronomy-engine`, which is
  independent of the hand-written star transform. Pick one and say which in the test file.
  Assert to a stated tolerance — a fraction of a degree is ample for an ambient background.
  If no external fixture is produced, say so plainly rather than shipping tests that only
  confirm the code agrees with itself.
- The rare-night predicate gets its own test: run it across a simulated year for a mid-latitude
  location and assert the count falls in a sane band. That is the only way to know the
  thresholds actually deliver "roughly monthly" rather than "most nights."
- Device verification on a real iPhone as an installed PWA is required for anything visual, per
  `docs/design-system.md` §10. Specifically: that the three skies read correctly on an OLED
  panel, that the scrim still passes contrast on afternoon, and that no motion is visible when
  Reduce Motion is on.
