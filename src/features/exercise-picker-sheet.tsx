/** A shared exercise picker for adding and replacing exercises in a workout. */

import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button, Chip, Row, SheetModal, Text, useTheme } from '@/design';
import { MUSCLE_GROUP_LABELS } from '@/app-lib/options';
import { ALL_MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '@/domain/types';
import { intensityLabel } from '@/features/exercise-detail';

type SortMode = 'best' | 'mostLogged' | 'leastLogged' | 'neverLogged';

const SORT_OPTIONS: { mode: SortMode; label: string; heading: string }[] = [
  { mode: 'best', label: 'Best Replacements', heading: 'BEST REPLACEMENTS' },
  { mode: 'mostLogged', label: 'Your Most Logged', heading: 'YOUR MOST LOGGED' },
  { mode: 'leastLogged', label: 'Your Least Logged', heading: 'YOUR LEAST LOGGED' },
  { mode: 'neverLogged', label: 'Never Logged', heading: 'NEVER LOGGED' },
];

const BEST_LIMIT = 10;

export function ExercisePickerSheet({
  visible,
  onClose,
  title,
  exercises,
  suggestedMuscles = [],
  isRecommended,
  rank,
  logCount,
  ownsEquipment,
  onPick,
  actionLabel = 'Choose',
  disabledMessage,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  exercises: readonly Exercise[];
  /** Legacy suggestion heuristic (primary-area overlap) — used when neither `rank` nor `isRecommended` is supplied. */
  suggestedMuscles?: readonly MuscleGroup[];
  /**
   * Boolean "is this a good fit" predicate — superseded by `rank` where both
   * are available, but still supported standalone for callers that only need
   * a Suggested/All split, not a full ranked Sort By.
   */
  isRecommended?: (exercise: Exercise) => boolean;
  /**
   * Continuous fit score (higher = better) — when supplied, switches the
   * picker into ranked "Sort By" mode: Best Replacements (top 10 by this
   * score), Your Most/Least Logged, and Never Logged (both driven by
   * `logCount`, which should also be supplied whenever `rank` is).
   */
  rank?: (exercise: Exercise) => number;
  /** Times the athlete has completed this exercise — drives the log-based sorts and the count shown next to each row. */
  logCount?: (exercise: Exercise) => number;
  /**
   * Whether the athlete owns this exercise's equipment. When supplied, adds
   * a "Your Equipment" / "Any Equipment" toggle — `exercises` is expected to
   * already include equipment the athlete doesn't own, and this only decides
   * whether "Your Equipment" mode filters those out. Picking one while in
   * "Any Equipment" mode is a deliberate override (e.g. at a different gym
   * today) — `onPick` is told so the caller can bypass its own equipment
   * check for that one pick.
   */
  ownsEquipment?: (exercise: Exercise) => boolean;
  onPick: (exerciseId: string, options?: { ignoreEquipment?: boolean }) => void;
  actionLabel?: string;
  disabledMessage?: string;
}) {
  const { colors, radii, spacing, typography } = useTheme();
  const [search, setSearch] = useState('');
  const [muscles, setMuscles] = useState<Set<MuscleGroup>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>('best');
  const [equipmentMode, setEquipmentMode] = useState<'owned' | 'any'>('owned');
  const rankedMode = Boolean(rank);

  const availableMuscles = useMemo(() => {
    const present = new Set<MuscleGroup>();
    exercises.forEach((exercise) => {
      exercise.primaryAreas.forEach((muscle) => present.add(muscle));
      exercise.secondaryAreas?.forEach((muscle) => present.add(muscle));
    });
    return ALL_MUSCLE_GROUPS.filter((muscle) => present.has(muscle));
  }, [exercises]);

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    return exercises.filter((exercise) => {
      if (ownsEquipment && equipmentMode === 'owned' && !ownsEquipment(exercise)) return false;
      const areas = [...exercise.primaryAreas, ...(exercise.secondaryAreas ?? [])];
      if (muscles.size && !areas.some((muscle) => muscles.has(muscle))) return false;
      return !term || `${exercise.name} ${exercise.description}`.toLowerCase().includes(term);
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, muscles, search, ownsEquipment, equipmentMode]);

  // Legacy Suggested/All split — used when the caller hasn't supplied `rank`.
  const suggested = useMemo(
    () => results.filter((exercise) =>
      isRecommended ? isRecommended(exercise) : exercise.primaryAreas.some((muscle) => suggestedMuscles.includes(muscle)),
    ),
    [results, suggestedMuscles, isRecommended],
  );
  const remaining = useMemo(
    () => results.filter((exercise) => !suggested.some((candidate) => candidate.id === exercise.id)),
    [results, suggested],
  );

  // Ranked Sort By mode — used when `rank` is supplied.
  const sorted = useMemo(() => {
    if (!rankedMode) return [];
    const count = (exercise: Exercise) => logCount?.(exercise) ?? 0;
    switch (sortMode) {
      case 'best':
        return [...results]
          .sort((a, b) => (rank!(b) - rank!(a)) || a.name.localeCompare(b.name))
          .slice(0, BEST_LIMIT);
      case 'mostLogged':
        return [...results].sort((a, b) => (count(b) - count(a)) || a.name.localeCompare(b.name));
      case 'leastLogged':
        return results.filter((exercise) => count(exercise) > 0)
          .sort((a, b) => (count(a) - count(b)) || a.name.localeCompare(b.name));
      case 'neverLogged':
        return results.filter((exercise) => count(exercise) === 0).sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [rankedMode, results, sortMode, rank, logCount]);

  function toggleMuscle(muscle: MuscleGroup) {
    setMuscles((current) => {
      const next = new Set(current);
      if (next.has(muscle)) next.delete(muscle);
      else next.add(muscle);
      return next;
    });
  }

  function renderRow(exercise: Exercise) {
    const logged = logCount?.(exercise);
    const owned = ownsEquipment?.(exercise) ?? true;
    return (
      <Row key={exercise.id} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1, paddingRight: spacing.md }}>
          <Text variant="body" weight="semibold">{exercise.name}</Text>
          <Text variant="caption" color="textFaint">
            {exercise.primaryAreas.map((muscle) => MUSCLE_GROUP_LABELS[muscle]).join(' · ')}
            {intensityLabel(exercise) ? ` · ${intensityLabel(exercise)}` : ''}
            {logged != null ? ` · Logged ${logged}×` : ''}
            {!owned ? ' · Not your equipment' : ''}
          </Text>
        </View>
        <Button title={actionLabel} size="sm" variant="secondary" onPress={() => onPick(exercise.id, { ignoreEquipment: !owned })} />
      </Row>
    );
  }

  const header = disabledMessage ? undefined : (
    <TextInput
      value={search}
      onChangeText={setSearch}
      placeholder="Search exercises"
      accessibilityLabel="Search exercises"
      style={{ backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, color: colors.text, fontSize: typography.body.fontSize, paddingHorizontal: spacing.md, minHeight: 48 }}
    />
  );

  return (
    <SheetModal visible={visible} onClose={onClose} eyebrow="EXERCISE PICKER" title={title} closeLabel="Close exercise picker" stickyTop={header}>
      {disabledMessage ? <Text variant="body" color="textMuted">{disabledMessage}</Text> : <>
      {rankedMode && (
        <View style={{ gap: spacing.sm }}>
          <Text variant="caption" color="textFaint" weight="bold">SORT BY</Text>
          <Row gap="sm" wrap>
            {SORT_OPTIONS.map((option) => (
              <Chip key={option.mode} label={option.label} selected={sortMode === option.mode} onPress={() => setSortMode(option.mode)} />
            ))}
          </Row>
        </View>
      )}
      {ownsEquipment && (
        <View style={{ gap: spacing.sm }}>
          <Text variant="caption" color="textFaint" weight="bold">EQUIPMENT</Text>
          <Row gap="sm" wrap>
            <Chip label="Your Equipment" selected={equipmentMode === 'owned'} onPress={() => setEquipmentMode('owned')} />
            <Chip label="Any Equipment" selected={equipmentMode === 'any'} onPress={() => setEquipmentMode('any')} />
          </Row>
        </View>
      )}
      <View style={{ gap: spacing.sm }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="caption" color="textFaint" weight="bold">FILTER TARGET MUSCLES</Text>
          {muscles.size > 0 && <Button title="Clear" size="sm" variant="quiet" onPress={() => setMuscles(new Set())} />}
        </Row>
        <Row gap="sm" wrap>
          {availableMuscles.map((muscle) => <Chip key={muscle} label={MUSCLE_GROUP_LABELS[muscle]} selected={muscles.has(muscle)} onPress={() => toggleMuscle(muscle)} />)}
        </Row>
      </View>
      {rankedMode ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="caption" color="primaryTextSoft" weight="bold">
            {SORT_OPTIONS.find((option) => option.mode === sortMode)!.heading} · {sorted.length}
          </Text>
          {sorted.length === 0
            ? <Text variant="body" color="textMuted">No exercises match your search and filters.</Text>
            : sorted.map(renderRow)}
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {suggested.length > 0 && <Text variant="caption" color="primaryTextSoft" weight="bold">SUGGESTED FOR THIS WORKOUT · {suggested.length}</Text>}
          {suggested.map(renderRow)}
          <Text variant="caption" color="textFaint" weight="bold">{muscles.size || search ? 'ALL MATCHING EXERCISES' : 'ALL COMPATIBLE EXERCISES'} · {remaining.length}</Text>
          {results.length === 0 ? <Text variant="body" color="textMuted">No exercises match your search and filters.</Text> : remaining.map(renderRow)}
        </View>
      )}
      </>}
    </SheetModal>
  );
}
