/** Themed Text (ADR-0110) — typographic variants + semantic color tokens. */

import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '../theme';
import type { ColorToken, FontWeightName, TextVariant } from '../tokens';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: ColorToken;
  weight?: FontWeightName;
  center?: boolean;
  italic?: boolean;
}

export function Text({
  variant = 'body',
  color = 'text',
  weight,
  center,
  italic,
  style,
  ...rest
}: TextProps) {
  const { colors, typography, fontWeight: fw } = useTheme();
  const t = typography[variant];
  return (
    <RNText
      style={[
        {
          color: colors[color],
          fontSize: t.fontSize,
          lineHeight: t.lineHeight,
          fontWeight: weight ? fw[weight] : t.fontWeight,
          letterSpacing: t.letterSpacing,
          textAlign: center ? 'center' : undefined,
          fontStyle: italic ? 'italic' : undefined,
        },
        style,
      ]}
      {...rest}
    />
  );
}
