import { defaultAutoAdvance, normalizeCardioIntent } from '../session';

describe('defaultAutoAdvance — ADR-0405/ADR-0406/ADR-0407', () => {
  it('defaults every stage-ordered flow style to touchless, including pilates', () => {
    expect(defaultAutoAdvance('yoga')).toBe(true);
    expect(defaultAutoAdvance('stretch')).toBe(true);
    expect(defaultAutoAdvance('barre')).toBe(true);
    expect(defaultAutoAdvance('pilates')).toBe(true);
  });

  it('defaults cardio to touchless regardless of cardio intent', () => {
    expect(defaultAutoAdvance('cardio', 'basic')).toBe(true);
    expect(defaultAutoAdvance('cardio', 'interval')).toBe(true);
    expect(defaultAutoAdvance('cardio', 'circuit')).toBe(true);
  });

  it('defaults every strength style, and unset, to manual — nothing to sequence', () => {
    expect(defaultAutoAdvance('bodybuilding')).toBe(false);
    expect(defaultAutoAdvance('sculpting')).toBe(false);
    expect(defaultAutoAdvance('bodyweight')).toBe(false);
    expect(defaultAutoAdvance(undefined)).toBe(false);
  });
});

describe('normalizeCardioIntent — ADR-0141', () => {
  it('passes current values through unchanged', () => {
    expect(normalizeCardioIntent('basic')).toBe('basic');
    expect(normalizeCardioIntent('circuit')).toBe('circuit');
    expect(normalizeCardioIntent('interval')).toBe('interval');
  });

  it('maps stale pre-ADR-0141 values to their new equivalents', () => {
    expect(normalizeCardioIntent('base')).toBe('basic');
    expect(normalizeCardioIntent('benchmark')).toBe('basic');
    expect(normalizeCardioIntent('aerobics')).toBe('circuit');
    expect(normalizeCardioIntent('intervals')).toBe('interval');
  });

  it('falls back to the safest, most conservative structure for anything unrecognized', () => {
    expect(normalizeCardioIntent(undefined)).toBe('basic');
    expect(normalizeCardioIntent('garbage')).toBe('basic');
  });
});
