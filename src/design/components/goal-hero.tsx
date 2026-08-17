import { ImageBackground } from 'expo-image';
import { type ReactNode } from 'react';
import { Pressable, View, type ImageSourcePropType, type ViewStyle } from 'react-native';
import { ChoiceTile } from './controls';

import { GOAL_STORIES } from '@/app-lib/personalization';
import type { Modality } from '@/domain/types';
import { useTheme } from '../theme';
import { toneForModality } from '../context-tone';
import type { ContextTone } from '../tokens';
import { HeroScrim } from './hero-surface';
import { Icon, type IconName } from './icon';
import { Text } from './text';

const GOAL_HERO_IMAGES: Record<Modality, number> = {
  strength: require('../../../assets/images/goals/strength-hero.webp'),
  cardio: require('../../../assets/images/goals/endurance-hero.webp'),
  mobility: require('../../../assets/images/goals/mobility-hero.webp'),
  general: require('../../../assets/images/goals/fat-burn-hero.webp'),
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
  imageOverride,
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
  /** Route-specific editorial art; falls back to the stable goal asset. */
  imageOverride?: ImageSourcePropType;
}) {
  const { colors, radii, spacing, shadows } = useTheme();
  const story = GOAL_STORIES[goal];
  return (
    <ImageBackground
      source={imageOverride ?? GOAL_HERO_IMAGES[goal]}
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

/** A spacious, single-select choice card for a goal-like option — used for
 * the onboarding primary-goal picker. Takes explicit visual props rather than
 * a `Modality` key so it can represent taxonomies broader than the 4-value
 * `Modality` (e.g. the 5-value `PrimaryGoalId`). */
export function GoalChoiceCard({
  image,
  icon,
  tone,
  label,
  promise,
  selected,
  onPress,
}: {
  image: ImageSourcePropType;
  icon: IconName;
  tone: ContextTone;
  label: string;
  promise: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, radii, spacing } = useTheme();
  const contextual = colors.tones[tone];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        height: 138,
        borderRadius: radii.xl,
        overflow: 'hidden',
        borderWidth: selected ? 3 : 1,
        borderColor: selected ? contextual.border : colors.heroBorder,
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <ImageBackground source={image} contentFit="cover" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <HeroScrim />
        <View style={{ padding: spacing.md, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text variant="subtitle" color="heroText">{label}</Text>
            <Text variant="caption" color="heroMuted" style={{ marginTop: 2 }}>{promise}</Text>
          </View>
          <View style={{ width: 32, height: 32, borderRadius: radii.pill, backgroundColor: selected ? contextual.surface : colors.heroPill, borderWidth: selected ? 1 : 0, borderColor: contextual.border, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={selected ? 'selected' : icon} size={17} color="heroText" tint={selected ? contextual.text : undefined} />
          </View>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

/**
 * Compact image-backed tile for the onboarding subtype grid (e.g. "Max
 * Strength", "Build Muscle"). `image` is optional and degrades gracefully to
 * the plain tone-colored `ChoiceTile` look when a subtype has no art yet —
 * callers can roll art out incrementally without any tile going blank.
 */
export function SubtypeChoiceCard({
  image,
  label,
  tone,
  selected,
  onPress,
  style,
}: {
  image?: ImageSourcePropType;
  label: string;
  tone?: ContextTone;
  selected: boolean;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const { colors, radii, spacing } = useTheme();
  const contextual = tone ? colors.tones[tone] : null;

  if (!image) {
    return (
      <ChoiceTile
        label={label}
        selected={selected}
        onPress={onPress}
        tone={tone}
        style={{ minHeight: 104, ...style }}
      />
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          minHeight: 104,
          borderRadius: radii.md,
          overflow: 'hidden',
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? (contextual?.border ?? colors.heroBorder) : colors.heroBorder,
          opacity: pressed ? 0.82 : 1,
        },
        style,
      ]}
    >
      <ImageBackground source={image} contentFit="cover" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <HeroScrim />
        <View style={{ padding: spacing.sm, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.xs }}>
          <Text variant="label" color="heroText" weight="semibold" style={{ flex: 1 }}>{label}</Text>
          {selected ? (
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: radii.pill,
                backgroundColor: contextual?.surface ?? colors.heroPill,
                borderWidth: 1,
                borderColor: contextual?.border ?? colors.heroBorder,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="selected" size={13} color="heroText" tint={contextual?.text} />
            </View>
          ) : null}
        </View>
      </ImageBackground>
    </Pressable>
  );
}
