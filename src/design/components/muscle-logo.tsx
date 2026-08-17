import { Image, type ImageSourcePropType, View } from 'react-native';

import { MUSCLE_GROUP_LABELS } from '@/app-lib/options';
import type { MuscleGroup } from '@/domain/types';
import { useTheme } from '../theme';

/**
 * Deliberately illustrated rather than diagrammatic: each primary muscle gets a
 * purpose-composed close crop so the visual focus reads at exercise-card size.
 */
const MUSCLE_IMAGES: Record<MuscleGroup, ImageSourcePropType> = {
  chest: require('../../../assets/images/muscles/chest.webp'),
  back: require('../../../assets/images/muscles/back.webp'),
  shoulders: require('../../../assets/images/muscles/shoulders.webp'),
  biceps: require('../../../assets/images/muscles/biceps.webp'),
  triceps: require('../../../assets/images/muscles/triceps.webp'),
  forearms: require('../../../assets/images/muscles/forearms.webp'),
  quads: require('../../../assets/images/muscles/quads.webp'),
  hamstrings: require('../../../assets/images/muscles/hamstrings.webp'),
  glutes: require('../../../assets/images/muscles/glutes.webp'),
  calves: require('../../../assets/images/muscles/calves.webp'),
  abs: require('../../../assets/images/muscles/abs.webp'),
  obliques: require('../../../assets/images/muscles/obliques.webp'),
  lower_back: require('../../../assets/images/muscles/lower_back.webp'),
  neck: require('../../../assets/images/muscles/neck.webp'),
};

export function MuscleLogo({ groups, size = 82 }: { groups: MuscleGroup[]; size?: number }) {
  const { colors, radii } = useTheme();
  const focus = groups[0] ?? 'chest';
  const label = groups.length
    ? `Muscle focus: ${groups.map((group) => MUSCLE_GROUP_LABELS[group]).join(', ')}`
    : 'Muscle focus';

  return (
    <View style={{ width: size, height: size, borderRadius: radii.lg, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
      <Image
        source={MUSCLE_IMAGES[focus]}
        accessibilityLabel={label}
        accessibilityRole="image"
        style={{ width: size, height: size }}
        resizeMode="cover"
      />
    </View>
  );
}
