/**
 * "Today" — prebrief entry point. Redirects to onboarding/equipment on first
 * run; otherwise builds a real adaptive session from the persisted athlete,
 * equipment, and history (no more sample data — this is the real loop).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ImageBackground } from 'expo-image';
import { Platform, ScrollView, View, type ImageSourcePropType, type LayoutChangeEvent } from 'react-native';

import {
  ActionRow,
  Button,
  Card,
  ChoiceTile,
  Chip,
  Divider,
  GoalHero,
  HeroScrim,
  Icon,
  MuscleLogo,
  PressScale,
  Row,
  Screen,
  Skeleton,
  SkeletonCard,
  Text,
  ToneIconTile,
  TrendChart,
  toneForWorkoutType,
  useTheme,
} from '@/design';
import type { ColorToken, ContextTone, IconName } from '@/design';
import { RecoverySheet } from '@/features/recovery-sheet';
import { RoutinePickerSheet } from '@/features/routine-picker-sheet';
import { RoutineDetailSheet } from '@/features/routine-detail-sheet';
import { ExerciseHistorySheet } from '@/features/exercise-history-sheet';
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
import { ensureRollingPlanFresh } from '@/services/rolling-plan';
import { listRoutines, markRoutineUsed, recommendRoutine } from '@/services/routines';
import { ageYearsOf, normalizeCardioIntent } from '@/domain/types';
import type {
  AthleteProfile,
  AvoidanceFlag,
  BodyArea,
  EmphasisMode,
  EquipmentInventory,
  Routine,
  SessionPlan,
  ScheduledWorkout,
  WorkoutType,
  BodybuildingRotation,
  CardioIntent,
  CardioModality,
  FlowPace,
  Modality,
  MuscleGroup,
  RollingPlan,
  SessionRecord,
  WorkoutFamily,
} from '@/domain/types';
import { CARDIO_MODALITIES, CARDIO_MODALITY_ICONS, CARDIO_MODALITY_LABELS, CARDIO_TARGET_AREA_OPTIONS, CONCERN_OPTIONS, EMPHASIS_OPTIONS, familyOfWorkoutType, FULL_BODY_EMPHASIS_OPTION, MODALITY_LABELS, MUSCLE_GROUP_LABELS, WORKOUT_TYPE_OPTIONS, areaKey } from '@/app-lib/options';
import { recommendWorkoutType, recoverySummary, weeklyPerformance, workoutSummary } from '@/app-lib/presentation';
import { primaryGoal } from '@/app-lib/personalization';
import { needsAppTour } from '@/app-lib/app-tour';

type Severity = 'mild' | 'severe';
type TrainingIntent = 'recovery' | 'balanced' | 'challenge';
type PerformanceMetric = 'strength' | 'endurance' | 'calories' | 'workouts';
type BuilderSection = 'session' | 'focus' | 'shape' | 'feeling' | 'adjustments' | 'routine';

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
  { label: 'Basic', value: 'basic', caption: 'Conversational, steady work that builds endurance.' },
  { label: 'Circuit', value: 'circuit', caption: 'A rotating circuit of moves at a steady pace — no machine required.' },
  { label: 'Interval', value: 'interval', caption: 'Timed work and recovery rounds with clear RPE targets.' },
];

/** Cardio types with enough muscle-group variety for "Target area" to mean
 * anything (ADR-0141) — Running/Machines/Combat/Jump rope don't have it. */
const CARDIO_TARGET_AREA_TYPES: CardioModality[] = ['aerobics', 'bodyweight', 'loaded_cardio'];

/**
 * `emphasizeAreas`/`selectedEmphasisLabels` below look up every `emphasize`
 * key against this combined list (ADR-0141) — `EMPHASIS_OPTIONS` alone would
 * silently drop the new cardio target-area chips (group-keyed vs
 * region-keyed `areaKey()`s never collide, so a plain concat is safe).
 */
const EMPHASIS_AND_TARGET_AREA_OPTIONS = [...EMPHASIS_OPTIONS, ...CARDIO_TARGET_AREA_OPTIONS];

const FLOW_DURATIONS = [10, 20, 30] as const;
const SESSION_DURATIONS = [10, 20, 30, 40, 50, 60] as const;

const FULL_BODY_KEY = areaKey(FULL_BODY_EMPHASIS_OPTION.area);
const TODAY_EDITORIAL_ART = require('../../assets/images/editorial/today-strength-v1.png');
const TODAY_CARDIO_ART = require('../../assets/images/editorial/endurance-run-v1.png');
const TODAY_RECOVERY_ART = require('../../assets/images/editorial/recovery-stretch-v1.png');
const TODAY_CONDITIONING_ART = require('../../assets/images/editorial/today-conditioning-v1.png');

const WORKOUT_TYPE_ART = {
  balanced: require('../../assets/images/heroes/bodyweight-hero.png'),
  bodybuilding: require('../../assets/images/heroes/bodybuilding-hero.png'),
  sculpting: require('../../assets/images/heroes/bodybuilding-hero.png'),
  stretch: require('../../assets/images/heroes/stretch-hero.png'),
  yoga: require('../../assets/images/heroes/yoga-hero.png'),
  // No dedicated barre hero art yet — shares yoga's, same spirit as
  // sculpting sharing bodybuilding's until barre gets its own asset.
  barre: require('../../assets/images/heroes/yoga-hero.png'),
  // No dedicated Pilates hero art yet — reuses yoga's, same as Barre above.
  pilates: require('../../assets/images/heroes/yoga-hero.png'),
  bodyweight: require('../../assets/images/heroes/bodyweight-hero.png'),
  cardio: require('../../assets/images/heroes/cardio-hero.png'),
} as const;

function workoutTypeArt(type: WorkoutType | undefined) {
  return type ? WORKOUT_TYPE_ART[type] : WORKOUT_TYPE_ART.balanced;
}

/**
 * The shared visual for both "Kind of session" picker steps (ADR-0407): a
 * family tile (step A) and a per-style tile within a family (step B) are the
 * same selectable hero-art tile, just keyed by a different domain value —
 * this is the presentational shell both build their icon/art/tone from.
 */
function SelectableHeroTile({
  label,
  icon,
  art,
  tone,
  selected,
  onPress,
}: {
  label: string;
  icon: IconName;
  art: ImageSourcePropType;
  tone: ContextTone;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, radii, spacing } = useTheme();
  const contextual = colors.tones[tone];

  return (
    <PressScale
      onPress={onPress}
      haptic="selection"
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{
        flex: 1,
        minHeight: 116,
        borderRadius: radii.md,
        overflow: 'hidden',
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? contextual.border : colors.border,
      }}
    >
      <ImageBackground source={art} contentFit="cover" style={{ flex: 1, padding: spacing.md, justifyContent: 'space-between' }}>
        <HeroScrim />
        {selected ? <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: contextual.solid, opacity: 0.42 }} /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Icon name={icon} size={19} color="heroText" />
          {selected ? (
            <View style={{ width: 26, height: 26, borderRadius: radii.pill, backgroundColor: contextual.surface, borderWidth: 1, borderColor: contextual.border, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="label" tint={contextual.text} weight="bold">✓</Text>
            </View>
          ) : null}
        </View>
        <Text variant="subtitle" color="heroText" weight="semibold">{label}</Text>
      </ImageBackground>
    </PressScale>
  );
}

function WorkoutTypeTile({
  label,
  value,
  selected,
  onPress,
}: {
  label: string;
  value: WorkoutType | undefined;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <SelectableHeroTile
      label={label}
      icon={workoutTypeIcon(value)}
      art={workoutTypeArt(value)}
      tone={toneForWorkoutType(value)}
      selected={selected}
      onPress={onPress}
    />
  );
}

const FAMILY_ART: Record<WorkoutFamily, ImageSourcePropType> = {
  strength: require('../../assets/images/heroes/bodybuilding-hero.png'),
  cardio: require('../../assets/images/heroes/cardio-hero.png'),
  mobility: require('../../assets/images/heroes/yoga-hero.png'),
};

const FAMILY_TONE: Record<WorkoutFamily, ContextTone> = {
  strength: 'strength',
  cardio: 'endurance',
  mobility: 'mobility',
};

const FAMILY_OPTIONS: { label: string; value: WorkoutFamily; icon: IconName }[] = [
  { label: 'Strength', value: 'strength', icon: 'goalStrength' },
  { label: 'Cardio', value: 'cardio', icon: 'goalCardio' },
  { label: 'Mobility', value: 'mobility', icon: 'goalMobility' },
];

function FamilyTile({
  label,
  value,
  selected,
  onPress,
}: {
  label: string;
  value: WorkoutFamily;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <SelectableHeroTile
      label={label}
      icon={FAMILY_OPTIONS.find((option) => option.value === value)!.icon}
      art={FAMILY_ART[value]}
      tone={FAMILY_TONE[value]}
      selected={selected}
      onPress={onPress}
    />
  );
}

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

/** 0=Sun..6=Sat, matching `Routine.recurrenceDaysOfWeek` (ADR-0137). */
function weekdayOf(ms: number): number {
  return new Date(ms).getDay();
}

/** The recurring routine (if any) whose days include `day`'s weekday and
 * that isn't already covered by a completed/manually-scheduled entry — a
 * render-time overlay, never materialized ahead of time (ADR-0137). */
function recurringRoutineFor(day: number, routines: Routine[]): Routine | undefined {
  const weekday = weekdayOf(day);
  return routines.find((routine) => routine.recurrenceDaysOfWeek?.includes(weekday));
}

function workoutLabel(type: WorkoutType | undefined): string {
  if (!type) return 'Balanced';
  return type[0].toUpperCase() + type.slice(1);
}

/** Same mapping WorkoutTypeTile uses for its selector tiles — reused here so
 * the Weekly Plan list reads as the same visual language as the builder. */
function workoutTypeIcon(type: WorkoutType | undefined): 'goalCardio' | 'goalMobility' | 'goalStrength' {
  const family = familyOfWorkoutType(type);
  if (family === 'cardio') return 'goalCardio';
  if (family === 'mobility') return 'goalMobility';
  return 'goalStrength';
}

function modalityIcon(modality: Modality | undefined): 'goalCardio' | 'goalMobility' | 'goalStrength' | 'goalBurn' {
  if (modality === 'cardio') return 'goalCardio';
  if (modality === 'mobility') return 'goalMobility';
  if (modality === 'general') return 'goalBurn';
  return 'goalStrength';
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
  const params = useLocalSearchParams<{ scrollTo?: string; recovery?: string; checkin?: string; useRoutineId?: string }>();

  const activeRecord = useWorkoutStore((s) => s.record);
  const startWorkout = useWorkoutStore((s) => s.start);
  const endEarly = useWorkoutStore((s) => s.endEarly);
  const setBuiltPlan = useWorkoutStore((s) => s.setBuiltPlan);

  const [ready, setReady] = useState(false);
  // Session generation is awaited; before ADR-0130 the button stayed fully
  // enabled and unchanged while it ran, so a slow build looked like a dead tap.
  const [building, setBuilding] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [equipment, setEquipment] = useState<EquipmentInventory | null>(null);

  const [sleep, setSleep] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [soreness, setSoreness] = useState(1);
  const [showRecovery, setShowRecovery] = useState(false);
  const [trainingIntent, setTrainingIntent] = useState<TrainingIntent>('balanced');
  const [workoutType, setWorkoutType] = useState<WorkoutType | undefined>(undefined);
  const workoutTone = toneForWorkoutType(workoutType);
  // The "Kind of session" picker's step A (ADR-0407) — which family's style
  // tiles step B shows. Not derived inline from `workoutType` on every render
  // because picking a family (before a style within it is chosen) shouldn't
  // itself change `workoutType` for Strength/Mobility — only Cardio's single-
  // member family sets it immediately. Re-synced on an external `workoutType`
  // change (e.g. picking a routine) via the same "adjust state when a prop
  // changes" pattern `ExerciseHero` uses, rather than an effect.
  const [selectedFamily, setSelectedFamily] = useState<WorkoutFamily>(() => familyOfWorkoutType(workoutType));
  const [syncedWorkoutTypeForFamily, setSyncedWorkoutTypeForFamily] = useState(workoutType);
  if (workoutType !== syncedWorkoutTypeForFamily) {
    setSyncedWorkoutTypeForFamily(workoutType);
    setSelectedFamily(familyOfWorkoutType(workoutType));
  }
  const [bodybuildingRotation, setBodybuildingRotation] = useState<BodybuildingRotation>('straight');
  const [cardioIntent, setCardioIntent] = useState<CardioIntent>('basic');
  const [cardioModalities, setCardioModalities] = useState<CardioModality[]>([]);
  const [flowDurationMin, setFlowDurationMin] = useState<number>(20);
  const [flowPace, setFlowPace] = useState<FlowPace>('standard');
  // Tri-state: unset defers to `defaultAutoAdvance`'s per-style default
  // (on for stretch/yoga/barre) rather than forcing a value into every plan.
  const [autoAdvanceOverride, setAutoAdvanceOverride] = useState<boolean | undefined>(undefined);
  const [targetDurationMin, setTargetDurationMin] = useState<number>(30);
  // This screen can be the very first thing to mount after a fresh install
  // or upgrade, before the `useFocusEffect` below has had a chance to run —
  // `initStorage()` must happen before any synchronous storage read here.
  const [includeWarmup, setIncludeWarmup] = useState(() => { initStorage(); return getExercisePreferences().defaultIncludeWarmup; });
  const [includeConditioning, setIncludeConditioning] = useState(() => getExercisePreferences().defaultIncludeConditioning);
  const [includeCooldown, setIncludeCooldown] = useState(() => getExercisePreferences().defaultIncludeCooldown);
  const [showBuilderAdjustments, setShowBuilderAdjustments] = useState(false);
  const [openBuilderSection, setOpenBuilderSection] = useState<BuilderSection | null>(null);
  const [emphasize, setEmphasize] = useState<Set<string>>(new Set());
  const [emphasizeTouched, setEmphasizeTouched] = useState(false);
  const [emphasisMode, setEmphasisMode] = useState<EmphasisMode>('balanced');
  const [concerns, setConcerns] = useState<Map<string, Severity>>(new Map());
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const planTone = toneForWorkoutType(plan?.workoutType);
  const scrollRef = useRef<ScrollView>(null);
  const pendingScrollToPlan = useRef(false);
  const planMarkerRef = useRef<View>(null);
  const buildAreaY = useRef(0);
  const buildMarkerRef = useRef<View>(null);
  const checkinAreaY = useRef(0);
  const checkinMarkerRef = useRef<View | null>(null);
  const pendingScrollToCheckin = useRef(false);
  const [scheduledWorkouts, setScheduledWorkouts] = useState<ScheduledWorkout[]>([]);
  const [rollingPlan, setRollingPlan] = useState<RollingPlan | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [weekStart] = useState(() => localDay(Date.now()));
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const selectedRoutine = routines.find((r) => r.id === selectedRoutineId) ?? null;
  const [routinePickerVisible, setRoutinePickerVisible] = useState(false);
  const [viewRoutineId, setViewRoutineId] = useState<string | null>(null);
  const [routineExerciseHistoryId, setRoutineExerciseHistoryId] = useState<string | null>(null);
  const viewRoutine = routines.find((r) => r.id === viewRoutineId) ?? null;

  // Switching the core workout type can leave type-specific knobs (bodybuilding
  // set-flow, cardio structure/modalities, flow length/pace, guided-flow mode)
  // pointed at a value that no longer applies to the new type — reset each one
  // back to its default rather than silently carrying the old style's choice
  // into a style it was never meant for.
  const changeWorkoutType = useCallback((type: WorkoutType | undefined) => {
    setWorkoutType(type);
    const family = familyOfWorkoutType(type);
    if (type !== 'bodybuilding' && type !== 'sculpting') setBodybuildingRotation('straight');
    if (type !== 'cardio') {
      setCardioIntent('basic');
      setCardioModalities([]);
    }
    if (family !== 'mobility') {
      setFlowDurationMin(20);
      setFlowPace('standard');
    }
    if (family !== 'mobility' && type !== 'cardio') setAutoAdvanceOverride(undefined);
  }, []);

  // Expanding a builder section (Workout Focus, Shape, Feeling, …) should keep
  // itself visible rather than leaving the newly-revealed card below the fold —
  // each section row is wrapped in a marker View whose layout position we track,
  // and opening a section schedules a scroll to that marker once it settles.
  const pendingScrollSection = useRef<BuilderSection | null>(null);
  const sectionMarkerRefs = useRef<Partial<Record<BuilderSection, View | null>>>({});
  const sectionAreaY = useRef<Partial<Record<BuilderSection, number>>>({});
  const openSection = useCallback((section: BuilderSection) => {
    pendingScrollSection.current = section;
    setOpenBuilderSection(section);
  }, []);
  const toggleSection = useCallback((section: BuilderSection) => {
    setOpenBuilderSection((current) => {
      const next = current === section ? null : section;
      pendingScrollSection.current = next;
      return next;
    });
  }, []);
  const handleSectionLayout = useCallback((section: BuilderSection) => (event: LayoutChangeEvent) => {
    const y = event.nativeEvent.layout.y;
    sectionAreaY.current[section] = y;
    if (pendingScrollSection.current === section) {
      pendingScrollSection.current = null;
      requestAnimationFrame(() => scrollMarkerIntoView(sectionMarkerRefs.current[section] ?? null, scrollRef, y, true));
    }
  }, []);

  // Recovery details can be opened from a CoachFit link in addition to the
  // hero card, making the same real readout easy to revisit directly.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- route params intentionally open this controlled sheet
    if (params.recovery === '1') setShowRecovery(true);
  }, [params.recovery]);

  useEffect(() => {
    if (params.checkin !== '1') return;
    const frame = requestAnimationFrame(() => {
      setShowBuilder(true);
      setShowBuilderAdjustments(true);
      openSection('feeling');
    });
    return () => cancelAnimationFrame(frame);
  }, [params.checkin, openSection]);

  // "Use today" from a routine's detail view (Explore) — ADR-0137. A plain
  // (non-focus) effect purely to remember the param in a ref — the focus
  // effect below reads the ref instead of `params.useRoutineId` directly, so
  // that effect's own `router.setParams` clear (once it has consumed the
  // value) doesn't sit in its dependency array and retrigger itself with the
  // now-cleared value, stomping the selection it just made.
  const pendingRoutineIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (params.useRoutineId) pendingRoutineIdRef.current = params.useRoutineId;
  }, [params.useRoutineId]);

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
        // ADR-0137: consumed once here (and cleared) rather than read
        // directly from `params.useRoutineId` — see `pendingRoutineIdRef`
        // above for why this effect can't depend on that param directly.
        const explicitRoutineId = pendingRoutineIdRef.current;
        const profile = getAthleteProfile() ?? null;
        const scheduled = profile?.scheduledWorkouts ?? [];
        const todaysSchedule = scheduled.find((item) => localDay(item.plannedFor) === localDay(Date.now()));
        const savedRoutines = listRoutines();
        setRoutines(savedRoutines);
        setAthlete(profile);
        setScheduledWorkouts(scheduled);
        // ADR-0137 v2: a routine's own style is the source of truth for what
        // gets built once one is selected — it overrides whatever "Kind of
        // session" default was just applied above, so e.g. a Yoga routine
        // actually runs the Yoga flow instead of silently building Balanced.
        const applyRoutineSelection = (id: string | null) => {
          setSelectedRoutineId(id);
          const routine = id ? savedRoutines.find((r) => r.id === id) : undefined;
          if (routine) setWorkoutType(routine.workoutType);
        };
        if (todaysSchedule) {
          setWorkoutType(todaysSchedule.workoutType);
          setTrainingIntent(todaysSchedule.trainingIntent ?? 'balanced');
          setBodybuildingRotation(todaysSchedule.workoutOptions?.bodybuildingRotation ?? 'straight');
          setCardioIntent(normalizeCardioIntent(todaysSchedule.workoutOptions?.cardioIntent));
          setCardioModalities(todaysSchedule.workoutOptions?.cardioModalities ?? []);
          setFlowDurationMin(todaysSchedule.workoutOptions?.flow?.durationMin ?? 20);
          setFlowPace(todaysSchedule.workoutOptions?.flow?.pace ?? 'standard');
          const workoutDefaults = getExercisePreferences();
          setIncludeWarmup(todaysSchedule.workoutOptions?.includeWarmup ?? workoutDefaults.defaultIncludeWarmup);
          setIncludeConditioning(todaysSchedule.workoutOptions?.includeConditioning ?? workoutDefaults.defaultIncludeConditioning);
          setIncludeCooldown(todaysSchedule.workoutOptions?.includeCooldown ?? workoutDefaults.defaultIncludeCooldown);
          // ADR-0137: an explicit "Use today" from Explore wins outright;
          // otherwise a routine explicitly scheduled for today does.
          applyRoutineSelection(explicitRoutineId ?? todaysSchedule.routineId ?? null);
        } else if (profile) {
          // No explicit plan for today — the athlete's standing style
          // preference wins if set; otherwise preselect from goal weights.
          // The chips below still let them pick something else either way.
          setWorkoutType(profile.preferredWorkoutType ?? recommendWorkoutType(profile.goals));
          // ADR-0137: an explicit "Use today" wins; otherwise nothing
          // explicit today — fall back to a recurring routine whose days
          // include today's weekday, if any (a render-time overlay, not a
          // materialized schedule entry).
          applyRoutineSelection(explicitRoutineId ?? recurringRoutineFor(Date.now(), savedRoutines)?.id ?? null);
        }
        if (explicitRoutineId) {
          pendingRoutineIdRef.current = undefined;
          setShowBuilder(true);
          setShowBuilderAdjustments(true);
          openSection('routine');
          router.setParams({ useRoutineId: undefined });
        }
        const equipmentInventory = getEquipmentInventory() ?? null;
        setEquipment(equipmentInventory);
        // Recomputed only inside ensureRollingPlanFresh's two trigger checks
        // (a workout completed, or a new day opened with a missed workout) —
        // this call is cheap (a profile read + a date comparison) otherwise.
        if (profile && equipmentInventory) {
          setRollingPlan(
            ensureRollingPlanFresh(
              {
                athlete: profile,
                equipment: equipmentInventory,
                history: listEngineHistory(),
                fatigue: currentFatigue(ageYearsOf(profile)),
                // The forecast reasons about goals/history/projected recovery
                // only — today's readiness check-in doesn't retroactively
                // reshape a standing multi-day plan, so this stays a neutral
                // default rather than reading in-progress builder state.
                readiness: { sleepQuality: 3, energy: 3, soreness: 1 },
                goals: profile.goals,
                targeting: { emphasize: [], avoid: [] },
                avoidToday: { flags: [] },
                plannedFor: Date.now(),
                excludedExerciseIds: getExercisePreferences().excludedExerciseIds,
              },
              // ADR-0142: so the forecast never proposes a day that conflicts
              // with a routine already fixed for it (explicit or recurring).
              savedRoutines,
              scheduled,
            ),
          );
        }
        setReady(true);
      }, 0);
      return () => clearTimeout(timer);
      // Deliberately NOT keyed on `params.useRoutineId` — see
      // `pendingRoutineIdRef` above; this effect must only react to genuine
      // focus/blur, not to its own `router.setParams` clearing that param.
    }, [router, openSection]),
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
  // Only one hero dropdown can be open at a time — opening one closes the other.
  const [openHeroSection, setOpenHeroSection] = useState<'progress' | 'plan' | null>(null);
  const showProgressDetails = openHeroSection === 'progress';
  const showWeekAhead = openHeroSection === 'plan';
  // The forecast horizon defaults to 14 days (ADR-0142), but the card only
  // shows the first 7 until asked — keeps the common case scannable while
  // still letting an upcoming lighter/heavier week be checked on demand.
  const [showSecondWeek, setShowSecondWeek] = useState(false);

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
      : EMPHASIS_AND_TARGET_AREA_OPTIONS.filter((option) => emphasize.has(areaKey(option.area))).map((option) => option.label),
    [emphasize],
  );
  const selectedComponentsLabel = [
    includeWarmup ? 'Warmup' : null,
    workoutType !== 'cardio' && includeConditioning ? 'Conditioning' : null,
    includeCooldown ? 'Cool down' : null,
  ].filter((item): item is string => item != null).join(' · ') || 'Main workout only';
  const emphasizeAreas = useMemo<BodyArea[]>(
    () => emphasize.has(FULL_BODY_KEY)
      ? [FULL_BODY_EMPHASIS_OPTION.area]
      : EMPHASIS_AND_TARGET_AREA_OPTIONS.filter((o) => emphasize.has(areaKey(o.area))).map((o) => o.area),
    [emphasize],
  );
  // Lays the persisted rolling forecast (rollingPlan.days, from
  // ensureRollingPlanFresh — only recomputed after a workout completes or on
  // a new day with a missed expected workout, never on every render) over
  // real calendar state: completed days come from history, scheduled days
  // from scheduledWorkouts, and any remaining forecasted day falls back to
  // the plan's own workout/rest suggestion — rolling forward from today
  // rather than resetting at a Monday boundary.
  const weekPlan = useMemo(() => {
    const todayLocal = weekStart;
    const completedByDay = new Map<number, SessionRecord>();
    for (const record of history) {
      if (record.completedAt == null) continue;
      completedByDay.set(localDay(record.completedAt), record);
    }
    const days = rollingPlan?.days ?? [];
    const rows = days.map((day) => {
      const record = completedByDay.get(day.date);
      if (record) return { day: day.date, status: 'completed' as const, record };
      const scheduled = scheduledWorkouts.find((item) => localDay(item.plannedFor) === day.date);
      if (scheduled) return { day: day.date, status: 'scheduled' as const, scheduled };
      // ADR-0137: a recurring routine overlays today/future days only — it
      // never rewrites what already happened (or didn't) on a past day.
      const recurring = day.date >= todayLocal ? recurringRoutineFor(day.date, routines) : undefined;
      if (recurring) return { day: day.date, status: 'recurring' as const, routine: recurring };
      if (day.date < todayLocal) {
        return day.kind === 'workout'
          ? { day: day.date, status: 'missed' as const }
          : { day: day.date, status: 'rest' as const };
      }
      if (day.kind === 'rest') return { day: day.date, status: 'rest' as const };
      return { day: day.date, status: 'suggested' as const, intent: { modality: day.modality, priorityMuscles: day.priorityMuscles ?? [] } };
    });
    // Counted off the actual rows shown (completed + scheduled + suggested),
    // not just the plan's own workout-day count — a manually scheduled day
    // that lands on what the forecast called a rest day still counts as a
    // real planned workout, so the header total always matches what's listed.
    const completedCount = rows.filter((row) => row.status === 'completed').length;
    const plannedCount = rows.filter((row) => row.status === 'scheduled' || row.status === 'suggested').length;
    return { rows, completedCount, plannedCount };
  }, [history, scheduledWorkouts, rollingPlan, weekStart, routines]);
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

  /** "CARDIO TYPE" chips (ADR-0140) — multi-select, unlike "CARDIO FORMAT" below. */
  function toggleCardioModality(value: CardioModality) {
    setCardioModalities((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  const hasYogaMat = equipment?.items.some((item) => item.type === 'yoga_mat') ?? false;

  function addYogaMat() {
    if (!equipment || hasYogaMat) return;
    const next: EquipmentInventory = { items: [...equipment.items, { type: 'yoga_mat' }] };
    setEquipment(next);
    saveEquipmentInventory(next);
  }

  const hasBarre = equipment?.items.some((item) => item.type === 'barre') ?? false;

  function addBarre() {
    if (!equipment || hasBarre) return;
    const next: EquipmentInventory = { items: [...equipment.items, { type: 'barre' }] };
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
    const flags: AvoidanceFlag[] = CONCERN_OPTIONS.filter((c) => concerns.has(areaKey(c.area))).map(
      (c) => ({ area: c.area, severity: concerns.get(areaKey(c.area)) as Severity }),
    );
    // ADR-0142: today's baseline from the weekly forecast, if one exists for
    // today — a DEFAULT the engine may still adapt or override, never a
    // mandate (an explicit workoutType/routine below still wins outright).
    const todaysForecast = rollingPlan?.days.find((day) => day.date === localDay(now));
    const weeklyPlan = todaysForecast?.kind === 'workout'
      ? { modality: todaysForecast.modality, cardioIntent: todaysForecast.cardioIntent }
      : undefined;

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
      weeklyPlan,
      workoutOptions: {
        ...(workoutType === 'bodybuilding' || workoutType === 'sculpting' ? { bodybuildingRotation } : {}),
        ...(workoutType === 'cardio' ? { cardioIntent, ...(cardioModalities.length ? { cardioModalities } : {}) } : {}),
        ...(familyOfWorkoutType(workoutType) === 'mobility'
          ? { flow: { durationMin: flowDurationMin, pace: flowPace } }
          : { includeWarmup, includeConditioning, includeCooldown }),
        ...(autoAdvanceOverride !== undefined ? { autoAdvance: autoAdvanceOverride } : {}),
      },
      goals: athlete.goals,
      targeting: { emphasize: emphasizeAreas, avoid: [], emphasisMode },
      avoidToday: { flags },
      excludedExerciseIds: getExercisePreferences().excludedExerciseIds,
      favoriteExerciseIds: getExercisePreferences().favoriteExerciseIds,
      ...(selectedRoutine
        ? { routine: { id: selectedRoutine.id, name: selectedRoutine.name, exerciseIds: selectedRoutine.exerciseIds } }
        : {}),
    });
    savePlan(p);
    setPlan(p);
    setBuiltPlan(p);
    pendingScrollToPlan.current = true;
  }

  function onStartWorkout() {
    if (!plan) return;
    savePlan(plan); // persist any user-edited rotation before the record starts.
    if (plan.routineId) markRoutineUsed(plan.routineId);
    startWorkout(plan);
    router.push('/workout');
  }

  // ADR-0137 v2: a routine's own style is the source of truth for what kind
  // of session gets built — picking one syncs "Kind of session" to match
  // rather than leaving it on whatever was previously selected.
  function chooseRoutine(id: string | null) {
    setSelectedRoutineId(id);
    const routine = id ? routines.find((r) => r.id === id) : undefined;
    if (routine) setWorkoutType(routine.workoutType);
  }

  /** "Have the system pick from my custom routines" (ADR-0137). */
  function autoPickRoutine() {
    if (!equipment) return;
    const flags: AvoidanceFlag[] = CONCERN_OPTIONS.filter((c) => concerns.has(areaKey(c.area))).map(
      (c) => ({ area: c.area, severity: concerns.get(areaKey(c.area)) as Severity }),
    );
    const best = recommendRoutine({ equipment, avoidToday: { flags } });
    chooseRoutine(best?.id ?? null);
  }

  function onResumeWorkout() {
    router.push('/workout');
  }

  function onEndEarly() {
    const ended = endEarly();
    if (ended) router.push('/debrief');
  }

  function scheduleWorkout(day: number, routineId?: string) {
    if (!athlete) return;
    const entry: ScheduledWorkout = {
      plannedFor: day,
      workoutType,
      workoutOptions: {
        ...(workoutType === 'bodybuilding' || workoutType === 'sculpting' ? { bodybuildingRotation } : {}),
        ...(workoutType === 'cardio' ? { cardioIntent, ...(cardioModalities.length ? { cardioModalities } : {}) } : {}),
        ...(familyOfWorkoutType(workoutType) === 'mobility'
          ? { flow: { durationMin: flowDurationMin, pace: flowPace } }
          : { includeWarmup, includeConditioning, includeCooldown }),
        ...(autoAdvanceOverride !== undefined ? { autoAdvance: autoAdvanceOverride } : {}),
      },
      trainingIntent,
      routineId,
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
      <GoalHero
        goal={focusGoal}
        compact
        imageOverride={focusGoal === 'cardio' ? TODAY_CARDIO_ART : focusGoal === 'mobility' ? TODAY_RECOVERY_ART : focusGoal === 'general' ? TODAY_CONDITIONING_ART : TODAY_EDITORIAL_ART}
        style={{ minHeight: 270 }}
      >
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
                    setOpenHeroSection('progress');
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
            <Row gap="lg" style={{ marginTop: spacing.sm }}>
              <PressScale
                onPress={() => setOpenHeroSection((section) => section === 'progress' ? null : 'progress')}
                haptic="selection"
                accessibilityRole="button"
                accessibilityState={{ expanded: showProgressDetails }}
                accessibilityLabel={showProgressDetails ? 'Hide weekly progress' : 'View weekly progress'}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' }}
              >
                <Text variant="caption" color="heroText" weight="bold">
                  {showProgressDetails ? 'HIDE WEEKLY PROGRESS' : 'VIEW WEEKLY PROGRESS'}
                </Text>
                <Icon name={showProgressDetails ? 'chevronUp' : 'chevronDown'} size={15} color="heroText" />
              </PressScale>
              <PressScale
                onPress={() => setOpenHeroSection((section) => section === 'plan' ? null : 'plan')}
                haptic="selection"
                accessibilityRole="button"
                accessibilityState={{ expanded: showWeekAhead }}
                accessibilityLabel={showWeekAhead ? 'Hide weekly plan' : 'View weekly plan'}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' }}
              >
                <Text variant="caption" color="heroText" weight="bold">
                  {showWeekAhead ? 'HIDE WEEKLY PLAN' : 'VIEW WEEKLY PLAN'}
                </Text>
                <Icon name={showWeekAhead ? 'chevronUp' : 'chevronDown'} size={15} color="heroText" />
              </PressScale>
            </Row>
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

      {showWeekAhead && !inProgress && (
        <Card>
          <View>
            <Text variant="heading">Weekly Plan</Text>
            <Text variant="caption" color="textMuted" style={{ marginTop: spacing.xs }}>
              {weekPlan.completedCount} done · {weekPlan.plannedCount} planned over the next {rollingPlan?.horizonDays ?? 7} days
            </Text>
            {rollingPlan?.deloadRecommended && (
              <Row gap="xs" style={{ alignItems: 'center', marginTop: spacing.xs }}>
                <Icon name="warning" size={14} color="warning" />
                <Text variant="caption" color="warning" weight="semibold">Easing off this week</Text>
              </Row>
            )}
          </View>
          <View style={{ marginTop: spacing.md }}>
            {(showSecondWeek ? weekPlan.rows : weekPlan.rows.slice(0, 7)).map(({ day, ...row }, index) => {
              const isToday = day === weekStart;
              const dateObj = new Date(day);

              let icon: IconName = 'sleep';
              let iconColor: ColorToken = 'textFaint';
              let title = 'Rest day';
              let subtitle: string | undefined = 'No session planned';
              let action: ReactNode = null;

              if (row.status === 'completed') {
                const summary = workoutSummary(row.record);
                const groups = summary.groups.slice(0, 2).map((g) => MUSCLE_GROUP_LABELS[g]).join(' · ');
                icon = 'checkAll';
                iconColor = 'primary';
                title = workoutLabel(row.record.workoutType);
                subtitle = groups || 'Completed';
              } else if (row.status === 'scheduled') {
                const intentLabel = INTENT_OPTIONS.find((option) => option.value === row.scheduled.trainingIntent)?.label;
                const scheduledRoutine = row.scheduled.routineId ? routines.find((r) => r.id === row.scheduled.routineId) : undefined;
                icon = workoutTypeIcon(row.scheduled.workoutType);
                iconColor = 'primaryTextSoft';
                title = scheduledRoutine ? scheduledRoutine.name : workoutLabel(row.scheduled.workoutType);
                subtitle = intentLabel && intentLabel !== 'Balanced' ? intentLabel : 'Planned';
                action = (
                  <PressScale
                    accessibilityRole="button"
                    accessibilityLabel={`Remove the planned workout on ${dateObj.toLocaleDateString(undefined, { weekday: 'long' })}`}
                    onPress={() => clearScheduledWorkout(day)}
                    haptic="selection"
                    style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="close" size={16} color="textFaint" />
                  </PressScale>
                );
              } else if (row.status === 'suggested') {
                icon = modalityIcon(row.intent.modality);
                iconColor = 'textMuted';
                title = MODALITY_LABELS[row.intent.modality ?? 'strength'];
                subtitle = row.intent.priorityMuscles.length
                  ? row.intent.priorityMuscles.slice(0, 2).map((g) => MUSCLE_GROUP_LABELS[g]).join(' · ')
                  : 'Suggested focus';
                action = (
                  <PressScale
                    accessibilityRole="button"
                    accessibilityLabel={`Add this suggested workout to ${dateObj.toLocaleDateString(undefined, { weekday: 'long' })}`}
                    onPress={() => scheduleWorkout(day)}
                    haptic="selection"
                    style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="add" size={20} color="primaryTextSoft" />
                  </PressScale>
                );
              } else if (row.status === 'recurring') {
                icon = workoutTypeIcon(row.routine.workoutType);
                iconColor = 'textMuted';
                title = row.routine.name;
                subtitle = 'Recurring';
                action = (
                  <PressScale
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${row.routine.name} to ${dateObj.toLocaleDateString(undefined, { weekday: 'long' })}`}
                    onPress={() => scheduleWorkout(day, row.routine.id)}
                    haptic="selection"
                    style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="add" size={20} color="primaryTextSoft" />
                  </PressScale>
                );
              } else if (row.status === 'missed') {
                icon = 'warning';
                iconColor = 'warning';
                title = 'Missed workout';
                subtitle = 'No session logged that day';
              }

              return (
                <View key={day}>
                  {index > 0 && <Divider style={{ marginVertical: spacing.sm }} />}
                  <Row gap="md" style={{ alignItems: 'center' }}>
                    <View style={{ width: 34, alignItems: 'center' }}>
                      <Text variant="caption" color={isToday ? 'primary' : 'textFaint'} weight="bold">
                        {isToday ? 'TODAY' : dateObj.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
                      </Text>
                      <Text variant="label" color={isToday ? 'primary' : 'text'} weight={isToday ? 'bold' : 'regular'} style={{ marginTop: 1 }}>
                        {dateObj.getDate()}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: radii.md,
                        backgroundColor: colors.surfaceAlt,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon name={icon} size={15} color={iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="label" weight="semibold">{title}</Text>
                      {subtitle ? <Text variant="caption" color="textMuted">{subtitle}</Text> : null}
                    </View>
                    {action}
                  </Row>
                </View>
              );
            })}
          </View>
          {weekPlan.rows.length > 7 && (
            <PressScale
              onPress={() => setShowSecondWeek((v) => !v)}
              haptic="selection"
              accessibilityRole="button"
              accessibilityState={{ expanded: showSecondWeek }}
              accessibilityLabel={showSecondWeek ? 'Hide next week' : 'Show next week'}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', marginTop: spacing.md }}
            >
              <Text variant="caption" color="primary" weight="bold">
                {showSecondWeek ? 'HIDE NEXT WEEK' : 'SHOW NEXT WEEK'}
              </Text>
              <Icon name={showSecondWeek ? 'chevronUp' : 'chevronDown'} size={15} color="primary" />
            </PressScale>
          )}
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

      {!inProgress && (
        <>
          {!showBuilder ? (
            <Card elevated contextTone={workoutTone}>
              <Text variant="caption" color="primaryTextSoft" weight="bold">YOUR NEXT SESSION</Text>
              <Text variant="body" color="primaryTextSoft" style={{ marginTop: spacing.sm }}>
                We&apos;ll use your goals, recent training, recovery, and available equipment to shape a session that fits today.
              </Text>
              <Button title="Build today’s workout" onPress={() => setShowBuilder(true)} fullWidth style={{ marginTop: spacing.lg }} />
              <PressScale
                onPress={() => {
                  setShowBuilder(true);
                  setShowBuilderAdjustments(true);
                  openSection('feeling');
                }}
                accessibilityRole="button"
                accessibilityLabel="Adjust today's readiness before building your workout"
                haptic="selection"
                style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm }}
              >
                <Text variant="label" color="primaryTextSoft" weight="semibold">Adjust today&apos;s readiness</Text>
              </PressScale>
            </Card>
          ) : (
          <View
            ref={buildMarkerRef}
            onLayout={(e) => {
              buildAreaY.current = e.nativeEvent.layout.y;
            }}
          >
          <Card elevated>
            <View style={{ gap: spacing.md }}>
              <Row
                gap="md"
                style={{
                  alignItems: 'center',
                  padding: spacing.md,
                  borderRadius: radii.lg,
                  backgroundColor: colors.tones[workoutTone].surface,
                  borderWidth: 1,
                  borderColor: colors.tones[workoutTone].border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="caption" tint={colors.tones[workoutTone].text} weight="bold">
                    {selectedRoutine ? 'TODAY’S ROUTINE' : 'RECOMMENDED WORKOUT'}
                  </Text>
                  <Text variant="subtitle" tint={colors.tones[workoutTone].text} style={{ marginTop: 2 }}>
                    {selectedRoutine
                      ? selectedRoutine.name
                      : `${workoutLabel(workoutType)} · ${familyOfWorkoutType(workoutType) === 'mobility' ? `${flowDurationMin} min` : `${targetDurationMin} min`}`}
                  </Text>
                  <Text variant="caption" tint={colors.tones[workoutTone].text} style={{ marginTop: 2 }}>
                    {selectedRoutine
                      ? `${selectedRoutine.exerciseIds.length} exercise${selectedRoutine.exerciseIds.length === 1 ? '' : 's'}`
                      : selectedEmphasisLabels.length > 0 ? selectedEmphasisLabels.join(' · ') : 'Personalized to today'}
                  </Text>
                </View>
                <Button
                  title={showBuilderAdjustments ? 'Done' : 'Adjust'}
                  size="sm"
                  variant={showBuilderAdjustments ? 'secondary' : 'primary'}
                  onPress={() => {
                    if (showBuilderAdjustments) setOpenBuilderSection(null);
                    setShowBuilderAdjustments((shown) => !shown);
                  }}
                />
              </Row>

              {showBuilderAdjustments && (
                <View style={{ gap: spacing.sm }}>
                  {routines.length > 0 && (
                    <View
                      ref={(node) => { sectionMarkerRefs.current.routine = node; }}
                      onLayout={handleSectionLayout('routine')}
                    >
                      <ActionRow
                        icon={<Icon name="workout" size={17} color="primaryTextSoft" />}
                        label="Routine"
                        description={selectedRoutine ? selectedRoutine.name : 'Build for me'}
                        onPress={() => toggleSection('routine')}
                        trailing={<Icon name={openBuilderSection === 'routine' ? 'chevronUp' : 'chevronDown'} color="primaryTextSoft" />}
                      />
                      {openBuilderSection === 'routine' && (
                        <Card tone="surfaceAlt">
                          <Row gap="sm" wrap>
                            <Chip label="Build for me" selected={!selectedRoutineId} onPress={() => chooseRoutine(null)} />
                            <Chip
                              label="Auto-pick for me"
                              icon={<Icon name="target" size={16} color="primaryTextSoft" />}
                              selected={false}
                              onPress={autoPickRoutine}
                            />
                            <Chip
                              label="Pick a routine"
                              icon={<Icon name="chevronRight" size={16} color="primaryTextSoft" />}
                              selected={false}
                              onPress={() => setRoutinePickerVisible(true)}
                            />
                          </Row>
                          {selectedRoutine && (
                            <View
                              style={{
                                marginTop: spacing.sm,
                                padding: spacing.md,
                                borderRadius: radii.md,
                                backgroundColor: colors.surface,
                                borderWidth: 1,
                                borderColor: colors.border,
                              }}
                            >
                              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flex: 1 }}>
                                  <Text variant="subtitle">{selectedRoutine.name}</Text>
                                  <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                                    {selectedRoutine.exerciseIds.length} exercise{selectedRoutine.exerciseIds.length === 1 ? '' : 's'}
                                  </Text>
                                </View>
                                <Button title="View" size="sm" variant="secondary" onPress={() => setViewRoutineId(selectedRoutine.id)} />
                              </Row>
                              <Text variant="caption" color="textFaint" style={{ marginTop: spacing.sm }}>
                                Today&apos;s readiness and avoidance still adjust the prescription.
                              </Text>
                            </View>
                          )}
                        </Card>
                      )}
                    </View>
                  )}
                  <View
                    ref={(node) => { sectionMarkerRefs.current.session = node; }}
                    onLayout={handleSectionLayout('session')}
                  >
                  <ActionRow
                    icon={<Icon name="target" size={17} color="primaryTextSoft" />}
                    label="Workout Focus"
                    description={workoutLabel(workoutType)}
                    onPress={() => toggleSection('session')}
                    trailing={<Icon name={openBuilderSection === 'session' ? 'chevronUp' : 'chevronDown'} color="primaryTextSoft" />}
                  />
                  {openBuilderSection === 'session' && (
                    <Card tone="surfaceAlt">
                      <View style={{ gap: spacing.sm }}>
                        <Text variant="caption" color="textFaint" weight="bold">WORKOUT FOCUS</Text>
                        <Row gap="sm">
                          {FAMILY_OPTIONS.map((option) => (
                            <FamilyTile
                              key={option.value}
                              label={option.label}
                              value={option.value}
                              selected={selectedFamily === option.value}
                              onPress={() => {
                                setSelectedFamily(option.value);
                                // Cardio has exactly one WorkoutType member — picking
                                // the family IS picking the style, so it sets
                                // `workoutType` immediately rather than waiting for a
                                // step-B tile that would just repeat the same choice.
                                if (option.value === 'cardio') changeWorkoutType('cardio');
                              }}
                            />
                          ))}
                        </Row>
                        {selectedFamily === 'cardio' ? (
                          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.md, gap: spacing.sm }}>
                            <Text variant="caption" color="textFaint" weight="bold">CARDIO TYPE</Text>
                            {Array.from(
                              { length: Math.ceil(CARDIO_MODALITIES.length / 2) },
                              (_, rowIndex) => {
                                const row = CARDIO_MODALITIES.slice(rowIndex * 2, rowIndex * 2 + 2);
                                return (
                                  <Row key={rowIndex} gap="sm">
                                    {row.map((value) => (
                                      <ChoiceTile
                                        key={value}
                                        label={CARDIO_MODALITY_LABELS[value]}
                                        icon={<Icon name={CARDIO_MODALITY_ICONS[value]} size={20} color={cardioModalities.includes(value) ? 'primaryTextSoft' : 'textMuted'} />}
                                        selected={cardioModalities.includes(value)}
                                        onPress={() => toggleCardioModality(value)}
                                        tone={toneForWorkoutType(workoutType)}
                                        style={{ flex: 1 }}
                                      />
                                    ))}
                                    {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
                                  </Row>
                                );
                              },
                            )}
                          </View>
                        ) : (
                          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.md, gap: spacing.sm }}>
                            <Text variant="caption" color="textFaint" weight="bold">STYLE</Text>
                            {Array.from(
                              { length: Math.ceil(WORKOUT_TYPE_OPTIONS.filter((option) => familyOfWorkoutType(option.value) === selectedFamily).length / 2) },
                              (_, rowIndex) => {
                                const row = WORKOUT_TYPE_OPTIONS
                                  .filter((option) => familyOfWorkoutType(option.value) === selectedFamily)
                                  .slice(rowIndex * 2, rowIndex * 2 + 2);
                                return (
                                  <Row key={rowIndex} gap="sm">
                                    {row.map((option) => (
                                      <WorkoutTypeTile
                                        key={option.label}
                                        label={option.label}
                                        value={option.value}
                                        selected={workoutType === option.value}
                                        onPress={() => changeWorkoutType(option.value)}
                                      />
                                    ))}
                                    {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
                                  </Row>
                                );
                              },
                            )}
                          </View>
                        )}
                      </View>
                    </Card>
                  )}
                  </View>

                  <View
                    ref={(node) => { sectionMarkerRefs.current.focus = node; }}
                    onLayout={handleSectionLayout('focus')}
                  >
                  <ActionRow
                    icon={<Icon name="target" size={17} color="primaryTextSoft" />}
                    label="Target area"
                    description={selectedEmphasisLabels.length > 0 ? selectedEmphasisLabels.join(' · ') : 'Automatic'}
                    onPress={() => toggleSection('focus')}
                    trailing={<Icon name={openBuilderSection === 'focus' ? 'chevronUp' : 'chevronDown'} color="primaryTextSoft" />}
                  />
                  {openBuilderSection === 'focus' && (
                    <Card tone="surfaceAlt">
                      {workoutType !== 'yoga' && workoutType !== 'barre' && workoutType !== 'pilates' && workoutType !== 'cardio' ? (
                        <>
                          <Text variant="caption" color="textMuted">
                            {recommendedEmphasis.length > 0 && !emphasizeTouched
                              ? "Highlighted from today's recovery — tap to adjust (up to 2)."
                              : 'Choose up to two areas to prioritize.'}
                          </Text>
                          <Row gap="sm" wrap style={{ marginTop: spacing.md }}>
                            <Chip
                              label={FULL_BODY_EMPHASIS_OPTION.label}
                              icon={<Icon name="goalStrength" size={18} color={emphasize.has(FULL_BODY_KEY) ? 'primaryTextSoft' : 'textMuted'} />}
                              selected={emphasize.has(FULL_BODY_KEY)}
                              onPress={() => toggleEmphasis(FULL_BODY_KEY)}
                            />
                            {EMPHASIS_OPTIONS.map((option) => {
                              const key = areaKey(option.area);
                              const group = option.area.group;
                              return (
                                <Chip
                                  key={key}
                                  label={option.label}
                                  icon={group ? <MuscleLogo groups={[group]} size={22} /> : undefined}
                                  selected={emphasize.has(key)}
                                  onPress={() => toggleEmphasis(key)}
                                />
                              );
                            })}
                          </Row>
                          {emphasize.size > 0 && !emphasize.has(FULL_BODY_KEY) && (
                            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md, paddingTop: spacing.md }}>
                              <Text variant="caption" color="textFaint" weight="bold">HOW MUCH</Text>
                              <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
                                <Chip label="Mostly this" selected={emphasisMode === 'balanced'} onPress={() => setEmphasisMode('balanced')} />
                                <Chip label="Only this" selected={emphasisMode === 'priority'} onPress={() => setEmphasisMode('priority')} />
                              </Row>
                            </View>
                          )}
                        </>
                      ) : workoutType === 'cardio' && cardioModalities.length > 0 && cardioModalities.every((value) => CARDIO_TARGET_AREA_TYPES.includes(value)) ? (
                        <>
                          <Text variant="caption" color="textMuted">Choose up to two areas to prioritize.</Text>
                          <Row gap="sm" wrap style={{ marginTop: spacing.md }}>
                            <Chip
                              label={FULL_BODY_EMPHASIS_OPTION.label}
                              selected={emphasize.has(FULL_BODY_KEY)}
                              onPress={() => toggleEmphasis(FULL_BODY_KEY)}
                            />
                            {CARDIO_TARGET_AREA_OPTIONS.map((option) => {
                              const key = areaKey(option.area);
                              return (
                                <Chip
                                  key={key}
                                  label={option.label}
                                  selected={emphasize.has(key)}
                                  onPress={() => toggleEmphasis(key)}
                                />
                              );
                            })}
                          </Row>
                        </>
                      ) : (
                        <Text variant="caption" color="textMuted">
                          {workoutType === 'cardio' ? 'Target area applies to Aerobics, Bodyweight, and Loaded cardio.' : 'This flow is designed to make space to move.'}
                        </Text>
                      )}
                    </Card>
                  )}
                  </View>

                  <View
                    ref={(node) => { sectionMarkerRefs.current.shape = node; }}
                    onLayout={handleSectionLayout('shape')}
                  >
                  <ActionRow
                    icon={<Icon name="time" size={17} color="primaryTextSoft" />}
                    label="Shape"
                    description={`${familyOfWorkoutType(workoutType) === 'mobility' ? flowDurationMin : targetDurationMin} min · ${workoutType === 'cardio' ? CARDIO_INTENTS.find((option) => option.value === cardioIntent)?.label : selectedComponentsLabel}`}
                    onPress={() => toggleSection('shape')}
                    trailing={<Icon name={openBuilderSection === 'shape' ? 'chevronUp' : 'chevronDown'} color="primaryTextSoft" />}
                  />
                  {openBuilderSection === 'shape' && (
                    <Card tone="surfaceAlt">
                      {familyOfWorkoutType(workoutType) !== 'mobility' ? (
                        <>
                          <Text variant="caption" color="textFaint" weight="bold">SESSION LENGTH</Text>
                          <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
                            {SESSION_DURATIONS.map((minutes) => <Chip key={minutes} label={`${minutes} min`} selected={targetDurationMin === minutes} onPress={() => setTargetDurationMin(minutes)} />)}
                          </Row>
                          {workoutType === 'cardio' && (
                            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md, paddingTop: spacing.md }}>
                              <Text variant="caption" color="textFaint" weight="bold">STRUCTURE</Text>
                              <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
                                {CARDIO_INTENTS.map((option) => <Chip key={option.value} label={option.label} selected={cardioIntent === option.value} onPress={() => setCardioIntent(option.value)} />)}
                              </Row>
                            </View>
                          )}
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
                          <Text variant="caption" color="textFaint" weight="bold">FLOW LENGTH</Text>
                          <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
                            {FLOW_DURATIONS.map((minutes) => <Chip key={minutes} label={`${minutes} min`} selected={flowDurationMin === minutes} onPress={() => setFlowDurationMin(minutes)} />)}
                          </Row>
                          <Text variant="caption" color="textFaint" weight="bold" style={{ marginTop: spacing.md }}>PACE</Text>
                          <Row gap="sm" style={{ marginTop: spacing.sm }}>
                            <Chip label="Gentle" selected={flowPace === 'gentle'} onPress={() => setFlowPace('gentle')} />
                            <Chip label="Standard" selected={flowPace === 'standard'} onPress={() => setFlowPace('standard')} />
                          </Row>
                          <Text variant="caption" color="textFaint" weight="bold" style={{ marginTop: spacing.md }}>GUIDED FLOW</Text>
                          <Row gap="sm" style={{ marginTop: spacing.sm }}>
                            <Chip label="Touchless" selected={autoAdvanceOverride !== false} onPress={() => setAutoAdvanceOverride(undefined)} />
                            <Chip label="Manual" selected={autoAdvanceOverride === false} onPress={() => setAutoAdvanceOverride(false)} />
                          </Row>
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
                        // Cardio format itself lives in "Kind of session" now
                        // (ADR-0407) — picking the format is picking the style,
                        // not shaping the session, so it moved rather than
                        // being asked twice. Guided flow is still a Shape concern.
                        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md, paddingTop: spacing.md }}>
                          <Text variant="caption" color="textFaint" weight="bold">GUIDED FLOW</Text>
                          <Row gap="sm" style={{ marginTop: spacing.sm }}>
                            <Chip label="Touchless" selected={autoAdvanceOverride !== false} onPress={() => setAutoAdvanceOverride(undefined)} />
                            <Chip label="Manual" selected={autoAdvanceOverride === false} onPress={() => setAutoAdvanceOverride(false)} />
                          </Row>
                        </View>
                      )}
                      {(workoutType === 'yoga' || workoutType === 'pilates') && !hasYogaMat && (
                        <Row gap="sm" style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.primarySoft }}>
                          <View style={{ flex: 1 }}>
                            <Text variant="caption" color="primaryTextSoft" weight="bold">No yoga mat in your equipment</Text>
                            <Text variant="caption" color="primaryTextSoft">We&apos;ll build today&apos;s flow without one — add it if you&apos;ve got one.</Text>
                          </View>
                          <Button title="Add mat" size="sm" variant="secondary" onPress={addYogaMat} />
                        </Row>
                      )}
                      {workoutType === 'barre' && !hasBarre && (
                        <Row gap="sm" style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.primarySoft }}>
                          <View style={{ flex: 1 }}>
                            <Text variant="caption" color="primaryTextSoft" weight="bold">No barre in your equipment</Text>
                            <Text variant="caption" color="primaryTextSoft">We&apos;ll build today&apos;s flow without one — a sturdy chair or countertop works too.</Text>
                          </View>
                          <Button title="Add barre" size="sm" variant="secondary" onPress={addBarre} />
                        </Row>
                      )}
                    </Card>
                  )}
                  </View>

                  <View
                    ref={(node) => {
                      checkinMarkerRef.current = node;
                      sectionMarkerRefs.current.feeling = node;
                    }}
                    onLayout={(event) => {
                      const y = event.nativeEvent.layout.y;
                      checkinAreaY.current = y;
                      if (pendingScrollToCheckin.current) {
                        pendingScrollToCheckin.current = false;
                        requestAnimationFrame(() => scrollMarkerIntoView(checkinMarkerRef.current, scrollRef, y, false));
                      }
                      handleSectionLayout('feeling')(event);
                    }}
                  >
                    <ActionRow
                      icon={<Icon name="checkin" size={17} color="primaryTextSoft" />}
                      label="Feeling"
                      description={`Sleep ${READY_OPTIONS.sleep.find((option) => option.value === sleep)?.label} · Energy ${READY_OPTIONS.energy.find((option) => option.value === energy)?.label}`}
                      onPress={() => toggleSection('feeling')}
                      trailing={<Icon name={openBuilderSection === 'feeling' ? 'chevronUp' : 'chevronDown'} color="primaryTextSoft" />}
                    />
                    {openBuilderSection === 'feeling' && (
                      <Card tone="surfaceAlt" style={{ marginTop: spacing.sm }}>
                        <Text variant="caption" color="textFaint" weight="bold">WHAT KIND OF DAY?</Text>
                        <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
                          {INTENT_OPTIONS.map((option) => <Chip key={option.value} label={option.label} selected={trainingIntent === option.value} onPress={() => setTrainingIntent(option.value)} />)}
                        </Row>
                        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
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
                      </Card>
                    )}
                  </View>

                  <View
                    ref={(node) => { sectionMarkerRefs.current.adjustments = node; }}
                    onLayout={handleSectionLayout('adjustments')}
                  >
                  <ActionRow
                    icon={<Icon name="target" size={17} color="primaryTextSoft" />}
                    label="Adjustments"
                    description={concerns.size ? `${concerns.size} area${concerns.size === 1 ? '' : 's'} noted` : 'No areas to protect'}
                    onPress={() => toggleSection('adjustments')}
                    trailing={<Icon name={openBuilderSection === 'adjustments' ? 'chevronUp' : 'chevronDown'} color="primaryTextSoft" />}
                  />
                  {openBuilderSection === 'adjustments' && (
                    <Card tone="surfaceAlt">
                      <Text variant="caption" color="textFaint">ANY AREAS TO TAKE CARE WITH?</Text>
                      <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
                        {CONCERN_OPTIONS.map((concern) => {
                          const key = areaKey(concern.area);
                          return <Chip key={key} label={concernLabel(concern.label, key)} selected={concerns.has(key)} onPress={() => cycleConcern(key)} />;
                        })}
                      </Row>
                    </Card>
                  )}
                  </View>
                </View>
              )}

              <Button title={building ? 'Building…' : 'Build Workout'} onPress={build} loading={building} fullWidth />
            </View>

          </Card>
          </View>
          )}

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
                  <ToneIconTile name="workout" size={32} iconSize={17} tone={planTone} />
                  <View>
                    <Text variant="heading" tint={colors.tones[planTone].text} italic>Workout Focus: {workoutOverview(plan).focus}</Text>
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
              <View style={{ marginTop: spacing.lg, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }}>
                <Text variant="caption" color="textMuted" weight="bold">WHY THIS TODAY</Text>
                <Text variant="body" style={{ marginTop: 4 }}>{plan.rationale}</Text>
              </View>
              <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
                <Text variant="caption" color="textFaint" weight="bold">YOUR SESSION FLOW</Text>
                <Row gap="sm" wrap>
                  {plan.blocks.map((block) => {
                    const label = block.label.toLowerCase();
                    const icon = label.includes('warm') ? 'warmup' : label.includes('cool') ? 'cooldown' : label.includes('condition') || block.modality === 'cardio' ? 'conditioning' : 'workout';
                    return (
                      <View key={block.label} style={{ minWidth: 92, flexGrow: 1, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }}>
                        <Icon name={icon} size={16} tint={colors.tones[planTone].text} />
                        <Text variant="label" weight="semibold" style={{ marginTop: 5 }}>{block.label}</Text>
                        <Text variant="caption" color="textMuted">{block.exercises.length} exercise{block.exercises.length === 1 ? '' : 's'}</Text>
                      </View>
                    );
                  })}
                </Row>
              </View>
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
            </Card>
            </View>
          )}
        </>
      )}

      <Text variant="caption" color="textFaint" center>
        Your plan stays private on this device
      </Text>

      <RecoverySheet visible={showRecovery} onClose={() => setShowRecovery(false)} />
      <RoutinePickerSheet
        visible={routinePickerVisible}
        routines={routines}
        selectedRoutineId={selectedRoutineId}
        onClose={() => setRoutinePickerVisible(false)}
        onSelect={(id) => chooseRoutine(id)}
        onAutoPick={autoPickRoutine}
        onView={(id) => setViewRoutineId(id)}
      />
      <RoutineDetailSheet
        routine={viewRoutine}
        weightUnit={athlete?.weightUnit ?? 'kg'}
        onClose={() => setViewRoutineId(null)}
        onEdit={() => {
          setViewRoutineId(null);
          setRoutinePickerVisible(false);
          router.push({ pathname: '/explore', params: { tab: 'routines' } });
        }}
        onUseToday={(routine) => {
          chooseRoutine(routine.id);
          setViewRoutineId(null);
          setRoutinePickerVisible(false);
        }}
        onOpenExercise={(exerciseId) => setRoutineExerciseHistoryId(exerciseId)}
        onDeleted={() => {
          setViewRoutineId(null);
          setRoutines(listRoutines());
        }}
      />
      <ExerciseHistorySheet
        exerciseId={routineExerciseHistoryId}
        weightUnit={athlete?.weightUnit ?? 'kg'}
        onClose={() => setRoutineExerciseHistoryId(null)}
      />
    </Screen>
  );
}
