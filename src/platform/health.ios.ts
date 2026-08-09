/**
 * Real HealthKit write-back port — iOS only. Write-only: authorization only
 * ever requests `toShare`, never `toRead` (CLAUDE.md §10's reserved seam).
 */

import {
  isHealthDataAvailable,
  requestAuthorization,
  saveWorkoutSample,
  WorkoutActivityType,
  WorkoutTypeIdentifier,
} from '@kingstinct/react-native-healthkit';

import type { HealthActivityType, HealthWorkoutInput, HealthWritePort } from './health-types';

const ACTIVITY_TYPE_MAP: Record<HealthActivityType, WorkoutActivityType> = {
  strength: WorkoutActivityType.traditionalStrengthTraining,
  cardio: WorkoutActivityType.mixedCardio,
  yoga: WorkoutActivityType.yoga,
  flexibility: WorkoutActivityType.flexibility,
  functional: WorkoutActivityType.functionalStrengthTraining,
};

let authorizationRequested = false;
let authorizationGranted = false;

async function requestWriteAuthorization(): Promise<boolean> {
  if (authorizationRequested) return authorizationGranted;
  authorizationRequested = true;
  try {
    authorizationGranted = await requestAuthorization({ toShare: [WorkoutTypeIdentifier] });
  } catch {
    authorizationGranted = false;
  }
  return authorizationGranted;
}

async function saveWorkout(input: HealthWorkoutInput): Promise<string | undefined> {
  const granted = await requestWriteAuthorization();
  if (!granted) return undefined;
  try {
    const workout = await saveWorkoutSample(
      ACTIVITY_TYPE_MAP[input.activityType],
      [],
      new Date(input.startedAt),
      new Date(input.completedAt),
      input.totalEnergyKcal != null ? { energyBurned: input.totalEnergyKcal } : undefined,
    );
    return workout.uuid;
  } catch {
    return undefined;
  }
}

export const healthWritePort: HealthWritePort = {
  isSupported: () => isHealthDataAvailable(),
  requestWriteAuthorization,
  saveWorkout,
};
