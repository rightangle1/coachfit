/** Visual exercise discovery — the everyday home for CoachFit's catalog. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ImageBackground, Pressable, View, type ImageSourcePropType } from 'react-native';

import { Button, Card, Chip, HeroScrim, Icon, MuscleLogo, MuscleTargetMap, Row, Screen, SheetModal, TabBar, Text, TextField, toneForModality, useTheme } from '@/design';
import { EXERCISES } from '@/domain/catalog';
import { getAthleteProfile } from '@/services/athlete';
import { getEquipmentInventory } from '@/services/equipment';
import { getExercisePreferences, setExerciseFavorite } from '@/services/exercise-preferences';
import { listRoutines } from '@/services/routines';
import { ExerciseInfoView } from '@/features/exercise-info-view';
import { ExerciseHistorySheet } from '@/features/exercise-history-sheet';
import { RoutineBuilderSheet } from '@/features/routine-builder-sheet';
import { RoutineDetailSheet } from '@/features/routine-detail-sheet';
import { CARDIO_MODALITIES, CARDIO_MODALITY_LABELS, EQUIPMENT_OPTIONS, MODALITY_LABELS, MOVEMENT_PATTERN_LABELS, MUSCLE_GROUP_LABELS, WORKOUT_TYPE_OPTIONS } from '@/app-lib/options';
import { GOAL_STORIES } from '@/app-lib/personalization';
import { ALL_MUSCLE_GROUPS, GROUP_TO_REGION, type CardioModality, type EquipmentType, type Modality, type MovementPattern, type MuscleGroup, type Routine } from '@/domain/types';

type ExploreTab = 'discover' | 'saved' | 'routines';
type BrowseMode = 'goal' | 'body' | 'equipment';
type RegionFilter = 'all' | 'upper_body' | 'lower_body' | 'core';

const REGION_FILTERS: { value: RegionFilter; label: string }[] = [
  { value: 'all', label: 'Full body' },
  { value: 'upper_body', label: 'Upper body' },
  { value: 'lower_body', label: 'Lower body' },
  { value: 'core', label: 'Core' },
];

// All four launch modalities now have real, catalog-backed exercises
// (general included — see ADR note on Modality in domain/types/goals.ts), so
// this chip list intentionally mirrors GOAL_COLLECTIONS below one-for-one.
const MODALITIES: { value: Modality; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'general', label: 'General' },
];

const CARDIO_ART = require('../../assets/images/editorial/explore-cardio-v1.webp');

// Title/caption are sourced from GOAL_STORIES (app-lib/personalization) —
// the same per-modality record onboarding/GoalHero/Progress read — so this
// browsing copy can't drift from goal-setting copy the way two independent
// literal tables would.
const GOAL_COLLECTIONS: {
  title: string;
  caption: string;
  image: ImageSourcePropType;
  modality: Modality;
  pattern?: MovementPattern;
}[] = [
  { title: GOAL_STORIES.strength.browseTitle, caption: GOAL_STORIES.strength.browseCaption, image: require('../../assets/images/editorial/explore-strength-v1.webp'), modality: 'strength' },
  { title: GOAL_STORIES.cardio.browseTitle, caption: GOAL_STORIES.cardio.browseCaption, image: CARDIO_ART, modality: 'cardio' },
  { title: GOAL_STORIES.mobility.browseTitle, caption: GOAL_STORIES.mobility.browseCaption, image: require('../../assets/images/editorial/explore-mobility-v1.webp'), modality: 'mobility' },
  { title: GOAL_STORIES.general.browseTitle, caption: GOAL_STORIES.general.browseCaption, image: require('../../assets/images/editorial/explore-general-v1.webp'), modality: 'general' },
];

const MOVEMENT_PATTERNS: MovementPattern[] = ['squat', 'hinge', 'lunge', 'push', 'pull', 'carry', 'core', 'stretch', 'yoga_flow'];

// ADR-0137 v2: style is a routine's topline field — surfaced on its card.
function routineStyleLabel(workoutType: Routine['workoutType']): string {
  return WORKOUT_TYPE_OPTIONS.find((option) => option.value === workoutType)?.label ?? 'Balanced';
}

function ExerciseTile({
  exercise,
  favorite,
  onPress,
  onFavorite,
}: {
  exercise: (typeof EXERCISES)[number];
  favorite: boolean;
  onPress: () => void;
  onFavorite: () => void;
}) {
  const { colors, spacing } = useTheme();
  const tone = toneForModality(exercise.modality);
  const targets = exercise.primaryAreas
    .map((group) => MUSCLE_GROUP_LABELS[group])
    .slice(0, 2);
  return (
    <Pressable
      accessibilityLabel={`Open ${exercise.name}`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1, flexDirection: 'row', gap: spacing.md, minHeight: 92, paddingVertical: spacing.xs })}
    >
      <MuscleLogo groups={exercise.primaryAreas} size={82} />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text variant="subtitle">{exercise.name}</Text>
        <Text variant="caption" tint={colors.tones[tone].text} style={{ marginTop: 3 }}>
          {MODALITY_LABELS[exercise.modality]} · {targets.join(' · ') || 'Full body'}
        </Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: 3 }}>
          {exercise.equipment.map((item) => EQUIPMENT_OPTIONS.find((option) => option.value === item)?.label ?? item).slice(0, 2).join(' · ')}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${favorite ? 'Remove' : 'Add'} ${exercise.name} ${favorite ? 'from' : 'to'} saved exercises`}
        onPress={(event) => { event.stopPropagation(); onFavorite(); }}
        hitSlop={8}
        style={{ width: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name={favorite ? 'favorite' : 'favoriteOutline'} color={favorite ? 'warning' : 'textFaint'} size={22} />
      </Pressable>
    </Pressable>
  );
}

function EditorialCollectionCard({
  title,
  caption,
  image,
  modality,
  selected,
  onPress,
}: {
  title: string;
  caption: string;
  image: ImageSourcePropType;
  modality?: Modality;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, radii, spacing } = useTheme();
  const tone = toneForModality(modality ?? 'general');
  const toneColors = colors.tones[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Explore ${title}`}
      onPress={onPress}
      style={({ pressed }) => ({
        width: '48%',
        height: 144,
        borderRadius: radii.lg,
        overflow: 'hidden',
        borderTopWidth: selected ? 3 : 3,
        borderTopColor: toneColors.solid,
        borderWidth: selected ? 2 : 0,
        borderColor: toneColors.solid,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <ImageBackground source={image} style={{ width: '100%', height: '100%', justifyContent: 'flex-end' }} imageStyle={{ borderRadius: radii.lg }}>
        <HeroScrim />
        {selected ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: toneColors.solid, opacity: 0.28 }}
          />
        ) : null}
        <View style={{ padding: spacing.md }}>
          <Text variant="subtitle" color="heroText">{title}</Text>
          <Text variant="caption" color="heroMuted" style={{ marginTop: 2 }}>{caption}</Text>
        </View>
        {selected ? (
          <View style={{ position: 'absolute', top: spacing.sm, right: spacing.sm, width: 26, height: 26, borderRadius: 13, backgroundColor: toneColors.solid, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="checkAll" color="heroText" size={16} />
          </View>
        ) : null}
      </ImageBackground>
    </Pressable>
  );
}

export default function ExploreScreen() {
  const { spacing } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; newRoutine?: string; editRoutineId?: string; returnTo?: string }>();
  const [infoExerciseId, setInfoExerciseId] = useState<string | null>(null);
  const weightUnit = getAthleteProfile()?.weightUnit ?? 'kg';
  // Deep-linked from elsewhere (e.g. "Edit" on a routine from Today) — read
  // once on mount, same as any other initial-tab param.
  const [tab, setTab] = useState<ExploreTab>(params.tab === 'routines' || params.tab === 'saved' ? params.tab : 'discover');
  const [browseMode, setBrowseMode] = useState<BrowseMode>('goal');
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<RegionFilter>('all');
  const [modality, setModality] = useState<Modality | undefined>();
  const [movementPattern, setMovementPattern] = useState<MovementPattern | undefined>();
  const [cardioModality, setCardioModality] = useState<CardioModality | undefined>();
  const [selectedMuscles, setSelectedMuscles] = useState<MuscleGroup[]>([]);
  const [removedAreaMuscles, setRemovedAreaMuscles] = useState<MuscleGroup[]>([]);
  const [selectedGoalTitle, setSelectedGoalTitle] = useState<string | undefined>();
  const [equipment, setEquipment] = useState<EquipmentType | undefined>();
  const [filterOpen, setFilterOpen] = useState(false);
  const [favorites, setFavorites] = useState(() => new Set(getExercisePreferences().favoriteExerciseIds));
  const ownedEquipment = useMemo(() => new Set((getEquipmentInventory()?.items ?? []).map((item) => item.type)), []);

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [builderVisible, setBuilderVisible] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  // Whether the builder was opened from the Today routine picker — if so,
  // closing or saving should send the athlete back there instead of leaving
  // them stranded on Explore.
  const [returnToPicker, setReturnToPicker] = useState(false);

  // Deep-linked from the Today routine picker — either "Create New Routine"
  // (empty state) or "Edit" on a routine row. This tab stays mounted across
  // visits (it's a persistent Tabs screen, not a fresh page load each time),
  // so the trigger must be an effect keyed on the params rather than
  // read-once-on-mount state, or a second deep link back into an
  // already-mounted Explore would silently no-op.
  useEffect(() => {
    if (params.newRoutine !== '1' && !params.editRoutineId) return;
    setTab('routines');
    setEditingRoutine(params.editRoutineId ? listRoutines().find((r) => r.id === params.editRoutineId) ?? null : null);
    setBuilderVisible(true);
    setReturnToPicker(params.returnTo === 'picker');
    router.setParams({ newRoutine: undefined, editRoutineId: undefined, returnTo: undefined });
  }, [params.newRoutine, params.editRoutineId, params.returnTo, router]);

  const [detailRoutineId, setDetailRoutineId] = useState<string | null>(null);
  const [routineExerciseHistoryId, setRoutineExerciseHistoryId] = useState<string | null>(null);
  const detailRoutine = routines.find((r) => r.id === detailRoutineId) ?? null;

  useFocusEffect(
    useCallback(() => {
      setRoutines(listRoutines());
    }, []),
  );

  function refreshRoutines() {
    setRoutines(listRoutines());
  }

  const areaMuscles = useMemo(
    () => region === 'all' ? ALL_MUSCLE_GROUPS : ALL_MUSCLE_GROUPS.filter((group) => GROUP_TO_REGION[group] === region),
    [region],
  );
  const effectiveMuscles = useMemo(() => {
    const included = new Set(areaMuscles.filter((group) => !removedAreaMuscles.includes(group)));
    selectedMuscles.forEach((group) => included.add(group));
    return [...included];
  }, [areaMuscles, removedAreaMuscles, selectedMuscles]);

  const exercises = useMemo(() => {
    const term = query.trim().toLowerCase();
    return EXERCISES
      .filter((exercise) => tab !== 'saved' || favorites.has(exercise.id))
      .filter((exercise) => !modality || exercise.modality === modality)
      .filter((exercise) => !movementPattern || exercise.movementPattern === movementPattern)
      .filter((exercise) => !cardioModality || exercise.cardioModality === cardioModality)
      .filter((exercise) => effectiveMuscles.length === 0 || exercise.primaryAreas.some((group) => effectiveMuscles.includes(group)))
      .filter((exercise) => !equipment || exercise.equipment.includes(equipment))
      .filter((exercise) => !term || `${exercise.name} ${exercise.description}`.toLowerCase().includes(term))
      .sort((a, b) => {
        const ownedA = a.equipment.some((item) => ownedEquipment.has(item)) ? 1 : 0;
        const ownedB = b.equipment.some((item) => ownedEquipment.has(item)) ? 1 : 0;
        return ownedB - ownedA || a.name.localeCompare(b.name);
      });
  }, [cardioModality, effectiveMuscles, equipment, favorites, modality, movementPattern, ownedEquipment, query, tab]);

  function toggleFavorite(id: string) {
    const next = new Set(favorites);
    const favorite = !next.has(id);
    if (favorite) next.add(id);
    else next.delete(id);
    setExerciseFavorite(id, favorite);
    setFavorites(next);
  }

  function openExercise(id: string) {
    setInfoExerciseId(id);
  }

  function selectCollection(collection: (typeof GOAL_COLLECTIONS)[number]) {
    setTab('discover');
    setModality(collection.modality);
    setMovementPattern(collection.pattern);
    setSelectedGoalTitle(collection.title);
  }

  function toggleMuscle(group: MuscleGroup) {
    const comesFromArea = areaMuscles.includes(group) && !removedAreaMuscles.includes(group);
    if (comesFromArea) {
      setRemovedAreaMuscles((removed) => [...removed, group]);
      setSelectedMuscles((selected) => selected.filter((item) => item !== group));
      return;
    }

    if (areaMuscles.includes(group)) {
      setRemovedAreaMuscles((removed) => removed.filter((item) => item !== group));
      return;
    }

    setSelectedMuscles((selected) => selected.includes(group) ? selected.filter((item) => item !== group) : [...selected, group]);
  }

  function chooseBrowseMode(next: BrowseMode) {
    setBrowseMode(next);
    if (next !== 'goal') setSelectedGoalTitle(undefined);
  }

  function chooseRegion(next: RegionFilter) {
    setSelectedGoalTitle(undefined);
    setRegion(next);
  }

  function chooseEquipment(next: EquipmentType) {
    setSelectedGoalTitle(undefined);
    setEquipment(equipment === next ? undefined : next);
  }

  function chooseModality(next: Modality) {
    setSelectedGoalTitle(undefined);
    const nextModality = modality === next ? undefined : next;
    setModality(nextModality);
    if (nextModality !== 'cardio') setCardioModality(undefined);
  }

  function chooseMovementPattern(next: MovementPattern) {
    setSelectedGoalTitle(undefined);
    setMovementPattern(movementPattern === next ? undefined : next);
  }

  function chooseCardioModality(next: CardioModality) {
    setSelectedGoalTitle(undefined);
    setCardioModality(cardioModality === next ? undefined : next);
  }

  const activeFilters = [region !== 'all', Boolean(modality), Boolean(movementPattern), Boolean(cardioModality), Boolean(equipment), selectedMuscles.length > 0, removedAreaMuscles.length > 0].filter(Boolean).length;

  return (
    <Screen>
      <View>
        <Text variant="display" italic style={{ marginTop: 4 }}>Explore movement</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
          Find exercises that fit your body, your goals, and what you have available.
        </Text>
      </View>

      <TabBar
        tabs={[
          { value: 'discover' as const, label: 'Discover' },
          { value: 'saved' as const, label: `Saved (${favorites.size})` },
          { value: 'routines' as const, label: `Routines (${routines.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'routines' ? (
        <View style={{ gap: spacing.md }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text variant="heading">Your routines</Text>
              <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
                Build a set of exercises once, then run it or let CoachFit pick one for you.
              </Text>
            </View>
          </Row>
          <Button title="New routine" onPress={() => { setEditingRoutine(null); setBuilderVisible(true); }} />
          {routines.length === 0 ? (
            <Card>
              <Text variant="subtitle">No routines yet</Text>
              <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
                Save a favorite mix of exercises, or turn a past workout into a routine from Progress.
              </Text>
            </Card>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {routines.map((routine) => {
                const routineExercises = routine.exerciseIds
                  .map((id) => EXERCISES.find((e) => e.id === id))
                  .filter((e): e is (typeof EXERCISES)[number] => e != null);
                const groups = Array.from(new Set(routineExercises.flatMap((e) => e.primaryAreas))).slice(0, 4);
                return (
                  <Pressable
                    key={routine.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${routine.name}`}
                    onPress={() => setDetailRoutineId(routine.id)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1 })}
                  >
                    <Card>
                      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <Text variant="subtitle">{routine.name}</Text>
                          <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                            {routineStyleLabel(routine.workoutType)} · {routine.exerciseIds.length} exercise{routine.exerciseIds.length === 1 ? '' : 's'}
                            {routine.recurrenceDaysOfWeek?.length ? ' · Recurring' : ''}
                          </Text>
                        </View>
                        <Row gap="xs">
                          {groups.map((group) => <MuscleLogo key={group} groups={[group]} size={32} />)}
                        </Row>
                      </Row>
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ) : null}

      {tab === 'discover' ? <View style={{ gap: spacing.md }}>
        <Text variant="heading">Browse exercises</Text>
        <TabBar tabs={[{ value: 'goal' as const, label: 'Goal' }, { value: 'body' as const, label: 'Body area' }, { value: 'equipment' as const, label: 'Equipment' }]} value={browseMode} onChange={chooseBrowseMode} />
        {browseMode === 'goal' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {GOAL_COLLECTIONS.map((collection) => (
            <EditorialCollectionCard
              key={collection.title}
              {...collection}
              selected={selectedGoalTitle === collection.title}
              onPress={() => selectCollection(collection)}
            />
          ))}
        </View> : null}
        {browseMode === 'body' ? <View>
          <Text variant="body" color="textMuted">Choose an area to highlight it, then tap the body map to refine the muscles you want to include.</Text>
          <Row gap="sm" wrap style={{ marginTop: spacing.md }}>
            {REGION_FILTERS.map((option) => <Chip key={option.value} label={option.label} selected={region === option.value} onPress={() => chooseRegion(option.value)} />)}
          </Row>
          <Card style={{ marginTop: spacing.md }}><MuscleTargetMap selectedGroups={selectedMuscles} highlightedRegion={region} removedHighlightedGroups={removedAreaMuscles} onToggle={toggleMuscle} /></Card>
        </View> : null}
        {browseMode === 'equipment' ? <View>
          <Text variant="body" color="textMuted">Start with what you have available. CoachFit will keep recommendations practical.</Text>
          <Row gap="sm" wrap style={{ marginTop: spacing.md }}>
            {EQUIPMENT_OPTIONS.slice().sort((a, b) => Number(ownedEquipment.has(b.value)) - Number(ownedEquipment.has(a.value))).map((option) => <Chip key={option.value} label={option.label} selected={equipment === option.value} onPress={() => chooseEquipment(option.value)} />)}
          </Row>
        </View> : null}
      </View> : null}

      {tab !== 'routines' ? <View style={{ gap: spacing.sm }}>
        <View style={{ position: 'relative' }}>
          <View pointerEvents="none" style={{ position: 'absolute', zIndex: 1, left: spacing.md, top: 13 }}><Icon name="search" color="textFaint" size={19} /></View>
          <TextField value={query} onChangeText={setQuery} placeholder="Search exercises" multiline={false} autoCapitalize="none" style={{ minHeight: 0, paddingLeft: 44, paddingVertical: spacing.md }} />
        </View>
        <Row style={{ justifyContent: 'space-between' }}>
          <Button title={activeFilters ? `Filters (${activeFilters})` : 'Filters'} variant="secondary" size="sm" onPress={() => setFilterOpen(true)} />
          <Text variant="caption" color="textMuted" style={{ alignSelf: 'center' }}>{exercises.length} movements</Text>
        </Row>
      </View> : null}

      {tab !== 'routines' ? <Card>
        <Text variant="caption" color="textFaint" weight="bold">{tab === 'saved' ? 'YOUR SAVED EXERCISES' : 'MOVEMENTS FOR YOU'}</Text>
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {exercises.length ? exercises.slice(0, 30).map((exercise) => (
            <ExerciseTile key={exercise.id} exercise={exercise} favorite={favorites.has(exercise.id)} onFavorite={() => toggleFavorite(exercise.id)} onPress={() => openExercise(exercise.id)} />
          )) : (
            <View style={{ paddingVertical: spacing.lg, gap: spacing.xs }}>
              <Text variant="subtitle">Nothing matches yet</Text>
              <Text variant="body" color="textMuted">Try clearing a filter, or save a few movements from Discover.</Text>
            </View>
          )}
          {exercises.length > 30 ? <Text variant="caption" color="textMuted">Refine your search to see the rest of the catalog.</Text> : null}
        </View>
      </Card> : null}

      <SheetModal visible={filterOpen} onClose={() => setFilterOpen(false)} eyebrow="EXPLORE" title="Refine your search" closeLabel="Close filters">
        <Text variant="heading">Training style</Text>
        <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
          {MODALITIES.map((option) => <Chip key={option.value} label={option.label} tone={toneForModality(option.value)} selected={modality === option.value} onPress={() => chooseModality(option.value)} />)}
        </Row>
        <Text variant="heading" style={{ marginTop: spacing.xl }}>Equipment</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: 2 }}>Your available equipment appears first.</Text>
        <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
          {EQUIPMENT_OPTIONS.slice().sort((a, b) => Number(ownedEquipment.has(b.value)) - Number(ownedEquipment.has(a.value))).map((option) => (
            <Chip key={option.value} label={option.label} selected={equipment === option.value} onPress={() => setEquipment(equipment === option.value ? undefined : option.value)} />
          ))}
        </Row>
        <Text variant="heading" style={{ marginTop: spacing.xl }}>Movement pattern</Text>
        <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
          {MOVEMENT_PATTERNS.map((pattern) => (
            <Chip key={pattern} label={MOVEMENT_PATTERN_LABELS[pattern]} selected={movementPattern === pattern} onPress={() => chooseMovementPattern(pattern)} />
          ))}
        </Row>
        {modality === 'cardio' ? <>
          <Text variant="heading" style={{ marginTop: spacing.xl }}>Cardio type</Text>
          <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
            {CARDIO_MODALITIES.map((value) => (
              <Chip key={value} label={CARDIO_MODALITY_LABELS[value]} selected={cardioModality === value} onPress={() => chooseCardioModality(value)} />
            ))}
          </Row>
        </> : null}
        <Button title="Show movements" onPress={() => setFilterOpen(false)} fullWidth style={{ marginTop: spacing.xl }} />
      </SheetModal>
      <ExerciseInfoView exerciseId={infoExerciseId} weightUnit={weightUnit} onClose={() => setInfoExerciseId(null)} />

      <RoutineBuilderSheet
        visible={builderVisible}
        routine={editingRoutine}
        onClose={() => {
          setBuilderVisible(false);
          if (returnToPicker) router.replace({ pathname: '/', params: { openRoutinePicker: '1' } });
        }}
        onSaved={(saved) => {
          refreshRoutines();
          setBuilderVisible(false);
          if (returnToPicker) {
            router.replace({ pathname: '/', params: { openRoutinePicker: '1' } });
          } else {
            setDetailRoutineId(saved.id);
          }
        }}
      />
      <RoutineDetailSheet
        routine={detailRoutine}
        weightUnit={weightUnit}
        onClose={() => setDetailRoutineId(null)}
        onEdit={(routine) => {
          setDetailRoutineId(null);
          setEditingRoutine(routine);
          setBuilderVisible(true);
        }}
        onUseToday={(routine) => {
          setDetailRoutineId(null);
          router.push({ pathname: '/', params: { useRoutineId: routine.id } });
        }}
        onOpenExercise={(exerciseId) => setRoutineExerciseHistoryId(exerciseId)}
        onDeleted={() => {
          setDetailRoutineId(null);
          refreshRoutines();
        }}
      />
      <ExerciseHistorySheet
        exerciseId={routineExerciseHistoryId}
        weightUnit={weightUnit}
        onClose={() => setRoutineExerciseHistoryId(null)}
      />
    </Screen>
  );
}
