import { SheetModal } from '@/design';
import { OnboardingForm } from '@/features/onboarding-form';

export function TrainingSettingsSheet({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <SheetModal visible={visible} onClose={onClose} eyebrow="SETTINGS" title="Training Settings" closeLabel="Close training settings editor">
      {/* Remounts fresh (discarding any in-progress edits) each time the sheet
          reopens, instead of resuming mid-wizard from a stale instance. */}
      {visible ? <OnboardingForm onSaved={onSaved} section={2} /> : null}
    </SheetModal>
  );
}
