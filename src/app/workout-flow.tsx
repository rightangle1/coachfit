/**
 * The touchless guided-flow player (docs/methodology/guided-flow-sequencer.md).
 * A dedicated, chrome-free route rather than a 4th `workout.tsx` view state —
 * see ADR-0405 (Mobility), ADR-0406 (Cardio) and ADR-0408 (multi-block
 * chaining) — entered from `openExercise()` whenever the plan/exercise is
 * guided-flow-eligible and `autoAdvance` resolves true.
 *
 * The flow plays through every *contiguous* guided-flow-eligible block
 * starting at the one the athlete tapped into (e.g. Warmup → Main → Cool
 * down for a pure cardio session) as one continuous step list, rather than
 * stopping and kicking back to the overview at the end of each block —
 * `isGuidedFlowBlock`/`flattenGuidedFlow` (domain/engine/guided-flow.ts) own
 * that chaining so this screen just plays whatever list it's handed.
 *
 * The photo is laid out `contentFit="contain"` inside its own flex zone above
 * a fixed bottom bar, rather than as a full-bleed background with chrome
 * overlaid everywhere — so it's never cropped, and only the top ring, the
 * edge rail, and (while open) the steps drawer ever sit on top of it.
 */

import { useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, SheetModal, Stepper, Text, useTheme, type ContextTone } from '@/design';
import { EXERCISES } from '@/domain/catalog';
import { flattenGuidedFlow, isGuidedFlowBlock, resumeIndexFor, type GuidedFlowStep } from '@/domain/engine';
import { workoutHeaderBackground } from '@/features/exercise-detail';
import {
  GuidedFlowBottomBar,
  GuidedFlowRail,
  GuidedFlowRing,
  GuidedFlowStepsDrawer,
  useGuidedFlowPlayer,
} from '@/features/guided-flow-player';
import { useWorkoutStore } from '@/state/workout-store';
import type { SessionBlock } from '@/domain/types';

/** A decisive horizontal drag counts as a swipe; anything short of this is
 * left alone so it doesn't fight scrolling/other gestures on the photo. */
const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 500;

/** Cardio's phases (ADR-0406) map to existing tone tokens rather than new hex
 * values — 'endurance' is cardio's own tone everywhere else in the app,
 * 'mobility' is already documented as the calm tone for recovery contexts.
 * Every mobility step and every non-interval cardio step has no `phase` at
 * all, so this is purely a function of the step itself now — no separate
 * "is this section cardio" flag needed the way a single-block flow required. */
function toneForStep(step: GuidedFlowStep): ContextTone | undefined {
  if (!step.phase) return undefined;
  return step.phase === 'recovery' ? 'mobility' : 'endurance';
}

export default function WorkoutFlowScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { exerciseId } = useLocalSearchParams<{ exerciseId?: string }>();
  const plan = useWorkoutStore((state) => state.plan);
  const record = useWorkoutStore((state) => state.record);
  const updateSet = useWorkoutStore((state) => state.updateSet);
  const skipSet = useWorkoutStore((state) => state.skipSet);
  const setExerciseRpe = useWorkoutStore((state) => state.setExerciseRpe);
  const toggleTimerPause = useWorkoutStore((state) => state.toggleTimerPause);
  const [showDebrief, setShowDebrief] = useState(false);
  const [debriefRpe, setDebriefRpe] = useState(7);
  // Defaults open: a touchless athlete shouldn't have to tap anything to see
  // the full form guide for whatever they're about to do.
  const [stepsOpen, setStepsOpen] = useState(true);

  const blockIndex = plan?.blocks.findIndex((entry) => entry.exercises.some((exercise) => exercise.exerciseId === exerciseId)) ?? -1;
  const block = blockIndex != null && blockIndex >= 0 ? (plan?.blocks[blockIndex] ?? null) : null;

  // The contiguous run of guided-flow-eligible blocks starting at the one the
  // athlete entered — e.g. Warmup(mobility) → Main(cardio) → Cool
  // down(mobility) for a cardio session all chain into one flow (ADR-0408);
  // a manual block (e.g. a strength Main) ends the run right there.
  const runBlocks = useMemo(() => {
    if (!plan || blockIndex < 0) return [];
    const run: SessionBlock[] = [];
    for (let i = blockIndex; i < plan.blocks.length; i += 1) {
      const candidate = plan.blocks[i];
      if (!isGuidedFlowBlock(candidate, plan.workoutType)) break;
      run.push(candidate);
    }
    return run;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, blockIndex]);

  const steps = useMemo(() => flattenGuidedFlow(runBlocks), [runBlocks]);
  const startIndex = useMemo(
    () => (record ? resumeIndexFor(steps, record.performed) : 0),
    // Only recomputed when the flow is (re)entered — the player owns
    // `index` afterward, so `record.performed` changing shouldn't yank the
    // current step out from under the athlete mid-flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps],
  );

  // Every cardio block the flow chains through gets rated as one effort —
  // same "one debrief for the whole flow, not per station" call ADR-0406
  // made for a single Main block, just applied across however many cardio
  // blocks this run happens to include (usually just Main).
  const cardioBlocks = runBlocks.filter((entry) => entry.modality === 'cardio');

  function finishFlow() {
    if (cardioBlocks.length) cardioBlocks.flatMap((entry) => entry.exercises).forEach((exercise) => setExerciseRpe(exercise.exerciseId, debriefRpe));
    router.back();
  }

  const { step, index, remaining, running, skipForward, skipBack, canSkipBack } = useGuidedFlowPlayer(steps, {
    startIndex,
    paused: record?.pausedAt != null,
    onStepComplete: (completedStep) => updateSet(completedStep.exerciseId, completedStep.setIndex, { completed: true }),
    onStepSkip: (skippedStep) => skipSet(skippedStep.exerciseId, skippedStep.setIndex),
    // Yoga/stretch/barre blocks (`modality: 'mobility'`) never need an
    // exercise debrief — `needsExerciseDebrief` in workout.tsx already skips
    // it for this modality — so finishing the flow just returns to the
    // overview, same as today's manual per-exercise completion does for
    // these workout types. Cardio blocks do need one, popped here instead,
    // once the *entire* chained run (not just one block) is done.
    onAllComplete: () => (cardioBlocks.length ? setShowDebrief(true) : router.back()),
  });

  const swipe = Gesture.Pan().onEnd((event) => {
    if (event.translationX < -SWIPE_DISTANCE || event.velocityX < -SWIPE_VELOCITY) runOnJS(skipForward)();
    else if (canSkipBack && (event.translationX > SWIPE_DISTANCE || event.velocityX > SWIPE_VELOCITY)) runOnJS(skipBack)();
  });

  if (!plan || !record || !block || !step) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl }}>
        <Text variant="display" italic>No flow in progress</Text>
        <Button title="Back to workout" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  // The block the *current step* belongs to, not necessarily the one the
  // athlete originally tapped into — a flow that has chained from Warmup
  // into Main needs Main's own modality for the background-art fallback.
  const currentBlock = runBlocks[step.sectionIndex] ?? block;
  const catalogExercise = EXERCISES.find((exercise) => exercise.id === step.exerciseId);
  const background = catalogExercise?.media?.stills?.[0]?.file ?? workoutHeaderBackground(plan.workoutType, currentBlock.modality).image;
  const tone = toneForStep(step);

  return (
    <View style={{ flex: 1, backgroundColor: colors.hero }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <View style={{ flex: 1 }}>
          <GestureDetector gesture={swipe}>
            <View style={{ flex: 1 }}>
              <Image source={background} contentFit="contain" contentPosition="center" transition={220} style={{ flex: 1 }} />
            </View>
          </GestureDetector>

          <View style={{ position: 'absolute', top: spacing.lg, left: spacing.lg, right: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Exit guided flow"
              onPress={() => router.back()}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                minHeight: 42,
                paddingHorizontal: spacing.md,
                borderRadius: 21,
                backgroundColor: colors.heroPill,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Icon name="close" size={16} color="heroText" />
              <Text variant="label" color="heroText" weight="semibold">Exit</Text>
            </Pressable>

            <View style={{ alignItems: 'center', gap: 4 }}>
              <GuidedFlowRing remaining={remaining} duration={step.durationSec} tone={tone} />
              {runBlocks.length > 1 ? (
                <View style={{ backgroundColor: colors.heroPill, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 999 }}>
                  <Text variant="caption" color="heroMuted" weight="bold" style={{ fontSize: 9 }}>{step.section.toUpperCase()}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <GuidedFlowRail steps={steps} currentIndex={index} />

          <GuidedFlowStepsDrawer open={stepsOpen} label={step.label} steps={catalogExercise?.steps} />
        </View>

        <GuidedFlowBottomBar
          title={step.label}
          round={`Round ${step.round + 1} of ${step.roundCount}`}
          tone={tone}
          hasSteps={Boolean(catalogExercise?.steps?.length)}
          stepsOpen={stepsOpen}
          onToggleSteps={() => setStepsOpen((open) => !open)}
          running={running}
          onToggleRun={toggleTimerPause}
          onSkipForward={skipForward}
          onSkipBack={skipBack}
          canSkipBack={canSkipBack}
        />
      </SafeAreaView>

      <SheetModal
        visible={showDebrief}
        onClose={finishFlow}
        eyebrow="FLOW COMPLETE"
        title="How hard did that feel?"
        closeLabel="Return to workout overview"
      >
        <View style={{ gap: spacing.md }}>
          <Text variant="body" color="textMuted">Adjust the effort for this session if you want to.</Text>
          <Stepper value={debriefRpe} onChange={setDebriefRpe} min={1} max={10} unit="RPE" style={{ alignSelf: 'center', width: 240 }} />
          <Button title="Continue to overview" onPress={finishFlow} fullWidth />
        </View>
      </SheetModal>
    </View>
  );
}
