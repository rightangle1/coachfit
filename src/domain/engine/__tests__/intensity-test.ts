import {
  LOAD_DEMAND_HI,
  LOAD_DEMAND_LO,
  LOAD_DEMAND_MID,
  MET_HI,
  MET_LO,
  cardioIntensityMultiplier,
  cardioRestRatio,
  cardioWorkRpe,
  defaultLoadDemand,
  intensityMultiplierFor,
  metForExercise,
  resolvedLoadDemand,
  restIntensityFactor,
} from '../intensity';
import { REST } from '../timing';
import type { Exercise } from '../../types';

function ex(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'x',
    name: 'X',
    modality: 'strength',
    movementPattern: 'push',
    primaryAreas: ['chest'],
    equipment: ['barbell', 'bench'],
    progression: 'weight',
    description: '',
    steps: [],
    ...overrides,
  };
}

describe('intensity — defaultLoadDemand', () => {
  it('rates compound higher than isolation for otherwise-equal inputs', () => {
    const compound = defaultLoadDemand(ex({ movementPattern: 'squat', primaryAreas: ['quads'] }));
    const isolation = defaultLoadDemand(ex({ movementPattern: 'pull', primaryAreas: ['biceps'] }));
    expect(compound).toBeGreaterThan(isolation);
  });
  it('increases with more muscle mass recruited, clamped at the ceiling', () => {
    const one = defaultLoadDemand(ex({ movementPattern: 'squat', primaryAreas: ['quads'] }));
    const many = defaultLoadDemand(
      ex({ movementPattern: 'squat', primaryAreas: ['quads', 'glutes', 'hamstrings'], secondaryAreas: ['abs', 'calves'] }),
    );
    expect(many).toBeGreaterThan(one);
    expect(many).toBeLessThanOrEqual(LOAD_DEMAND_HI);
  });
  it('rates a unilateral variant higher than its bilateral equivalent', () => {
    const bilateral = defaultLoadDemand(ex({ movementPattern: 'lunge', primaryAreas: ['quads'] }));
    const unilateral = defaultLoadDemand(ex({ movementPattern: 'lunge', primaryAreas: ['quads'], unilateral: true }));
    expect(unilateral).toBeGreaterThan(bilateral);
  });
  it('always stays within the fixed scale', () => {
    const value = defaultLoadDemand(
      ex({ movementPattern: 'squat', primaryAreas: ['quads', 'glutes', 'hamstrings', 'back'], secondaryAreas: ['abs', 'calves', 'shoulders'], unilateral: true }),
    );
    expect(value).toBeGreaterThanOrEqual(LOAD_DEMAND_LO);
    expect(value).toBeLessThanOrEqual(LOAD_DEMAND_HI);
  });
});

describe('intensity — resolvedLoadDemand', () => {
  it('an explicit override wins over the heuristic', () => {
    const e = ex({ movementPattern: 'pull', primaryAreas: ['biceps'], loadDemand: LOAD_DEMAND_HI });
    expect(resolvedLoadDemand(e)).toBe(LOAD_DEMAND_HI);
  });
  it('falls back to the heuristic when unset', () => {
    const e = ex({ movementPattern: 'squat', primaryAreas: ['quads'] });
    expect(resolvedLoadDemand(e)).toBe(defaultLoadDemand(e));
  });
});

describe('intensity — cardio helpers', () => {
  it('metForExercise honors an explicit metValue over the tier fallback', () => {
    expect(metForExercise({ metValue: 9.5, movementPattern: 'interval' })).toBe(9.5);
  });
  it('metForExercise tier fallback differs by movementPattern', () => {
    const interval = metForExercise({ movementPattern: 'interval' });
    const steady = metForExercise({ movementPattern: 'steady_cardio' });
    expect(interval).toBeGreaterThan(steady);
  });
  it('cardioWorkRpe and cardioRestRatio are monotonic in MET', () => {
    expect(cardioWorkRpe(4)).toBeLessThan(cardioWorkRpe(10));
    expect(cardioRestRatio(4)).toBeLessThan(cardioRestRatio(10));
  });
  it('clamps rather than extrapolates below MET_LO / above MET_HI', () => {
    expect(cardioWorkRpe(0)).toBe(cardioWorkRpe(MET_LO));
    expect(cardioWorkRpe(30)).toBe(cardioWorkRpe(MET_HI));
  });
  it('boundary values land exactly on the documented range', () => {
    expect(cardioWorkRpe(MET_LO)).toBe(5);
    expect(cardioWorkRpe(MET_HI)).toBe(9);
    expect(cardioRestRatio(MET_LO)).toBe(1);
    expect(cardioRestRatio(MET_HI)).toBe(3);
  });
  it('cardioIntensityMultiplier lands in the shared load-demand range', () => {
    expect(cardioIntensityMultiplier(MET_LO)).toBeCloseTo(LOAD_DEMAND_LO);
    expect(cardioIntensityMultiplier(MET_HI)).toBeCloseTo(LOAD_DEMAND_HI);
  });
});

describe('intensity — intensityMultiplierFor', () => {
  it('routes cardio exercises through the MET track', () => {
    const light = ex({ modality: 'cardio', movementPattern: 'steady_cardio', metValue: MET_LO });
    const vigorous = ex({ modality: 'cardio', movementPattern: 'steady_cardio', metValue: MET_HI });
    expect(intensityMultiplierFor(light)).toBeCloseTo(LOAD_DEMAND_LO);
    expect(intensityMultiplierFor(vigorous)).toBeCloseTo(LOAD_DEMAND_HI);
  });
  it('routes strength exercises through the loadDemand track', () => {
    const e = ex({ modality: 'strength', loadDemand: LOAD_DEMAND_HI });
    expect(intensityMultiplierFor(e)).toBe(LOAD_DEMAND_HI);
  });
  it('both tracks always land within [LOAD_DEMAND_LO, LOAD_DEMAND_HI]', () => {
    const cardio = intensityMultiplierFor(ex({ modality: 'cardio', movementPattern: 'interval', metValue: 50 }));
    const strength = intensityMultiplierFor(ex({ modality: 'strength', movementPattern: 'squat' }));
    expect(cardio).toBeGreaterThanOrEqual(LOAD_DEMAND_LO);
    expect(cardio).toBeLessThanOrEqual(LOAD_DEMAND_HI);
    expect(strength).toBeGreaterThanOrEqual(LOAD_DEMAND_LO);
    expect(strength).toBeLessThanOrEqual(LOAD_DEMAND_HI);
  });
});

describe('intensity — restIntensityFactor', () => {
  it('the neutral midpoint reproduces exactly 1.0', () => {
    expect(restIntensityFactor(ex({ loadDemand: LOAD_DEMAND_MID }))).toBeCloseTo(1.0);
  });
  it('is monotonic in loadDemand', () => {
    const low = restIntensityFactor(ex({ loadDemand: LOAD_DEMAND_LO }));
    const high = restIntensityFactor(ex({ loadDemand: LOAD_DEMAND_HI }));
    expect(high).toBeGreaterThan(low);
  });
  it('rest tiers never invert (hypertrophy-at-max stays below heavy-at-min)', () => {
    const hypertrophyAtMax = REST.HYPERTROPHY_COMPOUND * restIntensityFactor(ex({ loadDemand: LOAD_DEMAND_HI }));
    const heavyAtMin = REST.HEAVY_COMPOUND * restIntensityFactor(ex({ loadDemand: LOAD_DEMAND_LO }));
    expect(hypertrophyAtMax).toBeLessThan(heavyAtMin);
  });
});
