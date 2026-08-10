/** Visual exercise discovery — the everyday home for CoachFit's catalog. */

import { useMemo, useState } from 'react';
import { ImageBackground, Pressable, View, type ImageSourcePropType } from 'react-native';

import { Button, Card, Chip, HeroScrim, Icon, MuscleLogo, MuscleTargetMap, Row, Screen, SheetModal, TabBar, Text, TextField, useTheme } from '@/design';
import { EXERCISES } from '@/domain/catalog';
import { getAthleteProfile } from '@/services/athlete';
import { getEquipmentInventory } from '@/services/equipment';
import { getExercisePreferences, setExerciseFavorite } from '@/services/exercise-preferences';
import { ExerciseInfoView } from '@/features/exercise-info-view';
import { EQUIPMENT_OPTIONS, MODALITY_LABELS, MOVEMENT_PATTERN_LABELS, MUSCLE_GROUP_LABELS } from '@/app-lib/options';
import { ALL_MUSCLE_GROUPS, GROUP_TO_REGION, type EquipmentType, type Modality, type MovementPattern, type MuscleGroup } from '@/domain/types';

type ExploreTab = 'discover' | 'saved';
type BrowseMode = 'goal' | 'body' | 'equipment';
type RegionFilter = 'all' | 'upper_body' | 'lower_body' | 'core';

const REGION_FILTERS: { value: RegionFilter; label: string }[] = [
  { value: 'all', label: 'Full body' },
  { value: 'upper_body', label: 'Upper body' },
  { value: 'lower_body', label: 'Lower body' },
  { value: 'core', label: 'Core' },
];

const MODALITIES: { value: Modality; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
];

const CARDIO_ART = require('../../assets/images/editorial/explore-cardio-v1.png');

const GOAL_COLLECTIONS: {
  title: string;
  caption: string;
  image: ImageSourcePropType;
  modality?: Modality;
  pattern?: MovementPattern;
  collection?: 'everyday';
}[] = [
  { title: 'Build strength', caption: 'Dumbbells, barbells, and bodyweight', image: require('../../assets/images/editorial/explore-strength-v1.png'), modality: 'strength' },
  { title: 'Find your pace', caption: 'Steady cardio', image: CARDIO_ART, modality: 'cardio' },
  { title: 'Move with ease', caption: 'Mobility and recovery', image: require('../../assets/images/editorial/explore-mobility-v1.png'), modality: 'mobility' },
  { title: 'Move well today', caption: 'Simple full-body options', image: require('../../assets/images/editorial/explore-general-v1.png'), collection: 'everyday' },
];

const MOVEMENT_PATTERNS: MovementPattern[] = ['squat', 'hinge', 'lunge', 'push', 'pull', 'carry', 'core', 'steady_cardio', 'interval', 'stretch', 'yoga_flow'];

const EVERYDAY_EXERCISE_IDS = new Set([
  'sq-bw',
  'pu-incline-pushup',
  'hi-hip-bridge',
  'co-bird-dog',
  'co-plank',
  'ca-brisk-walk-bw',
  'mob-active-hamstring-stretch',
]);

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
  const { spacing } = useTheme();
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
        <Text variant="caption" color="primaryTextSoft" style={{ marginTop: 3 }}>
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
  onPress,
}: {
  title: string;
  caption: string;
  image: ImageSourcePropType;
  onPress: () => void;
}) {
  const { radii, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Explore ${title}`}
      onPress={onPress}
      style={({ pressed }) => ({ width: '48%', minHeight: 144, borderRadius: radii.lg, overflow: 'hidden', opacity: pressed ? 0.8 : 1 })}
    >
      <ImageBackground source={image} style={{ width: '100%', height: '100%', justifyContent: 'flex-end' }} imageStyle={{ borderRadius: radii.lg }}>
        <HeroScrim />
        <View style={{ padding: spacing.md }}>
          <Text variant="subtitle" color="heroText">{title}</Text>
          <Text variant="caption" color="heroMuted" style={{ marginTop: 2 }}>{caption}</Text>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

export default function ExploreScreen() {
  const { spacing } = useTheme();
  const [infoExerciseId, setInfoExerciseId] = useState<string | null>(null);
  const weightUnit = getAthleteProfile()?.weightUnit ?? 'kg';
  const [tab, setTab] = useState<ExploreTab>('discover');
  const [browseMode, setBrowseMode] = useState<BrowseMode>('goal');
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<RegionFilter>('all');
  const [modality, setModality] = useState<Modality | undefined>();
  const [movementPattern, setMovementPattern] = useState<MovementPattern | undefined>();
  const [selectedMuscles, setSelectedMuscles] = useState<MuscleGroup[]>([]);
  const [removedAreaMuscles, setRemovedAreaMuscles] = useState<MuscleGroup[]>([]);
  const [collection, setCollection] = useState<'everyday' | undefined>();
  const [equipment, setEquipment] = useState<EquipmentType | undefined>();
  const [filterOpen, setFilterOpen] = useState(false);
  const [favorites, setFavorites] = useState(() => new Set(getExercisePreferences().favoriteExerciseIds));
  const ownedEquipment = useMemo(() => new Set((getEquipmentInventory()?.items ?? []).map((item) => item.type)), []);

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
      .filter((exercise) => !collection || EVERYDAY_EXERCISE_IDS.has(exercise.id))
      .filter((exercise) => !modality || exercise.modality === modality)
      .filter((exercise) => !movementPattern || exercise.movementPattern === movementPattern)
      .filter((exercise) => effectiveMuscles.length === 0 || exercise.primaryAreas.some((group) => effectiveMuscles.includes(group)))
      .filter((exercise) => !equipment || exercise.equipment.includes(equipment))
      .filter((exercise) => !term || `${exercise.name} ${exercise.description}`.toLowerCase().includes(term))
      .sort((a, b) => {
        const ownedA = a.equipment.some((item) => ownedEquipment.has(item)) ? 1 : 0;
        const ownedB = b.equipment.some((item) => ownedEquipment.has(item)) ? 1 : 0;
        return ownedB - ownedA || a.name.localeCompare(b.name);
      });
  }, [collection, effectiveMuscles, equipment, favorites, modality, movementPattern, ownedEquipment, query, tab]);

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
    setCollection(collection.collection);
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
    if (next !== 'goal') setCollection(undefined);
  }

  function chooseRegion(next: RegionFilter) {
    setCollection(undefined);
    setRegion(next);
  }

  function chooseEquipment(next: EquipmentType) {
    setCollection(undefined);
    setEquipment(equipment === next ? undefined : next);
  }

  function chooseModality(next: Modality) {
    setCollection(undefined);
    setModality(modality === next ? undefined : next);
  }

  function chooseMovementPattern(next: MovementPattern) {
    setCollection(undefined);
    setMovementPattern(movementPattern === next ? undefined : next);
  }

  const activeFilters = [region !== 'all', Boolean(modality), Boolean(movementPattern), Boolean(collection), Boolean(equipment), selectedMuscles.length > 0, removedAreaMuscles.length > 0].filter(Boolean).length;

  return (
    <Screen>
      <View>
        <Text variant="caption" color="primaryTextSoft" weight="bold">MOVE WITH PURPOSE</Text>
        <Text variant="display" style={{ marginTop: 4 }}>Explore movement</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
          Find exercises that fit your body, your goals, and what you have available.
        </Text>
      </View>

      <TabBar
        tabs={[{ value: 'discover' as const, label: 'Discover' }, { value: 'saved' as const, label: `Saved (${favorites.size})` }]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'discover' ? <View style={{ gap: spacing.md }}>
        <Text variant="heading">Browse exercises</Text>
        <TabBar tabs={[{ value: 'goal' as const, label: 'Goal' }, { value: 'body' as const, label: 'Body area' }, { value: 'equipment' as const, label: 'Equipment' }]} value={browseMode} onChange={chooseBrowseMode} />
        {browseMode === 'goal' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {GOAL_COLLECTIONS.map((collection) => <EditorialCollectionCard key={collection.title} {...collection} onPress={() => selectCollection(collection)} />)}
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

      <View style={{ gap: spacing.sm }}>
        <View style={{ position: 'relative' }}>
          <View pointerEvents="none" style={{ position: 'absolute', zIndex: 1, left: spacing.md, top: 13 }}><Icon name="search" color="textFaint" size={19} /></View>
          <TextField value={query} onChangeText={setQuery} placeholder="Search exercises" multiline={false} autoCapitalize="none" style={{ minHeight: 0, paddingLeft: 44, paddingVertical: spacing.md }} />
        </View>
        <Row style={{ justifyContent: 'space-between' }}>
          <Button title={activeFilters ? `Filters (${activeFilters})` : 'Filters'} variant="secondary" size="sm" onPress={() => setFilterOpen(true)} />
          <Text variant="caption" color="textMuted" style={{ alignSelf: 'center' }}>{exercises.length} movements</Text>
        </Row>
      </View>

      <Card>
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
      </Card>

      <SheetModal visible={filterOpen} onClose={() => setFilterOpen(false)} eyebrow="EXPLORE" title="Refine your search" closeLabel="Close filters">
        <Text variant="heading">Training style</Text>
        <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
          {MODALITIES.map((option) => <Chip key={option.value} label={option.label} selected={modality === option.value} onPress={() => chooseModality(option.value)} />)}
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
        <Button title="Show movements" onPress={() => setFilterOpen(false)} fullWidth style={{ marginTop: spacing.xl }} />
      </SheetModal>
      <ExerciseInfoView exerciseId={infoExerciseId} weightUnit={weightUnit} onClose={() => setInfoExerciseId(null)} />
    </Screen>
  );
}
