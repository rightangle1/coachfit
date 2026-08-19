/** Themed Button (ADR-0110). Large tap targets for the sweaty-user loop. */

import { type ReactNode } from 'react';
import { ActivityIndicator, View, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { PressScale } from './pressable';
import { Text } from './text';
import type { ColorToken } from '../tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'hero';
type Size = 'sm' | 'md' | 'lg';

const HEIGHT: Record<Size, number> = { sm: 44, md: 52, lg: 60 };

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: Size;
  fullWidth?: boolean;
  disabled?: boolean;
  /** Shows a spinner and blocks further presses. Use for any action that awaits
   *  work the user cannot see — session generation, in particular, used to run
   *  with the button fully enabled and unchanged throughout. */
  loading?: boolean;
  /** Small semantic marks keep actions scannable without turning every button
   *  into a decorated card. */
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  fullWidth,
  disabled,
  loading,
  leadingIcon,
  trailingIcon,
  style,
}: ButtonProps) {
  const { colors, radii, spacing } = useTheme();

  const bg: Record<ButtonVariant, string> = {
    primary: colors.primary,
    secondary: colors.surfaceAlt,
    quiet: 'transparent',
    danger: colors.danger,
    hero: colors.heroPill,
  };
  const fg: Record<ButtonVariant, ColorToken> = {
    primary: 'primaryText',
    secondary: 'text',
    quiet: 'primary',
    danger: 'primaryText',
    hero: 'heroText',
  };
  const border: Record<ButtonVariant, string> = {
    primary: colors.primary,
    secondary: colors.border,
    quiet: 'transparent',
    danger: colors.danger,
    hero: colors.heroBorder,
  };

  const blocked = Boolean(disabled || loading);

  return (
    <PressScale
      onPress={onPress}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: Boolean(loading) }}
      accessibilityLabel={title}
      style={[
        {
          height: HEIGHT[size],
          flexDirection: 'row',
          gap: spacing.xs,
          paddingHorizontal: variant === 'quiet' ? spacing.sm : spacing.lg,
          borderRadius: variant === 'quiet' ? radii.sm : radii.md,
          backgroundColor: bg[variant],
          borderWidth: variant === 'quiet' ? 0 : 1,
          borderColor: border[variant],
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: blocked ? 0.52 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={colors[fg[variant]]} /> : leadingIcon ? <View pointerEvents="none">{leadingIcon}</View> : null}
      <Text variant={size === 'sm' ? 'label' : 'subtitle'} color={fg[variant]} weight="semibold" center>
        {title}
      </Text>
      {trailingIcon ? <View pointerEvents="none">{trailingIcon}</View> : null}
    </PressScale>
  );
}

/** A 44pt icon-only action. Circular geometry is reserved for this compact,
 * icon-only case so text actions do not dissolve into a sea of pills. */
export function IconButton({
  icon,
  label,
  onPress,
  tone = 'neutral',
  disabled,
  style,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  tone?: 'neutral' | 'quiet' | 'hero' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { colors, radii } = useTheme();
  const background = {
    neutral: colors.surfaceAlt,
    quiet: 'transparent',
    hero: colors.heroPill,
    danger: colors.dangerSoft,
  }[tone];
  const border = tone === 'hero' ? colors.heroBorder : tone === 'neutral' ? colors.border : 'transparent';
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={[
        {
          width: 44,
          height: 44,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: background,
          borderWidth: tone === 'quiet' || tone === 'danger' ? 0 : 1,
          borderColor: border,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {icon}
    </PressScale>
  );
}
