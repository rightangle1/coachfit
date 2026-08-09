import type { AvoidanceFlag, SessionRecord } from '../../types';
import { DEBRIEF_FEEDBACK, debriefFeedback } from '../debrief-feedback';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

function sessionWithIssues(daysAgo: number, issues: AvoidanceFlag[], id = `s-${daysAgo}`): SessionRecord {
  const at = NOW - daysAgo * DAY;
  return {
    id,
    planId: 'p',
    plannedFor: at,
    completedAt: at,
    performed: [],
    debrief: { overallRpe: 7, issues },
  };
}

const knee = { group: 'quads' as const };
const shoulder = { group: 'shoulders' as const };

describe('debriefFeedback — closing the loop CLAUDE.md §8.5 promised', () => {
  it('returns nothing when no debrief reported an issue', () => {
    const out = debriefFeedback([sessionWithIssues(1, [])], NOW);
    expect(out.hardSafety).toEqual([]);
    expect(out.limit).toEqual([]);
  });

  it('turns a recently reported issue into a de-load for that area', () => {
    const out = debriefFeedback([sessionWithIssues(1, [{ area: knee, severity: 'mild' }])], NOW);
    expect(out.limit).toEqual([knee]);
    expect(out.hardSafety).toEqual([]);
  });

  it('treats a fresh severe issue as hard avoidance', () => {
    const out = debriefFeedback([sessionWithIssues(1, [{ area: knee, severity: 'severe' }])], NOW);
    expect(out.hardSafety).toEqual([knee]);
  });

  it('softens a severe issue to a de-load once it is no longer fresh', () => {
    const out = debriefFeedback(
      [sessionWithIssues(DEBRIEF_FEEDBACK.SEVERE_HARD_DAYS + 1, [{ area: knee, severity: 'severe' }])],
      NOW,
    );
    expect(out.hardSafety).toEqual([]);
    expect(out.limit).toEqual([knee]);
  });

  it('forgets an issue entirely once it stops being recent', () => {
    const out = debriefFeedback(
      [sessionWithIssues(DEBRIEF_FEEDBACK.LIMIT_DAYS + 1, [{ area: knee, severity: 'severe' }])],
      NOW,
    );
    expect(out.hardSafety).toEqual([]);
    expect(out.limit).toEqual([]);
  });

  it('does not report the same area twice when it came up repeatedly', () => {
    const out = debriefFeedback(
      [
        sessionWithIssues(1, [{ area: knee, severity: 'mild' }], 'a'),
        sessionWithIssues(3, [{ area: knee, severity: 'mild' }], 'b'),
      ],
      NOW,
    );
    expect(out.limit).toEqual([knee]);
  });

  it('keeps distinct areas separate', () => {
    const out = debriefFeedback(
      [sessionWithIssues(1, [{ area: knee, severity: 'mild' }, { area: shoulder, severity: 'mild' }])],
      NOW,
    );
    expect(out.limit).toHaveLength(2);
  });

  it('ignores sessions dated in the future', () => {
    const out = debriefFeedback([sessionWithIssues(-2, [{ area: knee, severity: 'severe' }])], NOW);
    expect(out.hardSafety).toEqual([]);
    expect(out.limit).toEqual([]);
  });
});
