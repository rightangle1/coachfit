import { SheetModal } from '@/design';
import { EquipmentForm } from '@/features/equipment-form';
import { getEquipmentProfile } from '@/services/equipment-profiles';

export function EquipmentSheet({
  visible,
  onClose,
  onSaved,
  profileId,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Edit a specific (typically brand-new) profile instead of the active one. */
  profileId?: string;
}) {
  const title = profileId
    ? `Set up ${getEquipmentProfile(profileId)?.name ?? 'profile'}`
    : 'Edit equipment';
  return (
    <SheetModal visible={visible} onClose={onClose} eyebrow="SETTINGS" title={title} closeLabel="Close equipment editor">
      {/* Remounts fresh each open so it re-reads the latest saved inventory
          (see profile-sheet.tsx). Editing autosaves in real time, so there's
          nothing to discard — closing the sheet is never a cancel. */}
      {visible ? <EquipmentForm onSaved={onSaved} profileId={profileId} /> : null}
    </SheetModal>
  );
}
