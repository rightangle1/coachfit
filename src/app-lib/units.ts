/**
 * Weight/height-unit conversion — the UI display boundary only. Every stored/
 * computed weight (planned sets, performed sets, bodyweight, progression steps,
 * e1rm) stays kg-canonical, and height stays cm-canonical; screens convert to
 * the athlete's preferred unit purely for display and back to kg/cm on input.
 * `WeightUnit` doubles as the athlete's overall measurement system (also
 * driving height display) rather than a separate setting, matching how the
 * profile only exposes one units toggle.
 */

import type { WeightUnit } from '@/domain/types';

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
const IN_PER_FT = 12;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/** Converts a canonical kg value to the given display unit, rounded to a
 * sensible increment for that unit (nearest 0.5 kg / nearest whole lb). */
export function kgToDisplayWeight(kg: number, unit: WeightUnit): number {
  if (unit === 'kg') return Math.round(kg * 2) / 2;
  return Math.round(kgToLb(kg));
}

/** Converts a value entered in the given display unit back to canonical kg. */
export function displayWeightToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : lbToKg(value);
}

/** Stepper increment for weight entry — 2.5 kg or 5 lb by default. A structured
 * owned-weight list overrides this in the workout tracker. */
export function weightStep(unit: WeightUnit): number {
  return unit === 'kg' ? 2.5 : 5;
}

/** Formats a canonical kg weight for read-only display, e.g. "82.5 kg" / "180 lb". */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${kgToDisplayWeight(kg, unit)} ${unit}`;
}

/** Bodyweight entry range per unit — kept roughly equivalent across units. */
export const BODYWEIGHT_RANGE: Record<WeightUnit, { min: number; max: number }> = {
  kg: { min: 30, max: 200 },
  lb: { min: 65, max: 440 },
};

export function cmToIn(cm: number): number {
  return cm / CM_PER_IN;
}

export function inToCm(inches: number): number {
  return inches * CM_PER_IN;
}

/** Converts a canonical cm height to the given display unit's stepper value —
 * whole cm, or whole total inches for 'lb' (imperial). */
export function cmToDisplayHeight(cm: number, unit: WeightUnit): number {
  if (unit === 'kg') return Math.round(cm);
  return Math.round(cmToIn(cm));
}

/** Converts a value entered in the display unit's height stepper back to canonical cm. */
export function displayHeightToCm(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : inToCm(value);
}

/** Formats total inches as feet + inches, e.g. 70 -> `5'10"`. */
export function formatFeetInches(totalInches: number): string {
  const rounded = Math.round(totalInches);
  const feet = Math.floor(rounded / IN_PER_FT);
  const inches = rounded % IN_PER_FT;
  return `${feet}'${inches}"`;
}

/** Height entry range per unit — kept roughly equivalent across units (120–220 cm). */
export const HEIGHT_RANGE: Record<WeightUnit, { min: number; max: number }> = {
  kg: { min: 120, max: 220 },
  lb: { min: 47, max: 87 },
};
