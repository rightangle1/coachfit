/** A warm, non-blocking reward moment for achievements and personal records. */

import { useEffect } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme';
import { Text } from './text';

const PARTICLES = Array.from({ length: 12 }, (_, i) => ({ angle: (i / 12) * Math.PI * 2, size: i % 3 === 0 ? 9 : 6, square: i % 2 === 0 }));

export interface CelebrationBurstProps {
  visible: boolean;
  label: string;
  sublabel?: string;
  tone?: 'primary' | 'gold';
  kind?: 'achievement' | 'pr';
  durationMs?: number;
  onDismiss: () => void;
  style?: ViewStyle;
}

function Particle({ angle, size, square, progress, color }: { angle: number; size: number; square: boolean; progress: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => {
    const distance = progress.value * 72;
    return { opacity: 1 - progress.value, transform: [{ translateX: Math.cos(angle) * distance }, { translateY: Math.sin(angle) * distance }, { rotate: `${progress.value * 160}deg` }, { scale: 1 - progress.value * 0.25 }] };
  });
  return <Animated.View style={[{ position: 'absolute', width: size, height: square ? size * 1.7 : size, borderRadius: square ? 2 : size, backgroundColor: color }, style]} />;
}

function CelebrationArt({ kind, accent, icing, plate }: { kind: 'achievement' | 'pr'; accent: string; icing: string; plate: string }) {
  if (kind === 'pr') {
    return <Svg width={62} height={62} viewBox="0 0 62 62" accessibilityElementsHidden><Path d="M17 14h28v11c0 10-6 17-14 17S17 35 17 25z" fill={accent} /><Path d="M17 18H9c0 10 3 15 11 16M45 18h8c0 10-3 15-11 16M31 42v8m-11 0h22" stroke={plate} strokeWidth={4} strokeLinecap="round" fill="none" /><Path d="m31 20 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill={icing} /></Svg>;
  }
  return <Svg width={62} height={62} viewBox="0 0 62 62" accessibilityElementsHidden><Path d="M14 8h16l3 21-13 8L11 29z" fill={accent} opacity={0.7} /><Path d="M32 8h16l3 21-13 8-13-8z" fill={accent} opacity={0.42} /><Circle cx="31" cy="37" r="19" fill={accent} /><Circle cx="31" cy="37" r="14" fill={plate} opacity={0.15} /><Path d="m31 25 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" fill={icing} /></Svg>;
}

export function CelebrationBurst({ visible, label, sublabel, tone = 'primary', kind = 'achievement', durationMs = 2200, onDismiss, style }: CelebrationBurstProps) {
  const { colors, radii, spacing, shadows } = useTheme();
  const scale = useSharedValue(0.55);
  const opacity = useSharedValue(0);
  const particleProgress = useSharedValue(0);
  const accent = tone === 'gold' ? colors.tierGold : colors.primary;
  const icing = tone === 'gold' ? colors.accent : colors.tierGold;

  useEffect(() => {
    if (!visible) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    scale.value = 0.55;
    opacity.value = 0;
    particleProgress.value = 0;
    scale.value = withSequence(withTiming(1.08, { duration: 300, easing: Easing.out(Easing.back(1.4)) }), withTiming(1, { duration: 160 }));
    opacity.value = withSequence(withTiming(1, { duration: 180 }), withDelay(Math.max(0, durationMs - 460), withTiming(0, { duration: 260 })));
    particleProgress.value = withTiming(1, { duration: 950, easing: Easing.out(Easing.quad) });
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [visible, durationMs, tone, kind, onDismiss, opacity, particleProgress, scale]);

  const badgeStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={[{ position: 'absolute', top: spacing.lg, left: 0, right: 0, alignItems: 'center', zIndex: 50 }, style]}>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss celebration">
        <Animated.View style={[{ width: 272, alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radii.xxl, backgroundColor: colors.surface, borderWidth: 2, borderColor: accent }, shadows.md, badgeStyle]}>
          <View pointerEvents="none" style={{ position: 'absolute', width: 1, height: 1, top: '42%', left: '50%' }}>
            {PARTICLES.map((particle, i) => <Particle key={i} {...particle} progress={particleProgress} color={i % 3 === 0 ? icing : accent} />)}
          </View>
          <CelebrationArt kind={kind} accent={accent} icing={icing} plate={colors.text} />
          <Text variant="caption" weight="bold" color="textMuted" style={{ marginTop: 2, letterSpacing: 1.2 }}>{kind === 'pr' ? 'PERSONAL RECORD' : 'ACHIEVEMENT UNLOCKED'}</Text>
          <Text variant="heading" weight="bold" center style={{ marginTop: 2 }}>{label}</Text>
          <Text variant="caption" color="textMuted" center style={{ marginTop: 3 }}>{sublabel ?? (kind === 'pr' ? 'That one is all yours.' : 'You earned this one.')}</Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}
