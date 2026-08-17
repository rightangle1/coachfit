/**
 * The forward-looking weekly forecast (ADR-0142) — completed/scheduled/
 * recurring/suggested/missed/rest per day — as a popup instead of an
 * always-inline card, reached from Today's date stat or its day strip.
 * Row rendering is otherwise unchanged from the original inline Weekly Plan
 * card: same icon/status vocabulary, same schedule/remove actions.
 */

import { type ReactNode } from 'react';
import { View } from 'react-native';

import {
  Card,
  Divider,
  Icon,
  PressScale,
  Row,
  SheetModal,
  Text,
  useTheme,
  type ColorToken,
  type IconName,
} from '@/design';
import { INTENT_OPTIONS, MODALITY_LABELS, MUSCLE_GROUP_LABELS, defaultWorkoutTypeForModality, modalityIcon, workoutLabel, workoutTypeIcon } from '@/app-lib/options';
import { workoutSummary, type ScheduleWorkoutOptions, type WeekPlanRow } from '@/app-lib/presentation';
import type { Routine } from '@/domain/types';

export function WeeklyPlanSheet({
  visible,
  onClose,
  rows,
  routines,
  weekStart,
  completedCount,
  plannedCount,
  horizonDays,
  deloadRecommended,
  showSecondWeek,
  onToggleSecondWeek,
  onScheduleWorkout,
  onClearScheduledWorkout,
}: {
  visible: boolean;
  onClose: () => void;
  rows: WeekPlanRow[];
  routines: Routine[];
  weekStart: number;
  completedCount: number;
  plannedCount: number;
  horizonDays: number;
  deloadRecommended: boolean;
  showSecondWeek: boolean;
  onToggleSecondWeek: () => void;
  onScheduleWorkout: (day: number, options?: ScheduleWorkoutOptions) => void;
  onClearScheduledWorkout: (day: number) => void;
}) {
  const { colors, radii, spacing } = useTheme();
  const visibleRows = showSecondWeek ? rows : rows.slice(0, 7);

  return (
    <SheetModal visible={visible} onClose={onClose} eyebrow="AHEAD" title="Weekly plan" closeLabel="Close weekly plan">
      <Card>
        <Text variant="caption" color="textMuted">
          {completedCount} done · {plannedCount} planned over the next {horizonDays} days
        </Text>
        {deloadRecommended && (
          <Row gap="xs" style={{ alignItems: 'center', marginTop: spacing.xs }}>
            <Icon name="warning" size={14} color="warning" />
            <Text variant="caption" color="warning" weight="semibold">Easing off this week</Text>
          </Row>
        )}
        <View style={{ marginTop: spacing.md }}>
          {visibleRows.map(({ day, ...row }, index) => {
            const isToday = day === weekStart;
            const dateObj = new Date(day);

            let icon: IconName = 'sleep';
            let iconColor: ColorToken = 'textFaint';
            let title = 'Rest day';
            let subtitle: string | undefined = 'No session planned';
            let action: ReactNode = null;

            if (row.status === 'completed') {
              const summary = workoutSummary(row.record);
              const groups = summary.groups.slice(0, 2).map((g) => MUSCLE_GROUP_LABELS[g]).join(' · ');
              icon = 'checkAll';
              iconColor = 'primary';
              title = workoutLabel(row.record.workoutType);
              subtitle = groups || 'Completed';
            } else if (row.status === 'scheduled') {
              const intentLabel = INTENT_OPTIONS.find((option) => option.value === row.scheduled.trainingIntent)?.label;
              const scheduledRoutine = row.scheduled.routineId ? routines.find((r) => r.id === row.scheduled.routineId) : undefined;
              icon = workoutTypeIcon(row.scheduled.workoutType);
              iconColor = 'primaryTextSoft';
              title = scheduledRoutine ? scheduledRoutine.name : workoutLabel(row.scheduled.workoutType);
              subtitle = intentLabel && intentLabel !== 'Balanced' ? intentLabel : 'Planned';
              action = (
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`Remove the planned workout on ${dateObj.toLocaleDateString(undefined, { weekday: 'long' })}`}
                  onPress={() => onClearScheduledWorkout(day)}
                  haptic="selection"
                  style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="close" size={16} color="textFaint" />
                </PressScale>
              );
            } else if (row.status === 'suggested') {
              icon = modalityIcon(row.intent.modality);
              iconColor = 'textMuted';
              title = MODALITY_LABELS[row.intent.modality ?? 'strength'];
              subtitle = row.intent.priorityMuscles.length
                ? row.intent.priorityMuscles.slice(0, 2).map((g) => MUSCLE_GROUP_LABELS[g]).join(' · ')
                : 'Suggested focus';
              action = (
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`Add this suggested workout to ${dateObj.toLocaleDateString(undefined, { weekday: 'long' })}`}
                  onPress={() => onScheduleWorkout(day, {
                    workoutType: defaultWorkoutTypeForModality(row.intent.modality),
                    emphasize: row.intent.priorityMuscles.map((group) => ({ group })),
                  })}
                  haptic="selection"
                  style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="add" size={20} color="primaryTextSoft" />
                </PressScale>
              );
            } else if (row.status === 'recurring') {
              icon = workoutTypeIcon(row.routine.workoutType);
              iconColor = 'textMuted';
              title = row.routine.name;
              subtitle = 'Recurring';
              action = (
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${row.routine.name} to ${dateObj.toLocaleDateString(undefined, { weekday: 'long' })}`}
                  onPress={() => onScheduleWorkout(day, { routineId: row.routine.id, workoutType: row.routine.workoutType })}
                  haptic="selection"
                  style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="add" size={20} color="primaryTextSoft" />
                </PressScale>
              );
            } else if (row.status === 'missed') {
              icon = 'warning';
              iconColor = 'warning';
              title = 'Missed workout';
              subtitle = 'No session logged that day';
            }

            return (
              <View key={day}>
                {index > 0 && <Divider style={{ marginVertical: spacing.sm }} />}
                <Row gap="md" style={{ alignItems: 'center' }}>
                  <View style={{ width: 34, alignItems: 'center' }}>
                    <Text variant="caption" color={isToday ? 'primary' : 'textFaint'} weight="bold">
                      {isToday ? 'TODAY' : dateObj.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
                    </Text>
                    <Text variant="label" color={isToday ? 'primary' : 'text'} weight={isToday ? 'bold' : 'regular'} style={{ marginTop: 1 }}>
                      {dateObj.getDate()}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: radii.md,
                      backgroundColor: colors.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name={icon} size={15} color={iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="label" weight="semibold">{title}</Text>
                    {subtitle ? <Text variant="caption" color="textMuted">{subtitle}</Text> : null}
                  </View>
                  {action}
                </Row>
              </View>
            );
          })}
        </View>
        {rows.length > 7 && (
          <PressScale
            onPress={onToggleSecondWeek}
            haptic="selection"
            accessibilityRole="button"
            accessibilityState={{ expanded: showSecondWeek }}
            accessibilityLabel={showSecondWeek ? 'Hide next week' : 'Show next week'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', marginTop: spacing.md }}
          >
            <Text variant="caption" color="primary" weight="bold">
              {showSecondWeek ? 'HIDE NEXT WEEK' : 'SHOW NEXT WEEK'}
            </Text>
            <Icon name={showSecondWeek ? 'chevronUp' : 'chevronDown'} size={15} color="primary" />
          </PressScale>
        )}
      </Card>
    </SheetModal>
  );
}
