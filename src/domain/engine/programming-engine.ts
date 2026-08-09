/**
 * ProgrammingEngine — THE crown-jewel interface (CLAUDE.md §5).
 *
 * Everything programming-related goes through this. The UI never knows whether a
 * plan came from rules or (a much-later, maybe) advisor. This one abstraction is
 * what keeps the rules-vs-advisor decision reversible forever.
 *
 * Purity rule (ADR-0003): this module and its implementations must NOT import
 * from `react-native`, `expo-*`, or `data/`. Persistence/IO happen in services.
 */

import type {
  SessionContext,
  SessionPlan,
  LiveSignal,
  DebriefInput,
  DebriefResult,
  LiveAdjustmentContext,
} from '../types';

export interface ProgrammingEngine {
  /** Which implementation produced output — recorded in the decision log. */
  readonly id: string;
  readonly version: string;

  /** Build today's session from full athlete context. */
  generateSession(input: SessionContext): Promise<SessionPlan>;

  /** Live mid-workout adjustment (e.g. "too easy" / "knee twinge"). */
  adjustDuringSession(
    plan: SessionPlan,
    signal: LiveSignal,
    context?: LiveAdjustmentContext,
  ): Promise<SessionPlan>;

  /** Turn the debrief into structured takeaways that feed the next session. */
  interpretDebrief(
    plan: SessionPlan,
    debrief: DebriefInput,
  ): Promise<DebriefResult>;
}
