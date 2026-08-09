/**
 * Equipment profile CRUD + migration (ADR-0135). A profile is a named
 * equipment inventory (e.g. "Home", "Gym", "Travel"); exactly one is active
 * at a time, tracked by a single pointer row. `services/equipment.ts` is a
 * thin back-compat shim over whichever profile is active — most of the app
 * should keep calling that, not this file directly.
 */

import { uid } from './id';
import {
  getEquipment as getLegacyRow,
  listEquipmentProfiles as listRows,
  getEquipmentProfile as getRow,
  saveEquipmentProfile as saveRow,
  deleteEquipmentProfileRow as deleteRow,
  getEquipmentProfileState as getStateRow,
  saveEquipmentProfileState as saveStateRow,
} from '../data/persistence';
import type { EquipmentProfileRow } from '../data/persistence-types';
import type { EquipmentInventory, EquipmentProfile } from '../domain/types';

const STATE_ID = 'me';
const LEGACY_EQUIPMENT_ID = 'me';

function rowToProfile(row: EquipmentProfileRow): EquipmentProfile {
  return {
    id: row.id,
    name: row.name,
    inventory: JSON.parse(row.inventoryJson) as EquipmentInventory,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Idempotent, checked against real persisted state every call (not a module
 * flag, so it's correct across cold starts). If profiles already exist,
 * no-op. If a legacy single-inventory row exists (pre-profiles install),
 * migrate it into one active profile. If neither exists (fresh install),
 * no-op — first-run creates the initial profile explicitly via
 * `completeFirstRunEquipmentSetup`.
 */
function ensureBootstrap(): void {
  if (listRows().length > 0) return;
  const legacy = getLegacyRow(LEGACY_EQUIPMENT_ID);
  if (!legacy) return;
  const row: EquipmentProfileRow = {
    id: uid('equip'),
    name: 'My Equipment',
    inventoryJson: legacy.inventoryJson,
    createdAt: legacy.updatedAt,
    updatedAt: legacy.updatedAt,
  };
  saveRow(row);
  saveStateRow({ id: STATE_ID, activeProfileId: row.id, updatedAt: Date.now() });
}

export function listEquipmentProfiles(): EquipmentProfile[] {
  ensureBootstrap();
  return listRows().map(rowToProfile);
}

export function getEquipmentProfile(id: string): EquipmentProfile | undefined {
  ensureBootstrap();
  const row = getRow(id);
  return row ? rowToProfile(row) : undefined;
}

export function getActiveEquipmentProfile(): EquipmentProfile | undefined {
  const profiles = listEquipmentProfiles(); // ensures bootstrap
  if (profiles.length === 0) return undefined;
  const state = getStateRow();
  const active = state ? profiles.find((p) => p.id === state.activeProfileId) : undefined;
  if (active) return active;
  // Defensive self-heal: pointer missing/stale — never leave the app with no
  // active profile. Fall back to the oldest profile and repair the pointer.
  const fallback = profiles[0];
  saveStateRow({ id: STATE_ID, activeProfileId: fallback.id, updatedAt: Date.now() });
  return fallback;
}

export type CreateProfileResult =
  | { ok: true; profile: EquipmentProfile }
  | { ok: false; reason: 'empty' | 'duplicate' };

export function createEquipmentProfile(name: string): CreateProfileResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  const profiles = listEquipmentProfiles();
  if (profiles.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, reason: 'duplicate' };
  }
  const now = Date.now();
  const row: EquipmentProfileRow = {
    id: uid('equip'),
    name: trimmed,
    // Same blank-state default as onboarding (bodyweight always "owned").
    inventoryJson: JSON.stringify({ items: [{ type: 'bodyweight' }] } satisfies EquipmentInventory),
    createdAt: now,
    updatedAt: now,
  };
  saveRow(row); // not made active — the caller switches to it explicitly
  return { ok: true, profile: rowToProfile(row) };
}

export type RenameProfileResult =
  | { ok: true; profile: EquipmentProfile }
  | { ok: false; reason: 'empty' | 'duplicate' | 'not_found' };

export function renameEquipmentProfile(id: string, name: string): RenameProfileResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  const row = getRow(id);
  if (!row) return { ok: false, reason: 'not_found' };
  const duplicate = listRows().some(
    (r) => r.id !== id && r.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (duplicate) return { ok: false, reason: 'duplicate' };
  const next: EquipmentProfileRow = { ...row, name: trimmed, updatedAt: Date.now() };
  saveRow(next);
  return { ok: true, profile: rowToProfile(next) };
}

export type DeleteProfileResult = { ok: true } | { ok: false; reason: 'last' | 'active' | 'not_found' };

export function deleteEquipmentProfile(id: string): DeleteProfileResult {
  const profiles = listRows();
  if (!profiles.some((p) => p.id === id)) return { ok: false, reason: 'not_found' };
  if (profiles.length === 1) return { ok: false, reason: 'last' };
  const state = getStateRow();
  if (state?.activeProfileId === id) return { ok: false, reason: 'active' };
  deleteRow(id);
  return { ok: true };
}

export function setActiveEquipmentProfile(id: string): boolean {
  if (!getRow(id)) return false;
  saveStateRow({ id: STATE_ID, activeProfileId: id, updatedAt: Date.now() });
  return true;
}

export function saveEquipmentProfileInventory(
  id: string,
  inventory: EquipmentInventory,
): EquipmentProfile | undefined {
  const row = getRow(id);
  if (!row) return undefined;
  const next: EquipmentProfileRow = { ...row, inventoryJson: JSON.stringify(inventory), updatedAt: Date.now() };
  saveRow(next);
  return rowToProfile(next);
}

/**
 * Fresh-install first-run only: creates the very first profile and makes it
 * active, since nothing else can be.
 */
export function completeFirstRunEquipmentSetup(inventory: EquipmentInventory): EquipmentProfile {
  const now = Date.now();
  const row: EquipmentProfileRow = {
    id: uid('equip'),
    name: 'My Equipment',
    inventoryJson: JSON.stringify(inventory),
    createdAt: now,
    updatedAt: now,
  };
  saveRow(row);
  saveStateRow({ id: STATE_ID, activeProfileId: row.id, updatedAt: now });
  return rowToProfile(row);
}
