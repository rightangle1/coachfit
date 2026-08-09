/**
 * The reduce-motion contract (ADR-0130): when motion is disabled, animations
 * must still land on their target value — they just get there instantly. This
 * is what lets every animated component share one code path instead of
 * branching on the accessibility setting.
 */

import { ease, timing } from '../motion';
import { motion } from '../tokens';

describe('timing()', () => {
  it('uses the requested duration when motion is enabled', () => {
    expect(timing(true, motion.duration.slow).duration).toBe(motion.duration.slow);
  });

  it('collapses duration to zero when motion is disabled', () => {
    for (const duration of Object.values(motion.duration)) {
      expect(timing(false, duration).duration).toBe(0);
    }
  });

  it('still supplies an easing function when motion is disabled, so callers need no branch', () => {
    expect(timing(false, motion.duration.base).easing).toBeDefined();
  });

  it('defaults to the standard easing and honors an explicit token', () => {
    expect(timing(true, motion.duration.base).easing).toBe(ease.standard);
    expect(timing(true, motion.duration.base, 'decelerate').easing).toBe(ease.decelerate);
  });
});

describe('motion tokens', () => {
  it('exposes an easing function for every easing token', () => {
    for (const name of Object.keys(motion.easing) as (keyof typeof motion.easing)[]) {
      expect(ease[name]).toBeDefined();
    }
  });

  it('keeps easings as plain bezier control points so tokens stay runtime-free', () => {
    for (const points of Object.values(motion.easing)) {
      expect(points).toHaveLength(4);
      for (const value of points) expect(typeof value).toBe('number');
    }
  });

  it('orders durations from fastest to slowest', () => {
    const { instant, fast, base, slow, slower } = motion.duration;
    expect(instant).toBeLessThan(fast);
    expect(fast).toBeLessThan(base);
    expect(base).toBeLessThan(slow);
    expect(slow).toBeLessThan(slower);
  });
});
