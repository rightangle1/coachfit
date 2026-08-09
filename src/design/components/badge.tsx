import { View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { Text } from './text';
import type { ColorToken } from '../tokens';

/**
 * A small, non-interactive label (ADR-0128).
 *
 * Deliberately separate from `Chip`: a Chip is pressable and carries *selection*
 * semantics — screen readers announce it as a button with a selected state. A
 * badge states a fact about the thing it sits on, so overloading Chip with a
 * non-pressable mode would have meant lying to assistive tech about what the
 * element is.
 */
export function Badge({
  label,
  color,
  background,
  style,
}: {
  label: string;
  /** Text and border colour token. */
  color: ColorToken;
  /** Tinted fill token. */
  background: ColorToken;
  style?: ViewStyle;
}) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        {
          alignSelf: 'flex-start',
          paddingVertical: 2,
          paddingHorizontal: spacing.sm,
          borderRadius: radii.pill,
          backgroundColor: colors[background],
          borderWidth: 1,
          borderColor: colors[color],
        },
        style,
      ]}
    >
      <Text variant="caption" weight="bold" color={color}>
        {label}
      </Text>
    </View>
  );
}

/** Non-default zones worth flagging; hypertrophy is the unremarkable default. */
const ZONE_BADGE = {
  strength: { label: 'STRENGTH', color: 'zoneStrength', background: 'zoneStrengthSoft' },
  endurance: { label: 'ENDURANCE', color: 'zoneEndurance', background: 'zoneEnduranceSoft' },
  power: { label: 'POWER', color: 'zoneStrength', background: 'zoneStrengthSoft' },
} as const satisfies Record<string, { label: string; color: ColorToken; background: ColorToken }>;

/**
 * The STRENGTH / ENDURANCE flag shown on an exercise in both the workout
 * overview and its detail. Renders nothing for hypertrophy — most training is,
 * and should look like, ordinary work.
 */
export function ZoneBadge({ zone, style }: { zone?: string; style?: ViewStyle }) {
  const spec = zone === 'strength' || zone === 'endurance' || zone === 'power' ? ZONE_BADGE[zone] : undefined;
  if (!spec) return null;
  return <Badge label={spec.label} color={spec.color} background={spec.background} style={style} />;
}
