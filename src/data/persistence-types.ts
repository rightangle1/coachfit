/**
 * Persistence port types (ADR-0007). Platform-agnostic — shared by the native
 * (expo-sqlite/Drizzle) and web/default (localStorage/in-memory) implementations.
 *
 * Rows carry JSON blobs for the actual domain payload (schema-flexible while
 * Phase 1 evolves); ids/timestamps are the only structured columns.
 */

export interface DecisionRow {
  id: string;
  createdAt: number;
  call: string;
  engineId: string;
  engineVersion: string;
  inputJson: string;
  outputJson: string;
  driversJson?: string | null;
  sessionId?: string | null;
}

export interface AthleteRow {
  id: string;
  profileJson: string;
  createdAt: number;
  updatedAt: number;
}

export interface EquipmentRow {
  id: string;
  inventoryJson: string;
  updatedAt: number;
}

export interface EquipmentProfileRow {
  id: string;
  name: string;
  inventoryJson: string;
  createdAt: number;
  updatedAt: number;
}

export interface EquipmentProfileStateRow {
  id: string;
  activeProfileId: string;
  updatedAt: number;
}

export interface ExercisePreferencesRow {
  id: string;
  excludedJson: string;
  updatedAt: number;
}

export interface PlanRow {
  id: string;
  plannedFor: number;
  planJson: string;
  createdAt: number;
}

export interface SessionRecordRow {
  id: string;
  planId: string;
  plannedFor: number;
  recordJson: string;
  updatedAt: number;
}

export interface StorageApi {
  /** Idempotent bootstrap; safe to call at every app start. */
  initStorage(): void;

  insertDecision(row: DecisionRow): void;
  listDecisions(limit: number): DecisionRow[];
  countDecisions(): number;

  getAthlete(id: string): AthleteRow | undefined;
  saveAthlete(row: AthleteRow): void;

  getEquipment(id: string): EquipmentRow | undefined;
  saveEquipment(row: EquipmentRow): void;

  listEquipmentProfiles(): EquipmentProfileRow[];
  getEquipmentProfile(id: string): EquipmentProfileRow | undefined;
  saveEquipmentProfile(row: EquipmentProfileRow): void;
  deleteEquipmentProfileRow(id: string): void;

  getEquipmentProfileState(): EquipmentProfileStateRow | undefined;
  saveEquipmentProfileState(row: EquipmentProfileStateRow): void;

  getExercisePreferences(id: string): ExercisePreferencesRow | undefined;
  saveExercisePreferences(row: ExercisePreferencesRow): void;

  savePlan(row: PlanRow): void;
  getPlan(id: string): PlanRow | undefined;

  saveSessionRecord(row: SessionRecordRow): void;
  getSessionRecord(id: string): SessionRecordRow | undefined;
  listSessionRecords(limit: number): SessionRecordRow[];
  deleteSessionRecord(id: string): void;
}
