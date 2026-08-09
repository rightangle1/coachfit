# ADR-0110 — Design system & theming

- **Status:** Accepted
- **Date:** 2026-07-21
- **Phase:** 1

## Context
The user wants the app to look considerably nicer than the starter template, and
to keep the visual direction flexible (easy to restyle wholesale later). We need a
centralized, swappable design system rather than scattered constants.

Chosen direction: **calm & focused** — warm neutrals, soft muted tones, a gentle
sage accent, generous rounding, low visual stress. **Light + dark**, default light,
follows the system setting.

## Decision
A dedicated `src/design/` system, separate from the leftover template components:
- **`tokens.ts`** — the single source of visual truth: `light`/`dark` semantic
  **palettes** (bg/surface/text/border/primary/accent/status…), plus scales for
  `spacing`, `radii`, `typography`, and `shadows`. Restyling = edit tokens.
- **`theme.tsx`** — `ThemeProvider` + `useTheme()`. Resolves the active scheme from
  the OS (`useColorScheme`) with an optional in-app override (for a future toggle),
  defaulting to light. Every component reads colors/scales from `useTheme()` — no
  hard-coded hex anywhere in screens.
- **`components/`** — themed primitives every screen composes from: `Text`
  (typographic variants), `Screen`, `Card`, `Divider`, `Button`, `Chip`, `Stepper`
  (big +/- control for the sweaty-user workout logging).

Rules: screens never import raw colors or the template's `constants/theme`; they use
`useTheme()` and the primitives. The old template components are deprecated and get
removed as screens are rebuilt.

## Consequences
- One place to evolve the whole look (swap palette → whole app restyles), satisfying
  the "keep flex" requirement.
- Consistent spacing/type/radius across every screen; light+dark for free.
- Slightly more upfront work than ad-hoc styling, repaid immediately as we build the
  onboarding → prebrief → tracker → debrief loop.
- Reversible: the token contract is stable; a redesign changes values, not structure.
