/**
 * Dev-only shortcut: seeds a minimal athlete/equipment profile if none exist,
 * builds a session via query params, starts it, and lands on `/workout` —
 * skipping onboarding + the builder UI entirely. Exists purely to make manual
 * browser verification of engine/UI changes fast (one URL instead of ~20
 * clicks through onboarding and the Shape section each time). `__DEV__`-gated
 * so it's inert in a production build; not linked from anywhere in the app.
 *
 * Query params (all optional): workoutType, cardioIntent, autoAdvance ('1'|'0'),
 * targetDurationMin. Example:
 *   /dev-seed?workoutType=cardio&cardioIntent=interval
 *   /dev-seed?workoutType=cardio&cardioIntent=circuit&targetDurationMin=30
 *   /dev-seed?workoutType=yoga
 */

import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { Text, useTheme } from '@/design';
import { initStorage } from '@/data/persistence';
import { getAthleteProfile, saveAthleteProfile } from '@/services/athlete';
import { getEquipmentInventory } from '@/services/equipment';
import { completeFirstRunEquipmentSetup } from '@/services/equipment-profiles';
import { currentFatigue, listEngineHistory, savePlan } from '@/services/sessions';
import { generateSession } from '@/services/programming';
import { useWorkoutStore } from '@/state/workout-store';
import { ageYearsOf, type CardioIntent, type EquipmentType, type WorkoutOptions, type WorkoutType } from '@/domain/types';

const ALL_EQUIPMENT: EquipmentType[] = [
  'bodyweight', 'dumbbells', 'barbell', 'kettlebell', 'resistance_bands_tube', 'resistance_bands_loop',
  'pull_up_bar', 'bench', 'squat_rack', 'cable_machine', 'treadmill', 'bike', 'elliptical', 'stair_climber',
  'rowing_machine', 'yoga_mat', 'foam_roller', 'suspension_trainer', 'barre',
];

export default function DevSeedScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    workoutType?: string;
    cardioIntent?: string;
    autoAdvance?: string;
    targetDurationMin?: string;
  }>();
  const [status, setStatus] = useState('Seeding…');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!__DEV__) {
      setStatus('/dev-seed is unavailable outside development builds.');
      return;
    }
    (async () => {
      initStorage();
      let athlete = getAthleteProfile();
      if (!athlete) {
        const now = Date.now();
        athlete = {
          id: 'me',
          experience: 'intermediate',
          goals: { weights: { strength: 1, cardio: 1, mobility: 1, general: 1 } },
          constraints: [],
          weightUnit: 'kg',
          createdAt: now,
          updatedAt: now,
        };
        saveAthleteProfile(athlete);
      }
      let equipment = getEquipmentInventory();
      if (!equipment) {
        equipment = { items: ALL_EQUIPMENT.map((type) => ({ type })) };
        completeFirstRunEquipmentSetup(equipment);
      }

      const workoutOptions: WorkoutOptions = {
        ...(params.cardioIntent ? { cardioIntent: params.cardioIntent as CardioIntent } : {}),
        ...(params.autoAdvance != null ? { autoAdvance: params.autoAdvance === '1' } : {}),
      };

      const plan = await generateSession({
        plannedFor: Date.now(),
        athlete,
        equipment,
        history: listEngineHistory(),
        fatigue: currentFatigue(ageYearsOf(athlete)),
        readiness: {},
        targetDurationMin: params.targetDurationMin ? Number(params.targetDurationMin) : undefined,
        workoutType: params.workoutType as WorkoutType | undefined,
        workoutOptions,
        goals: athlete.goals,
        targeting: { emphasize: [], avoid: [] },
        avoidToday: { flags: [] },
      });
      savePlan(plan);
      useWorkoutStore.getState().start(plan);
      router.replace('/workout');
    })().catch((error) => setStatus(`Seed failed: ${String(error)}`));
  }, [params.autoAdvance, params.cardioIntent, params.targetDurationMin, params.workoutType, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 }}>
      <Text variant="body" color="textMuted">{status}</Text>
    </View>
  );
}
