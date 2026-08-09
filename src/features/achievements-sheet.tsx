/**
 * Achievements — the trophy case (gamification plan). Scalar-tier families
 * (streaks, sessions, tonnage, cardio minutes) show every unlocked tier plus
 * the next locked one with progress; keyed families (workout styles,
 * muscle-group PRs) show one badge per key; open-ended families (exercise
 * PRs, cardio PRs, comebacks) list as a reverse-chronological feed, since an
 * unbounded per-exercise stream has no sensible "locked" placeholder.
 */

import { useMemo } from 'react';
import { View } from 'react-native';

import { AchievementBadge, Card, Row, SheetModal, Text, useTheme } from '@/design';
import { getAthleteProfile } from '@/services/athlete';
import { listHistory } from '@/services/sessions';
import { evaluateAchievements, WORKOUT_STYLE_KEYS, WORKOUT_STYLE_LABELS } from '@/domain/metrics';
import type { Achievement, AchievementFamily, LockedAchievement } from '@/domain/metrics';
import { ALL_MUSCLE_GROUPS } from '@/domain/types';
import type { WeightUnit } from '@/domain/types';
import { MUSCLE_GROUP_LABELS } from '@/app-lib/options';
import { formatWeight } from '@/app-lib/units';

function relativeDate(ms: number): string {
  const days = Math.round((Date.now() - ms) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** Scalar-tier ids are `${family}-${tier}` (e.g. `endurance-minutes-600`) —
 * grab the trailing number regardless of how many hyphens precede it. */
function tierValue(id: string): number {
  const match = id.match(/-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function tierForRank(rank: number, total: number): 'bronze' | 'silver' | 'gold' {
  if (total <= 1 || rank === total - 1) return 'gold';
  if (rank === 0) return 'bronze';
  return 'silver';
}

function achievementSubtitle(a: Achievement, weightUnit: WeightUnit): string {
  if (a.e1rmKg != null) return `${a.description} ${formatWeight(a.e1rmKg, weightUnit)}.`;
  if (a.minutes != null) return `${a.description} ${a.minutes} min.`;
  return a.description;
}

const SCALAR_SECTIONS: { family: AchievementFamily; title: string; caption: string }[] = [
  { family: 'streak', title: 'Consistency streaks', caption: 'Consecutive training days.' },
  { family: 'sessions', title: 'Session milestones', caption: 'Total completed workouts.' },
  { family: 'tonnage', title: 'Lifetime tonnage', caption: 'Total weight lifted, all-time.' },
  { family: 'endurance-minutes', title: 'Cardio minutes', caption: 'Total cardio time logged, all-time.' },
];

function ScalarTierSection({
  title,
  caption,
  unlocked,
  locked,
}: {
  title: string;
  caption: string;
  unlocked: Achievement[];
  locked?: LockedAchievement;
}) {
  const { spacing } = useTheme();
  if (unlocked.length === 0 && !locked) return null;
  const sorted = [...unlocked].sort((a, b) => tierValue(a.id) - tierValue(b.id));
  return (
    <Card>
      <Text variant="heading">{title}</Text>
      <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
        {caption}
      </Text>
      <Row gap="sm" wrap style={{ marginTop: spacing.md }}>
        {sorted.map((a, i) => (
          <AchievementBadge
            key={a.id}
            id={a.id}
            title={a.title}
            subtitle={relativeDate(a.achievedAt)}
            locked={false}
            tier={tierForRank(i, sorted.length)}
          />
        ))}
        {locked ? (
          <AchievementBadge id={locked.id} title={locked.title} subtitle={locked.hint} locked progress={locked.progress} />
        ) : null}
      </Row>
    </Card>
  );
}

function KeyedSection({
  title,
  caption,
  items,
}: {
  title: string;
  caption: string;
  items: { key: string; title: string; subtitle: string; locked: boolean }[];
}) {
  const { spacing } = useTheme();
  if (items.length === 0) return null;
  return (
    <Card>
      <Text variant="heading">{title}</Text>
      <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
        {caption}
      </Text>
      <Row gap="sm" wrap style={{ marginTop: spacing.md }}>
        {items.map((item) => (
          <AchievementBadge key={item.key} id={item.key} title={item.title} subtitle={item.subtitle} locked={item.locked} />
        ))}
      </Row>
    </Card>
  );
}

export function AchievementsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { spacing } = useTheme();
  const athlete = useMemo(() => getAthleteProfile(), []);
  const weightUnit: WeightUnit = athlete?.weightUnit ?? 'kg';
  const history = useMemo(() => listHistory(500), []);
  const { unlocked, locked } = useMemo(() => evaluateAchievements(history), [history]);

  const byFamily = (family: AchievementFamily) => unlocked.filter((a) => a.family === family);
  const nextLocked = (family: AchievementFamily) => locked.find((l) => l.family === family);

  const workoutStyleItems = WORKOUT_STYLE_KEYS.map((key) => {
    const id = `workout-style-${key}`;
    const u = unlocked.find((a) => a.id === id);
    const l = locked.find((x) => x.id === id);
    return {
      key,
      title: `${WORKOUT_STYLE_LABELS[key]} explorer`,
      subtitle: u ? relativeDate(u.achievedAt) : (l?.hint ?? ''),
      locked: !u,
    };
  });

  const musclePrItems = ALL_MUSCLE_GROUPS.map((group) => {
    const id = `muscle-pr-${group}`;
    const u = unlocked.find((a) => a.id === id);
    const l = locked.find((x) => x.id === id);
    return {
      key: group,
      title: `${MUSCLE_GROUP_LABELS[group]} PR`,
      // The value lifted is the point of a PR badge, not just that one exists
      // (the first one will always unlock within days of starting) — show it.
      subtitle: u && u.e1rmKg != null ? `${formatWeight(u.e1rmKg, weightUnit)} · ${relativeDate(u.achievedAt)}` : (l?.hint ?? ''),
      locked: !u,
    };
  });

  const dynamicList = [...byFamily('exercise-pr'), ...byFamily('cardio-pr'), ...byFamily('comeback')].sort(
    (a, b) => b.achievedAt - a.achievedAt,
  );

  return (
    <SheetModal visible={visible} onClose={onClose} eyebrow="YOUR TRAINING" title="Achievements" closeLabel="Close achievements">
      <Card tone="primarySoft">
        <Text variant="title">{unlocked.length}</Text>
        <Text variant="label" color="primaryTextSoft" weight="semibold">
          unlocked so far
        </Text>
      </Card>

      {SCALAR_SECTIONS.map((section) => (
        <ScalarTierSection
          key={section.family}
          title={section.title}
          caption={section.caption}
          unlocked={byFamily(section.family)}
          locked={nextLocked(section.family)}
        />
      ))}

      <KeyedSection title="Workout styles" caption="Try every kind of session." items={workoutStyleItems} />
      <KeyedSection
        title="Muscle-group PRs"
        caption="Set a new estimated 1RM touching each group."
        items={musclePrItems}
      />

      <Card>
        <Text variant="heading">Personal records</Text>
        <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
          Exercise PRs, cardio PRs, and comebacks after time away.
        </Text>
        {dynamicList.length === 0 ? (
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.md }}>
            Your personal records will appear here as you train.
          </Text>
        ) : (
          <View style={{ marginTop: spacing.md, gap: spacing.md }}>
            {dynamicList.map((a) => (
              <Row key={a.id} style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text variant="body" weight="semibold">
                    {a.title}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {achievementSubtitle(a, weightUnit)}
                  </Text>
                </View>
                <Text variant="caption" color="textFaint">
                  {relativeDate(a.achievedAt)}
                </Text>
              </Row>
            ))}
          </View>
        )}
      </Card>
    </SheetModal>
  );
}
