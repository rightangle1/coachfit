/**
 * Superset / triset pairing with a stated rationale (ADR-0121). Grouping is
 * deliberate and explainable — never random (methodology §5). Priority:
 *   1. Antagonist  — opposing muscles, one recovers while the other works.
 *   2. Pre/post-exhaust — a compound + an isolation sharing a target muscle.
 *   3. Time-saver  — unrelated muscles paired purely to save time (opt-in).
 * Heavy low-rep main compounds are NEVER grouped — they need full rest and focus.
 *
 * Pure, deterministic, offline (ADR-0003). Operates on the plan's PlannedExercise
 * list plus a catalog resolver; mutates each grouped exercise's `group` (typed)
 * and `rotationGroup` (string id, for the tracker's round-based flatten).
 */

import type { Exercise, PlannedExercise, SessionBlock, SupersetGroup, SupersetType } from '../types';
import type { MuscleGroup } from '../types';
import { mechanicOf } from './timing';
import { areAntagonists, sharedPrimaryMuscle } from './muscle-relationships';

export interface SupersetOptions {
  /** 2 = superset, 3 = triset. */
  groupSize: 2 | 3;
  /** Pair unrelated muscles purely for time efficiency (goal/opt-in gated). */
  allowTimeSaver: boolean;
  resolve: (id: string) => Exercise | undefined;
}

interface Node {
  planned: PlannedExercise;
  catalog: Exercise;
}

const MUSCLE_LABEL: Partial<Record<MuscleGroup, string>> = {
  lower_back: 'lower back',
};

function label(group: MuscleGroup): string {
  return MUSCLE_LABEL[group] ?? group;
}

/** A set heavy enough that the lift must stay straight (full rest, full focus). */
function hasHeavySet(planned: PlannedExercise): boolean {
  return planned.sets.some(
    (s) => (s.reps != null && s.reps <= 6) || (s.reps != null && s.reps <= 8 && (s.targetRpe ?? 0) >= 9),
  );
}

/** Rep-based work only — planks/carries/holds don't superset cleanly. */
function isRepBased(planned: PlannedExercise): boolean {
  return planned.sets.some((s) => s.reps != null);
}

/** Two exercises can share a round only if they don't contend for fixed equipment. */
function equipmentCompatible(a: Exercise, b: Exercise): boolean {
  return !a.equipment.some(
    (piece) => piece !== 'bodyweight' && piece !== 'yoga_mat' && b.equipment.includes(piece),
  );
}

/** Classify a candidate pairing, or undefined if the two shouldn't be grouped. */
function classifyPair(
  lead: Exercise,
  partner: Exercise,
  allowTimeSaver: boolean,
): { type: SupersetType; rationale: string } | undefined {
  if (!equipmentCompatible(lead, partner)) return undefined;

  if (areAntagonists(lead, partner)) {
    const a = label(lead.primaryAreas[0]);
    const b = label(partner.primaryAreas[0]);
    return {
      type: 'antagonist',
      rationale: `Antagonist superset — ${a} and ${b} oppose, so each recovers while the other works.`,
    };
  }

  const shared = sharedPrimaryMuscle(lead, partner);
  if (shared) {
    const leadMech = mechanicOf(lead);
    const partnerMech = mechanicOf(partner);
    if (leadMech === 'compound' && partnerMech === 'isolation') {
      return {
        type: 'post_exhaust',
        rationale: `Compound → isolation on ${label(shared)} — the big lift first, then focused volume to finish the muscle.`,
      };
    }
    if (leadMech === 'isolation' && partnerMech === 'compound') {
      return {
        type: 'pre_exhaust',
        rationale: `Pre-exhaust ${label(shared)} — isolate it first so the compound drives it harder.`,
      };
    }
    return undefined; // same-muscle but same mechanic → not a meaningful superset
  }

  if (allowTimeSaver) {
    return {
      type: 'time_saver',
      rationale: 'Time-saver pair — unrelated muscles, so neither limits the other.',
    };
  }
  return undefined;
}

/** Every member of a superset/triset must run the same number of rounds, but
 * each exercise's set count so far came from its own independent prescription
 * (e.g. a 4-set compound paired with a 3-set isolation) — and a shorter count
 * may be a safety de-load (severe fatigue, MRV cap) rather than a smaller
 * baseline plan. Trim to the shortest member rather than extending the others
 * up to match; extending could quietly undo a de-load, and trimming never
 * increases anyone's volume (methodology: never blindly increase load/volume). */
function equalizeSetCounts(members: Node[]): void {
  const target = Math.min(...members.map((m) => m.planned.sets.length));
  for (const m of members) {
    if (m.planned.sets.length > target) m.planned.sets = m.planned.sets.slice(0, target);
  }
}

/**
 * Assign typed superset/triset groups over a strength Main block. Returns the
 * number of groups formed (0 = everything stays straight).
 */
export function applySupersets(block: SessionBlock, opts: SupersetOptions): number {
  const nodes: Node[] = [];
  for (const planned of block.exercises) {
    const catalog = opts.resolve(planned.exerciseId);
    // Skip: unknown, heavy compounds, and non-rep work — all stay straight.
    if (!catalog) continue;
    if (mechanicOf(catalog) === 'compound' && hasHeavySet(planned)) continue;
    if (!isRepBased(planned)) continue;
    nodes.push({ planned, catalog });
  }

  const used = new Set<string>();
  let groupNumber = 0;

  // Priority-ordered passes: form ALL antagonist pairs first, then pre/post-exhaust,
  // then (if allowed) time-savers — so a time-saver never cannibalizes an exercise
  // that could have anchored a better antagonist pairing (methodology §5).
  const TIERS: SupersetType[] = ['antagonist', 'post_exhaust', 'pre_exhaust', 'time_saver'];
  for (const tier of TIERS) {
    for (const lead of nodes) {
      if (used.has(lead.planned.exerciseId)) continue;
      let partnerNode: Node | undefined;
      let cls: { type: SupersetType; rationale: string } | undefined;
      for (const partner of nodes) {
        if (partner === lead || used.has(partner.planned.exerciseId)) continue;
        const c = classifyPair(lead.catalog, partner.catalog, opts.allowTimeSaver);
        if (c?.type === tier) {
          partnerNode = partner;
          cls = c;
          break;
        }
      }
      if (!partnerNode || !cls) continue;

      const members: Node[] = [lead, partnerNode];
      // Extend to a triset: a third exercise compatible with BOTH current members.
      if (opts.groupSize >= 3) {
        for (const third of nodes) {
          if (members.includes(third) || used.has(third.planned.exerciseId)) continue;
          const okWithAll = members.every((m) => classifyPair(m.catalog, third.catalog, opts.allowTimeSaver));
          if (okWithAll) {
            members.push(third);
            break;
          }
        }
      }

      equalizeSetCounts(members);

      const id = `rotation-${++groupNumber}`;
      const group: SupersetGroup = { id, type: cls.type, rationale: cls.rationale };
      for (const m of members) {
        m.planned.rotationGroup = id;
        m.planned.group = group;
        used.add(m.planned.exerciseId);
      }
    }
  }

  return groupNumber;
}
