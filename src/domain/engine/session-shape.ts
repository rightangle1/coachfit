/**
 * Cross-workout-type session-shape sanity layer (ADR-0143). Pure,
 * deterministic, offline — no IO, no catalog dependency (ADR-0003).
 *
 * Every fix upstream (pool/intent agreement, round caps, volumeScale
 * threading) makes each individual generation step more correct, but nothing
 * previously checked the RESULT as a whole: does this session's shape still
 * make sense? This module is that backstop — a defense-in-depth net, not a
 * new hard-safety bucket (CLAUDE.md §7's hard-safety buckets stay exactly
 * avoidance/fatigue/volume). It never blocks generation, never mutates the
 * plan, and never throws; it only surfaces findings to the decision log
 * (CLAUDE.md §7), and only `warn`-severity findings reach the rationale —
 * mirroring `session-volume.ts`'s own "explain only when it cost the athlete
 * something" philosophy.
 *
 * Two invariants, each with the exceptions this repo asked to be named
 * explicitly rather than left implicit:
 *
 * 1. No single exercise in a Main/Conditioning block carries more than
 *    `MAX_UNDECLARED_ROUNDS` work sets UNLESS the block's declared
 *    `cardioIntent` is `'circuit'` or `'interval'` (a deliberately-chosen
 *    multi-round format), OR the session came from an explicit routine
 *    (ADR-0137 — the athlete picked it; its own shape is authoritative).
 * 2. A Main block trains at least `MIN_MAIN_EXERCISES` distinct exercises
 *    UNLESS: (a) it's cardio and the declared intent isn't `'circuit'` —
 *    `'basic'` and single-focus `'interval'` (running/machine sprints,
 *    ADR-0143) can both legitimately be one exercise, and this module has no
 *    catalog access to distinguish single-focus from a real shortfall, so it
 *    stays a soft `info` note rather than a false `warn`; or (b) it's a
 *    routine with fewer exercises than the floor (the athlete's own explicit
 *    composition).
 */

import type { CardioIntent, SessionBlock } from '../types';
import { isWorkingSet } from './session-volume';

export type ShapeFindingCode = 'undeclared_high_round_count' | 'main_block_below_floor';

export interface ShapeFinding {
  severity: 'info' | 'warn';
  code: ShapeFindingCode;
  message: string;
  exerciseId?: string;
  blockLabel?: string;
}

/** Above this, a single exercise's set count reads as "this session is
 * actually structured as multi-round work" — legitimate for a deliberately-
 * chosen circuit/interval format or a routine's own pick, a real signal
 * everywhere else. Matches `cardioSets`'s own `MAX_CARDIO_ROUNDS`. */
const MAX_UNDECLARED_ROUNDS = 8;

/** Below this, a Main block reads as "not really a session" — mirrors
 * `rules-engine.ts`'s own `MIN_MAIN_EXERCISES` for strength; applied here as
 * a cross-modality backstop. */
const MIN_MAIN_EXERCISES = 2;

export interface ShapeAuditContext {
  /** Today's declared cardio format, when Main is cardio. Undefined for a
   * strength/mobility Main — invariant 1 still applies to those, just with
   * no multi-round exception (they have no equivalent declared format). */
  cardioIntent?: CardioIntent;
  /** Whether this session was generated from a user-authored routine
   * (ADR-0137) — its own composition is authoritative, never a shape defect. */
  hasRoutine: boolean;
}

/**
 * Audits an already-built plan's blocks against the two invariants above.
 * Pure and read-only: never mutates `blocks`, never throws, never blocks
 * generation — findings are informational, for the decision log and (at
 * `warn` severity) the rationale.
 */
export function auditSessionShape(blocks: SessionBlock[], context: ShapeAuditContext): ShapeFinding[] {
  const findings: ShapeFinding[] = [];
  const declaredMultiRound = context.cardioIntent === 'circuit' || context.cardioIntent === 'interval';

  for (const block of blocks) {
    if (block.label !== 'Main' && block.label !== 'Conditioning') continue;

    // Invariant 1: no single exercise silently carries the whole block's structure.
    for (const exercise of block.exercises) {
      const workSets = exercise.sets.filter(isWorkingSet).length;
      if (workSets <= MAX_UNDECLARED_ROUNDS) continue;
      if (context.hasRoutine) continue; // the athlete's own pick — authoritative
      if (block.modality === 'cardio' && declaredMultiRound) continue; // deliberately chosen
      findings.push({
        severity: 'warn',
        code: 'undeclared_high_round_count',
        message: `${exercise.name}: ${workSets} sets on one exercise outside a deliberately-chosen circuit/interval format`,
        exerciseId: exercise.exerciseId,
        blockLabel: block.label,
      });
    }

    // Invariant 2: Main isn't silently down to one exercise. Conditioning is
    // ALWAYS exactly one exercise by design (a single finisher), so it never
    // participates in this half of the audit.
    if (block.label !== 'Main') continue;
    if (block.exercises.length >= MIN_MAIN_EXERCISES) continue;
    if (context.hasRoutine) continue; // the athlete's own composition
    if (block.modality === 'cardio' && context.cardioIntent !== 'circuit') continue; // basic/interval can both be one exercise
    findings.push({
      severity: 'info',
      code: 'main_block_below_floor',
      message: `Main has ${block.exercises.length} exercise${block.exercises.length === 1 ? '' : 's'} — fewer than the usual ${MIN_MAIN_EXERCISES}`,
      blockLabel: block.label,
    });
  }

  return findings;
}
