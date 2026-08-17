/**
 * Settings — theme preference (demonstrates the design system's swappability,
 * ADR-0110) plus entry points to edit the profile and equipment set up during
 * onboarding. Single-user app for now (CLAUDE.md), so this is a light screen.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { ActionRow, Card, Chip, Icon, Row, Screen, Text, Toggle, useTheme } from '@/design';
import type { SchemePreference } from '@/design';
import { EquipmentSheet } from '@/features/equipment-sheet';
import { EquipmentProfilesSheet } from '@/features/equipment-profiles-sheet';
import { ExerciseCatalogSheet } from '@/features/exercise-catalog-sheet';
import { GoalsSheet } from '@/features/goals-sheet';
import { HelpSheet } from '@/features/help-sheet';
import { MetricsGuideSheet } from '@/features/metrics-guide-sheet';
import { ProfileSheet } from '@/features/profile-sheet';
import { TrainingSettingsSheet } from '@/features/training-settings-sheet';
import { TermsSheet } from '@/features/terms-sheet';
import { PrivacySheet } from '@/features/privacy-sheet';
import { healthWritePort } from '@/platform/health';
import { notificationPort } from '@/platform/notifications';
import { getAthleteProfile, saveAthleteProfile } from '@/services/athlete';
import { getEquipmentInventory, hasEquipmentInventory } from '@/services/equipment';
import { listEquipmentProfiles } from '@/services/equipment-profiles';
import { getExercisePreferences, setTimerSoundEnabled, setWorkoutComponentDefaults } from '@/services/exercise-preferences';
import { refreshReminders } from '@/services/reminders';
import { EXPERIENCE_OPTIONS } from '@/app-lib/options';
import type { HelpDestination } from '@/features/help-content';
import type { WeightUnit } from '@/domain/types';

const THEME_OPTIONS: { label: string; value: SchemePreference }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

const WEIGHT_UNIT_OPTIONS: { label: string; value: WeightUnit }[] = [
  { label: 'Kilograms (kg)', value: 'kg' },
  { label: 'Pounds (lb)', value: 'lb' },
];

export default function SettingsScreen() {
  const { spacing, preference, setPreference } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ catalog?: string; exercise?: string; howto?: string; profile?: string; equipment?: string }>();

  const [profile, setProfile] = useState(() => getAthleteProfile());
  const [equipment, setEquipment] = useState(() => getEquipmentInventory());
  const [profileCount, setProfileCount] = useState(() => listEquipmentProfiles().length);
  const [excludedCount, setExcludedCount] = useState(() => getExercisePreferences().excludedExerciseIds.length);
  const [timerSoundEnabled, setTimerSound] = useState(() => getExercisePreferences().timerSoundEnabled);
  const [defaultIncludeWarmup, setDefaultIncludeWarmup] = useState(() => getExercisePreferences().defaultIncludeWarmup);
  const [defaultIncludeConditioning, setDefaultIncludeConditioning] = useState(() => getExercisePreferences().defaultIncludeConditioning);
  const [defaultIncludeCooldown, setDefaultIncludeCooldown] = useState(() => getExercisePreferences().defaultIncludeCooldown);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(profile?.weightUnit ?? 'kg');
  const healthSyncAvailable = useMemo(() => healthWritePort.isSupported(), []);
  const [healthSyncEnabled, setHealthSyncEnabled] = useState(profile?.healthSyncEnabled ?? false);
  const notificationsAvailable = useMemo(() => notificationPort.isSupported(), []);
  const [notificationsEnabled, setNotificationsEnabled] = useState(profile?.notificationsEnabled ?? false);
  const [showExerciseCatalog, setShowExerciseCatalog] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showMetricsGuide, setShowMetricsGuide] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [showTrainingSettings, setShowTrainingSettings] = useState(false);
  const [showEquipment, setShowEquipment] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | undefined>(undefined);
  const [showProfiles, setShowProfiles] = useState(false);
  const [profilesAction, setProfilesAction] = useState<'create' | undefined>(undefined);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Keeps the catalog reachable from a shared CoachFit link as well as the
  // Settings button. This is useful when pointing an athlete directly to the
  // place where they can refine what the generator uses.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- route params intentionally open this controlled sheet
    if (params.catalog === '1') setShowExerciseCatalog(true);
  }, [params.catalog]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- route params intentionally open this controlled sheet
    if (params.profile === '1') setShowProfile(true);
  }, [params.profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- route params intentionally open this controlled sheet
    if (params.equipment === '1') setShowEquipment(true);
  }, [params.equipment]);

  function openHelpDestination(destination: HelpDestination) {
    setShowHelp(false);
    if (destination === 'today') {
      router.push({ pathname: '/', params: { scrollTo: 'build' } });
      return;
    }
    if (destination === 'explore') {
      router.push('/explore' as never);
      return;
    }
    if (destination === 'progress') {
      router.push('/progress' as never);
      return;
    }
    router.push({
      pathname: '/settings',
      params: destination === 'profile'
        ? { profile: '1' }
        : destination === 'catalog'
          ? { catalog: '1' }
          : { equipment: '1' },
    });
  }

  function updateWeightUnit(unit: WeightUnit) {
    setWeightUnit(unit);
    if (profile) {
      const next = { ...profile, weightUnit: unit };
      saveAthleteProfile(next);
      setProfile(next);
    }
  }

  function updateTimerSound(enabled: boolean) {
    setTimerSound(enabled);
    setTimerSoundEnabled(enabled);
  }

  function updateDefaultIncludeWarmup(enabled: boolean) {
    setDefaultIncludeWarmup(enabled);
    setWorkoutComponentDefaults({ defaultIncludeWarmup: enabled });
  }

  function updateDefaultIncludeConditioning(enabled: boolean) {
    setDefaultIncludeConditioning(enabled);
    setWorkoutComponentDefaults({ defaultIncludeConditioning: enabled });
  }

  function updateDefaultIncludeCooldown(enabled: boolean) {
    setDefaultIncludeCooldown(enabled);
    setWorkoutComponentDefaults({ defaultIncludeCooldown: enabled });
  }

  function updateHealthSync(enabled: boolean) {
    setHealthSyncEnabled(enabled);
    if (profile) {
      const next = { ...profile, healthSyncEnabled: enabled };
      saveAthleteProfile(next);
      setProfile(next);
    }
    if (enabled) void healthWritePort.requestWriteAuthorization();
  }

  function updateNotifications(enabled: boolean) {
    setNotificationsEnabled(enabled);
    if (profile) {
      const next = { ...profile, notificationsEnabled: enabled };
      saveAthleteProfile(next);
      setProfile(next);
    }
    if (enabled) void notificationPort.requestPermission();
    void refreshReminders();
  }

  function refreshEquipmentSummaries() {
    setEquipment(getEquipmentInventory());
    setProfileCount(listEquipmentProfiles().length);
  }

  function refreshProfileSummaries() {
    const next = getAthleteProfile();
    setProfile(next);
    setWeightUnit(next?.weightUnit ?? 'kg');
    setHealthSyncEnabled(next?.healthSyncEnabled ?? false);
    setNotificationsEnabled(next?.notificationsEnabled ?? false);
  }

  const experienceLabel = EXPERIENCE_OPTIONS.find((o) => o.value === profile?.experience)?.label;

  return (
    <Screen>
      <View><Text variant="display" italic>Settings</Text></View>

      <Card tone="primarySoft" elevated>
        <Text variant="caption" color="primaryTextSoft" weight="bold">
          YOUR TRAINING PROFILE
        </Text>
        <Text variant="heading" color="primaryTextSoft" style={{ marginTop: spacing.xs }}>
          {profile ? `${experienceLabel} profile` : 'Finish setup'}
        </Text>
        <Text variant="body" color="primaryTextSoft" style={{ marginTop: spacing.xs }}>
          {profile
            ? `${profile.constraints.length ? `${profile.constraints.length} consideration${profile.constraints.length === 1 ? '' : 's'} built in` : 'No standing limitations'} · ${equipment?.items.length ?? 0} equipment options`
            : 'Set your goals, constraints, and available equipment.'}
        </Text>
        <Text variant="caption" color="primaryTextSoft" style={{ marginTop: spacing.md }}>
          Goals, experience, warm-up, constraints, weekly targets, max-day cadence, and equipment.
        </Text>
        <ActionRow
          label="Profile"
          description="Experience, bodyweight, and about-you details"
          icon={<Icon name="target" color="primaryTextSoft" />}
          onPress={() => setShowProfile(true)}
          style={{ marginTop: spacing.lg }}
        />
        <ActionRow
          label="Goals"
          description="Primary focus, subtype, and fine-tuning"
          icon={<Icon name="target" color="primaryTextSoft" />}
          onPress={() => setShowGoals(true)}
          style={{ marginTop: spacing.sm }}
        />
        <ActionRow
          label="Training Settings"
          description="Warm-up, cooldown, constraints, and weekly cadence"
          icon={<Icon name="target" color="primaryTextSoft" />}
          onPress={() => setShowTrainingSettings(true)}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      <Card>
        <Text variant="heading">Equipment profile</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
          {equipment
            ? `${equipment.items.length} equipment option${equipment.items.length === 1 ? '' : 's'} in the active profile · ${profileCount} profile${profileCount === 1 ? '' : 's'} saved`
            : 'Set up your training space'}
        </Text>
        <ActionRow
          label="Edit profile"
          description="Change what equipment the active profile has"
          icon={<Icon name="workout" color="primaryTextSoft" />}
          onPress={() => {
            setEditingProfileId(undefined);
            setShowEquipment(true);
          }}
          style={{ marginTop: spacing.lg }}
        />
        <ActionRow
          label="Add new profile"
          description="Create a profile for a new space — home, gym, travel…"
          icon={<Icon name="add" color="primaryTextSoft" />}
          onPress={() => {
            setProfilesAction('create');
            setShowProfiles(true);
          }}
          style={{ marginTop: spacing.sm }}
        />
        <ActionRow
          label="Switch default"
          description={`${profileCount} equipment profile${profileCount === 1 ? '' : 's'} · Home, gym, travel…`}
          icon={<Icon name="rotation" color="primaryTextSoft" />}
          onPress={() => {
            setProfilesAction(undefined);
            setShowProfiles(true);
          }}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      {/* Units + Appearance are small toggles — one "Preferences" card instead
          of two full-width cards halves the scroll here. */}
      <Card>
        <Text variant="heading">Preferences</Text>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
          <Text variant="body">Units</Text>
          <Row gap="sm">
            {WEIGHT_UNIT_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.value === 'kg' ? 'kg' : 'lb'}
                selected={weightUnit === o.value}
                onPress={() => updateWeightUnit(o.value)}
              />
            ))}
          </Row>
        </Row>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
          <Text variant="body">Appearance</Text>
          <Row gap="sm">
            {THEME_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                selected={preference === o.value}
                onPress={() => setPreference(o.value)}
              />
            ))}
          </Row>
        </Row>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text variant="body">Timer sound</Text>
            <Text variant="caption" color="textMuted">Play a short ping when a countdown ends.</Text>
          </View>
          <Toggle
            value={timerSoundEnabled}
            onChange={updateTimerSound}
            label="Timer sound"
          />
        </Row>
        {notificationsAvailable && (
          <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text variant="body">Reminders</Text>
              <Text variant="caption" color="textMuted">
                A nudge for today&apos;s session, a check-in if it&apos;s been a few days, and a reminder to keep an active streak going.
              </Text>
            </View>
            <Toggle value={notificationsEnabled} onChange={updateNotifications} label="Reminder notifications" />
          </Row>
        )}
      </Card>

      <Card>
        <Text variant="heading">Workout defaults</Text>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
          <Text variant="body">Warmup</Text>
          <Toggle value={defaultIncludeWarmup} onChange={updateDefaultIncludeWarmup} label="Include warmup by default" />
        </Row>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
          <Text variant="body">Conditioning</Text>
          <Toggle value={defaultIncludeConditioning} onChange={updateDefaultIncludeConditioning} label="Include conditioning by default" />
        </Row>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
          <Text variant="body">Cool down</Text>
          <Toggle value={defaultIncludeCooldown} onChange={updateDefaultIncludeCooldown} label="Include cool down by default" />
        </Row>
      </Card>

      {healthSyncAvailable && (
        <Card>
          <Text variant="heading">Apple Health</Text>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text variant="body" color="textMuted">
                Send completed workouts to Apple Health.
              </Text>
            </View>
            <Toggle value={healthSyncEnabled} onChange={updateHealthSync} label="Sync to Apple Health" />
          </Row>
        </Card>
      )}

      <Card>
        <Text variant="heading">Exercise catalog</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
          {excludedCount > 0
            ? `${excludedCount} exercise${excludedCount === 1 ? '' : 's'} excluded from workouts and swaps`
            : 'Search, filter, and exclude exercises you never want to see.'}
        </Text>
        <ActionRow
          label="Browse exercise catalog"
          description={excludedCount > 0 ? `${excludedCount} exercise${excludedCount === 1 ? '' : 's'} excluded` : 'Search and refine exercises'}
          icon={<Icon name="search" color="primaryTextSoft" />}
          onPress={() => setShowExerciseCatalog(true)}
          style={{ marginTop: spacing.lg }}
        />
      </Card>

      <Card>
        <Text variant="heading">Help</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
          Quick guides for personalizing your plan, editing a workout, and understanding your metrics.
        </Text>
        <ActionRow
          label="Open Help & guide"
          description="Plan settings, workout editing, equipment, and metrics"
          icon={<Icon name="checkin" color="primaryTextSoft" />}
          onPress={() => setShowHelp(true)}
          style={{ marginTop: spacing.lg }}
        />
      </Card>

      <Card>
        <Text variant="heading">Legal</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
          Assumption of risk, liability, and how the app&apos;s estimates are calculated.
        </Text>
        <ActionRow
          label="Terms & Conditions"
          description="Risk, liability, and training estimates"
          icon={<Icon name="checkAll" color="primaryTextSoft" />}
          onPress={() => setShowTerms(true)}
          style={{ marginTop: spacing.lg }}
        />
        <ActionRow
          label="Privacy Policy"
          description="What CoachFit stores, and what goes to Apple Health"
          icon={<Icon name="privacy" color="primaryTextSoft" />}
          onPress={() => setShowPrivacy(true)}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      <ExerciseCatalogSheet
        visible={showExerciseCatalog}
        initialExerciseId={params.catalog === '1' ? params.exercise : undefined}
        initialHowTo={params.catalog === '1' && params.howto === '1'}
        onClose={() => {
          setShowExerciseCatalog(false);
          setExcludedCount(getExercisePreferences().excludedExerciseIds.length);
        }}
      />
      <HelpSheet
        visible={showHelp}
        onClose={() => setShowHelp(false)}
        onNavigate={openHelpDestination}
        onOpenMetrics={() => {
          setShowHelp(false);
          setShowMetricsGuide(true);
        }}
        onReplayTour={() => {
          setShowHelp(false);
          router.push('/tour');
        }}
      />
      <MetricsGuideSheet visible={showMetricsGuide} onClose={() => setShowMetricsGuide(false)} />
      <TermsSheet visible={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacySheet visible={showPrivacy} onClose={() => setShowPrivacy(false)} />
      <ProfileSheet
        visible={showProfile}
        onClose={() => setShowProfile(false)}
        onSaved={() => {
          setShowProfile(false);
          refreshProfileSummaries();
          // First-time setup via Settings (no equipment yet) — carry straight
          // into equipment instead of leaving the athlete to find it themselves.
          if (!hasEquipmentInventory()) setShowEquipment(true);
        }}
      />
      <GoalsSheet
        visible={showGoals}
        onClose={() => setShowGoals(false)}
        onSaved={() => {
          setShowGoals(false);
          refreshProfileSummaries();
        }}
      />
      <TrainingSettingsSheet
        visible={showTrainingSettings}
        onClose={() => setShowTrainingSettings(false)}
        onSaved={() => {
          setShowTrainingSettings(false);
          refreshProfileSummaries();
        }}
      />
      <EquipmentSheet
        visible={showEquipment}
        profileId={editingProfileId}
        onClose={() => {
          setShowEquipment(false);
          setEditingProfileId(undefined);
          // Editing autosaves as the athlete taps, so closing (even via
          // backdrop/X) still needs to pick up whatever was last persisted.
          refreshEquipmentSummaries();
        }}
        onSaved={() => {
          setShowEquipment(false);
          setEditingProfileId(undefined);
          refreshEquipmentSummaries();
        }}
      />
      <EquipmentProfilesSheet
        visible={showProfiles}
        initialAction={profilesAction}
        onClose={() => {
          setShowProfiles(false);
          setProfilesAction(undefined);
          refreshEquipmentSummaries();
        }}
        onCreateProfile={(profileId) => {
          setShowProfiles(false);
          setProfilesAction(undefined);
          setEditingProfileId(profileId);
          setShowEquipment(true);
        }}
        onActiveChanged={refreshEquipmentSummaries}
      />
    </Screen>
  );
}
