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
  showClip = true,
  showStillWithClip = true,
}: {
  pattern: MovementPattern;
  media?: ExerciseMedia;
  /** Set false to render only the still/illustration and never embed the
   *  video — used for the catalog's main exercise view, where the video is
   *  reserved for the dedicated "How To" preview instead. */
  showClip?: boolean;
  /** Set false to never show a still above the clip, even a form-guide one —
   *  used for the "How To" video preview, which should lead with just the
   *  video. */
  showStillWithClip?: boolean;
}) {
  const { colors, radii, spacing } = useTheme();
  const still = media?.stills?.[0];
  const clip = showClip ? media?.clips?.[0] : undefined;
  // Form-guide stills complement clips: they give the athlete a quick,
  // scannable alignment reference before the fuller video explanation.
  const showStill = Boolean(still && (!clip || (showStillWithClip && still.role === 'form-guide')));

  return (
    <View style={{ gap: spacing.xs }}>
      {showStill && still ? (
        <Image
          source={still.file}
          style={{
            width: '100%',
            height: still.role === 'form-guide' ? 360 : 180,
            borderRadius: radii.lg,
            backgroundColor: colors.surfaceAlt,
          }}
          contentFit={still.role === 'form-guide' ? 'contain' : 'cover'}
          accessibilityLabel={still.role === 'form-guide' ? 'Yoga pose alignment guide' : undefined}
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
