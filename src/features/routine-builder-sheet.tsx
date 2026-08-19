/** Create or edit a routine (ADR-0137 v2): style is the topline, defining
 * choice — it gates which exercises are legal to add — then name, exercises,
 * and optional recurrence. */

import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { ImageBackground } from 'expo-image';

import { Button, Card, Chip, HeroScrim, Icon, MuscleLogo, PressScale, Row, SheetModal, Text, TextField, useTheme } from '@/design';
import { WORKOUT_TYPE_OPTIONS } from '@/app-lib/options';
import { workoutTypeArt } from '@/features/exercise-detail';
import { EXERCISES } from '@/domain/catalog';
import { getEquipmentInventory } from '@/services/equipment';
import { equipmentSatisfied, exercisesAllowedForWorkoutType } from '@/domain/engine';
import { createRoutine, updateRoutineExercises, updateRoutineRecurrence, updateRoutineOnlyExercises, renameRoutine } from '@/services/routines';
import type { Routine, WorkoutType } from '@/domain/types';
import { ExercisePickerSheet } from './exercise-picker-sheet';

const DAY_OPTIONS: { label: string; value: number }[] = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];

export function RoutineBuilderSheet({
  visible,
  routine,
  onClose,
  onSaved,
}: {
  visible: boolean;
  /** Editing an existing routine; omitted/null creates a new one. */
  routine?: Routine | null;
  onClose: () => void;
  onSaved: (routine: Routine) => void;
}) {
  const { colors, radii, spacing } = useTheme();
  const [name, setName] = useState('');
  const [exerciseIds, setExerciseIds] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState<Set<number>>(new Set());
  const [workoutType, setWorkoutType] = useState<WorkoutType | undefined>(undefined);
  const [styleNotice, setStyleNotice] = useState<string | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [onlyRoutineExercises, setOnlyRoutineExercises] = useState(false);

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the sheet opening intentionally seeds these editable fields from whichever routine (or none) it was opened for
    setName(routine?.name ?? '');
    setExerciseIds(routine?.exerciseIds ?? []);
    setRecurrence(new Set(routine?.recurrenceDaysOfWeek ?? []));
    setWorkoutType(routine?.workoutType);
    setStyleNotice(undefined);
    setOnlyRoutineExercises(routine?.onlyRoutineExercises ?? false);
  }, [visible, routine]);

  const equipment = useMemo(() => getEquipmentInventory() ?? { items: [] }, []);

  const exercises = useMemo(
    () => exerciseIds.map((id) => EXERCISES.find((e) => e.id === id)).filter((e): e is (typeof EXERCISES)[number] => e != null),
    [exerciseIds],
  );
  const pickerPool = useMemo(
    () => exercisesAllowedForWorkoutType(EXERCISES, workoutType).filter((e) => !exerciseIds.includes(e.id)),
    [workoutType, exerciseIds],
  );

  // ADR-0137 v2: style is the routine's topline, defining field — changing it
  // strips any already-added exercise the new style no longer allows, so
  // "allowed" stays a real constraint rather than only applying at add-time.
  function selectWorkoutType(next: WorkoutType | undefined) {
    const allowedIds = new Set(exercisesAllowedForWorkoutType(EXERCISES, next).map((e) => e.id));
    const kept = exerciseIds.filter((id) => allowedIds.has(id));
    const removedCount = exerciseIds.length - kept.length;
    setWorkoutType(next);
    setExerciseIds(kept);
    setStyleNotice(
      removedCount > 0
        ? `${removedCount} exercise${removedCount === 1 ? '' : 's'} removed — not available for ${WORKOUT_TYPE_OPTIONS.find((o) => o.value === next)?.label ?? 'this style'}.`
        : undefined,
    );
  }

  function removeExercise(id: string) {
    setExerciseIds((prev) => prev.filter((existing) => existing !== id));
  }

  function moveExercise(id: string, direction: -1 | 1) {
    setExerciseIds((prev) => {
      const index = prev.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggleDay(value: number) {
    setRecurrence((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed || exerciseIds.length === 0) return;
    const recurrenceDaysOfWeek = recurrence.size ? Array.from(recurrence) : undefined;
    if (routine) {
      renameRoutine(routine.id, trimmed);
      updateRoutineExercises(routine.id, exerciseIds);
      updateRoutineRecurrence(routine.id, recurrenceDaysOfWeek);
      const updated = updateRoutineOnlyExercises(routine.id, onlyRoutineExercises);
      if (updated) onSaved({ ...updated, workoutType });
    } else {
      const created = createRoutine({ name: trimmed, exerciseIds, workoutType, recurrenceDaysOfWeek, onlyRoutineExercises });
      onSaved(created);
    }
  }

  if (!visible) return null;

  return (
    <>
      <SheetModal
        visible={visible && !pickerOpen}
        onClose={onClose}
        eyebrow="ROUTINE"
        title={routine ? 'Edit routine' : 'New routine'}
        closeLabel="Close routine editor"
      >
        <Text variant="caption" color="textFaint" weight="bold">NAME</Text>
        <TextField
          value={name}
          onChangeText={setName}
          placeholder="e.g. Push day"
          multiline={false}
          style={{ marginTop: spacing.sm, minHeight: 0, height: 44, paddingVertical: 0, textAlignVertical: 'center' }}
        />

        <Text variant="caption" color="textFaint" weight="bold" style={{ marginTop: spacing.xl }}>STYLE</Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
          Determines which exercises you can add below.
        </Text>
        <View style={{ marginTop: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {WORKOUT_TYPE_OPTIONS.map((option) => (
            <PressScale
              key={option.label}
              onPress={() => selectWorkoutType(option.value)}
              haptic="selection"
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: workoutType === option.value }}
              style={{
                width: '31%',
                height: 82,
                borderRadius: radii.md,
                overflow: 'hidden',
                borderWidth: workoutType === option.value ? 2 : 1,
                borderColor: workoutType === option.value ? colors.primary : colors.border,
              }}
            >
              <ImageBackground source={workoutTypeArt(option.value)} contentFit="cover" style={{ flex: 1, justifyContent: 'flex-end', padding: spacing.sm }}>
                <HeroScrim />
                {workoutType === option.value ? (
                  <View
                    pointerEvents="none"
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.primary, opacity: 0.35 }}
                  />
                ) : null}
                <Text variant="caption" color="heroText" weight="bold" numberOfLines={1}>{option.label}</Text>
                {workoutType === option.value ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: spacing.xs,
                      right: spacing.xs,
                      width: 20,
                      height: 20,
                      borderRadius: radii.pill,
                      backgroundColor: colors.primary,
                      borderWidth: 1,
                      borderColor: colors.heroBorder,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="selected" size={12} color="heroText" />
                  </View>
                ) : null}
              </ImageBackground>
            </PressScale>
          ))}
        </View>
        {styleNotice ? (
          <Text variant="caption" color="primaryTextSoft" style={{ marginTop: spacing.sm }}>
            {styleNotice}
          </Text>
        ) : null}

        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl }}>
          <Text variant="caption" color="textFaint" weight="bold">EXERCISES</Text>
          <Button title="Add exercise" size="sm" variant="secondary" onPress={() => setPickerOpen(true)} />
        </Row>
        {exercises.length === 0 ? (
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm }}>
            Add the exercises you want in this routine.
          </Text>
        ) : (
          <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
            {exercises.map((exercise, index) => (
              <Row key={exercise.id} gap="sm" style={{ alignItems: 'center' }}>
                <MuscleLogo groups={exercise.primaryAreas} size={36} />
                <Text variant="label" style={{ flex: 1 }}>{exercise.name}</Text>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${exercise.name} up`}
                  onPress={() => moveExercise(exercise.id, -1)}
                  haptic="selection"
                  style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', opacity: index === 0 ? 0.3 : 1 }}
                >
                  <Icon name="chevronUp" size={16} color="textFaint" />
                </PressScale>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${exercise.name} down`}
                  onPress={() => moveExercise(exercise.id, 1)}
                  haptic="selection"
                  style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', opacity: index === exercises.length - 1 ? 0.3 : 1 }}
                >
                  <Icon name="chevronDown" size={16} color="textFaint" />
                </PressScale>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${exercise.name}`}
                  onPress={() => removeExercise(exercise.id)}
                  haptic="selection"
                  style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="close" size={16} color="textFaint" />
                </PressScale>
              </Row>
            ))}
          </View>
        )}

        <Text variant="caption" color="textFaint" weight="bold" style={{ marginTop: spacing.xl }}>RECURRING DAYS (OPTIONAL)</Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
          Shows up automatically in your weekly plan on these days.
        </Text>
        <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
          {DAY_OPTIONS.map((option) => (
            <Chip key={option.value} label={option.label} selected={recurrence.has(option.value)} onPress={() => toggleDay(option.value)} />
          ))}
        </Row>

        <Text variant="caption" color="textFaint" weight="bold" style={{ marginTop: spacing.xl }}>ONLY THESE EXERCISES</Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
          Stop the coach from adding its own warmup, cool down, or conditioning exercises — only what's listed above will be used.
        </Text>
        <Row style={{ marginTop: spacing.sm }}>
          <Chip
            label="Only these exercises"
            selected={onlyRoutineExercises}
            onPress={() => setOnlyRoutineExercises((v) => !v)}
          />
        </Row>

        <Card tone="surfaceAlt" style={{ marginTop: spacing.xl }}>
          <Text variant="caption" color="textMuted">
            {onlyRoutineExercises
              ? "Sets, reps, and load are still adapted each time you run this routine — but warmup, cool down, and conditioning will only draw from this list (and may be skipped if it doesn't cover them), never filled in from elsewhere."
              : 'Sets, reps, and load are still adapted each time you run this routine — your routine fixes the exercises, not the prescription.'}
          </Text>
        </Card>

        <Button
          title="Save routine"
          onPress={save}
          disabled={!name.trim() || exerciseIds.length === 0}
          fullWidth
          style={{ marginTop: spacing.xl }}
        />
      </SheetModal>

      <ExercisePickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add to routine"
        exercises={pickerPool}
        ownsEquipment={(exercise) => equipmentSatisfied(exercise, equipment)}
        actionLabel="Add"
        onPick={(exerciseId) => setExerciseIds((prev) => (prev.includes(exerciseId) ? prev : [...prev, exerciseId]))}
      />
    </>
  );
}
