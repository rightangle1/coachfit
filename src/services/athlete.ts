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

export function hasAthleteProfile(): boolean {
  return getAthleteProfile() != null;
}
