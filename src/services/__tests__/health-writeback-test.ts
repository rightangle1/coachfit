import type { SessionRecord } from '@/domain/types';

jest.mock('@/platform/health', () => ({
  healthWritePort: {
    isSupported: jest.fn(() => true),
    requestWriteAuthorization: jest.fn(async () => true),
    saveWorkout: jest.fn(async () => 'hk-uuid-123'),
  },
}));
jest.mock('@/services/athlete', () => ({
  getAthleteProfile: jest.fn(() => ({ healthSyncEnabled: true })),
}));
jest.mock('@/services/sessions', () => ({
  saveSessionRecord: jest.fn(),
}));

import { healthWritePort } from '@/platform/health';
import { getAthleteProfile } from '@/services/athlete';
import { saveSessionRecord } from '@/services/sessions';
import { writeWorkoutToHealth } from '@/services/health-writeback';

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'r1',
    planId: 'p1',
    plannedFor: Date.now(),
    startedAt: Date.now() - 60_000,
    completedAt: Date.now(),
    performed: [],
    ...overrides,
  };
}

describe('writeWorkoutToHealth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does nothing when the port is unsupported (Android/web/Jest default)', () => {
    (healthWritePort.isSupported as jest.Mock).mockReturnValueOnce(false);
    writeWorkoutToHealth(record());
    expect(healthWritePort.saveWorkout).not.toHaveBeenCalled();
  });

  it('does nothing when the athlete has not opted in to Health sync', () => {
    (getAthleteProfile as jest.Mock).mockReturnValueOnce({ healthSyncEnabled: false });
    writeWorkoutToHealth(record());
    expect(healthWritePort.saveWorkout).not.toHaveBeenCalled();
  });

  it('does nothing when there is no profile yet', () => {
    (getAthleteProfile as jest.Mock).mockReturnValueOnce(undefined);
    writeWorkoutToHealth(record());
    expect(healthWritePort.saveWorkout).not.toHaveBeenCalled();
  });

  it('skips a record already written to HealthKit (idempotency guard)', () => {
    writeWorkoutToHealth(record({ healthKitWorkoutUUID: 'already-there' }));
    expect(healthWritePort.saveWorkout).not.toHaveBeenCalled();
  });

  it('skips an incomplete record (no startedAt/completedAt)', () => {
    writeWorkoutToHealth(record({ completedAt: undefined }));
    expect(healthWritePort.saveWorkout).not.toHaveBeenCalled();
  });

  it.each([
    ['bodybuilding', 'strength'],
    ['sculpting', 'strength'],
    ['cardio', 'cardio'],
    ['yoga', 'yoga'],
    ['stretch', 'flexibility'],
    ['bodyweight', 'functional'],
  ] as const)('maps workoutType %s to HealthKit activity %s', async (workoutType, activityType) => {
    writeWorkoutToHealth(record({ workoutType }));
    await Promise.resolve();
    await Promise.resolve();
    expect(healthWritePort.saveWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ activityType }),
    );
  });

  it('defaults to functional when workoutType is missing', async () => {
    writeWorkoutToHealth(record());
    await Promise.resolve();
    expect(healthWritePort.saveWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: 'functional' }),
    );
  });

  it('persists the returned HealthKit UUID back onto the record', async () => {
    writeWorkoutToHealth(record());
    await Promise.resolve();
    await Promise.resolve();
    expect(saveSessionRecord).toHaveBeenCalledWith(
      expect.objectContaining({ healthKitWorkoutUUID: 'hk-uuid-123' }),
    );
  });

  it('does not persist a UUID when the write fails', async () => {
    (healthWritePort.saveWorkout as jest.Mock).mockResolvedValueOnce(undefined);
    writeWorkoutToHealth(record());
    await Promise.resolve();
    await Promise.resolve();
    expect(saveSessionRecord).not.toHaveBeenCalled();
  });
});
