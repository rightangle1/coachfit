# ADR-0410 — Single weekly-total cadence, terms-on-equipment, per-section settings

- **Status:** Accepted
- **Date:** 2026-08-16
- **Phase:** 1 (amends ADR-0105 v2, ADR-0142)

## Context

The onboarding wizard (`OnboardingForm`, shared by first-run `/onboarding`
and the Settings "Edit profile" sheet) exposed two levels of raw detail no
trainer would actually ask a new athlete for up front: manual per-modality
goal-weighting percentages ("Strength 15% / Cardio 65% / ...") and four
separate per-modality weekly-session-count steppers. Both were optional
fine-tuning, but both were visible by default and read as required
configuration. Separately, the legal acceptance step lived on its own inside
the 4-step wizard, and Settings exposed the whole wizard as one combined
"Edit profile" flow rather than letting an athlete jump straight to just the
one thing they want to change.

## Options considered

- **A — Leave the % and per-modality steppers as-is, just relabel copy.**
  Zero engine risk, but doesn't address the actual complaint: the detail
  itself, not its wording, is what reads as spreadsheet-like rather than
  trainer-like.
- **B — Replace both with a single "how many workouts per week" number,
  and let the existing weight-proportional apportionment in
  `modalitySchedule` (`rolling-plan.ts`) do the per-modality split.** The
  proportional fallback already existed for anyone who left the per-modality
  steppers at 0 — this makes that fallback the *only* path from the UI, and
  removes manual override entirely rather than just hiding it deeper in a
  collapsible.
- **C — Move terms acceptance to its own dedicated post-equipment screen.**
  Considered, but rejected: it would make first-run onboarding 5 screens
  instead of 4, and equipment-form.tsx's first-run-only `!isEditing` branch
  already has exactly one atomic save point (`onContinue`, the "See my first
  workout" button) that terms acceptance can piggyback on with no new route.
- **D — Split Settings' combined multi-step sheet into one entry point per
  section (Profile / Goals / Training Settings / Equipment settings).**
  The wizard already had step-scoped state and per-step JSX; the only
  missing piece was a way to render one step standalone (no progress bar, no
  Back, immediate save) instead of always exposing the full sequence.

## Decision

**B** for cadence — added `TrainingGoals.weeklyTotalTarget?: number`;
`rolling-plan.ts`'s `explicitTotal` now prefers it over summing
`weeklyTargets` (kept, but no longer written by any UI). **Rejected C** in
favor of folding the legal checkbox into `equipment-form.tsx`'s existing
first-run continue action, keeping first-run onboarding at exactly 4 screens
(Basics → Goals → Training Settings → Equipment-and-terms). **D** implemented
via a new `section?: 0 | 1 | 2` prop on `OnboardingForm` that renders a
single step's body standalone; `profile-sheet.tsx`, the new
`goals-sheet.tsx`, and `training-settings-sheet.tsx` each pass a fixed
section instead of exposing the whole wizard.

## Consequences

**Easier:** onboarding and the Settings edit flows show only what a trainer
would actually ask; an athlete can jump straight to editing just Goals
without re-stepping through Profile/Training Settings. `applyCadenceOverride`
in `rules-engine.ts` (the per-modality "don't over-stack a hit target" rule)
now stays dormant for anyone relying on the new total-only path, since
there's no per-modality target for it to check — a quiet feature regression
for that one rule, acceptable because the underlying weight-proportional
apportionment already delivers the intended trainer behavior (a
cardio-weighted goal still produces mostly-cardio sessions) without it.

**Harder:** none identified — `weeklyTargets` and its engine logic are
untouched and fully reversible (a future UI could reintroduce manual
per-modality entry without any engine change), and every removed field is a
strict UI simplification, not a data-model deletion.

**Reversibility:** high. Re-exposing per-modality weighting/targets is an
onboarding-form.tsx UI change only; moving terms back to its own screen is a
small extraction; recombining the four settings sections back into one sheet
means passing `section={undefined}` from a single call site.

## Update — tour choice folded into the equipment screen, equipment folded into the profile card

A same-day follow-up cut one more screen and one more Settings card:

- **`app/tour-choice.tsx` (the "Meet your coach" splash) is deleted.**
  `equipment-form.tsx`'s final CTA is now two buttons — "Take the
  walkthrough" and "Start training" — instead of one "See my first workout"
  button feeding a separate choice screen. Both buttons run the same
  `finishFirstRun()` save (equipment + terms, atomic as before) and differ
  only in whether they also call `markAppTourComplete` before navigating,
  via `onSaved(destination?: 'tour')`. `index.tsx`'s existing
  `needsAppTour` redirect already sends an interrupted session straight to
  `/tour` (never `/tour-choice`), so no new recovery-path gap was created by
  removing the screen.
- **The equipment recommendations card ("Helpful additions",
  `recommendEquipment`) is removed** from the equipment screen — one less
  thing competing with the terms/CTA at the bottom of an already-long
  first-run screen.
- **Settings' standalone "Equipment" card is folded into "YOUR TRAINING
  PROFILE"** as two more rows (Equipment settings, Switch equipment
  profile), so the profile card now lists all four sections named in the
  original request (Profile, Goals, Training Settings, Equipment settings)
  as peers in one place, matching first-run onboarding's own framing of
  equipment as the profile's 4th part.
