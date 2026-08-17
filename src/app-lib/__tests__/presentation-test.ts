import { rationaleHighlights } from '../presentation';

describe('rationaleHighlights — trims the "why this today" card to real signal', () => {
  it('drops a bare focus-line rationale entirely — the plan header already says this', () => {
    expect(rationaleHighlights("Today's focus: strength.")).toEqual([]);
    expect(rationaleHighlights("Today's focus: cardio.")).toEqual([]);
    expect(rationaleHighlights("Today's focus: a stretch flow.")).toEqual([]);
  });

  it('also drops the routine lead-in when nothing follows it but the focus line', () => {
    expect(rationaleHighlights('Following your "Push Pull Legs" routine. Today\'s focus: strength.')).toEqual([]);
  });

  it('keeps sentences after the boilerplate opener', () => {
    expect(rationaleHighlights("Today's focus: strength. Working around left knee.")).toEqual(['Working around left knee.']);
    expect(
      rationaleHighlights(
        'Following your "Push Pull Legs" routine. Today\'s focus: strength. Reduced volume today given your readiness.',
      ),
    ).toEqual(['Reduced volume today given your readiness.']);
  });

  it('keeps every sentence when the opener is not pure boilerplate', () => {
    // The "nothing in the catalog matched" fallback is one sentence with real
    // content baked into the same "Today's focus: ..." clause — must not be
    // mistaken for the plain boilerplate opener and stripped away.
    const noMatch = "Today's focus: a stretch flow, but nothing in the catalog matched your equipment — add a yoga mat or adjust today's constraints.";
    expect(rationaleHighlights(noMatch)).toEqual([noMatch]);
  });

  it('keeps multiple trailing notes as separate entries', () => {
    const rationale = "Today's focus: strength. Emphasizing chest. Working around left knee. Reduced volume today given your readiness.";
    expect(rationaleHighlights(rationale)).toEqual([
      'Emphasizing chest.',
      'Working around left knee.',
      'Reduced volume today given your readiness.',
    ]);
  });
});
