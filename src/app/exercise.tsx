/** Route-level catalog detail that deliberately uses the same How to / History
 * actions as workout adjustments and completed-workout review. */

import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, ExerciseStepsMedia, ExerciseVideoPreviewSheet, Icon, Screen, Text, useTheme } from '@/design';
import { EXERCISES } from '@/domain/catalog';
import { getAthleteProfile } from '@/services/athlete';
import { MODALITY_LABELS, MOVEMENT_PATTERN_LABELS, MUSCLE_GROUP_LABELS } from '@/app-lib/options';
import { ExerciseBestStatsRow, ExerciseHero, intensityLabel } from '@/features/exercise-detail';
import { ExerciseHistorySheet } from '@/features/exercise-history-sheet';

export default function ExerciseScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { spacing } = useTheme();
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const exercise = EXERCISES.find((entry) => entry.id === id);
  const weightUnit = getAthleteProfile()?.weightUnit ?? 'kg';

  if (!exercise) {
    return <Screen><Text variant="display">Exercise unavailable</Text><Button title="Back to Explore" onPress={() => router.replace('/explore' as never)} fullWidth /></Screen>;
  }

  return (
    <Screen>
      <ExerciseHero
        name={exercise.name}
        exercise={exercise}
        exerciseId={exercise.id}
        modality={exercise.modality}
        eyebrow={`${MODALITY_LABELS[exercise.modality]} · ${MOVEMENT_PATTERN_LABELS[exercise.movementPattern]}`}
        variant="info"
        onOverview={() => router.back()}
        onHowTo={() => setVideoPreviewOpen(true)}
        onHistory={() => setHistoryOpen(true)}
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
      <Card>
        <ExerciseStepsMedia pattern={exercise.movementPattern} media={exercise.media} steps={exercise.steps} showClip={false} requireImage />
      </Card>
      <View style={{ gap: spacing.sm }}>
        <Button title="How To" leadingIcon={<Icon name="play" size={16} color="text" />} variant="secondary" onPress={() => setVideoPreviewOpen(true)} fullWidth />
        <Button title="History" variant="secondary" onPress={() => setHistoryOpen(true)} fullWidth />
      </View>
      <ExerciseVideoPreviewSheet
        visible={videoPreviewOpen}
        onClose={() => setVideoPreviewOpen(false)}
        name={exercise.name}
        exercise={exercise}
      />
      <ExerciseHistorySheet exerciseId={historyOpen ? exercise.id : null} exerciseName={exercise.name} weightUnit={weightUnit} onClose={() => setHistoryOpen(false)} />
    </Screen>
  );
}
