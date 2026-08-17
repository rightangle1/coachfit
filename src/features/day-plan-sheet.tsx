/**
 * A single day's forecast — reached by tapping a day chip on Today's week
 * strip. Completed days route to `WorkoutDetailSheet` instead (the actual
 * past workout, not a forecast); this sheet only ever shows a
 * scheduled/recurring/suggested/missed/rest day.
 *
 * Three actions, contextual to the day's current state:
 * - Recommend: accept the forecast/routine as-is for that day.
 * - Customize: pick a different style + target area for that day specifically.
 * - Remove: clear an already-scheduled day back to the engine's own forecast.
 */

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, Icon, Row, SheetModal, Text, useTheme, type ColorToken, type IconName } from '@/design';
import {
  EMPHASIS_OPTIONS,
  FULL_BODY_EMPHASIS_OPTION,
  INTENT_OPTIONS,
  MODALITY_LABELS,
  MUSCLE_GROUP_LABELS,
  WORKOUT_TYPE_OPTIONS,
  areaKey,
  defaultWorkoutTypeForModality,
  modalityIcon,
  workoutLabel,
  workoutTypeIcon,
} from '@/app-lib/options';
import type { ScheduleWorkoutOptions, WeekPlanRow } from '@/app-lib/presentation';
import type { BodyArea, Routine, WorkoutType } from '@/domain/types';

const FULL_BODY_KEY = areaKey(FULL_BODY_EMPHASIS_OPTION.area);

/** Best-guess style/target-area for whatever this day is already showing —
 * seeds the Customize pickers so editing starts from something sensible. */
function seedFrom(row: Exclude<WeekPlanRow, { status: 'completed' }>): { type: WorkoutType | undefined; emphasis: Set<string> } {
  if (row.status === 'scheduled') {
    return {
      type: row.scheduled.workoutType,
      emphasis: new Set((row.scheduled.targeting?.emphasize ?? []).map(areaKey)),
    };
  }
  if (row.status === 'recurring') return { type: row.routine.workoutType, emphasis: new Set() };
  if (row.status === 'suggested') {
    return {
      type: defaultWorkoutTypeForModality(row.intent.modality),
      emphasis: new Set(row.intent.priorityMuscles.map((group) => areaKey({ group }))),
    };
  }
  return { type: undefined, emphasis: new Set() };
}

export function DayPlanSheet({
  row,
  routines,
  recommendedWorkoutType,
  onClose,
  onScheduleWorkout,
  onClearScheduledWorkout,
}: {
  row: Exclude<WeekPlanRow, { status: 'completed' }> | null;
  routines: Routine[];
  /** Fallback style for a plain rest day's Recommend action — the same
   * profile-driven default Today itself opens with. */
  recommendedWorkoutType: WorkoutType | undefined;
  onClose: () => void;
  onScheduleWorkout: (day: number, options?: ScheduleWorkoutOptions) => void;
  onClearScheduledWorkout: (day: number) => void;
}) {
  const { spacing } = useTheme();
  const [customizing, setCustomizing] = useState(false);
  const [pickedType, setPickedType] = useState<WorkoutType | undefined>(undefined);
  const [pickedEmphasis, setPickedEmphasis] = useState<Set<string>>(new Set());

  // A different day (or the sheet closing) always starts back on the
  // summary view, not wherever Customize was left for the last one.
  useEffect(() => setCustomizing(false), [row?.day]);

  if (!row) return null;
  // Captured once so the nested handlers below (defined in this render,
  // invoked later from onPress) don't lose TS's non-null narrowing on `row`.
  const currentRow = row;

  function toggleEmphasis(key: string) {
    setPickedEmphasis((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); return next; }
      if (key === FULL_BODY_KEY) { next.clear(); next.add(key); return next; }
      next.delete(FULL_BODY_KEY);
      if (next.size < 2) next.add(key);
      return next;
    });
  }

  function openCustomize() {
    const seed = seedFrom(currentRow);
    setPickedType(seed.type);
    setPickedEmphasis(seed.emphasis);
    setCustomizing(true);
  }

  function saveCustomize() {
    const emphasize: BodyArea[] = pickedEmphasis.has(FULL_BODY_KEY)
      ? [FULL_BODY_EMPHASIS_OPTION.area]
      : EMPHASIS_OPTIONS.filter((option) => pickedEmphasis.has(areaKey(option.area))).map((option) => option.area);
    onScheduleWorkout(currentRow.day, { workoutType: pickedType, emphasize });
    onClose();
  }

  const dateObj = new Date(currentRow.day);

  let icon: IconName = 'sleep';
  let iconColor: ColorToken = 'textFaint';
  let title = 'Rest day';
  let subtitle: string | undefined = 'No session planned';
  let recommend: (() => void) | null = null;
  let remove: (() => void) | null = null;

  if (currentRow.status === 'scheduled') {
    const scheduled = currentRow.scheduled;
    const intentLabel = INTENT_OPTIONS.find((option) => option.value === scheduled.trainingIntent)?.label;
    const scheduledRoutine = scheduled.routineId ? routines.find((r) => r.id === scheduled.routineId) : undefined;
    icon = workoutTypeIcon(scheduled.workoutType);
    iconColor = 'primaryTextSoft';
    title = scheduledRoutine ? scheduledRoutine.name : workoutLabel(scheduled.workoutType);
    subtitle = intentLabel && intentLabel !== 'Balanced' ? intentLabel : 'Planned';
    remove = () => { onClearScheduledWorkout(currentRow.day); onClose(); };
  } else if (currentRow.status === 'suggested') {
    const intent = currentRow.intent;
    icon = modalityIcon(intent.modality);
    iconColor = 'textMuted';
    title = MODALITY_LABELS[intent.modality ?? 'strength'];
    subtitle = intent.priorityMuscles.length
      ? intent.priorityMuscles.slice(0, 2).map((g) => MUSCLE_GROUP_LABELS[g]).join(' · ')
      : 'Suggested focus';
    recommend = () => {
      onScheduleWorkout(currentRow.day, {
        workoutType: defaultWorkoutTypeForModality(intent.modality),
        emphasize: intent.priorityMuscles.map((group) => ({ group })),
      });
      onClose();
    };
  } else if (currentRow.status === 'recurring') {
    const routine = currentRow.routine;
    icon = workoutTypeIcon(routine.workoutType);
    iconColor = 'textMuted';
    title = routine.name;
    subtitle = 'Recurring';
    recommend = () => { onScheduleWorkout(currentRow.day, { routineId: routine.id, workoutType: routine.workoutType }); onClose(); };
  } else if (currentRow.status === 'missed') {
    icon = 'warning';
    iconColor = 'warning';
    title = 'Missed workout';
    subtitle = 'No session logged that day';
  } else {
    // Rest day — nothing forecast, but still adjustable.
    recommend = () => { onScheduleWorkout(currentRow.day, { workoutType: recommendedWorkoutType }); onClose(); };
  }

  return (
    <SheetModal
      visible
      onClose={onClose}
      eyebrow={dateObj.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase()}
      title={dateObj.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
      closeLabel="Close day plan"
    >
      {!customizing ? (
        <>
          <Row gap="md" style={{ alignItems: 'center' }}>
            <Icon name={icon} size={22} color={iconColor} />
            <View style={{ flex: 1 }}>
              <Text variant="heading" italic>{title}</Text>
              {subtitle ? <Text variant="body" color="textMuted">{subtitle}</Text> : null}
            </View>
          </Row>

          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            {recommend && <Button title="Recommend" onPress={recommend} fullWidth />}
            <Button title="Customize" variant="secondary" onPress={openCustomize} fullWidth />
            {remove && <Button title="Remove from plan" variant="quiet" onPress={remove} fullWidth />}
            <Button title="Close" variant="quiet" onPress={onClose} fullWidth />
          </View>
        </>
      ) : (
        <>
          <Text variant="caption" color="textFaint" weight="bold">STYLE</Text>
          <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
            {WORKOUT_TYPE_OPTIONS.map((option) => (
              <Chip key={option.label} label={option.label} selected={pickedType === option.value} onPress={() => setPickedType(option.value)} />
            ))}
          </Row>

          <Text variant="caption" color="textFaint" weight="bold" style={{ marginTop: spacing.lg }}>TARGET AREA</Text>
          <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
            <Chip label={FULL_BODY_EMPHASIS_OPTION.label} selected={pickedEmphasis.has(FULL_BODY_KEY)} onPress={() => toggleEmphasis(FULL_BODY_KEY)} />
            {EMPHASIS_OPTIONS.map((option) => {
              const key = areaKey(option.area);
              return <Chip key={key} label={option.label} selected={pickedEmphasis.has(key)} onPress={() => toggleEmphasis(key)} />;
            })}
          </Row>

          <Row gap="md" style={{ marginTop: spacing.xl }}>
            <Button title="Back" variant="secondary" onPress={() => setCustomizing(false)} style={{ flex: 1 }} />
            <Button title="Save" onPress={saveCustomize} style={{ flex: 1 }} />
          </Row>
        </>
      )}
    </SheetModal>
  );
}
