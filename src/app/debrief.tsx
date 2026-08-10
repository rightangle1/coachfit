/**
 * Debrief — how did it go, what should change next time. Feeds
 * `interpretDebrief` (engine) and persists onto the finished SessionRecord.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, CelebrationBurst, Chip, CountUp, Divider, Meter, Row, Screen, Stepper, Text, TextField, useTheme } from '@/design';
import { useWorkoutStore } from '@/state/workout-store';
import { interpretDebrief } from '@/services/programming';
import { checkStreakMilestone, refreshReminders } from '@/services/reminders';
import { listHistory, saveSessionRecord } from '@/services/sessions';
import { getAthleteProfile } from '@/services/athlete';
import { currentStreakDays, evaluateAchievements } from '@/domain/metrics';
import type { Achievement, LockedAchievement } from '@/domain/metrics';
import type { AvoidanceFlag, WeightUnit } from '@/domain/types';
import { CONCERN_OPTIONS, MUSCLE_GROUP_LABELS, areaKey } from '@/app-lib/options';
import { workoutSummary } from '@/app-lib/presentation';
import { formatWeight } from '@/app-lib/units';

function achievementSubtitle(a: Achievement, weightUnit: WeightUnit): string {
  if (a.e1rmKg != null) return `${a.description} ${formatWeight(a.e1rmKg, weightUnit)}.`;
  if (a.minutes != null) return `${a.description} ${a.minutes} min.`;
  return a.description;
}

function nextMilestone(locked: LockedAchievement[]): LockedAchievement | undefined {
  const priority = ['sessions', 'streak', 'tonnage', 'endurance-minutes'] as const;
  for (const family of priority) {
    const achievement = locked.find((item) => item.family === family && item.progress);
    if (achievement) return achievement;
  }
  return locked.find((item) => item.progress);
}

export default function DebriefScreen() {
  const { colors, radii, spacing } = useTheme();
  const router = useRouter();

  const plan = useWorkoutStore((s) => s.plan);
  const record = useWorkoutStore((s) => s.record);
  const clear = useWorkoutStore((s) => s.clear);
  const preSessionAchievementIds = useWorkoutStore((s) => s.preSessionAchievementIds);
  const liveCelebratedIds = useWorkoutStore((s) => s.liveCelebratedIds);

  const [overallRpe, setOverallRpe] = useState(7);
  const [maxEffort, setMaxEffort] = useState<boolean | undefined>(undefined);
  const [enjoyment, setEnjoyment] = useState<number | undefined>();
  const [wouldDoAgain, setWouldDoAgain] = useState<boolean | undefined>();
  const [issues, setIssues] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [showEffortDetails, setShowEffortDetails] = useState(false);
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const weightUnit: WeightUnit = useMemo(() => getAthleteProfile()?.weightUnit ?? 'kg', []);

  useEffect(() => {
    if (!plan || !record) router.replace('/');
  }, [plan, record, router]);

  // finish()/endEarly() already persisted this session with completedAt set
  // (workout.tsx calls them before navigating here), so `listHistory` already
  // includes it — the "before" side of the diff is the snapshot taken at
  // workout start (`preSessionAchievementIds`), not a second history read.
  const history = listHistory(500);
  const achievementStatus = evaluateAchievements(history);
  const newlyUnlocked = achievementStatus.unlocked.filter((a) => !preSessionAchievementIds.has(a.id));
  const toCelebrateBig = newlyUnlocked.filter((a) => {
    if (liveCelebratedIds.has(a.id)) return false;
    // Live PRs are known before `completedAt` exists, while achievement ids
    // include that timestamp. Suppress the debrief repeat by exercise id.
    const exerciseId = a.family === 'exercise-pr' ? a.id.replace(/^pr-/, '').replace(/-\d+$/, '') : undefined;
    return !exerciseId || !liveCelebratedIds.has(`exercise-pr:${exerciseId}`);
  });
  const [showBigBurst, setShowBigBurst] = useState(() => toCelebrateBig.length > 0);

  if (!plan || !record) return null;

  const summary = workoutSummary(record);
  const durationMin = record.startedAt != null && record.completedAt != null && record.completedAt > record.startedAt
    ? Math.round((record.completedAt - record.startedAt - (record.pausedDurationMs ?? 0)) / 60_000)
    : undefined;
  const streak = currentStreakDays(history, record.completedAt ?? record.plannedFor);
  const milestone = nextMilestone(achievementStatus.locked);
  const effortChoice = overallRpe <= 5 ? 'easy' : overallRpe <= 7 ? 'on-target' : 'hard';

  function setEffort(rpe: number) {
    setOverallRpe(rpe);
    if (rpe < 8) setMaxEffort(undefined);
  }

  function toggleIssue(key: string) {
    setIssues((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function onSubmit() {
    if (!plan || !record) return;
    const flags: AvoidanceFlag[] = CONCERN_OPTIONS.filter((c) =>
      issues.has(areaKey(c.area)),
    ).map((c) => ({ area: c.area, severity: 'mild' }));

    const debriefInput = {
      overallRpe,
      maxEffort,
      enjoyment,
      wouldDoAgain,
      issues: flags,
      note: note.trim() || undefined,
    };

    await interpretDebrief(plan, debriefInput);
    saveSessionRecord({ ...record, debrief: debriefInput });
    void refreshReminders();
    void checkStreakMilestone(newlyUnlocked);
    onDone();
  }

  function onDone() {
    clear();
    router.replace('/');
  }

  const completedSets = record.performed.reduce(
    (total, exercise) => total + exercise.sets.filter((set) => set.completed).length,
    0,
  );
  const completedExercises = record.performed.filter((exercise) => exercise.sets.some((set) => set.completed)).length;

  return (
    <Screen>
      <View style={{ position: 'relative', gap: spacing.xs }}>
        <CelebrationBurst
          visible={showBigBurst}
          label={toCelebrateBig[0]?.title ?? 'Milestone'}
          sublabel={toCelebrateBig.length > 1 ? `+${toCelebrateBig.length - 1} more` : undefined}
          tone="gold"
          kind={toCelebrateBig[0]?.family === 'exercise-pr' ? 'pr' : 'achievement'}
          onDismiss={() => setShowBigBurst(false)}
        />
        <Text variant="caption" color="textMuted">WORKOUT COMPLETE</Text>
        <Text variant="display">Nice work</Text>
        <Text variant="body" color="textMuted">
          {record.endedEarly
            ? `You logged ${completedSets} ${completedSets === 1 ? 'set' : 'sets'} across ${completedExercises} ${completedExercises === 1 ? 'exercise' : 'exercises'}.`
            : `You completed ${completedSets} ${completedSets === 1 ? 'set' : 'sets'} across ${completedExercises} ${completedExercises === 1 ? 'exercise' : 'exercises'}.`}
        </Text>
      </View>

      <Card tone="primarySoft">
        <Row gap="md" style={{ alignItems: 'center' }}>
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary,
            }}
          >
            {/* The set count is the payoff of the session just finished, so it
                counts up rather than simply appearing (ADR-0130). */}
            <CountUp value={completedSets} variant="title" color="primaryText" />
            <Text variant="caption" color="primaryText">SETS</Text>
          </View>
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Text variant="heading">Session recap</Text>
            <Row gap="sm">
              {durationMin != null && (
                <View style={{ flex: 1, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surface }}>
                  <Text variant="label" weight="bold">{durationMin} min</Text>
                  <Text variant="caption" color="textMuted">Elapsed</Text>
                </View>
              )}
              <View style={{ flex: 1, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surface }}>
                <Text variant="label" weight="bold">{completedExercises}</Text>
                <Text variant="caption" color="textMuted">Exercises</Text>
              </View>
            </Row>
          </View>
        </Row>
        {(summary.volumeLoad > 0 || summary.groups.length > 0 || streak > 0) && (
          <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
            {summary.volumeLoad > 0 && (
              <Text variant="label" color="primaryTextSoft" weight="semibold">
                {formatWeight(summary.volumeLoad, weightUnit)} moved
              </Text>
            )}
            {summary.groups.length > 0 && (
              <Text variant="caption" color="textMuted">
                Trained {summary.groups.slice(0, 3).map((group) => MUSCLE_GROUP_LABELS[group]).join(' · ')}
                {summary.groups.length > 3 ? ` +${summary.groups.length - 3} more` : ''}
              </Text>
            )}
            {streak > 0 && (
              <Text variant="caption" color="primaryTextSoft" weight="semibold">
                {streak}-day training streak
              </Text>
            )}
          </View>
        )}
      </Card>

      {newlyUnlocked.length === 0 && milestone?.progress && (
        <Card tone="surfaceAlt">
          <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text variant="heading">Next milestone</Text>
            <Text variant="label" color="primaryTextSoft">{milestone.title}</Text>
          </Row>
          <Text variant="caption" color="textMuted" style={{ marginTop: spacing.xs }}>
            {milestone.hint}
          </Text>
          <Meter value={milestone.progress.current} max={milestone.progress.target} style={{ marginTop: spacing.sm }} />
        </Card>
      )}

      {newlyUnlocked.length > 0 && (
        <Card tone="primarySoft">
          <Text variant="heading">New achievements</Text>
          <View style={{ marginTop: spacing.md }}>
            {newlyUnlocked.map((a, i) => (
              <View key={a.id}>
                {i > 0 && <Divider style={{ marginVertical: spacing.md }} />}
                <Text variant="body" weight="semibold">{a.title}</Text>
                <Text variant="caption" color="primaryTextSoft">{achievementSubtitle(a, weightUnit)}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      <Card>
        <Text variant="heading">How did it feel?</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
          One quick check-in helps shape your next session.
        </Text>
        <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
          {([
            ['easy', 'Easy', 5],
            ['on-target', 'On target', 7],
            ['hard', 'Hard', 9],
          ] as const).map(([value, label, rpe]) => (
            <Chip
              key={value}
              label={label}
              selected={effortChoice === value}
              onPress={() => setEffort(rpe)}
            />
          ))}
        </Row>
        <Button
          title={showEffortDetails ? `Done adjusting (${overallRpe}/10)` : `Fine-tune effort (${overallRpe}/10)`}
          variant="quiet"
          size="sm"
          onPress={() => setShowEffortDetails((shown) => !shown)}
          style={{ alignSelf: 'flex-start', marginTop: spacing.xs }}
        />
        {showEffortDetails && (
          <View style={{ marginTop: spacing.sm }}>
            <Text variant="caption" color="textFaint">EFFORT · RPE</Text>
            <Stepper value={overallRpe} onChange={setEffort} min={1} max={10} style={{ marginTop: spacing.sm, maxWidth: 260 }} />
          </View>
        )}
        {effortChoice === 'hard' && (
          <View style={{ marginTop: spacing.md }}>
            <Text variant="caption" color="textFaint">WAS THIS MAX EFFORT?</Text>
            <Row gap="sm" style={{ marginTop: spacing.sm }}>
              <Chip label="Yes" selected={maxEffort === true} onPress={() => setMaxEffort(true)} />
              <Chip label="No" selected={maxEffort === false} onPress={() => setMaxEffort(false)} />
            </Row>
          </View>
        )}
      </Card>

      <Card>
        <Text variant="heading">Did this session work for you?</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
          Preference helps choose between equally safe, equally useful options.
        </Text>
        <Row gap="sm" wrap style={{ marginTop: spacing.md }}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Chip key={value} label={`${value}/5`} selected={enjoyment === value} onPress={() => setEnjoyment(value)} />
          ))}
        </Row>
        <Row gap="sm" style={{ marginTop: spacing.md }}>
          <Chip label="Would do again" selected={wouldDoAgain === true} onPress={() => setWouldDoAgain(true)} />
          <Chip label="Prefer another option" selected={wouldDoAgain === false} onPress={() => setWouldDoAgain(false)} />
        </Row>
      </Card>

      <Button
        title={showOptionalDetails ? 'Hide optional details' : 'Add optional details'}
        variant="quiet"
        size="sm"
        onPress={() => setShowOptionalDetails((shown) => !shown)}
      />

      {showOptionalDetails && <>
      <Card>
        <Text variant="heading">Any areas to take care with?</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
          We&apos;ll factor these into your next workout.
        </Text>
        <Row gap="sm" wrap style={{ marginTop: spacing.md }}>
          {CONCERN_OPTIONS.map((c) => {
            const key = areaKey(c.area);
            return (
              <Chip
                key={key}
                label={c.label}
                selected={issues.has(key)}
                onPress={() => toggleIssue(key)}
              />
            );
          })}
        </Row>
      </Card>

      <Card>
        <Text variant="heading">Questions or notes (optional)</Text>
        <TextField
          value={note}
          onChangeText={setNote}
          placeholder="Anything to remember or ask your coach?"
          style={{ marginTop: spacing.md }}
        />
      </Card>
      </>}

      <Button title="Save and finish" onPress={onSubmit} fullWidth />
    </Screen>
  );
}
