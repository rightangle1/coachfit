/**
 * Touchless playback for a guided flow (docs/methodology/guided-flow-sequencer.md).
 * `useGuidedFlowPlayer` owns the countdown/auto-advance; `GuidedFlowRing`,
 * `GuidedFlowRail`, `GuidedFlowStepsDrawer` and `GuidedFlowBottomBar` are the
 * presentational pieces `app/workout-flow.tsx` composes into the full-screen
 * player, built so the exercise photo stays contain-fit and unobstructed
 * except for the top ring, the edge rail, and (only while open) the cues
 * drawer.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Circle, Svg } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon, Row, Text, timing, useTheme, type ContextTone } from '@/design';
import { formatClock } from '@/features/exercise-detail';
import { isTimerSoundEnabled } from '@/services/exercise-preferences';
import type { GuidedFlowStep } from '@/domain/engine';

export interface UseGuidedFlowPlayerOptions {
  startIndex: number;
  /** Freezes the countdown without resetting it — driven by the same
   * `record.pausedAt` switch every other workout screen already uses, not a
   * step-local pause. */
  paused: boolean;
  /** A step's timer reached zero — write it through as completed. */
  onStepComplete: (step: GuidedFlowStep) => void;
  /** The athlete manually skipped ahead — write it through as skipped. */
  onStepSkip: (step: GuidedFlowStep) => void;
  /** The last step finished (naturally or via skip). */
  onAllComplete: () => void;
}

export function useGuidedFlowPlayer(steps: GuidedFlowStep[], opts: UseGuidedFlowPlayerOptions) {
  const { paused, onStepComplete, onStepSkip, onAllComplete } = opts;
  const player = useAudioPlayer(require('../../assets/sounds/timer-complete.wav'));
  const [index, setIndex] = useState(opts.startIndex);
  const [remaining, setRemaining] = useState(steps[opts.startIndex]?.durationSec ?? 0);
  const endAt = useRef(0);
  const hasSettledStep = useRef(false);
  const wasPaused = useRef(paused);
  const step = steps[index] ?? null;

  // (Re)anchor the wall-clock countdown whenever the active step changes —
  // same `endAt = Date.now() + seconds*1000` trick `TimedSetControls` uses,
  // so it self-corrects across backgrounding instead of drifting.
  useEffect(() => {
    hasSettledStep.current = false;
    const duration = steps[index]?.durationSec ?? 0;
    endAt.current = Date.now() + duration * 1000;
    setRemaining(duration);
  }, [index, steps]);

  useEffect(() => {
    if (paused || !step) return;
    const tick = () => {
      const next = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setRemaining(next);
      if (next !== 0 || hasSettledStep.current) return;
      hasSettledStep.current = true;
      // Same completion cue `TimedSetControls` fires — a hold finishing is
      // exactly the moment a touchless athlete needs a tactile/audible nudge.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (isTimerSoundEnabled()) {
        player.seekTo(0);
        player.play();
      }
      onStepComplete(step);
      advanceFrom(index);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, step, index]);

  // Resuming shifts the anchor forward by however long the pause lasted, so
  // the remaining time doesn't jump — the per-step equivalent of
  // `SessionRecord.pausedAt`/`pausedDurationMs` keeping the workout clock honest.
  useEffect(() => {
    if (wasPaused.current && !paused) endAt.current = Date.now() + remaining * 1000;
    wasPaused.current = paused;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  function advanceFrom(currentIndex: number) {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= steps.length) {
      onAllComplete();
      return;
    }
    setIndex(nextIndex);
  }

  function skipForward() {
    if (!step || hasSettledStep.current) return;
    hasSettledStep.current = true;
    onStepSkip(step);
    advanceFrom(index);
  }

  function skipBack() {
    setIndex((current) => Math.max(0, current - 1));
  }

  return { index, step, remaining, running: !paused, skipForward, skipBack, canSkipBack: index > 0 };
}

const RING_SIZE = 96;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Compact corner countdown — replaces the old center-screen 72px display so
 * the photo underneath stays the focal point. */
export function GuidedFlowRing({
  remaining,
  duration,
  tone,
}: {
  remaining: number;
  duration: number;
  /** Cardio work/recovery phase (ADR-0406) tints the progress stroke; omitted
   * for yoga/stretch/barre, which has no phase concept. */
  tone?: ContextTone;
}) {
  const { colors, motion } = useTheme();
  const target = duration > 0 ? 1 - remaining / duration : 0;
  const progress = useSharedValue(target);

  useEffect(() => {
    progress.set(withTiming(target, timing(motion.enabled, motion.duration.base)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const circleProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress.get()),
  }));

  const strokeColor = tone ? colors.tones[tone].solid : colors.heroText;

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2, backgroundColor: colors.heroPill, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} stroke={colors.heroBorder} strokeWidth={RING_STROKE} fill="none" />
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={strokeColor}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={RING_CIRCUMFERENCE}
          animatedProps={circleProps}
        />
      </Svg>
      <Text variant="caption" color="heroText" weight="bold" style={{ fontSize: 22, lineHeight: 26 }}>{formatClock(remaining)}</Text>
    </View>
  );
}

const RAIL_MARK = 9;
const RAIL_MARK_NOW = 24;

/** The sequence rail along the right edge — one mark per distinct exercise in
 * stage order (not one per flattened round×stage step, which would repeat the
 * same handful of marks once per round) — and now spans every section of a
 * multi-block flow (ADR-0408), with a hairline break wherever the section
 * changes so Warmup/Main/Cool down still read as distinct legs of the same
 * timeline rather than one undifferentiated list. Deduplication is scoped
 * per section (`sectionIndex:exerciseId`), not globally, since the same
 * exercise can legitimately reappear in two different sections (e.g. a
 * stretch opening the Warmup and closing the Cool down) and each occurrence
 * is its own event in the timeline. Purely decorative (`pointerEvents:
 * 'none'`); jumping between exercises stays on the bottom bar's buttons and
 * the photo's swipe gesture. */
export function GuidedFlowRail({ steps, currentIndex }: { steps: GuidedFlowStep[]; currentIndex: number }) {
  const { colors, spacing } = useTheme();
  const current = steps[currentIndex];

  const entries = useMemo(() => {
    const seen = new Set<string>();
    const list: { key: string; label: string; sectionIndex: number; breakBefore: boolean }[] = [];
    let lastSection = -1;
    for (const step of steps) {
      const key = `${step.sectionIndex}:${step.exerciseId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ key, label: step.label, sectionIndex: step.sectionIndex, breakBefore: lastSection !== -1 && step.sectionIndex !== lastSection });
      lastSection = step.sectionIndex;
    }
    return list;
  }, [steps]);

  if (!current || entries.length < 2) return null;
  const currentKey = `${current.sectionIndex}:${current.exerciseId}`;
  const currentRank = entries.findIndex((entry) => entry.key === currentKey);

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, bottom: 0, right: spacing.md, justifyContent: 'center', alignItems: 'flex-end', gap: spacing.sm }}
    >
      {entries.map((entry, index) => {
        const state = index === currentRank ? 'now' : index < currentRank ? 'done' : 'pending';
        return (
          <View key={entry.key} style={{ alignItems: 'flex-end', gap: 4 }}>
            {entry.breakBefore ? <View style={{ width: 14, height: 1, backgroundColor: colors.heroBorder, marginBottom: spacing.sm }} /> : null}
            {state === 'now' ? (
              <View style={{ backgroundColor: colors.heroPill, paddingHorizontal: spacing.xs, paddingVertical: 3, borderRadius: 999 }}>
                <Text variant="caption" color="heroText" weight="bold" style={{ fontSize: 9 }}>{entry.label}</Text>
              </View>
            ) : null}
            <View
              style={{
                width: RAIL_MARK,
                height: state === 'now' ? RAIL_MARK_NOW : RAIL_MARK,
                borderRadius: RAIL_MARK / 2,
                backgroundColor: state === 'done' ? colors.primary : state === 'now' ? colors.heroText : 'rgba(255,255,255,0.32)',
                borderWidth: 1,
                borderColor: 'rgba(0,0,0,0.3)',
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

/** Expandable form-guide panel — the same ordered `Exercise.steps` shown in
 * full elsewhere (`HowToPanel`), not the abridged glance-cue string, since a
 * touchless athlete mid-flow needs the whole instruction, not a fragment.
 * Collapsed height is 0 (nothing covers the photo); open, it rises from the
 * bottom bar and overlays only the lower photo. Height animates to the
 * content's own measured size (via `onLayout`) rather than a fixed value, so
 * it never clips a longer step list. */
export function GuidedFlowStepsDrawer({ open, label, steps }: { open: boolean; label: string; steps?: string[] }) {
  const { colors, spacing, radii, motion } = useTheme();
  const [contentHeight, setContentHeight] = useState(0);
  const openness = useSharedValue(0);

  useEffect(() => {
    openness.set(withTiming(open ? 1 : 0, timing(motion.enabled, motion.duration.base, 'decelerate')));
  }, [open, openness, motion.enabled, motion.duration.base]);

  const drawerStyle = useAnimatedStyle(() => ({
    height: contentHeight * openness.get(),
    opacity: openness.get(),
  }));

  if (!steps || steps.length === 0) return null;

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={[
        { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden', borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, backgroundColor: colors.heroOverlay },
        drawerStyle,
      ]}
    >
      <View onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)} style={{ padding: spacing.lg, gap: spacing.sm }}>
        <View style={{ width: 34, height: 4, borderRadius: radii.pill, backgroundColor: colors.heroBorder, alignSelf: 'center', marginBottom: spacing.xs }} />
        <Text variant="caption" color="heroMuted" weight="bold">{label.toUpperCase()} · FORM GUIDE</Text>
        <View style={{ gap: spacing.xs }}>
          {steps.map((step, i) => (
            <Text key={i} variant="body" color="heroText">{i + 1}. {step}</Text>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

/** The reserved bottom strip — always below the photo's own laid-out box, so
 * it never covers it. Title sits to the left; the expand arrow, transport
 * controls, and round counter stack to the right. */
export function GuidedFlowBottomBar({
  title,
  round,
  tone,
  hasSteps,
  stepsOpen,
  onToggleSteps,
  running,
  onToggleRun,
  onSkipForward,
  onSkipBack,
  canSkipBack,
}: {
  title: string;
  round: string;
  tone?: ContextTone;
  hasSteps: boolean;
  stepsOpen: boolean;
  onToggleSteps: () => void;
  running: boolean;
  onToggleRun: () => void;
  onSkipForward: () => void;
  onSkipBack: () => void;
  canSkipBack: boolean;
}) {
  const { colors, spacing, radii } = useTheme();
  const controlStyle = (pressed: boolean, disabled?: boolean) => ({
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.heroPill,
    opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
  });

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        backgroundColor: colors.hero,
        borderTopWidth: 1,
        borderTopColor: colors.heroBorder,
      }}
    >
      <Row gap="xs" style={{ flex: 1 }}>
        {tone ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.tones[tone].solid }} /> : null}
        <Text variant="subtitle" color="heroText" weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
          {title}
        </Text>
      </Row>

      <View style={{ alignItems: 'center', gap: spacing.xs }}>
        {hasSteps ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={stepsOpen ? 'Hide form guide' : 'Show form guide'}
            hitSlop={10}
            onPress={onToggleSteps}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Icon name={stepsOpen ? 'chevronDown' : 'chevronUp'} size={16} color="primary" />
          </Pressable>
        ) : null}

        <Row gap="sm">
          <Pressable accessibilityRole="button" accessibilityLabel="Previous step" disabled={!canSkipBack} onPress={onSkipBack} style={({ pressed }) => controlStyle(pressed, !canSkipBack)}>
            <Icon name="chevronLeft" size={18} color="heroText" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={running ? 'Pause' : 'Resume'} onPress={onToggleRun} style={({ pressed }) => controlStyle(pressed)}>
            <Icon name={running ? 'pause' : 'play'} size={18} color="heroText" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Skip to next step" onPress={onSkipForward} style={({ pressed }) => controlStyle(pressed)}>
            <Icon name="chevronRight" size={18} color="heroText" />
          </Pressable>
        </Row>

        <View style={{ backgroundColor: colors.heroPill, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.pill }}>
          <Text variant="label" color="heroText" weight="bold">{round}</Text>
        </View>
      </View>
    </View>
  );
}
