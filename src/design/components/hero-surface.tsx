/**
 * HeroScrim (ADR-0130) — the wash that keeps text legible over hero
 * photography.
 *
 * This replaces the flat `backgroundColor: colors.heroOverlay` views that used
 * to be hand-written in `GoalHero`, `GoalChoiceCard`, `ExerciseHero`, and the
 * launch screen. A single opacity applied across the whole image dims the
 * subject as much as the empty corners, which is why the photos read as
 * gray-washed. A bottom-weighted gradient spends its darkness where the text
 * actually sits and leaves the top of the frame nearly untouched.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';

export function HeroScrim({
  variant = 'bottom',
  style,
}: {
  /** `bottom` washes upward for bottom-anchored copy; `top` fades downward
   *  from the very top edge, for status-bar / eyebrow legibility. */
  variant?: 'bottom' | 'top';
  style?: ViewStyle;
}) {
  const { gradients } = useTheme();
  const gradient = variant === 'top' ? gradients.heroScrimTop : gradients.heroScrim;
  return (
    <LinearGradient
      pointerEvents="none"
      colors={gradient.colors}
      locations={gradient.locations}
      style={[{ position: 'absolute', inset: 0 }, style]}
    />
  );
}

/**
 * A full hero stage: the scrim plus an optional top fade, sized to fill its
 * parent. Use inside any `ImageBackground`/`Image` hero so every one of them
 * gets the same lighting treatment.
 */
export function HeroWash({ topFade }: { topFade?: boolean }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      <HeroScrim />
      {topFade ? <HeroScrim variant="top" style={{ bottom: undefined, height: '38%' }} /> : null}
    </View>
  );
}
