/**
 * Drizzle schema (SQLite) — the on-device source of truth (ADR-0001).
 *
 * Entities are stored as JSON-blob columns (schema-flexible while domain types
 * are still evolving in Phase 1) keyed by id, per ADR-0005's precedent. Formal
 * migrations replace the runtime CREATE TABLE bootstrap before this grows further.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const athletes = sqliteTable('athletes', {
  id: text('id').primaryKey(),
  profileJson: text('profile_json').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const equipmentInventories = sqliteTable('equipment_inventories', {
  id: text('id').primaryKey(),
  inventoryJson: text('inventory_json').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** Named, user-switchable equipment inventories (ADR-0135). Supersedes the
 * single-row `equipmentInventories` table above, which is kept read-only for
 * one-time migration of pre-existing installs. */
export const equipmentProfiles = sqliteTable('equipment_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  inventoryJson: text('inventory_json').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** Single-row pointer to the currently active equipment profile (ADR-0135). */
export const equipmentProfileState = sqliteTable('equipment_profile_state', {
  id: text('id').primaryKey(), // fixed 'me'
  activeProfileId: text('active_profile_id').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const exercisePreferences = sqliteTable('exercise_preferences', {
  id: text('id').primaryKey(),
  excludedJson: text('excluded_json').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** User-curated, reusable exercise lists (ADR-0137). List table, JSON-blob
 * payload — same shape as `equipmentProfiles`, no active-pointer table
 * needed since a routine is picked per-session, not globally active. */
export const routines = sqliteTable('routines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  routineJson: text('routine_json').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const sessionPlans = sqliteTable('session_plans', {
  id: text('id').primaryKey(),
  plannedFor: integer('planned_for').notNull(),
  planJson: text('plan_json').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const sessionRecords = sqliteTable('session_records', {
  id: text('id').primaryKey(),
  planId: text('plan_id').notNull(),
  plannedFor: integer('planned_for').notNull(),
  recordJson: text('record_json').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const decisionLog = sqliteTable('decision_log', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  /** 'generateSession' | 'adjustDuringSession' | 'interpretDebrief' */
  call: text('call').notNull(),
  engineId: text('engine_id').notNull(),
  engineVersion: text('engine_version').notNull(),
  inputJson: text('input_json').notNull(),
  outputJson: text('output_json').notNull(),
  /** Which structured inputs drove which adjustments. */
  driversJson: text('drivers_json'),
  sessionId: text('session_id'),
});

export type AthleteRow = typeof athletes.$inferSelect;
export type EquipmentInventoryRow = typeof equipmentInventories.$inferSelect;
export type EquipmentProfileRow = typeof equipmentProfiles.$inferSelect;
export type EquipmentProfileStateRow = typeof equipmentProfileState.$inferSelect;
export type ExercisePreferencesRow = typeof exercisePreferences.$inferSelect;
export type RoutineRow = typeof routines.$inferSelect;
export type SessionPlanRow = typeof sessionPlans.$inferSelect;
export type SessionRecordRow = typeof sessionRecords.$inferSelect;
export type DecisionLogRow = typeof decisionLog.$inferSelect;
