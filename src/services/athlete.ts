/**
 * Athlete profile service. Single-user app for now (CLAUDE.md: personal/friends
 * stage) — one profile under a fixed id. Persists via the port (ADR-0007).
 */

import { getAthlete as getRow, saveAthlete as saveRow } from '../data/persistence';
import type { AthleteProfile } from '../domain/types';

export const ATHLETE_ID = 'me';

export function getAthleteProfile(): AthleteProfile | undefined {
  const row = getRow(ATHLETE_ID);
  if (!row) return undefined;
  return JSON.parse(row.profileJson) as AthleteProfile;
}

export function saveAthleteProfile(profile: AthleteProfile): void {
  const now = Date.now();
  saveRow({
    id: ATHLETE_ID,
    profileJson: JSON.stringify({ ...profile, id: ATHLETE_ID, updatedAt: now }),
    createdAt: profile.createdAt ?? now,
    updatedAt: now,
  });
}

/**
 * Records a standalone weigh-in without sending the athlete through the full
 * profile form. The current scalar remains for the programming/calorie
 * boundary; the dated series is what the Progress dashboard renders.
 */
export function recordBodyweight(kg: number, at = Date.now()): AthleteProfile | undefined {
  const profile = getAthleteProfile();
  if (!profile || !Number.isFinite(kg) || kg <= 0) return undefined;
  const nextEntry = { at, kg };
  // A user may correct a prior date. Replace that date's entry and re-sort the
  // entire series so charts always receive a true chronological sequence.
  const bodyweightLog = [...(profile.bodyweightLog ?? []).filter((entry) => entry.at !== at), nextEntry]
    .sort((a, b) => a.at - b.at);
  const next = { ...profile, bodyweightKg: kg, bodyweightLog };
  saveAthleteProfile(next);
  return next;
}

export function hasAthleteProfile(): boolean {
  return getAthleteProfile() != null;
}
