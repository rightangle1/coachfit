/**
 * Fires a completed workout to HealthKit (iOS only — a no-op port everywhere
 * else). Fire-and-forget by design: a Health write failure must never affect
 * the local record, which is already the source of truth.
 */

import type { HealthActivityType } from '@/platform/health-types';
import { healthWritePort } from '@/platform/health';
import { bodyProfileOf, estimateSessionCalories } from '@/domain/metrics';
import type { SessionRecord, WorkoutType } from '@/domain/types';
import { getAthleteProfile } from '@/services/athlete';
import { saveSessionRecord } from '@/services/sessions';

const WORKOUT_TYPE_TO_HEALTH_ACTIVITY: Record<WorkoutType, HealthActivityType> = {
  bodybuilding: 'strength',
  sculpting: 'strength',
  cardio: 'cardio',
  yoga: 'yoga',
  stretch: 'flexibility',
  bodyweight: 'functional',
};

export function writeWorkoutToHealth(record: SessionRecord): void {
  if (!healthWritePort.isSupported()) return;
  const profile = getAthleteProfile();
  if (!profile?.healthSyncEnabled) return; // requires explicit opt-in (onboarding/Settings)
  if (record.healthKitWorkoutUUID) return; // already written — idempotency guard
  if (!record.startedAt || !record.completedAt) return;

  const activityType = record.workoutType
    ? WORKOUT_TYPE_TO_HEALTH_ACTIVITY[record.workoutType]
    : 'functional';
  const totalEnergyKcal = estimateSessionCalories(record, bodyProfileOf(profile)).totalKcal;

  void healthWritePort
    .saveWorkout({
      activityType,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      totalEnergyKcal,
    })
    .then((uuid) => {
      if (!uuid) return;
      saveSessionRecord({ ...record, healthKitWorkoutUUID: uuid });
    })
    .catch(() => {});
}
