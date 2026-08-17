/**
 * Equipment form — what the user owns / can access. Shared body used both by
 * the mandatory first-run flow (`app/equipment.tsx`) and the "Equipment
 * settings" sheet reached from Settings (prefilled from the existing
 * inventory).
 */

import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, CheckToggle, Chip, GoalHero, Row, SavedPill, Text, TextField, useTheme } from '@/design';
import { TermsSheet } from '@/features/terms-sheet';
import { TERMS_VERSION } from '@/app-lib/terms';
import { PrivacySheet } from '@/features/privacy-sheet';
import { PRIVACY_VERSION } from '@/app-lib/privacy';
import { markAppTourComplete } from '@/app-lib/app-tour';
import { getAthleteProfile, saveAthleteProfile } from '@/services/athlete';
import { getEquipmentInventory, saveEquipmentInventory } from '@/services/equipment';
import {
  completeFirstRunEquipmentSetup,
  getEquipmentProfile,
  saveEquipmentProfileInventory,
} from '@/services/equipment-profiles';
import type { EquipmentType, WeightedEquipmentType } from '@/domain/types';
import { WEIGHTED_EQUIPMENT_TYPES } from '@/domain/types';
import {
  BAND_LEVELS_BY_TYPE,
  EQUIPMENT_OPTIONS,
  KETTLEBELL_PRESET_WEIGHTS_KG,
  WEIGHTED_EQUIPMENT_LABELS,
  dumbbellPresetWeightsKg,
} from '@/app-lib/options';
import { displayWeightToKg, kgToDisplayWeight } from '@/app-lib/units';
import { primaryGoal } from '@/app-lib/personalization';

export function EquipmentForm({
  onSaved,
  profileId,
}: {
  /** `destination === 'tour'` when the athlete chose the walkthrough;
   * omitted (go straight to Today) otherwise. Only ever called from the
   * pure first-run path — editing from Settings never calls this. */
  onSaved: (destination?: 'tour') => void;
  /** Edit a specific profile's equipment instead of the active one — used
   * when setting up a brand-new profile (ADR-0135). */
  profileId?: string;
}) {
  const { spacing } = useTheme();
  const profile = useMemo(() => getAthleteProfile(), []);
  const existing = useMemo(
    () => (profileId ? getEquipmentProfile(profileId)?.inventory : getEquipmentInventory()),
    [profileId],
  );
  const isEditing = profileId != null || existing != null;
  const weightUnit = profile?.weightUnit ?? 'kg';

  const [justSaved, setJustSaved] = useState(false);
  const [selected, setSelected] = useState<Set<EquipmentType>>(
    new Set(existing ? existing.items.map((i) => i.type) : ['bodyweight']),
  );

  // One checkbox gates both documents — each still gets its own timestamp/
  // version so a future content change to just one of them can prompt
  // re-acceptance on its own. Only ever shown on the mandatory first-run
  // path (see `!isEditing` below) — editing equipment later never re-asks.
  const alreadyAcceptedLegal = profile?.termsAcceptedAt != null && profile?.privacyAcceptedAt != null;
  const [legalAccepted, setLegalAccepted] = useState(alreadyAcceptedLegal);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Owned weights per weighted-equipment type (ADR-0115), canonical kg. Only
  // constrains recommendations when the athlete has actually specified any —
  // otherwise the engine stays unconstrained (existing behavior).
  const [weightsByType, setWeightsByType] = useState<Record<WeightedEquipmentType, Set<number>>>(() => {
    const init = {} as Record<WeightedEquipmentType, Set<number>>;
    for (const type of WEIGHTED_EQUIPMENT_TYPES) {
      const item = existing?.items.find((i) => i.type === type);
      init[type] = new Set(item?.availableWeightsKg ?? []);
    }
    return init;
  });
  const [customInput, setCustomInput] = useState<Record<WeightedEquipmentType, string>>({
    dumbbells: '',
    kettlebell: '',
    resistance_bands_tube: '',
    resistance_bands_loop: '',
  });

  function toggle(type: EquipmentType) {
    if (type === 'bodyweight') return; // everyone has this
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleWeight(type: WeightedEquipmentType, kg: number) {
    setWeightsByType((prev) => {
      const next = new Set(prev[type]);
      if (next.has(kg)) next.delete(kg);
      else next.add(kg);
      return { ...prev, [type]: next };
    });
  }

  function addCustomWeight(type: WeightedEquipmentType) {
    const raw = parseFloat(customInput[type]);
    if (!Number.isFinite(raw) || raw <= 0) return;
    const kg = Math.round(displayWeightToKg(raw, weightUnit) * 100) / 100;
    setWeightsByType((prev) => ({ ...prev, [type]: new Set(prev[type]).add(kg) }));
    setCustomInput((prev) => ({ ...prev, [type]: '' }));
  }

  function buildInventory() {
    return {
      items: [...selected].map((type) => {
        const weights = WEIGHTED_EQUIPMENT_TYPES.includes(type as WeightedEquipmentType)
          ? weightsByType[type as WeightedEquipmentType]
          : undefined;
        return weights?.size
          ? { type, availableWeightsKg: [...weights].sort((a, b) => a - b) }
          : { type };
      }),
    };
  }

  // Editing an existing inventory saves in real time as the athlete taps —
  // there's no "cancel", closing the sheet just closes it. First-run setup
  // still saves once, on the final "See my first workout" tap, since that
  // button also advances the onboarding flow.
  useEffect(() => {
    if (!isEditing) return;
    if (profileId) saveEquipmentProfileInventory(profileId, buildInventory());
    else saveEquipmentInventory(buildInventory());
    // The autosave was previously silent — the athlete had no way to tell
    // whether a tap had stuck (ADR-0130). The pill acknowledges it, then fades.
    // Both edges are timer-driven so the effect never sets state synchronously.
    const show = setTimeout(() => setJustSaved(true), 0);
    const hide = setTimeout(() => setJustSaved(false), 1600);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, weightsByType]);

  // Only reachable when !isEditing, i.e. pure first-run (no profileId, no
  // active profile yet) — creates and activates the first profile, records
  // legal acceptance, and optionally marks the app tour skipped, all in the
  // one atomic save behind whichever of the two final buttons was tapped.
  function finishFirstRun(markTourComplete: boolean) {
    if (!legalAccepted || !profile) return;
    completeFirstRunEquipmentSetup(buildInventory());
    const now = Date.now();
    const withLegal = {
      ...profile,
      termsAcceptedAt: profile.termsAcceptedAt ?? now,
      termsVersion: profile.termsAcceptedAt ? profile.termsVersion : TERMS_VERSION,
      privacyAcceptedAt: profile.privacyAcceptedAt ?? now,
      privacyVersion: profile.privacyAcceptedAt ? profile.privacyVersion : PRIVACY_VERSION,
    };
    saveAthleteProfile(markTourComplete ? markAppTourComplete(withLegal, now) : withLegal);
    onSaved(markTourComplete ? undefined : 'tour');
  }

  return (
    <>
      {!isEditing && profile ? (
        <GoalHero goal={primaryGoal(profile.goals)} eyebrow="ONE LAST STEP · YOUR TRAINING SPACE" compact />
      ) : null}
      <View style={{ gap: spacing.xs }}>
        {!isEditing ? (
          <Text variant="caption" color="textMuted">
            YOUR PLAN · READY TO PERSONALIZE
          </Text>
        ) : null}
        <SavedPill visible={justSaved} />
      </View>

      <Card elevated>
        <Text variant="caption" color="primaryTextSoft" weight="bold">
          AVAILABLE TO YOU · {selected.size} SELECTED
        </Text>
        <Text variant="heading" style={{ marginTop: spacing.xs }}>
          Your equipment
        </Text>
        <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
          Workouts are built using equipment that is available.
        </Text>
        <Row gap="sm" wrap style={{ marginTop: spacing.lg }}>
          {EQUIPMENT_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              selected={selected.has(o.value)}
              onPress={() => toggle(o.value)}
            />
          ))}
        </Row>
      </Card>

      {WEIGHTED_EQUIPMENT_TYPES.filter((type) => selected.has(type)).map((type) => {
        const owned = weightsByType[type];
        // Bands are qualitative (Extra Light…Extra Heavy) — real band sets are
        // sold by resistance level, not a numeric weight, and tube/loop bands
        // have distinct level tables (ADR-0117).
        const bandLevels = BAND_LEVELS_BY_TYPE[type];
        const isBands = bandLevels != null;
        const presets = bandLevels
          ? bandLevels.map((l) => l.kg)
          : type === 'dumbbells'
            ? dumbbellPresetWeightsKg(weightUnit)
            : KETTLEBELL_PRESET_WEIGHTS_KG;
        const chips = [...new Set([...presets, ...owned])].sort((a, b) => a - b);
        const chipLabel = (kg: number) =>
          bandLevels
            ? bandLevels.find((l) => l.kg === kg)?.label ?? `${kg} kg`
            : `${kgToDisplayWeight(kg, weightUnit)} ${weightUnit}`;
        return (
          <Card key={type}>
            <Text variant="heading">
              {isBands ? `Which ${WEIGHTED_EQUIPMENT_LABELS[type]} levels do you have?` : `Which ${WEIGHTED_EQUIPMENT_LABELS[type]} weights do you have?`}
            </Text>
            <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
              We&apos;ll only recommend loads you actually own. Leave everything unselected to let us
              recommend freely.
            </Text>
            <Row gap="sm" wrap style={{ marginTop: spacing.lg }}>
              {chips.map((kg) => (
                <Chip
                  key={kg}
                  label={chipLabel(kg)}
                  selected={owned.has(kg)}
                  onPress={() => toggleWeight(type, kg)}
                />
              ))}
            </Row>
            {!isBands && (
              <Row gap="sm" align="center" style={{ marginTop: spacing.md }}>
                <TextField
                  multiline={false}
                  value={customInput[type]}
                  onChangeText={(text) => setCustomInput((prev) => ({ ...prev, [type]: text }))}
                  placeholder={`Custom weight (${weightUnit})`}
                  keyboardType="decimal-pad"
                  style={{ flex: 1, minHeight: 0, paddingVertical: spacing.sm }}
                />
                <Button title="Add" variant="secondary" size="sm" onPress={() => addCustomWeight(type)} />
              </Row>
            )}
          </Card>
        );
      })}

      {!isEditing && !alreadyAcceptedLegal && (
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

      {!isEditing && (
        <View style={{ gap: spacing.sm }}>
          <Button title="Take the walkthrough" onPress={() => finishFirstRun(false)} disabled={!legalAccepted} fullWidth />
          <Button title="Start training" variant="quiet" onPress={() => finishFirstRun(true)} disabled={!legalAccepted} fullWidth />
        </View>
      )}

      <TermsSheet visible={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacySheet visible={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </>
  );
}
