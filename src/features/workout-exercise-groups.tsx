/**
 * Shared, actionable exercise outline used before a workout and in its live
 * overview. A group owns the visual hierarchy, while each exercise keeps its
 * own prescription and completed-set count.
 */

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';

import { Button, Divider, Icon, MuscleLogo, Row, Text, ZoneBadge, useTheme } from '@/design';
import { ExercisePickerSheet } from '@/features/exercise-picker-sheet';
import { ExerciseAdjustView } from '@/features/exercise-adjust-view';
import { intensityLabel, unilateralLabel } from '@/features/exercise-detail';
import { EXERCISES } from '@/domain/catalog';
import { availableWeightsForExercise, equipmentSatisfied, replacementAllowed } from '@/domain/engine';
import { MODALITY_LABELS, MUSCLE_GROUP_LABELS } from '@/app-lib/options';
import { normalizeSupersets, replaceExercise, setsForProgression, updateSetWithCascade } from '@/app-lib/workout-editing';
import { getAthleteProfile } from '@/services/athlete';
import { getEquipmentInventory } from '@/services/equipment';
import { getExercisePreferences } from '@/services/exercise-preferences';
import { listEngineHistory } from '@/services/sessions';
import type { EquipmentInventory, PerformedExercise, PlannedExercise, PlannedSet, SessionBlock, SessionPlan, SupersetGroup, WeightUnit } from '@/domain/types';

const ROW_HEIGHT = 58;

function newGroup(id: string): SupersetGroup {
  return { id, type: 'time_saver', rationale: 'Paired together so you can alternate exercises before resting.' };
}

function reorder(exercises: PlannedExercise[], from: string, to: string, placement: 'before' | 'after'): PlannedExercise[] {
  const fromIndex = exercises.findIndex((exercise) => exercise.exerciseId === from);
  const toIndex = exercises.findIndex((exercise) => exercise.exerciseId === to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return exercises;
  const next = [...exercises];
  const [moved] = next.splice(fromIndex, 1);
  const destinationIndex = next.findIndex((exercise) => exercise.exerciseId === to);
  next.splice(destinationIndex + (placement === 'after' ? 1 : 0), 0, moved);
  return next;
}

/** Superset rounds must line up. Keep an exercise's own prescription, and
 * extend it by cloning its last working set when it joins a longer partner. */
function matchSetCount(sets: PlannedSet[], count: number): PlannedSet[] {
  if (sets.length >= count) return sets.slice(0, count);
  const fallback = sets[sets.length - 1] ?? {};
  return [...sets, ...Array.from({ length: count - sets.length }, () => ({ ...fallback }))];
}

function updateBlock(plan: SessionPlan, label: string, update: (block: SessionBlock) => SessionBlock): SessionPlan {
  return { ...plan, blocks: plan.blocks.map((block) => block.label === label ? update(block) : block) };
}

function catalogExercise(
  id: string,
  template?: PlannedExercise,
  equipment?: EquipmentInventory,
  weightUnit: WeightUnit = 'kg',
): PlannedExercise | undefined {
  const exercise = EXERCISES.find((candidate) => candidate.id === id);
  if (!exercise) return undefined;
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    primaryAreas: exercise.primaryAreas.map((group) => ({ group })),
    sets: setsForProgression(exercise, template, equipment ? availableWeightsForExercise(exercise, equipment) : undefined, weightUnit),
  };
}

function SortableExerciseRow({
  exerciseId,
  editable,
  dropPosition,
  onDragStart,
  onDragTarget,
  onDrop,
  onPosition,
  measurementPass,
  handle,
  children,
}: {
  exerciseId: string;
  editable: boolean;
  dropPosition: 'before' | 'on' | 'after' | null;
  onDragStart: (exerciseId: string) => void;
  onDragTarget: (pageY: number) => void;
  onDrop: (pageY: number) => void;
  onPosition: (exerciseId: string, top: number, bottom: number) => void;
  measurementPass: number;
  handle: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const rowRef = useRef<View>(null);
  const [translationY, setTranslationY] = useState(0);
  const [lifted, setLifted] = useState(false);
  const reportPosition = () => {
    rowRef.current?.measure((_x, _y, _width, height, _pageX, pageY) => onPosition(exerciseId, pageY, pageY + height));
  };
  useEffect(() => {
    reportPosition();
  }, [measurementPass]);
  const drag = Gesture.Pan()
    .runOnJS(true)
    .enabled(editable)
    .activeOffsetY([-6, 6])
    .onBegin(() => {
      setLifted(true);
      onDragStart(exerciseId);
    })
    .onUpdate((event) => {
      setTranslationY(event.translationY);
      onDragTarget(event.absoluteY);
    })
    .onFinalize((event) => {
      setTranslationY(0);
      setLifted(false);
      onDrop(event.absoluteY);
    });

  return (
    <View
      ref={rowRef}
      onLayout={reportPosition}
      style={[
        {
          minHeight: ROW_HEIGHT,
          borderRadius: 10,
          backgroundColor: dropPosition === 'on' ? colors.primarySoft : 'transparent',
          borderWidth: dropPosition === 'on' ? 1 : 0,
          borderColor: dropPosition === 'on' ? colors.primary : 'transparent',
          borderTopWidth: dropPosition === 'before' ? 3 : dropPosition === 'on' ? 1 : 0,
          borderBottomWidth: dropPosition === 'after' ? 3 : dropPosition === 'on' ? 1 : 0,
          paddingHorizontal: dropPosition === 'on' ? 4 : 0,
          marginVertical: dropPosition ? 4 : 0,
          shadowColor: colors.text,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: lifted ? 0.16 : 0,
          elevation: lifted ? 8 : 0,
          transform: [{ translateY: translationY }, { scale: lifted ? 1.025 : 1 }],
        },
      ]}
    >
      {dropPosition === 'before' || dropPosition === 'after' ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            [dropPosition === 'before' ? 'top' : 'bottom']: -8,
            zIndex: 2,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <View style={{ flex: 1, height: 2, backgroundColor: colors.primary, borderRadius: 99 }} />
          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99, backgroundColor: colors.primary }}>
            <Text variant="caption" color="primaryText" weight="bold">MOVE HERE</Text>
          </View>
          <View style={{ flex: 1, height: 2, backgroundColor: colors.primary, borderRadius: 99 }} />
        </View>
      ) : null}
      <Row style={{ minHeight: ROW_HEIGHT, alignItems: 'center', gap: 6 }}>
        <GestureDetector gesture={drag}>{handle}</GestureDetector>
        {children}
      </Row>
    </View>
  );
}

function SplitDropZone({
  groupId,
  active,
  onPosition,
}: {
  groupId: string;
  active: boolean;
  onPosition: (groupId: string, top: number, bottom: number) => void;
}) {
  const { colors, radii, spacing } = useTheme();
  const zoneRef = useRef<View>(null);
  const reportPosition = () => {
    zoneRef.current?.measure((_x, _y, _width, height, _pageX, pageY) => onPosition(groupId, pageY, pageY + height));
  };
  return (
    <View
      ref={zoneRef}
      onLayout={reportPosition}
      style={{
        minHeight: 52,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: active ? colors.primary : colors.borderStrong,
        borderRadius: radii.lg,
        backgroundColor: active ? colors.primarySoft : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.md,
      }}
    >
      <Text variant="caption" color={active ? 'primaryTextSoft' : 'textFaint'} weight="bold">
        DROP HERE TO MAKE A STRAIGHT SET
      </Text>
    </View>
  );
}

export function WorkoutExerciseGroups({
  plan,
  block,
  weightUnit,
  performed = [],
  onChangePlan,
  onChangePerformedSet,
  onOpenExercise,
  onLogAllSets,
  showProgress = false,
  highlightedExerciseId,
}: {
  plan: SessionPlan;
  block: SessionBlock;
  weightUnit: WeightUnit;
  performed?: PerformedExercise[];
  onChangePlan: (plan: SessionPlan) => void;
  onChangePerformedSet?: (exerciseId: string, setIndex: number, patch: Partial<PerformedExercise['sets'][number]>) => void;
  onOpenExercise?: (exerciseId: string) => void;
  /** Swipe-left "log all sets" on a row — live overview only; the pre-workout
   * preview has nothing to log yet, so it never supplies this. */
  onLogAllSets?: (exerciseId: string) => void;
  showProgress?: boolean;
  highlightedExerciseId?: string | null;
}) {
  const { colors, radii, spacing } = useTheme();
  const [addOpen, setAddOpen] = useState(false);
  // Tapping a row with no `onOpenExercise` (the pre-workout preview) opens this
  // full hero-style detail view — the same one the live workout uses — instead
  // of a bespoke sheet, so the two flows read as one view (see exercise-adjust-view.tsx).
  const [detailExerciseId, setDetailExerciseId] = useState<string | null>(null);
  const [draggedExerciseId, setDraggedExerciseId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ exerciseId: string; placement: 'before' | 'on' | 'after' } | null>(null);
  const [measurementPass, setMeasurementPass] = useState(0);
  const rowPositions = useRef(new Map<string, { top: number; bottom: number }>());
  const splitZonePositions = useRef(new Map<string, { top: number; bottom: number }>());
  const [splitDropActive, setSplitDropActive] = useState(false);
  const [equipment] = useState(() => getEquipmentInventory() ?? { items: [] });
  const [excludedIds] = useState(() => new Set(getExercisePreferences().excludedExerciseIds));
  const [experience] = useState(() => getAthleteProfile()?.experience);
  const [history] = useState(() => listEngineHistory());
  const exercised = useMemo(() => new Map(performed.map((item) => [item.exerciseId, item])), [performed]);
  const groups = useMemo(() => {
    const result: { id: string; group?: SupersetGroup; exercises: PlannedExercise[] }[] = [];
    const byId = new Map<string, { id: string; group?: SupersetGroup; exercises: PlannedExercise[] }>();
    block.exercises.forEach((exercise) => {
      if (!exercise.rotationGroup) {
        result.push({ id: `straight-${exercise.exerciseId}`, exercises: [exercise] });
        return;
      }
      const found = byId.get(exercise.rotationGroup);
      if (found) found.exercises.push(exercise);
      else {
        const next = { id: exercise.rotationGroup, group: exercise.group, exercises: [exercise] };
        byId.set(exercise.rotationGroup, next);
        result.push(next);
      }
    });
    return result;
  }, [block.exercises]);

  const canEdit = (exerciseId: string) => !(exercised.get(exerciseId)?.sets.some((set) => set.completed || set.skipped));
  const setCountMembers = (exerciseId: string) => {
    const rotationGroup = block.exercises.find((exercise) => exercise.exerciseId === exerciseId)?.rotationGroup;
    return rotationGroup
      ? block.exercises.filter((exercise) => exercise.rotationGroup === rotationGroup)
      : block.exercises.filter((exercise) => exercise.exerciseId === exerciseId);
  };
  const canEditSetCount = (exerciseId: string) => setCountMembers(exerciseId).every((exercise) => canEdit(exercise.exerciseId));
  const detailTarget = detailExerciseId ? block.exercises.find((exercise) => exercise.exerciseId === detailExerciseId) : undefined;
  const detailCatalog = detailTarget ? EXERCISES.find((exercise) => exercise.id === detailTarget.exerciseId) : undefined;
  const available = EXERCISES.filter((exercise) =>
    exercise.modality === block.modality
    && equipmentSatisfied(exercise, equipment)
    && !excludedIds.has(exercise.id)
    && !block.exercises.some((planned) => planned.exerciseId === exercise.id),
  );

  function setRowPosition(exerciseId: string, top: number, bottom: number) {
    rowPositions.current.set(exerciseId, { top, bottom });
  }

  function targetAt(pageY: number, sourceId: string): { exerciseId: string; placement: 'before' | 'on' | 'after' } | null {
    for (const exercise of block.exercises) {
      if (exercise.exerciseId === sourceId) continue;
      const position = rowPositions.current.get(exercise.exerciseId);
      if (position && pageY >= position.top && pageY <= position.bottom) {
        const progress = (pageY - position.top) / (position.bottom - position.top);
        return {
          exerciseId: exercise.exerciseId,
          placement: progress < 0.28 ? 'before' : progress > 0.72 ? 'after' : 'on',
        };
      }
    }
    return null;
  }

  function setSplitZonePosition(groupId: string, top: number, bottom: number) {
    splitZonePositions.current.set(groupId, { top, bottom });
  }

  function isInSplitZone(exerciseId: string, pageY: number): boolean {
    const groupId = block.exercises.find((exercise) => exercise.exerciseId === exerciseId)?.rotationGroup;
    const zone = groupId ? splitZonePositions.current.get(groupId) : undefined;
    return Boolean(zone && pageY >= zone.top && pageY <= zone.bottom);
  }

  function move(from: string, to: string, groupOnDrop = false, placement: 'before' | 'after' = 'before') {
    if (!canEdit(from) || !canEdit(to)) return;
    const source = block.exercises.find((exercise) => exercise.exerciseId === from);
    const destination = block.exercises.find((exercise) => exercise.exerciseId === to);
    if (!source || !destination) return;
    let exercises = reorder(block.exercises, from, to, placement);
    const sameGroup = source.rotationGroup != null && source.rotationGroup === destination.rotationGroup;
    // The center of a distinct exercise forms a new pair (or joins its group);
    // the edge zones above and below are order-only destinations.
    const joinsDestination = groupOnDrop;

    if (joinsDestination) {
      const id = destination.rotationGroup ?? `custom-${destination.exerciseId}`;
      const group = destination.group ?? newGroup(id);
      const targetSetCount = destination.sets.length;
      exercises = exercises.map((exercise) =>
        exercise.exerciseId === from || (!destination.rotationGroup && exercise.exerciseId === to)
          ? { ...exercise, rotationGroup: id, group }
          : exercise,
      );
      exercises = exercises.map((exercise) =>
        exercise.rotationGroup === id ? { ...exercise, sets: matchSetCount(exercise.sets, targetSetCount) } : exercise,
      );
    } else if (source.rotationGroup && !sameGroup) {
      // An edge drop only changes order. If it takes a member outside its box,
      // that member becomes straight work instead of silently joining the target.
      exercises = exercises.map((exercise) =>
        exercise.exerciseId === from ? { ...exercise, rotationGroup: undefined, group: undefined } : exercise,
      );
    }
    onChangePlan(updateBlock(plan, block.label, (current) => ({ ...current, exercises: normalizeSupersets(exercises) })));
  }

  function ungroup(exerciseId: string) {
    onChangePlan(updateBlock(plan, block.label, (current) => ({
      ...current,
      exercises: normalizeSupersets(current.exercises.map((exercise) => exercise.exerciseId === exerciseId ? { ...exercise, rotationGroup: undefined, group: undefined } : exercise)),
    })));
    setAddOpen(false);
  }

  function isOutsideSourceGroup(exerciseId: string, pageY: number): boolean {
    const source = block.exercises.find((exercise) => exercise.exerciseId === exerciseId);
    if (!source?.rotationGroup) return false;
    const members = block.exercises.filter((exercise) => exercise.rotationGroup === source.rotationGroup);
    const positions = members.map((exercise) => rowPositions.current.get(exercise.exerciseId)).filter(Boolean) as { top: number; bottom: number }[];
    if (!positions.length) return false;
    const top = Math.min(...positions.map((position) => position.top)) - spacing.md;
    const bottom = Math.max(...positions.map((position) => position.bottom)) + spacing.md;
    return pageY < top || pageY > bottom;
  }

  function remove(exerciseId: string) {
    onChangePlan(updateBlock(plan, block.label, (current) => ({ ...current, exercises: normalizeSupersets(current.exercises.filter((exercise) => exercise.exerciseId !== exerciseId)) })));
    setAddOpen(false);
  }

  // Swipe right → remove. Works even mid-workout with sets already logged
  // (the athlete decided this exercise isn't right for today); the only hard
  // guard is never leaving a block with zero exercises.
  function renderRemoveAction(exerciseId: string, exerciseName: string) {
    // eslint-disable-next-line react/display-name -- gesture library requires a render callback
    return (_progress: SharedValue<number>, _translation: SharedValue<number>, swipeable: SwipeableMethods) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${exerciseName}`}
        onPress={() => { swipeable.close(); remove(exerciseId); }}
        style={({ pressed }) => ({
          width: 92,
          marginVertical: 2,
          marginLeft: 8,
          borderRadius: radii.md,
          backgroundColor: colors.danger,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Icon name="trash" color="primaryText" size={18} />
        <Text variant="caption" color="primaryText" weight="bold">Remove</Text>
      </Pressable>
    );
  }

  // Swipe left → log all sets for this exercise (planned values), live overview only.
  function renderLogAllAction(exerciseId: string, exerciseName: string) {
    // eslint-disable-next-line react/display-name -- gesture library requires a render callback
    return (_progress: SharedValue<number>, _translation: SharedValue<number>, swipeable: SwipeableMethods) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Log all sets for ${exerciseName}`}
        onPress={() => { swipeable.close(); onLogAllSets?.(exerciseId); }}
        style={({ pressed }) => ({
          width: 92,
          marginVertical: 2,
          marginRight: 8,
          borderRadius: radii.md,
          backgroundColor: colors.success,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Icon name="checkAll" color="primaryText" size={18} />
        <Text variant="caption" color="primaryText" weight="bold">Log all</Text>
      </Pressable>
    );
  }

  function changeSetCount(exerciseId: string, direction: 1 | -1) {
    const memberIds = new Set(setCountMembers(exerciseId).map((exercise) => exercise.exerciseId));
    if (!canEditSetCount(exerciseId)) return;
    onChangePlan(updateBlock(plan, block.label, (current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => {
        if (!memberIds.has(exercise.exerciseId)) return exercise;
        if (direction < 0) return { ...exercise, sets: exercise.sets.slice(0, -1) };
        const last = exercise.sets[exercise.sets.length - 1];
        return { ...exercise, sets: [...exercise.sets, { ...last, restSec: last?.restSec }] };
      }),
    })));
  }

  function updateSet(exerciseId: string, setIndex: number, patch: Partial<PlannedSet>) {
    onChangePlan(updateBlock(plan, block.label, (current) => ({
      ...current,
      exercises: current.exercises.map((exercise) =>
        exercise.exerciseId !== exerciseId
          ? exercise
          : { ...exercise, sets: updateSetWithCascade(exercise.sets, setIndex, patch) },
      ),
    })));
  }

  function removeSet(exerciseId: string, setIndex: number) {
    const members = setCountMembers(exerciseId);
    const memberIds = new Set(members.map((exercise) => exercise.exerciseId));
    if (!canEditSetCount(exerciseId) || members.some((exercise) => exercise.sets.length <= 1)) return;
    onChangePlan(updateBlock(plan, block.label, (current) => ({
      ...current,
      exercises: current.exercises.map((exercise) =>
        !memberIds.has(exercise.exerciseId)
          ? exercise
          : { ...exercise, sets: exercise.sets.filter((_, index) => index !== setIndex) },
      ),
    })));
  }

  function replace(exerciseId: string, replacementId: string, options?: { ignoreEquipment?: boolean }) {
    const previous = block.exercises.find((exercise) => exercise.exerciseId === exerciseId);
    if (!previous) return;
    // Defense in depth: the Replace picker only ever offers ids that already
    // pass this same hard floor, but re-check here too rather than trusting
    // whatever id comes back through the callback (matches the live workout's
    // engine-side re-validation in adjustDuringSession's swap handling).
    const previousCatalog = EXERCISES.find((candidate) => candidate.id === exerciseId);
    const replacementCatalog = EXERCISES.find((candidate) => candidate.id === replacementId);
    if (!previousCatalog || !replacementCatalog) return;
    if (!replacementAllowed(previousCatalog, replacementCatalog, { equipment, excludedExerciseIds: [...excludedIds], experience, history }, options)) return;
    const replacement = catalogExercise(replacementId, previous, equipment, weightUnit);
    if (!replacement) return;
    onChangePlan(updateBlock(plan, block.label, (current) => ({
      ...current,
      exercises: replaceExercise(current.exercises, exerciseId, replacement),
    })));
    setAddOpen(false);
    // Replacing swaps this row's exerciseId in the plan; keep the open detail
    // modal pointed at the new id so it doesn't go blank with no way to close.
    if (detailExerciseId === exerciseId) setDetailExerciseId(replacementId);
  }

  function add(exerciseId: string) {
    const template = block.exercises[block.exercises.length - 1];
    const next = catalogExercise(exerciseId, template, equipment, weightUnit);
    if (!next) return;
    onChangePlan(updateBlock(plan, block.label, (current) => ({ ...current, exercises: [...current.exercises, next] })));
    setAddOpen(false);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {groups.map((entry, groupIndex) => (
        <Fragment key={entry.id}>
          <View
          style={{
            borderWidth: entry.group ? 1 : 0,
            borderColor: entry.group ? colors.primary : 'transparent',
            borderRadius: radii.lg,
            overflow: 'hidden',
            backgroundColor: entry.group ? colors.primarySoft : 'transparent',
          }}
        >
          <View style={{ paddingHorizontal: entry.group ? spacing.sm : 0, paddingTop: entry.group ? spacing.sm : 0 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="caption" color={entry.group ? 'primaryTextSoft' : 'textFaint'} weight="bold" style={{ lineHeight: 18, paddingLeft: 1 }}>
                {entry.group ? `SUPERSET ${groups.filter((item) => item.group).findIndex((item) => item.id === entry.id) + 1}` : `STRAIGHT SET ${groupIndex + 1}`}
              </Text>
              {entry.group && <Text variant="caption" color="primaryTextSoft">{entry.exercises.length} exercises</Text>}
            </Row>
            {entry.group?.rationale && <Text variant="caption" color="primaryTextSoft" numberOfLines={1}>{entry.group.rationale}</Text>}
          </View>
          <View style={{ paddingHorizontal: entry.group ? spacing.sm : 0, paddingBottom: entry.group ? spacing.xs : 0 }}>
            {entry.exercises.map((exercise, exerciseIndex) => {
              const actual = exercised.get(exercise.exerciseId);
              const completed = actual?.sets.filter((set) => set.completed).length ?? 0;
              const total = actual?.sets.length ?? exercise.sets.length;
              const logged = actual?.sets.filter((set) => set.completed || set.skipped).length ?? 0;
              const isComplete = total > 0 && logged === total;
              const isHighlighted = highlightedExerciseId === exercise.exerciseId;
              const editable = canEdit(exercise.exerciseId);
              const progressLabel = `${completed} of ${total} complete`;
              const exerciseCatalog = EXERCISES.find((candidate) => candidate.id === exercise.exerciseId);
              const primaryMuscles = exercise.primaryAreas.flatMap((area) => area.group ? [area.group] : []);
              const exerciseIntensity = intensityLabel(exerciseCatalog);
              const perSideLabel = unilateralLabel(exerciseCatalog);
              const removable = block.exercises.length > 1;
              const showLogAll = Boolean(onLogAllSets) && !isComplete;
              return (
                <View key={exercise.exerciseId}>
                  {exerciseIndex > 0 && <Divider style={{ marginVertical: 2 }} />}
                  <Swipeable
                    renderLeftActions={removable ? renderRemoveAction(exercise.exerciseId, exercise.name) : undefined}
                    renderRightActions={showLogAll ? renderLogAllAction(exercise.exerciseId, exercise.name) : undefined}
                    overshootFriction={8}
                  >
                  <SortableExerciseRow
                    exerciseId={exercise.exerciseId}
                    editable={editable}
                    dropPosition={dropTarget?.exerciseId === exercise.exerciseId && draggedExerciseId !== exercise.exerciseId ? dropTarget.placement : null}
                    measurementPass={measurementPass}
                    onDragStart={(exerciseId) => {
                      setDraggedExerciseId(exerciseId);
                      setSplitDropActive(false);
                      setMeasurementPass((pass) => pass + 1);
                    }}
                    onPosition={setRowPosition}
                    onDragTarget={(pageY) => {
                      const destination = targetAt(pageY, exercise.exerciseId);
                      setDropTarget(destination);
                      setSplitDropActive(!destination && isInSplitZone(exercise.exerciseId, pageY));
                    }}
                    onDrop={(pageY) => {
                      const target = targetAt(pageY, exercise.exerciseId);
                      if (target) {
                        move(exercise.exerciseId, target.exerciseId, target.placement === 'on', target.placement === 'after' ? 'after' : 'before');
                      } else if (isInSplitZone(exercise.exerciseId, pageY) || isOutsideSourceGroup(exercise.exerciseId, pageY)) {
                        ungroup(exercise.exerciseId);
                      }
                      setDraggedExerciseId(null);
                      setDropTarget(null);
                      setSplitDropActive(false);
                    }}
                    handle={
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Drag ${exercise.name}. Drop in the middle to make a superset, or on an edge to reorder.`}
                        disabled={!editable}
                        style={({ pressed }) => ({ width: 24, height: 40, alignItems: 'center', justifyContent: 'center', opacity: !editable ? 0.35 : pressed ? 0.55 : 1 })}
                      >
                        <Text variant="subtitle" color="textFaint">⠿</Text>
                      </Pressable>
                    }
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${exercise.name}`}
                      onPress={() => (onOpenExercise ? onOpenExercise(exercise.exerciseId) : setDetailExerciseId(exercise.exerciseId))}
                      style={({ pressed }) => ({
                        flex: 1,
                        padding: isHighlighted ? spacing.sm : 0,
                        borderRadius: radii.md,
                        borderWidth: isHighlighted ? 1 : 0,
                        borderColor: isHighlighted ? colors.primary : 'transparent',
                        backgroundColor: isHighlighted ? colors.primarySoft : 'transparent',
                        opacity: pressed ? 0.7 : isComplete && !isHighlighted ? 0.42 : 1,
                      })}
                    >
                      <Row gap="sm" style={{ alignItems: 'center' }}>
                        <MuscleLogo groups={primaryMuscles} size={44} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Row style={{ alignItems: 'center', gap: spacing.sm }}>
                            <Text variant="body" weight="semibold" style={{ flexShrink: 1 }}>{exercise.name}</Text>
                            {/* ADR-0128: the athlete has to know what kind of
                                effort is being asked before they reach the set. */}
                            <ZoneBadge zone={exercise.zone} />
                          </Row>
                          <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
                            <Text variant="caption" color="textFaint" numberOfLines={1} style={{ flex: 1 }}>
                              {exercise.primaryAreas.map((area) => area.group ? MUSCLE_GROUP_LABELS[area.group] : area.region ?? area.joint ?? 'Target area').join(' · ')}
                              {exerciseIntensity ? ` · ${exerciseIntensity}` : ''}
                              {perSideLabel ? ` · ${perSideLabel}` : ''}
                            </Text>
                            <Text variant="caption" color={completed === total ? 'success' : 'textFaint'} weight="semibold">{progressLabel}</Text>
                          </Row>
                        </View>
                      </Row>
                    </Pressable>
                  </SortableExerciseRow>
                  </Swipeable>
                </View>
              );
            })}
          </View>
          </View>
          {entry.group && draggedExerciseId && entry.exercises.some((exercise) => exercise.exerciseId === draggedExerciseId) && (
            <SplitDropZone groupId={entry.id} active={splitDropActive} onPosition={setSplitZonePosition} />
          )}
        </Fragment>
      ))}
      <Button title="+ Add exercise" size="sm" variant="secondary" onPress={() => setAddOpen(true)} />

      <Modal visible={detailExerciseId != null} animationType="slide" onRequestClose={() => setDetailExerciseId(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
          {detailTarget && detailCatalog && (
            <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl }}>
              <ExerciseAdjustView
                exercise={detailTarget}
                sets={detailTarget.sets}
                weightUnit={weightUnit}
                equipment={equipment}
                workoutType={plan.workoutType}
                modality={block.modality}
                eyebrow={`${MODALITY_LABELS[detailCatalog.modality]} · ${detailTarget.sets.length} SETS`}
                onClose={() => setDetailExerciseId(null)}
                onUpdateSet={(setIndex, patch) => updateSet(detailTarget.exerciseId, setIndex, patch)}
                onAddSet={() => changeSetCount(detailTarget.exerciseId, 1)}
                canAddSet={canEditSetCount(detailTarget.exerciseId)}
                onRemoveSet={() => removeSet(detailTarget.exerciseId, detailTarget.sets.length - 1)}
                canRemoveSet={canEditSetCount(detailTarget.exerciseId) && detailTarget.sets.length > 1}
                onRemoveExercise={() => { remove(detailTarget.exerciseId); setDetailExerciseId(null); }}
                canRemoveExercise={canEdit(detailTarget.exerciseId) && block.exercises.length > 1}
                onReplace={(replacementId, options) => replace(detailTarget.exerciseId, replacementId, options)}
                experience={experience}
                history={history}
              />
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
      <ExercisePickerSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add exercise"
        exercises={available}
        suggestedMuscles={block.exercises.flatMap((exercise) => exercise.primaryAreas.map((area) => area.group).filter((group): group is NonNullable<typeof group> => Boolean(group)))}
        onPick={add}
      />
    </View>
  );
}
