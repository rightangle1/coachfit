import type { AthleteProfile } from '@/domain/types';

/** Existing athletes have no eligibility marker, so new education never
 * reappears as an unsolicited interruption after an app update. */
export function needsAppTour(profile: Pick<AthleteProfile, 'appTour'> | undefined): boolean {
  return Boolean(profile?.appTour?.eligibleAt && !profile.appTour.completedAt);
}

/** Preserve the eligibility timestamp for diagnostics while making the tour a
 * one-time first-run experience. */
export function markAppTourComplete(profile: AthleteProfile, now = Date.now()): AthleteProfile {
  return {
    ...profile,
    appTour: {
      eligibleAt: profile.appTour?.eligibleAt ?? now,
      completedAt: now,
    },
  };
}
