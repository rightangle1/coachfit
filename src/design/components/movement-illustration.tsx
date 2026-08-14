/**
 * MovementIllustration (ADR-0301) — the baseline, self-made looping visual for
 * every exercise. Keyed by `MovementPattern`, so every exercise has one by
 * construction; it's what `ExerciseMediaCard` falls back to when an exercise
 * has no enriched media (ADR-0302). Built from themed `View`s + Reanimated —
 * no new dependencies, identical on native and web.
 */

import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../theme';
import { Text } from './text';
import type { MovementPattern } from '@/domain/types';

type Motion = 'bob' | 'tilt' | 'pulse' | 'sway' | 'swing' | 'orbit';

interface PatternConfig {
  label: string;
  motion: Motion;
  duration: number;
  tone: 'primary' | 'accent';
}

const PATTERN_CONFIG: Record<MovementPattern, PatternConfig> = {
  squat: { label: 'Squat', motion: 'bob', duration: 1400, tone: 'primary' },
  hinge: { label: 'Hinge', motion: 'tilt', duration: 1500, tone: 'primary' },
  lunge: { label: 'Lunge', motion: 'sway', duration: 1300, tone: 'primary' },
  push: { label: 'Push', motion: 'swing', duration: 1100, tone: 'accent' },
  pull: { label: 'Pull', motion: 'swing', duration: 1100, tone: 'accent' },
  carry: { label: 'Carry', motion: 'sway', duration: 1900, tone: 'accent' },
  core: { label: 'Core', motion: 'pulse', duration: 1600, tone: 'primary' },
  steady_cardio: { label: 'Cardio', motion: 'orbit', duration: 1300, tone: 'accent' },
  interval: { label: 'Interval', motion: 'orbit', duration: 650, tone: 'accent' },
  aerobics: { label: 'Aerobics', motion: 'orbit', duration: 950, tone: 'accent' },
  stretch: { label: 'Mobility', motion: 'pulse', duration: 2400, tone: 'primary' },
  yoga_flow: { label: 'Yoga', motion: 'pulse', duration: 2600, tone: 'accent' },
  barre_flow: { label: 'Barre', motion: 'pulse', duration: 1800, tone: 'accent' },
  pilates_flow: { label: 'Pilates', motion: 'pulse', duration: 2000, tone: 'accent' },
};

export function MovementIllustration({
  pattern,
  size = 88,
  showLabel = true,
  style,
}: {
  pattern: MovementPattern;
  size?: number;
  showLabel?: boolean;
  style?: ViewStyle;
}) {
  const { colors, radii, spacing } = useTheme();
  const cfg = PATTERN_CONFIG[pattern];
  const progress = useSharedValue(0);

  useEffect(() => {
    const spins = cfg.motion === 'orbit';
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: cfg.duration, easing: Easing.inOut(Easing.ease) }),
      -1,
      !spins, // yoyo (reverse each cycle) for everything except a continuous spin
    );
  }, [cfg.motion, cfg.duration, progress]);

  const color = colors[cfg.tone];
  const shapeSize = size * 0.34;
  const dotSize = size * 0.16;

  const bobStyle = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      transform: [
        { translateY: -size * 0.09 + t * size * 0.18 },
        { scaleY: 1 - t * 0.18 },
        { scaleX: 1 + t * 0.1 },
      ],
    };
  });

  const tiltStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-22 + progress.value * 44}deg` }],
    transformOrigin: 'bottom center',
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.82 + progress.value * 0.32 }],
  }));

  const swayStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -size * 0.2 + progress.value * size * 0.4 },
      { rotate: `${-8 + progress.value * 16}deg` },
    ],
  }));

  const swingLeftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -size * 0.1 - progress.value * size * 0.16 }],
  }));

  const swingRightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: size * 0.1 + progress.value * size * 0.16 }],
  }));

  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 360}deg` }],
  }));

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radii.lg,
          backgroundColor: colors.surfaceAlt,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {cfg.motion === 'bob' && (
        <Animated.View
          style={[
            { width: shapeSize, height: shapeSize * 1.3, borderRadius: radii.md, backgroundColor: color },
            bobStyle,
          ]}
        />
      )}
      {cfg.motion === 'tilt' && (
        <Animated.View
          style={[
            { width: shapeSize * 0.6, height: shapeSize * 1.6, borderRadius: radii.pill, backgroundColor: color },
            tiltStyle,
          ]}
        />
      )}
      {cfg.motion === 'pulse' && (
        <Animated.View
          style={[
            { width: shapeSize, height: shapeSize, borderRadius: shapeSize / 2, backgroundColor: color },
            pulseStyle,
          ]}
        />
      )}
      {cfg.motion === 'sway' && (
        <Animated.View
          style={[
            { width: shapeSize * 1.2, height: shapeSize * 0.8, borderRadius: radii.md, backgroundColor: color },
            swayStyle,
          ]}
        />
      )}
      {cfg.motion === 'swing' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: shapeSize * 0.3 }}>
          <Animated.View
            style={[{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: color }, swingLeftStyle]}
          />
          <Animated.View
            style={[{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: color }, swingRightStyle]}
          />
        </View>
      )}
      {cfg.motion === 'orbit' && (
        <Animated.View
          style={[{ width: shapeSize, height: shapeSize, alignItems: 'center', justifyContent: 'flex-start' }, orbitStyle]}
        >
          <View style={{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: color }} />
        </Animated.View>
      )}

      {showLabel && (
        <Text
          variant="caption"
          color="textFaint"
          style={{ position: 'absolute', bottom: spacing.xs }}
        >
          {cfg.label.toUpperCase()}
        </Text>
      )}
    </View>
  );
}
