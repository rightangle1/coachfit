/**
 * Shared "adjust this exercise" view. Used identically by the live workout
 * tracker (`app/workout.tsx`) and the pre-workout / live-overview plan
 * preview (`workout-exercise-groups.tsx`), so both read as one view instead
 * of two components that drift apart.
 *
 * Owns its own how-to / replace / history sheets so every call site gets the
 * same behavior for free; callers only supply data and handlers for the
 * parts that differ by context (mark-complete, remove-exercise, add/remove set).
 */

import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, HowToSheet, Row, Text, useTheme } from '@/design';
import { EXERCISES } from '@/domain/catalog';
import { equipmentSatisfied, hasIntervalPhases, replacementAllowed, replacementFitScore, replacementLogCount } from '@/domain/engine';
import { getExercisePreferences } from '@/services/exercise-preferences';
import { CompletionBox, ExerciseBestStatsRow, ExerciseHero, SetRow, type EditableSet } from '@/features/exercise-detail';
import { ExerciseHistorySheet } from '@/features/exercise-history-sheet';
import { ExercisePickerSheet } from '@/features/exercise-picker-sheet';
import type { EquipmentInventory, Exercise, ExperienceLevel, Modality, PlannedExercise, SessionRecord, WeightUnit, WorkoutType } from '@/domain/types';

export type AdjustableSet = EditableSet & { completed?: boolean; skipped?: boolean };

export function ExerciseAdjustView({
  exercise,
  sets,
  weightUnit,
  equipment,
  workoutType,
  modality,
  eyebrow,
  onClose,
  onUpdateSet,
  onToggleSet,
  onToggleAll,
  allComplete,
  activeSetIndex,
  onAddSet,
  canAddSet = true,
  onRemoveSet,
  canRemoveSet = true,
  onRemoveExercise,
  canRemoveExercise = true,
  replaceDisabledMessage,
  onReplace,
  experience,
  history,
}: {
  exercise: PlannedExercise;
  sets: AdjustableSet[];
  weightUnit: WeightUnit;
  equipment: EquipmentInventory;
  workoutType?: WorkoutType;
  modality?: Modality;
  eyebrow: string;
  /** Feeds the Replace picker's "Suggested" gate (difficulty vs. experience) — omit to skip that check. */
  experience?: ExperienceLevel;
  /** Feeds the Replace picker's "Suggested" gate (prerequisites completed) — omit to skip that check. */
  history?: SessionRecord[];
  /** "Back to Overview" / "Close" on the hero. */
  onClose: () => void;
  onUpdateSet: (setIndex: number, patch: Partial<EditableSet>) => void;
  /** Per-set completion box — omitted in the pre-workout preview, which has nothing to log yet. */
  onToggleSet?: (setIndex: number) => void;
  /** "Log all sets" toggle-all box — live tracker only. */
  onToggleAll?: () => void;
  allComplete?: boolean;
  /** Index of the set currently "up next"; -1 once every set is done. Omit to render every set identically (pre-workout preview). */
  activeSetIndex?: number;
  onAddSet?: () => void;
  canAddSet?: boolean;
  onRemoveSet?: () => void;
  canRemoveSet?: boolean;
  /** Omitted only where dropping an exercise doesn't make sense (e.g. mid-superset). */
  onRemoveExercise?: () => void;
  canRemoveExercise?: boolean;
  replaceDisabledMessage?: string;
  onReplace: (replacementId: string, options?: { ignoreEquipment?: boolean }) => void;
}) {
  const { spacing } = useTheme();
  const [howToOpen, setHowToOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [excludedIds] = useState(() => new Set(getExercisePreferences().excludedExerciseIds));

  const catalog = EXERCISES.find((entry) => entry.id === exercise.exerciseId);
  // Interval cardio's sets alternate work/recovery phases (ADR-0406) — flag
  // each row accordingly so a 5-round interval exercise doesn't render as 10
  // identical, unlabeled rows (the touchless guided-flow player already does
  // this; the manual tracker hadn't).
  const hasIntervalCardio = hasIntervalPhases(sets);
  // Replace's full candidate pool: the same hard floor the engine enforces on
  // commit (`replacementAllowed` — training type, equipment, exclusions, safety),
  // never movement/muscle fit. Fit quality only decides ranking within "Best
  // Replacements" below, via `replacementFitScore`, so an athlete can still
  // deliberately sort/browse to a different-purpose replacement.
  const replacementContext = useMemo(
    () => ({ equipment, excludedExerciseIds: [...excludedIds], experience, history }),
    [equipment, excludedIds, experience, history],
  );
  const alternates = useMemo(() => {
    if (!catalog || !replaceOpen) return [];
    return EXERCISES.filter((entry) => replacementAllowed(catalog, entry, replacementContext, { ignoreEquipment: true }));
  }, [catalog, replaceOpen, replacementContext]);
  const rankReplacement = useMemo(
    () => (candidate: Exercise) =>
      catalog ? replacementFitScore(catalog, candidate as (typeof EXERCISES)[number], replacementContext) : 0,
    [catalog, replacementContext],
  );
  const replacementLogCountFor = useMemo(
    () => (candidate: Exercise) => replacementLogCount(candidate.id, history),
    [history],
  );
  const ownsReplacementEquipment = useMemo(
    () => (candidate: Exercise) => equipmentSatisfied(candidate, equipment),
    [equipment],
  );

  return (
    <View style={{ gap: spacing.lg }}>
      <ExerciseHero
        name={exercise.name}
        exercise={catalog}
        exerciseId={exercise.exerciseId}
        workoutType={workoutType}
        modality={modality}
        eyebrow={eyebrow}
        onHowTo={() => setHowToOpen(true)}
        onReplace={() => setReplaceOpen(true)}
        onHistory={() => setHistoryOpen(true)}
        onOverview={onClose}
      />
      <ExerciseBestStatsRow exerciseId={exercise.exerciseId} weightUnit={weightUnit} />
      <Card elevated>
        <View style={{ gap: spacing.md }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="subtitle" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>{exercise.name}</Text>
            {onToggleAll && (
              <Row gap="xs" style={{ alignItems: 'center' }}>
                <Text variant="label" color="textMuted" weight="semibold">Log all sets</Text>
                <CompletionBox checked={Boolean(allComplete)} label={`Mark ${exercise.name} complete`} onPress={onToggleAll} />
              </Row>
            )}
          </Row>
          {exercise.rotationGroup && <Text variant="caption" color="textMuted">Set rounds are shared across this superset.</Text>}
          {sets.map((set, index) => (
            <SetRow
              key={index}
              exercise={exercise}
              set={set}
              setIndex={index}
              completed={Boolean(set.completed)}
              skipped={Boolean(set.skipped)}
              weightUnit={weightUnit}
              equipment={equipment}
              title={hasIntervalCardio ? (set.phase === 'recovery' ? 'Recovery' : 'Work') : undefined}
              showCompletion={Boolean(onToggleSet)}
              emphasis={
                activeSetIndex == null
                  ? 'upcoming'
                  : index === activeSetIndex
                    ? 'active'
                    : index < activeSetIndex || activeSetIndex === -1
                      ? 'done'
                      : 'upcoming'
              }
              onUpdate={(patch) => onUpdateSet(index, patch)}
              onToggle={onToggleSet ? () => onToggleSet(index) : undefined}
            />
          ))}
          {(onAddSet || onRemoveSet) && (
            <Row gap="sm">
              {onAddSet && <Button title="+ Add set" variant="secondary" size="sm" disabled={!canAddSet} onPress={onAddSet} style={{ flex: 1 }} />}
              {onRemoveSet && <Button title="Remove set" variant="quiet" size="sm" disabled={!canRemoveSet} onPress={onRemoveSet} style={{ flex: 1 }} />}
            </Row>
          )}
        </View>
      </Card>
      {onRemoveExercise && (
        <Button title="Remove exercise" variant="danger" disabled={!canRemoveExercise} onPress={onRemoveExercise} fullWidth />
      )}
      <HowToSheet visible={howToOpen} onClose={() => setHowToOpen(false)} name={exercise.name} exercise={catalog} />
      <ExercisePickerSheet
        visible={replaceOpen}
        onClose={() => setReplaceOpen(false)}
        title={`Replace ${exercise.name}`}
        exercises={alternates}
        rank={rankReplacement}
        logCount={replacementLogCountFor}
        ownsEquipment={ownsReplacementEquipment}
        actionLabel="Use this"
        disabledMessage={replaceDisabledMessage}
        onPick={(id, options) => { onReplace(id, options); setReplaceOpen(false); }}
      />
      {historyOpen && (
        <ExerciseHistorySheet exerciseId={exercise.exerciseId} exerciseName={exercise.name} weightUnit={weightUnit} onClose={() => setHistoryOpen(false)} />
      )}
    </View>
  );
}
