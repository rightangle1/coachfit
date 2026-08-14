/**
 * Programming service — the ONLY thing the UI calls for workout logic.
 *
 * Wraps the active ProgrammingEngine and guarantees every call is written to the
 * decision log (ADR-0005). Swapping the engine implementation (or adding a future
 * advisor) happens here, invisibly to the UI (CLAUDE.md §5).
 */

import { RulesEngine, auditSessionShape, type ProgrammingEngine } from '../domain/engine';
import type {
  SessionContext,
  SessionPlan,
  LiveSignal,
  DebriefInput,
  DebriefResult,
  LiveAdjustmentContext,
} from '../domain/types';
import { logDecision } from './decision-log';

// The active engine. Phase 0: rules only. Future: HybridEngine(rules, advisor).
const engine: ProgrammingEngine = new RulesEngine();

export async function generateSession(input: SessionContext): Promise<SessionPlan> {
  const output = await engine.generateSession(input);
  // ADR-0143: a post-hoc, read-only sanity pass over the finished plan —
  // never mutates `output`, never blocks the response. Findings always reach
  // the decision log via `drivers` below; only `warn`-severity ones would
  // ever be worth surfacing to the athlete, and none of today's findings
  // rise to that (a passing session logs an empty array).
  const shapeFindings = auditSessionShape(output.blocks, {
    cardioIntent: output.workoutOptions?.cardioIntent,
    hasRoutine: output.routineId != null,
  });
  logDecision({
    call: 'generateSession',
    engineId: engine.id,
    engineVersion: engine.version,
    input,
    output,
    drivers: {
      reasonCodes: [
        input.targeting.emphasize.length ? 'explicit_emphasis' : 'balanced_targeting',
        input.avoidToday.flags.length ? 'athlete_avoidance' : 'no_daily_avoidance',
        input.goals.resistanceFocus ? `resistance_focus:${input.goals.resistanceFocus}` : 'resistance_focus:general',
        input.trainingIntent ? `training_intent:${input.trainingIntent}` : 'training_intent:balanced',
        // ADR-0137: which structured input drove Main selection today.
        ...(input.routine ? [`routine:${input.routine.id}`] : []),
        // ADR-0140: which cardio modality preference (if any) narrowed Main.
        ...(input.workoutOptions?.cardioModalities?.length ? [`cardio_modality:${input.workoutOptions.cardioModalities.join(',')}`] : []),
      ],
      emphasize: input.targeting.emphasize,
      avoidToday: input.avoidToday.flags,
      readiness: input.readiness,
      // ADR-0122: per-muscle fatigue feeds load finalization; the exact
      // per-exercise load adjustments are captured in output.adjustments.
      fatigueByGroup: input.fatigue.byGroup,
      // ADR-0143: cross-workout-type shape sanity — empty when the session
      // passes both invariants.
      shapeFindings,
    },
    sessionId: output.id,
  });
  return output;
}

export async function adjustDuringSession(
  plan: SessionPlan,
  signal: LiveSignal,
  context?: LiveAdjustmentContext,
): Promise<SessionPlan> {
  const output = await engine.adjustDuringSession(plan, signal, context);
  logDecision({
    call: 'adjustDuringSession',
    engineId: engine.id,
    engineVersion: engine.version,
    input: { plan, signal, context },
    output,
    drivers: {
      reasonCodes: output.liveAdjustments?.slice(-1).map((adjustment) => adjustment.reasonCode) ?? [`live_signal:${signal.kind}`],
      signal,
    },
    sessionId: plan.id,
  });
  return output;
}

export async function interpretDebrief(
  plan: SessionPlan,
  debrief: DebriefInput,
): Promise<DebriefResult> {
  const output = await engine.interpretDebrief(plan, debrief);
  logDecision({
    call: 'interpretDebrief',
    engineId: engine.id,
    engineVersion: engine.version,
    input: { plan, debrief },
    output,
    drivers: {
      reasonCodes: [
        debrief.issues?.length ? 'debrief_issue' : 'debrief_clear',
        debrief.wouldDoAgain === false ? 'preference_avoid' : 'preference_neutral_or_positive',
      ],
      issues: debrief.issues,
      overallRpe: debrief.overallRpe,
    },
    sessionId: plan.id,
  });
  return output;
}
