import { repsLabelFor } from '../set-presentation';

describe('repsLabelFor — ADR-0128 set-kind labelling', () => {
  it('labels an ordinary working set plainly', () => {
    expect(repsLabelFor({ reps: 10 })).toBe('REPS');
  });

  it('labels a ramp set as a warm-up', () => {
    expect(repsLabelFor({ reps: 8, isWarmup: true })).toBe('WARM-UP REPS');
  });

  it('shows the floor and a plus on an all-out set', () => {
    // The whole instruction in two characters: here is the minimum, now find
    // out how many you have.
    expect(repsLabelFor({ reps: 5, prescribedReps: 5, isCalibration: true })).toBe('MAX REPS (5+)');
    expect(repsLabelFor({ reps: 15, prescribedReps: 15, isCalibration: true })).toBe('MAX REPS (15+)');
  });

  it('keeps the floor even after the athlete logs more reps than asked', () => {
    expect(repsLabelFor({ reps: 9, prescribedReps: 5, isCalibration: true })).toBe('MAX REPS (5+)');
  });

  it('degrades gracefully when no floor was recorded', () => {
    expect(repsLabelFor({ isCalibration: true })).toBe('MAX REPS');
  });

  it('treats warm-up as the stronger signal — a ramp is never a max set', () => {
    expect(repsLabelFor({ reps: 8, isWarmup: true, isCalibration: true })).toBe('WARM-UP REPS');
  });
});
