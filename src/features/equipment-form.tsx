/**
 * Equipment form — what the user owns / can access, with a couple of
 * high-value recommendations tied to goals (ADR-0109). Shared body used both
 * by the mandatory first-run flow (`app/equipment.tsx`) and the "Edit
 * equipment" sheet reached from Settings (prefilled from the existing
 * inventory).
 */

import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Chip, GoalHero, Row, SavedPill, Text, TextField, useTheme } from '@/design';
import { getAthleteProfile } from '@/services/athlete';
import { getEquipmentInventory, saveEquipmentInventory } from '@/services/equipment';
import {
  completeFirstRunEquipmentSetup,
  getEquipmentProfile,
  saveEquipmentProfileInventory,
} from '@/services/equipment-profiles';
import { recommendEquipment } from '@/domain/engine';
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
  onSaved: () => void;
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

  const recommendations = useMemo(() => {
    if (!profile) return [];
    return recommendEquipment(profile.goals, { items: [...selected].map((type) => ({ type })) });
  }, [profile, selected]);

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

  function onContinue() {
    // Only reachable when !isEditing, i.e. pure first-run (no profileId, no
    // active profile yet) — creates and activates the first profile.
    completeFirstRunEquipmentSetup(buildInventory());
    onSaved();
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

      {recommendations.length > 0 && (
        <Card tone="primarySoft">
          <Text variant="heading" color="primaryTextSoft">
            Helpful additions
          </Text>
          {recommendations.map((r) => (
            <View key={r.type} style={{ marginTop: spacing.sm }}>
              <Text variant="subtitle" color="primaryTextSoft">
                {r.label}
              </Text>
              <Text variant="body" color="primaryTextSoft">
                {r.reason}
              </Text>
            </View>
          ))}
        </Card>
      )}

      {!isEditing && <Button title="See my first workout" onPress={onContinue} fullWidth />}
    </>
  );
}
