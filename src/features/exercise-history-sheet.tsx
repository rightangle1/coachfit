import { useMemo } from 'react';
import { View } from 'react-native';

import { Card, Divider, Row, SheetModal, Text, TrendChart, useTheme } from '@/design';
import { formatWeight } from '@/app-lib/units';
import { EXERCISES } from '@/domain/catalog';
import { listHistory } from '@/services/sessions';
import type { PerformedExercise, PerformedSet, WeightUnit } from '@/domain/types';

function shortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function setDetail(set: PerformedSet, weightUnit: WeightUnit): string {
  const load = set.weightKg != null ? ` · ${formatWeight(set.weightKg, weightUnit)}` : '';
  if (set.durationSec != null && set.reps == null) return `${formatDuration(set.durationSec)}${load}`;
  return `${set.reps ?? '—'} reps${load}`;
}

type ExerciseHistoryEntry = {
  date: number;
  exercise: PerformedExercise;
  topWeightKg?: number;
  totalDurationSec?: number;
};

export function ExerciseHistorySheet({
  exerciseId,
  exerciseName,
  weightUnit,
  onClose,
}: {
  exerciseId: string | null;
  exerciseName?: string;
  weightUnit: WeightUnit;
  onClose: () => void;
}) {
  const { spacing } = useTheme();
  const entries = useMemo<ExerciseHistoryEntry[]>(() => {
    if (!exerciseId) return [];
    return listHistory(100).flatMap((record) => {
      const exercise = record.performed.find((item) => item.exerciseId === exerciseId);
      if (!exercise || !record.completedAt) return [];
      const completedSets = exercise.sets.filter((set) => set.completed);
      if (completedSets.length === 0) return [];
      const weights = completedSets.flatMap((set) => set.weightKg == null ? [] : [set.weightKg]);
      const durations = completedSets.flatMap((set) => set.durationSec == null ? [] : [set.durationSec]);
      return [{
        date: record.completedAt,
        exercise: { ...exercise, sets: completedSets },
        topWeightKg: weights.length ? Math.max(...weights) : undefined,
        totalDurationSec: durations.length ? durations.reduce((sum, duration) => sum + duration, 0) : undefined,
      }];
    });
  }, [exerciseId]);

  if (!exerciseId) return null;

  // A loaded timed/hold exercise (a farmer's carry) now logs both weightKg
  // and durationSec — key the trend chart off the exercise's own progression
  // axis rather than "was weight ever logged," so a carry still trends its
  // time (what it's actually progressed by) instead of flipping to weight.
  const catalogExercise = EXERCISES.find((e) => e.id === exerciseId);
  const usesWeight = catalogExercise
    ? catalogExercise.progression === 'weight'
    : entries.some((entry) => entry.topWeightKg != null);
  const chartEntries = entries
    .filter((entry) => usesWeight ? entry.topWeightKg != null : entry.totalDurationSec != null)
    .slice()
    .reverse();

  return (
    <SheetModal
      visible
      onClose={onClose}
      eyebrow="WORKOUT HISTORY"
      title={exerciseName ?? 'Exercise'}
      closeLabel="Close workout history"
    >
      {chartEntries.length === 0 ? (
        <Card>
          <Text variant="body" color="textMuted">No completed lift or timed-set history yet.</Text>
        </Card>
      ) : (
        <Card tone="primarySoft">
          <Text variant="caption" color="primaryTextSoft" weight="bold">
            {usesWeight ? 'TOP LOAD' : 'TOTAL TIME'}
          </Text>
          <Text variant="body" color="primaryTextSoft" style={{ marginTop: 2 }}>
            {usesWeight ? 'Your heaviest completed set in each workout.' : 'Completed time across each workout.'}
          </Text>
          <View style={{ marginTop: spacing.md }}>
            <TrendChart
              type="line"
              color="primary"
              points={chartEntries.map((entry) => ({
                label: shortDate(entry.date),
                value: usesWeight ? entry.topWeightKg! : entry.totalDurationSec!,
              }))}
              valueFormatter={(value) => usesWeight ? formatWeight(value, weightUnit) : formatDuration(value)}
            />
          </View>
        </Card>
      )}

      <Card>
        <Text variant="heading" italic>Past workouts</Text>
        {entries.length === 0 ? (
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.md }}>No completed workouts with this exercise yet.</Text>
        ) : (
          <View style={{ marginTop: spacing.md }}>
            {entries.map((entry, entryIndex) => (
              <View key={`${entry.date}-${entryIndex}`}>
                {entryIndex > 0 && <Divider style={{ marginVertical: spacing.md }} />}
                <Text variant="subtitle">{shortDate(entry.date)}</Text>
                <View style={{ marginTop: spacing.sm, gap: 4 }}>
                  {entry.exercise.sets.map((set, setIndex) => (
                    <Row key={setIndex} style={{ justifyContent: 'space-between' }}>
                      <Text variant="caption" color="success">
                        COMPLETED · SET {setIndex + 1}
                      </Text>
                      <Text variant="label" color="textMuted">{setDetail(set, weightUnit)}</Text>
                    </Row>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>
    </SheetModal>
  );
}
