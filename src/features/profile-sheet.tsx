import { SheetModal } from '@/design';
import { OnboardingForm } from '@/features/onboarding-form';

export function ProfileSheet({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <SheetModal visible={visible} onClose={onClose} eyebrow="SETTINGS" title="Profile" closeLabel="Close profile editor">
      {/* Remounts fresh (discarding any in-progress edits) each time the sheet
          reopens, instead of resuming mid-wizard from a stale instance. */}
      {visible ? <OnboardingForm onSaved={onSaved} section={0} /> : null}
    </SheetModal>
  );
}
