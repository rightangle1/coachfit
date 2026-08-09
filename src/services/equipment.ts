/**
 * Back-compat surface over the active equipment profile (ADR-0135). Existing
 * call sites read/write "the current equipment" without knowing profiles
 * exist. See `equipment-profiles.ts` for the full profile CRUD API.
 */

import {
  getActiveEquipmentProfile,
  listEquipmentProfiles,
  saveEquipmentProfileInventory,
} from './equipment-profiles';
import type { EquipmentInventory } from '../domain/types';

export function getEquipmentInventory(): EquipmentInventory | undefined {
  return getActiveEquipmentProfile()?.inventory;
}

export function saveEquipmentInventory(inventory: EquipmentInventory): void {
  const active = getActiveEquipmentProfile();
  if (!active) return; // no profile yet — first-run uses completeFirstRunEquipmentSetup instead
  saveEquipmentProfileInventory(active.id, inventory);
}

export function hasEquipmentInventory(): boolean {
  return listEquipmentProfiles().length > 0;
}
