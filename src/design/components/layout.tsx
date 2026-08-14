/** Themed layout primitives (ADR-0110): Screen, Card, Divider, Row. */

import { forwardRef, type ReactNode } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Icon, type IconName } from './icon';
import type { ContextTone } from '../tokens';

export const Screen = forwardRef<ScrollView, {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  footer?: ReactNode;
}>(function Screen({ children, scroll = true, contentStyle, footer }, scrollRef) {
  const { colors, spacing } = useTheme();
  const inner = (
    <View
      style={[
        { width: '100%', maxWidth: 560, alignSelf: 'center', padding: spacing.xl, gap: spacing.lg },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: spacing.xxxl, alignItems: 'center' }}
          showsVerticalScrollIndicator={false}
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
      {footer ? (
        <View
          style={{
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: spacing.lg,
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
});

export function Card({
  children,
  style,
  elevated,
  padded = true,
  tone = 'surface',
  contextTone,
}: {
  children: ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
  padded?: boolean;
  tone?: 'surface' | 'primarySoft' | 'surfaceAlt';
  /** A restrained semantic wash for summaries that have a training context. */
  contextTone?: ContextTone;
}) {
  const { colors, radii, spacing, shadows } = useTheme();
  const contextual = contextTone ? colors.tones[contextTone] : null;
  return (
    <View
      style={[
        {
          backgroundColor: contextual?.surface ?? colors[tone],
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: contextual?.border ?? (tone === 'primarySoft' ? colors.primary : colors.border),
          padding: padded ? spacing.lg : 0,
        },
        elevated && shadows.md,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A compact, non-interactive landmark for a card or action row. */
export function ToneIconTile({
  name,
  tone = 'primary',
  size = 36,
  iconSize = 18,
  style,
}: {
  name: IconName;
  tone?: ContextTone;
  size?: number;
  iconSize?: number;
  style?: ViewStyle;
}) {
  const { colors, radii } = useTheme();
  const contextual = colors.tones[tone];
  return (
    <View
      pointerEvents="none"
      style={[
        {
          width: size,
          height: size,
          borderRadius: radii.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: contextual.surface,
          borderWidth: 1,
          borderColor: contextual.border,
        },
        style,
      ]}
    >
      <Icon name={name} size={iconSize} tint={contextual.text} />
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[{ height: 1, backgroundColor: colors.border }, style]} />;
}

export function Row({
  children,
  gap = 'sm',
  wrap,
  align = 'center',
  style,
}: {
  children: ReactNode;
  gap?: 'xs' | 'sm' | 'md' | 'lg';
  wrap?: boolean;
  align?: ViewStyle['alignItems'];
  style?: ViewStyle;
}) {
  const { spacing } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: align,
          gap: spacing[gap],
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
