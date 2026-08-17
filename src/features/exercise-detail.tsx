/**
 * Shared exercise-detail UI — the hero header and set-tracking rows shown
 * whenever an athlete drills into one exercise, whether that's mid-workout
 * (`app/workout.tsx`) or previewing/editing a planned exercise before a
 * session starts (`WorkoutExerciseGroups`). Kept in one place so both flows
 * read as the same view rather than two components that drift apart.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Pressable, View, type ImageSourcePropType } from 'react-native';

import { CheckToggle, FloatingEditField, HeroScrim, Icon, MuscleLogo, Row, Stepper, Text, useTheme } from '@/design';
import { EXERCISES } from '@/domain/catalog';
import { availableWeightsForExercise } from '@/domain/engine';
import { LOAD_DEMAND_HI, LOAD_DEMAND_LO, cardioIntensityT, metForExercise, resolvedLoadDemand } from '@/domain/engine/intensity';
import { INTENSITY_LABELS, MUSCLE_GROUP_LABELS } from '@/app-lib/options';
import { repsLabelFor } from '@/app-lib/set-presentation';
import { exerciseBestStats } from '@/domain/metrics';
import { isExerciseExcluded, isExerciseFavorite, isTimerSoundEnabled, setExerciseExcluded, setExerciseFavorite } from '@/services/exercise-preferences';
import { listHistory } from '@/services/sessions';
import { displayWeightToKg, formatWeight, kgToDisplayWeight, weightStep } from '@/app-lib/units';
import {
  GROUP_TO_REGION,
  type Exercise,
  type EquipmentInventory,
  type Modality,
  type PlannedExercise,
  type WeightUnit,
  type WorkoutType,
} from '@/domain/types';

/** The fields shared by a planned target and a performed set, so `SetRow` works
 * against either. The numeric four are read/written; the set-kind flags are
 * read-only and drive how the row labels itself (ADR-0128). */
export type EditableSet = {
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  distanceM?: number;
  /** Set kind (ADR-0128) — a ramp set and an all-out test read very differently. */
  isWarmup?: boolean;
  isCalibration?: boolean;
  /** The floor an all-out set is asked to beat; drives the `N+` label. */
  prescribedReps?: number;
  /** Interval-cardio work/recovery phase (ADR-0406) — drives the row's Work/
   * Recovery title in the manual tracker, same signal the guided-flow player
   * already reads (`hasIntervalPhases`/`cardioRoundCount`, guided-flow.ts). */
  phase?: 'work' | 'recovery';
};

export function formatClock(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** "Per arm" / "Per leg" for a unilateral exercise, inferred from which region
 * its primary areas load — the catalog doesn't tag laterality directly. */
export function unilateralLabel(exercise?: Pick<Exercise, 'unilateral' | 'primaryAreas'>): string | undefined {
  if (!exercise?.unilateral) return undefined;
  const regions = exercise.primaryAreas.map((group) => GROUP_TO_REGION[group]);
  const lower = regions.includes('lower_body');
  const upper = regions.includes('upper_body');
  if (lower && !upper) return 'Per leg';
  if (upper && !lower) return 'Per arm';
  return 'Per side';
}

/** Clear, non-numeric intensity label (ADR-0123) — cardio routes through a
 * real (or tier-fallback) MET value, strength through a mechanics-derived
 * load-demand rating. Mobility isn't meaningfully graded on either track. */
export function intensityLabel(
  exercise?: Pick<Exercise, 'modality' | 'movementPattern' | 'metValue' | 'loadDemand' | 'mechanic' | 'primaryAreas' | 'secondaryAreas' | 'unilateral'>,
): string | undefined {
  if (!exercise) return undefined;
  if (exercise.modality === 'cardio') {
    const t = cardioIntensityT(metForExercise(exercise));
    if (t < 0.33) return INTENSITY_LABELS.cardioLight;
    if (t < 0.66) return INTENSITY_LABELS.cardioModerate;
    return INTENSITY_LABELS.cardioVigorous;
  }
  if (exercise.modality === 'strength' || exercise.modality === 'general') {
    const demand = resolvedLoadDemand(exercise);
    const t = (demand - LOAD_DEMAND_LO) / (LOAD_DEMAND_HI - LOAD_DEMAND_LO);
    if (t < 0.33) return INTENSITY_LABELS.strengthLighter;
    if (t < 0.66) return INTENSITY_LABELS.strengthStandard;
    return INTENSITY_LABELS.strengthDemanding;
  }
  return undefined;
}

export const WORKOUT_TYPE_ART: Record<WorkoutType, ImageSourcePropType> = {
  yoga: require('../../assets/images/heroes/yoga-hero.webp'),
  barre: require('../../assets/images/workout-types/barre-thumbnail.webp'),
  pilates: require('../../assets/images/workout-types/pilates-thumbnail.webp'),
  stretch: require('../../assets/images/heroes/stretch-hero.webp'),
  cardio: require('../../assets/images/heroes/cardio-hero.webp'),
  bodybuilding: require('../../assets/images/heroes/bodybuilding-hero.webp'),
  bodyweight: require('../../assets/images/heroes/bodyweight-hero.webp'),
  sculpting: require('../../assets/images/workout-types/sculpting-thumbnail.webp'),
};

/** Shared workout-style artwork for the planner, routine builder, and workout views. */
export function workoutTypeArt(workoutType?: WorkoutType): ImageSourcePropType {
  return workoutType ? WORKOUT_TYPE_ART[workoutType] : WORKOUT_TYPE_ART.bodyweight;
}

const WORKOUT_HEADER_BACKGROUNDS: Record<WorkoutType, { label: string; image: ImageSourcePropType }> = {
  yoga: { label: 'Yoga', image: WORKOUT_TYPE_ART.yoga },
  barre: { label: 'Barre', image: WORKOUT_TYPE_ART.barre },
  pilates: { label: 'Pilates', image: WORKOUT_TYPE_ART.pilates },
  stretch: { label: 'Stretch', image: WORKOUT_TYPE_ART.stretch },
  cardio: { label: 'Cardio', image: WORKOUT_TYPE_ART.cardio },
  bodybuilding: { label: 'Bodybuilding', image: WORKOUT_TYPE_ART.bodybuilding },
  bodyweight: { label: 'Bodyweight', image: WORKOUT_TYPE_ART.bodyweight },
  sculpting: { label: 'Sculpting', image: WORKOUT_TYPE_ART.sculpting },
};

/** Exported for `app/workout-flow.tsx` — the guided-flow player's full-bleed
 * background falls back to the same workout-style art as everywhere else. */
export function workoutHeaderBackground(workoutType?: WorkoutType, modality?: Modality) {
  if (workoutType) return WORKOUT_HEADER_BACKGROUNDS[workoutType];
  if (modality === 'cardio') return WORKOUT_HEADER_BACKGROUNDS.cardio;
  if (modality === 'mobility') return WORKOUT_HEADER_BACKGROUNDS.stretch;
  return WORKOUT_HEADER_BACKGROUNDS.bodybuilding;
}

function exerciseHeaderBackground(exercise?: Pick<Exercise, 'modality' | 'movementPattern'>, workoutType?: WorkoutType, modality?: Modality) {
  if (!exercise) return workoutHeaderBackground(workoutType, modality);
  if (exercise.movementPattern === 'yoga_flow') return WORKOUT_HEADER_BACKGROUNDS.yoga;
  if (exercise.modality === 'strength') return { ...WORKOUT_HEADER_BACKGROUNDS.bodybuilding, label: 'Strength' };
  if (exercise.modality === 'cardio') return WORKOUT_HEADER_BACKGROUNDS.cardio;
  if (exercise.modality === 'mobility') return WORKOUT_HEADER_BACKGROUNDS.stretch;
  return WORKOUT_HEADER_BACKGROUNDS.bodyweight;
}

/**
 * The hero header for one exercise (or superset — pass no `exerciseId`). Owns
 * its own favorite/exclude state so every call site gets the same behavior
 * for free (ADR-0130-style: one place, not re-implemented per screen).
 */
export function ExerciseHero({
  name,
  exercise,
  exerciseId,
  workoutType,
  modality,
  eyebrow,
  onHowTo,
  onReplace,
  onHistory,
  onOverview,
  variant = 'workout',
}: {
  name: string;
  exercise?: Pick<Exercise, 'modality' | 'movementPattern' | 'primaryAreas'>;
  /** When set, shows favorite/exclude buttons for this exercise. Omitted for a
   *  superset hero, which doesn't represent a single exercise. */
  exerciseId?: string;
  workoutType?: WorkoutType;
  modality?: Modality;
  eyebrow: string;
  onHowTo: () => void;
  /** Omit to hide the Replace action — there's nothing to swap when browsing
   *  outside a workout (Pattern 2 / `variant="info"`). */
  onReplace?: () => void;
  onHistory: () => void;
  onOverview: () => void;
  /** "workout" (default) frames this as the exercise currently being adjusted
   *  in a workout, with a "Back to Overview" pill. "info" is for browsing an
   *  exercise outside any workout context — drops that framing and closes instead. */
  variant?: 'workout' | 'info';
}) {
  const { colors, radii, spacing, shadows } = useTheme();
  const background = exerciseHeaderBackground(exercise, workoutType, modality);
  const [isFavorite, setIsFavorite] = useState(() => (exerciseId ? isExerciseFavorite(exerciseId) : false));
  const [isExcluded, setIsExcluded] = useState(() => (exerciseId ? isExerciseExcluded(exerciseId) : false));
  // Re-sync on an exerciseId change (superset heroes remount per exercise, but
  // guard against it anyway) without an effect — set during render, per React's
  // "adjusting state when a prop changes" pattern.
  const [syncedExerciseId, setSyncedExerciseId] = useState(exerciseId);
  if (exerciseId !== syncedExerciseId) {
    setSyncedExerciseId(exerciseId);
    setIsFavorite(exerciseId ? isExerciseFavorite(exerciseId) : false);
    setIsExcluded(exerciseId ? isExerciseExcluded(exerciseId) : false);
  }

  const heroControlStyle = (pressed: boolean) => ({
    minHeight: 42,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.heroPill,
    borderWidth: 1,
    borderColor: colors.heroBorder,
    opacity: pressed ? 0.76 : 1,
  });

  const heroIconControlStyle = (pressed: boolean) => ({
    width: 42,
    height: 42,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radii.lg,
    backgroundColor: colors.heroPill,
    borderWidth: 1,
    borderColor: colors.heroBorder,
    opacity: pressed ? 0.76 : 1,
  });

  return (
    <View style={{ minHeight: 248, overflow: 'hidden', borderRadius: radii.xxl, backgroundColor: colors.hero, ...shadows.md }}>
      <Image source={background.image} contentFit="cover" contentPosition="right center" accessibilityLabel="" style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.35 }} />
      <HeroScrim />
      <View style={{ flex: 1, justifyContent: 'space-between', padding: spacing.lg }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={variant === 'info' ? 'Close exercise info' : 'Back to workout overview'} onPress={onOverview} style={({ pressed }) => heroControlStyle(pressed)}>
            <Icon name={variant === 'info' ? 'close' : 'chevronLeft'} size={16} color="heroText" />
            <Text variant="label" color="heroText" weight="semibold">{variant === 'info' ? 'Close' : 'Overview'}</Text>
          </Pressable>
          {exerciseId ? (
            <Row gap="xs">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isFavorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
                accessibilityState={{ selected: isFavorite }}
                onPress={() => setIsFavorite(setExerciseFavorite(exerciseId, !isFavorite).favoriteExerciseIds.includes(exerciseId))}
                style={({ pressed }) => heroIconControlStyle(pressed)}
              >
                <Icon name={isFavorite ? 'favorite' : 'favoriteOutline'} size={18} color={isFavorite ? 'warning' : 'heroText'} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isExcluded ? `Include ${name} in future workouts` : `Exclude ${name} from future workouts`}
                accessibilityState={{ selected: isExcluded }}
                onPress={() => setIsExcluded(setExerciseExcluded(exerciseId, !isExcluded).excludedExerciseIds.includes(exerciseId))}
                style={({ pressed }) => heroIconControlStyle(pressed)}
              >
                <Icon name={isExcluded ? 'selected' : 'exclude'} size={18} color="heroText" />
              </Pressable>
            </Row>
          ) : null}
        </Row>

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" color="heroMuted" weight="bold">{background.label.toUpperCase()} · {eyebrow}</Text>
          {variant === 'workout' ? <Text variant="caption" color="heroMuted">{name === 'Superset' ? 'Current superset' : 'Current exercise'}</Text> : null}
          <Row gap="sm" style={{ marginTop: spacing.xs, alignItems: 'center' }}>
            {variant === 'info' && exercise?.primaryAreas?.length ? <MuscleLogo groups={exercise.primaryAreas} size={40} /> : null}
            <Text variant="title" color="heroText" italic numberOfLines={2} style={{ flexShrink: 1, maxWidth: variant === 'info' && exercise?.primaryAreas?.length ? '78%' : '92%' }}>{name}</Text>
          </Row>
          {variant === 'info' && exercise?.primaryAreas?.length ? (
            <Text variant="caption" color="heroMuted">{exercise.primaryAreas.map((group) => MUSCLE_GROUP_LABELS[group]).join(' · ')}</Text>
          ) : null}
        </View>

        <Row gap="xs">
          <Pressable accessibilityRole="button" accessibilityLabel={`How to perform ${name}`} onPress={onHowTo} style={({ pressed }) => ({ ...heroControlStyle(pressed), flex: 1.15 })}>
            {variant === 'info' ? <Icon name="play" size={14} color="heroText" /> : null}
            <Text variant="label" color="heroText" weight="semibold">{variant === 'info' ? 'How To' : 'How-to'}</Text>
          </Pressable>
          {onReplace ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Replace an exercise in ${name}`} onPress={onReplace} style={({ pressed }) => ({ ...heroControlStyle(pressed), flex: 1 })}>
              <Icon name="rotation" size={16} color="heroText" />
              <Text variant="label" color="heroText" weight="semibold">Replace</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`View workout history for ${name}`} onPress={onHistory} style={({ pressed }) => ({ ...heroControlStyle(pressed), flex: 1 })}>
            <Icon name="time" size={16} color="heroText" />
            <Text variant="label" color="heroText" weight="semibold">History</Text>
          </Pressable>
        </Row>
      </View>
    </View>
  );
}

/** A slim readout of this exercise's all-time best — nothing renders until
 * there's at least one completed set in history to report. */
export function ExerciseBestStatsRow({ exerciseId, weightUnit }: { exerciseId: string; weightUnit: WeightUnit }) {
  const { colors, radii, spacing } = useTheme();
  const stats = exerciseBestStats(listHistory(200), exerciseId);

  let label: string | null = null;
  if (stats.bestWeightKg != null) {
    label = `Best set ${formatWeight(stats.bestWeightKg, weightUnit)} × ${stats.bestWeightReps}`;
    if (stats.bestE1rmKg != null) label += ` · Est. 1RM ${formatWeight(stats.bestE1rmKg, weightUnit)}`;
  } else if (stats.bestLoadedWeightKg != null && stats.maxDurationSec != null) {
    label = `Best set ${formatWeight(stats.bestLoadedWeightKg, weightUnit)} for ${formatClock(stats.maxDurationSec)}`;
  } else if (stats.maxReps != null) {
    label = `Best set ${stats.maxReps} reps`;
  } else if (stats.maxDurationSec != null) {
    label = `Best set ${formatClock(stats.maxDurationSec)}`;
  }

  if (!label) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }}>
      <Icon name="trophy" size={15} color="warning" />
      <Text variant="label" color="textMuted" weight="semibold">{label}</Text>
    </View>
  );
}

/** The set/exercise completion box — a thin shape/size preset over the shared
 * `CheckToggle` primitive (ADR-0130). */
export function CompletionBox({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
  return <CheckToggle checked={checked} onPress={onPress} label={label} size={26} shape="box" tone="success" />;
}

/**
 * Digit-entry mask for the duration editor: the athlete types plain digits on
 * a number pad (no colon key needed) and they fill in from the right, same as
 * punching a time into a microwave — "130" reads as 1:30. Keeps the field on
 * `keyboardType="number-pad"` instead of a full keyboard.
 */
function digitsToSeconds(digits: string): number {
  if (!digits) return 0;
  const secondsPart = digits.slice(-2).padStart(2, '0');
  const minutePart = digits.slice(0, -2) || '0';
  return parseInt(minutePart, 10) * 60 + parseInt(secondsPart, 10);
}

function secondsToDigits(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}${String(seconds).padStart(2, '0')}` : String(seconds);
}

function TimerIconButton({
  accessibilityLabel,
  onPress,
  disabled = false,
  compact = false,
  children,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
  children: ReactNode;
}) {
  const { colors, radii } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: compact ? 28 : 32,
        height: compact ? 32 : 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radii.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

export function TimedSetControls({
  durationSec,
  onChange,
  compact = false,
  showLabel = true,
}: {
  durationSec: number;
  onChange: (durationSec: number) => void;
  compact?: boolean;
  showLabel?: boolean;
}) {
  const player = useAudioPlayer(require('../../assets/sounds/timer-complete.wav'));
  const [remaining, setRemaining] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const endAt = useRef(0);
  const hasCompleted = useRef(false);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const next = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setRemaining(next);
      if (next !== 0 || hasCompleted.current) return;
      hasCompleted.current = true;
      setRunning(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (isTimerSoundEnabled()) {
        player.seekTo(0);
        player.play();
      }
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [player, running]);

  function adjust(seconds: number) {
    const next = Math.max(0, durationSec + seconds);
    onChange(next);
    if (remaining == null) return;
    const nextRemaining = Math.max(0, remaining + seconds);
    if (running) endAt.current += seconds * 1000;
    setRemaining(nextRemaining);
  }

  function applyExactDuration(nextDurationSec: number) {
    hasCompleted.current = false;
    setRunning(false);
    setRemaining(null);
    onChange(Math.max(0, nextDurationSec));
  }

  function beginEdit() {
    setDraft(secondsToDigits(countdownValue));
    setEditing(true);
  }

  function commitEdit() {
    setEditing(false);
    applyExactDuration(digitsToSeconds(draft));
  }

  function handleDraftChange(text: string) {
    setDraft(text.replace(/\D/g, '').slice(-6));
  }

  function toggleCountdown() {
    if (running) {
      setRunning(false);
      setRemaining(Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000)));
      return;
    }
    const seconds = remaining ?? durationSec;
    if (seconds <= 0) return;
    hasCompleted.current = false;
    endAt.current = Date.now() + seconds * 1000;
    setRemaining(seconds);
    setRunning(true);
  }

  const countdownValue = remaining ?? durationSec;
  return (
    <View style={compact ? undefined : { gap: 2 }}>
      {showLabel && <Text variant="caption" color="textFaint" weight="bold">TIME</Text>}
      <Row gap="xs" style={{ alignItems: 'center' }}>
        <TimerIconButton accessibilityLabel="Remove 5 seconds" onPress={() => adjust(-5)} compact={compact}><Text variant="subtitle" weight="semibold">−</Text></TimerIconButton>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit duration directly" onPress={beginEdit} style={{ minWidth: compact ? 40 : 48, alignItems: 'center' }}>
          <Text variant={compact ? 'subtitle' : 'title'} color={running ? 'primaryTextSoft' : 'text'}>{formatClock(countdownValue)}</Text>
        </Pressable>
        <FloatingEditField
          visible={editing}
          label="TIME"
          value={formatClock(digitsToSeconds(draft))}
          onChangeText={handleDraftChange}
          onSubmit={commitEdit}
          keyboardType="number-pad"
        />
        <TimerIconButton accessibilityLabel="Add 5 seconds" onPress={() => adjust(5)} compact={compact}><Text variant="subtitle" weight="semibold">+</Text></TimerIconButton>
        <TimerIconButton accessibilityLabel={running ? 'Pause countdown' : remaining == null ? 'Start countdown' : 'Resume countdown'} disabled={countdownValue <= 0} onPress={toggleCountdown} compact={compact}>
          <Icon name={running ? 'pause' : 'play'} size={compact ? 16 : 18} color={running ? 'primary' : 'success'} />
        </TimerIconButton>
        {remaining != null && remaining < durationSec && (
          <TimerIconButton accessibilityLabel="Reset and pause countdown" onPress={() => { hasCompleted.current = false; setRunning(false); setRemaining(null); }} compact={compact}>
            <Icon name="reset" size={compact ? 16 : 18} color="textMuted" />
          </TimerIconButton>
        )}
      </Row>
    </View>
  );
}

export function SetRow({
  exercise,
  set,
  setIndex,
  completed = false,
  skipped = false,
  weightUnit,
  equipment,
  onUpdate,
  onToggle,
  title,
  muscleLabel,
  compact = false,
  showSetLabel = true,
  showCompletion = false,
  emphasis = 'upcoming',
}: {
  exercise: PlannedExercise;
  set: EditableSet;
  setIndex: number;
  completed?: boolean;
  skipped?: boolean;
  weightUnit: WeightUnit;
  equipment: EquipmentInventory;
  onUpdate: (patch: Partial<EditableSet>) => void;
  onToggle?: () => void;
  title?: string;
  muscleLabel?: string;
  compact?: boolean;
  showSetLabel?: boolean;
  showCompletion?: boolean;
  /** Where this set sits relative to the one the athlete is on right now. */
  emphasis?: 'done' | 'active' | 'upcoming';
}) {
  const { colors, radii, spacing } = useTheme();
  const catalog = EXERCISES.find((entry) => entry.id === exercise.exerciseId);
  const timedOnly = set.durationSec != null && set.reps == null;
  const showWeight = (catalog?.progression === 'weight' || catalog?.loadsWeight === true) && !catalog.equipment.includes('bodyweight');
  const ownedWeights = catalog ? availableWeightsForExercise(catalog, equipment)?.map((kg) => kgToDisplayWeight(kg, weightUnit)) : undefined;
  const perSideLabel = unilateralLabel(catalog);
  return (
    <View style={{ position: 'relative', marginTop: showSetLabel ? 14 : 0, gap: compact ? spacing.xs : spacing.sm, padding: compact ? spacing.sm : spacing.md, paddingRight: showCompletion && !title ? 48 : compact ? spacing.sm : spacing.md, borderRadius: radii.lg, backgroundColor: emphasis === 'active' ? colors.primarySoft : colors.surfaceAlt, borderWidth: emphasis === 'active' ? 2 : 1, borderColor: emphasis === 'active' ? colors.primary : colors.border, opacity: emphasis === 'done' ? 0.55 : 1 }}>
      {showSetLabel && <View style={{ position: 'absolute', zIndex: 1, top: -14, left: -14, width: 28, height: 28, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong }}><Text variant="caption" weight="bold">{setIndex + 1}</Text></View>}
      {showCompletion && !title && onToggle && <View style={{ position: 'absolute', zIndex: 1, top: spacing.sm, right: spacing.sm }}><CompletionBox checked={completed || skipped} label={`Mark set ${setIndex + 1} complete`} onPress={onToggle} /></View>}
      {title && <Row style={{ justifyContent: 'space-between' }}><Row gap="xs" wrap style={{ flex: 1, paddingRight: spacing.sm }}><Text variant="label" weight="semibold">{title}</Text>{muscleLabel && <Text variant="caption" color="textFaint">· {muscleLabel}</Text>}</Row>{showCompletion && onToggle && <CompletionBox checked={completed || skipped} label={`Mark ${title} complete`} onPress={onToggle} />}</Row>}
      <Row gap="xs">
        {!timedOnly && (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Stepper compact={compact} style={{ width: '100%' }} value={set.reps ?? 0} onChange={(reps) => onUpdate({ reps })} min={0} topLabel={repsLabelFor(set)} />
            {perSideLabel && <Text variant="caption" color="textFaint" style={{ textAlign: 'center', marginTop: 2 }}>{perSideLabel}</Text>}
          </View>
        )}
        {showWeight && !timedOnly && <View style={{ width: 1, height: 44, backgroundColor: colors.borderStrong }} />}
        {showWeight && (
          <Stepper
            compact={compact}
            style={{ flex: 1, minWidth: 0 }}
            value={set.weightKg == null ? undefined : kgToDisplayWeight(set.weightKg, weightUnit)}
            onChange={(value) => onUpdate({ weightKg: displayWeightToKg(value, weightUnit) })}
            step={weightStep(weightUnit)}
            values={ownedWeights}
            min={weightStep(weightUnit)}
            topLabel={`WEIGHT (${weightUnit.toUpperCase()})`}
          />
        )}
        {timedOnly && (
          <View style={{ flex: 1, minWidth: 0 }}>
            <TimedSetControls compact={compact} durationSec={set.durationSec ?? 0} onChange={(durationSec) => onUpdate({ durationSec })} />
            {perSideLabel && <Text variant="caption" color="textFaint" style={{ textAlign: 'center', marginTop: 2 }}>{perSideLabel}</Text>}
          </View>
        )}
        {set.distanceM != null && <Stepper compact={compact} value={Math.round((set.distanceM ?? 0) / 100) / 10} onChange={(value) => onUpdate({ distanceM: Math.round(value * 1000) })} step={0.1} min={0} topLabel="DISTANCE (KM)" />}
      </Row>
    </View>
  );
}
