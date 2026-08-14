import { auditSessionShape } from '../session-shape';
import type { PlannedExercise, PlannedSet, SessionBlock } from '../../types';

function workSets(count: number): PlannedSet[] {
  return Array.from({ length: count }, () => ({ durationSec: 30, phase: 'work' as const }));
}

function exercise(id: string, sets: PlannedSet[]): PlannedExercise {
  return { exerciseId: id, name: id, primaryAreas: [{ group: 'quads' }], sets };
}

function block(label: string, modality: SessionBlock['modality'], exercises: PlannedExercise[]): SessionBlock {
  return { label, modality, exercises };
}

describe('auditSessionShape — invariant 1: no undeclared high round count', () => {
  it('flags a single exercise carrying more than the round cap outside any declared multi-round format', () => {
    const blocks = [block('Main', 'cardio', [exercise('run', workSets(9))])];
    const findings = auditSessionShape(blocks, { hasRoutine: false });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'warn', code: 'undeclared_high_round_count', exerciseId: 'run' });
  });

  it('does not flag exactly at the cap', () => {
    const blocks = [block('Main', 'cardio', [exercise('run', workSets(8))])];
    expect(auditSessionShape(blocks, { hasRoutine: false })).toHaveLength(0);
  });

  it('does not flag a deliberately-chosen circuit format', () => {
    // Two stations so invariant 2 (exercise-count floor) isn't also in play —
    // this test is isolating invariant 1 only.
    const blocks = [block('Main', 'cardio', [exercise('run', workSets(9)), exercise('rower', workSets(4))])];
    expect(auditSessionShape(blocks, { hasRoutine: false, cardioIntent: 'circuit' })).toHaveLength(0);
  });

  it('does not flag a deliberately-chosen interval format', () => {
    const blocks = [block('Main', 'cardio', [exercise('run', workSets(9))])];
    expect(auditSessionShape(blocks, { hasRoutine: false, cardioIntent: 'interval' })).toHaveLength(0);
  });

  it('does not flag a routine-selected exercise — the athlete\'s own pick is authoritative', () => {
    const blocks = [block('Main', 'cardio', [exercise('run', workSets(9))])];
    expect(auditSessionShape(blocks, { hasRoutine: true })).toHaveLength(0);
  });

  it('does not count warmup/calibration sets toward the cap', () => {
    const sets: PlannedSet[] = [
      { durationSec: 10, isWarmup: true },
      { durationSec: 10, isWarmup: true },
      ...workSets(8),
    ];
    const blocks = [block('Main', 'cardio', [exercise('run', sets)])];
    expect(auditSessionShape(blocks, { hasRoutine: false })).toHaveLength(0);
  });

  it('also checks strength Main as a defense-in-depth regression pin', () => {
    // Two exercises so invariant 2 isn't also in play here.
    const blocks = [block('Main', 'strength', [exercise('squat', workSets(9)), exercise('bench', workSets(3))])];
    const findings = auditSessionShape(blocks, { hasRoutine: false });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('undeclared_high_round_count');
  });

  it('checks Conditioning the same as Main', () => {
    const blocks = [block('Conditioning', 'cardio', [exercise('bike', workSets(9))])];
    const findings = auditSessionShape(blocks, { hasRoutine: false });
    expect(findings).toHaveLength(1);
    expect(findings[0].blockLabel).toBe('Conditioning');
  });

  it('ignores Warmup/Cool down blocks entirely', () => {
    const blocks = [block('Warmup', 'mobility', [exercise('stretch', workSets(20))])];
    expect(auditSessionShape(blocks, { hasRoutine: false })).toHaveLength(0);
  });
});

describe('auditSessionShape — invariant 2: Main below the exercise floor', () => {
  it('flags a strength Main with only one exercise', () => {
    const blocks = [block('Main', 'strength', [exercise('squat', workSets(3))])];
    const findings = auditSessionShape(blocks, { hasRoutine: false });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'info', code: 'main_block_below_floor' });
  });

  it('does not flag at or above the floor', () => {
    const blocks = [block('Main', 'strength', [exercise('squat', workSets(3)), exercise('bench', workSets(3))])];
    expect(auditSessionShape(blocks, { hasRoutine: false })).toHaveLength(0);
  });

  it('does not flag a routine\'s own composition, however small', () => {
    const blocks = [block('Main', 'strength', [exercise('squat', workSets(3))])];
    expect(auditSessionShape(blocks, { hasRoutine: true })).toHaveLength(0);
  });

  it('does not flag a deliberate single steady-state cardio bout', () => {
    const blocks = [block('Main', 'cardio', [exercise('run', workSets(1))])];
    expect(auditSessionShape(blocks, { hasRoutine: false, cardioIntent: 'basic' })).toHaveLength(0);
  });

  it('does not flag a single-focus interval session (e.g. treadmill/bike sprints)', () => {
    const blocks = [block('Main', 'cardio', [exercise('bike', workSets(8))])];
    expect(auditSessionShape(blocks, { hasRoutine: false, cardioIntent: 'interval' })).toHaveLength(0);
  });

  it('does flag a circuit reduced to a single station — circuit is inherently multi-station', () => {
    const blocks = [block('Main', 'cardio', [exercise('aerobics-1', workSets(4))])];
    const findings = auditSessionShape(blocks, { hasRoutine: false, cardioIntent: 'circuit' });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('main_block_below_floor');
  });

  it('never flags Conditioning for exercise count — it is always exactly one exercise by design', () => {
    const blocks = [block('Conditioning', 'cardio', [exercise('bike', workSets(3))])];
    expect(auditSessionShape(blocks, { hasRoutine: false })).toHaveLength(0);
  });
});

describe('auditSessionShape — pure and read-only', () => {
  it('never mutates the input blocks', () => {
    const blocks = [block('Main', 'cardio', [exercise('run', workSets(9))])];
    const snapshot = JSON.parse(JSON.stringify(blocks));
    auditSessionShape(blocks, { hasRoutine: false });
    expect(blocks).toEqual(snapshot);
  });

  it('returns an empty array for a session with no shape defects', () => {
    const blocks = [
      block('Main', 'strength', [exercise('squat', workSets(3)), exercise('bench', workSets(3))]),
      block('Conditioning', 'cardio', [exercise('bike', workSets(4))]),
    ];
    expect(auditSessionShape(blocks, { hasRoutine: false })).toEqual([]);
  });
});
