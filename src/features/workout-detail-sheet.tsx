import { useMemo } from 'react';
import { View } from 'react-native';

import { Card, Divider, Row, SheetModal, Text, useTheme } from '@/design';
import { workoutSummary } from '@/app-lib/presentation';
import { formatWeight } from '@/app-lib/units';
import { getAthleteProfile } from '@/services/athlete';
import { getSessionRecord } from '@/services/sessions';
import { estimateSessionCalories } from '@/domain/metrics';

export function WorkoutDetailSheet({
  recordId,
  onClose,
}: {
  recordId: string | undefined;
  onClose: () => void;
}) {
  const { spacing } = useTheme();
  const athlete = useMemo(() => getAthleteProfile(), []);
  const record = useMemo(() => (recordId ? getSessionRecord(recordId) : undefined), [recordId]);

  if (!recordId) return null;

  if (!record) {
    return (
      <SheetModal visible eyebrow="WORKOUT" title="Unavailable" closeLabel="Close" onClose={onClose}>
        <Text variant="body" color="textMuted">This workout record is no longer available on this device.</Text>
      </SheetModal>
    );
  }

  const summary = workoutSummary(record);
  const calories = estimateSessionCalories(record, athlete?.bodyweightKg);
  const duration = record.startedAt && record.completedAt ? Math.max(1, Math.round((record.completedAt - record.startedAt) / 60_000)) : undefined;
  const unit = athlete?.weightUnit ?? 'kg';

  return (
    <SheetModal
      visible
      onClose={onClose}
      eyebrow={new Date(summary.completedAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}
      title={summary.title}
      closeLabel="Close workout detail"
    >
      <Card tone="primarySoft">
        <Row style={{ justifyContent: 'space-between' }}>
          <View><Text variant="title" color="primaryTextSoft">{summary.completedSets}</Text><Text variant="caption" color="primaryTextSoft">SETS</Text></View>
          <View><Text variant="title" color="primaryTextSoft">{duration ?? '—'}</Text><Text variant="caption" color="primaryTextSoft">MINUTES</Text></View>
          <View><Text variant="title" color="primaryTextSoft">{calories.totalKcal}</Text><Text variant="caption" color="primaryTextSoft">KCAL EST.</Text></View>
        </Row>
        <Text variant="caption" color="primaryTextSoft" style={{ marginTop: spacing.md }}>
          {summary.groups.length ? summary.groups.join(' · ') : 'Workout details'}
        </Text>
      </Card>

      <Card>
        <Text variant="heading" italic>Exercises</Text>
        <View style={{ marginTop: spacing.md }}>
          {record.performed
            .map((exercise) => ({ ...exercise, sets: exercise.sets.filter((set) => set.completed) }))
            .filter((exercise) => exercise.sets.length > 0)
            .map((exercise, index) => (
              <View key={exercise.exerciseId}>
                {index > 0 && <Divider style={{ marginVertical: spacing.md }} />}
                <Text variant="subtitle">{exercise.name}</Text>
                <View style={{ marginTop: spacing.sm, gap: 4 }}>
                  {exercise.sets.map((set, setIndex) => (
                    <Row key={setIndex} style={{ justifyContent: 'space-between' }}>
                      <Text variant="caption" color="success">
                        COMPLETED · SET {setIndex + 1}
                      </Text>
                      <Text variant="label" color="textMuted">
                        {set.durationSec != null && set.reps == null
                          ? `${Math.round(set.durationSec / 60)} min${set.weightKg != null ? ` · ${formatWeight(set.weightKg, unit)}` : ''}`
                          : `${set.reps ?? '—'} reps${set.weightKg != null ? ` · ${formatWeight(set.weightKg, unit)}` : ''}`}
                      </Text>
                    </Row>
                  ))}
                </View>
              </View>
            ))}
        </View>
      </Card>
    </SheetModal>
  );
}
