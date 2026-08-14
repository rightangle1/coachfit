/**
 * Persistence port — NATIVE implementation (iOS/Android) (ADR-0001, ADR-0007).
 *
 * Real on-device SQLite via expo-sqlite + Drizzle. This is the product source of
 * truth. Metro resolves this file on native; web/Node use `persistence.ts`.
 *
 * Phase 0/1 uses a runtime CREATE TABLE IF NOT EXISTS bootstrap; formal
 * drizzle-kit migrations replace it before the schema grows further.
 */

import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { sql, desc, eq } from 'drizzle-orm';
import {
  athletes,
  decisionLog,
  equipmentInventories,
  equipmentProfiles,
  equipmentProfileState,
  exercisePreferences,
  routines,
  sessionPlans,
  sessionRecords,
} from './schema';
import type {
  AthleteRow,
  DecisionRow,
  EquipmentRow,
  EquipmentProfileRow,
  EquipmentProfileStateRow,
  ExercisePreferencesRow,
  PlanRow,
  RoutineRow,
  SessionRecordRow,
  StorageApi,
} from './persistence-types';

const sqlite = openDatabaseSync('fitness.db', { enableChangeListener: true });
const db = drizzle(sqlite);

let ready = false;

export function initStorage(): void {
  if (ready) return;
  db.run(sql`
    CREATE TABLE IF NOT EXISTS athletes (
      id TEXT PRIMARY KEY NOT NULL,
      profile_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS equipment_inventories (
      id TEXT PRIMARY KEY NOT NULL,
      inventory_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS equipment_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      inventory_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS equipment_profile_state (
      id TEXT PRIMARY KEY NOT NULL,
      active_profile_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS exercise_preferences (
      id TEXT PRIMARY KEY NOT NULL,
      excluded_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      routine_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS session_plans (
      id TEXT PRIMARY KEY NOT NULL,
      planned_for INTEGER NOT NULL,
      plan_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS session_records (
      id TEXT PRIMARY KEY NOT NULL,
      plan_id TEXT NOT NULL,
      planned_for INTEGER NOT NULL,
      record_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS decision_log (
      id TEXT PRIMARY KEY NOT NULL,
      created_at INTEGER NOT NULL,
      call TEXT NOT NULL,
      engine_id TEXT NOT NULL,
      engine_version TEXT NOT NULL,
      input_json TEXT NOT NULL,
      output_json TEXT NOT NULL,
      drivers_json TEXT,
      session_id TEXT
    );
  `);
  ready = true;
}

// -- decision log -------------------------------------------------------------

export function insertDecision(row: DecisionRow): void {
  db.insert(decisionLog)
    .values({
      id: row.id,
      createdAt: row.createdAt,
      call: row.call,
      engineId: row.engineId,
      engineVersion: row.engineVersion,
      inputJson: row.inputJson,
      outputJson: row.outputJson,
      driversJson: row.driversJson ?? null,
      sessionId: row.sessionId ?? null,
    })
    .run();
}

export function listDecisions(limit: number): DecisionRow[] {
  return db.select().from(decisionLog).orderBy(desc(decisionLog.createdAt)).limit(limit).all();
}

export function countDecisions(): number {
  return db.select().from(decisionLog).all().length;
}

// -- athlete --------------------------------------------------------------

export function getAthlete(id: string): AthleteRow | undefined {
  return db.select().from(athletes).where(eq(athletes.id, id)).get();
}

export function saveAthlete(row: AthleteRow): void {
  db.insert(athletes)
    .values(row)
    .onConflictDoUpdate({
      target: athletes.id,
      set: { profileJson: row.profileJson, updatedAt: row.updatedAt },
    })
    .run();
}

// -- equipment --------------------------------------------------------------

export function getEquipment(id: string): EquipmentRow | undefined {
  return db
    .select()
    .from(equipmentInventories)
    .where(eq(equipmentInventories.id, id))
    .get();
}

export function saveEquipment(row: EquipmentRow): void {
  db.insert(equipmentInventories)
    .values(row)
    .onConflictDoUpdate({
      target: equipmentInventories.id,
      set: { inventoryJson: row.inventoryJson, updatedAt: row.updatedAt },
    })
    .run();
}

// -- equipment profiles ---------------------------------------------------

export function listEquipmentProfiles(): EquipmentProfileRow[] {
  return db.select().from(equipmentProfiles).orderBy(equipmentProfiles.createdAt).all();
}

export function getEquipmentProfile(id: string): EquipmentProfileRow | undefined {
  return db.select().from(equipmentProfiles).where(eq(equipmentProfiles.id, id)).get();
}

export function saveEquipmentProfile(row: EquipmentProfileRow): void {
  db.insert(equipmentProfiles)
    .values(row)
    .onConflictDoUpdate({
      target: equipmentProfiles.id,
      set: { name: row.name, inventoryJson: row.inventoryJson, updatedAt: row.updatedAt },
    })
    .run();
}

export function deleteEquipmentProfileRow(id: string): void {
  db.delete(equipmentProfiles).where(eq(equipmentProfiles.id, id)).run();
}

export function getEquipmentProfileState(): EquipmentProfileStateRow | undefined {
  return db.select().from(equipmentProfileState).where(eq(equipmentProfileState.id, 'me')).get();
}

export function saveEquipmentProfileState(row: EquipmentProfileStateRow): void {
  db.insert(equipmentProfileState)
    .values(row)
    .onConflictDoUpdate({
      target: equipmentProfileState.id,
      set: { activeProfileId: row.activeProfileId, updatedAt: row.updatedAt },
    })
    .run();
}

// -- exercise preferences -----------------------------------------------

export function getExercisePreferences(id: string): ExercisePreferencesRow | undefined {
  return db
    .select()
    .from(exercisePreferences)
    .where(eq(exercisePreferences.id, id))
    .get();
}

export function saveExercisePreferences(row: ExercisePreferencesRow): void {
  db.insert(exercisePreferences)
    .values(row)
    .onConflictDoUpdate({
      target: exercisePreferences.id,
      set: { excludedJson: row.excludedJson, updatedAt: row.updatedAt },
    })
    .run();
}

// -- routines -------------------------------------------------------------

export function listRoutines(): RoutineRow[] {
  return db.select().from(routines).orderBy(routines.createdAt).all();
}

export function getRoutine(id: string): RoutineRow | undefined {
  return db.select().from(routines).where(eq(routines.id, id)).get();
}

export function saveRoutine(row: RoutineRow): void {
  db.insert(routines)
    .values(row)
    .onConflictDoUpdate({
      target: routines.id,
      set: { name: row.name, routineJson: row.routineJson, updatedAt: row.updatedAt },
    })
    .run();
}

export function deleteRoutineRow(id: string): void {
  db.delete(routines).where(eq(routines.id, id)).run();
}

// -- plans --------------------------------------------------------------

export function savePlan(row: PlanRow): void {
  db.insert(sessionPlans)
    .values(row)
    .onConflictDoUpdate({
      target: sessionPlans.id,
      set: { planJson: row.planJson, plannedFor: row.plannedFor },
    })
    .run();
}

export function getPlan(id: string): PlanRow | undefined {
  return db.select().from(sessionPlans).where(eq(sessionPlans.id, id)).get();
}

// -- session records ----------------------------------------------------

export function saveSessionRecord(row: SessionRecordRow): void {
  db.insert(sessionRecords)
    .values(row)
    .onConflictDoUpdate({
      target: sessionRecords.id,
      set: { recordJson: row.recordJson, updatedAt: row.updatedAt },
    })
    .run();
}

export function getSessionRecord(id: string): SessionRecordRow | undefined {
  return db.select().from(sessionRecords).where(eq(sessionRecords.id, id)).get();
}

export function listSessionRecords(limit: number): SessionRecordRow[] {
  return db
    .select()
    .from(sessionRecords)
    .orderBy(desc(sessionRecords.plannedFor))
    .limit(limit)
    .all();
}

export function deleteSessionRecord(id: string): void {
  db.delete(sessionRecords).where(eq(sessionRecords.id, id)).run();
}

const _impl: StorageApi = {
  initStorage,
  insertDecision,
  listDecisions,
  countDecisions,
  getAthlete,
  saveAthlete,
  getEquipment,
  saveEquipment,
  listEquipmentProfiles,
  getEquipmentProfile,
  saveEquipmentProfile,
  deleteEquipmentProfileRow,
  getEquipmentProfileState,
  saveEquipmentProfileState,
  getExercisePreferences,
  saveExercisePreferences,
  listRoutines,
  getRoutine,
  saveRoutine,
  deleteRoutineRow,
  savePlan,
  getPlan,
  saveSessionRecord,
  getSessionRecord,
  listSessionRecords,
  deleteSessionRecord,
};
void _impl;
