/**
 * The touchless guided-flow player (docs/methodology/guided-flow-sequencer.md).
 * A dedicated, chrome-free route rather than a 4th `workout.tsx` view state —
 * see ADR-0405 (Mobility) and ADR-0406 (Cardio) — entered from
 * `openExercise()` whenever the plan/exercise is guided-flow-eligible and
 * `autoAdvance` resolves true.
 *
 * The photo is laid out `contentFit="contain"` inside its own flex zone above
 * a fixed bottom bar, rather than as a full-bleed background with chrome
 * overlaid everywhere — so it's never cropped, and only the top ring, the
 * edge rail, and (while open) the cues drawer ever sit on top of it.
 */

import { useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, SheetModal, Stepper, Text, useTheme, type ContextTone } from '@/design';
import { EXERCISES } from '@/domain/catalog';
import { flattenSingleExerciseCardio, flattenStageFlow, resumeIndexFor, type GuidedFlowStep } from '@/domain/engine';
import { workoutHeaderBackground } from '@/features/exercise-detail';
import {
  GuidedFlowBottomBar,
  GuidedFlowCuesDrawer,
  GuidedFlowRail,
  GuidedFlowRing,
  useGuidedFlowPlayer,
} from '@/features/guided-flow-player';
import { useWorkoutStore } from '@/state/workout-store';

/** A decisive horizontal drag counts as a swipe; anything short of this is
 * left alone so it doesn't fight scrolling/other gestures on the photo. */
const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 500;

/** Cardio's phases (ADR-0406) map to existing tone tokens rather than new hex
 * values — 'endurance' is cardio's own tone everywhere else in the app,
 * 'mobility' is already documented as the calm tone for recovery contexts.
 * Aerobics/base-multi steps never carry a `phase` (`cardioSets` only ever
 * sets `'work'`/`'recovery'` on the single-exercise interval shape), so the
 * `work` fallback also covers those — one function handles both cardio
 * shapes the same way. */
function toneForStep(step: GuidedFlowStep, isCardio: boolean): ContextTone | undefined {
  if (!isCardio) return undefined;
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
  const [cuesOpen, setCuesOpen] = useState(false);

  const block = plan?.blocks.find((entry) => entry.exercises.some((exercise) => exercise.exerciseId === exerciseId)) ?? null;
  const isCardio = block?.modality === 'cardio';
  // Aerobics (a rotation-group circuit) and base cardio picking several
  // distinct exercises (ADR-0138/ADR-0406) both land here as a plain
  // multi-exercise Main block — the same "walk this block's exercises
  // round-robin" shape `flattenStageFlow` already handles for yoga/stretch/
  // barre, so no separate rotation-group-aware flattener is needed. Only a
  // single-exercise cardio bout (benchmark, intervals, or base when just one
  // exercise was picked) needs the phase-based flattener, since there's
  // nothing to page between.
  const showRail = block ? block.modality === 'mobility' || block.exercises.length > 1 : true;
  const steps = useMemo(() => {
    if (!block) return [];
    return showRail ? flattenStageFlow(block) : flattenSingleExerciseCardio(block.exercises[0]);
  }, [block, showRail]);
  const startIndex = useMemo(
    () => (record ? resumeIndexFor(steps, record.performed) : 0),
    // Only recomputed when the flow is (re)entered — the player owns
    // `index` afterward, so `record.performed` changing shouldn't yank the
    // current step out from under the athlete mid-flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps],
  );

  function finishFlow() {
    // One debrief for the whole flow instead of one per station/set — the
    // deliberate improvement over today's manual per-exercise popups
    // (ADR-0406) — applied uniformly across every exercise this flow
    // touched, since a circuit's stations are rated as one effort, not
    // separately.
    if (isCardio) block?.exercises.forEach((exercise) => setExerciseRpe(exercise.exerciseId, debriefRpe));
    router.back();
  }

  const { step, remaining, running, skipForward, skipBack, canSkipBack } = useGuidedFlowPlayer(steps, {
    startIndex,
    paused: record?.pausedAt != null,
    onStepComplete: (completedStep) => updateSet(completedStep.exerciseId, completedStep.setIndex, { completed: true }),
    onStepSkip: (skippedStep) => skipSet(skippedStep.exerciseId, skippedStep.setIndex),
    // Yoga/stretch/barre blocks (`modality: 'mobility'`) never need an
    // exercise debrief — `needsExerciseDebrief` in workout.tsx already skips
    // it for this modality — so finishing the flow just returns to the
    // overview, same as today's manual per-exercise completion does for
    // these workout types. Cardio blocks do need one, popped here instead.
    onAllComplete: () => (isCardio ? setShowDebrief(true) : router.back()),
  });

  const swipe = Gesture.Pan().onEnd((event) => {
    if (event.translationX < -SWIPE_DISTANCE || event.velocityX < -SWIPE_VELOCITY) skipForward();
    else if (canSkipBack && (event.translationX > SWIPE_DISTANCE || event.velocityX > SWIPE_VELOCITY)) skipBack();
  });

  if (!plan || !record || !block || !step) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl }}>
        <Text variant="display" italic>No flow in progress</Text>
        <Button title="Back to workout" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const catalogExercise = EXERCISES.find((exercise) => exercise.id === step.exerciseId);
  const background = catalogExercise?.media?.stills?.[0]?.file ?? workoutHeaderBackground(plan.workoutType, block.modality).image;
  const tone = toneForStep(step, isCardio);

  return (
    <View style={{ flex: 1, backgroundColor: colors.hero }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <View style={{ flex: 1 }}>
          <GestureDetector gesture={swipe}>
            <View style={{ flex: 1 }}>
              <Image source={background} contentFit="contain" contentPosition="center" transition={220} style={{ flex: 1 }} />
            </View>
          </GestureDetector>

          <View style={{ position: 'absolute', top: spacing.lg, left: spacing.lg, right: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
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

            <GuidedFlowRing remaining={remaining} duration={step.durationSec} tone={tone} />
          </View>

          {showRail ? <GuidedFlowRail steps={steps} currentExerciseId={step.exerciseId} currentLabel={step.label} /> : null}

          <GuidedFlowCuesDrawer open={cuesOpen} label={step.label} cues={catalogExercise?.cues} />
        </View>

        <GuidedFlowBottomBar
          title={step.label}
          round={`Round ${step.round + 1} of ${step.roundCount}`}
          tone={tone}
          hasCues={Boolean(catalogExercise?.cues)}
          cuesOpen={cuesOpen}
          onToggleCues={() => setCuesOpen((open) => !open)}
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
