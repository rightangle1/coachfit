/**
 * Owns every Live Activity side effect. Subscribes to the workout store
 * outside React and starts/updates/ends the activity on meaningful
 * transitions only — never on a per-second interval (see `live-activity.ios.tsx`
 * for why that matters to the OS-rendered countdowns).
 *
 * Also does all display formatting (weight units, target labels, sets
 * summaries) before content crosses into the widget's isolated native
 * sandbox — see the comment atop `live-activity.ios.tsx` for why that
 * sandbox can't call back into this module.
 */

import type { LiveWorkoutFocus } from '@/app-lib/live-activity-focus';
import { formatWeight } from '@/app-lib/units';
import type { LiveWorkoutActivityContent } from '@/platform/live-activity-types';
import { liveActivityPort } from '@/platform/live-activity';
import { getAthleteProfile } from '@/services/athlete';
import { useWorkoutStore } from '@/state/workout-store';

type BridgeState = Pick<
  ReturnType<typeof useWorkoutStore.getState>,
  'liveFocus' | 'restEndsAt' | 'record'
>;

let isActive = false;

function targetLabel(focus: LiveWorkoutFocus): string | null {
  if (focus.targetDurationSec != null) return `Hold ${focus.targetDurationSec}s`;
  if (focus.targetReps != null && focus.targetWeightKg != null) {
    const weightUnit = getAthleteProfile()?.weightUnit ?? 'kg';
    return `${focus.targetReps} reps @ ${formatWeight(focus.targetWeightKg, weightUnit)}`;
  }
  if (focus.targetReps != null) return `${focus.targetReps} reps`;
  return null;
}

function buildContent(state: BridgeState): LiveWorkoutActivityContent | null {
  const { liveFocus, restEndsAt, record } = state;
  if (!liveFocus || !record?.startedAt) return null;

  const target = targetLabel(liveFocus);
  const base = `Set ${liveFocus.setIndex} of ${liveFocus.totalSets}`;

  return {
    exerciseName: liveFocus.exerciseName,
    setLabel: target ? `${base} · ${target}` : base,
    restEndsAt: restEndsAt ?? undefined,
    sessionStartedAt: record.startedAt,
    setsSummaryCompact: `${liveFocus.setsCompleted}/${liveFocus.setsCompleted + liveFocus.setsRemaining}`,
    setsSummaryExpanded: `${liveFocus.setsCompleted} done · ${liveFocus.setsRemaining} left`,
    setsRemainingLabel: `${liveFocus.setsRemaining}`,
  };
}

function handle(state: BridgeState): void {
  const content = buildContent(state);
  if (!content) {
    if (isActive) {
      liveActivityPort.end();
      isActive = false;
    }
    return;
  }
  if (isActive) {
    liveActivityPort.update(content);
  } else {
    // `start()` itself reconnects to an already-running activity (via
    // `getInstances()`) when one exists, so a fresh app relaunch mid-workout
    // doesn't spawn a duplicate — see live-activity.ios.tsx.
    liveActivityPort.start(content);
    isActive = true;
  }
}

export function initLiveActivityBridge(): () => void {
  if (!liveActivityPort.isSupported()) return () => {};

  handle(useWorkoutStore.getState());

  return useWorkoutStore.subscribe((state, prevState) => {
    if (
      state.liveFocus === prevState.liveFocus &&
      state.restEndsAt === prevState.restEndsAt &&
      state.record === prevState.record
    ) {
      return;
    }
    handle(state);
  });
}
