/** Pick a saved routine for today's session (ADR-0137). */

import { View } from 'react-native';

import { Button, Card, Icon, PressScale, Row, SheetModal, Text, useTheme } from '@/design';
import type { Routine } from '@/domain/types';

function lastUsedLabel(routine: Routine): string {
  if (!routine.lastUsedAt) return 'Not used yet';
  return `Last used ${new Date(routine.lastUsedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export function RoutinePickerSheet({
  visible,
  routines,
  selectedRoutineId,
  onClose,
  onSelect,
  onView,
  onCreateRoutine,
  onEditRoutine,
}: {
  visible: boolean;
  routines: Routine[];
  selectedRoutineId: string | null;
  onClose: () => void;
  onSelect: (routineId: string) => void;
  onView: (routineId: string) => void;
  onCreateRoutine: () => void;
  onEditRoutine: (routineId: string) => void;
}) {
  const { spacing } = useTheme();

  return (
    <SheetModal visible={visible} onClose={onClose} eyebrow="TODAY’S SESSION" title="Pick a routine" closeLabel="Close routine picker">
      {routines.length === 0 ? (
        <View style={{ gap: spacing.md }}>
          <Text variant="body" color="textMuted">
            You haven’t saved any of your routines yet. Routines let you specify a specific set of exercises for a single workout.
          </Text>
          <Button
            title="Create New Routine"
            onPress={() => {
              onCreateRoutine();
              onClose();
            }}
            fullWidth
          />
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Text variant="caption" color="textFaint" weight="bold">YOUR ROUTINES</Text>
          <View style={{ gap: spacing.sm }}>
            {routines.map((routine) => (
              <Card key={routine.id} tone={selectedRoutineId === routine.id ? 'primarySoft' : 'surfaceAlt'}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <PressScale
                    onPress={() => {
                      onSelect(routine.id);
                      onClose();
                    }}
                    haptic="selection"
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${routine.name} today`}
                    style={{ flex: 1, paddingVertical: spacing.xs }}
                  >
                    <Row gap="xs" style={{ alignItems: 'center' }}>
                      <Text variant="subtitle">{routine.name}</Text>
                      {routine.onlyRoutineExercises ? <Icon name="lock" size={12} color="textFaint" /> : null}
                    </Row>
                    <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                      {routine.exerciseIds.length} exercise{routine.exerciseIds.length === 1 ? '' : 's'} · {lastUsedLabel(routine)}
                      {routine.onlyRoutineExercises ? ' · Only these exercises' : ''}
                    </Text>
                  </PressScale>
                  <Row style={{ marginLeft: spacing.md, gap: spacing.sm }}>
                    <Button title="View" size="sm" variant="secondary" onPress={() => onView(routine.id)} />
                    <Button
                      title="Edit"
                      size="sm"
                      variant="secondary"
                      onPress={() => {
                        onEditRoutine(routine.id);
                        onClose();
                      }}
                    />
                  </Row>
                </Row>
              </Card>
            ))}
          </View>
          <Button
            title="Create New Routine"
            variant="secondary"
            onPress={() => {
              onCreateRoutine();
              onClose();
            }}
            fullWidth
          />
        </View>
      )}
    </SheetModal>
  );
}
