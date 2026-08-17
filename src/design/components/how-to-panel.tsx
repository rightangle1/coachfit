/**
 * HowToPanel — the exercise "how to" disclosure content: media (clip if one
 * exists, else a still, else the MovementIllustration fallback) alongside the
 * numbered steps. Side by side once there's room; stacked below a phone-width
 * breakpoint, where squeezing a 16:9 video and step text into half the screen
 * would fail the "readable at arm's length" bar (CLAUDE.md §9).
 */

import { useWindowDimensions, View } from 'react-native';

import { useTheme } from '../theme';
import { ExerciseMediaCard } from './exercise-media';
import { SheetModal } from './sheet-modal';
import { Text } from './text';
import type { Exercise, ExerciseMedia, MovementPattern } from '@/domain/types';

const TWO_COLUMN_MIN_WIDTH = 480;

/** Media on one side, numbered steps on the other — the shared layout for
 * "how to perform this" content, side by side once there's room, stacked
 * below a phone-width breakpoint (CLAUDE.md §9). */
export function ExerciseStepsMedia({
  pattern,
  media,
  steps,
  showClip = true,
  requireImage = false,
}: {
  pattern: MovementPattern;
  media?: ExerciseMedia;
  steps: string[];
  /** Forwarded to `ExerciseMediaCard` — false keeps this to a still/
   *  illustration, reserving the video for the dedicated "How To" preview. */
  showClip?: boolean;
  /** When true, skip the media column entirely (steps take the full width)
   *  unless a curated still actually exists — no generic illustration
   *  filler. */
  requireImage?: boolean;
}) {
  const { spacing } = useTheme();
  const { width } = useWindowDimensions();
  const twoColumn = width >= TWO_COLUMN_MIN_WIDTH;
  const hasStill = Boolean(media?.stills?.length);
  const showMedia = !requireImage || hasStill;

  if (!showMedia) {
    return (
      <View style={{ gap: spacing.xs }}>
        {steps.map((step, i) => (
          <Text key={i} variant="body">
            {i + 1}. {step}
          </Text>
        ))}
      </View>
    );
  }

  return (
    <View
      style={
        twoColumn
          ? { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }
          : { gap: spacing.md }
      }
    >
      <View style={twoColumn ? { flex: 1 } : undefined}>
        <ExerciseMediaCard pattern={pattern} media={media} showClip={showClip} />
      </View>
      <View style={[{ gap: spacing.xs }, twoColumn ? { flex: 1 } : undefined]}>
        {steps.map((step, i) => (
          <Text key={i} variant="body">
            {i + 1}. {step}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function HowToPanel({
  pattern,
  media,
  description,
  steps,
}: {
  pattern: MovementPattern;
  media?: ExerciseMedia;
  description: string;
  steps: string[];
}) {
  const { spacing } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="body" color="textMuted">
        {description}
      </Text>
      <ExerciseStepsMedia pattern={pattern} media={media} steps={steps} />
    </View>
  );
}

/**
 * The "FORM GUIDE" bottom sheet — one implementation shared by every place an
 * athlete can open an exercise's how-to (live workout, pre-workout preview,
 * exercise info view), instead of each screen re-composing its own Modal.
 */
export function HowToSheet({
  visible,
  onClose,
  name,
  exercise,
}: {
  visible: boolean;
  onClose: () => void;
  name: string;
  exercise?: Pick<Exercise, 'movementPattern' | 'media' | 'description' | 'steps'>;
}) {
  return (
    <SheetModal visible={visible} onClose={onClose} eyebrow="FORM GUIDE" title={name} closeLabel="Close form guide">
      {exercise && (
        <HowToPanel pattern={exercise.movementPattern} media={exercise.media} description={exercise.description} steps={exercise.steps} />
      )}
    </SheetModal>
  );
}

/**
 * A lightweight video-first preview — opened from the catalog's "How To"
 * action so browsing an exercise leads with just its demo clip, no still
 * shown above it and no step-by-step detail. In-workout/preview flows skip
 * this and open `HowToSheet` directly.
 */
export function ExerciseVideoPreviewSheet({
  visible,
  onClose,
  name,
  exercise,
}: {
  visible: boolean;
  onClose: () => void;
  name: string;
  exercise?: Pick<Exercise, 'movementPattern' | 'media'>;
}) {
  return (
    <SheetModal visible={visible} onClose={onClose} eyebrow="PREVIEW" title={name} closeLabel="Close video preview">
      {exercise && (
        <ExerciseMediaCard pattern={exercise.movementPattern} media={exercise.media} showStillWithClip={false} />
      )}
    </SheetModal>
  );
}
