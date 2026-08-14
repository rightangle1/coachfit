/** Pick a saved routine for today's session, or hand off to auto-pick (ADR-0137). */

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
  onAutoPick,
  onView,
}: {
  visible: boolean;
  routines: Routine[];
  selectedRoutineId: string | null;
  onClose: () => void;
  onSelect: (routineId: string) => void;
  onAutoPick: () => void;
  onView: (routineId: string) => void;
}) {
  const { spacing } = useTheme();

  return (
    <SheetModal visible={visible} onClose={onClose} eyebrow="TODAY’S SESSION" title="Pick a routine" closeLabel="Close routine picker">
      <Button
        title="Auto-pick for me"
        variant="secondary"
        leadingIcon={<Icon name="target" size={16} color="primaryTextSoft" />}
        onPress={() => {
          onAutoPick();
          onClose();
        }}
        fullWidth
      />
      <View style={{ gap: spacing.sm }}>
        <Text variant="caption" color="textFaint" weight="bold">YOUR ROUTINES</Text>
        {routines.length === 0 ? (
          <Text variant="body" color="textMuted">
            Save a routine from Explore to pick it here.
          </Text>
        ) : (
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
                    <Text variant="subtitle">{routine.name}</Text>
                    <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                      {routine.exerciseIds.length} exercise{routine.exerciseIds.length === 1 ? '' : 's'} · {lastUsedLabel(routine)}
                    </Text>
                  </PressScale>
                  <Button title="View" size="sm" variant="secondary" onPress={() => onView(routine.id)} style={{ marginLeft: spacing.md }} />
                </Row>
              </Card>
            ))}
          </View>
        )}
      </View>
    </SheetModal>
  );
}
