/**
 * Maps a Live Activity button press to the same store mutations the in-app
 * tracker UI already uses — there is no separate "remote" code path.
 */

import type { LiveWorkoutFocus } from '@/app-lib/live-activity-focus';
import type { SessionRecord } from '@/domain/types';

export type LiveActivityActionTarget = 'log_set' | 'log_all_sets' | 'prev_exercise' | 'next_exercise';

export interface LiveActivityActionStore {
  liveFocus: LiveWorkoutFocus | null;
  record: SessionRecord | null;
  toggleComplete: (exerciseId: string, setIndex: number) => void;
  setManualFocus: (exerciseId: string | null) => void;
}

export function applyLiveActivityAction(target: string, store: LiveActivityActionStore): void {
  const { liveFocus, record } = store;
  if (!liveFocus) return;

  switch (target as LiveActivityActionTarget) {
    case 'log_set':
      store.toggleComplete(liveFocus.exerciseId, liveFocus.setIndex - 1);
      return;
    case 'log_all_sets': {
      const exercise = record?.performed.find((ex) => ex.exerciseId === liveFocus.exerciseId);
      exercise?.sets.forEach((set, index) => {
        if (!set.completed && !set.skipped) store.toggleComplete(liveFocus.exerciseId, index);
      });
      return;
    }
    case 'prev_exercise':
      store.setManualFocus(liveFocus.prevExerciseId ?? null);
      return;
    case 'next_exercise':
      store.setManualFocus(liveFocus.nextExerciseId ?? null);
      return;
  }
}
