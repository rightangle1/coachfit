import { Image, type ImageSourcePropType, View } from 'react-native';

import { MUSCLE_GROUP_LABELS } from '@/app-lib/options';
import type { MuscleGroup } from '@/domain/types';
import { useTheme } from '../theme';

/**
 * Deliberately illustrated rather than diagrammatic: each primary muscle gets a
 * purpose-composed close crop so the visual focus reads at exercise-card size.
 */
const MUSCLE_IMAGES: Record<MuscleGroup, ImageSourcePropType> = {
  chest: require('../../../assets/images/muscles/chest.png'),
  back: require('../../../assets/images/muscles/back.png'),
  shoulders: require('../../../assets/images/muscles/shoulders.png'),
  biceps: require('../../../assets/images/muscles/biceps.png'),
  triceps: require('../../../assets/images/muscles/triceps.png'),
  forearms: require('../../../assets/images/muscles/forearms.png'),
  quads: require('../../../assets/images/muscles/quads.png'),
  hamstrings: require('../../../assets/images/muscles/hamstrings.png'),
  glutes: require('../../../assets/images/muscles/glutes.png'),
  calves: require('../../../assets/images/muscles/calves.png'),
  abs: require('../../../assets/images/muscles/abs.png'),
  obliques: require('../../../assets/images/muscles/obliques.png'),
  lower_back: require('../../../assets/images/muscles/lower_back.png'),
  neck: require('../../../assets/images/muscles/neck.png'),
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
