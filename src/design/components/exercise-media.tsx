/**
 * ExerciseMediaCard (ADR-0302) — shows the best available visual for an
 * exercise: a curated still if one exists, otherwise the self-made
 * `MovementIllustration` fallback (ADR-0301). A clip, if present, streams
 * inline via `VideoEmbed` (ADR-0303) with its creator/title always visible —
 * the only media surface that touches the network, and only when rendered.
 */

import { Image } from 'expo-image';
import { View } from 'react-native';

import { useTheme } from '../theme';
import { MovementIllustration } from './movement-illustration';
import { Text } from './text';
import { VideoEmbed } from './video-embed';
import type { ExerciseMedia, MovementPattern } from '@/domain/types';

function needsAttribution(license: string): boolean {
  return license === 'cc-by' || license === 'cc-by-sa';
}

export function ExerciseMediaCard({
  pattern,
  media,
}: {
  pattern: MovementPattern;
  media?: ExerciseMedia;
}) {
  const { colors, radii, spacing } = useTheme();
  const still = media?.stills?.[0];
  const clip = media?.clips?.[0];
  // A clip is the richer form guide. Showing the still above it makes the
  // guide feel repetitive and pushes the actual instruction out of view.
  const showStill = Boolean(still && !clip);

  return (
    <View style={{ gap: spacing.xs }}>
      {showStill && still ? (
        <Image
          source={still.file}
          style={{
            width: '100%',
            height: 180,
            borderRadius: radii.lg,
            backgroundColor: colors.surfaceAlt,
          }}
          contentFit="cover"
        />
      ) : !clip ? (
        <MovementIllustration pattern={pattern} size={88} />
      ) : null}

      {showStill && still && needsAttribution(still.license) && (
        <Text variant="caption" color="textFaint">
          Photo: {still.attribution}
        </Text>
      )}

      {clip && (
        <View style={{ gap: spacing.xs }}>
          <VideoEmbed url={clip.url} />
          <Text variant="caption" color="textFaint">
            {clip.title} — {clip.creator}
          </Text>
        </View>
      )}
    </View>
  );
}
