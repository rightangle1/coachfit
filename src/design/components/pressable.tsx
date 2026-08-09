/**
 * PressScale (ADR-0130) — the app's one press-feedback primitive.
 *
 * Before this, every interactive surface hand-wrote
 * `({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })` — about thirty copies
 * with three different opacity values and no scale anywhere, which is why
 * taps felt flat. This springs the control under the thumb, reads the `press`
 * token for its values, and optionally fires a haptic.
 *
 * It respects reduce-motion: with motion disabled the scale is pinned to 1 and
 * only the opacity dip remains, so the control still acknowledges the touch.
 */

import { forwardRef, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptic, type HapticRole } from '../haptics';
import { timing } from '../motion';
import { useTheme } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  /** A plain style object — the `({ pressed }) => …` form is unnecessary here,
   *  since the press state is expressed as motion rather than as style. */
  style?: StyleProp<ViewStyle>;
  /** Fires on press-in, so the feedback lands with the finger, not after it. */
  haptic?: HapticRole;
  /** Override for oversized targets, where the default 0.97 reads as too much. */
  scaleTo?: number;
}

export const PressScale = forwardRef<React.ComponentRef<typeof Pressable>, PressScaleProps>(
  function PressScale({ children, style, haptic: hapticRole, scaleTo, onPressIn, onPressOut, disabled, ...rest }, ref) {
    const { motion, press } = useTheme();
    const scale = useSharedValue(1);
    const opacity = useSharedValue(1);
    const target = scaleTo ?? press.scale;

    // Only animate opacity for the press-feedback dip — disabled dimming is a
    // caller concern (e.g. Button's `opacity: disabled ? 0.5 : 1`), so when
    // disabled we drop out of the style array entirely rather than override it.
    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.get() }],
      ...(disabled ? {} : { opacity: opacity.get() }),
    }));

    return (
      <AnimatedPressable
        ref={ref}
        disabled={disabled}
        style={[style, animatedStyle]}
        onPressIn={(event) => {
          if (!disabled) {
            scale.set(
              motion.enabled ? withTiming(target, timing(true, motion.duration.fast, 'standard')) : 1,
            );
            opacity.set(withTiming(press.opacity, timing(motion.enabled, motion.duration.fast)));
            if (hapticRole) haptic(hapticRole);
          }
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          scale.set(motion.enabled ? withSpring(1, motion.spring.snappy) : 1);
          opacity.set(withTiming(1, timing(motion.enabled, motion.duration.base)));
          onPressOut?.(event);
        }}
        {...rest}
      >
        {children}
      </AnimatedPressable>
    );
  },
);
