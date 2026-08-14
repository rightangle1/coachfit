/** View a saved routine (ADR-0137): its exercises, progress, and actions. */

import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Badge, Button, Card, Divider, Icon, MuscleLogo, Row, SheetModal, Text, TrendChart, useTheme } from '@/design';
import { formatWeight } from '@/app-lib/units';
import { MUSCLE_GROUP_LABELS, WORKOUT_TYPE_OPTIONS } from '@/app-lib/options';
import { EXERCISES } from '@/domain/catalog';
import {
  exerciseBestStats,
  routineEnduranceIndex,
  routineStrengthIndex,
  weeklyTotalVolumeSeries,
  type ExerciseBestStats,
} from '@/domain/metrics';
import { listEngineHistory } from '@/services/sessions';
import { deleteRoutine, routineHistory } from '@/services/routines';
import type { Routine, WeightUnit } from '@/domain/types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ADR-0137 v2: style is a routine's topline, defining field — surfaced here.
function routineStyleLabel(workoutType: Routine['workoutType']): string {
  return WORKOUT_TYPE_OPTIONS.find((option) => option.value === workoutType)?.label ?? 'Balanced';
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

function potentialMaxLabel(stats: ExerciseBestStats, unit: WeightUnit): string | undefined {
  if (stats.bestWeightKg != null && stats.bestWeightReps != null) {
    const e1rm = stats.bestE1rmKg != null ? ` · ~${formatWeight(stats.bestE1rmKg, unit)} e1RM` : '';
    return `Best: ${formatWeight(stats.bestWeightKg, unit)} × ${stats.bestWeightReps}${e1rm}`;
  }
  if (stats.bestLoadedWeightKg != null) return `Best: ${formatWeight(stats.bestLoadedWeightKg, unit)} loaded`;
  if (stats.maxDurationSec != null) return `Best: ${formatDuration(stats.maxDurationSec)}`;
  if (stats.maxReps != null) return `Best: ${stats.maxReps} reps`;
  return undefined;
}

export function RoutineDetailSheet({
  routine,
  weightUnit,
  onClose,
  onEdit,
  onUseToday,
  onOpenExercise,
  onDeleted,
}: {
  routine: Routine | null;
  weightUnit: WeightUnit;
  onClose: () => void;
  onEdit: (routine: Routine) => void;
  onUseToday: (routine: Routine) => void;
  onOpenExercise: (exerciseId: string) => void;
  onDeleted: () => void;
}) {
  const { colors, radii, spacing } = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `routine` (not read directly) refreshes history each time the sheet reopens for a different routine
  const fullHistory = useMemo(() => listEngineHistory(), [routine]);
  const runHistory = useMemo(() => (routine ? routineHistory(routine.id) : []), [routine]);

  const exercises = useMemo(
    () => (routine?.exerciseIds ?? []).map((id) => EXERCISES.find((e) => e.id === id)).filter((e): e is (typeof EXERCISES)[number] => e != null),
    [routine?.exerciseIds],
  );

  const volumeSeries = useMemo(() => weeklyTotalVolumeSeries(runHistory, 8), [runHistory]);
  const strengthIndex = useMemo(
    () => (routine ? routineStrengthIndex(fullHistory, routine.exerciseIds) : undefined),
    [fullHistory, routine],
  );
  const enduranceIds = useMemo(
    () => exercises.filter((e) => e.modality === 'cardio').map((e) => e.id),
    [exercises],
  );
  const enduranceIndex = useMemo(
    () => (enduranceIds.length ? routineEnduranceIndex(fullHistory, enduranceIds) : undefined),
    [fullHistory, enduranceIds],
  );

  if (!routine) return null;

  const lastUsed = runHistory[0]?.completedAt;

  return (
    <SheetModal visible onClose={onClose} eyebrow="ROUTINE" title={routine.name} closeLabel="Close routine">
      <Row gap="sm" wrap>
        <Badge label={routineStyleLabel(routine.workoutType)} color="primaryTextSoft" background="primarySoft" />
        {routine.recurrenceDaysOfWeek?.length ? (
          <Badge
            label={`Recurring ${routine.recurrenceDaysOfWeek.map((d) => DAY_NAMES[d]).join('/')}`}
            color="primaryTextSoft"
            background="primarySoft"
          />
        ) : null}
        <Badge label={`${exercises.length} exercise${exercises.length === 1 ? '' : 's'}`} color="textMuted" background="surfaceAlt" />
      </Row>

      <Row gap="md" style={{ marginTop: spacing.lg }}>
        <Button title="Use today" onPress={() => onUseToday(routine)} style={{ flex: 1 }} />
        <Button title="Edit" variant="secondary" onPress={() => onEdit(routine)} style={{ flex: 1 }} />
      </Row>

      <Card style={{ marginTop: spacing.lg }}>
        <Text variant="heading" italic>Progress</Text>
        <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
          <Text variant="caption" color="textMuted">
            {runHistory.length} session{runHistory.length === 1 ? '' : 's'} run
            {lastUsed ? ` · last ${new Date(lastUsed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
          </Text>
        </Row>
        {(strengthIndex?.indexPct != null || enduranceIndex?.indexPct != null) && (
          <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
            {strengthIndex?.indexPct != null && (
              <Badge label={`Strength ${Math.round(strengthIndex.indexPct)}% of best`} color="primaryTextSoft" background="primarySoft" />
            )}
            {enduranceIndex?.indexPct != null && (
              <Badge label={`Endurance ${Math.round(enduranceIndex.indexPct)}% of best`} color="primaryTextSoft" background="primarySoft" />
            )}
          </Row>
        )}
        {volumeSeries.some((point) => point.totalVolumeLoad > 0) ? (
          <View style={{ marginTop: spacing.md }}>
            <TrendChart
              points={volumeSeries.map((point) => ({
                label: new Date(point.weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                value: point.totalVolumeLoad,
              }))}
              type="bar"
              valueFormatter={(value) => `${Math.round(value).toLocaleString()} ${weightUnit}`}
            />
          </View>
        ) : (
          <Text variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
            Run this routine to start tracking its volume.
          </Text>
        )}
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <Text variant="heading" italic>Exercises</Text>
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {exercises.map((exercise, index) => {
            const stats = exerciseBestStats(fullHistory, exercise.id);
            const maxLabel = potentialMaxLabel(stats, weightUnit);
            return (
              <View key={exercise.id}>
                {index > 0 && <Divider style={{ marginVertical: spacing.sm }} />}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View history for ${exercise.name}`}
                  onPress={() => onOpenExercise(exercise.id)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1, flexDirection: 'row', gap: spacing.md, alignItems: 'center' })}
                >
                  <MuscleLogo groups={exercise.primaryAreas} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text variant="subtitle">{exercise.name}</Text>
                    <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                      {exercise.primaryAreas.map((group) => MUSCLE_GROUP_LABELS[group]).join(' · ')}
                    </Text>
                    {maxLabel ? <Text variant="caption" color="primaryTextSoft" style={{ marginTop: 2 }}>{maxLabel}</Text> : null}
                  </View>
                  <Icon name="chevronRight" size={16} color="textFaint" />
                </Pressable>
              </View>
            );
          })}
        </View>
      </Card>

      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        {confirmDelete ? (
          <View style={{ gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceAlt }}>
            <Text variant="caption" color="textMuted">Delete &quot;{routine.name}&quot;? This can&apos;t be undone.</Text>
            <Row gap="md">
              <Button title="Cancel" variant="secondary" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
              <Button
                title="Delete"
                variant="danger"
                onPress={() => {
                  deleteRoutine(routine.id);
                  onDeleted();
                }}
                style={{ flex: 1 }}
              />
            </Row>
          </View>
        ) : (
          <Button title="Delete routine" variant="quiet" onPress={() => setConfirmDelete(true)} />
        )}
      </View>
    </SheetModal>
  );
}
