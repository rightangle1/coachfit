import { palettes, type ContextTone } from '../tokens';
import { toneForWorkoutType } from '../context-tone';

const CONTEXT_TONES: ContextTone[] = ['primary', 'strength', 'endurance', 'mobility', 'accent'];

describe('contextual tone tokens', () => {
  it('supplies a complete, readable tone vocabulary in every color scheme', () => {
    for (const palette of Object.values(palettes)) {
      for (const tone of CONTEXT_TONES) {
        const value = palette.tones[tone];
        expect(value.surface).toMatch(/^#/);
        expect(value.border).toMatch(/^#/);
        expect(value.text).toMatch(/^#/);
        expect(value.solid).toMatch(/^#/);
        expect(value.text).not.toBe(value.surface);
      }
    }
  });

  it('keeps strength emphasis distinct from danger feedback', () => {
    for (const palette of Object.values(palettes)) {
      expect(palette.tones.strength.solid).not.toBe(palette.danger);
      expect(palette.tones.strength.surface).not.toBe(palette.dangerSoft);
    }
  });
});

describe('toneForWorkoutType — ADR-0407 (derived from familyOfWorkoutType)', () => {
  it('resolves cardio to the endurance tone', () => {
    expect(toneForWorkoutType('cardio')).toBe('endurance');
  });

  it('resolves every mobility-family style to the mobility tone, including pilates', () => {
    expect(toneForWorkoutType('stretch')).toBe('mobility');
    expect(toneForWorkoutType('yoga')).toBe('mobility');
    expect(toneForWorkoutType('barre')).toBe('mobility');
    expect(toneForWorkoutType('pilates')).toBe('mobility');
  });

  it('resolves every strength-family style to the strength tone', () => {
    expect(toneForWorkoutType('bodybuilding')).toBe('strength');
    expect(toneForWorkoutType('sculpting')).toBe('strength');
    expect(toneForWorkoutType('bodyweight')).toBe('strength');
  });

  it('resolves Balanced (unset) to the strength tone — a deliberate change from the old dedicated "primary" tone (ADR-0407)', () => {
    expect(toneForWorkoutType(undefined)).toBe('strength');
  });
});
