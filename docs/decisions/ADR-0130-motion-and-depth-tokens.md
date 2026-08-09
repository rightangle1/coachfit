# ADR-0130 — Motion and depth tokens

- **Status:** Accepted
- **Date:** 2026-07-28
- **Phase:** 1 (extends ADR-0110)

## Context

ADR-0110 gave us a token layer that covers color, spacing, radii, and type. It
does not cover *time* or *light*, and the app showed it:

- Animation existed in exactly three places app-wide (the celebration burst, the
  looping movement illustration, the splash fade). Everything else snapped:
  `Meter` fills, the workout progress bar, the tracker's three-way view swap,
  Progress's four-way metric swap, every collapsible, onboarding steps.
- Press feedback was `opacity: pressed ? 0.85 : 1`, hand-written in roughly
  thirty places with three different values and no scale anywhere.
- Haptics fired in two places — and not on set completion, the app's
  highest-frequency interaction.
- There were only two shadow tiers, and the tab bar hard-coded its own shadow
  colors instead of reading them.
- Every hero "overlay" was a flat translucent `View`, so photography read as
  uniformly gray-washed rather than lit.
- There was no skeleton, spinner, or `ActivityIndicator` anywhere; Home rendered
  a blank screen while local storage loaded, and session generation was awaited
  with the button fully enabled and unchanged.

Constraints: the web target must keep working (ADR-0007), the React Compiler is
enabled, and none of this may touch the engine or the local data schema.

## Options considered

- **Per-screen animation, no tokens** — fastest to start, but guarantees the
  drift we already have in color would repeat in timing. Rejected.
- **A motion library (Moti, Lottie)** — Moti is a thin wrapper over the
  Reanimated we already depend on and adds nothing we need; Lottie was already
  rejected for media in ADR-0301, and re-introducing it for UI motion would
  contradict that. Rejected.
- **Motion and depth as tokens, consumed through `useTheme()`** — matches how
  every other visual decision in the app is already expressed. Chosen.

## Decision

Extend the token layer with `motion`, `press`, and `gradients`, widen `shadows`
from two tiers to four, and route every animation through them.

**Motion tokens are pure data.** `motion.easing` stores cubic-bezier control
points, not Reanimated `Easing` functions, so `tokens.ts` stays importable
without the animation runtime. `src/design/motion.ts` turns them into easing
functions and exposes `timing()`.

**Reduce-motion is a first-class token.** `motion.enabled` is false when the OS
setting is on, and `timing()` collapses duration to `0` rather than branching —
values still land, they just arrive instantly. This is read from React Native's
own `AccessibilityInfo`, not Reanimated's `useReducedMotion`, for two reasons:
it is an accessibility fact about the device rather than an animation-library
concept, and it keeps the theme (which nearly everything imports) free of the
animation runtime. `react-native-web` maps it to `prefers-reduced-motion`.

**Shared values use `.get()`/`.set()`, never `.value`.** The React Compiler is
enabled in this app (`app.json` → `experiments.reactCompiler`), and its lint
rules correctly flag `.value` mutation. This is Reanimated 4's compiler-safe
idiom.

**Gradients replace flat scrims.** `gradients.heroScrim` is bottom-weighted, so
the darkness is spent where the text sits and the top of the frame keeps its
detail. `expo-linear-gradient` was added for view-level gradients;
`react-native-svg`'s `<LinearGradient>` covers the in-chart ones.

**Liquid glass is additive only.** The tab bar uses `expo-glass-effect` behind
`isLiquidGlassAvailable()`, falling back to the existing solid surface. Android,
web, and pre-iOS-26 are unchanged.

**Dark-mode `primary` was corrected** from mint `#86E5CC` to light sage
`#8FC2A4`. The old value was a different hue from the light-mode sage, so the
brand did not survive a theme switch, *and* it collided exactly with `success`.
The metric tiles on Home and Progress also had to flip their text to the
on-primary token when selected; they previously used hero-white regardless,
which was unreadable on any light `primary`.

**One deliberate exception to "animate on the UI thread":** `CountUp` drives
text content, which Reanimated does not animate. It uses `requestAnimationFrame`
on the JS thread for under half a second, once, on a screen that is not
scrolling, and stops entirely under reduce-motion.

### Rejected during implementation

A bundled display typeface (Fraunces) was wired up for the `display` and `title`
variants and then **reverted** — it did not suit the hero surfaces, which are
where those variants are most prominent. Titles stay on the system face with a
synthesized italic. The `TypeStyle` shape carries no font-family field as a
result; adding one back is a small change if a different face is ever tried.

## Consequences

**Easier.** Every screen inherits press feedback, animated meters, and
transitions from the primitives — the majority of the visual change came from
editing `src/design/components/`, not the screens. Retuning the app's entire
feel is now a token edit. Reduce-motion is handled once, not per animation.

**Harder.** Animated components need the Reanimated runtime, which has no native
module under Jest. Its shipped mock is unusable (it re-exports the real
entrypoint and boots `react-native-worklets`), so `jest.setup.js` carries a
hand-rolled mock: animations resolve instantly to their target and animated
views render as plain ones with animation-only props stripped. New Reanimated
APIs may need adding to it.

**Reversibility.** High. Motion collapses to instant by setting
`motion.enabled` false. Gradients are single components (`HeroScrim`) swappable
back to flat views. The glass path is already behind a runtime check. The one
genuinely one-way item is the dark `primary` value, and that is a three-line
revert.
