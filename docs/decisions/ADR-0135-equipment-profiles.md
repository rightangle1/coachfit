# ADR-0135 — Equipment profiles

- **Status:** Accepted (v1)
- **Date:** 2026-08-08
- **Phase:** 1

## Context
ADR-0109 explicitly scoped equipment to one inventory per user, "persisted
via the port under the single-user id (Phase 1 scope)." In practice the
athlete trains in multiple places — home, a gym, an office, while traveling —
each with a different set of equipment, and re-editing a single inventory
every time is exactly the "spreadsheet" friction CLAUDE.md's guiding
principles want the app to avoid. This reverses that scoping: the athlete can
now create named equipment profiles and switch which one is active; the
active profile's inventory is what the rules engine and every
equipment-aware screen use, unchanged.

Product decisions locked in for v1: deleting the currently active profile is
blocked (switch away first, rather than auto-switching); there is always at
least one profile (deleting the last one is blocked); creating a profile
opens the equipment picker immediately but does not make the new profile
active; whichever profile was last switched to persists as active across
restarts.

## Options considered
- **Boolean `isActive` column on each profile row** — simple to read, but
  switching active profiles needs two writes (clear the old row, set the
  new one) with no transaction helper in this codebase (`persistence.ts`/
  `persistence.native.ts` have no wrapped multi-statement transactions), so a
  crash mid-switch could leave zero or two rows marked active.
- **Separate single-row pointer table** (`equipment_profile_state: { id: 'me',
  activeProfileId }`) — every operation (create, rename, delete, switch) is a
  single-row write; switching active is exactly one write to the pointer row.
  Mirrors the existing single-row-under-fixed-id pattern already used for
  `athletes`/`equipmentInventories`.
- **Client-side-only "profiles" over the existing single inventory** (no new
  persistence) — rejected: not durable across restarts/reinstalls, and this
  app's data layer is the source of truth (ADR-0001) — local-first storage
  requirements (CLAUDE.md §4) rule out anything that isn't actually saved.

## Decision
A new list table `equipment_profiles` (`id`, `name`, `inventoryJson`,
`createdAt`, `updatedAt`) plus a single-row pointer table
`equipment_profile_state` (`id: 'me'`, `activeProfileId`, `updatedAt`),
implemented identically in both `persistence.native.ts` (Drizzle/SQLite) and
`persistence.ts` (web/Node) per ADR-0007. The legacy `equipment_inventories`
table/row is left in place, read-only, used only once: on first read after
upgrade, if no profiles exist yet but a legacy `'me'` row does, it's migrated
into one profile named "My Equipment," marked active. Fresh installs instead
create the first profile via first-run onboarding.

`services/equipment.ts`'s existing `getEquipmentInventory` /
`saveEquipmentInventory` / `hasEquipmentInventory` keep byte-identical
signatures, now proxying to whichever profile is active
(`services/equipment-profiles.ts`) — so the rules engine and every
downstream screen that reads "the current equipment" needed zero changes.

## Consequences
- Reversible: collapsing back to a single inventory would mean always
  reading the first/only profile and ignoring the switcher UI; no data model
  change would be required to do so.
- Delete-active and delete-last are blocked by design rather than
  auto-resolved, so switching context is always an explicit athlete choice —
  simpler to reason about, at the cost of one extra tap if they want to
  delete the profile they're currently on.
- No multi-row transactions are ever required for any profile operation,
  consistent with the synchronous, non-transactional persistence layer this
  app already has.
