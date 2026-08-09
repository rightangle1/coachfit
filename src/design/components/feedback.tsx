/**
 * Feedback primitives (ADR-0130) — the small pieces that were missing entirely.
 *
 * - `Collapsible` replaces the bare `{expanded && <View>}` pattern used in ~8
 *   places, none of which animated or rotated their chevron.
 * - `Skeleton` replaces `if (!ready) return null`, which rendered a blank
 *   screen while local storage was read. There was no spinner, skeleton, or
 *   `ActivityIndicator` anywhere in the app.
 * - `CountUp` animates a number to its new value instead of swapping it.
 * - `SavedPill` gives silent autosaves a visible acknowledgement.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { timing } from '../motion';
import { useTheme } from '../theme';
import { PressScale } from './pressable';
import { Text } from './text';

/**
 * A disclosure section. The chevron rotates rather than swapping glyph, and the
 * body fades/slides in while surrounding content reflows via `LinearTransition`.
 */
export function Collapsible({
  expanded,
  onToggle,
  header,
  children,
  style,
}: {
  expanded: boolean;
  onToggle: () => void;
  /** Rendered next to the chevron; usually a `Text` or a `Row`. */
  header: ReactNode;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const { spacing, colors, motion } = useTheme();
  const rotation = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    rotation.set(withTiming(expanded ? 1 : 0, timing(motion.enabled, motion.duration.base)));
  }, [expanded, rotation, motion.enabled, motion.duration.base]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get() * 90}deg` }],
  }));

  return (
    <Animated.View layout={motion.enabled ? LinearTransition : undefined} style={style}>
      <PressScale
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}
      >
        <View style={{ flex: 1 }}>{header}</View>
        <Animated.View style={chevronStyle}>
          <Text variant="subtitle" color="textMuted">
            ›
          </Text>
        </Animated.View>
      </PressScale>
      {expanded ? (
        <Animated.View
          entering={motion.enabled ? FadeIn.duration(motion.duration.base) : undefined}
          exiting={motion.enabled ? FadeOut.duration(motion.duration.fast) : undefined}
          style={{ marginTop: spacing.md, borderTopColor: colors.border }}
        >
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** A shimmering placeholder block, sized by its caller. */
export function Skeleton({
  height = 16,
  width = '100%',
  radius,
  style,
}: {
  height?: number;
  width?: ViewStyle['width'];
  radius?: number;
  style?: ViewStyle;
}) {
  const { colors, radii, motion } = useTheme();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    if (!motion.enabled) {
      pulse.set(0.7);
      return;
    }
    pulse.set(
      withRepeat(
        withSequence(
          withTiming(1, timing(true, motion.duration.slower)),
          withTiming(0.5, timing(true, motion.duration.slower)),
        ),
        -1,
        false,
      ),
    );
  }, [pulse, motion.enabled, motion.duration.slower]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));

  return (
    <Animated.View
      accessibilityElementsHidden
      style={[
        { height, width, borderRadius: radius ?? radii.sm, backgroundColor: colors.surfaceAlt },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** A page-level loading placeholder standing in for a card of content. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  const { spacing, radii, colors } = useTheme();
  return (
    <View
      style={{
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <Skeleton height={12} width="40%" />
      <Skeleton height={22} width="70%" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={14} width={i === lines - 1 ? '55%' : '100%'} />
      ))}
    </View>
  );
}

/**
 * A number that counts to its new value. Used where a figure is the payoff of
 * something the user just did (the debrief recap, progress headline stats).
 *
 * This is the one animation in the app that deliberately runs on the JS thread.
 * Reanimated drives styles, not text content, and the alternatives (animating a
 * `TextInput`'s value through `animatedProps`) trade a real hack for a saving
 * that does not apply here: it runs for under half a second, once, on a screen
 * that is not scrolling. It also stops immediately under reduce-motion.
 */
export function CountUp({
  value,
  format,
  variant = 'display',
  color = 'text',
  style,
}: {
  value: number;
  format?: (n: number) => string;
  variant?: React.ComponentProps<typeof Text>['variant'];
  color?: React.ComponentProps<typeof Text>['color'];
  style?: React.ComponentProps<typeof Text>['style'];
}) {
  const { motion } = useTheme();
  const [counted, setCounted] = useState(0);
  // Derived during render rather than pushed through state on the reduce-motion
  // path, so the effect never has to set state synchronously.
  const shown = motion.enabled ? counted : value;

  useEffect(() => {
    if (!motion.enabled) return;
    const duration = motion.duration.slower;
    const startedAt = Date.now();
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - (1 - t) ** 3; // decelerate, matching the easing tokens
      setCounted(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, motion.enabled, motion.duration.slower]);

  return (
    <Text variant={variant} color={color} style={style}>
      {(format ?? String)(shown)}
    </Text>
  );
}

/** A transient confirmation for actions that otherwise save silently. */
export function SavedPill({ visible, label = 'Saved' }: { visible: boolean; label?: string }) {
  const { colors, radii, spacing, motion } = useTheme();
  if (!visible) return null;
  return (
    <Animated.View
      entering={motion.enabled ? FadeIn.duration(motion.duration.fast) : undefined}
      exiting={motion.enabled ? FadeOut.duration(motion.duration.base) : undefined}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
        borderRadius: radii.pill,
        backgroundColor: colors.primarySoft,
        borderWidth: 1,
        borderColor: colors.primary,
      }}
    >
      <Text variant="caption" weight="bold" color="primaryTextSoft">
        ✓ {label}
      </Text>
    </Animated.View>
  );
}
