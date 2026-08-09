/** Themed multiline TextField (ADR-0110) — for optional free-text notes. */

import { TextInput, type TextInputProps } from 'react-native';
import { useTheme } from '../theme';

export function TextField({ style, ...rest }: TextInputProps) {
  const { colors, radii, spacing, typography } = useTheme();
  return (
    <TextInput
      multiline
      placeholderTextColor={colors.textFaint}
      style={[
        {
          backgroundColor: colors.surfaceAlt,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radii.md,
          padding: spacing.md,
          minHeight: 80,
          color: colors.text,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
          textAlignVertical: 'top',
        },
        style,
      ]}
      {...rest}
    />
  );
}
