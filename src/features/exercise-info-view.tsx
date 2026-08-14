/**
 * Shared "learn about this exercise" view — Pattern 2. Used when browsing
 * the catalog or looking back at progress, not adjusting any particular
 * workout: how-to, history, and favorite/exclude, but no editable sets, no
 * replace, no remove. Reuses the same hero/how-to/history building blocks as
 * `exercise-adjust-view.tsx` (Pattern 1) so the two patterns read as
 * variations on one idea rather than unrelated screens.
 */

import { useEffect, useState } from 'react';
import { Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, HowToSheet, Text, useTheme } from '@/design';
import { EXERCISES } from '@/domain/catalog';
import { MODALITY_LABELS, MOVEMENT_PATTERN_LABELS, MUSCLE_GROUP_LABELS } from '@/app-lib/options';
import { ExerciseBestStatsRow, ExerciseHero, intensityLabel } from '@/features/exercise-detail';
import { ExerciseHistorySheet } from '@/features/exercise-history-sheet';
import type { WeightUnit } from '@/domain/types';

export function ExerciseInfoView({
  exerciseId,
  weightUnit,
  initialHowTo = false,
  onClose,
}: {
  exerciseId: string | null;
  weightUnit: WeightUnit;
  initialHowTo?: boolean;
  onClose: () => void;
}) {
  const { colors, spacing } = useTheme();
  const [howToOpen, setHowToOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const exercise = exerciseId ? EXERCISES.find((entry) => entry.id === exerciseId) : undefined;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialHowTo is an explicit open-state command
    if (exercise && initialHowTo) setHowToOpen(true);
  }, [exercise, initialHowTo]);

  return (
    <Modal visible={exercise != null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {exercise && (
          <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl }}>
            <ExerciseHero
              name={exercise.name}
              exercise={exercise}
              exerciseId={exercise.id}
              modality={exercise.modality}
              eyebrow={`${MODALITY_LABELS[exercise.modality]} · ${MOVEMENT_PATTERN_LABELS[exercise.movementPattern]}`}
              variant="info"
              onHowTo={() => setHowToOpen(true)}
              onHistory={() => setHistoryOpen(true)}
              onOverview={onClose}
            />
            <ExerciseBestStatsRow exerciseId={exercise.id} weightUnit={weightUnit} />
            <Card>
              <Text variant="heading" italic>About this exercise</Text>
              <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm }}>{exercise.description}</Text>
              <Text variant="caption" color="textFaint" style={{ marginTop: spacing.md }}>
                {exercise.primaryAreas.map((group) => MUSCLE_GROUP_LABELS[group]).join(' · ')}
                {intensityLabel(exercise) ? ` · ${intensityLabel(exercise)}` : ''}
              </Text>
            </Card>
          </ScrollView>
        )}
        {/* Nested inside the outer Modal's own subtree (not a sibling) so iOS
         * presents these on top of it instead of racing to present on the
         * already-presented root — a sibling Modal here silently fails to
         * show on native. */}
        <HowToSheet visible={howToOpen} onClose={() => setHowToOpen(false)} name={exercise?.name ?? ''} exercise={exercise} />
        {historyOpen && exercise && (
          <ExerciseHistorySheet exerciseId={exercise.id} exerciseName={exercise.name} weightUnit={weightUnit} onClose={() => setHistoryOpen(false)} />
        )}
      </SafeAreaView>
    </Modal>
  );
}
