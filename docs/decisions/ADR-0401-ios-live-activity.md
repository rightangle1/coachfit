# ADR-0401 — iOS Live Activity for the active workout

- **Status:** Accepted
- **Date:** 2026-08-01
- **Phase:** 4

## Context

The workout tracker has no presence outside the app — once a user locks their
phone mid-set, the current exercise, set progress, and rest timer disappear
until they reopen CoachFit. This is pulled forward ahead of the roadmap's
"Later/maybe" HealthKit/platform-integrations slot (see `docs/BUILD_PLAN.md`,
`CLAUDE.md` §13) at the user's explicit request. It must stay iOS-only and
additive: `npm run web` and Android must keep working unchanged (CLAUDE.md §14),
and it must not touch `ProgrammingEngine`/`RulesEngine` — this is UI/platform
layer only, deriving its content from the existing `workout-store.ts` state.

The user also asked for interactive buttons on the Live Activity (log the
current set, log all remaining sets on the exercise, move to the previous/next
exercise).

## Options considered

- **`expo-widgets`** (official Expo package, stable since SDK 56; this project
  is on 57) — lets the Live Activity UI be authored as a React component with
  no hand-written Xcode target or SwiftUI, which matters given `ios/` is
  regenerated from scratch on every `prebuild` (this project is gitignored/CNG,
  not a committed native project). Ships a real `Button` primitive backed by a
  genuine iOS 17+ `LiveActivityIntent` (`ios/Widgets/Buttons.swift`,
  `AppIntent.swift` in the installed package) — confirmed by reading the
  installed source, not just docs — so interactive buttons work with the phone
  locked, without any custom Swift or App Group bridge.
- **`@bacons/apple-targets`** (`expo-apple-targets`) — a mature, actively
  maintained community plugin that allows arbitrary hand-written Swift files in
  a generated widget-extension target. More flexible (would also support
  hand-rolled App Intents beyond what `expo-widgets` exposes), but requires
  writing and maintaining SwiftUI directly and a custom native bridge — more
  moving parts than this pass needs.
- **Manual Xcode widget extension** — rejected outright; doesn't survive
  `expo prebuild` in this project's Continuous Native Generation workflow.

## Decision

**`expo-widgets`**, with a new `.ios.tsx`/`.tsx` platform port
(`src/platform/live-activity*.ts(x)`) generalizing the ADR-0007 persistence-port
pattern to a non-persistence platform capability. Interactive buttons use
`expo-widgets`' native `Button`/`addUserInteractionListener` support directly —
tapping one fires a real `LiveActivityIntent` in-process and the app's JS
observes it via an event listener, acting on live `workout-store.ts` state
(`toggleComplete`, or a new `setManualFocus` for prev/next). No deep links, no
App Group queue.

Two implementation details surfaced only once real code ran on-device (recorded
here since they're easy to silently "fix" back into a broken state later):

1. **Metro extension matching.** The `.ios.tsx` (real) and `.ts` (no-op)
   halves of a platform port must share the same file extension. Metro's
   resolver iterates `sourceExts` extension-first; a bare `.ts` file resolves
   during the `ts` pass before Metro ever tries the `tsx` pass where `.ios.tsx`
   lives, silently shadowing the real implementation on iOS with no error. The
   no-op file is `live-activity.tsx`, not `.ts`.
2. **The `'widget'` directive.** `expo-widgets`' layout function must open with
   a literal `'widget';` directive (like `'use strict'`) inside a block-bodied
   function. `babel-preset-expo`'s `widgets-plugin` detects it and replaces the
   *entire function* with a stringified copy of its own source, later
   re-evaluated by the native side in an isolated sandbox with **no access to
   this module's scope** — no helper functions, no imports beyond the JSX
   components the sandbox provides as globals. Without the directive, the raw
   function is passed to the native constructor as-is and throws
   (`ConversionToNativeFailedException`). Consequence: all display formatting
   (weight units, target labels, sets summaries) happens in
   `live-activity-bridge.ts` before content crosses into the widget, not inside
   `live-activity.ios.tsx` itself — `LiveWorkoutActivityContent` is
   intentionally flat, pre-formatted, plain data.

Content shown: exercise name, "Set X of Y" plus the target (reps/weight or
hold duration) on the Lock Screen card; workout elapsed time and sets
completed/remaining on the Dynamic Island (both compact and expanded); rest
countdown when resting. Elapsed time and rest countdown bind to static
anchor dates (`Text`'s `dateStyle="timer"` / `timerInterval` props) so the OS
renders them without repeated `update()` calls — they keep counting correctly
while the app is backgrounded.

## Consequences

- **Reversible.** The port boundary means swapping to `@bacons/apple-targets`
  later (e.g. to add App Intents beyond what `expo-widgets` exposes) only
  touches `live-activity.ios.tsx` and its port interface — nothing in
  `workout-store.ts`, `live-activity-bridge.ts`, or the UI changes.
- **No engine surface changes.** Current exercise/set/rest state is derived
  from existing `SessionRecord`/`SessionPlan` transitions
  (`src/app-lib/live-activity-focus.ts`); no new `ProgrammingEngine` inputs or
  outputs.
- **Known v1 limitation:** does not reconnect to a pre-existing Live Activity
  after a fully cold app relaunch mid-workout in the most defensive way
  possible — `live-activity.ios.tsx`'s `start()` does check
  `factory.getInstances()` and reuse an existing activity when present, which
  covers the common case, but this hasn't been stress-tested against every
  relaunch timing. Cheap to harden later if it proves flaky.
- **Confirmed working on iOS Simulator**, including two follow-up passes after
  initial ship: exercise name, set/target display, Lock Screen banner, Dynamic
  Island compact pill (elapsed timer + sets count, OS-ticking with zero JS),
  Dynamic Island expanded (long-press) with the full exercise/set/target/rest
  block and all four buttons, and tap-to-open. Buttons were exercised directly
  — tapping "Next" on the locked Lock Screen banner and, separately, on the
  long-pressed expanded Dynamic Island, both correctly advanced
  `manualFocusExerciseId` in place (e.g. "Light jog in place" → "Leg swing
  warmup" → "Easy jumping jacks") with the screen never leaving the Lock
  Screen/Home Screen — confirming the `LiveActivityIntent` path, not a deep
  link, is what fires. **Not yet confirmed on a real device:** the fully
  *terminated* (not just backgrounded) app process case.
- **Force-quit cleanup (best-effort, added after initial ship).** On
  `applicationWillTerminate`, the app now ends every active Live Activity via
  `expoWidgetsEndAllLiveActivities()`, a function patched into `expo-widgets`
  (`patches/expo-widgets+*.patch`) and wired into the generated
  `AppDelegate.swift` on every prebuild by `plugins/withLiveActivityTermination.js`.
  Two things worth recording so they aren't "fixed" back into a broken state:
  1. **The patch exists because of a Swift module boundary, not a missing
     JS API.** `LiveActivityAttributes` (the `ActivityAttributes` type
     `expo-widgets` uses for this Live Activity) is `internal` to the
     `ExpoWidgets` pod's module, so `Activity<LiveActivityAttributes>.activities`
     can't be called from the host app's `AppDelegate.swift`, which is a
     separate Swift module — there's no way to reach it from pure JS either,
     since JS isn't running at termination time. The patch adds one `public`
     free function as the seam.
  2. **This is best-effort, not a guarantee — confirmed not to be one.** iOS
     does not call `applicationWillTerminate` for every user-initiated
     force-quit: an app already suspended in the background when the user
     swipes it away in the app switcher is SIGKILLed directly, with no
     callback to any app code, native or JS. This is the same fully-terminated
     case flagged as unconfirmed above. What this change does cover: the
     terminations iOS does hand back to the app (e.g. while foregrounded/
     active). Net effect either way is strictly better than doing nothing —
     it just isn't airtight, and can't be made airtight from app code.
- **Platform constraint, not a bug (found while investigating a user report of
  "the dynamic island isn't working" and "next/prev opened the app instead of
  incrementing"):** two behaviors are easy to mistake for defects but are
  unconditional iOS/ActivityKit rules our code cannot change:
  1. **The Dynamic Island shows no content while the owning app (CoachFit) is
     itself the foreground app** — it renders as a plain empty pill in that
     case, by OS design, since the app is already on screen. It only shows
     live content once CoachFit is backgrounded (confirmed above). Anyone
     testing by glancing at the pill right after starting a workout, before
     switching away, will see nothing there and reasonably assume it's broken.
  2. **The compact pill and minimal presentations cannot host interactive
     buttons — only the Lock Screen banner and the long-pressed *expanded*
     Dynamic Island can.** A tap anywhere on the compact pill always triggers
     the system's default "open the owning app" behavior (confirmed directly:
     tapping it opened CoachFit to the Home tab), regardless of what's
     rendered there. So a single tap on the collapsed pill aimed at "Next"
     will *look* like it "opened the workout instead of incrementing" — it
     did open the app, correctly, per platform rules; the fix is to long-press
     the pill to expand it first, then tap the button, which works as
     confirmed above.
