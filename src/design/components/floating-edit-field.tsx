/**
 * FloatingEditField — the keypad-safe way to edit a number inline.
 *
 * Tapping a Stepper/duration value used to swap it for a `TextInput` in
 * place, but that row can sit anywhere in a scrolled list — low enough that
 * the on-screen keypad covers it while the athlete is typing. This instead
 * pins the editor to the top of the screen in a small modal card, so it's
 * always visible above the keypad regardless of where the tapped row was.
 */

import { Modal, Pressable, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme';
import { PressScale } from './pressable';
import { Text } from './text';

export function FloatingEditField({
  visible,
  label,
  value,
  onChangeText,
  onSubmit,
  keyboardType = 'default',
}: {
  visible: boolean;
  /** Caption shown above the field, e.g. "WEIGHT (KG)" or "TIME". */
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  keyboardType?: KeyboardTypeOptions;
}) {
  const { colors, radii, spacing, shadows, typography } = useTheme();
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSubmit}>
      <Pressable
        accessibilityLabel="Dismiss"
        style={{ flex: 1, backgroundColor: colors.overlay }}
        onPress={onSubmit}
      >
        <SafeAreaView edges={['top']} style={{ alignItems: 'center' }}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[
              {
                marginTop: spacing.lg,
                minWidth: 160,
                alignItems: 'center',
                gap: spacing.xs,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.xl,
                borderRadius: radii.lg,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              },
              shadows.lg,
            ]}
          >
            {label ? (
              <Text variant="caption" color="textFaint" weight="bold">
                {label}
              </Text>
            ) : null}
            <TextInput
              autoFocus
              keyboardType={keyboardType}
              value={value}
              onChangeText={onChangeText}
              onSubmitEditing={onSubmit}
              selectTextOnFocus
              accessibilityLabel={label ? `Edit ${label}` : 'Edit value'}
              style={{
                minWidth: 96,
                textAlign: 'center',
                fontSize: typography.title.fontSize,
                fontWeight: '700',
                color: colors.text,
                padding: 0,
              }}
            />
            <PressScale
              onPress={onSubmit}
              haptic="selection"
              accessibilityRole="button"
              accessibilityLabel="Done"
              style={{
                marginTop: spacing.xs,
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.lg,
                borderRadius: radii.pill,
                backgroundColor: colors.primary,
              }}
            >
              <Text variant="label" weight="bold" color="primaryText">
                Done
              </Text>
            </PressScale>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}
