/**
 * Onboarding form — goals, experience, and standing constraints. Shared body
 * used both by the mandatory first-run flow (`app/onboarding.tsx`, full
 * screen, no profile exists yet) and the "Edit training profile" sheet
 * reached from Settings (prefilled from the existing profile).
 */

import { useMemo, useState } from 'react';
import { View } from 'react-native';

import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';

import { Button, Card, CheckToggle, Chip, GoalChoiceCard, GoalHero, Meter, Row, Stepper, Text, Toggle, toneForWorkoutType, useTheme } from '@/design';
import { TermsSheet } from '@/features/terms-sheet';
import { TERMS_VERSION } from '@/app-lib/terms';
import { PrivacySheet } from '@/features/privacy-sheet';
import { PRIVACY_VERSION } from '@/app-lib/privacy';
import { healthWritePort } from '@/platform/health';
import { getAthleteProfile, saveAthleteProfile } from '@/services/athlete';
import {
  DEFAULT_WARMUP_PREFERENCES,
  DEFAULT_COOLDOWN_PREFERENCES,
  type BiologicalSex,
  type BodyweightEntry,
  type Modality,
  type ResistanceFocus,
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
  CONCERN_OPTIONS,
  EXPERIENCE_OPTIONS,
  GOAL_LEVEL_WEIGHT,
  STRETCH_FOCUS_OPTIONS,
  WORKOUT_TYPE_OPTIONS,
  areaKey,
} from '@/app-lib/options';

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
const MAX_WEEKLY_TARGET = 7;

const MODALITIES: Modality[] = ['strength', 'general', 'cardio', 'mobility'];

const MODALITY_TARGET_OPTIONS: { key: Modality; label: string }[] = [
  { key: 'strength', label: 'Strength' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'mobility', label: 'Mobility' },
  { key: 'general', label: 'General' },
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

export function OnboardingForm({ onSaved }: { onSaved: () => void }) {
  const { colors, spacing, motion } = useTheme();

  const existing = useMemo(() => getAthleteProfile(), []);
  const isEditing = existing != null;

  const [experience, setExperience] = useState<(typeof EXPERIENCE_OPTIONS)[number]['value']>(
    existing?.experience ?? 'intermediate',
  );
  const [priorities, setPriorities] = useState<Set<Modality>>(
    new Set(
      existing
        ? MODALITIES.slice()
            .sort((a, b) => existing.goals.weights[b] - existing.goals.weights[a])
            .slice(0, 2)
        : ['general'],
    ),
  );
  const [resistanceFocus, setResistanceFocus] = useState<ResistanceFocus>(
    existing?.goals.resistanceFocus ?? 'general',
  );
  const [concerns, setConcerns] = useState<Set<string>>(
    new Set((existing?.constraints ?? []).map((c) => areaKey(c.area))),
  );
  const [preferredWorkoutType, setPreferredWorkoutType] = useState<WorkoutType | undefined>(
    existing?.preferredWorkoutType,
  );
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
  const [weeklyTargets, setWeeklyTargets] = useState<Partial<Record<Modality, number>>>(
    existing?.goals.weeklyTargets ?? {},
  );
  const [step, setStep] = useState(0);
  /** Which way the step transition should travel. */
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const totalSteps = 4;

  // One checkbox gates both documents — each still gets its own timestamp/version
  // so a future content change to just one of them can prompt re-acceptance on its own.
  const [legalAccepted, setLegalAccepted] = useState(
    existing?.termsAcceptedAt != null && existing?.privacyAcceptedAt != null,
  );
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const onLastStep = step === totalSteps - 1;

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

  function togglePriority(key: Modality) {
    const next = new Set(priorities);
    if (next.has(key) && next.size > 1) next.delete(key);
    else if (next.size < 2) next.add(key);
    else return;
    setPriorities(next);
  }

  function updateWeeklyTarget(modality: Modality, value: number) {
    setWeeklyTargets((prev) => ({ ...prev, [modality]: value || undefined }));
  }

  function onContinue() {
    if (step < totalSteps - 1) {
      setDirection('forward');
      setStep((current) => current + 1);
      return;
    }
    if (!legalAccepted) return;
    const now = Date.now();
    const rankedPriorities = Array.from(priorities);
    saveAthleteProfile({
      id: 'me',
      experience,
      goals: {
        weights: {
          strength: rankedPriorities[0] === 'strength' ? GOAL_LEVEL_WEIGHT.high : priorities.has('strength') ? 0.5 : GOAL_LEVEL_WEIGHT.medium,
          cardio: rankedPriorities[0] === 'cardio' ? GOAL_LEVEL_WEIGHT.high : priorities.has('cardio') ? 0.5 : GOAL_LEVEL_WEIGHT.medium,
          mobility: rankedPriorities[0] === 'mobility' ? GOAL_LEVEL_WEIGHT.high : priorities.has('mobility') ? 0.5 : GOAL_LEVEL_WEIGHT.medium,
          general: rankedPriorities[0] === 'general' ? GOAL_LEVEL_WEIGHT.high : priorities.has('general') ? 0.5 : GOAL_LEVEL_WEIGHT.medium,
        },
        weeklyTargets,
        resistanceFocus,
      },
      preferredWorkoutType,
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
      termsAcceptedAt: existing?.termsAcceptedAt ?? now,
      termsVersion: TERMS_VERSION,
      privacyAcceptedAt: existing?.privacyAcceptedAt ?? now,
      privacyVersion: PRIVACY_VERSION,
    });
    onSaved();
  }

  return (
    <>
      {!isEditing && step === 0 ? (
        <GoalHero goal="general" eyebrow="WELCOME TO COACHFIT" compact />
      ) : null}
      <View style={{ gap: spacing.xs }}>
        <Text variant="caption" color="textMuted">
          {isEditing ? `YOUR PROFILE · ${step + 1} OF ${totalSteps}` : `YOUR PLAN · ${step + 1} OF ${totalSteps}`}
        </Text>
        <Text variant="display">
          {isEditing
            ? ['Update your basics', 'Refocus your training', 'Make it comfortable', 'Set your cadence'][step]
            : ['Let’s make this yours', 'Choose your outcome', 'Train your way', 'Your plan is taking shape'][step]}
        </Text>
        <Text variant="body" color="textMuted">
          {isEditing
            ? 'Change anything you need. Your next workout will use it.'
            : ['A few quick details help your coach set the right starting point.', 'Pick the result you want most, plus one supporting focus. We’ll tune every session and spotlight the progress that matters.', 'We’ll shape the pace around your body, preferences, and comfort.', 'Choose a realistic rhythm. You can change it any time.'][step]}
        </Text>
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
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="caption" color="primaryTextSoft" weight="bold">PICK UP TO 2</Text>
          <Text variant="caption" color="textMuted">{priorities.size}/2 selected</Text>
        </Row>
        {MODALITIES.map((goal) => (
          <GoalChoiceCard
            key={goal}
            goal={goal}
            selected={priorities.has(goal)}
            selectionLabel={priorities.has(goal) ? (Array.from(priorities)[0] === goal ? 'PRIMARY GOAL' : 'SUPPORTING GOAL') : undefined}
            onPress={() => togglePriority(goal)}
          />
        ))}
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
                onPress={() => setResistanceFocus(option.value)}
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
                onPress={() => setPreferredWorkoutType(o.value)}
              />
            ))}
          </Row>
        </View>
        <Card tone="primarySoft">
          <Text variant="label" color="primaryTextSoft" weight="bold">THIS CHANGES YOUR EXPERIENCE</Text>
          <Text variant="body" color="primaryTextSoft" style={{ marginTop: spacing.xs }}>
            Your home screen, workout recommendations, and progress payoff will all adapt to these goals.
          </Text>
        </Card>
      </View>}

      {step === 2 && <Card>
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
      </Card>}

      {step === 3 && <>
        <GoalHero
          goal={priorities.values().next().value ?? 'general'}
          eyebrow="YOUR PRIMARY FOCUS"
          compact
        />
        <Card>
        <Text variant="heading">Weekly session goals</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
          Give your coach a weekly rhythm. Set 0 for any supporting goal you want us to balance automatically.
        </Text>
        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {MODALITY_TARGET_OPTIONS.map((o) => (
            <Row key={o.key} align="center" style={{ justifyContent: 'space-between' }}>
              <Text variant="body">{o.label}</Text>
              <Stepper
                compact
                value={weeklyTargets[o.key] ?? 0}
                min={0}
                max={MAX_WEEKLY_TARGET}
                onChange={(next) => updateWeeklyTarget(o.key, next)}
                unit="/wk"
              />
            </Row>
          ))}
        </View>
      </Card>
      </>}
      </Animated.View>

      {onLastStep && (
        <Row gap="sm" style={{ alignItems: 'flex-start' }}>
          <CheckToggle
            checked={legalAccepted}
            onPress={() => setLegalAccepted((v) => !v)}
            label="I accept the Terms & Conditions and Privacy Policy"
            shape="box"
            size={26}
          />
          <Text variant="body" color="textMuted" style={{ flex: 1 }}>
            I&apos;ve read and accept the{' '}
            <Text variant="body" color="primary" weight="semibold" onPress={() => setShowTerms(true)}>
              Terms & Conditions
            </Text>
            {' '}and{' '}
            <Text variant="body" color="primary" weight="semibold" onPress={() => setShowPrivacy(true)}>
              Privacy Policy
            </Text>
            .
          </Text>
        </Row>
      )}

      <Row gap="md">
        {step > 0 && <Button title="Back" variant="secondary" onPress={() => { setDirection('back'); setStep((current) => current - 1); }} style={{ flex: 1 }} />}
        <Button
          title={step === totalSteps - 1 ? (isEditing ? 'Save changes' : 'Choose equipment') : 'Continue'}
          onPress={onContinue}
          disabled={onLastStep && !legalAccepted}
          style={{ flex: 1 }}
        />
      </Row>

      <TermsSheet visible={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacySheet visible={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </>
  );
}
