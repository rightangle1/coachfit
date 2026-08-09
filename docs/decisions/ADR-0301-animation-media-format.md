# ADR-0301 — Animation/media format

- **Status:** Accepted
- **Date:** 2026-07-22
- **Phase:** 3

## Context
CLAUDE.md §11 requires a **baseline** visual for every exercise motion that is
fully self-made (no licensing risk) and degrades gracefully when richer media
(ADR-0302) is missing — which, for most of the catalog, it will be indefinitely.
The baseline must therefore cover **all** exercises, not just the enriched ones,
and must work identically on native and web (ADR-0007 — `npm run web` is the
primary dev/test loop).

Every `Exercise` already carries a `movementPattern` (ADR-0101: squat, hinge,
lunge, push, pull, carry, core, steady_cardio, interval, stretch). That's a
natural, already-total key for a baseline visual — no separate media-key field
needed on each exercise.

## Options considered
- **Lottie / Rive animation files** — high-quality, but adds a new native
  dependency + an asset-authoring pipeline (external tool, exported JSON/.riv
  files) neither of which exists today. Heavier than the "simple placeholder"
  bar CLAUDE.md sets, and another thing to keep in sync with the theme.
- **Bundled SVG illustrations** — clean line-art, but `react-native-svg` isn't
  a current dependency, and static SVGs aren't animated (would need a second
  library for looping motion).
- **View-primitive illustration + Reanimated** — build each motion from the
  existing themed primitives (`View`, `radii`, theme colors) and animate it
  with `react-native-reanimated`, already a dependency. No new packages, reads
  theme tokens directly (restyle-proof per ADR-0110), runs the same on native
  and web.

## Decision
A `MovementIllustration` design-system component (`src/design/components/`)
renders a small looping animation from plain themed `View`s — a torso block and
1-2 "limb" blocks whose rotation/translation animate on a repeating loop via
`react-native-reanimated`. One visual configuration per `MovementPattern`
(distinct silhouette + motion axis, e.g. squat = vertical torso bob, push/pull =
horizontal limb swing, stretch = slow hold-and-release, cardio/interval = faster
cyclical leg motion). Because it's keyed by `movementPattern` and every exercise
has one, coverage is total by construction — this is the fallback ADR-0302's
stills/clips degrade to when unset.

## Consequences
- Zero new dependencies; identical behavior on iOS/Android/web.
- Fully self-made — no licensing risk, satisfies CLAUDE.md §11's baseline bar.
- Visually simpler than Lottie-grade animation; acceptable since CLAUDE.md
  explicitly scopes the baseline as "simple visual placeholders," with richer
  media as later enrichment (ADR-0302) and real form-monitoring graphics
  explicitly out of near-term scope.
- Reversible: swapping to Lottie/Rive later only touches this one component —
  every call site renders `<MovementIllustration pattern={...} />` and knows
  nothing about how it's implemented.
