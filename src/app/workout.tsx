/**
 * The live workout is deliberately overview-first. Athletes can see the whole
 * session before drilling into an exercise, while the record remains the
 * source of truth for every set they log.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Modal, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Card, CelebrationBurst, Chip, HowToSheet, Icon, Row, Screen, SheetModal, Text, ToneIconTile, toneForWorkoutType, useTheme } from '@/design';
import { ExercisePickerSheet } from '@/features/exercise-picker-sheet';
import { Meter, Stepper } from '@/design/components/controls';
import { useWorkoutStore } from '@/state/workout-store';
import { EXERCISES } from '@/domain/catalog';
import { equipmentSatisfied, replacementAllowed, replacementFitScore, replacementLogCount } from '@/domain/engine';
import { adjustDuringSession } from '@/services/programming';
import { getAthleteProfile } from '@/services/athlete';
import { getEquipmentInventory } from '@/services/equipment';
import { getExercisePreferences } from '@/services/exercise-preferences';
import { initStorage } from '@/data/persistence';
import { getActiveSessionRecord, getPlan, listEngineHistory, savePlan } from '@/services/sessions';
import { familyOfWorkoutType, MODALITY_LABELS, MUSCLE_GROUP_LABELS } from '@/app-lib/options';
import { WorkoutDetails } from '@/features/workout-details';
import { ExerciseHistorySheet } from '@/features/exercise-history-sheet';
import { ExerciseAdjustView } from '@/features/exercise-adjust-view';
import {
  ExerciseHero,
  SetRow,
  formatClock,
} from '@/features/exercise-detail';
import { formatWeight } from '@/app-lib/units';
import {
  defaultAutoAdvance,
  type EquipmentInventory,
  type EndedEarlyReason,
  type Exercise,
  type MuscleGroup,
  type PerformedExercise,
  type PlannedExercise,
  type SessionPlan,
  type WeightUnit,
} from '@/domain/types';
import { epley1RM } from '@/domain/metrics';

const REPS_LEFT_OPTIONS = [0, 1, 2, 3, 4, 5] as const;

function loadPreferredWeightUnit(): WeightUnit {
  // The workout can be opened directly while resuming a session, so it cannot
  // rely on the planner screen having bootstrapped the database first.
  initStorage();
  return getAthleteProfile()?.weightUnit ?? 'kg';
}

function workoutOverview(plan: SessionPlan): { focus: string; primaryGroups: string[] } {
  const mainBlock = plan.blocks.find((block) => block.label.toLowerCase().includes('main'))
    ?? plan.blocks.find((block) => !/warm|cool|condition/.test(block.label.toLowerCase()))
    ?? plan.blocks[0];
  const focus = plan.workoutType === 'yoga'
    ? 'Yoga flow'
    : plan.workoutType === 'barre'
      ? 'Barre flow'
      : plan.workoutType === 'pilates'
        ? 'Pilates flow'
        : plan.workoutType === 'stretch'
          ? 'Stretch flow'
          : mainBlock
            ? MODALITY_LABELS[mainBlock.modality]
            : 'Workout';
  const counts = new Map<MuscleGroup, number>();

  mainBlock?.exercises.forEach((exercise) => {
    exercise.primaryAreas.forEach((area) => {
      if (area.group) counts.set(area.group, (counts.get(area.group) ?? 0) + 1);
    });
  });

  return {
    focus,
    primaryGroups: [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([group]) => MUSCLE_GROUP_LABELS[group]),
  };
}

function completed(sets: PerformedExercise['sets']) {
  return sets.length > 0 && sets.every((set) => set.completed || set.skipped);
}

/**
 * Wraps a tracker view so moving between overview / exercise / superset reads
 * as a transition rather than a hard cut. Rendered with `key={view}` so each
 * switch genuinely remounts and the entering animation fires.
 *
 * It re-applies `Screen`'s own child gap, since interposing a wrapper would
 * otherwise collapse the spacing between the cards it contains.
 */
function ViewSwap({ children }: { children: ReactNode }) {
  const { spacing, motion } = useTheme();
  return (
    <Animated.View
      entering={motion.enabled ? FadeIn.duration(motion.duration.slow) : undefined}
      style={{ gap: spacing.lg }}
    >
      {children}
    </Animated.View>
  );
}

export default function WorkoutScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const plan = useWorkoutStore((state) => state.plan);
  const record = useWorkoutStore((state) => state.record);
  const builtPlan = useWorkoutStore((state) => state.builtPlan);
  const startWorkout = useWorkoutStore((state) => state.start);
  const updateSet = useWorkoutStore((state) => state.updateSet);
  const toggleComplete = useWorkoutStore((state) => state.toggleComplete);
  const addSet = useWorkoutStore((state) => state.addSet);
  const removeSet = useWorkoutStore((state) => state.removeSet);
  const setExerciseRpe = useWorkoutStore((state) => state.setExerciseRpe);
  const applySwap = useWorkoutStore((state) => state.applySwap);
  const applyPlanEdit = useWorkoutStore((state) => state.applyPlanEdit);
  const endEarly = useWorkoutStore((state) => state.endEarly);
  const toggleTimerPause = useWorkoutStore((state) => state.toggleTimerPause);
  const preSessionBestE1rm = useWorkoutStore((state) => state.preSessionBestE1rm);
  const recordLiveCelebration = useWorkoutStore((state) => state.recordLiveCelebration);

  const [view, setView] = useState<'overview' | 'exercise' | 'superset'>('overview');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [howToOpen, setHowToOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [historyExerciseId, setHistoryExerciseId] = useState<string | null>(null);
  const [supersetAction, setSupersetAction] = useState<'howto' | 'replace' | 'history' | null>(null);
  const [endEarlyPrompt, setEndEarlyPrompt] = useState(false);
  const [focusExerciseId, setFocusExerciseId] = useState<string | null>(null);
  const [debriefExerciseId, setDebriefExerciseId] = useState<string | null>(null);
  const [overviewHighlightExerciseId, setOverviewHighlightExerciseId] = useState<string | null>(null);
  const [debriefRpe, setDebriefRpe] = useState(7);
  const [liveCelebration, setLiveCelebration] = useState<{ exerciseId: string; name: string; e1rmKg: number } | null>(null);
  const [equipment] = useState<EquipmentInventory>(() => getEquipmentInventory() ?? { items: [] });
  const [excludedIds] = useState(() => new Set(getExercisePreferences().excludedExerciseIds));
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(loadPreferredWeightUnit);

  useFocusEffect(
    useCallback(() => {
      setWeightUnit(loadPreferredWeightUnit());
    }, []),
  );

  // Jumps to whatever exercise the Live Activity's prev/next buttons last set
  // as the manual focus (iOS only — that field stays null everywhere else).
  // Doesn't replicate the superset/rotation-group routing `openExercise` below
  // does; landing on the plain exercise view for a superset member is an
  // acceptable rough edge for this secondary entry point.
  useFocusEffect(
    useCallback(() => {
      const manualFocusExerciseId = useWorkoutStore.getState().manualFocusExerciseId;
      if (!manualFocusExerciseId || !plan) return;
      const inPlan = plan.blocks.some((block) =>
        block.exercises.some((exercise) => exercise.exerciseId === manualFocusExerciseId),
      );
      if (!inPlan) return;
      setSelectedExerciseId(manualFocusExerciseId);
      setSelectedGroupId(null);
      setView('exercise');
    }, [plan]),
  );

  useEffect(() => {
    if (record) return;
    initStorage();
    const active = getActiveSessionRecord();
    const activePlan = active ? getPlan(active.planId) : undefined;
    if (active && activePlan) useWorkoutStore.getState().hydrate(activePlan, active);
  }, [record]);

  useEffect(() => {
    if (!record?.startedAt) return;
    const update = () => {
      const endpoint = record.pausedAt ?? Date.now();
      setElapsed(Math.max(0, Math.floor((endpoint - record.startedAt! - (record.pausedDurationMs ?? 0)) / 1000)));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [record?.pausedAt, record?.pausedDurationMs, record?.startedAt]);

  const selectedExercise = plan?.blocks.flatMap((block) => block.exercises).find((exercise) => exercise.exerciseId === selectedExerciseId) ?? null;
  const selectedBlock = plan?.blocks.find((block) => block.exercises.some((exercise) => exercise.exerciseId === selectedExerciseId)) ?? null;
  const selectedGroup = selectedGroupId && selectedBlock ? selectedBlock.exercises.filter((exercise) => exercise.rotationGroup === selectedGroupId) : [];
  const focusedExercise = plan?.blocks.flatMap((block) => block.exercises).find((exercise) => exercise.exerciseId === focusExerciseId) ?? null;
  const focusedPerformed = record?.performed.find((exercise) => exercise.exerciseId === focusExerciseId) ?? null;
  const focusedCatalog = EXERCISES.find((exercise) => exercise.id === focusExerciseId);

  const totalSets = record?.performed.reduce((sum, exercise) => sum + exercise.sets.length, 0) ?? 0;
  const completeSets = record?.performed.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completed || set.skipped).length, 0) ?? 0;
  const progress = totalSets ? Math.round((completeSets / totalSets) * 100) : 0;

  // Same hard floor the engine enforces on commit (`replacementAllowed`) — see
  // exercise-adjust-view.tsx for the non-superset Replace flow this mirrors.
  const replacementContext = useMemo(
    () => ({ equipment, excludedExerciseIds: [...excludedIds], experience: getAthleteProfile()?.experience, history: listEngineHistory() }),
    [equipment, excludedIds],
  );
  const alternates: Exercise[] = useMemo(() => {
    if (!focusedCatalog || !replaceOpen) return [];
    return EXERCISES.filter((exercise) => replacementAllowed(focusedCatalog, exercise, replacementContext, { ignoreEquipment: true }));
  }, [focusedCatalog, replaceOpen, replacementContext]);
  const rankAlternate = useMemo(
    () => (candidate: Exercise) =>
      focusedCatalog ? replacementFitScore(focusedCatalog, candidate as (typeof EXERCISES)[number], replacementContext) : 0,
    [focusedCatalog, replacementContext],
  );
  const alternateLogCount = useMemo(
    () => (candidate: Exercise) => replacementLogCount(candidate.id, replacementContext.history),
    [replacementContext],
  );
  const ownsAlternateEquipment = useMemo(
    () => (candidate: Exercise) => equipmentSatisfied(candidate, equipment),
    [equipment],
  );

  if (!plan || !record || totalSets === 0) {
    if (builtPlan) {
      const overview = workoutOverview(builtPlan);
      const focusTone = toneForWorkoutType(builtPlan.workoutType);
      return (
        <Screen
          footer={
            <Row gap="sm">
              <Button title="Start workout" onPress={() => startWorkout(builtPlan)} style={{ flex: 2 }} />
              <Button title="Cancel" variant="quiet" onPress={() => router.push('/?scrollTo=build')} style={{ flex: 1 }} />
            </Row>
          }
        >
          <View style={{ gap: spacing.sm }}>
            <Text variant="caption" color="textMuted">WORKOUT</Text>
            <Text variant="display" italic>Ready when you are</Text>
            <Text variant="body" color="textMuted">Review today&apos;s plan, then start whenever you&apos;re ready.</Text>
          </View>
          <Card>
            <Row gap="sm" style={{ alignItems: 'flex-start' }}>
              <ToneIconTile name="workout" size={36} iconSize={19} tone={focusTone} />
              <View style={{ flex: 1 }}>
                <Text variant="title" tint={colors.tones[focusTone].text} italic>Workout Focus: {overview.focus}</Text>
                {overview.primaryGroups.length > 0 && (
                  <Text variant="body" tint={colors.tones[focusTone].text} style={{ marginTop: spacing.xs }}>
                    {overview.primaryGroups.join(' · ')}
                  </Text>
                )}
              </View>
            </Row>
          </Card>
          <WorkoutDetails
            plan={builtPlan}
            weightUnit={weightUnit}
            showHeading={false}
            onChangePlan={(next) => {
              savePlan(next);
              useWorkoutStore.getState().setBuiltPlan(next);
            }}
          />
        </Screen>
      );
    }
    return <Screen><View style={{ gap: spacing.sm }}><Text variant="caption" color="textMuted">WORKOUT</Text><Text variant="display" italic>No workout in progress</Text><Text variant="body" color="textMuted">Start a workout from Home to see its overview and track your sets.</Text><Button title="Go to Home" onPress={() => router.push('/')} fullWidth /></View></Screen>;
  }
  const activePlan = plan;
  const activeRecord = record;

  function openExercise(exerciseId: string) {
    const block = activePlan.blocks.find((entry) => entry.exercises.some((exercise) => exercise.exerciseId === exerciseId));
    const exercise = block?.exercises.find((entry) => entry.exerciseId === exerciseId);
    if (!block || !exercise) return;
    setSelectedExerciseId(exerciseId);
    // Yoga/stretch/barre (block.modality === 'mobility') is a single
    // stage-ordered flow, never a rotationGroup — checked ahead of the
    // rotationGroup branch below so it can't be shadowed by it (aerobics
    // circuit members DO carry a rotationGroup, so this must win first for
    // them too). `autoAdvance` unset resolves per-WorkoutType
    // (guided-flow-sequencer.md §3.4); an explicit false always falls
    // through to today's plain manual view.
    const autoAdvance = activePlan.workoutOptions?.autoAdvance
      ?? defaultAutoAdvance(activePlan.workoutType, activePlan.workoutOptions?.cardioIntent);
    // A Conditioning block bolted onto another workout type is also
    // `modality: 'cardio'` but must never auto-advance — `defaultAutoAdvance`
    // already keys off `workoutType`, not block modality, so this just makes
    // that intent explicit (ADR-0406) rather than relying on it implicitly.
    const cardioFlowEligible = block.modality === 'cardio' && activePlan.workoutType === 'cardio';
    if ((block.modality === 'mobility' || cardioFlowEligible) && autoAdvance) {
      router.push({ pathname: '/workout-flow', params: { exerciseId } });
      return;
    }
    if (exercise.rotationGroup) {
      const group = block.exercises.filter((entry) => entry.rotationGroup === exercise.rotationGroup);
      const nextRound = group[0]?.sets.findIndex((_set, index) => group.some((member) => {
        const actual = activeRecord.performed.find((item) => item.exerciseId === member.exerciseId)?.sets[index];
        return actual && !actual.completed && !actual.skipped;
      })) ?? 0;
      setSelectedGroupId(exercise.rotationGroup);
      setRound(Math.max(0, nextRound));
      setView('superset');
      return;
    }
    setSelectedGroupId(null);
    setView('exercise');
  }

  function returnToOverview(exerciseId: string | null = selectedExerciseId) {
    setOverviewHighlightExerciseId(exerciseId);
    setView('overview');
  }

  function nextUnfinishedExercise(afterExerciseId: string): string | null {
    const exercises = activePlan.blocks.flatMap((block) => block.exercises);
    const currentIndex = exercises.findIndex((exercise) => exercise.exerciseId === afterExerciseId);
    const isUnfinished = (exercise: PlannedExercise) => {
      const actual = activeRecord.performed.find((item) => item.exerciseId === exercise.exerciseId);
      return actual && !completed(actual.sets);
    };
    const following = exercises.slice(currentIndex + 1).find(isUnfinished);
    const remaining = exercises.find((exercise) => exercise.exerciseId !== afterExerciseId && isUnfinished(exercise));
    return following?.exerciseId ?? remaining?.exerciseId ?? null;
  }

  function returnToNextExercise(completedExerciseId: string) {
    returnToOverview(nextUnfinishedExercise(completedExerciseId));
  }

  function needsExerciseDebrief(exerciseId: string) {
    const block = activePlan.blocks.find((item) => item.exercises.some((exercise) => exercise.exerciseId === exerciseId));
    return block?.modality !== 'mobility' && !block?.label.toLowerCase().includes('cool');
  }

  function handleExerciseComplete(exerciseId: string) {
    if (needsExerciseDebrief(exerciseId)) openExerciseDebrief(exerciseId);
    else returnToNextExercise(exerciseId);
  }

  function toggleExercise(exerciseId: string, setIndexes: number[]) {
    const actual = activeRecord.performed.find((exercise) => exercise.exerciseId === exerciseId);
    if (!actual) return;
    const allChecked = setIndexes.every((index) => actual.sets[index]?.completed || actual.sets[index]?.skipped);
    setIndexes.forEach((index) => {
      const set = actual.sets[index];
      if (set && Boolean(set.completed || set.skipped) === allChecked) {
        if (!allChecked) celebratePersonalRecord(exerciseId, set);
        toggleComplete(exerciseId, index);
      }
    });
    if (!allChecked) handleExerciseComplete(exerciseId);
  }

  function logAllSets(exerciseId: string) {
    const actual = activeRecord.performed.find((exercise) => exercise.exerciseId === exerciseId);
    if (!actual || completed(actual.sets)) return;
    toggleExercise(exerciseId, actual.sets.map((_set, index) => index));
  }

  // Mirrors the overview's swipe-to-remove: works even with sets already
  // logged, guarded only against leaving a block with zero exercises.
  function removeExercise(exerciseId: string) {
    const block = activePlan.blocks.find((entry) => entry.exercises.some((exercise) => exercise.exerciseId === exerciseId));
    if (!block) return;
    applyPlanEdit({
      ...activePlan,
      blocks: activePlan.blocks.map((entry) => entry.label !== block.label ? entry : { ...entry, exercises: entry.exercises.filter((exercise) => exercise.exerciseId !== exerciseId) }),
    });
    returnToOverview(null);
  }

  function toggleIndividualSet(exerciseId: string, setIndex: number) {
    const actual = activeRecord.performed.find((exercise) => exercise.exerciseId === exerciseId);
    const set = actual?.sets[setIndex];
    if (!actual || !set) return;
    const block = activePlan.blocks.find((entry) => entry.exercises.some((exercise) => exercise.exerciseId === exerciseId));
    const isBecomingComplete = !set.completed && !set.skipped;
    // A mobility flow (ADR-0405) always advances to the next pose in stage
    // order on completing a round, rather than waiting for every round of
    // this one pose first — the 'exercise' view below slices to a single
    // current round for a mobility block, so `setIndex` here is always that
    // round; there is never a "round 2 of this same pose" left to log before
    // moving on. Strength/cardio straight sets keep the original all-sets rule.
    const completesExercise = isBecomingComplete && (
      block?.modality === 'mobility' || actual.sets.every((item, index) => index === setIndex || item.completed || item.skipped)
    );
    if (isBecomingComplete) celebratePersonalRecord(exerciseId, set);
    toggleComplete(exerciseId, setIndex);
    if (completesExercise) handleExerciseComplete(exerciseId);
  }

  function celebratePersonalRecord(exerciseId: string, set: PerformedExercise['sets'][number]) {
    const priorBest = preSessionBestE1rm[exerciseId];
    if (!priorBest || set.weightKg == null || set.reps == null) return;
    const e1rmKg = Math.round(epley1RM(set.weightKg, set.reps) * 10) / 10;
    const celebrationId = `exercise-pr:${exerciseId}`;
    if (e1rmKg <= priorBest || useWorkoutStore.getState().liveCelebratedIds.has(celebrationId)) return;
    const name = activeRecord.performed.find((exercise) => exercise.exerciseId === exerciseId)?.name ?? 'New PR';
    recordLiveCelebration(celebrationId);
    setLiveCelebration({ exerciseId, name, e1rmKg });
  }

  const renderLiveCelebration = () => (
    <CelebrationBurst
      visible={liveCelebration != null}
      kind="pr"
      label={liveCelebration ? `New PR · ${liveCelebration.name}` : 'New PR'}
      sublabel={liveCelebration ? `${formatWeight(liveCelebration.e1rmKg, weightUnit)} estimated 1RM` : undefined}
      tone="gold"
      onDismiss={() => setLiveCelebration(null)}
    />
  );

  function openExerciseDebrief(exerciseId: string) {
    const actual = activeRecord.performed.find((exercise) => exercise.exerciseId === exerciseId);
    const planned = activePlan.blocks.flatMap((block) => block.exercises).find((exercise) => exercise.exerciseId === exerciseId);
    // Skip ramp sets: an exercise carrying a zone test (ADR-0128) leads with
    // warm-ups at RPE 3-4, and defaulting the effort prompt to those would ask
    // the athlete to confirm a number describing work they didn't do.
    const actualWorking = actual?.sets.find((s) => !s.isWarmup) ?? actual?.sets[0];
    const plannedWorking = planned?.sets.find((s) => !s.isWarmup) ?? planned?.sets[0];
    setDebriefRpe(actualWorking?.rpe ?? plannedWorking?.targetRpe ?? 7);
    setDebriefExerciseId(exerciseId);
  }

  function closeExerciseDebrief(save = false) {
    const completedExerciseId = debriefExerciseId;
    if (save && completedExerciseId) setExerciseRpe(completedExerciseId, debriefRpe);
    setDebriefExerciseId(null);
    if (completedExerciseId) returnToNextExercise(completedExerciseId);
    else returnToOverview(null);
  }

  function adjustSupersetSetCount(direction: 1 | -1) {
    if (!selectedGroupId || !selectedBlock || selectedGroup.length === 0) return;
    const memberIds = new Set(selectedGroup.map((exercise) => exercise.exerciseId));
    const count = selectedGroup[0].sets.length;
    if (direction < 0 && count <= 1) return;
    const lastIndex = count - 1;
    if (direction < 0 && selectedGroup.some((exercise) => {
      const set = activeRecord.performed.find((item) => item.exerciseId === exercise.exerciseId)?.sets[lastIndex];
      return set?.completed || set?.skipped;
    })) return;
    applyPlanEdit({
      ...activePlan,
      blocks: activePlan.blocks.map((block) => block.label !== selectedBlock.label ? block : {
        ...block,
        exercises: block.exercises.map((exercise) => !memberIds.has(exercise.exerciseId) ? exercise : {
          ...exercise,
          sets: direction > 0 ? [...exercise.sets, { ...exercise.sets[exercise.sets.length - 1] }] : exercise.sets.slice(0, -1),
        }),
      }),
    });
    if (direction < 0) setRound((current) => Math.min(current, Math.max(0, count - 2)));
  }

  async function replaceFocusedExercise(replacementId: string, options?: { ignoreEquipment?: boolean }) {
    if (!focusedExercise) return;
    const next = await adjustDuringSession(
      activePlan,
      { kind: 'swap', exerciseId: focusedExercise.exerciseId, replacementExerciseId: replacementId, weightUnit, ignoreEquipment: options?.ignoreEquipment },
      {
        equipment,
        history: listEngineHistory(),
        excludedExerciseIds: getExercisePreferences().excludedExerciseIds,
        experience: getAthleteProfile()?.experience,
        resistanceFocus: getAthleteProfile()?.goals.resistanceFocus,
      },
    );
    applySwap(next, focusedExercise.exerciseId, replacementId);
    setReplaceOpen(false);
  }

  async function replaceLiveExercise(exerciseId: string, replacementId: string, options?: { ignoreEquipment?: boolean }) {
    const next = await adjustDuringSession(
      activePlan,
      { kind: 'swap', exerciseId, replacementExerciseId: replacementId, weightUnit, ignoreEquipment: options?.ignoreEquipment },
      {
        equipment,
        history: listEngineHistory(),
        excludedExerciseIds: getExercisePreferences().excludedExerciseIds,
        experience: getAthleteProfile()?.experience,
        resistanceFocus: getAthleteProfile()?.goals.resistanceFocus,
      },
    );
    applySwap(next, exerciseId, replacementId);
    // Keep the tracker pointed at the replacement — `selectedExerciseId` is
    // local view state the store swap doesn't know about, and the old id no
    // longer resolves to anything once the plan/record have moved on.
    setSelectedExerciseId(replacementId);
  }

  const renderStatus = () => (
    <View style={{ gap: spacing.xs }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <Text variant="caption" color="textMuted" weight="bold">OVERVIEW</Text>
          <Text variant="caption" color="textFaint" numberOfLines={1}>{completeSets} of {totalSets} sets complete</Text>
        </Row>
        <Row gap="xs">
          <Icon name="time" size={15} color="primaryTextSoft" />
          <Text variant="caption" color="primaryTextSoft" weight="bold">{formatClock(elapsed)}</Text>
        </Row>
      </Row>
      <Row gap="sm">
        <Meter value={progress} max={100} style={{ flex: 1 }} />
        <Text variant="caption" color="textFaint" weight="semibold" style={{ minWidth: 32, textAlign: 'right' }}>{progress}%</Text>
      </Row>
    </View>
  );

  if (view === 'overview') {
    const focusTone = toneForWorkoutType(plan.workoutType);
    return (
      <Screen footer={<Row gap="sm"><Button title={record.pausedAt ? 'Resume workout' : 'Pause workout'} variant="secondary" onPress={toggleTimerPause} style={{ flex: 1 }} /><Button title="End early" variant="danger" onPress={() => setEndEarlyPrompt(true)} style={{ flex: 1 }} /></Row>}>
        <ViewSwap key="overview">
        <View style={{ position: 'relative', zIndex: 50, elevation: 50 }}>{renderStatus()}{renderLiveCelebration()}</View>
        <Card>
          <Row gap="sm" style={{ alignItems: 'flex-start' }}>
            <ToneIconTile name="workout" size={36} iconSize={19} tone={focusTone} />
            <View style={{ flex: 1 }}>
              <Text variant="title" tint={colors.tones[focusTone].text} italic>Workout Focus: {workoutOverview(plan).focus}</Text>
              {workoutOverview(plan).primaryGroups.length > 0 && (
                <Text variant="body" tint={colors.tones[focusTone].text} style={{ marginTop: spacing.xs }}>
                  {workoutOverview(plan).primaryGroups.join(' · ')}
                </Text>
              )}
            </View>
          </Row>
        </Card>
        <WorkoutDetails plan={plan} weightUnit={weightUnit} performed={record.performed} showProgress showHeading={false} onChangePlan={applyPlanEdit} onChangePerformedSet={updateSet} onOpenExercise={openExercise} onLogAllSets={logAllSets} highlightedExerciseId={overviewHighlightExerciseId} />
        </ViewSwap>
        {renderEndEarlyPrompt()}
      </Screen>
    );
  }

  if (view === 'exercise' && selectedExercise && selectedBlock) {
    const actual = record.performed.find((exercise) => exercise.exerciseId === selectedExercise.exerciseId);
    if (!actual) return null;
    const last = actual.sets[actual.sets.length - 1];
    const mayRemove = actual.sets.length > 1 && !last?.completed && !last?.skipped;
    // The first set that is neither completed nor skipped is "now"; everything
    // before it recedes. Until ADR-0130 every set rendered identically, so
    // there was no visual answer to "which one am I on?".
    const activeSetIndex = actual.sets.findIndex((set) => !set.completed && !set.skipped);
    // A mobility flow's "sets" are rounds of the whole stage-ordered sequence
    // (ADR-0114/ADR-0404), not reps of this one pose — showing every round at
    // once here would read as "do Sun salutation twice in a row," which isn't
    // how a flow works. Manual tracking must agree with the touchless guided
    // player (ADR-0405) on ordering, differing only in pacing: slice to the
    // single current round, and completing it (toggleIndividualSet/toggleExercise
    // above) always advances to the next pose rather than asking for this
    // pose's next round first.
    const isMobilityFlow = selectedBlock.modality === 'mobility';
    const roundIndex = activeSetIndex === -1 ? Math.max(0, actual.sets.length - 1) : activeSetIndex;
    const displaySets = isMobilityFlow ? [actual.sets[roundIndex]] : actual.sets;
    return (
      <Screen footer={<Row gap="sm"><Button title={record.pausedAt ? 'Resume workout' : 'Pause workout'} variant="secondary" onPress={toggleTimerPause} style={{ flex: 1 }} /><Button title="End early" variant="danger" onPress={() => setEndEarlyPrompt(true)} style={{ flex: 1 }} /></Row>}>
        <ViewSwap key="exercise">
          <View style={{ position: 'relative', zIndex: 50, elevation: 50 }}>{renderStatus()}{renderLiveCelebration()}</View>
          <ExerciseAdjustView
            exercise={selectedExercise}
            sets={displaySets}
            weightUnit={weightUnit}
            equipment={equipment}
            workoutType={plan.workoutType}
            modality={selectedBlock.modality}
            eyebrow={isMobilityFlow ? `ROUND ${roundIndex + 1} OF ${actual.sets.length}` : `${actual.sets.filter((set) => set.completed || set.skipped).length} OF ${actual.sets.length} SETS`}
            onClose={() => returnToOverview(selectedExercise.exerciseId)}
            onUpdateSet={(index, patch) => updateSet(selectedExercise.exerciseId, isMobilityFlow ? roundIndex : index, patch)}
            onToggleSet={(index) => toggleIndividualSet(selectedExercise.exerciseId, isMobilityFlow ? roundIndex : index)}
            onToggleAll={() => toggleExercise(selectedExercise.exerciseId, isMobilityFlow ? [roundIndex] : actual.sets.map((_set, index) => index))}
            allComplete={isMobilityFlow ? Boolean(displaySets[0]?.completed || displaySets[0]?.skipped) : completed(actual.sets)}
            activeSetIndex={isMobilityFlow ? 0 : activeSetIndex}
            onAddSet={isMobilityFlow ? undefined : () => addSet(selectedExercise.exerciseId)}
            onRemoveSet={isMobilityFlow ? undefined : () => removeSet(selectedExercise.exerciseId)}
            canRemoveSet={mayRemove}
            onRemoveExercise={() => removeExercise(selectedExercise.exerciseId)}
            canRemoveExercise={selectedBlock.exercises.length > 1}
            replaceDisabledMessage={actual.sets.some((set) => set.completed || set.skipped) ? 'Replacing an exercise is unavailable after you log a set.' : undefined}
            onReplace={(replacementId, options) => replaceLiveExercise(selectedExercise.exerciseId, replacementId, options)}
            experience={getAthleteProfile()?.experience}
            history={listEngineHistory()}
          />
        </ViewSwap>
        {renderExerciseDebrief()}
        {renderEndEarlyPrompt()}
      </Screen>
    );
  }

  const roundCount = selectedGroup[0]?.sets.length ?? 0;
  return <Screen>
    <View style={{ position: 'relative' }}>{renderStatus()}{renderLiveCelebration()}</View>
    <ExerciseHero name="Superset" exercise={EXERCISES.find((exercise) => exercise.id === selectedGroup[0]?.exerciseId)} workoutType={plan.workoutType} modality={selectedBlock?.modality} eyebrow={`ROUND ${round + 1} OF ${roundCount}`} onHowTo={() => setSupersetAction('howto')} onReplace={() => setSupersetAction('replace')} onHistory={() => setSupersetAction('history')} onOverview={() => returnToOverview()} />
    <Card elevated>
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: spacing.xs }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="subtitle">Set {round + 1}</Text>
            <Text variant="caption" color="textMuted">{round + 1} / {roundCount}</Text>
          </Row>
          <Meter value={round + 1} max={Math.max(roundCount, 1)} style={{ height: 5 }} />
        </View>
        {selectedGroup.map((exercise) => {
          const actual = record.performed.find((item) => item.exerciseId === exercise.exerciseId);
          const set = actual?.sets[round];
          if (!actual || !set) return null;
          return <SetRow
            key={exercise.exerciseId}
            exercise={exercise}
            set={set}
            setIndex={round}
            completed={Boolean(set.completed)}
            skipped={Boolean(set.skipped)}
            weightUnit={weightUnit}
            equipment={equipment}
            title={exercise.name}
            muscleLabel={exercise.primaryAreas.map((area) => area.group ? MUSCLE_GROUP_LABELS[area.group] : area.region ?? 'Target area').join(' · ')}
            compact
            showSetLabel={false}
            showCompletion
            onUpdate={(patch) => updateSet(exercise.exerciseId, round, patch)}
            onToggle={() => toggleIndividualSet(exercise.exerciseId, round)}
          />;
        })}
        <Row gap="sm"><Button title="Previous round" variant="secondary" size="sm" disabled={round === 0} onPress={() => setRound((current) => Math.max(0, current - 1))} style={{ flex: 1 }} /><Button title="Next round" size="sm" disabled={round >= roundCount - 1} onPress={() => setRound((current) => Math.min(roundCount - 1, current + 1))} style={{ flex: 1 }} /></Row>
        <Row gap="sm"><Button title="Add set" variant="secondary" size="sm" onPress={() => adjustSupersetSetCount(1)} style={{ flex: 1 }} /><Button title="Remove set" variant="quiet" size="sm" disabled={roundCount <= 1} onPress={() => adjustSupersetSetCount(-1)} style={{ flex: 1 }} /></Row>
      </View>
    </Card>

    <Modal visible={supersetAction != null} transparent animationType="fade" onRequestClose={() => setSupersetAction(null)}><View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.overlay }}><Card elevated><View style={{ gap: spacing.md }}><Text variant="caption" color="primaryTextSoft" weight="bold">SUPERSET</Text><Text variant="title" italic>Choose an exercise</Text><Text variant="body" color="textMuted">Which exercise do you want to {supersetAction === 'howto' ? 'learn' : supersetAction === 'history' ? 'view history for' : 'replace'}?</Text>{selectedGroup.map((exercise) => <Button key={exercise.exerciseId} title={exercise.name} variant="secondary" onPress={() => { if (supersetAction === 'howto') { setFocusExerciseId(exercise.exerciseId); setHowToOpen(true); } else if (supersetAction === 'history') setHistoryExerciseId(exercise.exerciseId); else { setFocusExerciseId(exercise.exerciseId); setReplaceOpen(true); } setSupersetAction(null); }} fullWidth />)}<Button title="Cancel" variant="quiet" onPress={() => setSupersetAction(null)} fullWidth /></View></Card></View></Modal>
    {renderEndEarlyPrompt()}
    {renderModals()}
  </Screen>;

  function renderEndEarlyPrompt() {
    return (
      <Modal visible={endEarlyPrompt} transparent animationType="fade" onRequestClose={() => setEndEarlyPrompt(false)}><View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.overlay }}><Card elevated><View style={{ gap: spacing.md }}><Text variant="caption" color="primaryTextSoft" weight="bold">ENDING EARLY</Text><Text variant="title" italic>What&apos;s cutting it short?</Text><Text variant="body" color="textMuted">This tells the app whether to ease off next time — running out of time shouldn&apos;t make your next session lighter.</Text><Button title="Out of time" variant="secondary" onPress={() => finishEarly('out_of_time')} fullWidth /><Button title="Too hard today" variant="secondary" onPress={() => finishEarly('too_hard')} fullWidth /><Button title="Something else" variant="secondary" onPress={() => finishEarly('other')} fullWidth /><Button title="Keep going" variant="quiet" onPress={() => setEndEarlyPrompt(false)} fullWidth /></View></Card></View></Modal>
    );
  }

  function finishEarly(reason: EndedEarlyReason) {
    setEndEarlyPrompt(false);
    const ended = endEarly(reason);
    router.push(ended ? '/debrief' : '/');
  }

  function renderModals() {
    return <>
    <ExerciseHistorySheet exerciseId={historyExerciseId} exerciseName={EXERCISES.find((exercise) => exercise.id === historyExerciseId)?.name} weightUnit={weightUnit} onClose={() => setHistoryExerciseId(null)} />
    <HowToSheet visible={howToOpen} onClose={() => setHowToOpen(false)} name={focusedExercise?.name ?? ''} exercise={focusedCatalog} />
      <ExercisePickerSheet visible={replaceOpen} onClose={() => setReplaceOpen(false)} title={`Replace ${focusedExercise?.name ?? 'exercise'}`} exercises={alternates} rank={rankAlternate} logCount={alternateLogCount} ownsEquipment={ownsAlternateEquipment} actionLabel="Use this" disabledMessage={focusedPerformed?.sets.some((set) => set.completed || set.skipped) ? 'Replacing an exercise is unavailable after you log a set.' : undefined} onPick={replaceFocusedExercise} />
    </>;
  }

  function renderExerciseDebrief() {
    const exercise = debriefExerciseId ? activeRecord.performed.find((item) => item.exerciseId === debriefExerciseId) : undefined;
    const planned = debriefExerciseId ? activePlan.blocks.flatMap((block) => block.exercises).find((item) => item.exerciseId === debriefExerciseId) : undefined;
    if (!exercise || !planned) return null;
    const isFlow = familyOfWorkoutType(activePlan.workoutType) === 'mobility';
    const isCardio = activePlan.workoutType === 'cardio';
    const prompt = isFlow ? 'How did that feel?' : isCardio ? 'How hard did that feel?' : 'How many more reps could you have done?';
    return (
      <SheetModal
        visible
        onClose={() => closeExerciseDebrief()}
        eyebrow="EXERCISE COMPLETE"
        title={exercise.name}
        closeLabel="Return to workout overview"
      >
        <View style={{ gap: spacing.md }}>
          <Text variant="subtitle">{prompt}</Text>
          <Text variant="body" color="textMuted">
            {isFlow ? 'Adjust your comfort level if you want to.' : isCardio ? 'Adjust the effort for this interval if you want to.' : 'Think about your hardest set.'}
          </Text>
          {isFlow || isCardio ? (
            <Stepper
              value={debriefRpe}
              onChange={setDebriefRpe}
              min={1}
              max={10}
              unit={isFlow ? 'comfort level' : 'RPE'}
              style={{ alignSelf: 'center', width: 240 }}
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              <Row gap="sm" wrap>
                {REPS_LEFT_OPTIONS.map((repsLeft) => (
                  <Chip
                    key={repsLeft}
                    label={repsLeft === 5 ? '5+' : String(repsLeft)}
                    selected={Math.min(5, Math.max(0, 10 - debriefRpe)) === repsLeft}
                    onPress={() => setDebriefRpe(Math.max(1, 10 - repsLeft))}
                  />
                ))}
              </Row>
              <Text variant="caption" color="textMuted">0 = all-out effort · 5+ = plenty left</Text>
            </View>
          )}
          <Button title="Continue to overview" onPress={() => closeExerciseDebrief(true)} fullWidth />
        </View>
      </SheetModal>
    );
  }
}
