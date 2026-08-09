/**
 * Equipment profile switcher (ADR-0135) — create, rename, delete, and switch
 * which equipment profile is active. Opened from Settings alongside the
 * existing "Edit equipment" sheet, which keeps editing the active profile
 * unchanged.
 */

import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, FloatingEditField, Icon, IconButton, PressScale, Row, SheetModal, Text, useTheme } from '@/design';
import {
  createEquipmentProfile,
  deleteEquipmentProfile,
  getActiveEquipmentProfile,
  listEquipmentProfiles,
  renameEquipmentProfile,
  setActiveEquipmentProfile,
} from '@/services/equipment-profiles';
import type { EquipmentProfile } from '@/domain/types';

export function EquipmentProfilesSheet({
  visible,
  onClose,
  onCreateProfile,
  onActiveChanged,
}: {
  visible: boolean;
  onClose: () => void;
  /** A brand-new profile was created; parent should close this sheet and
   * open EquipmentSheet scoped to it so the user picks its equipment. */
  onCreateProfile: (profileId: string) => void;
  /** Active profile (or the set of profiles) changed — parent should refresh
   * any cached "current equipment" summary it shows elsewhere. */
  onActiveChanged: () => void;
}) {
  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      eyebrow="SETTINGS"
      title="Switch profile"
      closeLabel="Close profile switcher"
    >
      {visible ? <ProfilesBody onCreateProfile={onCreateProfile} onActiveChanged={onActiveChanged} /> : null}
    </SheetModal>
  );
}

function ProfilesBody({
  onCreateProfile,
  onActiveChanged,
}: {
  onCreateProfile: (id: string) => void;
  onActiveChanged: () => void;
}) {
  const { spacing } = useTheme();
  const [profiles, setProfiles] = useState<EquipmentProfile[]>(() => listEquipmentProfiles());
  const [activeId, setActiveId] = useState(() => getActiveEquipmentProfile()?.id);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState('');

  function refresh() {
    setProfiles(listEquipmentProfiles());
    setActiveId(getActiveEquipmentProfile()?.id);
  }

  function switchTo(id: string) {
    if (id === activeId) return;
    setActiveEquipmentProfile(id);
    refresh();
    onActiveChanged();
  }

  function startRename(profile: EquipmentProfile) {
    setRenamingId(profile.id);
    setRenameDraft(profile.name);
  }

  function submitRename() {
    if (!renamingId) return;
    const result = renameEquipmentProfile(renamingId, renameDraft);
    // Empty/duplicate: keep the field open so the athlete can just retype —
    // there's no separate error slot yet, consistent with the app's
    // low-friction, no-native-Alert style elsewhere.
    if (!result.ok) return;
    setRenamingId(null);
    refresh();
  }

  function confirmDelete(id: string) {
    const result = deleteEquipmentProfile(id);
    setConfirmingDeleteId(null);
    if (result.ok) refresh();
  }

  function submitCreate() {
    const result = createEquipmentProfile(createDraft);
    if (!result.ok) return; // empty/duplicate — keep the prompt open
    setCreating(false);
    setCreateDraft('');
    refresh();
    onCreateProfile(result.profile.id);
  }

  return (
    <View style={{ gap: spacing.md }}>
      {profiles.map((profile) => {
        const isActive = profile.id === activeId;
        const isLast = profiles.length === 1;
        const confirming = confirmingDeleteId === profile.id;
        return (
          <Card key={profile.id}>
            <Row gap="md" align="center">
              <PressScale
                onPress={() => switchTo(profile.id)}
                haptic="selection"
                accessibilityRole="button"
                accessibilityLabel={isActive ? `${profile.name}, active` : `Switch to ${profile.name}`}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
              >
                <Icon name={isActive ? 'selected' : 'pending'} color={isActive ? 'primary' : 'textFaint'} />
                <View style={{ flex: 1 }}>
                  <Text variant="label" weight="semibold">
                    {profile.name}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {profile.inventory.items.length} item{profile.inventory.items.length === 1 ? '' : 's'}
                    {isActive ? ' · Active' : ''}
                  </Text>
                </View>
              </PressScale>
              {!confirming && (
                <>
                  <Button title="Rename" variant="quiet" size="sm" onPress={() => startRename(profile)} />
                  <IconButton
                    icon={<Icon name="trash" color="danger" />}
                    label={`Delete ${profile.name}`}
                    tone="danger"
                    disabled={isActive || isLast}
                    onPress={() => setConfirmingDeleteId(profile.id)}
                  />
                </>
              )}
            </Row>
            {(isActive || isLast) && !confirming && (
              <Text variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
                {isLast ? 'You need at least one profile.' : 'Switch to another profile before deleting this one.'}
              </Text>
            )}
            {confirming && (
              <Row gap="sm" style={{ marginTop: spacing.sm, justifyContent: 'flex-end' }}>
                <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
                  Delete “{profile.name}”?
                </Text>
                <Button title="Cancel" variant="quiet" size="sm" onPress={() => setConfirmingDeleteId(null)} />
                <Button title="Delete" variant="danger" size="sm" onPress={() => confirmDelete(profile.id)} />
              </Row>
            )}
          </Card>
        );
      })}

      <Button
        title="+ New profile"
        variant="secondary"
        fullWidth
        onPress={() => {
          setCreateDraft('');
          setCreating(true);
        }}
      />

      <FloatingEditField
        visible={renamingId != null}
        label="PROFILE NAME"
        value={renameDraft}
        onChangeText={setRenameDraft}
        onSubmit={submitRename}
      />
      <FloatingEditField
        visible={creating}
        label="NEW PROFILE NAME"
        value={createDraft}
        onChangeText={setCreateDraft}
        onSubmit={submitCreate}
      />
    </View>
  );
}
