/**
 * Exercise catalog browser (settings) — search/filter the full catalog,
 * exclude individual exercises or whole filtered categories (e.g. "every
 * hinge-pattern barbell lift") from generated sessions and swap alternates,
 * and mark favorites to bias selection toward them. Reached from Settings.
 * Persisted via `services/exercise-preferences` (single-user app for now,
 * CLAUDE.md) and read by `RulesEngine.generateSession` (excludedExerciseIds,
 * favoriteExerciseIds) and the in-workout swap picker.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Card, Chip, Divider, Icon, Row, SheetModal, TabBar, Text, TextField, useTheme } from '@/design';
import type { IconName } from '@/design';
import { EXERCISES } from '@/domain/catalog';
import { ExcludeToggle, FavoriteToggle } from '@/features/exercise-preference-toggles';
import { ExerciseInfoView } from '@/features/exercise-info-view';
import { getExercisePreferences, saveExercisePreferences } from '@/services/exercise-preferences';
import { getAthleteProfile } from '@/services/athlete';
import { EQUIPMENT_OPTIONS, MODALITY_LABELS, MOVEMENT_PATTERN_LABELS, MUSCLE_GROUP_LABELS } from '@/app-lib/options';
import { intensityLabel } from '@/features/exercise-detail';
import { ALL_MUSCLE_GROUPS } from '@/domain/types';
import type { EquipmentType, Modality, MovementPattern, MuscleGroup } from '@/domain/types';

const PAGE_SIZE = 30;

const MODALITY_FILTERS: { label: string; value: Modality | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: MODALITY_LABELS.strength, value: 'strength' },
  { label: MODALITY_LABELS.cardio, value: 'cardio' },
  { label: MODALITY_LABELS.mobility, value: 'mobility' },
  { label: MODALITY_LABELS.general, value: 'general' },
];

const EQUIPMENT_LABELS: Record<EquipmentType, string> = Object.fromEntries(
  EQUIPMENT_OPTIONS.map((o) => [o.value, o.label]),
) as Record<EquipmentType, string>;

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function FilterSection({
  icon,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  icon: IconName;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${open ? 'Hide' : 'Show'} ${title} filters`}
        onPress={onToggle}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap="sm" style={{ flex: 1 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: radii.md,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={icon} size={15} color="primaryTextSoft" />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label" weight="semibold">{title}</Text>
              <Text variant="caption" color="textMuted">{summary}</Text>
            </View>
          </Row>
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} color="textFaint" />
        </Row>
      </Pressable>
      {open ? <View style={{ marginTop: spacing.md }}>{children}</View> : null}
    </View>
  );
}

export function ExerciseCatalogSheet({
  visible,
  onClose,
  initialExerciseId,
  initialHowTo = false,
}: {
  visible: boolean;
  onClose: () => void;
  initialExerciseId?: string;
  initialHowTo?: boolean;
}) {
  const { colors, radii, spacing } = useTheme();

  const [tab, setTab] = useState<'all' | 'excluded' | 'favorites'>('all');
  const [search, setSearch] = useState('');
  const [modality, setModality] = useState<Modality | 'all'>('all');
  const [patterns, setPatterns] = useState<Set<MovementPattern>>(new Set());
  const [equipmentFilter, setEquipmentFilter] = useState<Set<EquipmentType>>(new Set());
  const [muscleFilter, setMuscleFilter] = useState<Set<MuscleGroup>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openFilter, setOpenFilter] = useState<'goal' | 'movement' | 'equipment' | 'muscle' | null>('goal');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(getExercisePreferences().excludedExerciseIds),
  );
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(getExercisePreferences().favoriteExerciseIds),
  );
  const [infoExerciseId, setInfoExerciseId] = useState<string | null>(null);
  const [weightUnit] = useState(() => getAthleteProfile()?.weightUnit ?? 'kg');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening a deep link selects its requested exercise
    if (visible && initialExerciseId) setInfoExerciseId(initialExerciseId);
  }, [visible, initialExerciseId]);

  function resetResults() {
    setVisibleCount(PAGE_SIZE);
  }

  function updateSearch(next: string) {
    setSearch(next);
    resetResults();
  }

  function updateTab(next: 'all' | 'excluded' | 'favorites') {
    setTab(next);
    resetResults();
  }

  function updateModality(next: Modality | 'all') {
    setModality(next);
    resetResults();
  }

  function togglePattern(pattern: MovementPattern) {
    setPatterns((previous) => toggled(previous, pattern));
    resetResults();
  }

  function toggleEquipment(equipment: EquipmentType) {
    setEquipmentFilter((previous) => toggled(previous, equipment));
    resetResults();
  }

  function toggleMuscle(muscle: MuscleGroup) {
    setMuscleFilter((previous) => toggled(previous, muscle));
    resetResults();
  }

  function persist(next: Set<string>) {
    setExcluded(next);
    saveExercisePreferences({ ...getExercisePreferences(), excludedExerciseIds: [...next] });
  }

  function setOneExcluded(id: string, value: boolean) {
    const next = new Set(excluded);
    if (value) next.add(id);
    else next.delete(id);
    persist(next);
  }

  function persistFavorites(next: Set<string>) {
    setFavorites(next);
    saveExercisePreferences({ ...getExercisePreferences(), favoriteExerciseIds: [...next] });
  }

  function setOneFavorite(id: string, value: boolean) {
    const next = new Set(favorites);
    if (value) next.add(id);
    else next.delete(id);
    persistFavorites(next);
  }

  // Filter chips only ever show categories actually present within the current
  // modality slice — no dead-end chips that would zero out the results.
  const modalityPool = useMemo(
    () => (modality === 'all' ? EXERCISES : EXERCISES.filter((e) => e.modality === modality)),
    [modality],
  );
  const availablePatterns = useMemo(
    () =>
      [...new Set(modalityPool.map((e) => e.movementPattern))].sort((a, b) =>
        MOVEMENT_PATTERN_LABELS[a].localeCompare(MOVEMENT_PATTERN_LABELS[b]),
      ),
    [modalityPool],
  );
  const availableEquipment = useMemo(
    () =>
      [...new Set(modalityPool.flatMap((e) => e.equipment))].sort((a, b) =>
        EQUIPMENT_LABELS[a].localeCompare(EQUIPMENT_LABELS[b]),
      ),
    [modalityPool],
  );
  const availableMuscles = useMemo(() => {
    const present = new Set<MuscleGroup>();
    modalityPool.forEach((e) => {
      e.primaryAreas.forEach((g) => present.add(g));
      (e.secondaryAreas ?? []).forEach((g) => present.add(g));
    });
    return ALL_MUSCLE_GROUPS.filter((g) => present.has(g));
  }, [modalityPool]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return EXERCISES.filter((e) => {
      if (tab === 'excluded' && !excluded.has(e.id)) return false;
      if (tab === 'favorites' && !favorites.has(e.id)) return false;
      if (modality !== 'all' && e.modality !== modality) return false;
      if (patterns.size && !patterns.has(e.movementPattern)) return false;
      if (equipmentFilter.size && !e.equipment.some((eq) => equipmentFilter.has(eq))) return false;
      if (muscleFilter.size) {
        const areas = [...e.primaryAreas, ...(e.secondaryAreas ?? [])];
        if (!areas.some((g) => muscleFilter.has(g))) return false;
      }
      if (term) {
        const haystack = `${e.name} ${e.description}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [search, tab, modality, patterns, equipmentFilter, muscleFilter, excluded, favorites]);

  const visibleExercises = filtered.slice(0, visibleCount);
  const activeFilterLabels = [
    ...(modality !== 'all' ? [MODALITY_LABELS[modality]] : []),
    ...[...patterns].map((pattern) => MOVEMENT_PATTERN_LABELS[pattern]),
    ...[...equipmentFilter].map((equipment) => EQUIPMENT_LABELS[equipment]),
    ...[...muscleFilter].map((muscle) => MUSCLE_GROUP_LABELS[muscle]),
  ];
  const activeFilterCount = activeFilterLabels.length;
  const hasActiveFilters = Boolean(search || activeFilterCount);

  function clearFilters() {
    setSearch('');
    setModality('all');
    setPatterns(new Set());
    setEquipmentFilter(new Set());
    setMuscleFilter(new Set());
    resetResults();
  }

  function excludeAllShown() {
    const next = new Set(excluded);
    filtered.forEach((e) => next.add(e.id));
    persist(next);
  }

  function includeAllShown() {
    const shownIds = new Set(filtered.map((e) => e.id));
    persist(new Set([...excluded].filter((id) => !shownIds.has(id))));
  }

  const allShownExcluded = filtered.length > 0 && filtered.every((e) => excluded.has(e.id));

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      eyebrow="SETTINGS · EXERCISE CATALOG"
      title="Fine-tune your catalog"
      closeLabel="Close exercise catalog"
    >
      <Text variant="body" color="textMuted">
        Star exercises you&apos;d like sessions to prefer, and exclude ones you never want to see.
        Excluded exercises are skipped by generated sessions and swap suggestions until you bring
        them back; favorites are still balanced against variety, not guaranteed every time.
      </Text>

      <View style={{ position: 'relative' }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: spacing.md, top: 13, zIndex: 1 }}>
          <Icon name="search" size={20} color="textFaint" />
        </View>
        <TextField
          multiline={false}
          value={search}
          onChangeText={updateSearch}
          placeholder="Search exercises to exclude"
          autoCapitalize="none"
          autoCorrect={false}
          style={{ minHeight: 0, paddingVertical: spacing.md, paddingLeft: 44 }}
        />
      </View>

      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${filtersOpen ? 'Hide' : 'Show'} filters${activeFilterCount ? `, ${activeFilterCount} active` : ''}`}
          onPress={() => setFiltersOpen((open) => !open)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radii.md,
            backgroundColor: activeFilterCount ? colors.primarySoft : colors.surfaceAlt,
            borderWidth: 1,
            borderColor: activeFilterCount ? colors.primary : colors.border,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Icon name="filter" size={16} color={activeFilterCount ? 'primaryTextSoft' : 'textMuted'} />
          <Text variant="label" weight="semibold" color={activeFilterCount ? 'primaryTextSoft' : 'textMuted'}>
            Filter{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </Text>
        </Pressable>
        {hasActiveFilters ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search and filters" onPress={clearFilters} hitSlop={8}>
            <Text variant="label" color="primaryTextSoft" weight="semibold">Clear</Text>
          </Pressable>
        ) : (
          <Text variant="caption" color="textFaint">Browse or search</Text>
        )}
      </Row>

      {activeFilterLabels.length > 0 && !filtersOpen ? (
        <Text variant="caption" color="textMuted">Filters: {activeFilterLabels.join(' · ')}</Text>
      ) : null}

      {filtersOpen ? (
        <Card>
          <Text variant="caption" color="textFaint" weight="bold">NARROW THE CATALOG</Text>
          <FilterSection
            icon="filter"
            title="Goal type"
            summary={modality === 'all' ? 'Any goal' : MODALITY_LABELS[modality]}
            open={openFilter === 'goal'}
            onToggle={() => setOpenFilter((current) => (current === 'goal' ? null : 'goal'))}
          >
            <Row gap="sm" wrap>
              {MODALITY_FILTERS.map((option) => (
                <Chip key={option.value} label={option.label} selected={modality === option.value} onPress={() => updateModality(option.value)} />
              ))}
            </Row>
          </FilterSection>

          {availablePatterns.length > 0 ? (
            <FilterSection
              icon="movement"
              title="Movement"
              summary={patterns.size ? [...patterns].map((pattern) => MOVEMENT_PATTERN_LABELS[pattern]).join(', ') : 'Any movement'}
              open={openFilter === 'movement'}
              onToggle={() => setOpenFilter((current) => (current === 'movement' ? null : 'movement'))}
            >
              <Row gap="sm" wrap>
                {availablePatterns.map((pattern) => <Chip key={pattern} label={MOVEMENT_PATTERN_LABELS[pattern]} selected={patterns.has(pattern)} onPress={() => togglePattern(pattern)} />)}
              </Row>
            </FilterSection>
          ) : null}

          {availableEquipment.length > 0 ? (
            <FilterSection
              icon="workout"
              title="Equipment"
              summary={equipmentFilter.size ? [...equipmentFilter].map((equipment) => EQUIPMENT_LABELS[equipment]).join(', ') : 'Any equipment'}
              open={openFilter === 'equipment'}
              onToggle={() => setOpenFilter((current) => (current === 'equipment' ? null : 'equipment'))}
            >
              <Row gap="sm" wrap>
                {availableEquipment.map((equipment) => <Chip key={equipment} label={EQUIPMENT_LABELS[equipment]} selected={equipmentFilter.has(equipment)} onPress={() => toggleEquipment(equipment)} />)}
              </Row>
            </FilterSection>
          ) : null}

          {availableMuscles.length > 0 ? (
            <FilterSection
              icon="soreness"
              title="Target area"
              summary={muscleFilter.size ? [...muscleFilter].map((muscle) => MUSCLE_GROUP_LABELS[muscle]).join(', ') : 'Any area'}
              open={openFilter === 'muscle'}
              onToggle={() => setOpenFilter((current) => (current === 'muscle' ? null : 'muscle'))}
            >
              <Row gap="sm" wrap>
                {availableMuscles.map((muscle) => <Chip key={muscle} label={MUSCLE_GROUP_LABELS[muscle]} selected={muscleFilter.has(muscle)} onPress={() => toggleMuscle(muscle)} />)}
              </Row>
            </FilterSection>
          ) : null}
        </Card>
      ) : null}

      <TabBar
        tabs={[
          { value: 'all' as const, label: 'All exercises' },
          { value: 'favorites' as const, label: `Favorites (${favorites.size})` },
          { value: 'excluded' as const, label: `Excluded (${excluded.size})` },
        ]}
        value={tab}
        onChange={updateTab}
      />

      <Card tone="primarySoft">
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="body" color="primaryTextSoft">
            {filtered.length} exercise{filtered.length === 1 ? '' : 's'} match
            {tab === 'excluded' ? ' (excluded)' : tab === 'favorites' ? ' (favorited)' : ''}
          </Text>
        </Row>
        {tab === 'all' && filtered.length > 0 && (
          <Button
            title={allShownExcluded ? 'Include all shown' : 'Exclude all shown'}
            variant="secondary"
            size="sm"
            onPress={allShownExcluded ? includeAllShown : excludeAllShown}
            style={{ marginTop: spacing.md }}
          />
        )}
      </Card>

      <Card>
        <Text variant="caption" color="textFaint" weight="bold" style={{ marginBottom: spacing.md }}>RESULTS</Text>
        {visibleExercises.length === 0 ? (
          <Text variant="body" color="textMuted">
            {tab === 'excluded'
              ? "You haven't excluded anything yet. Switch to “All exercises” and tap Exclude on anything you'd rather not see."
              : tab === 'favorites'
                ? "You haven't favorited anything yet. Switch to “All exercises” and tap the star on exercises you'd like sessions to prefer."
                : 'No exercises match these filters.'}
          </Text>
        ) : (
          visibleExercises.map((e, i) => {
            const isExcluded = excluded.has(e.id);
            const isFavorite = favorites.has(e.id);
            const areas = e.primaryAreas.map((g) => MUSCLE_GROUP_LABELS[g]);
            return (
              <View key={e.id}>
                {i > 0 && <Divider style={{ marginVertical: spacing.md }} />}
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View ${e.name} details`}
                    onPress={() => setInfoExerciseId(e.id)}
                    style={({ pressed }) => ({ flex: 1, marginRight: spacing.md, opacity: pressed ? 0.7 : 1 })}
                  >
                    <Text variant="body" weight="semibold">{e.name}</Text>
                    <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                      {MODALITY_LABELS[e.modality]} · {MOVEMENT_PATTERN_LABELS[e.movementPattern]}
                      {areas.length ? ` · ${areas.join(', ')}` : ''}
                      {intensityLabel(e) ? ` · ${intensityLabel(e)}` : ''}
                    </Text>
                  </Pressable>
                  <Row gap="sm" wrap style={{ justifyContent: 'flex-end' }}>
                    <FavoriteToggle active={isFavorite} onPress={() => setOneFavorite(e.id, !isFavorite)} />
                    <ExcludeToggle
                      active={isExcluded}
                      activeLabel={tab === 'excluded' ? 'Restore' : 'Excluded'}
                      activeIcon={tab === 'excluded' ? 'restore' : 'selected'}
                      onPress={() => setOneExcluded(e.id, !isExcluded)}
                    />
                  </Row>
                </Row>
              </View>
            );
          })
        )}
        {filtered.length > visibleExercises.length && (
          <Button
            title={`Show more (${filtered.length - visibleExercises.length} left)`}
            variant="secondary"
            onPress={() => setVisibleCount((c) => c + PAGE_SIZE)}
            fullWidth
            style={{ marginTop: spacing.lg }}
          />
        )}
      </Card>
      <ExerciseInfoView
        exerciseId={infoExerciseId}
        weightUnit={weightUnit}
        initialHowTo={initialHowTo}
        onClose={() => setInfoExerciseId(null)}
      />
    </SheetModal>
  );
}
