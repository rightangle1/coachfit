import { applySupersets } from '../supersets';
import { areAntagonists } from '../muscle-relationships';
import { estimateBlocksSeconds } from '../timing';
import type { Exercise, PlannedExercise, SessionBlock } from '../../types';

function catalogEx(overrides: Partial<Exercise> & { id: string }): Exercise {
  return {
    name: overrides.id,
    modality: 'strength',
    movementPattern: 'push',
    primaryAreas: ['chest'],
    equipment: ['dumbbells'],
    progression: 'weight',
    description: '',
    steps: [],
    ...overrides,
  };
}

function planned(id: string, reps = 10, rpe = 7): PlannedExercise {
  return { exerciseId: id, name: id, primaryAreas: [], sets: [{ reps, targetRpe: rpe }, { reps, targetRpe: rpe }, { reps, targetRpe: rpe }] };
}

const CATALOG: Record<string, Exercise> = {
  bench: catalogEx({ id: 'bench', movementPattern: 'push', primaryAreas: ['chest'], equipment: ['barbell', 'bench'] }),
  row: catalogEx({ id: 'row', movementPattern: 'pull', primaryAreas: ['back'], equipment: ['dumbbells'] }),
  curl: catalogEx({ id: 'curl', movementPattern: 'pull', primaryAreas: ['biceps'], equipment: ['dumbbells'] }),
  pushdown: catalogEx({ id: 'pushdown', movementPattern: 'push', primaryAreas: ['triceps'], equipment: ['cable_machine'] }),
  heavySquat: catalogEx({ id: 'heavySquat', movementPattern: 'squat', primaryAreas: ['quads', 'glutes'], equipment: ['barbell', 'squat_rack'] }),
  legExt: catalogEx({ id: 'legExt', movementPattern: 'squat', primaryAreas: ['quads'], mechanic: 'isolation', equipment: ['cable_machine'] }),
};
const resolve = (id: string) => CATALOG[id];

function block(ids: PlannedExercise[]): SessionBlock {
  return { modality: 'strength', label: 'Main', exercises: ids };
}

describe('muscle-relationships', () => {
  it('recognizes opposing muscles and rejects shared ones', () => {
    expect(areAntagonists(CATALOG.bench, CATALOG.row)).toBe(true); // chest vs back
    expect(areAntagonists(CATALOG.curl, CATALOG.pushdown)).toBe(true); // biceps vs triceps
    expect(areAntagonists(CATALOG.bench, CATALOG.pushdown)).toBe(false); // both push, no opposition of primaries
  });
});

describe('applySupersets — typed, rationale-bearing groups', () => {
  it('forms an antagonist superset for opposing muscles, with a stated reason', () => {
    const b = block([planned('bench'), planned('row')]);
    // bench is a compound but at 10 reps @ RPE7 it is not "heavy" → groupable.
    applySupersets(b, { groupSize: 2, allowTimeSaver: false, resolve });
    const grouped = b.exercises.filter((e) => e.group);
    expect(grouped.length).toBe(2);
    expect(grouped[0].group?.type).toBe('antagonist');
    expect(grouped[0].group?.rationale).toMatch(/chest|back/);
    expect(grouped[0].rotationGroup).toBe(grouped[1].rotationGroup);
  });

  it('never groups a heavy low-rep main compound — it stays straight', () => {
    const b = block([planned('heavySquat', 4, 8), planned('row')]);
    applySupersets(b, { groupSize: 2, allowTimeSaver: true, resolve });
    const squat = b.exercises.find((e) => e.exerciseId === 'heavySquat');
    expect(squat?.group).toBeUndefined();
    expect(squat?.rotationGroup).toBeUndefined();
  });

  it('forms a post-exhaust pair for a same-muscle compound + isolation', () => {
    const b = block([planned('heavySquat', 10, 7), planned('legExt')]); // squat non-heavy here
    applySupersets(b, { groupSize: 2, allowTimeSaver: false, resolve });
    const grouped = b.exercises.filter((e) => e.group);
    expect(grouped.length).toBe(2);
    expect(grouped.map((e) => e.group?.type)).toContain('post_exhaust');
  });

  it('only pairs unrelated muscles as a time-saver when explicitly allowed', () => {
    const b1 = block([planned('bench'), planned('curl')]); // chest vs biceps: not antagonist, no shared muscle
    applySupersets(b1, { groupSize: 2, allowTimeSaver: false, resolve });
    expect(b1.exercises.every((e) => !e.group)).toBe(true);

    const b2 = block([planned('bench'), planned('curl')]);
    applySupersets(b2, { groupSize: 2, allowTimeSaver: true, resolve });
    expect(b2.exercises.filter((e) => e.group).length).toBe(2);
    expect(b2.exercises.find((e) => e.group)?.group?.type).toBe('time_saver');
  });

  it('equalizes round count when paired exercises have different set counts, trimming to the shorter one', () => {
    const bench = planned('bench'); // 3 sets
    const row: PlannedExercise = { ...planned('row'), sets: [{ reps: 10, targetRpe: 7 }, { reps: 10, targetRpe: 7 }] }; // 2 sets
    const b = block([bench, row]);
    applySupersets(b, { groupSize: 2, allowTimeSaver: false, resolve });
    const grouped = b.exercises.filter((e) => e.group);
    expect(grouped.length).toBe(2);
    // Trims to the shorter prescription rather than extending it — a shorter
    // count may be a safety de-load, and volume must never be increased to
    // force a match (see the rules-engine severe-fatigue superset test).
    expect(grouped.every((e) => e.sets.length === 2)).toBe(true);
  });

  it('a supersetted block estimates shorter than the same work run straight', () => {
    const straight = block([planned('bench'), planned('row')]);
    const superB = block([planned('bench'), planned('row')]);
    applySupersets(superB, { groupSize: 2, allowTimeSaver: false, resolve });
    const straightSec = estimateBlocksSeconds([straight], resolve);
    const superSec = estimateBlocksSeconds([superB], resolve);
    expect(superSec).toBeLessThan(straightSec);
  });
});
