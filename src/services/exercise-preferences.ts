/**
 * Exercise preferences service — catalog exclusions and workout timer settings.
 * Single-user app for now (CLAUDE.md: personal/friends stage) — one row under
 * a fixed id, same shape as athlete/equipment. Persists via the port (ADR-0007).
 */

import {
  getExercisePreferences as getRow,
  saveExercisePreferences as saveRow,
} from '../data/persistence';
import type { ExercisePreferences } from '../domain/types';

const EXERCISE_PREFERENCES_ID = 'me';

export function getExercisePreferences(): ExercisePreferences {
  const row = getRow(EXERCISE_PREFERENCES_ID);
  if (!row) {
    return {
      excludedExerciseIds: [],
      favoriteExerciseIds: [],
      timerSoundEnabled: true,
      defaultIncludeWarmup: true,
      defaultIncludeConditioning: true,
      defaultIncludeCooldown: true,
    };
  }
  const saved = JSON.parse(row.excludedJson) as Partial<ExercisePreferences>;
  // Older installs only stored excludedExerciseIds (then timerSoundEnabled,
  // then the default-include-* fields). Keep their existing choices and
  // default newer fields to empty/on.
  return {
    excludedExerciseIds: saved.excludedExerciseIds ?? [],
    favoriteExerciseIds: saved.favoriteExerciseIds ?? [],
    timerSoundEnabled: saved.timerSoundEnabled ?? true,
    defaultIncludeWarmup: saved.defaultIncludeWarmup ?? true,
    defaultIncludeConditioning: saved.defaultIncludeConditioning ?? true,
    defaultIncludeCooldown: saved.defaultIncludeCooldown ?? true,
  };
}

export function saveExercisePreferences(prefs: ExercisePreferences): void {
  saveRow({
    id: EXERCISE_PREFERENCES_ID,
    excludedJson: JSON.stringify(prefs),
    updatedAt: Date.now(),
  });
}

export function isExerciseExcluded(exerciseId: string): boolean {
  return getExercisePreferences().excludedExerciseIds.includes(exerciseId);
}

export function isTimerSoundEnabled(): boolean {
  return getExercisePreferences().timerSoundEnabled;
}

export function setTimerSoundEnabled(timerSoundEnabled: boolean): ExercisePreferences {
  const next = { ...getExercisePreferences(), timerSoundEnabled };
  saveExercisePreferences(next);
  return next;
}

/** Update one or more standing Build-screen defaults (settings); returns the saved preferences. */
export function setWorkoutComponentDefaults(
  defaults: Partial<Pick<ExercisePreferences, 'defaultIncludeWarmup' | 'defaultIncludeConditioning' | 'defaultIncludeCooldown'>>,
): ExercisePreferences {
  const next = { ...getExercisePreferences(), ...defaults };
  saveExercisePreferences(next);
  return next;
}

/** Toggle (or set explicitly) one exercise's excluded state; returns the saved preferences. */
export function setExerciseExcluded(exerciseId: string, excluded: boolean): ExercisePreferences {
  const prefs = getExercisePreferences();
  const set = new Set(prefs.excludedExerciseIds);
  if (excluded) set.add(exerciseId);
  else set.delete(exerciseId);
  const next = { ...prefs, excludedExerciseIds: [...set] };
  saveExercisePreferences(next);
  return next;
}

export function isExerciseFavorite(exerciseId: string): boolean {
  return getExercisePreferences().favoriteExerciseIds.includes(exerciseId);
}

/** Toggle (or set explicitly) one exercise's favorite state; returns the saved preferences. */
export function setExerciseFavorite(exerciseId: string, favorite: boolean): ExercisePreferences {
  const prefs = getExercisePreferences();
  const set = new Set(prefs.favoriteExerciseIds);
  if (favorite) set.add(exerciseId);
  else set.delete(exerciseId);
  const next = { ...prefs, favoriteExerciseIds: [...set] };
  saveExercisePreferences(next);
  return next;
}
