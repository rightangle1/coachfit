import type { SessionContext, SessionRecord } from '../../types';
import { buildWeeklyProgram } from '../weekly-program';

const NOW = Date.UTC(2026, 7, 5, 12);
const base: SessionContext = {
  athlete: { id: 'a', experience: 'intermediate', goals: { weights: { strength: 0.7, cardio: 0.1, mobility: 0.1, general: 0.1 } }, constraints: [], createdAt: NOW, updatedAt: NOW },
  equipment: { items: [{ type: 'bodyweight' }, { type: 'dumbbells' }] },
  history: [], fatigue: { byGroup: {}, updatedAt: NOW }, readiness: {},
  goals: { weights: { strength: 0.7, cardio: 0.1, mobility: 0.1, general: 0.1 }, weeklyTargets: { strength: 2, cardio: 1 } },
  targeting: { emphasize: [{ group: 'chest' }], avoid: [] }, avoidToday: { flags: [] }, plannedFor: NOW,
};

describe('lightweight weekly program layer', () => {
  it('allocates modalities, movement slots, priorities, anchors, and set ranges', () => {
    const program = buildWeeklyProgram(base);
    expect(program.expectedSessions).toBe(3);
    expect(program.sessions.map((session) => session.modality)).toEqual(['strength', 'strength', 'cardio']);
    expect(program.sessions[0].movementSlots.length).toBeGreaterThan(0);
    expect(program.sessions[0].priorityMuscles).toContain('chest');
    expect(program.sessions[0].targetSetRange).toEqual({ min: 3, max: 4 });
    expect(program.blockWeeks).toBe(6);
  });

  it('advances today’s intent after a completed session without cramming missed volume', () => {
    const completed: SessionRecord = {
      id: 'done', planId: 'p', plannedFor: NOW - 1000, completedAt: NOW - 1000,
      performed: [],
    };
    const program = buildWeeklyProgram({ ...base, history: [completed] });
    expect(program.today.index).toBe(1);
    expect(program.today.targetSetRange).toEqual(program.sessions[1].targetSetRange);
  });
});
