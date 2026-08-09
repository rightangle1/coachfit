# ADR-0403 — Local reminder notifications

- **Status:** Accepted
- **Date:** 2026-08-06
- **Phase:** 4

## Context

CoachFit had no way to bring the athlete back to the app between sessions —
everything the app already knows (an active streak, a growing layoff gap,
today's scheduled/preferred workout type) only surfaces once they open it. The
user asked for four reminder kinds: today's recommended workout, a
been-a-while (layoff) check-in, a keep-the-streak-going nudge, and a
streak-milestone celebration. This needs to stay inside CLAUDE.md's
offline-first constraint (no push server) and reversibility principle
(isolated behind a platform port, like the HealthKit write-back seam in
ADR-0402).

## Options considered

- **Local-only notifications (`expo-notifications`), scheduled on-device** —
  no server, no account system, no network dependency of any kind. Content is
  computed from local data at schedule time and baked into the OS scheduler;
  it goes stale until the app is next foregrounded, but nothing about the
  feature requires connectivity, matching CLAUDE.md §2.4 exactly.
- **Remote push (a small server ticks daily and sends via APNs/FCM)** —
  would keep content perfectly fresh without relying on the app being opened,
  but introduces the first server dependency and account/device-token
  plumbing this app has never needed. Rejected as disproportionate for a
  single-user/friends-stage app, and a genuine architectural departure from
  "the full experience... must work with no network, ever."
- **In-app banner only, no OS notification** — the simplest, but only reaches
  someone already in the app, which defeats the point of a "come back"
  reminder. Rejected per explicit user direction to use real OS
  notifications.

For *keeping content fresh without a server*, two further options:
- **`expo-background-fetch`/`TaskManager` periodic recompute** — would let
  reminders stay accurate even across days the app is never opened, but iOS
  background execution is unreliable/OS-throttled and adds real complexity for
  a low-stakes feature (a stale "Bodybuilding" nudge a day late is a minor
  annoyance, not a bug worth this cost).
- **Recompute on app foreground + immediately after a session save** —
  chosen. Every place the app already has fresh state in hand (opening the
  app, finishing a debrief) is also exactly the moment reminders should be
  re-derived. No background task, no reliability surface.

## Decision

`expo-notifications`, entirely local (no push server), with a
`NotificationPort` behind `src/platform/notifications.ts` (default no-op) /
`notifications.native.ts` (real iOS+Android implementation). Unlike the
HealthKit port (`.ios.ts`/`.ts`, since HealthKit is iOS-only), this uses the
`.native.ts`/`.ts` split already established for the data layer
(`persistence.native.ts`, ADR-0007) — local notifications work on both iOS and
Android, they just aren't a web capability.

`src/services/reminders.ts`'s `refreshReminders()` is the single place that
decides what should currently be scheduled; it always fully re-derives desired
state from `getAthleteProfile()` + `listHistory()` and lets the port
replace-or-cancel each of four stable `ReminderId`s
(`today-workout`, `layoff-checkin`, `streak-keeper`, `streak-milestone`), so
it's naturally idempotent — calling it repeatedly with no state change is a
no-op in effect. It's called from an `AppState` listener in `_layout.tsx` (on
mount and every foreground) and right after `saveSessionRecord` in
`debrief.tsx`'s submit handler. `checkStreakMilestone()` fires the milestone
notification immediately, reusing the exact `newlyUnlocked` achievement diff
the debrief screen already computes for its in-app celebration — no separate
milestone-detection logic to keep in sync.

All decision inputs reuse existing, already-tested domain logic:
`currentStreakDays` (`domain/metrics/achievements.ts`), `listHistory()`
(`services/sessions.ts`), and the `ScheduledWorkout`/`preferredWorkoutType`/
`recommendWorkoutType` fallback chain the Today screen already uses to prefill
its picker. The layoff check-in fires at 3 days since the last completed
session — deliberately earlier than the engine's own 10-day
`LAYOFF.GRACE_DAYS` ramp threshold (`domain/engine/layoff.ts`), since a
notification should land well before the engine itself starts easing load
back; the two are related but intentionally not the same threshold.

Reminders are opt-in: `AthleteProfile.notificationsEnabled` (default off, no
new table — same single-row JSON-blob pattern as `healthSyncEnabled`), toggled
from a "Reminders" card in Settings that requests OS permission on enable.

## Consequences

- **No schema migration.** `notificationsEnabled` / `notificationTimes` are
  new optional fields on the existing `AthleteProfile` JSON blob.
- **Reversible and narrow.** Everything routes through `NotificationPort`;
  swapping the delivery mechanism (e.g. adding push later) or the recompute
  trigger (e.g. adding a background task later) touches only
  `notifications.native.ts` / `reminders.ts`, never the UI call sites.
- **Content can go stale** on days the app is never foregrounded and no
  session is logged — accepted tradeoff for staying server-free; see options
  above.
- **No decision-log entry.** CLAUDE.md §7's decision log covers
  `ProgrammingEngine` calls (`generateSession`/`adjustDuringSession`/
  `interpretDebrief`); reminders are a UX layer on top of already-logged data,
  not a new engine decision, so they don't add entries there.
