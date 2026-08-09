/**
 * Motion helpers (ADR-0130) — turns the pure-data `motion` tokens into the
 * Reanimated values components actually pass to `withTiming` / `withSpring`.
 *
 * This is the only place easing functions are constructed, so the app has one
 * timing vocabulary. Screens should reach for `useMotion()` (which respects the
 * user's reduce-motion setting) rather than importing from here directly.
 */

import { Easing, type EasingFunctionFactory } from 'react-native-reanimated';
import { motion, type EasingToken } from './tokens';

const bezier = ([x1, y1, x2, y2]: readonly number[]) => Easing.bezier(x1, y1, x2, y2);

/** Easing functions built once from the token control points. */
export const ease: Record<EasingToken, EasingFunctionFactory> = {
  standard: bezier(motion.easing.standard),
  decelerate: bezier(motion.easing.decelerate),
  accelerate: bezier(motion.easing.accelerate),
  emphasized: bezier(motion.easing.emphasized),
};

export interface TimingOptions {
  duration: number;
  easing: EasingFunctionFactory;
}

/**
 * A `withTiming` config from tokens. When motion is disabled (reduce-motion),
 * duration collapses to 0 so the value still lands — it just gets there
 * instantly. Nothing needs a separate no-animation code path.
 */
export function timing(
  enabled: boolean,
  duration: number,
  easingToken: EasingToken = 'standard',
): TimingOptions {
  return { duration: enabled ? duration : 0, easing: ease[easingToken] };
}
