/**
 * Training goals and their relative weighting. All four launch modalities from
 * CLAUDE.md are supported; weights let the engine blend them.
 */

export type Modality =
  | 'strength'      // strength / hypertrophy
  | 'cardio'        // cardio / endurance
  | 'mobility'      // flexibility / mobility
  | 'general';      // weight loss / general fitness

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * The rep/effort zone one exercise is trained in today (ADR-0128).
 *
 * Deliberately a *per-exercise* property rather than a session-level style.
 * `Modality.strength` cannot carry this — its own goal card reads "Build
 * strength & muscle" — so the distinction between training for maximal force and
 * training for size cannot come from the goal taxonomy. Instead the engine
 * rotates each muscle group through the zones on its own schedule, which is why
 * one session can legitimately hold a heavy low-rep press and a high-rep
 * accessory for the same muscle.
 *
 * Lives here rather than beside the engine's `ZONE_SPEC` so that `PerformedSet`
 * can record which zone a set was prescribed in without the types layer
 * depending on the engine.
 */
export type TrainingZone = 'strength' | 'hypertrophy' | 'endurance' | 'power';

/** The physiological outcome resistance work is organized around. */
export type ResistanceFocus =
  | 'general'
  | 'max_strength'
  | 'hypertrophy'
  | 'muscular_endurance'
  | 'power';

/** 0..1 weights across modalities; need not sum to 1 (engine normalizes). */
export type ModalityWeights = Record<Modality, number>;

export interface TrainingGoals {
  weights: ModalityWeights;
  /** Explicit resistance outcome; visual workout styles never infer this. */
  resistanceFocus?: ResistanceFocus;
  /** Optional free-text goal statement, stored for context (rules act on weights). */
  note?: string;
  /**
   * Optional explicit weekly session-count targets per modality (ADR-0105 v2).
   * When set, `generateSession` won't pick a modality that's already met its
   * weekly target while another targeted modality hasn't been touched yet —
   * a concrete "don't over-stack" rule layered on top of `weights`. Unset (the
   * default) preserves prior weight-only behavior exactly.
   */
  weeklyTargets?: Partial<Record<Modality, number>>;
}
