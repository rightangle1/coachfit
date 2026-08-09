/**
 * Default HealthKit write-back port — Android, web, and Jest/Node. HealthKit is
 * an iOS-only capability; see `health.ios.ts` for the real implementation.
 */

import type { HealthWritePort } from './health-types';

export const healthWritePort: HealthWritePort = {
  isSupported: () => false,
  requestWriteAuthorization: async () => false,
  saveWorkout: async () => undefined,
};
