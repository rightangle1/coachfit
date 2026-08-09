/** Themed controls (ADR-0110): Chip (selectable tag), Stepper (big +/-), Meter (proportional bar). */

import { useEffect, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptic } from '../haptics';
import { timing } from '../motion';
import { useTheme } from '../theme';
import { FloatingEditField } from './floating-edit-field';
import { PressScale } from './pressable';
import { Text } from './text';
import type { ColorToken } from '../tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: ReactNode;
}) {
  const { colors, radii, spacing } = useTheme();
  return (
    <PressScale
      onPress={onPress}
      haptic="selection"
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: icon ? spacing.xs : 0,
        minHeight: 40,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
        borderRadius: radii.sm,
        backgroundColor: selected ? colors.primarySoft : colors.surfaceAlt,
        borderWidth: 1,
        borderColor: selected ? colors.primary : 'transparent',
      }}
    >
      {icon}
      <Text variant="label" weight="semibold" color={selected ? 'primaryTextSoft' : 'textMuted'}>
        {label}
      </Text>
    </PressScale>
  );
}

/** A spacious selection surface for choices that deserve a moment of focus,
 * such as the workout type in the builder. */
export function ChoiceTile({
  label,
  selected,
  onPress,
  icon,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: ReactNode;
  style?: ViewStyle;
}) {
  const { colors, radii, spacing } = useTheme();
  return (
    <PressScale
      onPress={onPress}
      haptic="selection"
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={label}
      style={[
        {
          minHeight: 88,
          padding: spacing.md,
          borderRadius: radii.md,
          backgroundColor: selected ? colors.primarySoft : colors.surface,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? colors.primary : colors.border,
          justifyContent: 'space-between',
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {icon ? <View pointerEvents="none">{icon}</View> : <View />}
        {selected ? <Text variant="label" color="primaryTextSoft" weight="bold">✓</Text> : null}
      </View>
      <Text variant="label" weight="semibold" color={selected ? 'primaryTextSoft' : 'textMuted'} style={{ marginTop: spacing.sm }}>
        {label}
      </Text>
    </PressScale>
  );
}

/** A full-width disclosure/action row used where a secondary button would
 * otherwise create unnecessary boxed chrome. */
export function ActionRow({
  label,
  description,
  icon,
  trailing,
  onPress,
  style,
}: {
  label: string;
  description?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const { colors, radii, spacing } = useTheme();
  return (
    <PressScale
      onPress={onPress}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        {
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radii.md,
          backgroundColor: colors.surfaceAlt,
        },
        style,
      ]}
    >
      {icon ? <View pointerEvents="none">{icon}</View> : null}
      <View style={{ flex: 1 }}>
        <Text variant="label" weight="semibold">{label}</Text>
        {description ? <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>{description}</Text> : null}
      </View>
      {trailing ?? <Text variant="subtitle" color="textFaint">›</Text>}
    </PressScale>
  );
}

/**
 * TabBar — segmented control for switching between views (distinct from Chip,
 * which is for multi-option filters/selections). The active segment reads as
 * a raised pill so it's unmistakably a tab, not a filter.
 *
 * The pill is a single element that slides between segments (ADR-0130) rather
 * than a background that blinks from one segment to the next, so the eye can
 * follow which tab it landed on.
 */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  style,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  style?: ViewStyle;
}) {
  const { colors, radii, spacing, shadows, motion } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.value === value));
  const gap = 4;
  const padding = 4;
  const segmentWidth = trackWidth > 0 ? (trackWidth - padding * 2 - gap * (tabs.length - 1)) / tabs.length : 0;
  const offset = useSharedValue(0);

  useEffect(() => {
    const next = padding + activeIndex * (segmentWidth + gap);
    offset.set(motion.enabled ? withSpring(next, motion.spring.snappy) : next);
  }, [activeIndex, segmentWidth, offset, motion.enabled, motion.spring.snappy]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width)}
      style={[
        {
          flexDirection: 'row',
          backgroundColor: colors.surfaceAlt,
          borderRadius: radii.lg,
          padding,
          gap,
        },
        style,
      ]}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: padding,
              bottom: padding,
              width: segmentWidth,
              borderRadius: radii.md,
              backgroundColor: colors.surface,
            },
            shadows.sm,
            pillStyle,
          ]}
        />
      ) : null}
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <PressScale
            key={tab.value}
            onPress={() => onChange(tab.value)}
            haptic="selection"
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            style={{
              flex: 1,
              paddingVertical: spacing.sm,
              borderRadius: radii.md,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="label" weight="semibold" color={active ? 'text' : 'textFaint'}>
              {tab.label}
            </Text>
          </PressScale>
        );
      })}
    </View>
  );
}

/**
 * Stepper — the value is the primary control: tap it to type an exact number
 * on the keypad. A small, grouped +/- sits to its left for quick nudges
 * without reaching for the keyboard. Used by the workout tracker (Phase 1).
 * `compact` shrinks it for inline use (e.g. one stepper per set row) without
 * losing tap-target comfort.
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  values,
  unit,
  displayValue,
  compact,
  style,
  topLabel,
}: {
  value: number | undefined;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** When set, +/- move between these discrete values (e.g. owned dumbbell
   * weights — ADR-0115) instead of stepping by `step`; `min`/`max` are ignored. */
  values?: number[];
  unit?: string;
  /** A human-friendly display for values stored as a number (for example, 218 seconds as 3:38). */
  displayValue?: string;
  compact?: boolean;
  style?: ViewStyle;
  /** Bold caption shown above the value instead of (or alongside) the `unit`
   * caption below it — e.g. "WEIGHT (LB)" so the field reads before it's tapped. */
  topLabel?: string;
}) {
  const { colors, radii, motion } = useTheme();
  // The +/- pair is a secondary, grouped control now that the value itself is
  // the primary (tap-to-type) interaction — it no longer needs to fill the row.
  const size = compact ? 22 : 28;
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min, n));
  const sortedValues = values && values.length ? values.slice().sort((a, b) => a - b) : undefined;
  const tick = useSharedValue(1);
  const tickStyle = useAnimatedStyle(() => ({ transform: [{ scale: tick.get() }] }));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function beginEdit() {
    setDraft(value != null ? String(value) : '');
    setEditing(true);
  }

  function commitEdit() {
    setEditing(false);
    const parsed = parseFloat(draft);
    if (Number.isFinite(parsed)) onChange(clamp(parsed));
  }

  function move(direction: 1 | -1): number {
    if (!sortedValues) {
      const current = value ?? min;
      if (value == null) return clamp(current);
      // A manually entered off-step load should join the next valid increment
      // when increased (e.g. 42 kg → 42.5 kg, not 45 kg). Decreasing mirrors
      // that behavior toward the prior valid increment.
      const stepped = direction > 0
        ? Math.ceil((current + 1e-9) / step) * step
        : Math.floor((current - 1e-9) / step) * step;
      return clamp(Math.round(stepped * 100) / 100);
    }
    if (value == null) return sortedValues[0];
    // The next owned value strictly beyond the current one in that direction —
    // not "nearest index then step," which would skip straight past the
    // smallest owned weight when starting from 0 (or any unowned value).
    if (direction > 0) {
      const next = sortedValues.find((v) => v > value);
      return next ?? sortedValues[sortedValues.length - 1];
    }
    const below = sortedValues.filter((v) => v < value);
    return below.length ? below[below.length - 1] : sortedValues[0];
  }

  function handle(direction: 1 | -1) {
    // The number itself pulses, so a change is visible even when the value
    // reads similarly (e.g. 40 → 42.5) and the eye is elsewhere.
    if (motion.enabled) {
      tick.set(withSequence(withSpring(1.12, motion.spring.snappy), withSpring(1, motion.spring.gentle)));
    }
    onChange(move(direction));
  }

  const btn = (label: string, direction: 1 | -1) => (
    <PressScale
      onPress={() => handle(direction)}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={direction > 0 ? 'Increase' : 'Decrease'}
      hitSlop={8}
      style={{
        width: size,
        height: size,
        borderRadius: radii.pill,
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="label" color="text" weight="bold">
        {label}
      </Text>
    </PressScale>
  );

  const valueBlock = (
    <Animated.View style={[{ alignItems: 'center' }, tickStyle]}>
      <Text variant={compact ? 'subtitle' : 'title'}>{displayValue ?? value ?? '—'}</Text>
      {unit ? (
        <Text variant="caption" color="textMuted">
          {unit}
        </Text>
      ) : null}
      <FloatingEditField
        visible={editing}
        label={topLabel ?? unit}
        value={draft}
        onChangeText={setDraft}
        onSubmit={commitEdit}
        keyboardType="decimal-pad"
      />
    </Animated.View>
  );

  const row = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: compact ? 'center' : 'flex-start',
          gap: compact ? 8 : 12,
        },
        topLabel ? undefined : style,
      ]}
    >
      <View style={{ flexDirection: 'column', gap: 4 }}>
        {btn('+', 1)}
        {btn('−', -1)}
      </View>
      {!editing ? (
        <PressScale onPress={beginEdit} accessibilityRole="button" accessibilityLabel="Edit value directly" haptic="selection" style={{ flex: compact ? undefined : 1, alignItems: compact ? 'center' : 'flex-start' }}>
          {valueBlock}
        </PressScale>
      ) : (
        valueBlock
      )}
    </View>
  );

  if (!topLabel) return row;

  return (
    <View style={[{ gap: 2 }, style]}>
      <Text variant="caption" color="textFaint" weight="bold">
        {topLabel}
      </Text>
      {row}
    </View>
  );
}

/**
 * A thin proportional fill bar — used for progress/strength/fatigue readouts.
 * The fill eases to its new width rather than jumping (ADR-0130), which is what
 * makes logging a set feel like it moved something.
 */
export function Meter({
  value,
  max,
  color = 'primary',
  style,
}: {
  value: number;
  max: number;
  color?: ColorToken;
  style?: ViewStyle;
}) {
  const { colors, radii, gradients, motion } = useTheme();
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  const width = useSharedValue(pct);

  useEffect(() => {
    width.set(withTiming(pct, timing(motion.enabled, motion.duration.base, 'decelerate')));
  }, [pct, width, motion.enabled, motion.duration.base]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.get()}%` }));
  // Only the brand fill gets the gradient; semantic tints (danger, warning…)
  // must stay their exact token color to remain readable as status.
  const gradient = color === 'primary' ? gradients.meterFill : null;

  return (
    <View
      style={[
        { height: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
        style,
      ]}
    >
      <Animated.View style={[{ height: '100%' }, fillStyle]}>
        {gradient ? (
          <LinearGradient
            colors={gradient.colors}
            locations={gradient.locations}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        ) : (
          <View style={{ flex: 1, backgroundColor: colors[color] }} />
        )}
      </Animated.View>
    </View>
  );
}

/**
 * A switch. The knob slides between ends rather than jumping from one flex
 * alignment to the other, which is how this was built before ADR-0130.
 */
export function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  const { colors, motion } = useTheme();
  const travel = 20; // track width − padding − knob width
  const offset = useSharedValue(value ? travel : 0);

  useEffect(() => {
    const next = value ? travel : 0;
    offset.set(motion.enabled ? withSpring(next, motion.spring.snappy) : next);
  }, [value, offset, motion.enabled, motion.spring.snappy]);

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));

  return (
    <PressScale
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      haptic="selection"
      onPress={() => onChange(!value)}
      style={{
        width: 52,
        height: 32,
        padding: 3,
        borderRadius: 16,
        justifyContent: 'center',
        backgroundColor: value ? colors.primary : colors.surfaceAlt,
        borderWidth: 1,
        borderColor: value ? colors.primary : colors.borderStrong,
      }}
    >
      <Animated.View
        style={[{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface }, knobStyle]}
      />
    </PressScale>
  );
}

/** The checkmark path, drawn in a 24×24 box. */
const CHECK_PATH = 'M5 12.5 L10 17.5 L19 7';
const CHECK_LENGTH = 26; // ~path length in viewBox units, for the draw-on dash

/**
 * A checkmark toggle — marks a set/exercise done at a glance.
 *
 * This is the most-tapped control in the app, and before ADR-0130 it had no
 * feedback beyond a color swap. Now the tick draws itself on, the box springs,
 * and a haptic confirms the tap without the user having to look.
 *
 * `shape` exists because the workout tracker wants a small square box inline in
 * a set row while standalone uses want a large round one; they used to be two
 * separate components that drifted apart.
 */
export function CheckToggle({
  checked,
  onPress,
  label,
  size = 44,
  shape = 'round',
  tone = 'primary',
}: {
  checked: boolean;
  onPress: () => void;
  label?: string;
  size?: number;
  shape?: 'round' | 'box';
  tone?: 'primary' | 'success';
}) {
  const { colors, radii, motion } = useTheme();
  const progress = useSharedValue(checked ? 1 : 0);
  const fill = tone === 'success' ? colors.success : colors.primary;

  useEffect(() => {
    progress.set(
      withTiming(checked ? 1 : 0, timing(motion.enabled, motion.duration.slow, 'emphasized')),
    );
  }, [checked, progress, motion.enabled, motion.duration.slow]);

  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_LENGTH * (1 - progress.get()),
  }));

  return (
    <PressScale
      onPress={() => {
        // Fires on the way in as well as out: confirming a set is a commitment,
        // and the buzz is the confirmation when the user isn't looking.
        haptic('impact');
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'round' ? radii.pill : radii.sm,
        backgroundColor: checked ? fill : colors.surfaceAlt,
        borderWidth: shape === 'box' ? 2 : 1,
        borderColor: checked ? fill : colors.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24">
        <AnimatedPath
          d={CHECK_PATH}
          stroke={checked ? colors.primaryText : colors.textFaint}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={CHECK_LENGTH}
          animatedProps={checkProps}
        />
      </Svg>
    </PressScale>
  );
}
