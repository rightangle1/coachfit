# ADR-0203 — Endurance metric

- **Status:** Accepted (v2)
- **Date:** 2026-07-22 (v2: 2026-07-24)
- **Phase:** 2

## Context
Need a simple, honest signal of cardio/endurance progress from logged sessions,
without HR data (deferred, CLAUDE.md §10).

## Decision
Track **conditioning volume over time**: total minutes spent on `cardio`-modality
exercises (via catalog lookup by `exerciseId`) per completed session. Pure
functions in `src/domain/metrics/endurance.ts`:
- `cardioMinutesBySession(history)` → `{ date, minutes }[]`, ascending.
- `recentEnduranceTrend(history, n=5)` → the last `n` points plus a simple delta
  (latest vs. the average of the rest) so the UI can say "trending up/flat/down."

This is a volume/consistency signal, not a fitness-test number (no VO2max
estimate, no pace/HR-zone analysis) — that requires data we don't have yet.

## Decision — v2 (session-RPE training load)
v1 is a volume/consistency proxy, explicitly not an evidence-based training
signal (no HR, no VO2max). Added **session-RPE Training Load**, a validated
internal-load method requiring zero new instrumentation — the app already
captures per-set RPE and post-workout `debrief.overallRpe`:

> Training Load (AU) = session RPE (Borg CR-10, 0–10) × session duration (minutes)

Source: Foster C, et al. "Monitoring training in athletes with reference to
overtraining syndrome." *Med Sci Sports Exerc.* 1998;30(7):1164-1168; and
Foster C, et al. "A new approach to monitoring exercise training." *J Strength
Cond Res.* 2001;15(1):109-115. AU = arbitrary units, the field's standard
notation — the number is only meaningful relative to itself over time, not as
an absolute physiological quantity.

New pure functions in `src/domain/metrics/endurance.ts`:
- `sessionRpe(record)` — `debrief.overallRpe` if present, else the average
  RPE of completed sets across every performed exercise (not just cardio).
- `sessionDurationMinutes(record)` — wall-clock `completedAt - startedAt`
  when available and positive, else the same per-set duration estimate
  `calories.ts` already uses (`setSeconds`, now exported and imported here
  rather than re-implemented).
- `sessionTrainingLoad(history)` / `recentTrainingLoadTrend(history, n=5)` —
  same points/direction shape as `recentEnduranceTrend`, for UI consistency.

Unlike `cardioMinutesBySession` (cardio-specific volume), training load
covers **every modality** in a session — it is the whole-workout counterpart,
not a replacement. Both signals are kept side by side: cardio minutes answers
"how much conditioning," training load answers "how hard was the whole
session, overall."

## Consequences
- Cheap, honest, immediately available from existing history.
- Clearly a proxy ("how much conditioning have you been doing"), not a lab
  measurement — avoids overclaiming accuracy.
- Reversible: once HR/pace data exists, a richer endurance measure can replace
  this without changing where it's called from (Progress screen, achievements).
- v2: closes the "not evidence-based" gap called out in v1's context without
  touching `cardioMinutesBySession`/`recentEnduranceTrend` — purely additive.
- v2: sessions without any RPE data (no debrief, no set RPEs) simply don't
  produce a training-load point — no fabricated default RPE.
