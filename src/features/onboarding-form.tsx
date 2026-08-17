/**
 * Onboarding form — goals, experience, and standing constraints. Shared body
 * used by the mandatory first-run flow (`app/onboarding.tsx`, full screen, no
 * profile exists yet) and, one section at a time via the `section` prop, by
 * the per-section Settings sheets (`profile-sheet.tsx`, `goals-sheet.tsx`,
 * `training-settings-sheet.tsx` — all prefilled from the existing profile).
 */

import { useMemo, useState } from 'react';
import { View } from 'react-native';

import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';

import { Button, Card, Chip, Collapsible, GoalChoiceCard, GoalHero, Meter, Row, Stepper, SubtypeChoiceCard, Text, Toggle, toneForWorkoutType, useTheme } from '@/design';
import { healthWritePort } from '@/platform/health';
import { getAthleteProfile, saveAthleteProfile } from '@/services/athlete';
import {
  DEFAULT_WARMUP_PREFERENCES,
  DEFAULT_COOLDOWN_PREFERENCES,
  type BiologicalSex,
  type BodyweightEntry,
  type CardioIntent,
  type ModalityWeights,
  type ResistanceFocus,
  type RestPacing,
  type WeightUnit,
  type WorkoutType,
} from '@/domain/types';
import {
  BODYWEIGHT_RANGE,
  HEIGHT_RANGE,
  cmToDisplayHeight,
  displayHeightToCm,
  displayWeightToKg,
  formatFeetInches,
  kgToDisplayWeight,
} from '@/app-lib/units';
import {
  CARDIO_INTENT_OPTIONS,
  CONCERN_OPTIONS,
  EXPERIENCE_OPTIONS,
  REST_PACING_OPTIONS,
  STRETCH_FOCUS_OPTIONS,
  WORKOUT_TYPE_OPTIONS,
  areaKey,
} from '@/app-lib/options';
import { primaryGoal } from '@/app-lib/personalization';
import {
  GOAL_PRESETS_BY_ID,
  PRIMARY_GOAL_OPTIONS,
  PRIMARY_GOAL_OPTIONS_BY_ID,
  defaultSubtypeFor,
  resolveInitialGoalSelection,
  subtypesFor,
  type GoalPreset,
  type PrimaryGoalId,
} from '@/app-lib/goal-presets';

// Imperial (lb/ft) listed first — it's the default unit system (§14); metric
// remains one tap away via this same toggle.
const WEIGHT_UNIT_OPTIONS: { label: string; value: WeightUnit }[] = [
  { label: 'lb / ft', value: 'lb' },
  { label: 'kg / cm', value: 'kg' },
];

const RESISTANCE_FOCUS_OPTIONS: { label: string; value: ResistanceFocus }[] = [
  { label: 'General', value: 'general' },
  { label: 'Max strength', value: 'max_strength' },
  { label: 'Muscle growth', value: 'hypertrophy' },
  { label: 'Muscular endurance', value: 'muscular_endurance' },
  { label: 'Power', value: 'power' },
];

const MAX_STRETCH_FOCUS = 3;
const MAX_WEEKLY_TOTAL = 7;

/** "Auto" (no standing preference) composed onto the shared Today-builder
 * options — only meaningful here, where "let it rotate" is a real, valid
 * standing choice; the Today builder's own per-session picker always needs
 * a concrete value, so it uses `CARDIO_INTENT_OPTIONS` unmodified. */
const CARDIO_FORMAT_FIELD_OPTIONS: { label: string; value: CardioIntent | undefined }[] = [
  { label: 'Auto', value: undefined },
  ...CARDIO_INTENT_OPTIONS,
];

const WARMUP_OPTIONS = [
  { label: 'Quick · 5 min', minutes: 5, activities: 1 },
  { label: 'Standard · 8 min', minutes: 8, activities: 2 },
  { label: 'Thorough · 12 min', minutes: 12, activities: 3 },
] as const;

const COOLDOWN_OPTIONS = [
  { label: 'Quick · 5 min', minutes: 5, activities: 1 },
  { label: 'Standard · 8 min', minutes: 8, activities: 2 },
  { label: 'Thorough · 12 min', minutes: 12, activities: 3 },
] as const;

/** Standalone-section titles for the per-section Settings sheets — distinct
 * from the wizard's own step titles below, since a Settings entry point
 * reads as its own screen ("Goals"), not a step in a sequence ("Refocus
 * your training"). */
const SECTION_TITLES = ['Profile', 'Goals', 'Training Settings'] as const;

/**
 * Append today's bodyweight unless it is unchanged from the latest entry —
 * re-opening the profile sheet shouldn't pad the log with duplicates (ADR-0127).
 */
function appendBodyweight(log: BodyweightEntry[] | undefined, kg: number): BodyweightEntry[] {
  const entries = log ?? [];
  const latest = entries[entries.length - 1];
  if (latest && latest.kg === kg) return entries;
  return [...entries, { at: Date.now(), kg }];
}

export function OnboardingForm({
  onSaved,
  section,
}: {
  onSaved: () => void;
  /** Render only this one step's body, standalone (no progress bar, no Back,
   * the primary button always saves) — used by the per-section Settings
   * sheets instead of the full first-run wizard. */
  section?: 0 | 1 | 2;
}) {
  const { colors, spacing, motion } = useTheme();

  const existing = useMemo(() => getAthleteProfile(), []);
  const isEditing = existing != null;

  const [experience, setExperience] = useState<(typeof EXPERIENCE_OPTIONS)[number]['value']>(
    existing?.experience ?? 'intermediate',
  );
  const initialGoalSelection = useMemo(() => resolveInitialGoalSelection(existing), [existing]);
  const initialPreset = GOAL_PRESETS_BY_ID[initialGoalSelection.subtypePresetId];
  const [primaryGoalId, setPrimaryGoalId] = useState<PrimaryGoalId>(initialGoalSelection.primaryGoalId);
  const [subtypePresetId, setSubtypePresetId] = useState<string>(initialGoalSelection.subtypePresetId);
  const [fineTuneExpanded, setFineTuneExpanded] = useState(isEditing);

  const [weights, setWeights] = useState<ModalityWeights>(existing?.goals.weights ?? initialPreset.resolve.weights);
  const [resistanceFocus, setResistanceFocus] = useState<ResistanceFocus | undefined>(
    existing?.goals.resistanceFocus ?? initialPreset.resolve.resistanceFocus,
  );
  const [resistanceFocusTouched, setResistanceFocusTouched] = useState(false);
  const [concerns, setConcerns] = useState<Set<string>>(
    new Set((existing?.constraints ?? []).map((c) => areaKey(c.area))),
  );
  const [preferredWorkoutType, setPreferredWorkoutType] = useState<WorkoutType | undefined>(
    existing?.preferredWorkoutType ?? initialPreset.resolve.preferredWorkoutType,
  );
  const [preferredWorkoutTypeTouched, setPreferredWorkoutTypeTouched] = useState(false);
  const [preferredCardioIntent, setPreferredCardioIntent] = useState<CardioIntent | undefined>(
    existing?.preferredCardioIntent ?? initialPreset.resolve.preferredCardioIntent,
  );
  const [preferredCardioIntentTouched, setPreferredCardioIntentTouched] = useState(false);
  const [restPacing, setRestPacing] = useState<RestPacing | undefined>(
    existing?.goals.restPacing ?? initialPreset.resolve.restPacing,
  );
  const [restPacingTouched, setRestPacingTouched] = useState(false);
  const [bodyweightKg, setBodyweightKg] = useState(existing?.bodyweightKg ?? 75);
  // ADR-0127: all optional. Left blank, the app behaves exactly as before.
  const [birthYear, setBirthYear] = useState<number | undefined>(existing?.birthYear);
  const [heightCm, setHeightCm] = useState<number | undefined>(existing?.heightCm);
  const [sex, setSex] = useState<BiologicalSex | undefined>(existing?.sex);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(existing?.weightUnit ?? 'lb');
  const [healthSyncEnabled, setHealthSyncEnabled] = useState(existing?.healthSyncEnabled ?? false);
  const healthSyncAvailable = useMemo(() => healthWritePort.isSupported(), []);

  function toggleHealthSync(next: boolean) {
    setHealthSyncEnabled(next);
    // Ask the OS for write permission right away rather than waiting for the
    // first completed workout, so the athlete sees the system prompt in the
    // same moment they said yes here.
    if (next) void healthWritePort.requestWriteAuthorization();
  }

  const warmupExisting = existing?.warmup ?? DEFAULT_WARMUP_PREFERENCES;
  const [warmupMinutes, setWarmupMinutes] = useState(warmupExisting.totalMinutes);
  const [warmupCount, setWarmupCount] = useState(warmupExisting.activityCount);
  const [stretchFocus, setStretchFocus] = useState<Set<string>>(
    new Set(warmupExisting.focus.map(areaKey)),
  );

  const cooldownExisting = existing?.cooldown ?? DEFAULT_COOLDOWN_PREFERENCES;
  const [cooldownMinutes, setCooldownMinutes] = useState(cooldownExisting.totalMinutes);
  const [cooldownCount, setCooldownCount] = useState(cooldownExisting.activityCount);
  const [cooldownFocus, setCooldownFocus] = useState<Set<string>>(
    new Set(cooldownExisting.focus.map(areaKey)),
  );
  const [weeklyTotalTarget, setWeeklyTotalTarget] = useState(existing?.goals.weeklyTotalTarget ?? 0);
  const [step, setStep] = useState<number>(section ?? 0);
  /** Which way the step transition should travel. */
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const totalSteps = 3;
  // A section sheet only ever shows the one step it was opened for — there's
  // no sequence to advance through, so its single step always behaves like
  // the wizard's last one (Save, not Continue).
  const isLastStep = section != null || step === totalSteps - 1;

  function toggleConcern(key: string) {
    setConcerns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleStretchFocus(key: string) {
    setStretchFocus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < MAX_STRETCH_FOCUS) next.add(key);
      return next;
    });
  }

  function toggleCooldownFocus(key: string) {
    setCooldownFocus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < MAX_STRETCH_FOCUS) next.add(key);
      return next;
    });
  }

  /** Populates any *untouched* fine-tune field from a newly-selected preset —
   * a field a user has directly edited keeps its manual value across later
   * primary/subtype changes (its own handler is what sets its touched flag).
   * `weights` has no manual override left in the UI, so it always follows
   * the preset. */
  function applyPreset(preset: GoalPreset) {
    setWeights(preset.resolve.weights);
    if (!resistanceFocusTouched) setResistanceFocus(preset.resolve.resistanceFocus);
    if (!preferredWorkoutTypeTouched) setPreferredWorkoutType(preset.resolve.preferredWorkoutType);
    if (!preferredCardioIntentTouched) setPreferredCardioIntent(preset.resolve.preferredCardioIntent);
    if (!restPacingTouched) setRestPacing(preset.resolve.restPacing);
  }

  function selectPrimaryGoal(id: PrimaryGoalId) {
    if (id === primaryGoalId) return;
    const subtype = defaultSubtypeFor(id);
    setPrimaryGoalId(id);
    setSubtypePresetId(subtype.id);
    applyPreset(subtype);
  }

  function selectSubtype(preset: GoalPreset) {
    setSubtypePresetId(preset.id);
    applyPreset(preset);
  }

  function selectResistanceFocus(value: ResistanceFocus) {
    setResistanceFocus(value);
    setResistanceFocusTouched(true);
  }

  function selectWorkoutType(value: WorkoutType | undefined) {
    setPreferredWorkoutType(value);
    setPreferredWorkoutTypeTouched(true);
  }

  function selectCardioIntent(value: CardioIntent | undefined) {
    setPreferredCardioIntent(value);
    setPreferredCardioIntentTouched(true);
  }

  function selectRestPacing(value: RestPacing) {
    setRestPacing(value);
    setRestPacingTouched(true);
  }

  function onContinue() {
    if (!isLastStep) {
      setDirection('forward');
      setStep((current) => current + 1);
      return;
    }
    const now = Date.now();
    saveAthleteProfile({
      id: 'me',
      experience,
      goals: {
        weights,
        weeklyTargets: existing?.goals.weeklyTargets,
        weeklyTotalTarget: weeklyTotalTarget || undefined,
        resistanceFocus,
        presetId: subtypePresetId,
        restPacing,
      },
      preferredWorkoutType,
      preferredCardioIntent,
      maxDay: existing?.maxDay,
      constraints: CONCERN_OPTIONS.filter((c) => concerns.has(areaKey(c.area))).map((c) => ({
        area: c.area,
        severity: 'limit',
      })),
      bodyweightKg,
      // ADR-0127: keep a dated series alongside the current scalar, so a
      // weight-loss goal is trackable and past sessions' calorie estimates
      // stop being rewritten every time this number is edited.
      bodyweightLog: appendBodyweight(existing?.bodyweightLog, bodyweightKg),
      birthYear,
      heightCm,
      sex,
      weightUnit,
      healthSyncEnabled,
      warmup: {
        totalMinutes: warmupMinutes,
        activityCount: warmupCount,
        focus: STRETCH_FOCUS_OPTIONS.filter((o) => stretchFocus.has(areaKey(o.area))).map(
          (o) => o.area,
        ),
      },
      cooldown: {
        totalMinutes: cooldownMinutes,
        activityCount: cooldownCount,
        focus: STRETCH_FOCUS_OPTIONS.filter((o) => cooldownFocus.has(areaKey(o.area))).map(
          (o) => o.area,
        ),
      },
      // Only an initial profile starts the app tour. Reopening this shared
      // form from Settings must never turn an established athlete into a
      // first-run athlete again.
      appTour: existing?.appTour ?? (!isEditing ? { eligibleAt: now } : undefined),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      // Terms/privacy acceptance is captured on the equipment screen (the
      // first-run flow's last step), never here — pass through unchanged.
      termsAcceptedAt: existing?.termsAcceptedAt,
      termsVersion: existing?.termsVersion,
      privacyAcceptedAt: existing?.privacyAcceptedAt,
      privacyVersion: existing?.privacyVersion,
    });
    onSaved();
  }

  return (
    <>
      {!isEditing && step === 0 ? (
        <GoalHero goal="general" eyebrow="WELCOME TO COACHFIT" compact />
      ) : null}
      <View style={{ gap: spacing.xs }}>
        {section == null && (
          <Text variant="caption" color="textMuted">
            {isEditing ? `YOUR PROFILE · ${step + 1} OF ${totalSteps}` : `YOUR PLAN · ${step + 1} OF ${totalSteps}`}
          </Text>
        )}
        <Text variant="display">
          {section != null
            ? SECTION_TITLES[step]
            : isEditing
              ? ['Update your basics', 'Refocus your training', 'Training Settings'][step]
              : ['Let’s make this yours', 'Choose your outcome', 'Training Settings'][step]}
        </Text>
        <Text variant="body" color="textMuted">
          {section != null || isEditing
            ? 'Change anything you need. Your next workout will use it.'
            : [
                'A few quick details help your coach set the right starting point.',
                'Pick the result you want most, plus one supporting focus. We’ll tune every session and spotlight the progress that matters.',
                'We’ll shape the pace around your body, preferences, comfort, and how often you want to train.',
              ][step]}
        </Text>
        {section == null && (
          <Row gap="xs" style={{ marginTop: spacing.sm }}>
            {/* Each segment fills rather than recoloring, so the wizard reads as
                progress being made rather than as a set of lights (ADR-0130). */}
            {Array.from({ length: totalSteps }, (_, index) => (
              <View
                key={index}
                style={{ height: 5, flex: 1, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' }}
              >
                <Meter value={index <= step ? 1 : 0} max={1} style={{ height: 5 }} />
              </View>
            ))}
          </Row>
        )}
      </View>

      {/* The step body slides in from the direction of travel; the header and
          progress bar above stay put so the wizard has a fixed frame. */}
      <Animated.View
        key={step}
        entering={
          motion.enabled
            ? (direction === 'back' ? FadeInLeft : FadeInRight).duration(motion.duration.slow)
            : undefined
        }
        style={{ gap: spacing.lg }}
      >
      {step === 0 && <Card>
        <Text variant="heading">Your experience</Text>
        <Row gap="sm" wrap style={{ marginTop: spacing.md }}>
          {EXPERIENCE_OPTIONS.map((o) => <Chip key={o.value} label={o.label} selected={experience === o.value} onPress={() => setExperience(o.value)} />)}
        </Row>
        {/* Units picker only on first-run; once a profile exists, Settings owns units. */}
        {!isEditing && <>
          <Text variant="heading" style={{ marginTop: spacing.xl }}>Units</Text>
          <Row gap="sm" style={{ marginTop: spacing.md }}>
            {WEIGHT_UNIT_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                selected={weightUnit === o.value}
                onPress={() => setWeightUnit(o.value)}
              />
            ))}
          </Row>
        </>}
        <Text variant="heading" style={{ marginTop: spacing.xl }}>Bodyweight</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>A rough number helps estimate workout energy.</Text>
        <Stepper
          value={kgToDisplayWeight(bodyweightKg, weightUnit)}
          onChange={(v) => setBodyweightKg(displayWeightToKg(v, weightUnit))}
          min={BODYWEIGHT_RANGE[weightUnit].min}
          max={BODYWEIGHT_RANGE[weightUnit].max}
          unit={weightUnit}
          style={{ marginTop: spacing.md, maxWidth: 260 }}
        />
        <Text variant="heading" style={{ marginTop: spacing.xl }}>About you <Text variant="body" color="textMuted">(optional)</Text></Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
          Age helps us judge how long you need to recover. Height and sex only sharpen the calorie estimate — they never change your programming.
        </Text>
        <Text variant="caption" color="textFaint" weight="bold" style={{ marginTop: spacing.md }}>YEAR OF BIRTH</Text>
        <Stepper
          value={birthYear ?? 1990}
          onChange={setBirthYear}
          min={1920}
          max={new Date().getFullYear() - 12}
          style={{ marginTop: spacing.sm, maxWidth: 260 }}
        />
        <Text variant="caption" color="textFaint" weight="bold" style={{ marginTop: spacing.md }}>
          {weightUnit === 'lb' ? 'HEIGHT (FT)' : 'HEIGHT (CM)'}
        </Text>
        <Stepper
          value={cmToDisplayHeight(heightCm ?? 170, weightUnit)}
          onChange={(v) => setHeightCm(displayHeightToCm(v, weightUnit))}
          min={HEIGHT_RANGE[weightUnit].min}
          max={HEIGHT_RANGE[weightUnit].max}
          unit={weightUnit === 'lb' ? 'in' : 'cm'}
          displayValue={weightUnit === 'lb' ? formatFeetInches(cmToDisplayHeight(heightCm ?? 170, weightUnit)) : undefined}
          style={{ marginTop: spacing.sm, maxWidth: 260 }}
        />
        <Text variant="caption" color="textFaint" weight="bold" style={{ marginTop: spacing.md }}>SEX</Text>
        <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>
          {(['female', 'male', 'unspecified'] as const).map((option) => (
            <Chip
              key={option}
              label={option === 'unspecified' ? 'Prefer not to say' : option === 'female' ? 'Female' : 'Male'}
              selected={sex === option}
              onPress={() => setSex(sex === option ? undefined : option)}
            />
          ))}
        </Row>
        {healthSyncAvailable && (
          <>
            <Text variant="heading" style={{ marginTop: spacing.xl }}>Apple Health</Text>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
              <View style={{ flex: 1, paddingRight: spacing.md }}>
                <Text variant="body" color="textMuted">
                  Send completed workouts to Apple Health. You can change this any time in Settings.
                </Text>
              </View>
              <Toggle value={healthSyncEnabled} onChange={toggleHealthSync} label="Sync to Apple Health" />
            </Row>
          </>
        )}
      </Card>}

      {step === 1 && <View style={{ gap: spacing.md }}>
        <Text variant="caption" color="primaryTextSoft" weight="bold">PICK ONE</Text>
        {PRIMARY_GOAL_OPTIONS.map((option) => (
          <View key={option.id} style={{ gap: spacing.md }}>
            <GoalChoiceCard
              image={option.cardImage}
              icon={option.icon}
              tone={option.tone}
              label={option.label}
              promise={option.promise}
              selected={primaryGoalId === option.id}
              onPress={() => selectPrimaryGoal(option.id)}
            />
            {primaryGoalId === option.id && (
              <View style={{ gap: spacing.sm }}>
                <Text variant="caption" color="textFaint" weight="bold">{option.subtypePrompt}</Text>
                <Row gap="sm" wrap>
                  {subtypesFor(primaryGoalId).map((preset) => (
                    <SubtypeChoiceCard
                      key={preset.id}
                      image={preset.cardImage}
                      label={preset.label}
                      selected={subtypePresetId === preset.id}
                      onPress={() => selectSubtype(preset)}
                      tone={option.tone}
                      style={{ flexBasis: '47%', flexGrow: 1 }}
                    />
                  ))}
                </Row>
                <Text variant="body" color="textMuted">{GOAL_PRESETS_BY_ID[subtypePresetId].description}</Text>
              </View>
            )}
          </View>
        ))}

        <Collapsible
          expanded={fineTuneExpanded}
          onToggle={() => setFineTuneExpanded((v) => !v)}
          header={<Text variant="label" weight="bold">Fine-tune (optional)</Text>}
        >
          <View style={{ gap: spacing.lg }}>
            <View style={{ gap: spacing.sm }}>
              <Text variant="caption" color="textFaint" weight="bold">RESISTANCE OUTCOME</Text>
              <Text variant="body" color="textMuted">
                Sets the regular working range. Workout style changes structure, not this outcome.
              </Text>
              <Row gap="sm" wrap>
                {RESISTANCE_FOCUS_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={resistanceFocus === option.value}
                    onPress={() => selectResistanceFocus(option.value)}
                  />
                ))}
              </Row>
            </View>
            <View style={{ gap: spacing.sm }}>
              <Text variant="caption" color="textFaint" weight="bold">PREFERRED WORKOUT STYLE (OPTIONAL)</Text>
              <Text variant="body" color="textMuted">
                Sets the default on the Today screen — you can still change it for any individual session.
              </Text>
              <Row gap="sm" wrap>
                {WORKOUT_TYPE_OPTIONS.map((o) => (
                  <Chip
                    key={o.label}
                    label={o.label}
                    tone={toneForWorkoutType(o.value)}
                    selected={preferredWorkoutType === o.value}
                    onPress={() => selectWorkoutType(o.value)}
                  />
                ))}
              </Row>
            </View>
            <View style={{ gap: spacing.sm }}>
              <Text variant="caption" color="textFaint" weight="bold">CARDIO FORMAT (OPTIONAL)</Text>
              <Text variant="body" color="textMuted">
                Sets the default Structure for cardio sessions — steady, circuit, or interval. Auto
                lets it vary across the week instead of leaning one way.
              </Text>
              <Row gap="sm" wrap>
                {CARDIO_FORMAT_FIELD_OPTIONS.map((o) => (
                  <Chip
                    key={o.label}
                    label={o.label}
                    selected={preferredCardioIntent === o.value}
                    onPress={() => selectCardioIntent(o.value)}
                  />
                ))}
              </Row>
            </View>
            <View style={{ gap: spacing.sm }}>
              <Text variant="caption" color="textFaint" weight="bold">PACING (OPTIONAL)</Text>
              <Text variant="body" color="textMuted">
                Dense trades some recovery for a busier, faster-paced session — never on a genuinely
                heavy or test set, which always keeps full rest.
              </Text>
              <Row gap="sm" wrap>
                {REST_PACING_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    selected={restPacing === o.value}
                    onPress={() => selectRestPacing(o.value)}
                  />
                ))}
              </Row>
            </View>
          </View>
        </Collapsible>
      </View>}

      {step === 2 && <>
        <GoalHero
          goal={primaryGoal({ weights })}
          eyebrow="YOUR PRIMARY FOCUS"
          compact
        />
        <Card>
          <Text variant="caption" color="primaryTextSoft" weight="bold">YOUR COMFORT SETTINGS</Text>
          <Text variant="heading" style={{ marginTop: spacing.xs }}>Warm up your way</Text>
          <Text variant="caption" color="textFaint" style={{ marginTop: spacing.lg }}>WARMUP STYLE</Text>
          <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>{WARMUP_OPTIONS.map((option) => <Chip key={option.minutes} label={option.label} selected={warmupMinutes === option.minutes} onPress={() => { setWarmupMinutes(option.minutes); setWarmupCount(option.activities); }} />)}</Row>
          <Text variant="caption" color="textFaint" style={{ marginTop: spacing.lg }}>MOBILITY FOCUS (UP TO {MAX_STRETCH_FOCUS})</Text>
          <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>{STRETCH_FOCUS_OPTIONS.map((o) => { const key = areaKey(o.area); return <Chip key={key} label={o.label} selected={stretchFocus.has(key)} onPress={() => toggleStretchFocus(key)} />; })}</Row>
          <Text variant="heading" style={{ marginTop: spacing.xl }}>Cool down your way</Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>Stretches and foam-rolling to close out every session.</Text>
          <Text variant="caption" color="textFaint" style={{ marginTop: spacing.lg }}>COOLDOWN STYLE</Text>
          <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>{COOLDOWN_OPTIONS.map((option) => <Chip key={option.minutes} label={option.label} selected={cooldownMinutes === option.minutes} onPress={() => { setCooldownMinutes(option.minutes); setCooldownCount(option.activities); }} />)}</Row>
          <Text variant="caption" color="textFaint" style={{ marginTop: spacing.lg }}>COOLDOWN FOCUS (UP TO {MAX_STRETCH_FOCUS})</Text>
          <Row gap="sm" wrap style={{ marginTop: spacing.sm }}>{STRETCH_FOCUS_OPTIONS.map((o) => { const key = areaKey(o.area); return <Chip key={key} label={o.label} selected={cooldownFocus.has(key)} onPress={() => toggleCooldownFocus(key)} />; })}</Row>
          <Text variant="heading" style={{ marginTop: spacing.xl }}>Anything to work around?</Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>We’ll account for these in every workout. You can make day-to-day adjustments later.</Text>
          <Row gap="sm" wrap style={{ marginTop: spacing.md }}>{CONCERN_OPTIONS.map((c) => { const key = areaKey(c.area); return <Chip key={key} label={c.label} selected={concerns.has(key)} onPress={() => toggleConcern(key)} />; })}</Row>
        </Card>
        <Card>
          <Text variant="heading">Total weekly workouts</Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
            Set 0 to let your coach balance this automatically based on your experience and goals.
          </Text>
          <Row align="center" style={{ justifyContent: 'space-between', marginTop: spacing.lg }}>
            <Text variant="body">Sessions per week</Text>
            <Stepper
              compact
              value={weeklyTotalTarget}
              min={0}
              max={MAX_WEEKLY_TOTAL}
              onChange={setWeeklyTotalTarget}
              unit="/wk"
            />
          </Row>
        </Card>
      </>}
      </Animated.View>

      <Row gap="md">
        {step > 0 && section == null && <Button title="Back" variant="secondary" onPress={() => { setDirection('back'); setStep((current) => current - 1); }} style={{ flex: 1 }} />}
        <Button
          title={isLastStep ? (isEditing ? 'Save changes' : 'Choose equipment') : 'Continue'}
          onPress={onContinue}
          style={{ flex: 1 }}
        />
      </Row>
    </>
  );
}
