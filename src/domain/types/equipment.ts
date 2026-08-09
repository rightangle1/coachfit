/**
 * Equipment the athlete owns / can access. The rules engine filters exercise
 * selection by this, and recommends a few high-value additions tied to goals
 * (ADR-0109, Phase 1).
 */

/** v0 equipment vocabulary — extend as the exercise catalog grows (ADR-0101). */
export type EquipmentType =
  | 'bodyweight'
  | 'dumbbells'
  | 'barbell'
  | 'kettlebell'
  | 'resistance_bands_tube'   // tube/handled bands (door-anchor or underfoot)
  | 'resistance_bands_loop'  // loop/mini bands (worn around limbs, no handles)
  | 'pull_up_bar'
  | 'bench'
  | 'squat_rack'
  | 'cable_machine'
  | 'cardio_machine'    // any cardio machine not covered by a specific type below
  | 'treadmill'
  | 'bike'              // stationary/spin bike, upright or recumbent
  | 'elliptical'
  | 'stair_climber'
  | 'rowing_machine'    // includes rowing- and skiing-style pulling ergometers
  | 'yoga_mat'
  | 'foam_roller'
  | 'suspension_trainer';   // TRX or equivalent suspension/cable trainer

/** Equipment whose *specific owned weights* the rules engine can constrain
 * recommendations to (ADR-0115) — as opposed to e.g. a barbell, where plates
 * are assumed freely combinable. */
export type WeightedEquipmentType =
  | 'dumbbells'
  | 'kettlebell'
  | 'resistance_bands_tube'
  | 'resistance_bands_loop';

export const WEIGHTED_EQUIPMENT_TYPES: WeightedEquipmentType[] = [
  'dumbbells',
  'kettlebell',
  'resistance_bands_tube',
  'resistance_bands_loop',
];

export interface EquipmentItem {
  type: EquipmentType;
  /**
   * Discrete weights actually owned, canonical kg, ascending (ADR-0115). Only
   * meaningful for `WeightedEquipmentType`s. Undefined/empty means "unconstrained"
   * — the engine recommends load freely, same as today (e.g. no data yet, or a
   * gym's full dumbbell rack).
   */
  availableWeightsKg?: number[];
  /** e.g. adjustable dumbbells max weight, plates available — optional detail. */
  note?: string;
}

export interface EquipmentInventory {
  items: EquipmentItem[];
}

/**
 * A named, user-switchable equipment inventory (ADR-0135) — e.g. "Home",
 * "Gym", "Travel". Exactly one profile is active at a time; that's the
 * inventory the engine and every equipment-aware screen actually use.
 */
export interface EquipmentProfile {
  id: string;
  name: string;
  inventory: EquipmentInventory;
  createdAt: number;
  updatedAt: number;
}
