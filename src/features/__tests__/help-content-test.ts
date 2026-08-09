import { HELP_TOPICS, TOUR_TOPIC_IDS, helpTopic } from '../help-content';

describe('Help content', () => {
  it('keeps every first-run tour topic available from Help', () => {
    expect(TOUR_TOPIC_IDS).toEqual(['plan', 'reorder', 'supersets', 'catalog', 'equipment']);
    expect(TOUR_TOPIC_IDS.map(helpTopic)).toEqual(
      expect.arrayContaining(TOUR_TOPIC_IDS.map((id) => expect.objectContaining({ id }))),
    );
  });

  it('includes metric guidance and usable destinations for every actionable topic', () => {
    expect(helpTopic('metrics')).toEqual(expect.objectContaining({ title: 'How your metrics work' }));
    expect(HELP_TOPICS.filter((topic) => topic.id !== 'metrics').every((topic) => topic.action != null)).toBe(true);
  });
});
