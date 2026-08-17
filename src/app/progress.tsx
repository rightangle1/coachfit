/**
 * Progress — calorie estimate, strength & endurance trends, achievements
 * (CLAUDE.md Phase 2 / ADR-0201..0204). Real charts (`TrendChart`, an SVG
 * primitive — still no third-party charting library) for every trend, with
 * one shared trend-arrow/color vocabulary (`trendColor`/`trendArrow`/
 * `trendLabel`) used consistently across strength, endurance, training load,
 * and progressive overload.
 */

import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Card, Chip, Divider, GoalHero, Icon, IconButton, Meter, PressScale, Row, Screen, Stepper, Text, TrendChart, useTheme } from '@/design';
import type { ColorToken, ContextTone } from '@/design';
import { AchievementsSheet } from '@/features/achievements-sheet';
import { WorkoutDetailSheet } from '@/features/workout-detail-sheet';
import { getAthleteProfile, recordBodyweight } from '@/services/athlete';
import { getPlan, listHistory } from '@/services/sessions';
import { displayWeightToKg, formatWeight, kgToDisplayWeight } from '@/app-lib/units';
import { sessionDaysInRange, weeklyPerformance as computeWeeklyPerformance, workoutSummary } from '@/app-lib/presentation';
import { primaryGoal } from '@/app-lib/personalization';
import { ALL_MUSCLE_GROUPS } from '@/domain/types';
import type { MuscleGroup, SessionRecord, WeightUnit } from '@/domain/types';
import { MUSCLE_GROUP_LABELS } from '@/app-lib/options';
import { SAFETY, isVolumeStalling } from '@/domain/engine';
import {
  ALL_CARDIO_CATEGORIES,
  ALL_MOVEMENT_CATEGORIES,
  cardioCategoryEnduranceIndex,
  cardioCategoryEnduranceIndexHistory,
  currentStreakDays,
  bodyProfileOf,
  estimateSessionCalories,
  evaluateAchievements,
  isoWeekStart,
  latestCardioSnapshot,
  latestStrengthSnapshot,
  muscleGroupStrengthIndex,
  muscleGroupStrengthIndexHistory,
  overallEnduranceIndex,
  overallEndurancePerformanceIndex,
  overallStrengthIndex,
  overallStrengthPerformanceIndex,
  MEV,
  MRV,
  recentEnduranceTrend,
  recentTrainingLoadTrend,
  volumeStatus,
  weeklyLoadByExercise,
  weeklyTotalVolumeSeries,
  weeklyVolumeBreakdown,
  weeklyVolumeByGroup,
  WHO_WEEKLY_MODERATE_EQUIVALENT_MINUTES,
  type Achievement,
  type AchievementFamily,
  type CardioCategory,
  type CardioCategoryEnduranceIndex,
  type MovementCategory,
  type MuscleGroupStrengthIndex,
  type StrengthSnapshot,
} from '@/domain/metrics';

type TrendDirection = 'up' | 'flat' | 'down' | 'unknown';
type ProgressMetric = 'strength' | 'endurance' | 'calories' | 'workouts';

const PROGRESS_EDITORIAL_ART = require('../../assets/images/editorial/weekly-consistency-v1.webp');

const PROGRESS_METRIC_LABELS: Record<ProgressMetric, string> = {
  strength: 'Strength',
  endurance: 'Endurance',
  calories: 'Caloric burn',
  workouts: 'Workouts',
};

const PROGRESS_METRIC_TONES: Record<ProgressMetric, ContextTone> = {
  strength: 'strength',
  endurance: 'endurance',
  calories: 'accent',
  workouts: 'primary',
};

/** Push/Pull/Legs/Core — the Progress-screen "Overall Strength" overview
 * categories (ADR-0205). */
const MOVEMENT_CATEGORY_LABELS: Record<MovementCategory, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  core: 'Core',
};

/** Steady/Interval/Aerobics — the Progress-screen "Overall Endurance" overview
 * categories (ADR-0205, ADR-0138). */
const CARDIO_CATEGORY_LABELS: Record<CardioCategory, string> = {
  steady: 'Steady',
  interval: 'Interval',
  aerobics: 'Aerobics',
};

/** The one trend-direction vocabulary for the whole screen — strength index,
 * endurance, training load, and progressive overload all route through
 * these three instead of each inventing its own color/label rule. */
function trendColor(direction: TrendDirection): ColorToken {
  switch (direction) {
    case 'up': return 'success';
    case 'down': return 'warning';
    case 'flat': return 'textMuted';
    default: return 'textFaint';
  }
}

function trendArrow(direction: TrendDirection): string {
  switch (direction) {
    case 'up': return '▲';
    case 'down': return '▼';
    case 'flat': return '–';
    default: return '';
  }
}

function trendLabel(direction: TrendDirection): string {
  switch (direction) {
    case 'up': return 'Trending up';
    case 'down': return 'Trending down';
    case 'flat': return 'Steady';
    default: return '';
  }
}

/** Sign-only direction from a plain delta (used for the muscle strength
 * index, whose deltas are small percentage-point differences rather than
 * the ±10%-band series `recentEnduranceTrend`/`recentTrainingLoadTrend` use). */
function directionFromDelta(delta: number | null): TrendDirection {
  if (delta == null) return 'unknown';
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

function relativeDate(ms: number): string {
  const days = Math.round((Date.now() - ms) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function completedSetsLabel(record: ReturnType<typeof listHistory>[number]): string {
  const total = record.performed.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const done = record.performed.reduce(
    (sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length,
    0,
  );
  return `${done}/${total} sets logged`;
}

function actualLoadLabel(record: ReturnType<typeof listHistory>[number], unit: WeightUnit): string | null {
  const loads = record.performed.flatMap((exercise) =>
    exercise.sets.filter((set) => set.completed && set.weightKg != null).map((set) => set.weightKg as number),
  );
  if (!loads.length) return null;
  return `Top actual load ${formatWeight(Math.max(...loads), unit)}`;
}

/** Families that literally mean "beat a personal best" — what a calendar day's
 * star marker means, as opposed to e.g. a session-count milestone. */
const PR_FAMILIES = new Set<AchievementFamily>(['exercise-pr', 'muscle-pr', 'cardio-pr']);

/** Month grid, prev/next nav (same interaction as `WeeklyVolumeCard`'s week
 * navigator). Completed-workout days fill; PR days additionally get a star. */
function performedSetDetail(
  set: SessionRecord['performed'][number]['sets'][number],
  unit: WeightUnit,
): string {
  const detail: string[] = [];
  if (set.reps != null) detail.push(`${set.reps} reps`);
  if (set.weightKg != null) detail.push(formatWeight(set.weightKg, unit));
  if (set.durationSec != null) detail.push(`${Math.round(set.durationSec / 60)} min`);
  if (set.distanceM != null) detail.push(`${Math.round(set.distanceM)} m`);
  if (set.rpe != null) detail.push(`RPE ${set.rpe}`);
  return detail.join(' · ') || 'No details logged';
}

function MonthCalendar({
  history,
  now,
  weightUnit,
  unlockedAchievements,
  onExercisePress,
}: {
  history: SessionRecord[];
  now: number;
  weightUnit: WeightUnit;
  unlockedAchievements: Achievement[];
  onExercisePress: (exerciseId: string) => void;
}) {
  const { colors, radii, spacing } = useTheme();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const base = new Date(now);
  const viewDate = new Date(base.getFullYear(), base.getMonth() - monthOffset, 1);
  const monthStart = viewDate.getTime();
  const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1).getTime();
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const completedDays = sessionDaysInRange(history, monthStart, monthEnd);
  const prDays = new Set(
    unlockedAchievements
      .filter((a) => PR_FAMILIES.has(a.family) && a.achievedAt >= monthStart && a.achievedAt < monthEnd)
      .map((a) => new Date(a.achievedAt).toLocaleDateString('en-CA')),
  );

  const key = (date: Date) => date.toLocaleDateString('en-CA');
  const today = new Date(now);
  const selectedDay = selectedDate ? key(selectedDate) : null;
  const selectedRecords = selectedDay == null
    ? []
    : history.filter((record) => key(new Date(record.completedAt ?? record.plannedFor)) === selectedDay);
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const leadingBlanks = (viewDate.getDay() + 6) % 7; // Monday-first grid
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewDate.getFullYear(), viewDate.getMonth(), i + 1)),
  ];
  const trailingBlanks = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < trailingBlanks; i++) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="heading" italic>Calendar</Text>
        <Row gap="sm" style={{ alignItems: 'center' }}>
          <IconButton
            label="Show previous month"
            icon={<Icon name="chevronLeft" size={16} color="primaryTextSoft" />}
            onPress={() => { setMonthOffset(monthOffset + 1); setSelectedDate(null); }}
          />
          <Text variant="caption" color="textMuted">{monthLabel}</Text>
          <IconButton
            label="Show next month"
            icon={<Icon name="chevronRight" size={16} color={monthOffset === 0 ? 'textFaint' : 'primaryTextSoft'} />}
            onPress={() => { setMonthOffset(Math.max(0, monthOffset - 1)); setSelectedDate(null); }}
            disabled={monthOffset === 0}
          />
        </Row>
      </Row>
      <Row style={{ marginTop: spacing.md, justifyContent: 'space-between' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <View key={i} style={{ width: 34, alignItems: 'center' }}>
            <Text variant="caption" color="textFaint">{d}</Text>
          </View>
        ))}
      </Row>
      <View style={{ marginTop: spacing.xs, gap: spacing.xs }}>
        {weeks.map((week, wi) => (
          <Row key={wi} style={{ justifyContent: 'space-between' }}>
            {week.map((date, di) => {
              if (!date) return <View key={di} style={{ width: 34, height: 34 }} />;
              const done = completedDays.has(key(date));
              const hasPr = prDays.has(key(date));
              const isToday = key(date) === key(today);
              const isSelected = key(date) === selectedDay;
              return (
                <View key={di} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${done ? ', completed workout' : ''}`}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setSelectedDate(isSelected ? null : date)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: radii.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected ? colors.accent : done ? colors.primary : colors.surfaceAlt,
                      borderWidth: isToday ? 1 : 0,
                      borderColor: colors.accent,
                    }}
                  >
                    <Text variant="label" weight="bold" color={isSelected || done ? 'primaryText' : 'textMuted'}>
                      {date.getDate()}
                    </Text>
                  </Pressable>
                  {hasPr && (
                    <Text variant="caption" color="tierGold" style={{ position: 'absolute', top: -4, right: -2 }}>
                      ★
                    </Text>
                  )}
                </View>
              );
            })}
          </Row>
        ))}
      </View>
      <Text variant="caption" color="textMuted" style={{ marginTop: spacing.md }}>
        Filled days include a completed workout · ★ marks a personal record.
      </Text>
      {selectedDate && (
        <View
          style={{
            marginTop: spacing.md,
            paddingTop: spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            gap: spacing.md,
          }}
        >
          <View>
            <Text variant="caption" color="textFaint">SELECTED DAY</Text>
            <Text variant="subtitle" style={{ marginTop: 2 }}>
              {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
          </View>
          {selectedRecords.length === 0 ? (
            <Text variant="body" color="textMuted">No workout was logged on this day.</Text>
          ) : (
            selectedRecords.map((record, recordIndex) => {
              const summary = workoutSummary(record);
              return (
                <View key={record.id} style={{ gap: spacing.sm }}>
                  {recordIndex > 0 && <Divider style={{ marginTop: spacing.xs }} />}
                  <View>
                    <Text variant="body" weight="semibold">{summary.title}</Text>
                    <Text variant="caption" color="primaryTextSoft" style={{ marginTop: 2 }}>
                      {summary.completedSets} completed sets · {summary.exerciseCount} exercises
                      {record.endedEarly ? ' · Ended early' : ''}
                    </Text>
                  </View>
                  {record.performed
                    .map((exercise) => ({ ...exercise, sets: exercise.sets.filter((set) => set.completed) }))
                    .filter((exercise) => exercise.sets.length > 0)
                    .map((exercise) => (
                      <View key={exercise.exerciseId} style={{ gap: 2 }}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`View ${exercise.name} workout history`}
                          onPress={() => onExercisePress(exercise.exerciseId)}
                          hitSlop={4}
                        >
                          <Row style={{ justifyContent: 'space-between' }}>
                            <Text variant="label" weight="semibold">{exercise.name}</Text>
                            <Text variant="caption" color="primaryTextSoft">History ›</Text>
                          </Row>
                        </Pressable>
                        {exercise.sets.map((set, setIndex) => (
                          <Text key={setIndex} variant="caption" color="textMuted">
                            Set {setIndex + 1} · {performedSetDetail(set, weightUnit)}
                          </Text>
                        ))}
                      </View>
                    ))}
                  {record.debrief?.note && (
                    <View
                      style={{
                        padding: spacing.sm,
                        borderRadius: radii.md,
                        backgroundColor: colors.surfaceAlt,
                      }}
                    >
                      <Text variant="caption" color="textFaint">NOTES</Text>
                      <Text variant="body" color="textMuted" style={{ marginTop: 2 }}>{record.debrief.note}</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}
    </Card>
  );
}

const DAY_MS = 86_400_000;

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Weekly per-muscle-group volume vs. MEV/MRV landmarks (ADR-0104), with a
 * week navigator and a tap-to-expand per-exercise breakdown. */
function WeeklyVolumeCard({ history, now }: { history: SessionRecord[]; now: number }) {
  const { spacing } = useTheme();
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedGroup, setExpandedGroup] = useState<MuscleGroup | null>(null);

  const weekStartMs = isoWeekStart(now) - weekOffset * 7 * DAY_MS;
  const weekLabel =
    weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Last week' : `${weekOffset} weeks ago`;
  const weekDateLabel = new Date(weekStartMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  const byGroup = useMemo(
    () => weeklyVolumeByGroup(history, weekOffset, now),
    [history, weekOffset, now],
  );
  const breakdown = useMemo(
    () => weeklyVolumeBreakdown(history, weekOffset, now),
    [history, weekOffset, now],
  );

  const rows = ALL_MUSCLE_GROUPS.map((group) => ({ group, sets: byGroup[group] ?? 0 })).sort(
    (a, b) => b.sets - a.sets,
  );
  const hasAnyData = rows.some((r) => r.sets > 0);

  return (
    <Card>
      <Text variant="heading">Weekly volume</Text>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm }}>
        <IconButton
          label="Show previous week"
          icon={<Icon name="chevronLeft" size={16} color="primaryTextSoft" />}
          onPress={() => setWeekOffset(weekOffset + 1)}
        />
        <Text variant="caption" color="textMuted">
          {weekLabel} · {weekDateLabel}
        </Text>
        <IconButton
          label="Show next week"
          icon={<Icon name="chevronRight" size={16} color={weekOffset === 0 ? 'textFaint' : 'primaryTextSoft'} />}
          onPress={() => setWeekOffset(Math.max(0, weekOffset - 1))}
          disabled={weekOffset === 0}
        />
      </Row>
      <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
        Completed sets per muscle group vs. this week&apos;s effective range ({MEV}–{MRV - 1}).
      </Text>
      {!hasAnyData ? (
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.md }}>
          {weekOffset === 0 ? 'Log a lifting session to see this fill in.' : 'No lifting logged that week.'}
        </Text>
      ) : (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {rows.map(({ group, sets }) => {
            const status = volumeStatus(sets);
            const color = status === 'under' ? 'warning' : status === 'over' ? 'danger' : 'success';
            const expanded = expandedGroup === group;
            const contributions = breakdown[group] ?? [];
            return (
              <View key={group}>
                <Pressable
                  onPress={() => setExpandedGroup(expanded ? null : group)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="label" weight="semibold">
                      {MUSCLE_GROUP_LABELS[group]}
                    </Text>
                    <Text variant="caption" color="textMuted">
                      {sets} set{sets === 1 ? '' : 's'} · {status}
                    </Text>
                  </Row>
                  <View style={{ marginTop: 4 }}>
                    <Meter value={sets} max={MRV + 5} color={color} />
                  </View>
                </Pressable>
                {expanded && (
                  <View style={{ marginTop: spacing.xs, paddingLeft: spacing.sm, gap: 2 }}>
                    {contributions.length === 0 ? (
                      <Text variant="caption" color="textFaint">
                        No exercises credited this week.
                      </Text>
                    ) : (
                      contributions.map((c) => (
                        <Row key={c.exerciseId} style={{ justifyContent: 'space-between' }}>
                          <Text variant="caption" color="textMuted">
                            {c.name}
                          </Text>
                          <Text variant="caption" color="textMuted">
                            {c.sets} set{c.sets === 1 ? '' : 's'}
                          </Text>
                        </Row>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

/**
 * Progressive-overload transparency (ADR-0103 v2): realized weekly volume-load
 * per lift, plus a "Stalling" flag computed with the exact same
 * `isVolumeStalling` function that drives `recommendLoad`'s deload trigger —
 * this answers "why isn't my weight moving" with the logic that produced the
 * answer, not a second, cosmetically-similar implementation.
 */
function ProgressiveOverloadCard({
  history,
  strength,
}: {
  history: SessionRecord[];
  strength: StrengthSnapshot[];
}) {
  const { spacing } = useTheme();
  const capPct = Math.round(SAFETY.MAX_SESSION_LOAD_INCREASE_PCT * 100);

  const rows = strength
    .map((s) => {
      const points = weeklyLoadByExercise(history, s.exerciseId).slice(-8);
      const last = points[points.length - 1];
      const prev = points[points.length - 2];
      const pctChange =
        last && prev && prev.volumeLoad > 0
          ? ((last.volumeLoad - prev.volumeLoad) / prev.volumeLoad) * 100
          : null;
      return { exerciseId: s.exerciseId, name: s.name, points, stalling: isVolumeStalling(points), pctChange };
    })
    .filter((r) => r.points.length > 0);

  return (
    <Card>
      <Text variant="heading">Progressive overload</Text>
      <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
        Weekly volume load (sets × reps × weight) per lift. Session-to-session load
        is capped at +{capPct}% (ADR-0103) — the same rule that triggers a deload
        below when a lift stalls.
      </Text>
      {rows.length === 0 ? (
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.md }}>
          Log a couple of weeks of weighted sessions to see how your load is trending.
        </Text>
      ) : (
        <View style={{ marginTop: spacing.md, gap: spacing.lg }}>
          {rows.map((r) => (
            <View key={r.exerciseId}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="body" weight="semibold">
                  {r.name}
                </Text>
                <Text
                  variant="label"
                  color={trendColor(r.stalling ? 'down' : r.pctChange == null ? 'unknown' : r.pctChange > 0 ? 'up' : r.pctChange < 0 ? 'down' : 'flat')}
                >
                  {r.stalling
                    ? 'Stalling'
                    : r.pctChange == null
                      ? '—'
                      : `${r.pctChange >= 0 ? '+' : ''}${r.pctChange.toFixed(0)}% vs last wk`}
                </Text>
              </Row>
              {r.points.length > 1 && (
                <View style={{ marginTop: spacing.xs }}>
                  <TrendChart
                    type="bar"
                    color="accent"
                    height={56}
                    points={r.points.map((p) => ({ label: shortDate(p.weekStart), value: p.volumeLoad }))}
                  />
                </View>
              )}
              {r.stalling && (
                <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
                  Flat for 2+ weeks — your next session for this lift will suggest a deload to reset.
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

interface CategoryIndexLike {
  indexPct?: number;
  previousIndexPct?: number;
}

interface OverviewCardOverall<C extends string> {
  indexPct?: number;
  previousIndexPct?: number;
  categories: Record<C, CategoryIndexLike | undefined>;
}

/**
 * The Strength/Endurance "Overall" headline card (ADR-0205) — one big
 * relative-%-of-personal-best number plus a compact per-category breakdown,
 * styled after a reference app's clean overview screen but built entirely
 * from existing design primitives (`Meter`, the file's own
 * `trendColor`/`trendArrow` vocabulary) and existing honest math (a plain
 * mean of numbers `muscleGroupStrengthIndex`-style rollups already compute —
 * see ADR-0202 v2 / ADR-0205). Shared by Strength ("Overall Strength",
 * Push/Pull/Legs/Core) and Endurance ("Overall Endurance", Steady/Interval)
 * so both read as the same vocabulary at two levels of granularity.
 */
function OverviewCard<C extends string>({
  title,
  caption,
  emptyCopy,
  categories,
  categoryLabels,
  overall,
  hasData,
  tone,
}: {
  title: string;
  caption: string;
  emptyCopy: string;
  categories: C[];
  categoryLabels: Record<C, string>;
  overall: OverviewCardOverall<C>;
  /** Caller decides what "no data yet" means: the self-relative indices key
   *  it off per-category presence (undefined until 2+ sessions), while the
   *  absolute performance indices (ADR-0206) are always numerically defined
   *  — even 0% is a real answer — so they key it off whether ANY history
   *  exists at all instead. */
  hasData: boolean;
  tone: ContextTone;
}) {
  const { spacing } = useTheme();
  const overallDelta =
    overall.indexPct != null && overall.previousIndexPct != null
      ? Math.round(overall.indexPct - overall.previousIndexPct)
      : null;
  const overallDirection = directionFromDelta(overallDelta);

  return (
    <Card contextTone={tone}>
      <Text variant="heading">{title}</Text>
      <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
        {caption}
      </Text>
      {!hasData ? (
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.md }}>
          {emptyCopy}
        </Text>
      ) : (
        <>
          <View style={{ marginTop: spacing.md }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text variant="display">{overall.indexPct != null ? `${Math.round(overall.indexPct)}%` : '—'}</Text>
              {overallDelta != null && overallDelta !== 0 && (
                <Text variant="label" color={trendColor(overallDirection)}>
                  {trendArrow(overallDirection)} {overallDelta > 0 ? '+' : ''}
                  {overallDelta}pp
                </Text>
              )}
            </Row>
            <View style={{ marginTop: spacing.xs }}>
              <Meter value={overall.indexPct ?? 0} max={100} tone={tone} />
            </View>
          </View>
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            {categories.map((category) => {
              const index = overall.categories[category];
              const delta =
                index?.indexPct != null && index.previousIndexPct != null
                  ? Math.round(index.indexPct - index.previousIndexPct)
                  : null;
              const direction = directionFromDelta(delta);
              return (
                <View key={category}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="label" weight="semibold">
                      {categoryLabels[category]}
                    </Text>
                    <Text variant="caption" color={trendColor(direction)}>
                      {index?.indexPct != null ? `${Math.round(index.indexPct)}%` : 'not enough data'}
                      {delta != null && delta !== 0 ? ` ${trendArrow(direction)} ${delta > 0 ? '+' : ''}${delta}pp` : ''}
                    </Text>
                  </Row>
                  <View style={{ marginTop: 4 }}>
                    <Meter value={index?.indexPct ?? 0} max={100} color={trendColor(direction)} />
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
    </Card>
  );
}

/**
 * Endurance-tab detailed drill-down (ADR-0205) — the cardio counterpart to
 * "Strength by muscle group," backing the "Overall Endurance" overview above
 * it with a per-category (steady/interval) relative-endurance index, an
 * anchor cardio exercise, and a tap-to-expand trend.
 */
function EnduranceByTypeCard({
  history,
  onExercisePress,
}: {
  history: SessionRecord[];
  onExercisePress: (exerciseId: string) => void;
}) {
  const { spacing } = useTheme();
  const [expandedCategory, setExpandedCategory] = useState<CardioCategory | null>(null);

  const rows = useMemo(
    () =>
      ALL_CARDIO_CATEGORIES.map((category) => ({ category, index: cardioCategoryEnduranceIndex(history, category) }))
        .filter((r): r is { category: CardioCategory; index: CardioCategoryEnduranceIndex } => r.index != null)
        .sort((a, b) => (b.index.indexPct ?? -1) - (a.index.indexPct ?? -1)),
    [history],
  );

  return (
    <Card contextTone="endurance">
      <Text variant="heading">Endurance by type</Text>
      <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
        The detail behind Overall Endurance above — how close you are to your own best right now, for
        steady-state vs. interval cardio. Tap a category for its trend, plus your most-logged cardio
        exercise for it tracked as its own minutes over time.
      </Text>
      {rows.length === 0 ? (
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
          Complete a few cardio workouts to see this fill in.
        </Text>
      ) : (
        <View style={{ marginTop: spacing.md, gap: spacing.md }}>
          {rows.map(({ category, index }) => {
            const delta =
              index.indexPct != null && index.previousIndexPct != null
                ? Math.round(index.indexPct - index.previousIndexPct)
                : null;
            const direction = directionFromDelta(delta);
            const expanded = expandedCategory === category;
            const indexSeries = expanded ? cardioCategoryEnduranceIndexHistory(history, category) : [];
            return (
              <View key={category}>
                <Pressable
                  onPress={() => setExpandedCategory(expanded ? null : category)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="body" weight="semibold">
                      {CARDIO_CATEGORY_LABELS[category]}
                    </Text>
                    <Text variant="label" color={trendColor(direction)}>
                      {index.indexPct != null ? `${Math.round(index.indexPct)}% of best` : 'not enough sessions yet'}
                      {delta != null && delta !== 0 ? ` ${trendArrow(direction)} ${delta > 0 ? '+' : ''}${delta}pp` : ''}
                    </Text>
                  </Row>
                  <View style={{ marginTop: spacing.xs }}>
                    <Meter value={index.indexPct ?? 0} max={100} color={trendColor(direction)} />
                  </View>
                </Pressable>
                {index.anchorExerciseName && index.anchorExerciseId && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View ${index.anchorExerciseName} details`}
                    onPress={() => onExercisePress(index.anchorExerciseId as string)}
                    style={({ pressed }) => ({ marginTop: 4, opacity: pressed ? 0.7 : 1 })}
                  >
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text variant="caption" color="primaryTextSoft">
                        Anchor: {index.anchorExerciseName} ›
                      </Text>
                      <Text variant="caption" color="textFaint">
                        ~{index.anchorMinutes ?? 0} min
                        {index.anchorPreviousMinutes != null
                          ? ` · ${(index.anchorMinutes ?? 0) - index.anchorPreviousMinutes >= 0 ? '+' : ''}${
                              (index.anchorMinutes ?? 0) - index.anchorPreviousMinutes
                            } min`
                          : ''}
                      </Text>
                    </Row>
                  </Pressable>
                )}
                {expanded && indexSeries.length > 1 && (
                  <View style={{ marginTop: spacing.sm }}>
                    <TrendChart
                      type="line"
                      tone="endurance"
                      height={64}
                      points={indexSeries.map((p) => ({ label: shortDate(p.date), value: Math.round(p.indexPct) }))}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

export default function ProgressScreen() {
  const router = useRouter();
  const { colors, radii, spacing, motion } = useTheme();
  const [now] = useState(() => Date.now());
  const [expandedMuscleGroup, setExpandedMuscleGroup] = useState<MuscleGroup | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<ProgressMetric>('strength');
  const [bodyweightRange, setBodyweightRange] = useState<7 | 30 | 90>(30);
  const [showAchievements, setShowAchievements] = useState(false);
  const [openWorkoutId, setOpenWorkoutId] = useState<string | undefined>();

  const [athlete, setAthlete] = useState(() => getAthleteProfile());
  const weightUnit: WeightUnit = athlete?.weightUnit ?? 'kg';
  const [weightDraftKg, setWeightDraftKg] = useState(() => athlete?.bodyweightKg ?? 70);
  const openExercise = (exerciseId: string) => router.push({ pathname: '/exercise' as never, params: { id: exerciseId } });
  const history = useMemo(() => listHistory(200), []);
  const focusGoal = primaryGoal(athlete?.goals);
  const completedCount = history.length;
  const streak = useMemo(() => currentStreakDays(history), [history]);

  const strength = useMemo(() => latestStrengthSnapshot(history).slice(0, 6), [history]);
  const maxE1rm = Math.max(1, ...strength.map((s) => s.e1rm));

  const muscleStrength = useMemo(() => {
    return ALL_MUSCLE_GROUPS.map((group) => ({ group, index: muscleGroupStrengthIndex(history, group) }))
      .filter((r): r is { group: MuscleGroup; index: MuscleGroupStrengthIndex } => r.index != null)
      .sort((a, b) => (b.index.indexPct ?? -1) - (a.index.indexPct ?? -1));
  }, [history]);

  const strengthOverview = useMemo(() => overallStrengthIndex(history), [history]);
  const enduranceOverview = useMemo(() => overallEnduranceIndex(history), [history]);

  const strengthPerformance = useMemo(() => overallStrengthPerformanceIndex(history, now), [history, now]);
  const strengthPerformanceOverview = useMemo(
    (): OverviewCardOverall<MovementCategory> => ({
      indexPct: strengthPerformance.pct,
      previousIndexPct: strengthPerformance.previousPct,
      categories: Object.fromEntries(
        ALL_MOVEMENT_CATEGORIES.map((category) => [
          category,
          { indexPct: strengthPerformance.categories[category].pct, previousIndexPct: strengthPerformance.categories[category].previousPct },
        ]),
      ) as Record<MovementCategory, CategoryIndexLike>,
    }),
    [strengthPerformance],
  );

  const endurancePerformance = useMemo(() => overallEndurancePerformanceIndex(history, now), [history, now]);

  const cardioSnapshots = useMemo(() => latestCardioSnapshot(history).slice(0, 6), [history]);
  const maxCardioMinutes = Math.max(1, ...cardioSnapshots.map((s) => s.minutes));

  const endurance = useMemo(() => recentEnduranceTrend(history, 5), [history]);
  const trainingLoad = useMemo(() => recentTrainingLoadTrend(history, 5), [history]);

  const weeklyTrend = useMemo(() => weeklyTotalVolumeSeries(history, 8, now), [history, now]);
  const weeklyTrendDelta = useMemo(() => {
    const last = weeklyTrend[weeklyTrend.length - 1];
    const prev = weeklyTrend[weeklyTrend.length - 2];
    if (!last || !prev || prev.totalVolumeLoad <= 0) return null;
    return Math.round(((last.totalVolumeLoad - prev.totalVolumeLoad) / prev.totalVolumeLoad) * 100);
  }, [weeklyTrend]);

  const achievementsResult = useMemo(() => evaluateAchievements(history, now), [history, now]);
  const achievements = achievementsResult.unlocked.slice(0, 8);
  const recentWorkouts = useMemo(
    () => history.slice(0, 5).map((record) => ({ record, plan: getPlan(record.planId) })),
    [history],
  );
  const weeklyPerformance = useMemo(
    () => computeWeeklyPerformance(history, now, weightUnit, athlete?.bodyweightKg),
    [athlete?.bodyweightKg, history, now, weightUnit],
  );
  const metricValue = (metric: ProgressMetric) => {
    const total = weeklyPerformance.values[metric].reduce((sum, value) => sum + value, 0);
    if (metric === 'strength') return `${Math.round(total).toLocaleString()} ${weightUnit}`;
    if (metric === 'endurance') return `${Math.round(total)} min`;
    if (metric === 'calories') return `${Math.round(total).toLocaleString()} kcal`;
    return String(Math.round(total));
  };
  const exerciseHistoryList = useMemo(() => {
    const seen = new Map<string, string>();
    history.forEach((record) => record.performed.forEach((exercise) => {
      if (!seen.has(exercise.exerciseId)) seen.set(exercise.exerciseId, exercise.name);
    }));
    return [...seen.entries()].map(([id, name]) => ({ id, name })).slice(0, 12);
  }, [history]);
  const bodyweightPoints = useMemo(
    () => [...(athlete?.bodyweightLog ?? [])].sort((a, b) => a.at - b.at),
    [athlete?.bodyweightLog],
  );
  const visibleBodyweightPoints = useMemo(() => {
    const cutoff = now - bodyweightRange * 24 * 60 * 60 * 1000;
    const inRange = bodyweightPoints.filter((point) => point.at >= cutoff);
    return inRange.length ? inRange : bodyweightPoints.slice(-1);
  }, [bodyweightPoints, bodyweightRange, now]);
  const currentWeight = athlete?.bodyweightKg;
  const priorWeight = visibleBodyweightPoints.length > 1 ? visibleBodyweightPoints[0]?.kg : undefined;
  const weightDelta = currentWeight != null && priorWeight != null ? currentWeight - priorWeight : undefined;

  function saveWeight() {
    const saved = recordBodyweight(weightDraftKg);
    if (saved) setAthlete(saved);
  }

  return (
    <Screen contentStyle={{ paddingTop: spacing.sm }}>
      <GoalHero goal={focusGoal} imageOverride={PROGRESS_EDITORIAL_ART} style={{ minHeight: 320 }}>
        <View style={{ gap: spacing.md }}>
          <View>
            <Text variant="display" color="heroText" italic>Your training progress</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View achievements and progress at a glance"
            onPress={() => setShowAchievements(true)}
            style={({ pressed }) => ({
              paddingVertical: spacing.sm,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: colors.heroBorder,
              opacity: pressed ? 0.78 : 1,
            })}
          >
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text variant="caption" color="heroMuted" weight="bold">AT A GLANCE</Text>
                <Text variant="label" color="heroText" style={{ marginTop: 2 }}>
                  {completedCount} workouts · {streak}-day streak
                </Text>
              </View>
              <Text variant="label" color="heroText">Achievements ›</Text>
            </Row>
          </Pressable>

          <View>
            <Text variant="caption" color="heroMuted" weight="bold">KEY PERFORMANCE · LAST 7 DAYS</Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {[0, 2].map((start) => (
                <Row key={start} gap="sm">
                  {(['strength', 'endurance', 'calories', 'workouts'] as ProgressMetric[]).slice(start, start + 2).map((metric) => {
                    const selected = selectedMetric === metric;
                    const tone = PROGRESS_METRIC_TONES[metric];
                    const contextual = colors.tones[tone];
                    return (
                      <PressScale
                        key={metric}
                        haptic="selection"
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Show ${PROGRESS_METRIC_LABELS[metric]} progress`}
                        onPress={() => setSelectedMetric(metric)}
                        style={{
                          flex: 1,
                          minHeight: 58,
                          padding: spacing.sm,
                          borderRadius: radii.md,
                          backgroundColor: selected ? contextual.surface : colors.heroPill,
                          borderWidth: selected ? 1 : 0,
                          borderColor: selected ? contextual.border : colors.heroText,
                        }}
                      >
                        <Text variant="caption" color={selected ? 'primaryTextSoft' : 'heroMuted'} tint={selected ? contextual.text : undefined} weight="bold" style={selected ? { opacity: 0.75 } : undefined}>{PROGRESS_METRIC_LABELS[metric].toUpperCase()}</Text>
                        <Text variant="subtitle" color={selected ? 'primaryTextSoft' : 'heroText'} tint={selected ? contextual.text : undefined} style={{ marginTop: 2 }}>{metricValue(metric)}</Text>
                      </PressScale>
                    );
                  })}
                </Row>
              ))}
            </View>
          </View>
        </View>
      </GoalHero>

      <Animated.View
        key={selectedMetric}
        entering={motion.enabled ? FadeIn.duration(motion.duration.slow) : undefined}
        style={{ gap: spacing.lg }}
      >

      {selectedMetric !== 'workouts' && (
        <Card contextTone={PROGRESS_METRIC_TONES[selectedMetric]}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View>
              <Text variant="caption" color="textFaint" weight="bold">LAST 7 DAYS</Text>
              <Text variant="heading" style={{ marginTop: 2 }}>{PROGRESS_METRIC_LABELS[selectedMetric]}</Text>
            </View>
            <Text variant="label" tint={colors.tones[PROGRESS_METRIC_TONES[selectedMetric]].text}>{metricValue(selectedMetric)}</Text>
          </Row>
          <View style={{ marginTop: spacing.md }}>
            <TrendChart
              points={weeklyPerformance.days.map((day, index) => ({ label: day.label, value: weeklyPerformance.values[selectedMetric][index] }))}
              type={selectedMetric === 'calories' ? 'bar' : 'line'}
              tone={PROGRESS_METRIC_TONES[selectedMetric]}
              valueFormatter={(value) => selectedMetric === 'endurance' ? `${Math.round(value)}m` : Math.round(value).toLocaleString()}
            />
          </View>
        </Card>
      )}

      {selectedMetric === 'strength' && <>
      <OverviewCard
        title="Strength Index"
        caption={`This week's training volume vs. MRV (${MRV} sets/week per muscle group) — an evidence-based target, averaged across Push/Pull/Legs/Core.`}
        emptyCopy="Complete a weighted workout to see this fill in."
        categories={ALL_MOVEMENT_CATEGORIES}
        categoryLabels={MOVEMENT_CATEGORY_LABELS}
        overall={strengthPerformanceOverview}
        hasData={history.length > 0}
        tone="strength"
      />

      <OverviewCard
        title="Strength vs. Personal Best"
        caption="Average, across Push/Pull/Legs/Core, of today's estimate ÷ your best-ever estimate for each lift."
        emptyCopy="Complete a few weighted workouts across different movement patterns to see this fill in."
        categories={ALL_MOVEMENT_CATEGORIES}
        categoryLabels={MOVEMENT_CATEGORY_LABELS}
        overall={strengthOverview}
        hasData={ALL_MOVEMENT_CATEGORIES.some((c) => strengthOverview.categories[c] != null)}
        tone="strength"
      />

      <Card contextTone="strength">
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="heading">Weekly volume trend</Text>
          {weeklyTrendDelta != null && (
            <Text variant="label" color={weeklyTrendDelta >= 0 ? 'primaryTextSoft' : 'textMuted'} weight="semibold">
              {weeklyTrendDelta >= 0 ? '+' : ''}{weeklyTrendDelta}% vs last wk
            </Text>
          )}
        </Row>
        <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
          Total volume load (sets × reps × weight) across every lift, last 8 weeks.
        </Text>
        {weeklyTrend.every((p) => p.totalVolumeLoad === 0) ? (
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.md }}>
            Log a few weeks of weighted sessions to see your trend here.
          </Text>
        ) : (
          <View style={{ marginTop: spacing.md }}>
            <TrendChart
              type="bar"
              tone="strength"
              points={weeklyTrend.map((p) => ({ label: shortDate(p.weekStart), value: p.totalVolumeLoad }))}
            />
          </View>
        )}
      </Card>

      <WeeklyVolumeCard history={history} now={now} />

      <Card contextTone="strength">
        <Text variant="heading">Strength by muscle group</Text>
        <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
          The detail behind Overall Strength above — how close you are to your own best right now,
          per muscle group — the average, across every lift that trains it, of today&apos;s estimate
          ÷ your best-ever estimate on that same lift. Tap a group for its trend, plus your
          most-logged lift for it tracked as its own {weightUnit} estimate over time.
        </Text>
        {muscleStrength.length === 0 ? (
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
            Complete a few weighted workouts to see this fill in.
          </Text>
        ) : (
          <View style={{ marginTop: spacing.md, gap: spacing.md }}>
            {muscleStrength.map(({ group, index }) => {
              const delta =
                index.indexPct != null && index.previousIndexPct != null
                  ? Math.round(index.indexPct - index.previousIndexPct)
                  : null;
              const direction = directionFromDelta(delta);
              const expanded = expandedMuscleGroup === group;
              const indexSeries = expanded ? muscleGroupStrengthIndexHistory(history, group) : [];
              return (
                <View key={group}>
                  <Pressable
                    onPress={() => setExpandedMuscleGroup(expanded ? null : group)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                  >
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text variant="body" weight="semibold">
                        {MUSCLE_GROUP_LABELS[group]}
                      </Text>
                      <Text variant="label" color={trendColor(direction)}>
                        {index.indexPct != null ? `${Math.round(index.indexPct)}% of PB` : 'not enough sessions yet'}
                        {delta != null && delta !== 0 ? ` ${trendArrow(direction)} ${delta > 0 ? '+' : ''}${delta}pp` : ''}
                      </Text>
                    </Row>
                    <View style={{ marginTop: spacing.xs }}>
                      <Meter value={index.indexPct ?? 0} max={100} color={trendColor(direction)} />
                    </View>
                  </Pressable>
                  {index.anchorExerciseName && index.anchorExerciseId && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`View ${index.anchorExerciseName} details`}
                      onPress={() => openExercise(index.anchorExerciseId!)}
                      style={({ pressed }) => ({ marginTop: 4, opacity: pressed ? 0.7 : 1 })}
                    >
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Text variant="caption" color="primaryTextSoft">
                          Anchor: {index.anchorExerciseName} ›
                        </Text>
                        <Text variant="caption" color="textFaint">
                          ~{kgToDisplayWeight(index.anchorE1rm ?? 0, weightUnit)} {weightUnit}
                          {index.anchorPreviousE1rm != null
                            ? ` · ${index.anchorE1rm! - index.anchorPreviousE1rm >= 0 ? '+' : ''}${
                                Math.round((index.anchorE1rm! - index.anchorPreviousE1rm) * 10) / 10
                              } ${weightUnit}`
                            : ''}
                        </Text>
                      </Row>
                    </Pressable>
                  )}
                  {expanded && indexSeries.length > 1 && (
                    <View style={{ marginTop: spacing.sm }}>
                      <TrendChart
                        type="line"
                        color="accent"
                        height={64}
                        points={indexSeries.map((p) => ({ label: shortDate(p.date), value: Math.round(p.indexPct) }))}
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <Card>
        <Text variant="heading">Individual exercises</Text>
        <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
          Estimated one-rep max ({weightUnit}) per lift. Bars are relative: a full
          bar is your strongest lift. Tap one for its trend over time and rep max.
        </Text>
        {strength.length === 0 ? (
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
            Complete a few weighted workouts to see your trend here.
          </Text>
        ) : (
          <View style={{ marginTop: spacing.md, gap: spacing.md }}>
            {strength.map((s) => {
              const displayE1rm = kgToDisplayWeight(s.e1rm, weightUnit);
              const displayPrevious =
                s.previousE1rm != null ? kgToDisplayWeight(s.previousE1rm, weightUnit) : null;
              const delta = displayPrevious != null ? Math.round((displayE1rm - displayPrevious) * 10) / 10 : null;
              return (
                <View key={s.exerciseId}>
                  <Pressable
                    onPress={() => openExercise(s.exerciseId)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                  >
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text variant="body" weight="semibold">
                        {s.name}
                      </Text>
                      <Text variant="label" color="textMuted">
                        ~{displayE1rm} {weightUnit} estimate
                        {delta != null && delta !== 0
                          ? ` · ${delta > 0 ? '+' : ''}${delta} ${weightUnit}`
                          : ''}
                      </Text>
                    </Row>
                    <View style={{ marginTop: spacing.xs }}>
                      <Meter value={s.e1rm} max={maxE1rm} color="primary" />
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <ProgressiveOverloadCard history={history} strength={strength} />
      </>}

      {selectedMetric === 'endurance' && <>
      <Card contextTone="endurance">
        <Text variant="heading">Endurance Index</Text>
        <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
          This week&apos;s cardio vs. the WHO/ACSM public-health target: {WHO_WEEKLY_MODERATE_EQUIVALENT_MINUTES} min/week
          moderate-intensity, or an equivalent mix (interval/HIIT work counts double).
        </Text>
        {history.length === 0 ? (
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.md }}>
            Complete a cardio workout to see this fill in.
          </Text>
        ) : (
          <View style={{ marginTop: spacing.md }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text variant="display">{Math.round(endurancePerformance.pct)}%</Text>
              {(() => {
                const delta = Math.round(endurancePerformance.pct - endurancePerformance.previousPct);
                if (delta === 0) return null;
                const direction = directionFromDelta(delta);
                return (
                  <Text variant="label" color={trendColor(direction)}>
                    {trendArrow(direction)} {delta > 0 ? '+' : ''}{delta}pp
                  </Text>
                );
              })()}
            </Row>
            <View style={{ marginTop: spacing.xs }}>
              <Meter value={endurancePerformance.pct} max={100} tone="endurance" />
            </View>
            <Text variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
              {Math.round(endurancePerformance.minutes)} of {WHO_WEEKLY_MODERATE_EQUIVALENT_MINUTES} moderate-equivalent min this week
            </Text>
          </View>
        )}
      </Card>

      <OverviewCard
        title="Endurance vs. Personal Best"
        caption="Average, across Steady/Interval cardio, of today's session length ÷ your longest-ever for each exercise."
        emptyCopy="Complete a few cardio workouts to see this fill in."
        categories={ALL_CARDIO_CATEGORIES}
        categoryLabels={CARDIO_CATEGORY_LABELS}
        overall={enduranceOverview}
        hasData={ALL_CARDIO_CATEGORIES.some((c) => enduranceOverview.categories[c] != null)}
        tone="endurance"
      />
      <Card contextTone="endurance">
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="heading">Endurance trend</Text>
          <Text variant="label" color={trendColor(endurance.direction)} weight="semibold">{trendArrow(endurance.direction)} {trendLabel(endurance.direction)}</Text>
        </Row>
        <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>Minutes spent on cardio-modality work, per completed session.</Text>
        {endurance.points.length ? <View style={{ marginTop: spacing.md }}><TrendChart type="line" color="zoneEndurance" points={endurance.points.map((p) => ({ label: shortDate(p.date), value: p.minutes }))} valueFormatter={(v) => `${Math.round(v)} min`} /></View> : <Text variant="body" color="textMuted" style={{ marginTop: spacing.md }}>Complete a cardio workout to see your endurance trend.</Text>}
      </Card>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}><Text variant="heading">Training load</Text><Text variant="label" color={trendColor(trainingLoad.direction)}>{trendArrow(trainingLoad.direction)} {trendLabel(trainingLoad.direction)}</Text></Row>
        <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>Session RPE × minutes trained across every modality.</Text>
        {trainingLoad.points.length ? <View style={{ marginTop: spacing.md }}><TrendChart type="bar" color="accent" points={trainingLoad.points.map((p) => ({ label: shortDate(p.date), value: p.load }))} /></View> : <Text variant="body" color="textMuted" style={{ marginTop: spacing.md }}>Log effort after a workout to see your training load.</Text>}
      </Card>

      <EnduranceByTypeCard history={history} onExercisePress={openExercise} />

      <Card>
        <Text variant="heading">Individual cardio exercises</Text>
        <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
          Minutes per cardio exercise, most recent session. Bars are relative: a full bar is your longest session.
        </Text>
        {cardioSnapshots.length === 0 ? (
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
            Complete a few cardio workouts to see your trend here.
          </Text>
        ) : (
          <View style={{ marginTop: spacing.md, gap: spacing.md }}>
            {cardioSnapshots.map((s) => {
              const delta = s.previousMinutes != null ? s.minutes - s.previousMinutes : null;
              return (
                <View key={s.exerciseId}>
                  <Pressable
                    onPress={() => openExercise(s.exerciseId)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                  >
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text variant="body" weight="semibold">
                        {s.name}
                      </Text>
                      <Text variant="label" color="textMuted">
                        ~{s.minutes} min
                        {delta != null && delta !== 0 ? ` · ${delta > 0 ? '+' : ''}${delta} min` : ''}
                      </Text>
                    </Row>
                    <View style={{ marginTop: spacing.xs }}>
                      <Meter value={s.minutes} max={maxCardioMinutes} tone="endurance" />
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </Card>
      </>}

      {selectedMetric === 'calories' && <>
      <Card>
        <Text variant="heading">Caloric burn</Text>
        <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>Estimated active and total energy from your completed workouts.</Text>
        <View style={{ marginTop: spacing.md, gap: spacing.md }}>
          {recentWorkouts.length === 0 ? <Text variant="body" color="textMuted">Complete a workout to start tracking estimated caloric burn.</Text> : recentWorkouts.map(({ record }) => {
            const estimate = estimateSessionCalories(record, bodyProfileOf(athlete));
            return <Row key={record.id} style={{ justifyContent: 'space-between' }}><View><Text variant="body" weight="semibold">{relativeDate(record.completedAt ?? record.plannedFor)}</Text><Text variant="caption" color="textFaint">{workoutSummary(record).exerciseCount} exercises</Text></View><Text variant="subtitle" color="primaryTextSoft">{estimate.totalKcal} kcal</Text></Row>;
          })}
        </View>
      </Card>
      <Card contextTone="accent">
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text variant="caption" tint={colors.tones.accent.text} weight="bold">BODYWEIGHT</Text>
            <Text variant="display" tint={colors.tones.accent.text} style={{ marginTop: 2 }}>{currentWeight != null ? formatWeight(currentWeight, weightUnit) : '—'}</Text>
            <Text variant="caption" tint={colors.tones.accent.text}>{weightDelta == null ? 'Add a second weigh-in to see your change.' : `${weightDelta > 0 ? '+' : ''}${formatWeight(Math.abs(weightDelta), weightUnit)} in this period`}</Text>
          </View>
          <Icon name="checkin" size={24} tint={colors.tones.accent.text} />
        </Row>
        <Row gap="sm" wrap style={{ marginTop: spacing.md }}>
          {([{ days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '3 months' }] as const).map((range) => <Chip key={range.days} label={range.label} selected={bodyweightRange === range.days} onPress={() => setBodyweightRange(range.days)} />)}
        </Row>
        {visibleBodyweightPoints.length > 1 ? <View style={{ marginTop: spacing.md }}><TrendChart type="line" color="accent" points={visibleBodyweightPoints.slice(-12).map((point) => ({ label: shortDate(point.at), value: kgToDisplayWeight(point.kg, weightUnit) }))} valueFormatter={(value) => `${Math.round(value * 10) / 10} ${weightUnit}`} /></View> : null}
        <View style={{ marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.tones.accent.border }}>
          <Text variant="label" tint={colors.tones.accent.text} weight="semibold">Update weight</Text>
          <Stepper value={kgToDisplayWeight(weightDraftKg, weightUnit)} onChange={(value) => setWeightDraftKg(displayWeightToKg(value, weightUnit))} min={weightUnit === 'lb' ? 60 : 25} max={weightUnit === 'lb' ? 600 : 275} step={weightUnit === 'lb' ? 0.5 : 0.1} unit={weightUnit} style={{ marginTop: spacing.sm }} />
          <Button title="Save weight" variant="secondary" size="sm" onPress={saveWeight} style={{ marginTop: spacing.md }} />
        </View>
      </Card>
      </>}

      {selectedMetric === 'workouts' && <>
      <MonthCalendar
        history={history}
        now={now}
        weightUnit={weightUnit}
        unlockedAchievements={achievementsResult.unlocked}
        onExercisePress={openExercise}
      />

      <Pressable onPress={() => setShowAchievements(true)} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
        <Card>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text variant="heading">Achievements</Text>
            <Text variant="label" color="primaryTextSoft">View all ›</Text>
          </Row>
          {achievements.length === 0 ? (
            <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
              Your milestones will appear here as you train.
            </Text>
          ) : (
            <View style={{ marginTop: spacing.md }}>
              <Text variant="title">{achievements.length}</Text>
              <Text variant="label" color="textMuted">unlocked so far</Text>
              <Divider style={{ marginVertical: spacing.md }} />
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="body" weight="semibold">
                  {achievements[0].title}
                </Text>
                <Text variant="caption" color="textFaint">
                  {relativeDate(achievements[0].achievedAt)}
                </Text>
              </Row>
              <Text variant="caption" color="textMuted">
                {achievements[0].e1rmKg != null
                  ? `${achievements[0].description} ${formatWeight(achievements[0].e1rmKg, weightUnit)}.`
                  : achievements[0].description}
              </Text>
            </View>
          )}
        </Card>
      </Pressable>

      <Card>
        <Text variant="heading">Exercise history</Text>
        <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
          Tap an exercise to see the same set history and progress chart used in workout details.
        </Text>
        {exerciseHistoryList.length === 0 ? (
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.md }}>Exercises appear here after your first completed workout.</Text>
        ) : (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {exerciseHistoryList.map((exercise) => (
              <Pressable
                key={exercise.id}
                accessibilityRole="button"
                accessibilityLabel={`View ${exercise.name} workout history`}
                onPress={() => openExercise(exercise.id)}
                style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
              >
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text
                    variant="body"
                    weight="semibold"
                    numberOfLines={1}
                    style={{ flexShrink: 1, marginRight: spacing.sm }}
                  >
                    {exercise.name}
                  </Text>
                  <Text variant="label" color="primaryTextSoft" style={{ flexShrink: 0 }}>View progress ›</Text>
                </Row>
              </Pressable>
            ))}
          </View>
        )}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Text variant="heading">Workout history</Text>
            <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
              YOUR COMPLETED SESSIONS
            </Text>
          </View>
          <Text variant="label" color="textMuted">
            {completedCount} total
          </Text>
        </Row>
        {recentWorkouts.length === 0 ? (
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.md }}>
            Complete your first workout and it will live here with your actual sets, load, and effort.
          </Text>
        ) : (
          <View style={{ marginTop: spacing.md }}>
            {recentWorkouts.map(({ record, plan }, index) => {
              const summary = workoutSummary(record);
              return (
              <View key={record.id}>
                {index > 0 && <Divider style={{ marginVertical: spacing.md }} />}
                <Pressable onPress={() => setOpenWorkoutId(record.id)} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, paddingRight: spacing.md }}>
                    <Text variant="body" weight="semibold">
                      {plan?.blocks.find((block) => block.label === 'Main')?.exercises[0]?.name ?? 'Completed workout'}
                    </Text>
                    <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                      {relativeDate(record.completedAt ?? record.plannedFor)} · {completedSetsLabel(record)}
                    </Text>
                    {actualLoadLabel(record, weightUnit) && (
                      <Text variant="caption" color="primaryTextSoft" style={{ marginTop: 2 }}>
                        {actualLoadLabel(record, weightUnit)}
                      </Text>
                    )}
                    <Text variant="caption" color="textFaint" style={{ marginTop: 2 }}>
                      {summary.exerciseCount} exercises · {summary.volumeLoad ? `${summary.volumeLoad} kg volume` : `${summary.completedSets} completed sets`}
                    </Text>
                  </View>
                  <Text variant="label" color="primaryTextSoft">
                    {plan?.estimatedDurationMin ? `~${plan.estimatedDurationMin} min` : 'Saved'}
                  </Text>
                </Row>
                </Pressable>
              </View>
            ); })}
          </View>
        )}
      </Card>
      </>}
      </Animated.View>

      <AchievementsSheet visible={showAchievements} onClose={() => setShowAchievements(false)} />
      <WorkoutDetailSheet recordId={openWorkoutId} onClose={() => setOpenWorkoutId(undefined)} />
    </Screen>
  );
}
