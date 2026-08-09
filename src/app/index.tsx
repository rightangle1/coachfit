/**
 * "Today" — prebrief entry point. Redirects to onboarding/equipment on first
 * run; otherwise builds a real adaptive session from the persisted athlete,
 * equipment, and history (no more sample data — this is the real loop).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, ScrollView, View } from 'react-native';

import {
  ActionRow,
  Button,
  Card,
  Chip,
  ChoiceTile,
  GoalHero,
  Icon,
  PressScale,
  Row,
  Screen,
  Skeleton,
  SkeletonCard,
  Text,
  TrendChart,
  useTheme,
} from '@/design';
import { RecoverySheet } from '@/features/recovery-sheet';
import { WorkoutDetails } from '@/features/workout-details';
import { initStorage } from '@/data/persistence';
import { generateSession } from '@/services/programming';
import { getAthleteProfile, hasAthleteProfile, saveAthleteProfile } from '@/services/athlete';
import { getEquipmentInventory, hasEquipmentInventory, saveEquipmentInventory } from '@/services/equipment';
import { getExercisePreferences } from '@/services/exercise-preferences';
import {
  currentFatigue,
  getActiveSessionRecord,
  getPlan,
  listHistory,
  listEngineHistory,
  savePlan,
} from '@/services/sessions';
import { useWorkoutStore } from '@/state/workout-store';
import { ageYearsOf } from '@/domain/types';
import type {
  AthleteProfile,
  AvoidanceFlag,
  BodyArea,
  EmphasisMode,
  EquipmentInventory,
  SessionPlan,
  ScheduledWorkout,
  WorkoutType,
  BodybuildingRotation,
  CardioIntent,
  FlowPace,
  MuscleGroup,
} from '@/domain/types';
import { CONCERN_OPTIONS, EMPHASIS_OPTIONS, FULL_BODY_EMPHASIS_OPTION, MODALITY_LABELS, MUSCLE_GROUP_LABELS, WORKOUT_TYPE_OPTIONS, areaKey } from '@/app-lib/options';
import { recommendWorkoutType, recoverySummary, weeklyPerformance, weeklyVolumeSummary } from '@/app-lib/presentation';
import { primaryGoal } from '@/app-lib/personalization';
import { needsAppTour } from '@/app-lib/app-tour';

type Severity = 'mild' | 'severe';
type TrainingIntent = 'recovery' | 'balanced' | 'challenge';
type PerformanceMetric = 'strength' | 'endurance' | 'calories' | 'workouts';

const PRIMARY_METRIC: Record<string, PerformanceMetric> = {
  strength: 'strength',
  cardio: 'endurance',
  general: 'calories',
  mobility: 'workouts',
};

const METRIC_LABELS: Record<PerformanceMetric, string> = {
  strength: 'Strength',
  endurance: 'Endurance',
  calories: 'Calories burned',
  workouts: 'Workouts',
};

const READY_OPTIONS = {
  sleep: [
    { label: 'Low', value: 2 },
    { label: 'Okay', value: 3 },
    { label: 'Great', value: 4 },
  ],
  energy: [
    { label: 'Low', value: 2 },
    { label: 'Okay', value: 3 },
    { label: 'Great', value: 4 },
  ],
  soreness: [
    { label: 'None', value: 1 },
    { label: 'Some', value: 3 },
    { label: 'A lot', value: 4 },
  ],
} as const;

const INTENT_OPTIONS: { label: string; value: TrainingIntent; caption: string }[] = [
  { label: 'Ease in', value: 'recovery', caption: 'Lower volume, gentler effort' },
  { label: 'Balanced', value: 'balanced', caption: 'Your normal training day' },
  { label: 'Push', value: 'challenge', caption: 'A little more challenge' },
];

const BODYBUILDING_ROTATIONS: { label: string; value: BodybuildingRotation; caption: string }[] = [
  { label: 'Straight sets', value: 'straight', caption: 'Finish all working sets before moving on.' },
  { label: 'Supersets', value: 'superset', caption: 'Alternate two compatible exercises before resting.' },
  { label: 'Tri-sets', value: 'triset', caption: 'Move through three compatible exercises, then rest.' },
];

const CARDIO_INTENTS: { label: string; value: CardioIntent; caption: string }[] = [
  { label: 'Easy base', value: 'base', caption: 'Conversational, steady work that builds endurance.' },
  { label: 'Intervals', value: 'intervals', caption: 'Timed work and recovery rounds with clear RPE targets.' },
  { label: 'Benchmark', value: 'benchmark', caption: 'Repeatable steady effort for comparing pace and distance.' },
];

const FLOW_DURATIONS = [10, 20, 30] as const;
const SESSION_DURATIONS = [10, 20, 30, 40, 50, 60] as const;

const FULL_BODY_KEY = areaKey(FULL_BODY_EMPHASIS_OPTION.area);

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

// Hidden for now while we simplify the Today screen — the underlying
// scheduling (scheduleWorkout/clearScheduledWorkout) stays wired up so this
// can come back without re-plumbing anything.
const SHOW_WEEK_AHEAD = false;

function todayLabel(): string {
  return new Date()
    .toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase();
}

/** Scrolls `marker` into view within its nearest scrolling ancestor. On web the
 * forwarded ScrollView ref is unreliable here — it resolves to a stale/duplicate
 * instance across this Tabs-preserved screen — so we walk the DOM instead;
 * native uses the ScrollView ref with the marker's layout-relative y. */
function scrollMarkerIntoView(
  marker: View | null,
  scrollRef: React.RefObject<ScrollView | null>,
  layoutY: number,
  animated: boolean,
) {
  if (Platform.OS === 'web') {
    const el = marker as unknown as HTMLElement | null;
    el?.scrollIntoView({ behavior: animated ? 'smooth' : 'auto', block: 'start' });
  } else {
    scrollRef.current?.scrollTo({ y: layoutY, animated });
  }
}

function localDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

function workoutLabel(type: WorkoutType | undefined): string {
  if (!type) return 'Balanced';
  return type[0].toUpperCase() + type.slice(1);
}

function workoutOverview(plan: SessionPlan): { focus: string; primaryGroups: string[] } {
  const mainBlock = plan.blocks.find((block) => block.label.toLowerCase().includes('main'))
    ?? plan.blocks.find((block) => !/warm|cool|condition/.test(block.label.toLowerCase()))
    ?? plan.blocks[0];
  const focus = plan.workoutType === 'yoga'
    ? 'Yoga flow'
    : plan.workoutType === 'stretch'
      ? 'Stretch flow'
      : mainBlock
        ? MODALITY_LABELS[mainBlock.modality]
        : workoutLabel(plan.workoutType);
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

export default function TodayScreen() {
  const { colors, radii, spacing } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ scrollTo?: string; recovery?: string; checkin?: string }>();

  const activeRecord = useWorkoutStore((s) => s.record);
  const startWorkout = useWorkoutStore((s) => s.start);
  const endEarly = useWorkoutStore((s) => s.endEarly);
  const setBuiltPlan = useWorkoutStore((s) => s.setBuiltPlan);

  const [ready, setReady] = useState(false);
  // Session generation is awaited; before ADR-0130 the button stayed fully
  // enabled and unchanged while it ran, so a slow build looked like a dead tap.
  const [building, setBuilding] = useState(false);
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [equipment, setEquipment] = useState<EquipmentInventory | null>(null);

  const [sleep, setSleep] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [soreness, setSoreness] = useState(1);
  const [showRecovery, setShowRecovery] = useState(false);
  const [trainingIntent, setTrainingIntent] = useState<TrainingIntent>('balanced');
  const [workoutType, setWorkoutType] = useState<WorkoutType | undefined>(undefined);
  const [bodybuildingRotation, setBodybuildingRotation] = useState<BodybuildingRotation>('straight');
  const [cardioIntent, setCardioIntent] = useState<CardioIntent>('base');
  const [flowDurationMin, setFlowDurationMin] = useState<number>(20);
  const [flowPace, setFlowPace] = useState<FlowPace>('standard');
  const [targetDurationMin, setTargetDurationMin] = useState<number>(30);
  const [includeWarmup, setIncludeWarmup] = useState(() => getExercisePreferences().defaultIncludeWarmup);
  const [includeConditioning, setIncludeConditioning] = useState(() => getExercisePreferences().defaultIncludeConditioning);
  const [includeCooldown, setIncludeCooldown] = useState(() => getExercisePreferences().defaultIncludeCooldown);
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [emphasize, setEmphasize] = useState<Set<string>>(new Set());
  const [emphasizeTouched, setEmphasizeTouched] = useState(false);
  const [emphasisMode, setEmphasisMode] = useState<EmphasisMode>('balanced');
  const [concerns, setConcerns] = useState<Map<string, Severity>>(new Map());
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const pendingScrollToPlan = useRef(false);
  const planMarkerRef = useRef<View>(null);
  const buildAreaY = useRef(0);
  const buildMarkerRef = useRef<View>(null);
  const checkinAreaY = useRef(0);
  const checkinMarkerRef = useRef<View>(null);
  const pendingScrollToCheckin = useRef(false);
  const [scheduledWorkouts, setScheduledWorkouts] = useState<ScheduledWorkout[]>([]);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [weekStart] = useState(() => localDay(Date.now()));

  // Recovery details can be opened from a CoachFit link in addition to the
  // hero card, making the same real readout easy to revisit directly.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- route params intentionally open this controlled sheet
    if (params.recovery === '1') setShowRecovery(true);
  }, [params.recovery]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- route params intentionally open this controlled sheet
    if (params.checkin === '1') setShowAdjustments(true);
  }, [params.checkin]);

  // A focus effect, not a mount effect: Tabs keeps this screen mounted once
  // visited, so a plain useEffect would only ever see the athlete/equipment
  // state from the very first load — e.g. still-empty during the redirect to
  // onboarding — and never re-check after the user finishes setup and comes
  // back to this tab, leaving it permanently stuck on `ready === false`.
  useFocusEffect(
    useCallback(() => {
      initStorage();
      if (!hasAthleteProfile()) {
        router.replace('/onboarding');
        return;
      }
      if (!hasEquipmentInventory()) {
        router.replace('/equipment');
        return;
      }
      if (needsAppTour(getAthleteProfile())) {
        router.replace('/tour');
        return;
      }
      // Rehydrate an in-progress workout the store doesn't know about yet — e.g.
      // after a killed app or a browser reload (ADR-0108 resumability).
      if (!useWorkoutStore.getState().record) {
        const active = getActiveSessionRecord();
        const activePlan = active ? getPlan(active.planId) : undefined;
        if (active && activePlan) useWorkoutStore.getState().hydrate(activePlan, active);
      }

      const timer = setTimeout(() => {
        const profile = getAthleteProfile() ?? null;
        const scheduled = profile?.scheduledWorkouts ?? [];
        const todaysSchedule = scheduled.find((item) => localDay(item.plannedFor) === localDay(Date.now()));
        setAthlete(profile);
        setScheduledWorkouts(scheduled);
        if (todaysSchedule) {
          setWorkoutType(todaysSchedule.workoutType);
          setTrainingIntent(todaysSchedule.trainingIntent ?? 'balanced');
          setBodybuildingRotation(todaysSchedule.workoutOptions?.bodybuildingRotation ?? 'straight');
          setCardioIntent(todaysSchedule.workoutOptions?.cardioIntent ?? 'base');
          setFlowDurationMin(todaysSchedule.workoutOptions?.flow?.durationMin ?? 20);
          setFlowPace(todaysSchedule.workoutOptions?.flow?.pace ?? 'standard');
          const workoutDefaults = getExercisePreferences();
          setIncludeWarmup(todaysSchedule.workoutOptions?.includeWarmup ?? workoutDefaults.defaultIncludeWarmup);
          setIncludeConditioning(todaysSchedule.workoutOptions?.includeConditioning ?? workoutDefaults.defaultIncludeConditioning);
          setIncludeCooldown(todaysSchedule.workoutOptions?.includeCooldown ?? workoutDefaults.defaultIncludeCooldown);
        } else if (profile) {
          // No explicit plan for today — the athlete's standing style
          // preference wins if set; otherwise preselect from goal weights.
          // The chips below still let them pick something else either way.
          setWorkoutType(profile.preferredWorkoutType ?? recommendWorkoutType(profile.goals));
        }
        setEquipment(getEquipmentInventory() ?? null);
        setReady(true);
      }, 0);
      return () => clearTimeout(timer);
    }, [router]),
  );

  // Cancelling out of the preloaded-workout screen sends the athlete back
  // here with ?scrollTo=build so they land back where they were, not at the
  // top of Today.
  useFocusEffect(
    useCallback(() => {
      if (params.scrollTo === 'checkin') {
        // A link can arrive before this lower card has measured. Let its
        // onLayout handler perform the scroll once the real position exists.
        pendingScrollToCheckin.current = true;
        router.setParams({ scrollTo: undefined });
        return;
      }
      const target = params.scrollTo === 'build'
        ? { marker: buildMarkerRef.current, y: buildAreaY.current }
        : null;
      if (!target) return;
      requestAnimationFrame(() => scrollMarkerIntoView(target.marker, scrollRef, target.y, false));
      router.setParams({ scrollTo: undefined });
    }, [params.scrollTo, router]),
  );

  const inProgress = activeRecord != null && activeRecord.completedAt == null;

  const history = useMemo(() => (ready ? listHistory(20) : []), [ready]);
  const focusGoal = primaryGoal(athlete?.goals);
  const [selectedMetric, setSelectedMetric] = useState<PerformanceMetric | null>(null);
  const [showProgressDetails, setShowProgressDetails] = useState(false);

  const fatigue = useMemo(
    () => (ready ? currentFatigue(ageYearsOf(athlete ?? {})) : { byGroup: {}, updatedAt: 0 }),
    [ready, athlete],
  );
  const recovery = useMemo(() => recoverySummary(fatigue), [fatigue]);
  // Groups the fatigue engine considers fully recovered — a trainer would bias
  // today's focus toward these first, capped to the same 2-area limit as manual
  // picks (toggleEmphasis). Purely a suggestion: the athlete can still adjust it.
  const recommendedEmphasis = useMemo(
    () => EMPHASIS_OPTIONS.filter((o) => o.area.group && recovery.fresh.includes(o.area.group)).slice(0, 2),
    [recovery.fresh],
  );
  // Seed the chip selection from the recovery-based recommendation exactly once,
  // as soon as it's known — but never stomp on a choice the athlete already made.
  // Skipped for Sculpting, whose own effect below seeds Full Body instead.
  useEffect(() => {
    if (!ready || emphasizeTouched || workoutType === 'sculpting' || recommendedEmphasis.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time recommendation seeds an editable control
    setEmphasize(new Set(recommendedEmphasis.map((o) => areaKey(o.area))));
  }, [ready, emphasizeTouched, workoutType, recommendedEmphasis]);
  // Sculpting's whole point is full-body coverage (ADR-0124) — default the
  // target-muscles picker to "Full Body" whenever Sculpting becomes active
  // (standing preference on load, a scheduled workout, or a manual chip tap),
  // without stomping on an emphasis the athlete already picked themselves.
  useEffect(() => {
    if (!ready || emphasizeTouched || workoutType !== 'sculpting') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- style default seeds an editable control
    setEmphasize(new Set([FULL_BODY_KEY]));
  }, [ready, emphasizeTouched, workoutType]);
  const selectedEmphasisLabels = useMemo(
    () => emphasize.has(FULL_BODY_KEY)
      ? [FULL_BODY_EMPHASIS_OPTION.label]
      : EMPHASIS_OPTIONS.filter((option) => emphasize.has(areaKey(option.area))).map((option) => option.label),
    [emphasize],
  );
  const selectedComponentsLabel = [
    includeWarmup ? 'Warmup' : null,
    workoutType !== 'cardio' && includeConditioning ? 'Conditioning' : null,
    includeCooldown ? 'Cool down' : null,
  ].filter((item): item is string => item != null).join(' · ') || 'Main workout only';
  const weeklyTarget = useMemo(() => weeklyVolumeSummary(history), [history]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, offset) => weekStart + offset * 86_400_000), [weekStart]);
  const performance = useMemo(
    () => weeklyPerformance(history, weekStart, athlete?.weightUnit ?? 'kg', athlete?.bodyweightKg),
    [athlete?.bodyweightKg, athlete?.weightUnit, history, weekStart],
  );
  const highlightedMetric = selectedMetric ?? PRIMARY_METRIC[focusGoal];
  const orderedMetrics = useMemo(() => {
    const primary = PRIMARY_METRIC[focusGoal];
    return [primary, ...(['strength', 'endurance', 'calories', 'workouts'] as PerformanceMetric[]).filter((metric) => metric !== primary)];
  }, [focusGoal]);
  const metricValue = useCallback((metric: PerformanceMetric) => {
    const total = performance.values[metric].reduce((sum, value) => sum + value, 0);
    switch (metric) {
      case 'strength': {
        const rounded = Math.round(total);
        const value = rounded >= 1000 ? `${(rounded / 1000).toFixed(1)}k` : String(rounded);
        return `${value} ${athlete?.weightUnit ?? 'kg'}`;
      }
      case 'endurance': return `${Math.round(total)} min`;
      case 'calories': return `${Math.round(total).toLocaleString()} kcal`;
      case 'workouts': return String(Math.round(total));
    }
  }, [athlete?.weightUnit, performance.values]);

  // Full Body is mutually exclusive with the individual muscle-group chips
  // (ADR-0124): picking it clears any selected groups, and picking a group
  // clears Full Body first.
  function toggleEmphasis(key: string) {
    setEmphasizeTouched(true);
    setEmphasize((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); return next; }
      if (key === FULL_BODY_KEY) { next.clear(); next.add(key); return next; }
      next.delete(FULL_BODY_KEY);
      if (next.size < 2) next.add(key);
      return next;
    });
  }

  const hasYogaMat = equipment?.items.some((item) => item.type === 'yoga_mat') ?? false;

  function addYogaMat() {
    if (!equipment || hasYogaMat) return;
    const next: EquipmentInventory = { items: [...equipment.items, { type: 'yoga_mat' }] };
    setEquipment(next);
    saveEquipmentInventory(next);
  }

  function cycleConcern(key: string) {
    setConcerns((prev) => {
      const next = new Map(prev);
      const cur = next.get(key);
      if (!cur) next.set(key, 'mild');
      else if (cur === 'mild') next.set(key, 'severe');
      else next.delete(key);
      return next;
    });
  }

  function concernLabel(label: string, key: string): string {
    const sev = concerns.get(key);
    return sev ? `${label} · ${sev}` : label;
  }

  async function build() {
    if (!athlete || !equipment || building) return;
    setBuilding(true);
    try {
      await runBuild();
    } finally {
      setBuilding(false);
    }
  }

  async function runBuild() {
    if (!athlete || !equipment) return;
    const now = Date.now();
    const emphasizeAreas: BodyArea[] = emphasize.has(FULL_BODY_KEY)
      ? [FULL_BODY_EMPHASIS_OPTION.area]
      : EMPHASIS_OPTIONS.filter((o) => emphasize.has(areaKey(o.area))).map((o) => o.area);
    const flags: AvoidanceFlag[] = CONCERN_OPTIONS.filter((c) => concerns.has(areaKey(c.area))).map(
      (c) => ({ area: c.area, severity: concerns.get(areaKey(c.area)) as Severity }),
    );

    const p = await generateSession({
      plannedFor: now,
      athlete,
      equipment,
      history: listEngineHistory(),
      fatigue: currentFatigue(ageYearsOf(athlete)),
      readiness: { sleepQuality: sleep, energy, soreness },
      trainingIntent,
      targetDurationMin,
      workoutType,
      workoutOptions: {
        ...(workoutType === 'bodybuilding' || workoutType === 'sculpting' ? { bodybuildingRotation } : {}),
        ...(workoutType === 'cardio' ? { cardioIntent } : {}),
        ...((workoutType === 'stretch' || workoutType === 'yoga')
          ? { flow: { durationMin: flowDurationMin, pace: flowPace } }
          : { includeWarmup, includeConditioning, includeCooldown }),
      },
      goals: athlete.goals,
      targeting: { emphasize: emphasizeAreas, avoid: [], emphasisMode },
      avoidToday: { flags },
      excludedExerciseIds: getExercisePreferences().excludedExerciseIds,
      favoriteExerciseIds: getExercisePreferences().favoriteExerciseIds,
    });
    savePlan(p);
    setPlan(p);
    setBuiltPlan(p);
    pendingScrollToPlan.current = true;
  }

  function onStartWorkout() {
    if (!plan) return;
    savePlan(plan); // persist any user-edited rotation before the record starts.
    startWorkout(plan);
    router.push('/workout');
  }

  function onResumeWorkout() {
    router.push('/workout');
  }

  function onEndEarly() {
    const ended = endEarly();
    if (ended) router.push('/debrief');
  }

  function scheduleWorkout(day: number) {
    if (!athlete) return;
    const entry: ScheduledWorkout = {
      plannedFor: day,
      workoutType,
      workoutOptions: {
        ...(workoutType === 'bodybuilding' || workoutType === 'sculpting' ? { bodybuildingRotation } : {}),
        ...(workoutType === 'cardio' ? { cardioIntent } : {}),
        ...((workoutType === 'stretch' || workoutType === 'yoga')
          ? { flow: { durationMin: flowDurationMin, pace: flowPace } }
          : { includeWarmup, includeConditioning, includeCooldown }),
      },
      trainingIntent,
    };
    const next = [...scheduledWorkouts.filter((item) => localDay(item.plannedFor) !== day), entry];
    setScheduledWorkouts(next);
    const nextAthlete = { ...athlete, scheduledWorkouts: next };
    setAthlete(nextAthlete);
    saveAthleteProfile(nextAthlete);
  }

  function clearScheduledWorkout(day: number) {
    if (!athlete) return;
    const next = scheduledWorkouts.filter((item) => localDay(item.plannedFor) !== day);
    setScheduledWorkouts(next);
    const nextAthlete = { ...athlete, scheduledWorkouts: next };
    setAthlete(nextAthlete);
    saveAthleteProfile(nextAthlete);
  }

  // Reading local storage used to render a blank screen here. A skeleton keeps
  // the page's shape while it loads (ADR-0130).
  if (!ready) {
    return (
      <Screen>
        <Skeleton height={346} radius={radii.xxl} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }

  return (
    <Screen ref={scrollRef}>
      <GoalHero goal={focusGoal} compact style={{ minHeight: 270 }}>
        <View style={{ gap: spacing.md }}>
          <View>
            <Text variant="caption" color="heroMuted" weight="bold">{todayLabel()}</Text>
            <Text variant="title" color="heroText" italic style={{ marginTop: 2 }}>Today&apos;s training</Text>
          </View>

          <PressScale
            accessibilityRole="button"
            accessibilityLabel="View muscle recovery details"
            onPress={() => setShowRecovery(true)}
            haptic="selection"
            style={{
              padding: spacing.sm,
              borderRadius: radii.md,
              backgroundColor: colors.heroPill,
            }}
          >
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="caption" color="heroMuted" weight="bold">MUSCLE RECOVERY</Text>
              <Text variant="caption" color="heroText">Details ›</Text>
            </Row>
            <Text variant="label" color="heroText" style={{ marginTop: 2 }}>
              {recovery.fresh.length} fresh · {recovery.recovering.length} recovering · {recovery.fatigued.length} fatigued
            </Text>
          </PressScale>

          <View>
            <Text variant="caption" color="heroMuted" weight="bold">KEY PERFORMANCE · LAST 7 DAYS</Text>
            <Row gap="sm" style={{ marginTop: spacing.sm }}>
              {orderedMetrics.slice(0, 2).map((metric) => (
                <PressScale
                  key={metric}
                  haptic="selection"
                  accessibilityRole="button"
                  accessibilityLabel={`View ${METRIC_LABELS[metric]} progress`}
                  onPress={() => {
                    setSelectedMetric(metric);
                    setShowProgressDetails(true);
                  }}
                  style={{
                    flex: 1,
                    minHeight: 56,
                    padding: spacing.sm,
                    borderRadius: radii.md,
                    backgroundColor: colors.heroPill,
                  }}
                >
                  <Text variant="caption" color="heroMuted" weight="bold">{METRIC_LABELS[metric].toUpperCase()}</Text>
                  <Text variant="subtitle" color="heroText" style={{ marginTop: 2 }}>{metricValue(metric)}</Text>
                </PressScale>
              ))}
            </Row>
            <PressScale
              onPress={() => setShowProgressDetails((shown) => !shown)}
              haptic="selection"
              accessibilityRole="button"
              accessibilityState={{ expanded: showProgressDetails }}
              accessibilityLabel={showProgressDetails ? 'Hide weekly progress' : 'View weekly progress'}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', marginTop: spacing.sm }}
            >
              <Text variant="caption" color="heroText" weight="bold">
                {showProgressDetails ? 'HIDE WEEKLY PROGRESS' : 'VIEW WEEKLY PROGRESS'}
              </Text>
              <Icon name={showProgressDetails ? 'chevronUp' : 'chevronDown'} size={15} color="heroText" />
            </PressScale>
          </View>
        </View>
      </GoalHero>

      {showProgressDetails && (
        <Card>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View>
              <Text variant="caption" color="textFaint" weight="bold">LAST 7 DAYS</Text>
              <Text variant="heading" style={{ marginTop: 2 }}>{METRIC_LABELS[highlightedMetric]}</Text>
            </View>
            <Text variant="label" color="primaryTextSoft">{metricValue(highlightedMetric)}</Text>
          </Row>
          <Row gap="sm" wrap style={{ marginTop: spacing.md }}>
            {orderedMetrics.map((metric) => (
              <Chip key={metric} label={METRIC_LABELS[metric]} selected={highlightedMetric === metric} onPress={() => setSelectedMetric(metric)} />
            ))}
          </Row>
          <View style={{ marginTop: spacing.md }}>
            <TrendChart
              points={performance.days.map((day, index) => ({ label: day.label, value: performance.values[highlightedMetric][index] }))}
              type={highlightedMetric === 'workouts' ? 'bar' : 'line'}
              valueFormatter={(value) => highlightedMetric === 'endurance' ? `${Math.round(value)}m` : Math.round(value).toLocaleString()}
            />
          </View>
        </Card>
      )}

      {inProgress ? (
        <Card elevated>
          <Button
            title="Resume workout"
            onPress={onResumeWorkout}
            fullWidth
          />
          {showEndConfirm ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <Text variant="caption" color="textMuted">
                Sets you haven&apos;t logged yet will be marked skipped. Your workout will be saved as done.
              </Text>
              <Row gap="md">
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setShowEndConfirm(false)}
                  style={{ flex: 1 }}
                />
                <Button title="End workout" onPress={onEndEarly} style={{ flex: 1 }} />
              </Row>
            </View>
          ) : (
            <Button
              title="End workout early"
              variant="quiet"
              size="sm"
              onPress={() => setShowEndConfirm(true)}
              style={{ marginTop: spacing.sm }}
            />
          )}
        </Card>
      ) : null}

      {SHOW_WEEK_AHEAD && !inProgress && (
        <Card>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text variant="heading">Week ahead</Text>
              <Text variant="caption" color="textMuted" style={{ marginTop: spacing.xs }}>
                Schedule a style now; its exact workout refreshes from your readiness on the day.
              </Text>
            </View>
            <Text variant="label" color="primaryTextSoft">{weeklyTarget.percent}% on target</Text>
          </Row>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {weekDays.map((day, offset) => {
              const scheduled = scheduledWorkouts.find((item) => localDay(item.plannedFor) === day);
              const label = offset === 0 ? 'Today' : new Date(day).toLocaleDateString(undefined, { weekday: 'short' });
              return (
                <Row key={day} style={{ justifyContent: 'space-between' }}>
                  <Text variant="body">{label}</Text>
                  {scheduled ? (
                    <Row gap="sm">
                      <Text variant="caption" color="primaryTextSoft">{workoutLabel(scheduled.workoutType)} · {scheduled.trainingIntent ?? 'balanced'}</Text>
                      <Button title="Clear" size="sm" variant="quiet" onPress={() => clearScheduledWorkout(day)} />
                    </Row>
                  ) : (
                    <Text variant="caption" color="textFaint">Open</Text>
                  )}
                </Row>
              );
            })}
          </View>
        </Card>
      )}

      {!inProgress && (
        <>
          <View
            ref={buildMarkerRef}
            onLayout={(e) => {
              buildAreaY.current = e.nativeEvent.layout.y;
            }}
          >
          <Card elevated>
            <View>
              <Text variant="caption" color="textFaint" weight="bold">WORKOUT BUILDER</Text>
              <Text variant="heading" italic style={{ marginTop: spacing.sm }}>Build your workout</Text>
              <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                Choose a goal, focus, and structure for today.
              </Text>
            </View>

            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                <View
                  style={{
                    padding: spacing.md,
                    borderRadius: radii.lg,
                    backgroundColor: colors.primarySoft,
                    borderWidth: 1,
                    borderColor: colors.primary,
                  }}
                >
                  <Text variant="caption" color="primaryTextSoft" weight="bold">YOUR WORKOUT SO FAR</Text>
                  <Text variant="subtitle" color="primaryTextSoft" style={{ marginTop: 2 }}>
                    {workoutLabel(workoutType)} · {workoutType === 'stretch' || workoutType === 'yoga' ? `${flowDurationMin} min` : `${targetDurationMin} min`}
                  </Text>
                  <Text variant="caption" color="primaryTextSoft" style={{ marginTop: 2 }}>
                    {selectedEmphasisLabels.length > 0 ? selectedEmphasisLabels.join(' · ') : 'Choose a focus'}
                    {workoutType !== 'stretch' && workoutType !== 'yoga' ? `  ·  ${selectedComponentsLabel}` : ''}
                  </Text>
                </View>

                <Card tone="surfaceAlt">
                  <Row gap="sm" style={{ alignItems: 'center' }}>
                    <Icon name="target" size={17} color="primaryTextSoft" />
                    <View>
                      <Text variant="caption" color="textFaint" weight="bold">1 · GOAL</Text>
                      <Text variant="subtitle">What kind of session?</Text>
                    </View>
                  </Row>
                  <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                    {chunk(WORKOUT_TYPE_OPTIONS, 2).map((row, rowIndex) => (
                      <Row key={rowIndex} gap="sm">
                        {row.map((option) => {
                          const selected = workoutType === option.value;
                          const icon = option.value === 'cardio'
                            ? 'goalCardio'
                            : option.value === 'stretch' || option.value === 'yoga'
                              ? 'goalMobility'
                              : 'goalStrength';
                          return (
                            <ChoiceTile
                              key={option.label}
                              label={option.label}
                              selected={selected}
                              onPress={() => setWorkoutType(option.value)}
                              icon={<Icon name={icon} size={18} color={selected ? 'primaryTextSoft' : 'textFaint'} />}
                              style={{
                                flex: 1,
                              }}
                            />
                          );
                        })}
                        {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
                      </Row>
                    ))}
                  </View>
                </Card>

                {workoutType !== 'yoga' && workoutType !== 'cardio' ? (
                  <Card tone="surfaceAlt">
                    <Row gap="sm" style={{ alignItems: 'center' }}>
                      <Icon name="target" size={17} color="primaryTextSoft" />
                      <View>
                        <Text variant="caption" color="textFaint" weight="bold">2 · FOCUS</Text>
                        <Text variant="subtitle">Where do you want to focus?</Text>
                      </View>
                    </Row>
                    <Text variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
                      {recommendedEmphasis.length > 0 && !emphasizeTouched
                        ? "Highlighted from today's recovery — tap to adjust (up to 2)."
                        : 'Choose up to two areas to prioritize.'}
                    </Text>
                    <Row gap="sm" wrap style={{ marginTop: spacing.md }}>
                      <Chip
                        label={FULL_BODY_EMPHASIS_OPTION.label}
                        selected={emphasize.has(FULL_BODY_KEY)}
                        onPress={() => toggleEmphasis(FULL_BODY_KEY)}
                      />
                      {EMPHASIS_OPTIONS.map((option) => {
                        const key = areaKey(option.area);
                        return <Chip key={key} label={option.label} selected={emphasize.has(key)} onPress={() => toggleEmphasis(key)} />;
                      })}
                    </Row>
                    {emphasize.size > 0 && !emphasize.has(FULL_BODY_KEY) && (
                      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md, paddingTop: spacing.md }}>
                        <Text variant="caption" color="textFaint" weight="bold">HOW MUCH</Text>
                        <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
                          <Chip label="Mostly this" selected={emphasisMode === 'balanced'} onPress={() => setEmphasisMode('balanced')} />
                          <Chip label="Only this" selected={emphasisMode === 'priority'} onPress={() => setEmphasisMode('priority')} />
                        </Row>
                        <Text variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
                          {emphasisMode === 'priority'
                            ? 'The whole main block goes to these areas. Anything unsafe or overworked is still skipped.'
                            : 'About half the main block goes to these areas, with the rest of the body still covered.'}
                        </Text>
                      </View>
                    )}
                  </Card>
                ) : (
                  <Card tone="surfaceAlt">
                    <Text variant="caption" color="textFaint" weight="bold">2 · FOCUS</Text>
                    <Text variant="subtitle" style={{ marginTop: 2 }}>
                      {workoutType === 'cardio' ? 'Build endurance your way.' : 'Make space to move.'}
                    </Text>
                  </Card>
                )}

                <Card tone="surfaceAlt">
                  <Row gap="sm" style={{ alignItems: 'center' }}>
                    <Icon name="time" size={17} color="primaryTextSoft" />
                    <View>
                      <Text variant="caption" color="textFaint" weight="bold">3 · STRUCTURE</Text>
                      <Text variant="subtitle">Shape the session.</Text>
                    </View>
                  </Row>

                  {workoutType !== 'stretch' && workoutType !== 'yoga' ? (
                    <>
                      <Text variant="caption" color="textFaint" weight="bold" style={{ marginTop: spacing.md }}>SESSION LENGTH</Text>
                      <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
                        {SESSION_DURATIONS.map((minutes) => (
                          <Chip key={minutes} label={`${minutes} min`} selected={targetDurationMin === minutes} onPress={() => setTargetDurationMin(minutes)} />
                        ))}
                      </Row>
                      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md, paddingTop: spacing.md }}>
                        <Text variant="caption" color="textFaint" weight="bold">INCLUDE</Text>
                        <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
                          <Chip label="Warmup" icon={<Icon name="warmup" size={16} color={includeWarmup ? 'primaryTextSoft' : 'textMuted'} />} selected={includeWarmup} onPress={() => setIncludeWarmup((value) => !value)} />
                          {workoutType !== 'cardio' && <Chip label="Conditioning" icon={<Icon name="conditioning" size={16} color={includeConditioning ? 'primaryTextSoft' : 'textMuted'} />} selected={includeConditioning} onPress={() => setIncludeConditioning((value) => !value)} />}
                          <Chip label="Cool down" icon={<Icon name="cooldown" size={16} color={includeCooldown ? 'primaryTextSoft' : 'textMuted'} />} selected={includeCooldown} onPress={() => setIncludeCooldown((value) => !value)} />
                        </Row>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text variant="caption" color="textFaint" weight="bold" style={{ marginTop: spacing.md }}>FLOW LENGTH</Text>
                      <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
                        {FLOW_DURATIONS.map((minutes) => <Chip key={minutes} label={`${minutes} min`} selected={flowDurationMin === minutes} onPress={() => setFlowDurationMin(minutes)} />)}
                      </Row>
                      <Text variant="caption" color="textFaint" weight="bold" style={{ marginTop: spacing.md }}>PACE</Text>
                      <Row gap="sm" style={{ marginTop: spacing.sm }}>
                        <Chip label="Gentle" selected={flowPace === 'gentle'} onPress={() => setFlowPace('gentle')} />
                        <Chip label="Standard" selected={flowPace === 'standard'} onPress={() => setFlowPace('standard')} />
                      </Row>
                      {workoutType === 'yoga' && !hasYogaMat && (
                        <Row
                          gap="sm"
                          style={{
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: spacing.md,
                            padding: spacing.md,
                            borderRadius: radii.md,
                            backgroundColor: colors.primarySoft,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text variant="caption" color="primaryTextSoft" weight="bold">No yoga mat in your equipment</Text>
                            <Text variant="caption" color="primaryTextSoft">We&apos;ll build today&apos;s flow without one — add it if you&apos;ve got one.</Text>
                          </View>
                          <Button title="Add mat" size="sm" variant="secondary" onPress={addYogaMat} />
                        </Row>
                      )}
                    </>
                  )}

                  {(workoutType === 'bodybuilding' || workoutType === 'sculpting') && athlete?.experience !== 'beginner' && (
                    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md, paddingTop: spacing.md }}>
                      <Text variant="caption" color="textFaint" weight="bold">SET FLOW</Text>
                      <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
                        {BODYBUILDING_ROTATIONS.map((option) => <Chip key={option.value} label={option.label} selected={bodybuildingRotation === option.value} onPress={() => setBodybuildingRotation(option.value)} />)}
                      </Row>
                    </View>
                  )}
                  {workoutType === 'cardio' && (
                    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md, paddingTop: spacing.md }}>
                      <Text variant="caption" color="textFaint" weight="bold">CARDIO FORMAT</Text>
                      <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
                        {CARDIO_INTENTS.map((option) => <Chip key={option.value} label={option.label} selected={cardioIntent === option.value} onPress={() => setCardioIntent(option.value)} />)}
                      </Row>
                    </View>
                  )}
                </Card>

                <View
                  ref={checkinMarkerRef}
                  onLayout={(event) => {
                    const y = event.nativeEvent.layout.y;
                    checkinAreaY.current = y;
                    if (pendingScrollToCheckin.current) {
                      pendingScrollToCheckin.current = false;
                      requestAnimationFrame(() => {
                        scrollMarkerIntoView(checkinMarkerRef.current, scrollRef, y, false);
                      });
                    }
                  }}
                >
                <Card tone="surfaceAlt">
                  <Row gap="sm" style={{ alignItems: 'center' }}>
                    <Icon name="checkin" size={17} color="primaryTextSoft" />
                    <View>
                      <Text variant="caption" color="textFaint" weight="bold">4 · DAILY CHECK-IN</Text>
                      <Text variant="subtitle">How are you feeling today?</Text>
                    </View>
                  </Row>
                  <ActionRow
                    label={INTENT_OPTIONS.find((option) => option.value === trainingIntent)?.label ?? 'Daily check-in'}
                    description={`Sleep ${READY_OPTIONS.sleep.find((option) => option.value === sleep)?.label} · Energy ${READY_OPTIONS.energy.find((option) => option.value === energy)?.label}`}
                    onPress={() => setShowAdjustments((shown) => !shown)}
                    trailing={<Icon name={showAdjustments ? 'chevronUp' : 'chevronDown'} color="primaryTextSoft" />}
                    style={{
                      marginTop: spacing.md,
                    }}
                  />

                  {showAdjustments && (
                    <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                      <View>
                        <Text variant="caption" color="textFaint" weight="bold">WHAT KIND OF DAY?</Text>
                        <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
                          {INTENT_OPTIONS.map((option) => (
                            <Chip key={option.value} label={option.label} selected={trainingIntent === option.value} onPress={() => setTrainingIntent(option.value)} />
                          ))}
                        </Row>
                      </View>
                      <View style={{ gap: spacing.sm }}>
                        {([
                          ['SLEEP', 'sleep', READY_OPTIONS.sleep, sleep, setSleep],
                          ['ENERGY', 'energy', READY_OPTIONS.energy, energy, setEnergy],
                          ['SORENESS', 'soreness', READY_OPTIONS.soreness, soreness, setSoreness],
                        ] as const).map(([label, icon, options, value, setValue]) => (
                          <Row key={label} style={{ justifyContent: 'space-between' }}>
                            <Row gap="xs" style={{ flex: 1 }}>
                              <Icon name={icon} size={16} color="textFaint" />
                              <Text variant="caption" color="textFaint" weight="bold">{label}</Text>
                            </Row>
                            <Row gap="sm">
                              {options.map((option) => <Chip key={option.label} label={option.label} selected={value === option.value} onPress={() => setValue(option.value)} />)}
                            </Row>
                          </Row>
                        ))}
                      </View>
                      <View>
                        <Text variant="caption" color="textFaint">ANY AREAS TO TAKE CARE WITH?</Text>
                        <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
                          {CONCERN_OPTIONS.map((concern) => {
                            const key = areaKey(concern.area);
                            return <Chip key={key} label={concernLabel(concern.label, key)} selected={concerns.has(key)} onPress={() => cycleConcern(key)} />;
                          })}
                        </Row>
                      </View>
                    </View>
                  )}
                </Card>
                </View>

                <Button title={building ? 'Building…' : 'Build Workout'} onPress={build} loading={building} fullWidth />
              </View>

          </Card>
          </View>

          {plan && (
            <View
              ref={planMarkerRef}
              onLayout={(e) => {
                if (!pendingScrollToPlan.current) return;
                pendingScrollToPlan.current = false;
                const y = e.nativeEvent.layout.y;
                // Give the plan card a beat to finish laying out (exercise
                // rows, etc.) before measuring where to scroll to.
                requestAnimationFrame(() => {
                  scrollMarkerIntoView(planMarkerRef.current, scrollRef, y, true);
                });
              }}
            >
            <Card elevated>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap="sm">
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: radii.md,
                      backgroundColor: colors.primarySoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="workout" size={17} color="primaryTextSoft" />
                  </View>
                  <View>
                    <Text variant="heading" italic>Workout Focus: {workoutOverview(plan).focus}</Text>
                    {workoutOverview(plan).primaryGroups.length > 0 && (
                      <Text variant="body" color="textMuted">
                        {workoutOverview(plan).primaryGroups.join(' · ')}
                      </Text>
                    )}
                  </View>
                </Row>
                <Row gap="xs">
                  <Icon name="time" size={15} color="textMuted" />
                  <Text variant="label" color="textMuted">
                    ~{plan.estimatedDurationMin} min
                  </Text>
                </Row>
              </Row>
              <View style={{ marginTop: spacing.lg }}>
                <WorkoutDetails
                  plan={plan}
                  weightUnit={athlete?.weightUnit ?? 'kg'}
                  showHeading={false}
                  onChangePlan={(next) => {
                    savePlan(next);
                    setPlan(next);
                    setBuiltPlan(next);
                  }}
                />
              </View>

              <Button
                title="Start workout"
                onPress={onStartWorkout}
                fullWidth
                style={{ marginTop: spacing.xl }}
              />
              {SHOW_WEEK_AHEAD && (
                <Row gap="sm" wrap style={{ marginTop: spacing.md }}>
                  {weekDays.slice(1, 4).map((day) => (
                    <Button
                      key={day}
                      title={`Plan ${new Date(day).toLocaleDateString(undefined, { weekday: 'short' })}`}
                      size="sm"
                      variant="secondary"
                      onPress={() => scheduleWorkout(day)}
                    />
                  ))}
                </Row>
              )}
            </Card>
            </View>
          )}
        </>
      )}

      <Text variant="caption" color="textFaint" center>
        Your plan stays private on this device
      </Text>

      <RecoverySheet visible={showRecovery} onClose={() => setShowRecovery(false)} />
    </Screen>
  );
}
