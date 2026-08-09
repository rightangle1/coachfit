/**
 * Live Activity port (mirrors the ADR-0007 persistence-port pattern). iOS-only
 * capability — Metro resolves `.ios.tsx` on iOS and this default `.tsx` no-op
 * everywhere else, so callers never branch on platform themselves.
 */

/** Must match the name `createLiveActivity` registers in `live-activity.ios.tsx`. */
export const WORKOUT_LIVE_ACTIVITY_NAME = 'WorkoutActivity';

/**
 * Every field is pre-formatted, plain data — no functions, no rich objects.
 * `expo-widgets` stringifies the entire layout function (the `'widget'`
 * directive in `live-activity.ios.tsx`) and re-evaluates it in an isolated
 * native sandbox with no access to this module's imports or helpers, so all
 * formatting (weight units, target labels, sets summaries) happens here,
 * before the content crosses into that sandbox.
 */
export interface LiveWorkoutActivityContent {
  exerciseName: string;
  /** e.g. "Set 2 of 4 · 3 reps @ 82.5 kg" or "Set 1 of 3 · Hold 30s". */
  setLabel: string;
  /** Epoch ms; undefined/absent means the athlete isn't currently resting. */
  restEndsAt?: number;
  /** Epoch ms session start — the anchor for the OS-rendered elapsed-time text. */
  sessionStartedAt: number;
  /** e.g. "6/20" — Dynamic Island compact slot. */
  setsSummaryCompact: string;
  /** e.g. "6 done · 14 left" — Dynamic Island expanded footer. */
  setsSummaryExpanded: string;
  /** e.g. "14" — Dynamic Island minimal slot. */
  setsRemainingLabel: string;
  /**
   * `file://` URI to a locally-cached copy of the app icon, shared via the
   * app-group `widgetsDirectory` so the widget extension process can read it.
   * Absent until the first-run copy (kicked off at app start) resolves; the
   * layout falls back gracefully when unset.
   */
  appIconUri?: string;
}

export interface LiveActivityPort {
  isSupported(): boolean;
  start(content: LiveWorkoutActivityContent): void;
  update(content: LiveWorkoutActivityContent): void;
  end(finalContent?: LiveWorkoutActivityContent): void;
}
