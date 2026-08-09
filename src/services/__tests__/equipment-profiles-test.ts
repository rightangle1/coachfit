import type { EquipmentInventory } from '@/domain/types';

/**
 * Each test gets a fresh, isolated module registry (`jest.isolateModules`)
 * so the web/Node persistence port's module-level in-memory store starts
 * empty — the service functions under test aren't parameterized by storage,
 * so isolation has to happen at the module level.
 */
function freshModules() {
  let mods!: {
    persistence: typeof import('@/data/persistence');
    profiles: typeof import('@/services/equipment-profiles');
    shim: typeof import('@/services/equipment');
  };
  jest.isolateModules(() => {
    const persistence = require('@/data/persistence') as typeof import('@/data/persistence');
    const profiles = require('@/services/equipment-profiles') as typeof import('@/services/equipment-profiles');
    const shim = require('@/services/equipment') as typeof import('@/services/equipment');
    persistence.initStorage();
    mods = { persistence, profiles, shim };
  });
  return mods;
}

describe('equipment-profiles service', () => {
  it('bootstraps to an empty list on a fresh install', () => {
    const { profiles } = freshModules();
    expect(profiles.listEquipmentProfiles()).toEqual([]);
    expect(profiles.getActiveEquipmentProfile()).toBeUndefined();
  });

  it('migrates a legacy single-inventory row into one active profile', () => {
    const { persistence, profiles } = freshModules();
    const legacyInventory: EquipmentInventory = { items: [{ type: 'dumbbells', availableWeightsKg: [10, 20] }] };
    persistence.saveEquipment({ id: 'me', inventoryJson: JSON.stringify(legacyInventory), updatedAt: 123 });

    const list = profiles.listEquipmentProfiles();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('My Equipment');
    expect(list[0].inventory).toEqual(legacyInventory);
    expect(profiles.getActiveEquipmentProfile()?.id).toBe(list[0].id);

    // Idempotent — calling again doesn't create a second profile.
    expect(profiles.listEquipmentProfiles()).toHaveLength(1);
  });

  it('creates a profile without making it active', () => {
    const { profiles } = freshModules();
    const first = profiles.completeFirstRunEquipmentSetup({ items: [{ type: 'bodyweight' }] });

    const result = profiles.createEquipmentProfile('Gym');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.name).toBe('Gym');
    expect(result.profile.inventory).toEqual({ items: [{ type: 'bodyweight' }] });
    expect(profiles.getActiveEquipmentProfile()?.id).toBe(first.id);
    expect(profiles.listEquipmentProfiles()).toHaveLength(2);
  });

  it('rejects an empty or duplicate profile name on create', () => {
    const { profiles } = freshModules();
    profiles.completeFirstRunEquipmentSetup({ items: [] });
    profiles.createEquipmentProfile('Gym');

    expect(profiles.createEquipmentProfile('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(profiles.createEquipmentProfile('gym')).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('renames a profile, rejecting empty/duplicate/unknown ids', () => {
    const { profiles } = freshModules();
    const home = profiles.completeFirstRunEquipmentSetup({ items: [] });
    const gymResult = profiles.createEquipmentProfile('Gym');
    if (!gymResult.ok) throw new Error('setup failed');

    const renamed = profiles.renameEquipmentProfile(gymResult.profile.id, 'Office Gym');
    expect(renamed).toEqual({ ok: true, profile: expect.objectContaining({ name: 'Office Gym' }) });

    expect(profiles.renameEquipmentProfile(home.id, '')).toEqual({ ok: false, reason: 'empty' });
    expect(profiles.renameEquipmentProfile(home.id, 'office gym')).toEqual({ ok: false, reason: 'duplicate' });
    expect(profiles.renameEquipmentProfile('unknown-id', 'Anything')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('blocks deleting the last remaining profile', () => {
    const { profiles } = freshModules();
    const only = profiles.completeFirstRunEquipmentSetup({ items: [] });
    expect(profiles.deleteEquipmentProfile(only.id)).toEqual({ ok: false, reason: 'last' });
  });

  it('blocks deleting the active profile even when others exist', () => {
    const { profiles } = freshModules();
    const home = profiles.completeFirstRunEquipmentSetup({ items: [] });
    profiles.createEquipmentProfile('Gym');
    expect(profiles.deleteEquipmentProfile(home.id)).toEqual({ ok: false, reason: 'active' });
  });

  it('deletes a non-active profile and reports not_found for an unknown id', () => {
    const { profiles } = freshModules();
    profiles.completeFirstRunEquipmentSetup({ items: [] });
    const gymResult = profiles.createEquipmentProfile('Gym');
    if (!gymResult.ok) throw new Error('setup failed');

    expect(profiles.deleteEquipmentProfile(gymResult.profile.id)).toEqual({ ok: true });
    expect(profiles.listEquipmentProfiles()).toHaveLength(1);
    expect(profiles.deleteEquipmentProfile('unknown-id')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('switches the active profile', () => {
    const { profiles } = freshModules();
    profiles.completeFirstRunEquipmentSetup({ items: [] });
    const gymResult = profiles.createEquipmentProfile('Gym');
    if (!gymResult.ok) throw new Error('setup failed');

    expect(profiles.setActiveEquipmentProfile(gymResult.profile.id)).toBe(true);
    expect(profiles.getActiveEquipmentProfile()?.id).toBe(gymResult.profile.id);
    expect(profiles.setActiveEquipmentProfile('unknown-id')).toBe(false);
  });

  it('services/equipment.ts back-compat shim acts on whichever profile is active', () => {
    const { profiles, shim } = freshModules();
    expect(shim.hasEquipmentInventory()).toBe(false);

    const home = profiles.completeFirstRunEquipmentSetup({ items: [{ type: 'bodyweight' }] });
    expect(shim.hasEquipmentInventory()).toBe(true);
    expect(shim.getEquipmentInventory()).toEqual({ items: [{ type: 'bodyweight' }] });

    const gymResult = profiles.createEquipmentProfile('Gym');
    if (!gymResult.ok) throw new Error('setup failed');
    profiles.setActiveEquipmentProfile(gymResult.profile.id);

    shim.saveEquipmentInventory({ items: [{ type: 'barbell' }] });
    expect(shim.getEquipmentInventory()).toEqual({ items: [{ type: 'barbell' }] });
    // The previously-active profile is untouched.
    expect(profiles.getEquipmentProfile(home.id)?.inventory).toEqual({ items: [{ type: 'bodyweight' }] });
  });
});
