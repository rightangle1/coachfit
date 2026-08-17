/** A small illustrated medal for the achievements trophy case. */

import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { timing } from '../motion';
import { useTheme } from '../theme';
import { Text } from './text';
import { Meter } from './controls';
import type { ColorToken } from '../tokens';

// `importantForAccessibility` is RN-only — react-native-web forwards unknown
// props straight to the DOM `<svg>`, which warns on it. `accessible={false}`
// alone covers web (translated to aria-hidden).
const HIDDEN_DECORATIVE_SVG_PROPS = Platform.OS === 'web' ? {} : { importantForAccessibility: 'no-hide-descendants' as const };

export interface AchievementBadgeProps {
  id?: string;
  title: string;
  subtitle: string;
  locked: boolean;
  tier?: 'bronze' | 'silver' | 'gold';
  progress?: { current: number; target: number };
}

const TIER_TOKEN: Record<'bronze' | 'silver' | 'gold', ColorToken> = {
  bronze: 'tierBronze',
  silver: 'tierSilver',
  gold: 'tierGold',
};

type MedalMark = 'trophy' | 'flame' | 'bolt' | 'barbell' | 'compass' | 'arrow' | 'star';

function medalMark(id = ''): MedalMark {
  if (id.includes('pr-') || id.includes('tonnage')) return id.includes('tonnage') ? 'barbell' : 'trophy';
  if (id.includes('streak')) return 'flame';
  if (id.includes('endurance') || id.includes('cardio')) return 'bolt';
  if (id.includes('workout-style')) return 'compass';
  if (id.includes('comeback')) return 'arrow';
  return 'star';
}

/**
 * A highlight that sweeps across an unlocked badge once when it mounts, so a
 * trophy case that the athlete has just added to reads as freshly minted rather
 * than static (ADR-0130). Locked badges never sweep.
 */
function BadgeShine() {
  const { gradients, motion } = useTheme();
  const sweep = useSharedValue(-1);

  useEffect(() => {
    if (!motion.enabled) return;
    sweep.set(withDelay(160, withTiming(1.6, timing(true, 900, 'standard'))));
  }, [sweep, motion.enabled]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: sweep.get() * 156 }, { rotate: '18deg' }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -20, bottom: -20, width: 54 }, style]}>
      <LinearGradient
        colors={gradients.shine.colors}
        locations={gradients.shine.locations}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

function MedalIllustration({ mark, accent, muted }: { mark: MedalMark; accent: string; muted: string }) {
  const dark = muted;
  return (
    <Svg width={68} height={62} viewBox="0 0 68 62" accessible={false} {...HIDDEN_DECORATIVE_SVG_PROPS}>
      <Path d="M18 2h14l4 18-11 8L14 20z" fill={accent} opacity={0.72} />
      <Path d="M36 2h14l4 18-11 8-11-8z" fill={accent} opacity={0.42} />
      <Circle cx="34" cy="36" r="22" fill={accent} />
      <Circle cx="34" cy="36" r="17" fill={muted} opacity={0.24} />
      {mark === 'trophy' && <><Path d="M25 27h18v6c0 6-4 10-9 10s-9-4-9-10z" fill={dark} /><Path d="M25 29h-5c0 6 2 9 7 9M43 29h5c0 6-2 9-7 9M34 43v5m-7 0h14" stroke={dark} strokeWidth={3} strokeLinecap="round" fill="none" /></>}
      {mark === 'flame' && <Path d="M35 19c4 8-2 10 3 15 2-2 4-5 4-9 6 7 5 19-8 21-11-2-13-12-7-20 1 7 5 7 8-7z" fill={dark} />}
      {mark === 'bolt' && <Path d="m38 18-13 18h9l-3 12 13-19h-9z" fill={dark} />}
      {mark === 'barbell' && <><Rect x="19" y="32" width="30" height="7" rx="3.5" fill={dark} /><Rect x="15" y="27" width="5" height="17" rx="2" fill={dark} /><Rect x="48" y="27" width="5" height="17" rx="2" fill={dark} /><Rect x="10" y="29" width="4" height="13" rx="2" fill={dark} /><Rect x="54" y="29" width="4" height="13" rx="2" fill={dark} /></>}
      {mark === 'compass' && <><Circle cx="34" cy="36" r="12" stroke={dark} strokeWidth={3} fill="none" /><Path d="m39 29-3 9-9 4 4-9z" fill={dark} /></>}
      {mark === 'arrow' && <Path d="M24 40c2 6 12 7 17 1m0 0-1 7m1-7-7 1M25 29c3-6 12-7 17-1m0 0-1-7m1 7-7-1" stroke={dark} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />}
      {mark === 'star' && <Path d="m34 21 4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z" fill={dark} />}
    </Svg>
  );
}

export function AchievementBadge({ id, title, subtitle, locked, tier, progress }: AchievementBadgeProps) {
  const { colors, radii, spacing, shadows } = useTheme();
  const accentToken: ColorToken = tier ? TIER_TOKEN[tier] : 'primary';
  const accent = locked ? colors.textFaint : colors[accentToken];

  return (
    <View
      style={[
        {
          width: 156,
          minHeight: 184,
          padding: spacing.md,
          borderRadius: radii.xl,
          backgroundColor: locked ? colors.surfaceAlt : colors.surface,
          borderWidth: 1,
          borderColor: locked ? colors.border : accent,
          opacity: locked ? 0.66 : 1,
          overflow: 'hidden',
          gap: 4,
        },
        !locked && shadows.sm,
      ]}
    >
      <View style={{ position: 'absolute', top: -30, right: -26, width: 88, height: 88, borderRadius: radii.pill, backgroundColor: accent, opacity: 0.12 }} />
      {!locked ? <BadgeShine /> : null}
      <MedalIllustration mark={medalMark(id)} accent={accent} muted={colors.surface} />
      <Text variant="label" weight="semibold" color={locked ? 'textMuted' : 'text'} numberOfLines={2}>
        {title}
      </Text>
      <Text variant="caption" color="textFaint" numberOfLines={3}>
        {subtitle}
      </Text>
      {progress ? (
        <Meter
          value={progress.current}
          max={progress.target}
          color={locked ? 'textFaint' : accentToken}
          style={{ marginTop: spacing.xs }}
        />
      ) : null}
    </View>
  );
}
