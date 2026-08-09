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
  const { width } = useWindowDimensions();
  const twoColumn = width >= TWO_COLUMN_MIN_WIDTH;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="body" color="textMuted">
        {description}
      </Text>
      <View
        style={
          twoColumn
            ? { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }
            : { gap: spacing.md }
        }
      >
        <View style={twoColumn ? { flex: 1 } : undefined}>
          <ExerciseMediaCard pattern={pattern} media={media} />
        </View>
        <View style={[{ gap: spacing.xs }, twoColumn ? { flex: 1 } : undefined]}>
          {steps.map((step, i) => (
            <Text key={i} variant="body">
              {i + 1}. {step}
            </Text>
          ))}
        </View>
      </View>
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
