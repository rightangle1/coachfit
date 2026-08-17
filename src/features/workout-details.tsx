/** Shared workout-detail sections for the pre-workout and live-workout flows. */

import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card, Row, Text, ToneIconTile, toneForWorkoutType, useTheme } from '@/design';
import { EXERCISES } from '@/domain/catalog';
import { estimateBlocksSeconds } from '@/domain/engine/timing';
import { WorkoutExerciseGroups } from '@/features/workout-exercise-groups';
import type { PerformedExercise, SessionBlock, SessionPlan, WeightUnit } from '@/domain/types';
import type { IconName } from '@/design';

function blockIcon(block: SessionBlock): IconName {
  const label = block.label.toLowerCase();
  if (label.includes('warm')) return 'warmup';
  if (label.includes('condition') || block.modality === 'cardio') return 'conditioning';
  if (label.includes('cool') || block.modality === 'mobility') return 'cooldown';
  return 'workout';
}

// `densePacing` mirrors `plan.densePacing` (ADR-0145) so this badge never
// disagrees with what the tracker's real per-set rest countdown shows.
function blockMinutes(block: SessionBlock, densePacing?: boolean) {
  return Math.max(1, Math.round(estimateBlocksSeconds([block], (id) => EXERCISES.find((exercise) => exercise.id === id), densePacing) / 60));
}

export function WorkoutDetails({
  plan,
  weightUnit,
  performed,
  showProgress = false,
  showHeading = true,
  onChangePlan,
  onChangePerformedSet,
  onOpenExercise,
  onLogAllSets,
  highlightedExerciseId,
}: {
  plan: SessionPlan;
  weightUnit: WeightUnit;
  performed?: PerformedExercise[];
  showProgress?: boolean;
  showHeading?: boolean;
  onChangePlan: (plan: SessionPlan) => void;
  onChangePerformedSet?: (exerciseId: string, setIndex: number, patch: Partial<PerformedExercise['sets'][number]>) => void;
  onOpenExercise?: (exerciseId: string) => void;
  onLogAllSets?: (exerciseId: string) => void;
  highlightedExerciseId?: string | null;
}) {
  const { colors, spacing } = useTheme();
  // A session gets one visual voice. Warmups, conditioning, and cooldowns
  // support the workout rather than each asking for their own accent color.
  const workoutTone = toneForWorkoutType(plan.workoutType);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string> | null>(null);
  // Default to whichever block the athlete would actually do next — the
  // first one with unfinished exercises — so starting a workout opens on
  // warmup (or wherever they left off) instead of always jumping to Main.
  const firstIncompleteBlock = performed
    ? plan.blocks.find((block) => block.exercises.some((exercise) => {
      const actual = performed.find((item) => item.exerciseId === exercise.exerciseId);
      return !actual || !actual.sets.every((set) => set.completed || set.skipped);
    }))
    : undefined;
  const defaultBlock = firstIncompleteBlock ?? plan.blocks[0];
  const highlightedBlock = highlightedExerciseId
    ? plan.blocks.find((block) => block.exercises.some((exercise) => exercise.exerciseId === highlightedExerciseId))
    : undefined;
  // Returning from an exercise should retain its context without hiding the
  // current block. A user-toggled state takes over after the initial view.
  const visibleBlocks = expandedBlocks ?? new Set(
    [defaultBlock?.label, highlightedBlock?.label].filter((label): label is string => Boolean(label)),
  );

  return (
    <View style={{ gap: spacing.sm }}>
      {showHeading && <Text variant="heading" italic>Workout details</Text>}
      {plan.blocks.map((block) => {
        const expanded = visibleBlocks.has(block.label);
        const minutes = blockMinutes(block, plan.densePacing);
        return (
          <Card key={block.label} padded={false} style={{ overflow: 'hidden' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${block.label}`}
              onPress={() => setExpandedBlocks((current) => {
                const next = new Set(current ?? visibleBlocks);
                if (next.has(block.label)) next.delete(block.label);
                else next.add(block.label);
                return next;
              })}
              style={({ pressed }) => ({ padding: spacing.lg, opacity: pressed ? 0.72 : 1 })}
            >
              <Row gap="sm">
                <ToneIconTile name={blockIcon(block)} size={32} iconSize={16} tone={workoutTone} />
                <View style={{ flex: 1 }}>
                  <Text variant="subtitle">{block.label}</Text>
                  <Text variant="caption" color="textFaint">{block.exercises.length} exercises · ~{minutes} min</Text>
                </View>
                <Text variant="subtitle" tint={colors.tones[workoutTone].text}>{expanded ? '⌃' : '⌄'}</Text>
              </Row>
            </Pressable>
            {expanded && (
              <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
                <WorkoutExerciseGroups
                  plan={plan}
                  block={block}
                  weightUnit={weightUnit}
                  performed={performed}
                  showProgress={showProgress}
                  onChangePlan={onChangePlan}
                  onChangePerformedSet={onChangePerformedSet}
                  onOpenExercise={onOpenExercise}
                  onLogAllSets={onLogAllSets}
                  highlightedExerciseId={highlightedExerciseId}
                />
              </View>
            )}
          </Card>
        );
      })}
    </View>
  );
}
