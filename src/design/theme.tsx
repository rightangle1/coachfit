/**
 * ThemeProvider + useTheme (ADR-0110). Resolves the active color scheme from the
 * OS, with an optional in-app override for a future theme toggle. Default: light.
 * Every component reads colors/scales from here — no hard-coded hex in screens.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import {
  palettes,
  spacing,
  radii,
  typography,
  fontWeight,
  shadows,
  motion,
  press,
  gradients,
  type ColorScheme,
  type GradientScale,
  type Palette,
  type ShadowScale,
} from './tokens';

export type SchemePreference = ColorScheme | 'system';

/**
 * The motion tokens plus `enabled`, which is false when the OS reduce-motion
 * setting is on. Animated components must gate on it — see `timing()` in
 * `./motion`, which collapses duration to 0 rather than branching.
 */
export interface ThemeMotion extends Omit<typeof motion, 'easing'> {
  easing: typeof motion.easing;
  enabled: boolean;
}

export interface Theme {
  scheme: ColorScheme;
  colors: Palette;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  fontWeight: typeof fontWeight;
  shadows: ShadowScale;
  motion: ThemeMotion;
  press: typeof press;
  gradients: GradientScale;
}

interface ThemeContextValue extends Theme {
  preference: SchemePreference;
  setPreference: (p: SchemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Reads the OS "reduce motion" setting. Deliberately built on React Native's
 * own `AccessibilityInfo` rather than Reanimated's `useReducedMotion`: this is
 * an accessibility fact about the device, not an animation-library concept, and
 * keeping it here means the theme — which nearly every module imports — does
 * not drag in the animation runtime. (`react-native-web` maps this to
 * `prefers-reduced-motion`, so the web target is covered too.)
 */
function useReducedMotionPreference(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const reducedMotion = useReducedMotionPreference();
  const [preference, setPreference] = useState<SchemePreference>('system');

  const systemScheme: ColorScheme = system === 'dark' ? 'dark' : 'light';
  const scheme: ColorScheme = preference === 'system' ? systemScheme : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      scheme,
      colors: palettes[scheme],
      spacing,
      radii,
      typography,
      fontWeight,
      shadows: shadows[scheme],
      motion: { ...motion, enabled: !reducedMotion },
      press,
      gradients: gradients[scheme],
      preference,
      setPreference,
    }),
    [scheme, preference, reducedMotion],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
