// This suite reads the engine's own source, so it needs Node's fs/path. The
// project has no @types/node (nothing else in src/ touches the filesystem), so
// the tiny surface used here is declared locally rather than pulling in a
// dependency for one test.
declare const __dirname: string;
declare function require(id: string): unknown;

const { readdirSync, readFileSync, statSync } = require('fs') as {
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: string) => string;
  statSync: (path: string) => { isDirectory: () => boolean };
};
const { join } = require('path') as { join: (...parts: string[]) => string };

/**
 * ADR-0127 draws a hard line: `sex` and `heightCm` exist for the calorie model
 * and nothing else. That boundary is a decision, not a coincidence — the engine
 * measures the individual directly through logged loads and RPE, and the
 * strength metric is self-relative, so layering a population-level prior on top
 * would make programming worse rather than better.
 *
 * A comment saying so would erode in a month. This enforces it.
 */
function engineSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      out.push(...engineSourceFiles(full));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

describe('ADR-0127 — demographics stay out of programming', () => {
  const engineDir = join(__dirname, '..');
  const files = engineSourceFiles(engineDir);

  it('finds the engine sources it is meant to be guarding', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(['sex', 'heightCm'])('never reads athlete.%s anywhere under domain/engine', (field) => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      // Match the profile field specifically, not unrelated words.
      return new RegExp(`\\.${field}\\b|\\b${field}\\s*[?:]`).test(source);
    });
    expect(offenders.map((f) => f.replace(engineDir, ''))).toEqual([]);
  });

  it('does read birthYear — that one IS a programming input', () => {
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(source).toMatch(/ageYearsOf|ageRecoveryFactor/);
  });
});
