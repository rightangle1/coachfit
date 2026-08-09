import { ImageBackground } from 'expo-image';
import { type ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { GOAL_STORIES } from '@/app-lib/personalization';
import type { Modality } from '@/domain/types';
import { useTheme } from '../theme';
import { HeroScrim } from './hero-surface';
import { Icon } from './icon';
import { Text } from './text';

const GOAL_HERO_IMAGES: Record<Modality, number> = {
  strength: require('../../../assets/images/goals/strength-hero.png'),
  cardio: require('../../../assets/images/goals/endurance-hero.png'),
  mobility: require('../../../assets/images/goals/mobility-hero.png'),
  general: require('../../../assets/images/goals/fat-burn-hero.png'),
};

const GOAL_CARD_IMAGES: Record<Modality, number> = {
  strength: require('../../../assets/images/goals/strength-card.png'),
  cardio: require('../../../assets/images/goals/endurance-card.png'),
  mobility: require('../../../assets/images/goals/mobility-card.png'),
  general: require('../../../assets/images/goals/fat-burn-card.png'),
};

const GOAL_ICONS = {
  strength: 'goalStrength',
  cardio: 'goalCardio',
  mobility: 'goalMobility',
  general: 'goalBurn',
} as const;

export function GoalHero({
  goal,
  eyebrow = 'YOUR PERSONAL FOCUS',
  value,
  valueLabel,
  detail,
  children,
  compact = false,
  style,
}: {
  goal: Modality;
  eyebrow?: string;
  value?: string;
  valueLabel?: string;
  detail?: string;
  /** Replaces the standard goal copy while retaining the themed image shell. */
  children?: ReactNode;
  compact?: boolean;
  style?: ViewStyle;
}) {
  const { colors, radii, spacing, shadows } = useTheme();
  const story = GOAL_STORIES[goal];
  return (
    <ImageBackground
      source={GOAL_HERO_IMAGES[goal]}
      contentFit="cover"
      contentPosition="center"
      transition={220}
      accessibilityLabel={`${story.label} training`}
      imageStyle={{ borderRadius: radii.xxl }}
      style={[
        {
          minHeight: compact ? 210 : 286,
          borderRadius: radii.xxl,
          overflow: 'hidden',
          justifyContent: 'flex-end',
        },
        shadows.md,
        style,
      ]}
    >
      <HeroScrim />
      <View style={{ padding: compact ? spacing.lg : spacing.xl, gap: spacing.sm }}>
        {children ?? <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: radii.pill,
                backgroundColor: colors.heroPill,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={GOAL_ICONS[goal]} size={18} color="heroText" />
            </View>
            <Text variant="caption" color="heroText" weight="bold">{eyebrow}</Text>
          </View>
          <Text variant={compact ? 'title' : 'display'} color="heroText">{story.headline}</Text>
          <Text variant="body" color="heroMuted">{story.promise}</Text>
          {value != null && valueLabel ? (
            <View
              style={{
                marginTop: spacing.sm,
                paddingTop: spacing.md,
                borderTopWidth: 1,
                borderTopColor: colors.heroBorder,
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: spacing.md,
              }}
            >
              <View>
                <Text variant="display" color="heroText">{value}</Text>
                <Text variant="caption" color="heroMuted" weight="bold">{valueLabel}</Text>
              </View>
              {detail ? <Text variant="caption" color="heroMuted" style={{ flex: 1, textAlign: 'right' }}>{detail}</Text> : null}
            </View>
          ) : null}
        </>}
      </View>
    </ImageBackground>
  );
}

export function GoalChoiceCard({
  goal,
  selected,
  selectionLabel,
  onPress,
}: {
  goal: Modality;
  selected: boolean;
  selectionLabel?: string;
  onPress: () => void;
}) {
  const { colors, radii, spacing } = useTheme();
  const story = GOAL_STORIES[goal];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={story.label}
      style={({ pressed }) => ({
        height: 138,
        borderRadius: radii.xl,
        overflow: 'hidden',
        borderWidth: selected ? 3 : 1,
        borderColor: selected ? colors.primary : colors.heroBorder,
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <ImageBackground source={GOAL_CARD_IMAGES[goal]} contentFit="cover" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <HeroScrim />
        <View style={{ padding: spacing.md, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            {selectionLabel ? <Text variant="caption" color="heroText" weight="bold">{selectionLabel}</Text> : null}
            <Text variant="subtitle" color="heroText">{story.label}</Text>
            <Text variant="caption" color="heroMuted" style={{ marginTop: 2 }}>{story.promise}</Text>
          </View>
          <View style={{ width: 32, height: 32, borderRadius: radii.pill, backgroundColor: selected ? colors.primary : colors.heroPill, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={selected ? 'selected' : GOAL_ICONS[goal]} size={17} color="heroText" />
          </View>
        </View>
      </ImageBackground>
    </Pressable>
  );
}
