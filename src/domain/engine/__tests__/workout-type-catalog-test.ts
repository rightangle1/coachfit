import { EXERCISES } from '../../catalog';
import { exercisesAllowedForWorkoutType } from '../workout-type-catalog';

const dbFrontSquat = EXERCISES.find((e) => e.id === 'sq-db-front')!;
const dbBenchPress = EXERCISES.find((e) => e.id === 'pu-db-bench')!;
const cardioMachine = EXERCISES.find((e) => e.id === 'ca-machine-steady')!;
const staticStretch = EXERCISES.find((e) => e.id === 'mob-lat-stretch')!;
const yogaPose = EXERCISES.find((e) => e.id === 'yg-mountain')!;
const pilatesPose = EXERCISES.find((e) => e.id === 'pl-centering-breath')!;
const bodyweightMove = EXERCISES.find((e) => e.equipment.every((eq) => eq === 'bodyweight' || eq === 'bench'))!;

const ALL = [dbFrontSquat, dbBenchPress, cardioMachine, staticStretch, yogaPose, pilatesPose, bodyweightMove];

describe('exercisesAllowedForWorkoutType — ADR-0137 v2', () => {
  it('bodyweight restricts to no/bench-only equipment', () => {
    const allowed = exercisesAllowedForWorkoutType(ALL, 'bodyweight');
    expect(allowed).toContain(bodyweightMove);
    expect(allowed).not.toContain(dbFrontSquat);
    expect(allowed).not.toContain(dbBenchPress);
  });

  it('cardio restricts to cardio-modality exercises', () => {
    const allowed = exercisesAllowedForWorkoutType(ALL, 'cardio');
    expect(allowed).toEqual([cardioMachine]);
  });

  it('stretch restricts to stretch holds/reps plus yoga poses', () => {
    const allowed = exercisesAllowedForWorkoutType(ALL, 'stretch');
    expect(allowed).toContain(staticStretch);
    expect(allowed).toContain(yogaPose);
    expect(allowed).not.toContain(dbFrontSquat);
    expect(allowed).not.toContain(cardioMachine);
  });

  it('yoga restricts to yoga_flow poses only', () => {
    const allowed = exercisesAllowedForWorkoutType(ALL, 'yoga');
    expect(allowed).toEqual([yogaPose]);
  });

  it('pilates restricts to pilates_flow poses only', () => {
    const allowed = exercisesAllowedForWorkoutType(ALL, 'pilates');
    expect(allowed).toEqual([pilatesPose]);
  });

  it.each(['bodybuilding', 'sculpting', undefined] as const)(
    'workoutType %s leaves the pool unrestricted',
    (workoutType) => {
      expect(exercisesAllowedForWorkoutType(ALL, workoutType)).toEqual(ALL);
    },
  );
});
