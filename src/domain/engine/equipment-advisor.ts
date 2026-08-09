/**
 * Equipment recommendation (ADR-0109 v1). Pure, deterministic, small — a couple
 * of high-value suggestions tied to goals, never an upsell dump (max 2).
 */

import type { EquipmentInventory, EquipmentType, TrainingGoals } from '../types';

export interface EquipmentRecommendation {
  type: EquipmentType;
  label: string;
  reason: string;
}

const THRESH = { strength: 0.3, mobility: 0.25, cardio: 0.3 } as const;

export function recommendEquipment(
  goals: TrainingGoals,
  inventory: EquipmentInventory,
): EquipmentRecommendation[] {
  const owned = new Set(inventory.items.map((i) => i.type));
  const has = (t: EquipmentType) => owned.has(t);
  const recs: EquipmentRecommendation[] = [];

  const strengthy = goals.weights.strength >= THRESH.strength;
  const mobile = goals.weights.mobility >= THRESH.mobility;
  const cardioy = goals.weights.cardio >= THRESH.cardio;

  if (
    strengthy &&
    !has('dumbbells') &&
    !has('barbell') &&
    !has('resistance_bands_tube') &&
    !has('resistance_bands_loop')
  ) {
    recs.push({
      type: 'dumbbells',
      label: 'Dumbbells',
      reason: 'Your strength goal is a priority — dumbbells unlock the most exercises for the space.',
    });
  } else if (strengthy && has('dumbbells') && !has('bench')) {
    recs.push({
      type: 'bench',
      label: 'Bench',
      reason: 'A bench unlocks bench press and incline work with the dumbbells you already have.',
    });
  } else if (
    strengthy &&
    has('dumbbells') &&
    has('bench') &&
    !has('pull_up_bar') &&
    !has('resistance_bands_tube') &&
    !has('resistance_bands_loop')
  ) {
    recs.push({
      type: 'pull_up_bar',
      label: 'Pull-up bar',
      reason: 'You’re missing a strong pulling exercise — a doorway bar covers that gap.',
    });
  }

  if (recs.length < 2 && mobile && !has('yoga_mat')) {
    recs.push({
      type: 'yoga_mat',
      label: 'Yoga mat',
      reason: 'Mobility work is part of your goals — a mat makes floor stretches comfortable.',
    });
  }

  const hasAnyCardioMachine =
    has('cardio_machine') || has('treadmill') || has('bike') || has('elliptical') || has('stair_climber') || has('rowing_machine');
  if (recs.length < 2 && cardioy && !hasAnyCardioMachine) {
    recs.push({
      type: 'cardio_machine',
      label: 'Cardio machine',
      reason: 'Optional: a treadmill, bike, or rower gives steady-state cardio more variety than bodyweight alone.',
    });
  }

  return recs.slice(0, 2);
}
