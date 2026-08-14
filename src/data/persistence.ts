/**
 * Persistence port — DEFAULT / WEB / NODE implementation (ADR-0007).
 *
 * Metro resolves this file on web and in Node (unit tests); it resolves
 * `persistence.native.ts` on iOS/Android. Backed by localStorage when available
 * (browser), otherwise an in-memory map (Node). NOT a production data store —
 * on device, the native SQLite impl is the source of truth (ADR-0001).
 */

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

const KEYS = {
  decisions: 'ft_decision_log',
  athletes: 'ft_athletes',
  equipment: 'ft_equipment',
  equipmentProfiles: 'ft_equipment_profiles',
  equipmentProfileState: 'ft_equipment_profile_state',
  exercisePreferences: 'ft_exercise_preferences',
  routines: 'ft_routines',
  plans: 'ft_plans',
  records: 'ft_session_records',
} as const;

/** Browser storage is small and shared with the rest of the app. The decision
 * log is diagnostic-only, so retain a compact recent window rather than let it
 * crowd out the profile, plans, and session records needed to use the app. */
const MAX_DECISION_ROWS = 20;
const MAX_DECISION_LOG_CHARS = 512 * 1024;

function ls(): Storage | null {
  const g = globalThis as unknown as { localStorage?: Storage };
  return g.localStorage ?? null;
}

const memory = new Map<string, string>();

function readRaw(key: string): string {
  const store = ls();
  if (store) return store.getItem(key) ?? '[]';
  return memory.get(key) ?? '[]';
}

function writeRaw(key: string, value: string): void {
  const store = ls();
  if (store) store.setItem(key, value);
  else memory.set(key, value);
}

function readList<T>(key: string): T[] {
  try {
    return JSON.parse(readRaw(key)) as T[];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, rows: T[]): void {
  writeRaw(key, JSON.stringify(rows));
}

function upsertById<T extends { id: string }>(key: string, row: T): void {
  const rows = readList<T>(key);
  const idx = rows.findIndex((r) => r.id === row.id);
  if (idx >= 0) rows[idx] = row;
  else rows.push(row);
  writeList(key, rows);
}

function getById<T extends { id: string }>(key: string, id: string): T | undefined {
  return readList<T>(key).find((r) => r.id === id);
}

export function initStorage(): void {
  for (const key of Object.values(KEYS)) {
    const store = ls();
    if (store && store.getItem(key) == null) store.setItem(key, '[]');
    else if (!store && !memory.has(key)) memory.set(key, '[]');
  }
}

// -- decision log -------------------------------------------------------------

function decisionRowChars(row: DecisionRow): number {
  return row.inputJson.length + row.outputJson.length + (row.driversJson?.length ?? 0) + 256;
}

function retainedDecisions(rows: DecisionRow[]): DecisionRow[] {
  const retained = rows.slice(-MAX_DECISION_ROWS);
  let chars = retained.reduce((total, row) => total + decisionRowChars(row), 0);
  while (retained.length > 1 && chars > MAX_DECISION_LOG_CHARS) {
    const removed = retained.shift();
    chars -= decisionRowChars(removed as DecisionRow);
  }
  return retained;
}

export function insertDecision(row: DecisionRow): void {
  const rows = readList<DecisionRow>(KEYS.decisions);
  let retained = retainedDecisions([...rows, row]);

  // Replacing an overgrown old log with a smaller recent window generally
  // succeeds immediately. If another key has exhausted the origin quota,
  // progressively discard the oldest diagnostic rows; never make the workout
  // build fail because optional logging cannot be persisted.
  while (retained.length > 0) {
    try {
      writeList(KEYS.decisions, retained);
      return;
    } catch {
      retained = retained.slice(1);
    }
  }

  // If a browser refuses every replacement attempt, remove only the optional
  // diagnostic key to free space for the actual workout data. The next engine
  // call can begin a fresh, bounded log.
  try {
    writeList(KEYS.decisions, []);
  } catch {
    try {
      ls()?.removeItem(KEYS.decisions);
    } catch {
      // Storage may be disabled entirely; logging is still intentionally
      // best-effort and must not surface an error to the workout flow.
    }
  }
}

export function listDecisions(limit: number): DecisionRow[] {
  return readList<DecisionRow>(KEYS.decisions)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export function countDecisions(): number {
  return readList<DecisionRow>(KEYS.decisions).length;
}

// -- athlete --------------------------------------------------------------

export function getAthlete(id: string): AthleteRow | undefined {
  return getById<AthleteRow>(KEYS.athletes, id);
}

export function saveAthlete(row: AthleteRow): void {
  upsertById(KEYS.athletes, row);
}

// -- equipment --------------------------------------------------------------

export function getEquipment(id: string): EquipmentRow | undefined {
  return getById<EquipmentRow>(KEYS.equipment, id);
}

export function saveEquipment(row: EquipmentRow): void {
  upsertById(KEYS.equipment, row);
}

// -- equipment profiles ---------------------------------------------------

export function listEquipmentProfiles(): EquipmentProfileRow[] {
  return readList<EquipmentProfileRow>(KEYS.equipmentProfiles)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function getEquipmentProfile(id: string): EquipmentProfileRow | undefined {
  return getById<EquipmentProfileRow>(KEYS.equipmentProfiles, id);
}

export function saveEquipmentProfile(row: EquipmentProfileRow): void {
  upsertById(KEYS.equipmentProfiles, row);
}

export function deleteEquipmentProfileRow(id: string): void {
  writeList(
    KEYS.equipmentProfiles,
    readList<EquipmentProfileRow>(KEYS.equipmentProfiles).filter((row) => row.id !== id),
  );
}

export function getEquipmentProfileState(): EquipmentProfileStateRow | undefined {
  return getById<EquipmentProfileStateRow>(KEYS.equipmentProfileState, 'me');
}

export function saveEquipmentProfileState(row: EquipmentProfileStateRow): void {
  upsertById(KEYS.equipmentProfileState, row);
}

// -- exercise preferences -----------------------------------------------

export function getExercisePreferences(id: string): ExercisePreferencesRow | undefined {
  return getById<ExercisePreferencesRow>(KEYS.exercisePreferences, id);
}

export function saveExercisePreferences(row: ExercisePreferencesRow): void {
  upsertById(KEYS.exercisePreferences, row);
}

// -- routines -------------------------------------------------------------

export function listRoutines(): RoutineRow[] {
  return readList<RoutineRow>(KEYS.routines)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function getRoutine(id: string): RoutineRow | undefined {
  return getById<RoutineRow>(KEYS.routines, id);
}

export function saveRoutine(row: RoutineRow): void {
  upsertById(KEYS.routines, row);
}

export function deleteRoutineRow(id: string): void {
  writeList(KEYS.routines, readList<RoutineRow>(KEYS.routines).filter((row) => row.id !== id));
}

// -- plans --------------------------------------------------------------

export function savePlan(row: PlanRow): void {
  upsertById(KEYS.plans, row);
}

export function getPlan(id: string): PlanRow | undefined {
  return getById<PlanRow>(KEYS.plans, id);
}

// -- session records ----------------------------------------------------

export function saveSessionRecord(row: SessionRecordRow): void {
  upsertById(KEYS.records, row);
}

export function getSessionRecord(id: string): SessionRecordRow | undefined {
  return getById<SessionRecordRow>(KEYS.records, id);
}

export function listSessionRecords(limit: number): SessionRecordRow[] {
  return readList<SessionRecordRow>(KEYS.records)
    .slice()
    .sort((a, b) => b.plannedFor - a.plannedFor)
    .slice(0, limit);
}

export function deleteSessionRecord(id: string): void {
  writeList(KEYS.records, readList<SessionRecordRow>(KEYS.records).filter((row) => row.id !== id));
}

// Compile-time guarantee this module matches the port.
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
